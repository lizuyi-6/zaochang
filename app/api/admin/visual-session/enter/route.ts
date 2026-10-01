// 视觉验收·入场端:浏览器导航消费一次性票 → 植入正式会话 cookie → 302 进 /lattice/。
// 票由 /api/admin/visual-session 用 admin token 铸出(HMAC 签名,10 分钟 TTL);
// 会话走与人类登录完全相同的 createOAuthSession(provider "email",30 天)。
// agent member 行由 ensureAgentMember 兜底(与 API 通道惰性建行同一份实现)。
import { env } from "cloudflare:workers";
import { createOAuthSession, SESSION_COOKIE } from "../../../../oauth-session";
import { AGENT_DISPLAY_NAME, AGENT_EMAIL, verifyVisualTicket } from "../../../_lib/agent-auth";
import { ensureAgentMember } from "../../../_lib/community";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = (env as unknown as Record<string, string | undefined>).ZAOCHANG_AGENT_TOKEN;
  if (!secret) {
    return Response.json({ error: "visual_session_disabled" }, { status: 503 });
  }
  const ticket = new URL(request.url).searchParams.get("ticket");
  const verdict = await verifyVisualTicket(secret, ticket);
  if (!verdict.ok) {
    return Response.json({ error: "visual_ticket_invalid", reason: verdict.reason }, { status: 403 });
  }

  await ensureAgentMember();
  const user = { email: AGENT_EMAIL, displayName: AGENT_DISPLAY_NAME, fullName: AGENT_DISPLAY_NAME };
  const { token } = await createOAuthSession(user, "email");

  const secure = new URL(request.url).protocol === "https:";
  const cookie = `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax${secure ? "; Secure" : ""}; HttpOnly`;
  // 302 到见界首页(return_to 固定,无开放重定向面;票无效/过期永不发 cookie)。
  return new Response(null, {
    status: 302,
    headers: { "Set-Cookie": cookie, Location: "/lattice/" },
  });
}
