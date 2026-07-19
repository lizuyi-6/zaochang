import { env } from "cloudflare:workers";
import { cookies, headers } from "next/headers";
import { resolvePublicAppOrigin } from "./lib/public-origin";

export type OAuthProvider = "google" | "github";

export type SessionUser = {
  displayName: string;
  email: string;
  fullName: string | null;
};

type ProviderConfig = {
  clientId: string;
  clientSecret: string;
};

export const SESSION_COOKIE = "zaochang_session";
export const OAUTH_STATE_COOKIE = "zaochang_oauth_state";
export const OAUTH_RETURN_COOKIE = "zaochang_oauth_return";
export const OAUTH_INVITE_COOKIE = "zaochang_oauth_invite";

function runtimeEnv() {
  return env as unknown as Record<string, string | undefined>;
}

export function providerConfig(provider: OAuthProvider): ProviderConfig | null {
  if (provider !== "github") return null;
  const values = runtimeEnv();
  const prefix = "GITHUB";
  const clientId = values[`${prefix}_OAUTH_CLIENT_ID`];
  const clientSecret = values[`${prefix}_OAUTH_CLIENT_SECRET`];
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "github";
}

export function oauthProviderStatus() {
  return {
    google: Boolean(providerConfig("google")),
    github: Boolean(providerConfig("github")),
  };
}

export function callbackUrl(request: Request, provider: OAuthProvider) {
  return `${publicAppOrigin(request)}/api/auth/${provider}/callback`;
}

export function publicAppOrigin(request: Request) {
  const values = env as unknown as Record<string, string | undefined>;
  try {
    return resolvePublicAppOrigin(request.url, values.APP_ENV, values.PUBLIC_APP_ORIGIN);
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_public_app_origin";
    throw Object.assign(new Error(code), { code, status: code === "public_app_origin_required" ? 503 : 500 });
  }
}

export function absoluteAppUrl(request: Request, path: string) {
  return new URL(path, `${publicAppOrigin(request)}/`);
}

export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://zaochang.local");
    if (url.origin !== "https://zaochang.local") return "/";
    if (url.pathname.startsWith("/api/auth/") || url.pathname === "/signin") return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return toBase64Url(data);
}

function sqliteTimestamp(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export async function hashToken(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

export async function hashInvitationCode(value: string) {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(normalized)) return null;
  return hashToken(normalized);
}

export async function invitationAvailable(codeHash: string) {
  const row = await database().prepare(
    `SELECT id FROM invitation_codes
     WHERE code_hash = ? AND revoked_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP AND uses_count < max_uses`,
  ).bind(codeHash).first<{ id: string }>();
  return Boolean(row);
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function database() {
  if (!env.DB) throw new Error("Community database is unavailable");
  return env.DB;
}

export async function getOAuthSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION_COOKIE)?.value;
    if (!raw) return null;
    const tokenHash = await hashToken(raw);
    const row = await database().prepare(
      `SELECT m.display_name AS displayName, m.email AS email
       FROM auth_sessions s JOIN members m ON m.email = s.user_email
       WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP`,
    ).bind(tokenHash).first<{ displayName: string; email: string }>();
    if (!row) return null;
    return { displayName: row.displayName, email: row.email, fullName: row.displayName };
  } catch {
    return null;
  }
}

