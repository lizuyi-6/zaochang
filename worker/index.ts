/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { resolvePublicAppOrigin } from "../app/lib/public-origin";
import { GITHUB_CONNECTION_CSP } from "../app/lib/security-policy";
import { AGENT_WRITE_CAPABILITIES, isValidAgentToken, parseBearerToken } from "../app/api/_lib/agent-auth";

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

// ---- 匿访页面边缘缓存(性能优化;仅影响展示新鲜度,不触及任何强制不变量)----
// 背景:页面 SSR 是若干串行 D1 往返(D1 主库在 APAC),冷渲染 0.7-4s,站内跳转的
// .rsc 负载尤其明显;vinext 的 .rsc 跳转 token 是构建期稳定值,同一路由的 .rsc URL
// 对所有访客一致,可按 URL 跨访客共享边缘缓存。
// 语义取舍(有意为之):匿名访客看到的公开页面/feed 最多滞后 TTL 秒(stale-while-
// revalidate 下极端为 TTL+STALE_WINDOW 秒)。审查门控、订单/点赞/打赏等强制不变量
// 全部在服务端触发器层执行,与此缓存无关。
// stale-while-revalidate:条目过期后先回旧内容(≤STALE_WINDOW),同时后台重渲刷新。
// 没有它,条目 60s 一到期就得同步回源,低流量站点几乎每次访问都撞冷 miss(各机房
// 各自过期,前后访客落进同一机房同一 60s 窗口的概率很低),命中率趋近 0。stale 窗口
// 封顶是防御:源站持续故障时最多发霉 STALE_WINDOW 秒,不会永远服务旧页。
// cache-control 钳制:CF 区域级 Browser Cache TTL(默认 4h)会在缓存命中路径把
// max-age 改写成 14400(2026-08-28 生产实测),盖掉写入时的 max-age=0——而
// max-age=0 是防止匿名页本地副本在登录后仍被浏览器复用的关键。命中/陈旧响应在出
// worker 前统一钳回设计值;miss 是 worker 自产响应,不受区域设置改写,实测无此问题。
// 边界:仅 GET、无任何 cookie/authorization、路径不在排除表、响应 200 且无
// set-cookie、content-type 为 HTML 或路径以 .rsc 结尾。任何带 cookie 的请求(登录态)
// 一律绕过——登录内容既不入缓存也不从缓存出。请求带 no-cache(标准语义)也绕过,
// 便于线上排查时强制回源。仅 APP_ENV=production 启用:本地 dev 与集成测试 harness
// (APP_ENV=test)不缓存,避免 TTL 内陈旧干扰开发与测试断言;代价是缓存命中路径
// 无自动化测试覆盖,上线后用 curl 二连测 x-zc-anon-cache 头手动验证。
const ANON_PAGE_CACHE_TTL_SECONDS = 60;
const ANON_SERVE_STALE_WINDOW_SECONDS = 300;
const ANON_CACHE_EXCLUDED_PREFIXES = [
  "/api/", "/oauth/", "/admin", "/founder", "/studio", "/wallet", "/notifications",
  "/signin", "/signout", "/callback", "/invite", "/product-apps/", "/_vinext/", "/.well-known/",
];

function anonPageCacheEligible(request: Request, url: URL): boolean {
  if (request.method !== "GET") return false;
  if (request.headers.get("cookie")) return false;
  if (request.headers.get("authorization")) return false;
  if ((request.headers.get("cache-control") ?? "").includes("no-cache")) return false;
  const pathname = url.pathname;
  if (ANON_CACHE_EXCLUDED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) return false;
  return true;
}

// 条目年龄以写入时打的时间戳头计算,不依赖 CF 注入的 Age 头(命中路径 Age 存在,
// 但自记时间戳不依赖运行时行为,且旧条目缺头时按"刚写入"处理,只影响一次判定)。
function anonCacheAgeSeconds(hit: Response): number {
  const cachedAt = Number(hit.headers.get("x-zc-anon-cached-at"));
  if (!Number.isFinite(cachedAt) || cachedAt <= 0) return 0;
  return Math.max(0, Math.floor(Date.now() / 1000) - cachedAt);
}

// 后台重验证的去重:同一 isolate 内同一 URL 只跑一份(跨 isolate 并发只是多付一次
// SSR,无正确性影响)。失败静默:旧条目保留,下一请求继续 stale→重试,超窗回源。
const inflightAnonRevalidations = new Set<string>();

