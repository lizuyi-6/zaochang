import { parseBearerToken } from "./agent-auth.ts";
import { accessError } from "./errors.ts";
import { toBase64Url } from "./crypto-utils.ts";

export const USER_KEY_CAPABILITIES = [
  { method: "POST", pathname: "/api/mcp" },
] as const;

export type UserApiKeyIdentity = {
  email: string;
  displayName: string;
  fullName: string | null;
  authVia: "api_key";
  apiKeyId: string;
  isAdmin: false;
  isFounder: false;
  isAgent: false;
};

type ApiKeyListItem = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  status: "active" | "expired" | "revoked";
};

type ApiKeyInsertRow = Omit<ApiKeyListItem, "status">;

export function userApiKeyIdentity(email: string, displayName: string, apiKeyId: string): UserApiKeyIdentity {
  return {
    email,
    displayName,
    fullName: displayName,
    authVia: "api_key",
    apiKeyId,
    isAdmin: false,
    isFounder: false,
    isAgent: false,
  };
}

export function isUserApiKeyBearer(authHeader: string | null): boolean {
  return parseBearerToken(authHeader)?.startsWith("zc_") ?? false;
}

export function isUserKeyCapabilityAllowed(method: string, pathname: string): boolean {
  return USER_KEY_CAPABILITIES.some((capability) => capability.method === method && capability.pathname === pathname);
}

function invalidApiKey(): Error & { code: string; status: number } {
  return accessError("invalid_api_key", 401);
}

async function database() {
  // Dynamic import avoids a static cycle: community.ts resolves identity through
  // chatgpt-auth.ts, which calls this module only after the request has started.
  return (await import("./community")).database();
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function resolveUserApiKey(token: string): Promise<UserApiKeyIdentity> {
  if (!/^zc_[A-Za-z0-9_-]{43}$/.test(token)) throw invalidApiKey();
  const db = await database();
  const row = await db.prepare(
    `SELECT k.id AS apiKeyId, m.email, m.display_name AS displayName
     FROM api_keys k JOIN members m ON m.email = k.member_email
     WHERE k.token_hash = ? AND k.revoked_at IS NULL AND k.expires_at > CURRENT_TIMESTAMP`,
  ).bind(await sha256Hex(token)).first<{ apiKeyId: string; email: string; displayName: string }>();
  if (!row) throw invalidApiKey();

  await db.prepare(
    `UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP
     WHERE id = ? AND (last_used_at IS NULL OR last_used_at <= datetime('now', '-60 seconds'))`,
  ).bind(row.apiKeyId).run();

  return userApiKeyIdentity(row.email, row.displayName, row.apiKeyId);
}

export async function listUserApiKeys(memberEmail: string): Promise<ApiKeyListItem[]> {
  const db = await database();
  return db.prepare(
    `SELECT id, name, prefix, created_at AS createdAt, expires_at AS expiresAt,
            last_used_at AS lastUsedAt, revoked_at AS revokedAt,
            CASE WHEN revoked_at IS NOT NULL THEN 'revoked'
                 WHEN expires_at <= CURRENT_TIMESTAMP THEN 'expired'
                 ELSE 'active' END AS status
     FROM api_keys WHERE member_email = ? ORDER BY created_at DESC, id DESC`,
  ).bind(memberEmail).all<ApiKeyListItem>().then((result) => result.results ?? []);
}

export async function createUserApiKeyRecord(args: {
  memberEmail: string;
  name: string;
  expiresInDays: 30 | 90 | 365;
}): Promise<{ token: string; key: ApiKeyListItem }> {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const token = `zc_${toBase64Url(random)}`;
  const db = await database();
  const key = await db.prepare(
    `INSERT INTO api_keys (id, member_email, name, prefix, token_hash, expires_at)
     SELECT ?, ?, ?, ?, ?, datetime('now', '+' || ? || ' days')
     WHERE (SELECT COUNT(*) FROM api_keys
            WHERE member_email = ? AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP) < 5
     RETURNING id, name, prefix, created_at AS createdAt, expires_at AS expiresAt,
               last_used_at AS lastUsedAt, revoked_at AS revokedAt`,
  ).bind(
    crypto.randomUUID(),
    args.memberEmail,
    args.name,
    token.slice(0, 11),
    await sha256Hex(token),
    args.expiresInDays,
    args.memberEmail,
  ).first<ApiKeyInsertRow>();
  if (!key) throw accessError("api_key_limit_reached", 409);
  return { token, key: { ...key, status: "active" } };
}

export async function revokeUserApiKey(memberEmail: string, id: string): Promise<boolean> {
  const db = await database();
  const result = await db.prepare(
    `UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP
     WHERE id = ? AND member_email = ? AND revoked_at IS NULL
     RETURNING id`,
  ).bind(id, memberEmail).first<{ id: string }>();
  return Boolean(result);
}
