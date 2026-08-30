import { exchangeToken, oauthCorsHeaders, oauthJsonError } from "../../_lib/oauth-provider";
import { rateLimitErrorResponse } from "../../_lib/oauth-http";
import { enforceRateLimit, requestActorKey } from "../../_lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await enforceRateLimit(await requestActorKey(request, "oauth-token"), 120, 60 * 60);
    const params = new URLSearchParams(await request.text());
    const payload = await exchangeToken(request, params);
    return Response.json(payload, { headers: { ...oauthCorsHeaders(), pragma: "no-cache" } });
  } catch (error) {
    // exchangeToken 只可能抛 OAuthProviderError;RateLimitError 来自上方的限流闸。
    // 此路由不再为错误转换 import 整个 external-fruit 支付域。
    const mapped = rateLimitErrorResponse(error);
    if (mapped) return mapped;
    return oauthJsonError(error);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthCorsHeaders() });
}
