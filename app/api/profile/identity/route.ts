import { updateIdentity } from "../../_lib/member-identity";
import { guardWrite } from "../../_lib/route-guards";
import { jsonError } from "../../_lib/community";

export const dynamic = "force-dynamic";

// 资料页:改昵称 / 存量会员一次性认领用户名。会员 + 同源 + 与引导共用限流桶。
export async function POST(request: Request) {
  try {
    const guarded = await guardWrite(request, { member: "member", sameOrigin: true, rate: { bucket: "member-identity", limit: 30, windowSeconds: 60 * 60 } });
    if (guarded instanceof Response) return guarded;
    const input = await request.json().catch(() => ({})) as Record<string, unknown>;
    return await updateIdentity(guarded.member, input);
  } catch (error) {
    return jsonError(error);
  }
}
