import { env } from "cloudflare:workers";
import { cookies, headers } from "next/headers";

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

function runtimeEnv() {
  return env as unknown as Record<string, string | undefined>;
}

export function providerConfig(provider: OAuthProvider): ProviderConfig | null {
  const values = runtimeEnv();
  const prefix = provider === "google" ? "GOOGLE" : "GITHUB";
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
  const url = new URL(request.url);
  return `${url.origin}/api/auth/${provider}/callback`;
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

export async function hashToken(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
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
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  await database().prepare(
    `INSERT INTO auth_sessions (token_hash, user_email, provider, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).bind(await hashToken(token), user.email, provider, expiresAt).run();
  return { token, expiresAt };
}

export async function ensureOAuthUser(user: SessionUser, provider: OAuthProvider, providerAccountId: string, avatarUrl: string | null) {
  const db = database();
  await db.batch([
    db.prepare(
      `INSERT INTO members (email, display_name)
       VALUES (?, ?)
       ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name`,
    ).bind(user.email, user.displayName),
    db.prepare(
      `INSERT OR IGNORE INTO wallets (user_email, balance, lifetime_earned, lifetime_spent)
       VALUES (?, 120, 120, 0)`,
    ).bind(user.email),
    db.prepare(
      `INSERT OR IGNORE INTO transactions (user_email, delta, type, description, reference_id)
       VALUES (?, 120, 'welcome', '新成员起步金', 'welcome')`,
    ).bind(user.email),
    db.prepare(
      `INSERT INTO oauth_accounts
       (provider, provider_account_id, email, display_name, avatar_url, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(provider, provider_account_id) DO UPDATE SET
       email = excluded.email, display_name = excluded.display_name,
       avatar_url = excluded.avatar_url, updated_at = CURRENT_TIMESTAMP`,
    ).bind(provider, providerAccountId, user.email, user.displayName, avatarUrl),
  ]);
}

export async function setAuthCookies(token: string, returnTo: string, secure: boolean) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  cookieStore.set(OAUTH_STATE_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  cookieStore.set(OAUTH_RETURN_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  return returnTo;
}

export async function setOAuthState(state: string, returnTo: string, secure: boolean) {
  const cookieStore = await cookies();
  const options = { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: 600 };
  cookieStore.set(OAUTH_STATE_COOKIE, state, options);
  cookieStore.set(OAUTH_RETURN_COOKIE, returnTo, options);
}

export async function clearAuthCookie(secure: boolean) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
}

export async function requestSecure(request: Request) {
  const requestHeaders = await headers();
  return new URL(request.url).protocol === "https:" || requestHeaders.get("x-forwarded-proto") === "https";
}
