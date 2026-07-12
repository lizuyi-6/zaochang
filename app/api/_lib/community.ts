import { env } from "cloudflare:workers";
import { getChatGPTUser, type ChatGPTUser } from "../../chatgpt-auth";

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
         VALUES (?, 120, 120, 0)`,
      )
      .bind(user.email),
    db
      .prepare(
        `INSERT OR IGNORE INTO transactions
         (user_email, delta, type, description, reference_id)
         VALUES (?, 120, 'welcome', '新成员起步金', 'welcome')`,
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

export function jsonError(error: unknown) {
  if (error instanceof AuthRequiredError) {
    return Response.json({ error: "auth_required" }, { status: 401 });
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("CHECK constraint failed")) {
    return Response.json({ error: "insufficient_balance" }, { status: 409 });
  }
  if (message.includes("UNIQUE constraint failed")) {
    return Response.json({ error: "already_completed" }, { status: 409 });
  }
  return Response.json({ error: message }, { status: 500 });
}

class AuthRequiredError extends Error {
  constructor() {
    super("Sign in is required");
  }
}
