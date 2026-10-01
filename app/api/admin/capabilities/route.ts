// 管理 API 自描述端点:报告机器通道(admin token)当前能做什么。
// 用途:线上排障/自动化验收的第一跳——先打这里确认 token 生效、权限面符合预期,
// 再决定后续调用。人类 admin 调用同样返回(对人类,写面是完整管理台,不受能力表限制)。
import { requireAdminOrAgent } from "../../_lib/access-control";
import { AGENT_ADMIN_CAPABILITIES, AGENT_WRITE_CAPABILITIES, AGENT_EMAIL } from "../../_lib/agent-auth";
import { jsonError } from "../../_lib/community";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const member = await requireAdminOrAgent();
    return Response.json({
      channel: "admin-api",
      caller: member.email,
      callerIsAgent: member.email === AGENT_EMAIL,
      // 读面:GET 全通(agent 读不受闸门限制,路由层 requireAdminOrAgent 放行)
      reads: [
        "/api/admin/capabilities",
        "/api/admin/moderation",
        "/api/admin/invitations",
        "/api/admin/incubation",
      ],
      // agent 写面:精确列名(worker 入口 fail-closed,未列名 403 agent_scope_forbidden)
      agentWrites: [...AGENT_WRITE_CAPABILITIES, ...AGENT_ADMIN_CAPABILITIES],
      // 人类 admin 写面:完整管理台,不受能力表约束
      note: "human admins are not capability-limited; agent writes must match agentWrites exactly (method+pathname)",
    });
  } catch (error) {
    return jsonError(error);
  }
}
