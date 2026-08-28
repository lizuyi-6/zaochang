import { NextResponse } from "next/server";
import {
  callbackUrl,
  absoluteAppUrl,
  hashInvitationCode,
  invitationAvailable,
  isOAuthProvider,
  providerConfig,
  randomToken,
  requestSecure,
  safeReturnPath,
  setOAuthState,
  turnstileConfig,
} from "../../../../oauth-session";
import { GITHUB_CONNECTION_CSP } from "../../../../lib/security-policy";
import { githubConnectionPage } from "./github-connection-page";
import { verifyTurnstile } from "../../../_lib/turnstile";

type Params = { params: Promise<{ provider: string }> };

export async function GET(request: Request, { params }: Params) {
  const search = new URL(request.url).searchParams;
  const invitationCode = String(search.get("invitation_code") ?? "").trim().slice(0, 64) || null;
  const turnstileToken = search.get("cf-turnstile-response");
  return startOAuth(request, await params, invitationCode, search.get("return_to"), turnstileToken);
}

export async function POST(request: Request, { params }: Params) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    // 畸形 multipart / 错误 content-type:与 email 路由对 request.json() 的守卫对齐,400 而非 500。
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const invitationCode = String(form.get("invitation_code") ?? "").trim().slice(0, 64) || null;
  const returnTo = String(form.get("return_to") ?? "");
  const turnstileToken = String(form.get("cf-turnstile-response") ?? "") || null;
  return startOAuth(request, await params, invitationCode, returnTo, turnstileToken);
}

async function startOAuth(request: Request, params: { provider: string }, invitationCode: string | null, requestedReturnTo: string | null, turnstileToken: string | null) {
  const { provider: rawProvider } = params;
  if (!isOAuthProvider(rawProvider)) return NextResponse.json({ error: "unsupported_provider" }, { status: 404 });
  const provider = rawProvider;
  const config = providerConfig(provider);
  const returnTo = safeReturnPath(requestedReturnTo);
  if (!config) {
    const url = absoluteAppUrl(request, "/signin");
    url.searchParams.set("error", "not_configured");
    url.searchParams.set("provider", provider);
    return oauthRedirect(request, url);
  }

  // Bot protection: account creation (invitation redemption) requires a solved
  // Cloudflare Turnstile challenge when TURNSTILE_SECRET_KEY is configured.
  // Fail-closed — a missing/invalid token or any verification error rejects and
  // returns the member to the sign-in page. The plain login link (no invite
  // code) is unaffected: it only redirects to GitHub, which enforces its own
  // bot protections, and account creation stays invitation-gated downstream.
  if (invitationCode) {
    const turnstile = turnstileConfig();
    if (turnstile) {
      const expectedHostname = new URL(request.url).hostname;
      const remoteip = request.headers.get("cf-connecting-ip") ?? undefined;
      const humanVerified = await verifyTurnstile(turnstileToken, turnstile.secret, expectedHostname, remoteip);
      if (!humanVerified) {
        const url = absoluteAppUrl(request, "/signin");
        url.searchParams.set("error", "turnstile_invalid");
        url.searchParams.set("return_to", returnTo);
        return oauthRedirect(request, url);
      }
    }
  }

  const invitationHash = invitationCode ? await hashInvitationCode(invitationCode) : null;
  if (invitationCode && (!invitationHash || !await invitationAvailable(invitationHash))) {
    const url = absoluteAppUrl(request, "/signin");
    url.searchParams.set("error", "invitation_invalid");
    url.searchParams.set("return_to", returnTo);
    return oauthRedirect(request, url);
  }

  const state = `${provider}.${randomToken(24)}`;
  const secure = await requestSecure(request);
  await setOAuthState(state, returnTo, secure, invitationHash);
  const redirectUri = callbackUrl(request, provider);
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("scope", "read:user user:email");
  return new NextResponse(githubConnectionPage(authorizeUrl, returnTo), {
    status: 200,
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-security-policy": GITHUB_CONNECTION_CSP,
      "content-type": "text/html; charset=utf-8",
      "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
    },
  });
}

function oauthRedirect(request: Request, url: URL) {
  // The sign-in form submits with POST. A 307 would replay that POST against
  // GitHub's authorize endpoint; 303 converts the next hop to the required GET.
  return NextResponse.redirect(url, request.method === "POST" ? 303 : 307);
}
