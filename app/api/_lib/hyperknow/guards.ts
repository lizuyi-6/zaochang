import { requireMember } from "../access-control";
import { assertSameOrigin } from "../request-origin";
import { enforceRateLimit, rateLimitKey } from "../rate-limit";

// Hyperknow 路由统一写守卫:身份 → 同源(CSRF) → 限流,三段顺序与 route-guards.ts
// 的 guardWrite 一致。独立入口是因为本模块的端点形态特殊(chat/course-generation 是
// SSE 流响应,GET tts/stream 无法做同源断言),需要按端点挑选防线组合而不是硬套
// guardWrite 的形状。身份/限流失败照常抛错(AuthRequiredError/RateLimitError,由
// jsonError 兜底映射);同源失败返回 Response 由调用方直接 return。
export type HyperknowGuardOptions = {
  sameOrigin?: boolean;
  rate: { bucket: string; limit: number; windowSeconds: number };
};

export type HyperknowGuardResult = { member: Awaited<ReturnType<typeof requireMember>> };

export async function guardHyperknow(request: Request, options: HyperknowGuardOptions): Promise<HyperknowGuardResult | Response> {
  const member = await requireMember();
  if (options.sameOrigin) {
    const originError = assertSameOrigin(request);
    if (originError) return originError;
  }
  await enforceRateLimit(await rateLimitKey(options.rate.bucket, member.email), options.rate.limit, options.rate.windowSeconds);
  return { member };
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}
