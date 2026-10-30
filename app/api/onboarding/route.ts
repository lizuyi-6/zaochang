import { completeOnboarding } from "../_lib/member-identity";
import { guardWrite } from "../_lib/route-guards";
import { jsonError } from "../_lib/community";

export const dynamic = "force-dynamic";

// 首次登录引导提交(/welcome)。会员 + 同源 + 每会员限流;校验与写入见 _lib/member-identity.ts。
export async function POST(request: Request) {
  try {
    const guarded = await guardWrite(request, { member: "member", sameOrigin: true, rate: { bucket: "member-identity", limit: 30, windowSeconds: 60 * 60 } });
    if (guarded instanceof Response) return guarded;
    const input = await request.json().catch(() => ({})) as Record<string, unknown>;
    return await completeOnboarding(guarded.member, input);
  } catch (error) {
    return jsonError(error);
  }
}
