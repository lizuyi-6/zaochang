// Cloudflare Turnstile server-side token verification.
//
// Fail-closed by construction: a missing token, a network error while reaching
// the siteverify endpoint, a non-success response, or a hostname mismatch all
// resolve to false. Only an explicit success for the expected hostname passes.

const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  token: string | null | undefined,
  secret: string,
  expectedHostname: string,
  remoteip: string | undefined,
): Promise<boolean> {
  if (!token || !secret || !expectedHostname) return false;
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteip) body.set("remoteip", remoteip);
  try {
    const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8_000),
    });
    const result = await response.json().catch(() => null) as null | {
      success?: unknown;
      hostname?: unknown;
    };
    if (!result) return false;
    return result.success === true && result.hostname === expectedHostname;
  } catch {
    // Network/timeout error reaching siteverify — reject rather than allow.
    return false;
  }
}