async function revalidateAnonPage(request: Request, env: Env, ctx: ExecutionContext, publicOrigin: string): Promise<void> {
  const url = new URL(request.url);
  if (inflightAnonRevalidations.has(url.href)) return;
  inflightAnonRevalidations.add(url.href);
  try {
    const response = await handler.fetch(request, env, ctx);
    const secured = withSecurityHeaders(request, response, publicOrigin);
    const cacheable = secured.status === 200
      && !secured.headers.get("set-cookie")
      && ((secured.headers.get("content-type") ?? "").startsWith("text/html") || url.pathname.endsWith(".rsc"));
    if (!cacheable) return;
    const body = await secured.arrayBuffer();
    const storedHeaders = new Headers(secured.headers);
    storedHeaders.set("cache-control", `public, max-age=0, s-maxage=${ANON_PAGE_CACHE_TTL_SECONDS}`);
    storedHeaders.set("x-zc-anon-cached-at", String(Math.floor(Date.now() / 1000)));
    await edgeCache.put(new Request(url.href, { method: "GET" }), new Response(body, { status: secured.status, headers: storedHeaders }));
  } catch {
    // 后台重验证失败不外抛:陈旧副本仍可继续服务,直到超出 stale 窗口自然回源。
  } finally {
    inflightAnonRevalidations.delete(url.href);
  }
}

// Cloudflare Workers 专属的 caches.default(TS DOM lib 的 CacheStorage 类型没有它)。
const edgeCache: Cache = (caches as unknown as { default: Cache }).default;

const worker = {
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

    if (url.pathname === "/.well-known/openid-configuration") {
      return withSecurityHeaders(request, Response.json({
        issuer: origin,
        authorization_endpoint: `${origin}/oauth/authorize`,
        token_endpoint: `${origin}/api/oauth/token`,
        userinfo_endpoint: `${origin}/api/oauth/userinfo`,
        jwks_uri: `${origin}/api/oauth/jwks`,
        revocation_endpoint: `${origin}/api/oauth/revoke`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        subject_types_supported: ["pairwise"],
        id_token_signing_alg_values_supported: ["ES256"],
        token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: ["openid", "profile", "email", "fruit:balance", "fruit:pay", "fruit:refund"],
        claims_supported: ["sub", "name", "email", "email_verified"],
      }, { headers: { "cache-control": "public, max-age=300" } }), origin);
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

    // 匿访页面边缘缓存:命中直接返回(响应已含安全头,写入时经过同一管道)。
    const anonCacheKey = env.APP_ENV === "production" && anonPageCacheEligible(request, url)
      ? new Request(url.href, { method: "GET" })
      : null;
    if (anonCacheKey) {
      const hit = await edgeCache.match(anonCacheKey);
      if (hit) {
        const ageSeconds = anonCacheAgeSeconds(hit);
        // 未超出 stale 窗口都可直接回(新或陈旧);超窗按未命中走下方回源。
        if (ageSeconds < ANON_PAGE_CACHE_TTL_SECONDS + ANON_SERVE_STALE_WINDOW_SECONDS) {
          const served = new Response(hit.body, hit);
          // 钳回设计值,抵消区域 Browser Cache TTL 对命中路径的 max-age 改写(见文件头注释)。
          served.headers.set("cache-control", `public, max-age=0, s-maxage=${ANON_PAGE_CACHE_TTL_SECONDS}`);
          if (ageSeconds < ANON_PAGE_CACHE_TTL_SECONDS) {
            served.headers.set("x-zc-anon-cache", "hit");
          } else {
            served.headers.set("x-zc-anon-cache", "stale");
            ctx.waitUntil(revalidateAnonPage(new Request(url.href, { method: "GET", headers: request.headers }), env, ctx, origin));
          }
          return served;
        }
      }
    }

    const response = await handler.fetch(prepared, env, ctx);
    const secured = withSecurityHeaders(request, response, origin);
    if (
      anonCacheKey
      && secured.status === 200
      && !secured.headers.get("set-cookie")
      && ((secured.headers.get("content-type") ?? "").startsWith("text/html") || url.pathname.endsWith(".rsc"))
    ) {
      // 完整缓冲后写缓存(Cache API 不接受未消费完的流);客户端拿到的是同一份
      // 已缓冲副本,响应头语义不变(浏览器侧仍不落本地缓存)。
      const body = await secured.arrayBuffer();
      const storedHeaders = new Headers(secured.headers);
      // max-age=0:浏览器不复用本地副本(防止匿名页在登录后仍被本地缓存命中);
      // s-maxage:边缘共享缓存的生存时间。命中路径出 worker 前有同值钳制。
      storedHeaders.set("cache-control", `public, max-age=0, s-maxage=${ANON_PAGE_CACHE_TTL_SECONDS}`);
      storedHeaders.set("x-zc-anon-cached-at", String(Math.floor(Date.now() / 1000)));
      ctx.waitUntil(edgeCache.put(anonCacheKey, new Response(body, { status: secured.status, headers: storedHeaders })));
      const served = new Response(body, { status: secured.status, headers: new Headers(secured.headers) });
      served.headers.set("x-zc-anon-cache", "miss");
      return served;
    }
    return secured;
  },
};

const MAX_REQUEST_BYTES = 11 * 1024 * 1024;

async function prepareRequestBody(request: Request) {
  if (!request.body || !["POST", "PUT", "PATCH"].includes(request.method)) return request;
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return Response.json({ error: "request_too_large" }, { status: 413 });
  }
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_REQUEST_BYTES) {
    return Response.json({ error: "request_too_large" }, { status: 413 });
  }
  return new Request(request, { body });
}

function withSecurityHeaders(request: Request, response: Response, publicOrigin: string) {
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

export default worker;
