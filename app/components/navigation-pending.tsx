"use client";

import { useEffect, useState } from "react";
import {
  HARD_NAVIGATION_FALLBACK_MS,
  NAVIGATION_START_EVENT,
  hardNavigationMode,
  installNavigationStartBroadcast,
  navigationLocationKey,
  pendingNavigationTarget,
} from "../lib/navigation-pending";

type Pending = { href: string; mode: unknown; from: string; startedAt: number };

// 跳转一开始就亮顶部进度条(站壳原有的 .route-progress 只在新页面提交后才播放);
// 地址离开出发页即收起;超过 HARD_NAVIGATION_FALLBACK_MS 仍停在出发页,改走整页跳转。
export function NavigationPending() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    const onStart = (event: Event) => {
      const detail = (event as CustomEvent<{ href?: unknown; navigationType?: unknown }>).detail;
      const href = pendingNavigationTarget(detail?.href, window.location.href);
      const from = navigationLocationKey(window.location.href);
      if (href === null || from === null) return;
      setPending({ href, mode: detail?.navigationType, from, startedAt: Date.now() });
    };
    window.addEventListener(NAVIGATION_START_EVENT, onStart);
    const uninstall = installNavigationStartBroadcast(
      window as unknown as Parameters<typeof installNavigationStartBroadcast>[0],
      (detail) => new CustomEvent(NAVIGATION_START_EVENT, { detail }),
    );
    return () => {
      uninstall?.();
      window.removeEventListener(NAVIGATION_START_EVENT, onStart);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    // 轮询地址而非订阅 pathname:仅查询串变化、重定向到别处、浏览器后退也都算"已离开"。
    const timer = window.setInterval(() => {
      if (navigationLocationKey(window.location.href) !== pending.from) {
        setPending(null);
        return;
      }
      if (Date.now() - pending.startedAt < HARD_NAVIGATION_FALLBACK_MS) return;
      window.clearInterval(timer);
      const mode = hardNavigationMode(pending.mode);
      if (mode === "assign") window.location.assign(pending.href);
      else if (mode === "replace") window.location.replace(pending.href);
      else setPending(null);
    }, 150);
    return () => window.clearInterval(timer);
  }, [pending]);

  if (!pending) return null;
  return <div className="navigation-pending" role="progressbar" aria-label="正在打开页面" aria-busy="true" />;
}
