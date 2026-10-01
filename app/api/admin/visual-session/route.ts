// 视觉验收·铸票端:持 admin token(或人类 admin)换一张短时入场票。
// 浏览器无法携带 Authorization 头做导航,token 只能通 API —— 票是把机器通道
// 接到浏览器门禁的唯一桥。票无状态(HMAC,10 分钟 TTL),重放不超出 token 权力。
// token 未配置 → 503 fail-closed(此通道整体不存在)。
import { env } from "cloudflare:workers";
import { requireAdminOrAgent } from "../../_lib/access-control";
import { signVisualTicket } from "../../_lib/agent-auth";
import { jsonError } from "../../_lib/community";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminOrAgent();
    const secret = (env as unknown as Record<string, string | undefined>).ZAOCHANG_AGENT_TOKEN;
    if (!secret) {
      return Response.json({ error: "visual_session_disabled" }, { status: 503 });
    }
    const ticket = await signVisualTicket(secret);
    const url = new URL(request.url);
    const enterUrl = `${url.origin}/api/admin/visual-session/enter?ticket=${encodeURIComponent(ticket)}`;
    return Response.json({ url: enterUrl, ttlSeconds: 600, enter: "/lattice/" });
  } catch (error) {
    return jsonError(error);
  }
}
