import { exchangeToken, oauthCorsHeaders, oauthJsonError } from "../../_lib/oauth-provider";
import { enforceRateLimit, RateLimitError, requestActorKey } from "../../_lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await enforceRateLimit(await requestActorKey(request, "oauth-token"), 120, 60 * 60);
    const params = new URLSearchParams(await request.text());
    const payload = await exchangeToken(request, params);
    return Response.json(payload, { headers: { ...oauthCorsHeaders(), pragma: "no-cache" } });
  } catch (error) {
    if (error instanceof RateLimitError) return Response.json({ error: error.code }, { status: error.status, headers: oauthCorsHeaders() });
    return oauthJsonError(error);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthCorsHeaders() });
}
