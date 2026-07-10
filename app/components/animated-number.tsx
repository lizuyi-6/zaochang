"use client";

import { useEffect, useRef, useState } from "react";

export function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const startedAt = performance.now();
    const duration = 900;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [value]);

  return <>{display.toLocaleString("zh-CN")}{suffix}</>;
}
