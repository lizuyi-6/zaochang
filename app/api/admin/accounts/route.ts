// 管理员直接开通账户。读:requireAdminOrAgent;写:guardWrite "admin"(仅人类管理员会话)。
// 开通是唯一绕过邀请码门槛的建号路径,故 POST/PATCH 都不进 agent 能力表,路由层也显式要求 admin。
import { requireAdminOrAgent } from "../../_lib/access-control";
import { guardWrite } from "../../_lib/route-guards";
import { listProvisionedAccounts, provisionAccount, resendProvisionNotice } from "../../_lib/account-provisioning";
import { jsonError } from "../../_lib/community";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminOrAgent();
    return await listProvisionedAccounts();
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const guarded = await guardWrite(request, { member: "admin", sameOrigin: true });
    if (guarded instanceof Response) return guarded;
    const input = await request.json().catch(() => ({})) as Record<string, unknown>;
    return await provisionAccount(request, guarded.member, input);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const guarded = await guardWrite(request, { member: "admin", sameOrigin: true });
    if (guarded instanceof Response) return guarded;
    const input = await request.json().catch(() => ({})) as Record<string, unknown>;
    return await resendProvisionNotice(request, guarded.member, input);
  } catch (error) {
    return jsonError(error);
  }
}
