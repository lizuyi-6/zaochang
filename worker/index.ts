/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { resolvePublicAppOrigin } from "../app/lib/public-origin";
import { withSecurityHeaders } from "../app/lib/security-policy";
import { oidcDiscoveryDocument } from "../app/api/_lib/oauth-discovery";
import { runPurgeRegistry } from "../app/api/_lib/purge";
import { AGENT_WRITE_CAPABILITIES, isValidAgentToken, parseBearerToken } from "../app/api/_lib/agent-auth";
import { prepareRequestBody } from "./request-body";
import { handleWithAnonCache } from "./anon-cache";
import { isLatticePath, cookieValue, latticeGateRedirect } from "./lattice-gate";
import { SESSION_COOKIE, sessionUserFromTokenValue, safeReturnPath } from "../app/oauth-session";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  APP_ENV?: string;
  PUBLIC_APP_ORIGIN?: string;
  ZAOCHANG_AGENT_TOKEN?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  // wrangler.prod.jsonc triggers.crons 触发;本地 dev/测试不会触发,行为零变化。
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    if (env.DB) await runPurgeRegistry(env.DB);
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = resolvePublicAppOrigin(url.href, env.APP_ENV, env.PUBLIC_APP_ORIGIN);
    // Agent 服务账户 scope 闸:agent 非 GET 请求必须命中能力表,否则 fail-closed 403。
    // 在所有路由之前,单一 chokepoint;token 未配置时整段不生效(零行为变化)。
    if (request.method !== "GET" && env.ZAOCHANG_AGENT_TOKEN) {
      const token = parseBearerToken(request.headers.get("authorization"));
      if (isValidAgentToken(token, env.ZAOCHANG_AGENT_TOKEN)) {
        const allowed = AGENT_WRITE_CAPABILITIES.some(
          (cap) => cap.method === request.method && cap.pathname === url.pathname,
        );
        if (!allowed) {
          // 必须排空请求体再早返回:此分支在 prepareRequestBody 之前返回,路由不会读到 body。
          // 若不排空,未消费的字节会残留在 keep-alive 连接里,污染下一个请求的 HTTP 组帧,
          // workerd 读到错误帧会重启 isolate(客户端看到 503 "worker restarted mid-request")。
          await request.arrayBuffer().catch(() => {});
          return withSecurityHeaders(request, Response.json({ error: "agent_scope_forbidden" }, { status: 403 }), origin);
        }
      }
    }
    const prepared = await prepareRequestBody(request);
    if (prepared instanceof Response) return withSecurityHeaders(request, prepared, origin);

    // 已登录访问登录页 → 直接 302 回到 return_to(经 safeReturnPath 校验)。
    // 主站会话全站通用(/lattice/ 门禁认同一 cookie),不该让已登录用户再登一次。
    // 必须在 Worker 层做:vinext 对登录态请求传给 RSC 页面的 searchParams 为空,
    // 页面层拿不到 return_to(实测)。
    if (url.pathname === "/signin" && request.method === "GET") {
      const member = await sessionUserFromTokenValue(cookieValue(request.headers.get("cookie"), SESSION_COOKIE));
      if (member) {
        const target = safeReturnPath(url.searchParams.get("return_to"));
        return withSecurityHeaders(request, new Response(null, {
          status: 302,
          headers: { location: new URL(target, url.origin).toString(), "cache-control": "no-store" },
        }), origin);
      }
    }

    if (url.pathname === "/.well-known/openid-configuration") {
      return withSecurityHeaders(request, Response.json(
        oidcDiscoveryDocument(origin),
        { headers: { "cache-control": "public, max-age=300" } },
      ), origin);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return withSecurityHeaders(request, await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths), origin);
    }

    // /lattice/* 登录门禁(仅登录用户可见):wrangler assets 的 run_worker_first
    // 把该前缀全部打进 Worker(否则静态层先于 Worker 直接返回,无门禁可做)。
    // 在匿名边缘缓存之前短路——302 响应自带 no-store,已登录放行 ASSETS 取静态资源。
    if (isLatticePath(url.pathname)) {
      const raw = cookieValue(request.headers.get("cookie"), SESSION_COOKIE);
      const user = await sessionUserFromTokenValue(raw);
      if (!user) {
        return withSecurityHeaders(request, latticeGateRedirect(request.url), origin);
      }
      return withSecurityHeaders(request, await env.ASSETS.fetch(request), origin);
    }

    // 匿访页面边缘缓存:命中直接返回(响应已含安全头,写入时经过同一管道)。
    // 不符合缓存条件(非生产/非 GET/带凭据/排除路径)时返回 null → 直通回源。
    const cached = await handleWithAnonCache(request, url, handler, env, ctx, origin, withSecurityHeaders);
    if (cached) return cached;
    return withSecurityHeaders(request, await handler.fetch(prepared, env, ctx), origin);
  },
};

export default worker;
