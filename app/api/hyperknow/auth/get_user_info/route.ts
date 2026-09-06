import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";

export const dynamic = "force-dynamic";

// 用户信息端点(原 routes/auth.js get_user_info 的 1:1 响应形状)。身份统一走
// 造场登录(requireMember,惰性落地 members 行)——原复刻版的注册/明文密码/
// 伪造 token 全部不移植。credits 与原版一致为装饰性固定值(20/20),只驱动
// Header 徽章显示,没有扣减语义。
export async function GET() {
  try {
    const member = await requireMember();
    return Response.json({
      success: true,
      data: {
        user_id: member.email,
        username: member.displayName,
        email: member.email,
        subscription: {
          tier: "FREE",
          remaining_credits: 20,
          max_credits: 20,
        },
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
