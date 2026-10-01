"use client";

import { Pause, Play } from "lucide-react";
import { useState } from "react";
import type { Product } from "../lib/community-data";

/* 跑马灯带暂停控制:自动移动内容必须可停(WCAG 2.2.2)+ Apple HIG「动效不得干扰阅读/聚焦」。
   悬停或键盘聚焦即暂停,右缘常驻播放/暂停按钮供触屏与键鼠用户显式控制。 */
export function TickerBand({ items }: { items: Product[] }) {
  const [paused, setPaused] = useState(false);

  return (
    <div className="ticker-band" data-paused={paused || undefined}>
      <div className="ticker-track">
        {[...items, ...items].map((item, index) => <span key={`${item.id}-${index}`}><i style={{ background: item.accent }} />{item.title}<small>{item.release}</small></span>)}
      </div>
      <button
        type="button"
        className="ticker-toggle"
        aria-pressed={paused}
        aria-label={paused ? "恢复内容滚动" : "暂停内容滚动"}
        onClick={() => setPaused((value) => !value)}
      >
        {paused ? <Play size={12} /> : <Pause size={12} />}
      </button>
    </div>
  );
}
