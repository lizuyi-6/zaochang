/** /lattice/* 登录门禁:纯 Request/Response 级判定(worker 入口与 Node 单测共用)。 */

/** /lattice SPA 的门禁策略:仅登录用户可见。未登录 → 302 /signin?return_to=原路径 */
export const LATTICE_BASE = "/lattice";

/** 前缀精确匹配:"/lattice" 与 "/lattice/*" 受门禁,"/latticefake" 等不受。 */
export function isLatticePath(pathname: string): boolean {
  return pathname === LATTICE_BASE || pathname.startsWith(`${LATTICE_BASE}/`);
}

/** 从 Cookie 头取指定 cookie 值(名字精确匹配,防 "x_session" 吃掉 "session" 前缀)。 */
export function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      return part.slice(eq + 1).trim() || null;
    }
  }
  return null;
}

/**
 * 未登录门禁响应:302 到站内登录页的 lattice 变体(via=lattice, 仅造场账户登录),
 * return_to 带回原路径(经 safeReturnPath 校验,只回站内路径)。
 * no-store:302 不得进任何缓存,否则门禁对后续用户失效。
 */
export function latticeGateRedirect(requestUrl: string): Response {
  const url = new URL(requestUrl);
  const returnTo = `${url.pathname}${url.search}`;
  const location = new URL("/signin", url.origin);
  location.searchParams.set("return_to", returnTo);
  location.searchParams.set("via", "lattice");
  return new Response(null, {
    status: 302,
    headers: { location: location.toString(), "cache-control": "no-store" },
  });
}
