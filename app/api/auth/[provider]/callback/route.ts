import { NextResponse } from "next/server";
import {
  absoluteAppUrl,
  callbackUrl,
  createOAuthSession,
  ensureOAuthUser,
  isOAuthProvider,
  OAUTH_INVITE_COOKIE,
  OAUTH_RETURN_COOKIE,
  OAUTH_STATE_COOKIE,
  providerConfig,
  RegistrationInviteError,
  safeReturnPath,
  setAuthCookies,
  requestSecure,
} from "../../../../oauth-session";
import { cookies } from "next/headers";
import { fetchWithTimeout } from "../../../../lib/fetch-with-timeout";

type Params = { params: Promise<{ provider: string }> };
type OAuthProfile = { providerId: string; email: string; displayName: string; avatarUrl: string | null };

export async function GET(request: Request, { params }: Params) {
  const { provider: rawProvider } = await params;
  if (!isOAuthProvider(rawProvider)) return NextResponse.json({ error: "unsupported_provider" }, { status: 404 });
  const provider = rawProvider;
  const query = new URL(request.url).searchParams;
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  const state = query.get("state");
  const returnTo = safeReturnPath(cookieStore.get(OAUTH_RETURN_COOKIE)?.value);
  if (!state || !expectedState || state !== expectedState || !state.startsWith(`${provider}.`)) return redirectError(request, "invalid_state");
  if (query.get("error")) return redirectError(request, "access_denied");
  const code = query.get("code");
  const config = providerConfig(provider);
  if (!config || !code) return redirectError(request, "not_configured");

  try {
    const profile = provider === "google"
      ? await fetchGoogleProfile(code, config.clientId, config.clientSecret, callbackUrl(request, provider))
      : await fetchGitHubProfile(code, config.clientId, config.clientSecret, callbackUrl(request, provider));
    const user = { displayName: profile.displayName, email: profile.email, fullName: profile.displayName };
    const invitationHash = cookieStore.get(OAUTH_INVITE_COOKIE)?.value ?? null;
    const canonicalUser = await ensureOAuthUser(user, provider, profile.providerId, profile.avatarUrl, invitationHash);
    const session = await createOAuthSession(canonicalUser, provider);
    const destination = await setAuthCookies(session.token, returnTo, await requestSecure(request));
    return NextResponse.redirect(absoluteAppUrl(request, destination));
  } catch (error) {
    if (error instanceof RegistrationInviteError) return redirectError(request, error.code);
    console.error("OAuth callback failed", error);
    return redirectError(request, "provider_error");
  }
}

async function fetchGoogleProfile(code: string, clientId: string, clientSecret: string, redirectUri: string): Promise<OAuthProfile> {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }) });
  if (!tokenResponse.ok) throw new Error("Google token exchange failed");
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) throw new Error("Google access token missing");
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${token.access_token}` } });
  if (!profileResponse.ok) throw new Error("Google profile request failed");
  const profile = await profileResponse.json() as { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
  if (!profile.sub || !profile.email || profile.email_verified === false) throw new Error("Google account has no verified email");
  return { providerId: profile.sub, email: profile.email.toLowerCase(), displayName: profile.name || profile.email, avatarUrl: profile.picture || null };
}

async function fetchGitHubProfile(code: string, clientId: string, clientSecret: string, redirectUri: string): Promise<OAuthProfile> {
  const tokenResponse = await fetchWithTimeout("https://github.com/login/oauth/access_token", { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }) }, 12_000);
  if (!tokenResponse.ok) throw new Error("GitHub token exchange failed");
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) throw new Error("GitHub access token missing");
  const headers = { accept: "application/vnd.github+json", authorization: `Bearer ${token.access_token}`, "user-agent": "zaochang" };
  const profileResponse = await fetchWithTimeout("https://api.github.com/user", { headers }, 8_000);
  if (!profileResponse.ok) throw new Error("GitHub profile request failed");
  const profile = await profileResponse.json() as { id?: number; login?: string; name?: string; email?: string | null; avatar_url?: string };
  const emailResponse = await fetchWithTimeout("https://api.github.com/user/emails", { headers }, 8_000);
  if (!emailResponse.ok) throw new Error("GitHub verified email request failed");
  const emails = await emailResponse.json() as Array<{ email: string; primary?: boolean; verified?: boolean }>;
  const email = emails.find((item) => item.primary && item.verified)?.email || emails.find((item) => item.verified)?.email;
  if (!profile.id || !email) throw new Error("GitHub account has no verified email");
  return { providerId: String(profile.id), email: email.toLowerCase(), displayName: profile.name || profile.login || email, avatarUrl: profile.avatar_url || null };
}

function redirectError(request: Request, error: string) {
  const url = absoluteAppUrl(request, "/signin");
  url.searchParams.set("error", error);
  const response = NextResponse.redirect(url);
  const secure = url.protocol === "https:";
  const options = { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: 0 };
  response.cookies.set(OAUTH_STATE_COOKIE, "", options);
  response.cookies.set(OAUTH_RETURN_COOKIE, "", options);
  response.cookies.set(OAUTH_INVITE_COOKIE, "", options);
  return response;
}
