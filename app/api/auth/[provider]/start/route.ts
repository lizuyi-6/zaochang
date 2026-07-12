import { NextResponse } from "next/server";
import {
  callbackUrl,
  isOAuthProvider,
  oauthProviderStatus,
  providerConfig,
  randomToken,
  safeReturnPath,
  setOAuthState,
} from "../../../../oauth-session";

type Params = { params: Promise<{ provider: string }> };

export async function GET(request: Request, { params }: Params) {
  const { provider: rawProvider } = await params;
  if (!isOAuthProvider(rawProvider)) return NextResponse.json({ error: "unsupported_provider" }, { status: 404 });
  const provider = rawProvider;
  const config = providerConfig(provider);
  const returnTo = safeReturnPath(new URL(request.url).searchParams.get("return_to"));
  if (!config) {
    const url = new URL("/signin", request.url);
    url.searchParams.set("error", "not_configured");
    url.searchParams.set("provider", provider);
    return NextResponse.redirect(url);
  }

  const state = `${provider}.${randomToken(24)}`;
  const secure = new URL(request.url).protocol === "https:";
  await setOAuthState(state, returnTo, secure);
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
