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
export default function IntentLink({ onPointerEnter, onFocus, ...props }: Omit<ComponentProps<typeof NextLink>, "prefetch">) {
  const router = useRouter();
  const warm = () => {
    const path = intentPrefetchPath(props.href);
    if (path !== null) router.prefetch(path);
  };
  return <NextLink {...props} prefetch={false}
    onPointerEnter={(event) => { onPointerEnter?.(event); warm(); }}
    onFocus={(event) => { onFocus?.(event); warm(); }}
  />;
}
