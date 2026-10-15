import { settleDueExternalFruit } from "../../../_lib/external-fruit";
import { getWalletOverview, settleDueFruit } from "../../../_lib/fruit";
import { enforceRateLimit, rateLimitKey } from "../../../_lib/rate-limit";
import { oauthCorsHeaders, oauthJsonError, requireBearer } from "../../../_lib/oauth-provider";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const identity = await requireBearer(request, ["fruit:balance"]);
    // M4(2026-10 审计):v1 钱包读此前零限流——任意持 fruit:balance 令牌的第三方
    // 应用可高频刷该端点,每次都触发结算读+条件写批次(D1 放大)。360/h 远高于
    // 正常轮询,结算本体另有 isolate 级 60s 节流兜底。
    await enforceRateLimit(await rateLimitKey("fruit-wallet-read", identity.userEmail), 360, 60 * 60);
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
