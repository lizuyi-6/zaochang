// 站壳状态同步信号:SiteShell 不再按路由整份拉取 /api/community,改为硬加载/账户
// 切换时拉一次轻量 /api/shell-state;各页面的成功写操作(标记已读、支付、打赏、
// 退款、发帖、入退圈)通过本事件让站壳主动重新对账,红点/余额/计数不失真。
// 纯浏览器 CustomEvent 通道,无框架依赖;派发与监听共用此常量,禁止散落字符串字面量。
export const SHELL_STATE_REFRESH_EVENT = "zaochang:shell-state-refresh";

export function refreshShellState(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SHELL_STATE_REFRESH_EVENT));
}
