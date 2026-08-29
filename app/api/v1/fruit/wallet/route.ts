import { settleDueExternalFruit } from "../../../_lib/external-fruit";
import { getWalletOverview, settleDueFruit } from "../../../_lib/fruit";
import { oauthCorsHeaders, oauthJsonError, requireBearer } from "../../../_lib/oauth-provider";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await requireBearer(request, ["fruit:balance"]);
    await Promise.all([settleDueFruit(identity.userEmail), settleDueExternalFruit(identity.userEmail)]);
    const wallet = await getWalletOverview(identity.userEmail);
    if (!wallet) return Response.json({ error: "wallet_not_found" }, { status: 404, headers: oauthCorsHeaders() });
    return Response.json({ wallet }, { headers: oauthCorsHeaders() });
  } catch (error) {
    return oauthJsonError(error);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthCorsHeaders() });
}
