// 邮箱验证码域模块:发码(request)与消费(verify)的完整状态机。
// 此前两个路由各带 ~130 行内联安全逻辑;收敛到此,路由只留请求体解析。
// 限流参数、Turnstile、锁定/原子消费/补偿删除语义与响应形状逐字不变。
import { NextResponse } from "next/server";
import { database } from "./community";
import { enforceRateLimit, RateLimitError, rateLimitKey, requestActorKey } from "./rate-limit";
import { verifyTurnstile } from "./turnstile";
import {
  EMAIL_CODE_TTL_MINUTES,
  emailSendConfigured,
  sendEmail,
  verificationEmail,
} from "./email-send";
import {
  constantTimeEquals,
  createOAuthSession,
  ensureEmailUser,
  expiryTimestamp,
  hashInvitationCode,
  hashToken,
  invitationAvailable,
  RegistrationInviteError,
  requestSecure,
  safeReturnPath,
  setAuthCookies,
  turnstileConfig,
} from "../../oauth-session";

const EMAIL_PATTERN = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/;
const CODE_ALPHABET_MODULUS_BIAS_LIMIT = 250;
const MAX_ATTEMPTS = 5;

type PendingCodeRow = {
  id: string;
  codeHash: string;
  invitationHash: string | null;
  attempts: number;
};

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

// 邮箱验证码登录 · 第一步:POST /api/auth/email/request {email, invitation_code?, cf-turnstile-response?}
// 发送六位验证码到任意合法邮箱。安全面:
// - 限流双层:每 cf-connecting-ip 10 次/小时 + 每邮箱地址 3 次/15 分钟(外发邮件有真实成本,
//   且这两层正交:挡脚本扫邮箱、挡对单地址的轰炸);
// - Turnstile:只要配置了 TURNSTILE_SECRET_KEY 就对**每次**请求校验(fail-closed)。
//   与 GitHub start 的"仅带邀请码才校验"不同——那里裸链接只是跳转 GitHub(GitHub 自有
//   机器人防护兜底),这里每次调用都真实外发一封邮件;
// - 验证码:六位数字均匀采样(逐位拒绝采样,无模偏差),库中只存 SHA-256,10 分钟过期,
//   5 次错误尝试锁定,验证成功单次原子消费(见 verifyEmailCode);
// - 邮箱存在性与邀请码状态不泄露:全新地址无邀请码 → invitation_required(注册须知,非机密);
//   已是成员的地址无需邀请码即可收码(登录场景)。
export async function requestEmailCode(request: Request, body: Record<string, unknown>): Promise<Response> {
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

// 邮箱验证码登录 · 第二步:POST /api/auth/email/verify {email, code, return_to?}
// 成功签发与 GitHub 登录完全同权的 zaochang_session 会话(createOAuthSession +
// setAuthCookies 同一管线)。安全面:
// - 只取该邮箱**最新一行**未消费、未过期、未锁定的验证码;
// - 比对 SHA-256(code);错误 → attempts+1,累计 5 次该行永久锁定(code_locked);
// - 消费是原子的:UPDATE ... WHERE consumed_at IS NULL 且检查 meta.changes,
//   并发重复提交只有一次成功(败者回 code_invalid,拿不到会话);
// - 新邮箱注册经 ensureEmailUser 的原子批次,邀请码门槛由 DB 触发器强制
//   (邀请码在发码与验证之间被吊销/用尽 → invitation_invalid,验证码白拿,这是
//   故意的:门槛判定必须发生在消费瞬间,而不是发码瞬间)。
export async function verifyEmailCode(request: Request, body: Record<string, unknown>): Promise<Response> {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!EMAIL_PATTERN.test(email) || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const returnTo = safeReturnPath(typeof body.return_to === "string" ? body.return_to : null);

  try {
    await enforceRateLimit(await requestActorKey(request, "email-verify-ip"), 30, 15 * 60);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": "900" } });
    }
    throw error;
  }

  const db = database();
  const row = await db
    .prepare(
      `SELECT id, code_hash AS codeHash, invitation_hash AS invitationHash, attempts
       FROM email_login_codes
       WHERE email = ? AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(email)
    .first<PendingCodeRow>();

  if (!row) return NextResponse.json({ error: "code_invalid" }, { status: 400 });
  // 锁定前置:attempts 达标后该行彻底作死——正确码也不再放行(否则 5 次失败后
  // 提交正确码仍能登录,锁定语义失效)。这里是快照读,并发正确码竞态的最坏结果
  // 只是多放行一次消费,消费本身原子,攻击者没有正确码则此路径不可达。
  if (row.attempts >= MAX_ATTEMPTS) return NextResponse.json({ error: "code_locked" }, { status: 400 });

  if (constantTimeEquals(await hashToken(code), row.codeHash)) {
    // 原子消费:并发同码提交只有一方 changes>0。
    const consumed = await db
      .prepare(`UPDATE email_login_codes SET consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND consumed_at IS NULL`)
      .bind(row.id)
      .run();
    if (Number(consumed.meta.changes ?? 0) === 0) {
      return NextResponse.json({ error: "code_invalid" }, { status: 400 });
    }
  } else {
    // 错误尝试计数本身就是闸门:条件 UPDATE(attempts < MAX_ATTEMPTS)原子占额,
    // 并发下每个错误猜测恰好消耗一个名额,check-then-act 快照竞态无法超发猜测。
    // (成功消费的码 attempts 多记 1 无影响——该行已终结。)
    const bumped = await db
      .prepare(`UPDATE email_login_codes SET attempts = attempts + 1 WHERE id = ? AND attempts < ?`)
      .bind(row.id, MAX_ATTEMPTS)
      .run();
    if (Number(bumped.meta.changes ?? 0) === 0) {
      return NextResponse.json({ error: "code_locked" }, { status: 400 });
    }
    // 与旧语义对齐:第 5 次错误尝试(attempts 达到上限)即报告 code_locked,
    // 提示该码已作死;前 4 次报 code_invalid。
    const after = await db
      .prepare(`SELECT attempts FROM email_login_codes WHERE id = ?`)
      .bind(row.id)
      .first<{ attempts: number }>();
    return NextResponse.json(
      { error: Number(after?.attempts ?? MAX_ATTEMPTS) >= MAX_ATTEMPTS ? "code_locked" : "code_invalid" },
      { status: 400 },
    );
  }

  let user;
  try {
    user = await ensureEmailUser(email, row.invitationHash);
  } catch (error) {
    if (error instanceof RegistrationInviteError) {
      return NextResponse.json({ error: error.code }, { status: 400 });
    }
    throw error;
  }

  const session = await createOAuthSession(user, "email");
  const destination = await setAuthCookies(session.token, returnTo, await requestSecure(request));
  return NextResponse.json({ status: "ok", return_to: destination });
}

// 过期数据清理注册已抽离到 purge/email-codes.ts(worker cron 不加载本状态机)。