export async function createOAuthSession(user: SessionUser, provider: OAuthProvider) {
  const token = randomToken(32);
  const expiresAt = sqliteTimestamp(new Date(Date.now() + 1000 * 60 * 60 * 24 * 30));
  await database().prepare(
    `INSERT INTO auth_sessions (token_hash, user_email, provider, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).bind(await hashToken(token), user.email, provider, expiresAt).run();
  return { token, expiresAt };
}

export async function ensureOAuthUser(
  user: SessionUser,
  provider: OAuthProvider,
  providerAccountId: string,
  avatarUrl: string | null,
  invitationHash: string | null,
): Promise<SessionUser> {
  const db = database();
  const existing = await db.prepare(
    `SELECT email FROM oauth_accounts WHERE provider = ? AND provider_account_id = ?`,
  ).bind(provider, providerAccountId).first<{ email: string }>();
  if (existing) {
    const stable = { ...user, email: existing.email };
    await db.batch([
      db.prepare(`UPDATE members SET display_name = ? WHERE email = ?`).bind(stable.displayName, stable.email),
      db.prepare(
        `UPDATE oauth_accounts
         SET display_name = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP
         WHERE provider = ? AND provider_account_id = ?`,
      ).bind(stable.displayName, avatarUrl, provider, providerAccountId),
    ]);
    return stable;
  }
  if (!invitationHash) throw new RegistrationInviteError("invitation_required");
  const redemptionId = `invite-redemption:${crypto.randomUUID()}`;

  try {
    await db.batch([
    db.prepare(
      `INSERT INTO members (email, display_name)
       VALUES (?, ?)
       ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name`,
    ).bind(user.email, user.displayName),
    db.prepare(
      `INSERT OR IGNORE INTO wallets (user_email, balance, lifetime_earned, lifetime_spent)
       VALUES (?, 0, 0, 0)`,
    ).bind(user.email),
    db.prepare(
      `INSERT INTO invitation_redemptions
       (id, invitation_id, provider, provider_account_id, user_email)
       SELECT ?, id, ?, ?, ? FROM invitation_codes
       WHERE code_hash = ? AND revoked_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP AND uses_count < max_uses`,
    ).bind(redemptionId, provider, providerAccountId, user.email, invitationHash),
    db.prepare(
      `INSERT INTO oauth_accounts
       (provider, provider_account_id, email, display_name, avatar_url, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    ).bind(provider, providerAccountId, user.email, user.displayName, avatarUrl),
    ]);
  } catch (error) {
    const winner = await db.prepare(
      `SELECT email FROM oauth_accounts WHERE provider = ? AND provider_account_id = ?`,
    ).bind(provider, providerAccountId).first<{ email: string }>();
    if (!winner) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("oauth_registration_invitation_required")
        || message.includes("invitation_not_available")
        || message.includes("invitation_redemptions")) {
        throw new RegistrationInviteError("invitation_invalid");
      }
      throw error;
    }
    const stable = { ...user, email: winner.email };
    await db.prepare(`UPDATE members SET display_name = ? WHERE email = ?`).bind(stable.displayName, stable.email).run();
    return stable;
  }
  return user;
}

export async function setAuthCookies(token: string, returnTo: string, secure: boolean) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  cookieStore.set(OAUTH_STATE_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  cookieStore.set(OAUTH_RETURN_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  cookieStore.set(OAUTH_INVITE_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  return returnTo;
}

export async function setOAuthState(state: string, returnTo: string, secure: boolean, invitationHash: string | null = null) {
  const cookieStore = await cookies();
  const options = { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: 600 };
  cookieStore.set(OAUTH_STATE_COOKIE, state, options);
  cookieStore.set(OAUTH_RETURN_COOKIE, returnTo, options);
  if (invitationHash) cookieStore.set(OAUTH_INVITE_COOKIE, invitationHash, options);
  else cookieStore.set(OAUTH_INVITE_COOKIE, "", { ...options, maxAge: 0 });
}

export async function clearAuthCookie(secure: boolean) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (raw) {
    await database().prepare(`DELETE FROM auth_sessions WHERE token_hash = ?`).bind(await hashToken(raw)).run();
  }
  cookieStore.set(SESSION_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
}

export async function requestSecure(request: Request) {
  const requestHeaders = await headers();
  return new URL(request.url).protocol === "https:" || requestHeaders.get("x-forwarded-proto") === "https";
}

export class RegistrationInviteError extends Error {
  code: "invitation_required" | "invitation_invalid";

  constructor(code: "invitation_required" | "invitation_invalid") {
    super(code);
    this.code = code;
  }
}
