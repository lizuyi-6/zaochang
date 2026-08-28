import { NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { database, ensureMember, type MemberIdentity } from "../../_lib/community";
import { enforceRateLimit, rateLimitKey } from "../../_lib/rate-limit";
import {
  absoluteAppUrl,
  createOAuthSession,
  requestSecure,
  safeReturnPath,
  setAuthCookies,
} from "../../../oauth-session";
import { localDevLoginEnabled, normalizeDevLoginEmail, type RawDevLoginEnv } from "../../_lib/dev-login-gate";

// 本地开发模拟登录:GET /api/auth/dev-login[?email=…&return_to=/path]
// 用途:本地/CI 不依赖 GitHub OAuth 也能拿到真实会话(浏览器直接访问本 URL 即登录)。
// 门禁见 dev-login-gate.ts:APP_ENV=production 无条件 404;development/test 还需显式
// LOCAL_DEV_LOGIN=1(wrangler dev --var)。开启时走与 GitHub 回调完全相同的
// createOAuthSession/setAuthCookies 管线,签发的会话与真实登录同权——门禁只可能更紧。
// 绕过邀请码是设计内的(本地/测试;生产不可达本路径)。sec-fetch-site: cross-site → 404:
// 挡掉外站 <img>/表单嵌入本路由造成的"登录 CSRF"。
export async function GET(request: Request) {
  if (!localDevLoginEnabled(env as unknown as RawDevLoginEnv)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const query = new URL(request.url).searchParams;
  const email = normalizeDevLoginEmail(query.get("email"));
  if (!email) return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  await enforceRateLimit(await rateLimitKey("dev-login", email), 30, 60 * 60);

  // ensureMember 是 upsert(display_name 会被覆盖):先读回既有显示名,新成员取邮箱 @ 前段。
  const existing = await database()
    .prepare(`SELECT display_name AS displayName FROM members WHERE email = ?`)
    .bind(email)
    .first<{ displayName: string }>();
  const displayName = existing?.displayName ?? email.slice(0, email.indexOf("@"));
  const user: MemberIdentity = {
    email,
    displayName,
    fullName: displayName,
    initial: (displayName.trim()[0] || email[0] || "造").toUpperCase(),
  };
  await ensureMember(user);
  // provider 记 "email"(模拟本地登录,与真实 GitHub 会话区分,不污染 provider 审计数据)。
  const session = await createOAuthSession(user, "email");
  const destination = await setAuthCookies(session.token, safeReturnPath(query.get("return_to")), await requestSecure(request));
  return NextResponse.redirect(absoluteAppUrl(request, destination));
}
