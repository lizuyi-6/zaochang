// 匿访页面边缘缓存(性能优化;仅影响展示新鲜度,不触及任何强制不变量)。
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

export const ANON_PAGE_CACHE_TTL_SECONDS = 60;
export const ANON_SERVE_STALE_WINDOW_SECONDS = 300;
// 存储条目的边缘保留期 = TTL + stale 窗口:caches.default 按 s-maxage 到期即驱逐
// (match 直接返回空,生产实测 60s 后拿不到条目,stale 无从谈起),所以必须让条目
// 在边缘活过 TTL;新/陈旧由 x-zc-anon-cached-at 时间戳判定,超窗按未命中回源。
const ANON_STORED_CACHE_CONTROL = `public, max-age=0, s-maxage=${ANON_PAGE_CACHE_TTL_SECONDS + ANON_SERVE_STALE_WINDOW_SECONDS}`;
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

type MinimalEnv = { APP_ENV?: string };
type MinimalCtx = { waitUntil(promise: Promise<unknown>): void };
// 与 vinext app-router-entry 的调用签名保持一致(request, env, ctx 三参透传)。
type RouteHandler = { fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> };

async function revalidateAnonPage(
  request: Request,
  handler: RouteHandler,
  env: MinimalEnv,
  ctx: MinimalCtx,
  publicOrigin: string,
  withHeaders: (request: Request, response: Response, origin: string) => Response,
): Promise<void> {
  const url = new URL(request.url);
  if (inflightAnonRevalidations.has(url.href)) return;
  inflightAnonRevalidations.add(url.href);
  try {
    const response = await handler.fetch(request, env, ctx);
    const secured = withHeaders(request, response, publicOrigin);
    const cacheable = secured.status === 200
      && !secured.headers.get("set-cookie")
      && ((secured.headers.get("content-type") ?? "").startsWith("text/html") || url.pathname.endsWith(".rsc"));
    if (!cacheable) return;
    const body = await secured.arrayBuffer();
    const storedHeaders = new Headers(secured.headers);
    storedHeaders.set("cache-control", ANON_STORED_CACHE_CONTROL);
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

// 匿名页缓存管道:不符合条件返回 null(调用方走直通回源);命中直接回(新/陈旧),
// 未命中回源并在可缓存时后台写入。handler 为 vinext 的 app-router-entry,
// withHeaders 注入 worker 的安全头封装(避免 worker↔本模块循环依赖)。
export async function handleWithAnonCache(
  request: Request,
  url: URL,
  handler: RouteHandler,
  env: MinimalEnv,
  ctx: MinimalCtx,
  publicOrigin: string,
  withHeaders: (request: Request, response: Response, origin: string) => Response,
): Promise<Response | null> {
  const anonCacheKey = env.APP_ENV === "production" && anonPageCacheEligible(request, url)
    ? new Request(url.href, { method: "GET" })
    : null;
  if (!anonCacheKey) return null;

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
        ctx.waitUntil(revalidateAnonPage(new Request(url.href, { method: "GET", headers: request.headers }), handler, env, ctx, publicOrigin, withHeaders));
      }
      return served;
    }
  }

  const response = await handler.fetch(request, env, ctx);
  const secured = withHeaders(request, response, publicOrigin);
  if (
    secured.status === 200
    && !secured.headers.get("set-cookie")
    && ((secured.headers.get("content-type") ?? "").startsWith("text/html") || url.pathname.endsWith(".rsc"))
  ) {
    // 完整缓冲后写缓存(Cache API 不接受未消费完的流);客户端拿到的是同一份
    // 已缓冲副本,响应头语义不变(浏览器侧仍不落本地缓存)。
    const body = await secured.arrayBuffer();
    const storedHeaders = new Headers(secured.headers);
    // max-age=0:浏览器不复用本地副本(防止匿名页在登录后仍被本地缓存命中);
    // s-maxage 拉长到 TTL+stale 窗口:条目必须在边缘活过 TTL,SWR 才有旧的可回。
    storedHeaders.set("cache-control", ANON_STORED_CACHE_CONTROL);
    storedHeaders.set("x-zc-anon-cached-at", String(Math.floor(Date.now() / 1000)));
    ctx.waitUntil(edgeCache.put(anonCacheKey, new Response(body, { status: secured.status, headers: storedHeaders })));
    const served = new Response(body, { status: secured.status, headers: new Headers(secured.headers) });
    served.headers.set("x-zc-anon-cache", "miss");
    return served;
  }
  return secured;
}
