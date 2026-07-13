import { getExternalPayment, ExternalFruitError } from "../../../../_lib/external-fruit";
import { oauthCorsHeaders, oauthJsonError, requireBearer } from "../../../../_lib/oauth-provider";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext) {
  try {
    const identity = await requireBearer(request, ["fruit:pay"]);
    const { id } = await context.params;
    return Response.json({ payment: await getExternalPayment(identity, id) }, { headers: oauthCorsHeaders() });
  } catch (error) {
    if (error instanceof ExternalFruitError) return Response.json({ error: error.code }, { status: error.status, headers: oauthCorsHeaders() });
    return oauthJsonError(error);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthCorsHeaders() });
}
