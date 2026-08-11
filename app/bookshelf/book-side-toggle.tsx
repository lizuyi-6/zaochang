"use client";

import { BookOpen } from "lucide-react";
import { useEffect, useState } from "react";

// 移动端书架阅读器的目录抽屉触发器(CSS 控制仅 ≤640px 显示)。
// 点开在 body 上加 .book-toc-open,配合 CSS 让 .book-side 从左侧滑入;
// 桌面端本按钮 display:none,不参与布局,目录树始终为 sticky 侧栏。
export function BookSideToggle() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("book-toc-open", open);
    return () => { document.body.classList.remove("book-toc-open"); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button className="book-toc-trigger" onClick={() => setOpen(true)} aria-label="打开目录">
        <BookOpen size={16} /> 目录
      </button>
      {open && <button className="book-toc-backdrop" onClick={() => setOpen(false)} aria-label="关闭目录" />}
    </>
  );
}
