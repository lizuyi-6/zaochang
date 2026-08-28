import { env } from "cloudflare:workers";
import { getChatGPTUser, type ChatGPTUser } from "../../chatgpt-auth";
import { AGENT_DISPLAY_NAME, AGENT_EMAIL } from "./agent-auth";

export type MemberIdentity = ChatGPTUser & { initial: string };

export function database() {
  if (!env.DB) throw new Error("Community database is unavailable");
  return env.DB;
}

export async function optionalMember(): Promise<MemberIdentity | null> {
  const user = await getChatGPTUser();
  if (!user) return null;
  return {
    ...user,
    initial: (user.displayName.trim()[0] || user.email[0] || "造").toUpperCase(),
  };
}

export async function requireMember(): Promise<MemberIdentity> {
  const user = await optionalMember();
  if (!user) throw new AuthRequiredError();
  await ensureMember(user);
  return user;
}

export async function ensureMember(user: MemberIdentity) {
  // agent 走专用建行:只建 members 行(member_number=0),不建钱包/收藏。
  // 检查放在 ensureMember 内部,覆盖所有直接调用方(requireMember + /api/community 等)。
  if (user.isAgent) {
    await ensureAgentMember();
    return;
  }
  const db = database();
  await db.batch([
    db
      .prepare(
        `INSERT INTO members (email, display_name)
         VALUES (?, ?)
         ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name`,
      )
      .bind(user.email, user.displayName),
    db
      .prepare(
        `INSERT OR IGNORE INTO wallets
         (user_email, balance, lifetime_earned, lifetime_spent)
         VALUES (?, 0, 0, 0)`,
      )
      .bind(user.email),
    db
      .prepare(
        `INSERT INTO collections (user_email, name, color)
         SELECT ?, '稍后体验', 'coral'
         WHERE NOT EXISTS (SELECT 1 FROM collections WHERE user_email = ?)`,
      )
      .bind(user.email, user.email),
  ]);
}

// 惰性创建 agent 的系统 member 行(作 docs/products 的 author/owner FK 锚点)。
// member_number 显式给 0:赋号 trigger 仅在 IS NULL 时触发 → 跳过,不占会员号序列。
async function ensureAgentMember() {
  await database().prepare(
    `INSERT INTO members (email, display_name, member_number)
     VALUES (?, ?, 0)
     ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name, member_number = 0`,
  ).bind(AGENT_EMAIL, AGENT_DISPLAY_NAME).run();
}

export function jsonError(error: unknown) {
  if (error instanceof AuthRequiredError) {
    return Response.json({ error: "auth_required" }, { status: 401 });
  }

  if (error && typeof error === "object" && "code" in error && "status" in error) {
    const code = String((error as { code: unknown }).code);
    const status = Number((error as { status: unknown }).status);
    return Response.json({ error: code }, { status: Number.isInteger(status) ? status : 500 });
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  // 仅钱包余额 CHECK 映射为 insufficient_balance;任意表的 CHECK 失败都报钱包
  // 错误会让 409 语义失真、掩盖真实故障。
  if (message.includes("CHECK constraint failed")
    && (message.includes("wallet_balance_nonnegative") || message.includes("wallet_pending_nonnegative"))) {
    return Response.json({ error: "insufficient_balance" }, { status: 409 });
  }
  if (message.includes("UNIQUE constraint failed")) {
    return Response.json({ error: "already_completed" }, { status: 409 });
  }
  // 不把 error.message 原文返回客户端：它会泄露 D1 约束名/表结构等内部细节。
  // 已识别的业务错误码在上方白名单；其余统一兜底为 server_error 并记录到服务端日志。
  console.error("[jsonError] unhandled:", message);
  return Response.json({ error: "server_error" }, { status: 500 });
}

class AuthRequiredError extends Error {
  constructor() {
    super("Sign in is required");
  }
}
