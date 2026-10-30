// 账户申请审核(管理台「账户申请」分区)。读:requireAdminOrAgent;写:guardWrite adminOrAgent + 同源。
// 机器通道只开放 PATCH(审核动作,见 agent-auth.ts AGENT_ADMIN_CAPABILITIES);
// POST(直接给任意邮箱发邀请)不在能力表内,只有人类管理员会话可用。
import { requireAdminOrAgent } from "../../_lib/access-control";
import { guardWrite } from "../../_lib/route-guards";
import { decideApplication, inviteDirectly, listApplications } from "../../_lib/account-applications";
import { jsonError } from "../../_lib/community";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminOrAgent();
    return await listApplications(new URL(request.url));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const guarded = await guardWrite(request, { member: "adminOrAgent", sameOrigin: true });
    if (guarded instanceof Response) return guarded;
    const input = await request.json().catch(() => ({})) as Record<string, unknown>;
    return await inviteDirectly(request, guarded.member, input);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const guarded = await guardWrite(request, { member: "adminOrAgent", sameOrigin: true });
    if (guarded instanceof Response) return guarded;
    const input = await request.json().catch(() => ({})) as Record<string, unknown>;
    return await decideApplication(request, guarded.member, input);
  } catch (error) {
    return jsonError(error);
  }
}
