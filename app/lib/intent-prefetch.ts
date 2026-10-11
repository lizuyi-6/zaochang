// IntentLink 的预取白名单(零 import,便于纯 Node 合约测试直接导入)。
//
// 为什么不直接 router.prefetch(href):vinext 0.0.50 的 router.prefetch
// (node_modules/vinext/dist/shims/navigation.js `prefetch(href)`)没有任何路由过滤,
// 会对任意同源路径发起带凭据的完整 RSC 渲染,结果在 PREFETCH_CACHE_TTL(30s)内被
// 下一次点击直接复用。vinext 自己的 <Link> 在 auto 模式下用
// canAutoPrefetchFullAppRoute 拒绝动态路由,但它的 isDynamic 只看路径段是否含
// [param](routing/app-route-graph.js convertSegmentsToRouteParts),/wallet、/admin、
// /founder、/notifications 这类按用户渲染的静态路径照样会被预取——所以也不能退回
// vinext <Link> 的默认预取。
//
// 因此只对下列"公开、内容不随登录者变化、路径不含动态段"的页面做意图预取;
// 其余一律不预取(缺省拒绝)。新增条目前先确认该页服务端渲染不读会话/成员数据。
export const INTENT_PREFETCH_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/discover",
  "/feed",
  "/circles",
  "/challenges",
  "/guide",
  "/galaxy",
]);

/**
 * 返回可安全意图预取的路径(去掉 #hash,导航时 RSC 请求也不带 hash);
 * 不在白名单、带查询串、非站内相对路径时返回 null。
 */
export function intentPrefetchPath(href: unknown): string | null {
  if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//")) return null;
  const hashIndex = href.indexOf("#");
  const path = hashIndex === -1 ? href : href.slice(0, hashIndex);
  if (path.includes("?")) return null;
  return INTENT_PREFETCH_PATHS.has(path) ? path : null;
}
