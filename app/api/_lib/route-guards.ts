// 写端点守卫的组合器:身份 → 同源(CSRF) → 限流,三段顺序与既有路由逐字一致,
// 由调用点按需组合——不给原本没有同源断言的路由"顺手补"防线(那是行为变化,
// 统一防线是单独的产品决策)。身份/限流失败照常抛错(AuthRequiredError /
// RateLimitError,由 jsonError 兜底映射);同源失败返回 Response 由调用方直接 return。
//
// 收录的是"≥两段组合"的调用点;member+rateLimit 两行式(payments/products 等)
// 各有独立限流参数,保持原样即可,不为合并而合并。
import { requireMember, requireDocEditor, requireFounder, requireAdmin, type MemberIdentity } from "./access-control";
import { enforceRateLimit, rateLimitKey } from "./rate-limit";
import { assertSameOrigin } from "./request-origin";

export type WriteGuardRole = "member" | "docEditor" | "founder" | "admin";

export type WriteGuardOptions = {
  member: WriteGuardRole;
  // 仅在原本就有同源断言的调用点启用。
  sameOrigin?: boolean;
  rate?: { bucket: string; limit: number; windowSeconds: number };
};

export type WriteGuardResult = { member: MemberIdentity };

async function resolveMember(role: WriteGuardRole): Promise<MemberIdentity> {
  if (role === "docEditor") return requireDocEditor();
  if (role === "founder") return requireFounder();
  if (role === "admin") return requireAdmin();
  return requireMember();
}

export async function guardWrite(request: Request, options: WriteGuardOptions): Promise<WriteGuardResult | Response> {
  const member = await resolveMember(options.member);
  if (options.sameOrigin) {
    const originError = assertSameOrigin(request);
    if (originError) return originError;
  }
  if (options.rate) {
    await enforceRateLimit(await rateLimitKey(options.rate.bucket, member.email), options.rate.limit, options.rate.windowSeconds);
  }
  return { member };
}
