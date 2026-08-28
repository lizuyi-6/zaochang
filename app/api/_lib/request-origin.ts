import { env } from "cloudflare:workers";
import { resolvePublicAppOrigin } from "../../lib/public-origin";

// 改状态端点的同源断言(CSRF 纵深防御)。
// 背景:会话 Cookie 是 SameSite=Lax,已挡住跨站表单/fetch 的绝大多数形态,
// 但该防线完全押在浏览器实现上;资金端点(payments approve)已有同款校验,
// 这里把同一标准补齐到其余写端点。
//
// 规则:
// - sec-fetch-site: cross-site → 403(跨站请求永远不该改状态;与 dev-login/logout 同款守卫)。
// - Origin 与公开源一致 → 放行(浏览器同源 fetch/表单都会带 Origin)。
// - Origin 缺失 → 放行:非浏览器调用(集成测试、curl、agent 服务账户的 POST /api/docs)
//   不带 Origin,拒绝会破坏既有合法调用方;此时的防线是凭据本身(token/session)。
// - Origin 存在但不匹配 → 403。
//
// 返回 Response 时调用方直接 return;返回 null 表示通过。
export function assertSameOrigin(request: Request): Response | null {
  if ((request.headers.get("sec-fetch-site") ?? "").toLowerCase() === "cross-site") {
    return Response.json({ error: "invalid_origin" }, { status: 403 });
  }
  const requestOrigin = request.headers.get("origin");
  if (!requestOrigin) return null;
  // 允许两个基准:配置的公开源,以及请求自身的 host(生产同时挂 apex 与 www,
  // www 页面的同源 fetch Origin 是 https://www.aetherstudio.top,不能被误杀)。
  // CSRF 语义上 Origin 必然等于浏览器所见页面的源 = 请求 Host,二者一致才有效。
  const allowed = new Set([new URL(request.url).origin]);
  try {
    const values = env as unknown as Record<string, string | undefined>;
    allowed.add(resolvePublicAppOrigin(request.url, values.APP_ENV, values.PUBLIC_APP_ORIGIN));
  } catch {
    // 公开源未配置(非生产):URL origin 基准已足够。
  }
  if (!allowed.has(requestOrigin)) {
    return Response.json({ error: "invalid_origin" }, { status: 403 });
  }
  return null;
}
