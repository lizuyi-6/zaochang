/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { resolvePublicAppOrigin } from "../app/lib/public-origin";
import { withSecurityHeaders } from "../app/lib/security-policy";
import { oidcDiscoveryDocument } from "../app/api/_lib/oauth-discovery";
import { mcpResourceMetadata, oauthAuthorizationServerMetadata } from "../app/api/_lib/oauth-resource";
import { runPurgeRegistry } from "../app/api/_lib/purge";
import { cleanupOrphanedHyperknowImages } from "../app/api/_lib/purge/hyperknow-images";
import { scheduledPurgePlan } from "./purge-schedule";
import { isAgentWriteAllowed, isValidAgentToken, parseBearerToken } from "../app/api/_lib/agent-auth";
import { isUserApiKeyBearer, isUserKeyCapabilityAllowed } from "../app/api/_lib/user-api-key";
import {
  isHostingWorkerBearer,
  isHostingWorkerCapabilityAllowed,
  isValidHostingWorkerToken,
} from "../app/api/_lib/hosting-worker-auth";
import { prepareRequestBody } from "./request-body";
import { handleWithAnonCache } from "./anon-cache";
import { isLatticePath, cookieValue, latticeGateRedirect } from "./lattice-gate";
import { SESSION_COOKIE, sessionUserFromTokenValue, safeReturnPath } from "../app/oauth-session";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  UPLOADS?: R2Bucket;
  APP_ENV?: string;
  PUBLIC_APP_ORIGIN?: string;
  ZAOCHANG_AGENT_TOKEN?: string;
  HOSTING_DEPLOYER_TOKEN?: string;
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

function noStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  // wrangler.prod.jsonc triggers.crons 触发;本地 dev/测试不会触发,行为零变化。
  async scheduled(controller: { cron?: string }, env: Env): Promise<void> {
    if (!env.DB) return;
    const purgePlan = scheduledPurgePlan(controller.cron);
    // Generated-image cleanup retries every 15 minutes; unrelated retention purges stay
    // on their existing six-hour cadence.
    if (purgePlan.retention) await runPurgeRegistry(env.DB);
    if (!purgePlan.hyperknowImages) return;
    if (env.UPLOADS) {
      await cleanupOrphanedHyperknowImages(env.DB, env.UPLOADS);
    } else {
      console.error("[cron-purge] failed hyperknow-images: UPLOADS binding unavailable");
    }
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // 个人 API key 的 fail-closed scope 闸必须先于公开 origin 配置解析:即使
    // 配置缺失,能力表外请求也稳定拒绝为 403,且不会进入任何应用路由。
    if (isUserApiKeyBearer(request.headers.get("authorization"))
      && !isUserKeyCapabilityAllowed(request.method, url.pathname)) {
      await request.arrayBuffer().catch(() => {});
      const hostingWorkerPath = url.pathname.startsWith("/api/hosting-worker/");
      return noStore(withSecurityHeaders(request, Response.json(
        hostingWorkerPath ? { error: "invalid_hosting_token" } : { error: "user_api_key_scope_forbidden" },
        { status: hostingWorkerPath ? 401 : 403, headers: hostingWorkerPath ? { "cache-control": "no-store" } : undefined },
      ), url.origin));
    }
    // 托管部署器的身份闸同样先于 origin 与路由。无效 zch_ 凭据绝不回落到 Cookie;
    // scope 外请求先排空 body,避免未消费字节留在 keep-alive 连接上。
    if (isHostingWorkerBearer(request.headers.get("authorization"))) {
      const token = parseBearerToken(request.headers.get("authorization"));
      if (!isValidHostingWorkerToken(token, env.HOSTING_DEPLOYER_TOKEN)) {
        await request.arrayBuffer().catch(() => {});
        return noStore(withSecurityHeaders(request, Response.json(
          { error: "invalid_hosting_token" },
          { status: 401, headers: { "cache-control": "no-store" } },
        ), url.origin));
      }
      if (url.search || !isHostingWorkerCapabilityAllowed(request.method, url.pathname)) {
        await request.arrayBuffer().catch(() => {});
        return noStore(withSecurityHeaders(request, Response.json(
          { error: "hosting_worker_scope_forbidden" },
          { status: 403, headers: { "cache-control": "no-store" } },
        ), url.origin));
      }
    }
    // A9(2026-10 审计):生产缺 PUBLIC_APP_ORIGIN 时与 oauth-session 的 503 设计对齐
    // (public_app_origin_required),不再以裸 500 每请求打挂监控——仍 fail-closed。
    let origin: string;
    try {
      origin = resolvePublicAppOrigin(url.href, env.APP_ENV, env.PUBLIC_APP_ORIGIN);
    } catch {
      const unavailable = Response.json({ error: "origin_not_configured" }, { status: 503 });
      return url.pathname.startsWith("/api/hosting-worker/") ? noStore(unavailable) : unavailable;
    }
    // Agent 服务账户 scope 闸:agent 非 GET 请求必须命中能力表,否则 fail-closed 403。
    // 在所有路由之前,单一 chokepoint;token 未配置时整段不生效(零行为变化)。
    if (request.method !== "GET" && env.ZAOCHANG_AGENT_TOKEN) {
      const token = parseBearerToken(request.headers.get("authorization"));
      if (isValidAgentToken(token, env.ZAOCHANG_AGENT_TOKEN)) {
        const allowed = isAgentWriteAllowed(request.method, url.pathname);
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
    if (prepared instanceof Response) {
      const response = url.pathname.startsWith("/api/hosting-worker/") ? noStore(prepared) : prepared;
      return withSecurityHeaders(request, response, origin);
    }

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

    if (url.pathname === "/.well-known/oauth-protected-resource/api/mcp"
      || url.pathname === "/.well-known/oauth-protected-resource") {
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "authorization, content-type",
        "cache-control": "public, max-age=300",
      };
      if (request.method === "OPTIONS") return withSecurityHeaders(request, new Response(null, { status: 204, headers }), origin);
      if (request.method !== "GET") {
        return withSecurityHeaders(request, Response.json({ error: "method_not_allowed" }, { status: 405, headers: { ...headers, allow: "GET, OPTIONS" } }), origin);
      }
      return withSecurityHeaders(request, Response.json(mcpResourceMetadata(origin), { headers }), origin);
    }

    if (url.pathname === "/.well-known/oauth-authorization-server") {
      if (request.method !== "GET") {
        return withSecurityHeaders(request, Response.json({ error: "method_not_allowed" }, { status: 405, headers: { allow: "GET" } }), origin);
      }
      return withSecurityHeaders(request, Response.json(oauthAuthorizationServerMetadata(origin), {
        headers: { "cache-control": "public, max-age=300" },
      }), origin);
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
