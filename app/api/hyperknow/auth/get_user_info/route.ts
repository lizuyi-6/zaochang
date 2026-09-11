import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";
import { currentCredits } from "../../../_lib/hyperknow/credits";

export const dynamic = "force-dynamic";

// 用户信息端点(原 routes/auth.js get_user_info 的 1:1 响应形状)。身份统一走
// 造场登录(requireMember,惰性落地 members 行)——原复刻版的注册/明文密码/
// 伪造 token 全部不移植。credits 为真实独立积分(每日重置,对话 2/课程 10,
// 见 _lib/hyperknow/credits.ts);读取即触发懒重置(跨天整额续满)。
export async function GET() {
  try {
    const member = await requireMember();
    const credits = await currentCredits(member.email);
    return Response.json({
      success: true,
      data: {
        user_id: member.email,
        username: member.displayName,
        email: member.email,
        subscription: {
          tier: credits.tier,
          remaining_credits: credits.remaining,
          max_credits: credits.max,
        },
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
