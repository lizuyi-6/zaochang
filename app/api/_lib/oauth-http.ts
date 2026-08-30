// OAuth 家族 API 的轻量 HTTP 错误出口:CORS JSON 形状与 RateLimitError 映射。
// 存在理由:oauth/token 路由此前仅为 RateLimitError 转换而 import 整个
// external-fruit 支付域(状态机/D1/扫描逻辑),属于跨域耦合。exchangeToken
// 不可能抛 ExternalFruitError(定义在 external-fruit 且不反向依赖 provider),
// 因此 token 路由只需要这里的 rate-limit 分支。
import { oauthCorsHeaders } from "./oauth-provider";
import { RateLimitError } from "./rate-limit";

// 带 OAuth CORS 头的 coded JSON。形状与 external-fruit 的 externalApiErrorResponse
// 共用此出口,避免两处复制 header 组合。
export function oauthCorsJsonError(code: string, status: number): Response {
  return Response.json({ error: code }, { status, headers: oauthCorsHeaders() });
}

export function rateLimitErrorResponse(error: unknown): Response | null {
  if (error instanceof RateLimitError) return oauthCorsJsonError(error.code, error.status);
  return null;
}
