import { database } from "../../../_lib/community";
import { settleDueExternalFruit } from "../../../_lib/external-fruit";
import { settleDueFruit } from "../../../_lib/fruit";
import { oauthCorsHeaders, oauthJsonError, requireBearer } from "../../../_lib/oauth-provider";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await requireBearer(request, ["fruit:balance"]);
    await Promise.all([settleDueFruit(identity.userEmail), settleDueExternalFruit(identity.userEmail)]);
    const wallet = await database().prepare(
      `SELECT balance, pending_balance AS pendingBalance, lifetime_earned AS lifetimeEarned,
              lifetime_spent AS lifetimeSpent, status,
              COALESCE((SELECT SUM(delta) FROM fruit_entries WHERE user_email = wallets.user_email AND bucket = 'available'), 0) AS ledgerBalance,
              COALESCE((SELECT SUM(delta) FROM fruit_entries WHERE user_email = wallets.user_email AND bucket = 'pending'), 0) AS ledgerPendingBalance
       FROM wallets WHERE user_email = ?`,
    ).bind(identity.userEmail).first();
    if (!wallet) return Response.json({ error: "wallet_not_found" }, { status: 404, headers: oauthCorsHeaders() });
    return Response.json({ wallet }, { headers: oauthCorsHeaders() });
  } catch (error) {
    return oauthJsonError(error);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthCorsHeaders() });
}
