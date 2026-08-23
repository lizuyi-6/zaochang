"use client";

import { useEffect, useState } from "react";

// 章节页右侧 marginalia:本章小节目录(滚动联动) + 章节进度 + 回顶部 + 问 AI 入口。
// 服务端已把正文 h2/h3 注入 id=ch-N;此处用 IntersectionObserver 跟踪当前可视小节。
// 视觉权重刻意低于左栏:共享正文底色、无分隔线、更浅字色、更小字号、更多留白。

import { openReadingAi } from "./reading-ai-store";

type Heading = { id: string; text: string; level: number };

export function ChapterAside({
  headings,
  progress,
}: {
  headings: Heading[];
  progress: { current: number; total: number } | null;
}) {
  const [activeId, setActiveId] = useState<string>(headings[0]?.id ?? "");

  useEffect(() => {
    if (headings.length === 0) return;
    const els = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    // rootMargin:顶部 72px 留给固定顶栏,底部 -68% 使标题进入视口上 1/3 即激活。
    const observer = new IntersectionObserver(
      (entries) => {
        let bestId: string | null = null;
        let bestY = Infinity;
        for (const e of entries) {
          if (e.isIntersecting && e.boundingClientRect.top < bestY) {
            bestY = e.boundingClientRect.top;
            bestId = e.target.id;
          }
        }
        if (bestId) setActiveId(bestId);
      },
      { rootMargin: "-72px 0px -68% 0px", threshold: [0, 1] },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0 && !progress) return null;

  const scrollTo = (e: React.MouseEvent, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
  };

  return (
    <aside className="book-aside" aria-label="本章辅助">
      {headings.length > 0 && (
        <nav className="book-aside-section" aria-label="本章目录">
          <span className="book-aside-label">本章</span>
          <ul className="book-aside-toc">
            {headings.map((h) => (
              <li key={h.id}>
                <a
                  href={`#${h.id}`}
                  data-level={h.level}
                  className={activeId === h.id ? "active" : ""}
                  onClick={(e) => scrollTo(e, h.id)}
                >
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {progress && (
        <div className="book-aside-section">
          <span className="book-aside-label">进度</span>
          <p className="book-aside-progress">
            <strong>{progress.current}</strong>
            <small> / {progress.total}</small>
          </p>
        </div>
      )}

      <div className="book-aside-section book-aside-actions">
        <button
          type="button"
          className="book-aside-top"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          ↑ 回到顶部
        </button>
        <button type="button" className="book-aside-ai" onClick={(e) => openReadingAi(e.currentTarget)}>
          ✦ 问 AI
        </button>
      </div>
    </aside>
  );
}
