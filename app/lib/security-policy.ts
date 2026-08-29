export const GITHUB_CONNECTION_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src https://github.com",
].join("; ");

// 路径 varying 的安全头。CSP 与 X-Frame-Options 按 URL 分支:
//  - /product-apps/*:内置展示应用需被站内 iframe 引用(SAMEORIGIN + frame-ancestors 'self')
//  - /api/auth/github/start:连接页锁死一切可嵌套与跳转(GITHUB_CONNECTION_CSP)
// 升级路径:vinext 支持 nonce 透传后改为 'nonce-xxx' 并删除 'unsafe-inline'。
export function withSecurityHeaders(request: Request, response: Response, publicOrigin: string): Response {
  const url = new URL(request.url);
  const sameOriginEmbed = url.pathname.startsWith("/product-apps/");
  const githubConnection = url.pathname === "/api/auth/github/start";
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", sameOriginEmbed ? "SAMEORIGIN" : "DENY");
  headers.set("referrer-policy", githubConnection ? "no-referrer" : "strict-origin-when-cross-origin");
  headers.set("permissions-policy", githubConnection
    ? "camera=(), microphone=(), geolocation=(), payment=()"
    : "camera=(), microphone=(), geolocation=(self), payment=()");
  headers.set("cross-origin-opener-policy", "same-origin");
  if (new URL(publicOrigin).protocol === "https:") {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
  const signin = url.pathname === "/signin";
  if ((headers.get("content-type") ?? "").startsWith("text/html")) {
    const frameAncestors = sameOriginEmbed ? "'self'" : "'none'";
    const turnstileOrigins = signin ? " https://challenges.cloudflare.com" : "";
    headers.set("content-security-policy", githubConnection
      ? GITHUB_CONNECTION_CSP
      : `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors ${frameAncestors}; form-action 'self'; script-src 'self' 'unsafe-inline'${turnstileOrigins}; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'${turnstileOrigins}; worker-src 'self' blob:`);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
