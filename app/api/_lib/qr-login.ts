// 扫码登录 IO 域:QR 会话行(qr_login_sessions,0029)的签发/确认/消费。
// 两个方向(direction 以 pair_code_hash 是否为空判定,互相不可越界):
// - 正向(手机已登录 → 电脑未登录):start → confirm(手机成员批准)→ poll(桌面
//   消费发会话);
// - 反向(电脑已登录 → 手机未登录):host(桌面成员发起,带 6 位配对码)→
//   pair(手机输码,错 5 次整行作废)→ approve(桌面显式允许)→ claim(手机消费
//   发会话)。
// 安全语义:
// - token 只存 SHA-256(hashToken),本体只出现在 QR 与页面 URL;2 分钟 TTL、
//   一次性,过期行在每次 start/host 时顺手清理;
// - 全部状态迁移都是条件 UPDATE + meta.changes 判定——并发/重放败者得到确定性
//   终态,不存在双登录;
// - 会话与 GitHub/邮箱码/passkey 完全同权:createOAuthSession(provider 'qr') +
//   setAuthCookies 同一管线,主站 SSO//lattice 门禁/OIDC 提供方零改动自动兼容;
// - 匿名可调端(start/poll/pair/claim)按 IP 限流;登录端(host/approve 按
//   成员)限流;反向配对码错 PAIR_ATTEMPTS_LIMIT 次整行删除(枚举面归零)。
import { database } from "./community";
import { RateLimitError, enforceRateLimit, rateLimitKey, requestActorKey } from "./rate-limit";
import {
  QR_PAIR_ATTEMPTS_LIMIT,
  QR_PAIR_CODE_PATTERN,
  QR_LOGIN_TOKEN_PATTERN,
  QR_LOGIN_TTL_SECONDS,
  desktopLabelFromUserAgent,
} from "./qr-login-core";
import {
  createOAuthSession,
  expiryTimestamp,
  getOAuthSessionUser,
  hashToken,
  publicAppOrigin,
  randomToken,
  requestSecure,
  safeReturnPath,
  setAuthCookies,
} from "../../oauth-session";

export type QrLoginStart = {
  url: string;
  token: string;
  expiresIn: number;
  desktopLabel: string;
};

export type QrLoginPoll =
  | { status: "pending"; expiresIn: number }
  | { status: "expired" }
  | { status: "taken" }
  | { status: "ok"; return_to: string; displayName: string };

export type QrLoginConfirm =
  | { status: "ok" }
  | { error: "login_required" | "qr_invalid"; status: 401 | 400 }
  | { error: "qr_expired"; status: 410 };

export type QrLoginHost = {
  url: string;
  token: string;
  pairCode: string;
  expiresIn: number;
};

export type QrLoginPair =
  | { status: "ok" }
  | { error: "qr_invalid" | "pair_code_invalid"; status: 400 }
  | { error: "qr_expired"; status: 410 };

export type QrLoginClaim =
  | { status: "pairing" }
  | { status: "pair_requested" }
  | { status: "expired" }
  | { status: "taken" }
  | { status: "ok"; displayName: string };

export type QrLoginHostState =
  | { status: "expired" }
  | { status: "pending" }
  | { status: "pair_requested" }
  | { status: "ok" };

function isRateLimit(error: unknown): boolean {
  return error instanceof RateLimitError;
}

