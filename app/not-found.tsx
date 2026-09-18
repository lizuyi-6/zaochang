import type { Metadata } from "next";
import { Compass, Home, SearchX } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = { title: "页面不存在" };

export default function NotFound() {
  return (
    <div className="not-found-page">
      <span className="deep-eyebrow"><SearchX size={14} /> 404 / LOST SIGNAL</span>
      <h1>这个页面不存在，或已经搬走</h1>
      <p>链接可能过时、输入有误，或内容仍在预审中未公开。你可以回到首页，或去探索正在发生的作品。</p>
      <div className="not-found-actions">
        <Link className="primary-action" href="/"><Home size={16} /> 回到首页</Link>
        <Link className="text-action" href="/discover"><Compass size={15} /> 去探索作品</Link>
      </div>
    </div>
  );
}
