import { ExternalFruitError, refundExternalPayment } from "../../../../../_lib/external-fruit";
import { oauthCorsHeaders, oauthJsonError, requireBearer } from "../../../../../_lib/oauth-provider";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: RouteContext) {
  try {
    const identity = await requireBearer(request, ["fruit:refund"]);
    const { id } = await context.params;
    const result = await refundExternalPayment(identity, id, request.headers.get("idempotency-key") ?? "");
    return Response.json(result, { headers: oauthCorsHeaders() });
  } catch (error) {
    if (error instanceof ExternalFruitError) return Response.json({ error: error.code }, { status: error.status, headers: oauthCorsHeaders() });
    return oauthJsonError(error);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthCorsHeaders() });
}