/** 当前 UTC 时间,与 SQLite CURRENT_TIMESTAMP('YYYY-MM-DD HH:MM:SS')同形态可比。 */
function sqliteNow(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

async function requestIpHash(request: Request): Promise<string> {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  return hashToken(ip);
}

async function validTokenHash(token: unknown): Promise<string | null> {
  if (typeof token !== "string" || !QR_LOGIN_TOKEN_PATTERN.test(token)) return null;
  return hashToken(token);
}

// ————————————————————————— 正向:手机已登录 → 电脑未登录 —————————————————————————

/** 桌面端发起:签发一行 pending 会话,返回 confirm 页 URL(即 QR 内容)。 */
export async function startQrLogin(request: Request, body: { return_to?: unknown }): Promise<QrLoginStart> {
  await enforceRateLimit(await requestActorKey(request, "qr-login-start"), 10, 10 * 60);
  const db = database();
  // 过期行无任何价值(消费窗口已关),每次签发顺手清掉,表恒为活跃规模。
  await db.prepare(`DELETE FROM qr_login_sessions WHERE expires_at <= CURRENT_TIMESTAMP`).run();
  const token = randomToken(32);
  const returnTo = safeReturnPath(typeof body?.return_to === "string" ? body.return_to : null);
  const desktopLabel = desktopLabelFromUserAgent(request.headers.get("user-agent"));
  await db.prepare(
    `INSERT INTO qr_login_sessions (token_hash, desktop_label, return_to, request_ip_hash, status, expires_at)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
  ).bind(
    await hashToken(token),
    desktopLabel,
    returnTo,
    await requestIpHash(request),
    expiryTimestamp(QR_LOGIN_TTL_SECONDS),
  ).run();
  return { token, url: `${publicAppOrigin(request)}/signin/qr/${token}`, expiresIn: QR_LOGIN_TTL_SECONDS, desktopLabel };
}

/** 桌面端轮询:pending 继续等;confirmed 原子消费并签发会话(本响应 Set-Cookie)。 */
export async function pollQrLogin(request: Request, body: { token?: unknown }): Promise<QrLoginPoll> {
  try {
    await enforceRateLimit(await requestActorKey(request, "qr-login-poll"), 300, 60);
  } catch (error) {
    if (isRateLimit(error)) return { status: "pending", expiresIn: 0 };
    throw error;
  }
  const tokenHash = await validTokenHash(body?.token);
  if (!tokenHash) {
    return { status: "expired" };
  }
  const db = database();
  // 正向行 pair_code_hash = ''——反向行由 claim 消费,这里不碰。
  const row = await db.prepare(
    `SELECT status, member_email, return_to, expires_at FROM qr_login_sessions
     WHERE token_hash = ? AND pair_code_hash = ''`,
  ).bind(tokenHash).first<{ status: string; member_email: string | null; return_to: string; expires_at: string }>();
  if (!row) return { status: "expired" };
  if (row.status === "pending" || row.status === "pair_requested") {
    if (row.expires_at <= sqliteNow()) return { status: "expired" };
    return { status: "pending", expiresIn: Math.max(0, Math.floor((Date.parse(`${row.expires_at}Z`) - Date.now()) / 1000)) };
  }
  if (row.status !== "confirmed") return { status: "taken" };
  // confirmed → consumed 原子消费:并发 poll 只有一个胜者,败者与后续重放都是 taken。
  const consumed = await db.prepare(
    `UPDATE qr_login_sessions SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP
     WHERE token_hash = ? AND status = 'confirmed' AND pair_code_hash = ''`,
  ).bind(tokenHash).run();
  if (Number(consumed.meta.changes ?? 0) === 0) return { status: "taken" };
  const member = await db.prepare(
    `SELECT display_name FROM members WHERE email = ?`,
  ).bind(row.member_email ?? "").first<{ display_name: string }>();
  if (!member || !row.member_email) {
    // 防御分支:FK 保证成员存在,直接 D1 删行等极端情形不下发任何会话。
    return { status: "expired" };
  }
  const user = { displayName: member.display_name, email: row.member_email, fullName: member.display_name };
  const session = await createOAuthSession(user, "qr");
  const destination = await setAuthCookies(session.token, safeReturnPath(row.return_to), await requestSecure(request));
  return { status: "ok", return_to: destination, displayName: user.displayName };
}

/** 手机端确认:已登录成员显式批准桌面端登录。pending→confirmed 原子迁移。 */
export async function confirmQrLogin(request: Request, body: { token?: unknown }): Promise<QrLoginConfirm> {
  const user = await getOAuthSessionUser();
  if (!user) return { error: "login_required", status: 401 };
  try {
    await enforceRateLimit(await rateLimitKey("qr-login-confirm", user.email), 10, 10 * 60);
  } catch (error) {
    if (isRateLimit(error)) return { error: "qr_invalid", status: 400 };
    throw error;
  }
  const tokenHash = await validTokenHash(body?.token);
  if (!tokenHash) {
    return { error: "qr_invalid", status: 400 };
  }
  const db = database();
  // 只作用于正向行(pair_code_hash = ''):反向行走 pair/approve。
  const confirmed = await db.prepare(
    `UPDATE qr_login_sessions SET status = 'confirmed', member_email = ?, confirmed_at = CURRENT_TIMESTAMP
     WHERE token_hash = ? AND status = 'pending' AND pair_code_hash = '' AND expires_at > CURRENT_TIMESTAMP`,
  ).bind(user.email, tokenHash).run();
  if (Number(confirmed.meta.changes ?? 0) === 1) return { status: "ok" };
  // 未命中:区分"过期可重扫"与"无效/已被用"(后者不区分细节,不给枚举面)。
  const row = await db.prepare(
    `SELECT status, expires_at, pair_code_hash FROM qr_login_sessions WHERE token_hash = ?`,
  ).bind(tokenHash).first<{ status: string; expires_at: string; pair_code_hash: string }>();
  if (row && row.pair_code_hash === "" && row.status === "pending" && row.expires_at <= sqliteNow()) {
    return { error: "qr_expired", status: 410 };
  }
  return { error: "qr_invalid", status: 400 };
}

// ————————————————————————— 反向:电脑已登录 → 手机未登录 —————————————————————————

/** 反向桌面端发起:必须已登录;生成 6 位配对码(只回显一次,库存哈希)。 */
export async function hostQrLogin(request: Request): Promise<QrLoginHost | { error: "login_required"; status: 401 }> {
  const user = await getOAuthSessionUser();
  if (!user) return { error: "login_required", status: 401 };
  try {
    await enforceRateLimit(await rateLimitKey("qr-host", user.email), 5, 10 * 60);
  } catch (error) {
    if (isRateLimit(error)) return { error: "login_required", status: 401 };
    throw error;
  }
  const db = database();
  await db.prepare(`DELETE FROM qr_login_sessions WHERE expires_at <= CURRENT_TIMESTAMP`).run();
  const token = randomToken(32);
  // 拒绝采样出均匀的 6 位十进制码;只存哈希,明文仅出现在本响应(桌面屏)。
  let code = "";
  do {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    code = String(value[0] % 1_000_000).padStart(6, "0");
  } while (!QR_PAIR_CODE_PATTERN.test(code));
  await db.prepare(
    `INSERT INTO qr_login_sessions (token_hash, desktop_label, return_to, request_ip_hash, status, member_email, pair_code_hash, expires_at)
     VALUES (?, '', '/', ?, 'pending', ?, ?, ?)`,
  ).bind(await hashToken(token), await requestIpHash(request), user.email, await hashToken(code), expiryTimestamp(QR_LOGIN_TTL_SECONDS)).run();
  return { token, url: `${publicAppOrigin(request)}/signin/qr-pair/${token}`, pairCode: code, expiresIn: QR_LOGIN_TTL_SECONDS };
}

/** 反向手机端:输入桌面显示的配对码。pending→pair_requested;错 5 次整行作废。 */
export async function pairQrLogin(request: Request, body: { token?: unknown; code?: unknown }): Promise<QrLoginPair> {
  try {
    await enforceRateLimit(await requestActorKey(request, "qr-login-pair"), 10, 10 * 60);
  } catch (error) {
    if (isRateLimit(error)) return { error: "qr_invalid", status: 400 };
    throw error;
  }
  const tokenHash = await validTokenHash(body?.token);
  const code = typeof body?.code === "string" ? body.code.replace(/\s/g, "") : "";
  if (!tokenHash || !QR_PAIR_CODE_PATTERN.test(code)) {
    return { error: "qr_invalid", status: 400 };
  }
  const db = database();
  const row = await db.prepare(
    `SELECT status, pair_code_hash, pair_attempts, expires_at FROM qr_login_sessions WHERE token_hash = ?`,
  ).bind(tokenHash).first<{ status: string; pair_code_hash: string; pair_attempts: number; expires_at: string }>();
  if (!row || row.pair_code_hash === "") return { error: "qr_invalid", status: 400 };
  if (row.status !== "pending" && row.status !== "pair_requested") return { error: "qr_invalid", status: 400 };
  if (row.expires_at <= sqliteNow()) return { error: "qr_expired", status: 410 };
  // 配对码已是秘密(token 本身也是秘密),pair_requested 后重复输码只为重放 ok。
  if (row.status === "pair_requested") {
    if (await hashToken(code) === row.pair_code_hash) return { status: "ok" };
    return { error: "pair_code_invalid", status: 400 };
  }
  if (row.pair_attempts >= QR_PAIR_ATTEMPTS_LIMIT) {
    await db.prepare(`DELETE FROM qr_login_sessions WHERE token_hash = ?`).bind(tokenHash).run();
    return { error: "qr_invalid", status: 400 };
  }
  if (await hashToken(code) !== row.pair_code_hash) {
    // 乐观计数:并发错码各自 +1,达上限者删行(枚举面归零)。
    const bumped = await db.prepare(
      `UPDATE qr_login_sessions SET pair_attempts = pair_attempts + 1
       WHERE token_hash = ? AND status = 'pending' AND pair_attempts = ?`,
    ).bind(tokenHash, row.pair_attempts).run();
    if (Number(bumped.meta.changes ?? 0) === 1 && row.pair_attempts + 1 >= QR_PAIR_ATTEMPTS_LIMIT) {
      await db.prepare(`DELETE FROM qr_login_sessions WHERE token_hash = ?`).bind(tokenHash).run();
    }
    return { error: "pair_code_invalid", status: 400 };
  }
  const paired = await db.prepare(
    `UPDATE qr_login_sessions SET status = 'pair_requested'
     WHERE token_hash = ? AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP`,
  ).bind(tokenHash).run();
  if (Number(paired.meta.changes ?? 0) !== 1) return { error: "qr_invalid", status: 400 };
  return { status: "ok" };
}

/** 反向手机端轮询:confirmed 原子消费并给手机签发会话(本响应 Set-Cookie)。 */
export async function claimQrLogin(request: Request, body: { token?: unknown }): Promise<QrLoginClaim> {
  try {
    await enforceRateLimit(await requestActorKey(request, "qr-login-claim"), 300, 60);
  } catch (error) {
    if (isRateLimit(error)) return { status: "pairing" };
    throw error;
  }
  const tokenHash = await validTokenHash(body?.token);
  if (!tokenHash) {
    return { status: "expired" };
  }
  const db = database();
  // 反向行 pair_code_hash != ''——正向行由 poll 消费,这里不碰。
  const row = await db.prepare(
    `SELECT status, member_email, expires_at FROM qr_login_sessions
     WHERE token_hash = ? AND pair_code_hash != ''`,
  ).bind(tokenHash).first<{ status: string; member_email: string | null; expires_at: string }>();
  if (!row) return { status: "expired" };
  if (row.status === "pending") {
    if (row.expires_at <= sqliteNow()) return { status: "expired" };
    return { status: "pairing" };
  }
  if (row.status === "pair_requested") {
    if (row.expires_at <= sqliteNow()) return { status: "expired" };
    return { status: "pair_requested" };
  }
  if (row.status !== "confirmed") return { status: "taken" };
  const consumed = await db.prepare(
    `UPDATE qr_login_sessions SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP
     WHERE token_hash = ? AND status = 'confirmed' AND pair_code_hash != ''`,
  ).bind(tokenHash).run();
  if (Number(consumed.meta.changes ?? 0) === 0) return { status: "taken" };
  const member = await db.prepare(
    `SELECT display_name FROM members WHERE email = ?`,
  ).bind(row.member_email ?? "").first<{ display_name: string }>();
  if (!member || !row.member_email) return { status: "expired" };
  const user = { displayName: member.display_name, email: row.member_email, fullName: member.display_name };
  const session = await createOAuthSession(user, "qr");
  await setAuthCookies(session.token, "/", await requestSecure(request));
  return { status: "ok", displayName: user.displayName };
}

/** 反向桌面端状态轮询:仅会话属主可读(他人一律 expired,不泄露存在性)。 */
export async function hostStateQrLogin(request: Request, body: { token?: unknown }): Promise<QrLoginHostState> {
  const user = await getOAuthSessionUser();
  if (!user) return { status: "expired" };
  try {
    await enforceRateLimit(await rateLimitKey("qr-host-state", user.email), 300, 60);
  } catch (error) {
    if (isRateLimit(error)) return { status: "pending" };
    throw error;
  }
  const tokenHash = await validTokenHash(body?.token);
  if (!tokenHash) return { status: "expired" };
  const row = await database().prepare(
    `SELECT status, member_email, expires_at FROM qr_login_sessions
     WHERE token_hash = ? AND pair_code_hash != '' AND member_email = ?`,
  ).bind(tokenHash, user.email).first<{ status: string; member_email: string; expires_at: string }>();
  if (!row || (row.status === "pending" || row.status === "pair_requested") && row.expires_at <= sqliteNow()) {
    return { status: "expired" };
  }
  if (row.status === "consumed") return { status: "ok" };
  return { status: row.status as "pending" | "pair_requested" };
}

/** 反向桌面端显式允许:pair_requested→confirmed;仅属主可操作。 */
export async function approveQrLogin(request: Request, body: { token?: unknown }): Promise<QrLoginConfirm> {
  const user = await getOAuthSessionUser();
  if (!user) return { error: "login_required", status: 401 };
  try {
    await enforceRateLimit(await rateLimitKey("qr-approve", user.email), 30, 10 * 60);
  } catch (error) {
    if (isRateLimit(error)) return { error: "qr_invalid", status: 400 };
    throw error;
  }
  const tokenHash = await validTokenHash(body?.token);
  if (!tokenHash) return { error: "qr_invalid", status: 400 };
  const db = database();
  const approved = await db.prepare(
    `UPDATE qr_login_sessions SET status = 'confirmed', confirmed_at = CURRENT_TIMESTAMP
     WHERE token_hash = ? AND status = 'pair_requested' AND pair_code_hash != '' AND member_email = ? AND expires_at > CURRENT_TIMESTAMP`,
  ).bind(tokenHash, user.email).run();
  if (Number(approved.meta.changes ?? 0) === 1) return { status: "ok" };
  return { error: "qr_invalid", status: 400 };
}

/** 反向桌面端拒绝:删行,手机侧 claim 得到 expired。 */
export async function denyQrLogin(request: Request, body: { token?: unknown }): Promise<QrLoginConfirm> {
  const user = await getOAuthSessionUser();
  if (!user) return { error: "login_required", status: 401 };
  const tokenHash = await validTokenHash(body?.token);
  if (!tokenHash) return { error: "qr_invalid", status: 400 };
  const removed = await database().prepare(
    `DELETE FROM qr_login_sessions WHERE token_hash = ? AND pair_code_hash != '' AND member_email = ? AND status IN ('pending', 'pair_requested')`,
  ).bind(tokenHash, user.email).run();
  if (Number(removed.meta.changes ?? 0) === 1) return { status: "ok" };
  return { error: "qr_invalid", status: 400 };
}
