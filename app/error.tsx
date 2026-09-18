"use client";

import { RotateCcw, Wrench } from "lucide-react";
import Link from "next/link";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="not-found-page">
      <span className="deep-eyebrow"><Wrench size={14} /> 500 / SOMETHING BROKE</span>
      <h1>页面渲染时出了点问题</h1>
      <p>这不是你的操作导致的。可以重试一次；如果反复出现，请把当前页面地址告诉造场。</p>
      <div className="not-found-actions">
        <button className="primary-action" onClick={reset}><RotateCcw size={16} /> 重试</button>
        <Link className="text-action" href="/">回到首页</Link>
      </div>
    </div>
  );
}
