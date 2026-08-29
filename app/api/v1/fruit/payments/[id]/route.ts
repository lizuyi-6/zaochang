import { getExternalPayment, externalApiErrorResponse } from "../../../../_lib/external-fruit";
import { oauthCorsHeaders, oauthJsonError, requireBearer } from "../../../../_lib/oauth-provider";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext) {
  try {
    const identity = await requireBearer(request, ["fruit:pay"]);
    const { id } = await context.params;
    return Response.json({ payment: await getExternalPayment(identity, id) }, { headers: oauthCorsHeaders() });
  } catch (error) {
    const mapped = externalApiErrorResponse(error);
    if (mapped) return mapped;
    return oauthJsonError(error);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthCorsHeaders() });
}
