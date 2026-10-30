/** 首次登录引导门禁:纯 Request/Response 级判定(worker 入口与 Node 单测共用)。
 *
 * 新注册/管理员开通的会员(members.onboarding_required = 1)在完成 /welcome 之前,
 * 任何「整页导航」都 302 到 /welcome?return_to=原路径。只拦整页导航:API、RSC 软导航、
 * 预取、静态资源一律放行——这是体验门槛不是安全边界,会员身份本身已完整有效。
 */

export const ONBOARDING_PATH = "/welcome";

// 引导期间仍可直达的页面/前缀:引导页本身、登录/登出、申请页、API、框架与静态资源、
// 收件人匿名可读的邮件进度页、OIDC 发现文档。
const EXEMPT_PREFIXES = [
  "/welcome", "/signin", "/signout", "/apply", "/api/", "/_vinext/", "/.well-known/",
  "/assets/", "/product-apps/", "/downloads/", "/mail-templates/", "/email/",
];

/** 整页导航判定:GET + sec-fetch-mode: navigate;旧客户端无该头时按 Accept 含 text/html 判定。 */
export function isDocumentNavigation(request: Request): boolean {
  if (request.method !== "GET") return false;
  const mode = (request.headers.get("sec-fetch-mode") ?? "").toLowerCase();
  if (mode) return mode === "navigate";
  return (request.headers.get("accept") ?? "").toLowerCase().includes("text/html");
}

/** 路径是否受引导门禁:豁免前缀与任何带扩展名的静态文件(/favicon.ico、*.png 等)不受。 */
export function isOnboardingGatedPath(pathname: string): boolean {
  for (const entry of EXEMPT_PREFIXES) {
    // "/welcome" 豁免自身与子路径(不豁免 "/welcomex");"/api/" 豁免 "/api" 与其下全部。
    const base = entry.endsWith("/") ? entry.slice(0, -1) : entry;
    if (pathname === base || pathname.startsWith(`${base}/`)) return false;
  }
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  return !last.includes(".");
}

/** 302 到引导页,return_to 带回原路径(引导页经 safeReturnPath 校验后再跳回)。no-store。 */
export function onboardingRedirect(requestUrl: string): Response {
  const url = new URL(requestUrl);
  const location = new URL(ONBOARDING_PATH, url.origin);
  location.searchParams.set("return_to", `${url.pathname}${url.search}`);
  return new Response(null, {
    status: 302,
    headers: { location: location.toString(), "cache-control": "no-store" },
  });
}
