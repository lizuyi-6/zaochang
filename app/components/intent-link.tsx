"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { intentPrefetchPath } from "../lib/intent-prefetch";

// Warm a destination on pointer/keyboard intent, without fetching every
// destination in the persistent navigation when the page first loads.
// Only public, member-independent static routes are warmed (see
// app/lib/intent-prefetch.ts): router.prefetch has no dynamic-route guard and
// its payload is replayed for 30s, so per-user / admin / [param] routes must
// never be prefetched here.
// 点按链接也会触发 focus(同样紧贴 click,无提前量);只有键盘聚焦才算意图。
function isKeyboardFocus(element: Element) {
  try {
    return element.matches(":focus-visible");
  } catch {
    return false;
  }
}

export default function IntentLink({ onPointerEnter, onFocus, ...props }: Omit<ComponentProps<typeof NextLink>, "prefetch">) {
  const router = useRouter();
  const warm = () => {
    const path = intentPrefetchPath(props.href);
    if (path !== null) router.prefetch(path);
  };
  // 触屏的 pointerenter 紧贴在 click 之前触发,预取没有提前量,只会和随后的跳转请求
  // 各发一份相同的 RSC(真机日志:每点一次两条),弱网下白白占带宽——触屏不预取。
  return <NextLink {...props} prefetch={false}
    onPointerEnter={(event) => { onPointerEnter?.(event); if (event.pointerType !== "touch") warm(); }}
    onFocus={(event) => { onFocus?.(event); if (isKeyboardFocus(event.currentTarget)) warm(); }}
  />;
}
