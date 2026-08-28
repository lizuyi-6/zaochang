import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  absoluteAppUrl,
  clearAuthCookie,
  OAUTH_INVITE_COOKIE,
  OAUTH_RETURN_COOKIE,
  OAUTH_STATE_COOKIE,
  requestSecure,
  safeReturnPath,
} from "../../../oauth-session";

export async function GET(request: Request) {
  // logout CSRF 防御:跨站顶级导航(sec-fetch-site: cross-site)一律拒绝。
  // SameSite=Lax 允许跨站 <a> 点击携带 Cookie,若无此检查,攻击者链接可静默登出受害者。
  // 站内点击发送 none/same-origin/same-site,不受影响(与 dev-login 的守卫同一模式)。
  if ((request.headers.get("sec-fetch-site") ?? "").toLowerCase() === "cross-site") {
    return NextResponse.json({ error: "cross_site_logout_blocked" }, { status: 403 });
  }
  const secure = await requestSecure(request);
  await clearAuthCookie(secure);
  const cookieStore = await cookies();
  // 登出同时清掉 OAuth 流程瞬态 cookie(state/return/invite),不留可复用的流程残骸。
  for (const name of [OAUTH_STATE_COOKIE, OAUTH_RETURN_COOKIE, OAUTH_INVITE_COOKIE]) {
    cookieStore.set(name, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  }
  const url = absoluteAppUrl(request, "/");
  url.pathname = safeReturnPath(new URL(request.url).searchParams.get("return_to"));
  return NextResponse.redirect(url);
}
