// 客户端跳转「进行中」反馈的纯逻辑(零 import,便于纯 Node 合约测试直接导入)。
//
// 背景(2026-10-17 安卓真机实测,vivo V2426A / WebView 153,经代理出口):点底部导航后
// 服务器约 0.4s 就返回 RSC,但页面约 30s 后才切换——App Router 的客户端跳转是一个
// 过渡,RSC 与新路由脚本到齐前旧页面原样不动,弱网下看起来就是"按钮点不了",用户再点
// 又会重开一次跳转。所以:跳转一开始就亮进度条;过久仍停在出发页就改走整页跳转。

/** 客户端跳转开始时在 window 上广播的 DOM 事件名(detail: { href, navigationType })。 */
export const NAVIGATION_START_EVENT = "zaochang:navigation-start";

type RscNavigate = ((this: unknown, ...args: unknown[]) => unknown) & { __zaochangNavigationBroadcast?: true };
type NavigationWindow = {
  __VINEXT_RSC_NAVIGATE__?: RscNavigate;
  dispatchEvent(event: Event): boolean;
};

/**
 * 给 vinext 的 App Router 跳转入口 window.__VINEXT_RSC_NAVIGATE__ 套一层「开始」广播。
 *
 * 为什么不用 instrumentation-client.ts 的 onRouterTransitionStart:vinext 0.0.50 只在
 * Pages Router 入口(entries/pages-client-entry.js)加载该钩子,App Router 浏览器入口不加载,
 * 钩子永远不会被调用(本地生产构建实测)。navigateRsc(href, redirectDepth, navigationKind,
 * historyUpdateMode, …) 是 <Link>/router.push(shims/navigation.js navigateClientSide)与
 * 前进后退(app-browser-entry popstate,kind="traverse")的共同入口,且各调用点都在调用时
 * 才读这个全局——tests/navigation-pending.test.mjs 钉住这两处 vinext 源码,升级时会先挂。
 *
 * 只对首跳(redirectDepth 0)的 "navigate" 广播;refresh/traverse/重定向续跳不广播。
 * 返回卸载函数;全局缺失时返回 null(不改变任何行为)。重复安装是幂等的。
 *
 * 广播必须延后一个微任务:vinext <Link> 在 React.startTransition 的同步回调里调用本入口,
 * 若同步派发,监听方的 setState 会被并入这次跳转过渡,要等跳转提交才渲染——跳转卡住时
 * 进度条也跟着卡住(本地拦截 .rsc 实测)。微任务执行时过渡的同步作用域已结束。
 */
export function installNavigationStartBroadcast(
  win: NavigationWindow,
  createEvent: (detail: { href: unknown; navigationType: unknown }) => Event,
  schedule: (task: () => void) => void = queueMicrotask,
): (() => void) | null {
  const original = win.__VINEXT_RSC_NAVIGATE__;
  if (typeof original !== "function" || original.__zaochangNavigationBroadcast) return null;
  const wrapped: RscNavigate = function (this: unknown, ...args: unknown[]) {
    const [href, redirectDepth, navigationKind, historyUpdateMode] = args;
    if ((redirectDepth === undefined || redirectDepth === 0) && (navigationKind === undefined || navigationKind === "navigate")) {
      schedule(() => { win.dispatchEvent(createEvent({ href, navigationType: historyUpdateMode ?? "push" })); });
    }
    return original.apply(this, args);
  };
  wrapped.__zaochangNavigationBroadcast = true;
  win.__VINEXT_RSC_NAVIGATE__ = wrapped;
  return () => {
    if (win.__VINEXT_RSC_NAVIGATE__ === wrapped) win.__VINEXT_RSC_NAVIGATE__ = original;
  };
}

/** 客户端跳转超过这个时长仍未离开出发页,改走浏览器整页跳转。 */
export const HARD_NAVIGATION_FALLBACK_MS = 7_000;

export type NavigationMode = "push" | "replace" | "traverse";

/** 地址比较键:路径 + 查询串(hash 变化不算跳转)。解析失败返回 null。 */
export function navigationLocationKey(href: string, base?: string): string | null {
  try {
    const url = base === undefined ? new URL(href) : new URL(href, base);
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

/**
 * 需要显示「跳转中」的目标绝对地址;同源且路径/查询串确有变化才返回,
 * 否则(跨源、纯 hash 跳转、原地刷新、畸形地址)返回 null——这些情形 URL 不会离开
 * 出发页,若照样计时就会在超时后把用户整页重载到同一页。
 */
export function pendingNavigationTarget(href: unknown, currentHref: string): string | null {
  if (typeof href !== "string" || href === "") return null;
  let target: URL;
  let current: URL;
  try {
    current = new URL(currentHref);
    target = new URL(href, current);
  } catch {
    return null;
  }
  if (target.origin !== current.origin) return null;
  if (target.pathname + target.search === current.pathname + current.search) return null;
  return target.href;
}

/** 仅 push/replace 可整页兜底;前进/后退(traverse)由浏览器历史自行处理,不得改写历史。 */
export function hardNavigationMode(mode: unknown): "assign" | "replace" | null {
  if (mode === "push") return "assign";
  if (mode === "replace") return "replace";
  return null;
}
