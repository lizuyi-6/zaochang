import { requireMember } from "../../_lib/access-control";
import { jsonError } from "../../_lib/errors";
import { assertSameOrigin } from "../../_lib/request-origin";
import { enforceRateLimit, rateLimitKey } from "../../_lib/rate-limit";
import { redeemCodeForMember } from "../../_lib/hyperknow/redeem";

export const dynamic = "force-dynamic";

// 兑换码换取见界会员(POST {code}):会员级写端点,与 translate 同三段式
// (requireMember → 同源断言 → 限流)。码是高熵随机串且库存只存哈希,
// 限流 10/小时只是对暴力尝试的纵深防御,不是正确性前提。
export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const input = (await request.json().catch(() => ({}))) as { code?: unknown };
    await enforceRateLimit(await rateLimitKey("hyperknow-redeem", member.email), 10, 60 * 60);
    return await redeemCodeForMember(member, input.code);
  } catch (error) {
    return jsonError(error);
  }
}
