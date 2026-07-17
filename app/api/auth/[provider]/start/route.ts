import { NextResponse } from "next/server";
import {
  callbackUrl,
  absoluteAppUrl,
  hashInvitationCode,
  invitationAvailable,
  isOAuthProvider,
  oauthProviderStatus,
  providerConfig,
  randomToken,
  requestSecure,
  safeReturnPath,
  setOAuthState,
} from "../../../../oauth-session";

type Params = { params: Promise<{ provider: string }> };

export async function GET(request: Request, { params }: Params) {
  return startOAuth(request, await params, null, new URL(request.url).searchParams.get("return_to"));
}

export async function POST(request: Request, { params }: Params) {
  const form = await request.formData();
  const invitationCode = String(form.get("invitation_code") ?? "").trim().slice(0, 64) || null;
  const returnTo = String(form.get("return_to") ?? "");
  return startOAuth(request, await params, invitationCode, returnTo);
}

async function startOAuth(request: Request, params: { provider: string }, invitationCode: string | null, requestedReturnTo: string | null) {
  const { provider: rawProvider } = params;
  if (!isOAuthProvider(rawProvider)) return NextResponse.json({ error: "unsupported_provider" }, { status: 404 });
  const provider = rawProvider;
  const config = providerConfig(provider);
  const returnTo = safeReturnPath(requestedReturnTo);
  if (!config) {
    const url = absoluteAppUrl(request, "/signin");
    url.searchParams.set("error", "not_configured");
    url.searchParams.set("provider", provider);
    return NextResponse.redirect(url);
  }

  const invitationHash = invitationCode ? await hashInvitationCode(invitationCode) : null;
  if (invitationCode && (!invitationHash || !await invitationAvailable(invitationHash))) {
    const url = absoluteAppUrl(request, "/signin");
    url.searchParams.set("error", "invitation_invalid");
    url.searchParams.set("return_to", returnTo);
    return NextResponse.redirect(url);
  }

  const state = `${provider}.${randomToken(24)}`;
  const secure = await requestSecure(request);
  await setOAuthState(state, returnTo, secure, invitationHash);
  const redirectUri = callbackUrl(request, provider);
  const authorizeUrl = new URL(provider === "google" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("scope", provider === "google" ? "openid email profile" : "read:user user:email");
  if (provider === "google") authorizeUrl.searchParams.set("access_type", "online");
  return NextResponse.redirect(authorizeUrl);
}

export function generateStaticParams() {
  return Object.keys(oauthProviderStatus()).map((provider) => ({ provider }));
}
