import { createExternalPayment, ExternalFruitError } from "../../../_lib/external-fruit";
import { oauthCorsHeaders, oauthJsonError, requireBearer } from "../../../_lib/oauth-provider";
import { enforceRateLimit, RateLimitError, rateLimitKey } from "../../../_lib/rate-limit";
import { publicAppOrigin } from "../../../../oauth-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const identity = await requireBearer(request, ["fruit:pay"]);
    await enforceRateLimit(await rateLimitKey("external-payment", `${identity.clientId}:${identity.userEmail}`), 60, 60 * 60);
    const input = await request.json() as Record<string, unknown>;
    const result = await createExternalPayment(identity, input, request.headers.get("idempotency-key") ?? "", publicAppOrigin(request));
    return Response.json(result, { status: result.replayed ? 200 : result.owned ? 200 : 201, headers: oauthCorsHeaders() });
  } catch (error) {
    if (error instanceof ExternalFruitError) return Response.json({ error: error.code }, { status: error.status, headers: oauthCorsHeaders() });
    if (error instanceof RateLimitError) return Response.json({ error: error.code }, { status: error.status, headers: oauthCorsHeaders() });
    return oauthJsonError(error);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthCorsHeaders() });
}
