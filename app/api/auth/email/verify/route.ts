import { NextResponse } from "next/server";
import { database } from "../../../_lib/community";
import { enforceRateLimit, RateLimitError, requestActorKey } from "../../../_lib/rate-limit";
import {
  constantTimeEquals,
  createOAuthSession,
  ensureEmailUser,
  hashToken,
  RegistrationInviteError,
  requestSecure,
  safeReturnPath,
  setAuthCookies,
} from "../../../../oauth-session";

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
const MAX_ATTEMPTS = 5;

type PendingCodeRow = {
  id: string;
  codeHash: string;
  invitationHash: string | null;
  attempts: number;
};

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/.test(email) || !/^\d{6}$/.test(code)) {
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
