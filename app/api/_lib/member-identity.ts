// 会员身份:首次登录引导(/welcome → POST /api/onboarding)与资料页的昵称/用户名修改
// (POST /api/profile/identity)。校验在 member-identity-rules.ts,SQL 在 member-identity-sql.ts;
// 用户名格式/不可改/引导须先有用户名三条不变量另由 0043 触发器在 DB 层兜底。
// 两个入口都只认 Cookie 会话(authVia === "session"):API key / OAuth 令牌不能替本人定身份。
import type { MemberIdentity } from "./access-control";
import { database } from "./community";
import { CLAIM_USERNAME_SQL, COMPLETE_ONBOARDING_SQL, SET_NICKNAME_SQL } from "./member-identity-sql";
import { normalizeNickname, normalizeOptionalProfile, normalizeUsername } from "./member-identity-rules";
import { safeReturnPath } from "../../oauth-session";

function sessionOnly(member: MemberIdentity): Response | null {
  return member.authVia === "session"
    ? null
    : Response.json({ error: "cookie_session_required" }, { status: 403 });
}

// 用户名唯一索引冲突 / 触发器拒绝 → 稳定错误码;其余错误原样上抛给 jsonError。
function identityWriteError(error: unknown): Response | null {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("UNIQUE constraint failed") && message.includes("username")) {
    return Response.json({ error: "username_taken" }, { status: 409 });
  }
  if (message.includes("username_immutable")) return Response.json({ error: "username_already_set" }, { status: 409 });
  if (message.includes("username_invalid")) return Response.json({ error: "invalid_username" }, { status: 400 });
  return null;
}

// POST /api/onboarding {username, nickname, bio?, location?, website?, return_to?}
export async function completeOnboarding(member: MemberIdentity, input: Record<string, unknown>): Promise<Response> {
  const denied = sessionOnly(member);
  if (denied) return denied;
  const username = normalizeUsername(input.username);
  if (!username.ok) return Response.json({ error: username.error }, { status: 400 });
  const nickname = normalizeNickname(input.nickname);
  if (!nickname.ok) return Response.json({ error: nickname.error }, { status: 400 });
  const profile = normalizeOptionalProfile(input);
  if (!profile.ok) return Response.json({ error: profile.error }, { status: 400 });
  const { bio, location, website } = profile.value;

  let changes = 0;
  try {
    const result = await database().prepare(COMPLETE_ONBOARDING_SQL)
      .bind(username.value, nickname.value, bio, bio, location, location, website, website, member.email)
      .run();
    changes = Number(result.meta?.changes ?? 0);
  } catch (error) {
    const mapped = identityWriteError(error);
    if (mapped) return mapped;
    throw error;
  }
  if (changes !== 1) return Response.json({ error: "onboarding_not_required" }, { status: 409 });
  const returnTo = safeReturnPath(typeof input.return_to === "string" ? input.return_to : null);
  return Response.json({ ok: true, username: username.value, nickname: nickname.value, return_to: returnTo });
}

// POST /api/profile/identity {nickname?, username?}
// 昵称随时可改;用户名只能在当前为空时设一次(存量会员认领),之后不可改。
export async function updateIdentity(member: MemberIdentity, input: Record<string, unknown>): Promise<Response> {
  const denied = sessionOnly(member);
  if (denied) return denied;
  const wantsNickname = input.nickname !== undefined;
  const wantsUsername = input.username !== undefined && input.username !== "";
  if (!wantsNickname && !wantsUsername) return Response.json({ error: "invalid_identity" }, { status: 400 });
  const nickname = wantsNickname ? normalizeNickname(input.nickname) : null;
  if (nickname && !nickname.ok) return Response.json({ error: nickname.error }, { status: 400 });
  const username = wantsUsername ? normalizeUsername(input.username) : null;
  if (username && !username.ok) return Response.json({ error: username.error }, { status: 400 });

  const db = database();
  // 先判「已有用户名」再写:否则同一请求里的昵称会先写进去、再回 409,形成半成功。
  if (username?.ok) {
    const current = await db.prepare(`SELECT username FROM members WHERE email = ?`)
      .bind(member.email).first<{ username: string | null }>();
    if (current?.username) return Response.json({ error: "username_already_set" }, { status: 409 });
  }
  const statements = [];
  if (username?.ok) statements.push(db.prepare(CLAIM_USERNAME_SQL).bind(username.value, member.email));
  if (nickname?.ok) statements.push(db.prepare(SET_NICKNAME_SQL).bind(nickname.value, member.email));
  let results;
  try {
    results = await db.batch(statements);
  } catch (error) {
    const mapped = identityWriteError(error);
    if (mapped) return mapped;
    throw error;
  }
  // 认领是条件 UPDATE(username IS NULL):0 行只可能来自上面检查之后的并发认领。
  // D1 batch 里 0 行更新不是错误,同批的昵称修改此时已生效——极窄竞态,如实回 409。
  if (username?.ok && Number(results[0]?.meta?.changes ?? 0) !== 1) {
    return Response.json({ error: "username_already_set" }, { status: 409 });
  }
  const row = await db.prepare(`SELECT username, display_name AS nickname FROM members WHERE email = ?`)
    .bind(member.email).first<{ username: string | null; nickname: string }>();
  return Response.json({ ok: true, username: row?.username ?? null, nickname: row?.nickname ?? null });
}
