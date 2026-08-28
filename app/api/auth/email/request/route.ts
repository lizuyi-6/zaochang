import { NextResponse } from "next/server";
import { database } from "../../../_lib/community";
import { enforceRateLimit, RateLimitError, rateLimitKey, requestActorKey } from "../../../_lib/rate-limit";
import { verifyTurnstile } from "../../../_lib/turnstile";
import {
  EMAIL_CODE_TTL_MINUTES,
  emailSendConfigured,
  sendEmail,
  verificationEmail,
} from "../../../_lib/email-send";
import {
  expiryTimestamp,
  hashInvitationCode,
  hashToken,
  invitationAvailable,
  turnstileConfig,
} from "../../../../oauth-session";

// 邮箱验证码登录 · 第一步:POST /api/auth/email/request {email, invitation_code?, cf-turnstile-response?}
// 发送六位验证码到任意合法邮箱。安全面:
// - 限流双层:每 cf-connecting-ip 10 次/小时 + 每邮箱地址 3 次/15 分钟(外发邮件有真实成本,
//   且这两层正交:挡脚本扫邮箱、挡对单地址的轰炸);
// - Turnstile:只要配置了 TURNSTILE_SECRET_KEY 就对**每次**请求校验(fail-closed)。
//   与 GitHub start 的"仅带邀请码才校验"不同——那里裸链接只是跳转 GitHub(GitHub 自有
//   机器人防护兜底),这里每次调用都真实外发一封邮件;
// - 验证码:六位数字均匀采样(逐位拒绝采样,无模偏差),库中只存 SHA-256,10 分钟过期,
//   5 次错误尝试锁定,验证成功单次原子消费(见 verify 路由);
// - 邮箱存在性与邀请码状态不泄露:全新地址无邀请码 → invitation_required(注册须知,非机密);
//   已是成员的地址无需邀请码即可收码(登录场景)。

const EMAIL_PATTERN = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/;
const CODE_ALPHABET_MODULUS_BIAS_LIMIT = 250;

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254) return null;
  return EMAIL_PATTERN.test(email) ? email : null;
}

// 六位数字,每位用 rejection sampling 消除 % 10 的模偏差(250 是 256 内 10 的最大整倍数)。
function generateSixDigitCode(): string {
  let code = "";
  while (code.length < 6) {
    const bytes = new Uint8Array(1);
    crypto.getRandomValues(bytes);
    if (bytes[0] < CODE_ALPHABET_MODULUS_BIAS_LIMIT) code += String(bytes[0] % 10);
  }
  return code;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!email) return NextResponse.json({ error: "invalid_email" }, { status: 400 });

  // 惰性检查放在一切 DB 交互之前:未配置的部署对任何请求都直接 503,
  // 不写限流表、不发码(与 ai_not_configured 同语义;也让"空库"环境可测)。
  if (!emailSendConfigured()) {
    return NextResponse.json({ error: "email_not_configured" }, { status: 503 });
  }

  const invitationCode = typeof body.invitation_code === "string" && body.invitation_code.trim()
    ? body.invitation_code.trim().slice(0, 64)
    : null;
  const turnstileToken = typeof body["cf-turnstile-response"] === "string" ? body["cf-turnstile-response"] : null;

  // Turnstile 先于人机无关的地址限流:若顺序颠倒,攻击者用垃圾 token 刷请求
  // (受每 IP 10/h 上界)仍会清空受害邮箱 15 分钟的发码额度,定向拒绝服务。
  // 人机验证在前,垃圾请求无法消耗任何真实额度。
  const turnstile = turnstileConfig();
  if (turnstile) {
    const humanVerified = await verifyTurnstile(
      turnstileToken,
      turnstile.secret,
      new URL(request.url).hostname,
      request.headers.get("cf-connecting-ip") ?? undefined,
    );
    if (!humanVerified) return NextResponse.json({ error: "turnstile_invalid" }, { status: 400 });
  }

  try {
    await enforceRateLimit(await requestActorKey(request, "email-code-ip"), 10, 60 * 60);
    await enforceRateLimit(await rateLimitKey("email-code-addr", email), 3, 15 * 60);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: "rate_limited", retry_after: "15m" }, { status: 429, headers: { "retry-after": "900" } });
    }
    throw error;
  }

  const invitationHash = invitationCode ? await hashInvitationCode(invitationCode) : null;
  if (invitationCode && (!invitationHash || !(await invitationAvailable(invitationHash)))) {
    return NextResponse.json({ error: "invitation_invalid" }, { status: 400 });
  }

  const member = await database()
    .prepare(`SELECT email FROM members WHERE email = ?`)
    .bind(email)
    .first<{ email: string }>();
  if (!member && !invitationHash) {
    return NextResponse.json({ error: "invitation_required" }, { status: 400 });
  }

  const code = generateSixDigitCode();
  const id = `email-code:${crypto.randomUUID()}`;
  const requestIpHash = await hashToken(request.headers.get("cf-connecting-ip") || "unknown");
  await database()
    .prepare(
      `INSERT INTO email_login_codes
       (id, email, code_hash, invitation_hash, request_ip_hash, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, email, await hashToken(code), invitationHash, requestIpHash, expiryTimestamp(EMAIL_CODE_TTL_MINUTES * 60))
    .run();

  const mail = { ...verificationEmail(code, EMAIL_CODE_TTL_MINUTES), to: email };
  const sent = await sendEmail(mail);
  if (!sent.ok) {
    // 发送失败则删掉刚写的验证码行:不让"看起来已发码"的行占住该邮箱的额度,
    // 也不给攻击者一个可暴力猜的死行。响应回明确错误码供排障(runbook §6)。
    await database().prepare(`DELETE FROM email_login_codes WHERE id = ?`).bind(id).run();
    const status = sent.code === "email_send_network_error" || sent.code.startsWith("email_send_http_") ? 502 : 503;
    return NextResponse.json({ error: sent.code }, { status });
  }

  // 过期行惰性清理(约 1/64 概率),避免专用 cron/定时器。
  if (crypto.getRandomValues(new Uint8Array(1))[0] < 4) {
    await database()
      .prepare(`DELETE FROM email_login_codes WHERE expires_at < datetime('now', '-1 day') OR consumed_at IS NOT NULL`)
      .run();
  }
  return NextResponse.json({ status: "sent", expires_in: EMAIL_CODE_TTL_MINUTES * 60 });
}
