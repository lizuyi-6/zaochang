import { exchangeToken, oauthCorsHeaders, oauthJsonError } from "../../_lib/oauth-provider";
import { externalApiErrorResponse } from "../../_lib/external-fruit";
import { enforceRateLimit, requestActorKey } from "../../_lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await enforceRateLimit(await requestActorKey(request, "oauth-token"), 120, 60 * 60);
    const params = new URLSearchParams(await request.text());
    const payload = await exchangeToken(request, params);
    return Response.json(payload, { headers: { ...oauthCorsHeaders(), pragma: "no-cache" } });
  } catch (error) {
    const mapped = externalApiErrorResponse(error);
    if (mapped) return mapped;
    return oauthJsonError(error);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthCorsHeaders() });
}
