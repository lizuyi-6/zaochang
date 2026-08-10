"use client";

import { useEffect, useRef } from "react";

type Props = {
  bookId: string;
  chapterId: string;
  // 该章节上次记录的段落序号;仅当进度指向当前章节时由 server 传入,用作恢复起点。
  initialParagraph: number | null;
  canRecord: boolean;
};

// 段落级阅读进度。本组件不渲染可见 UI(只是一个隐藏 marker),通过 marker 定位
// 同在 .book-reader 内的 .docs-body,给其顶层块元素打 data-pp 序号;监听 scroll
// 记录"当前段落"(视口顶部 25% 线所在块),debounce 上报;挂载时若 initialParagraph
// 有效则 scrollIntoView 到该块。
//
// 设计取舍:用"第几个顶层块"作位置标识,而非像素/百分比——跨设备/字号/屏高一致。
// 代价:章节正文被编辑(增删段落)后序号会漂移,但只会回到附近段落,非灾难;
// 换来的可靠性远高于像素级(后者在不同屏幕上语义不同)。
export function ReadingProgressTracker({ bookId, chapterId, initialParagraph, canRecord }: Props) {
  const markerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    const body = marker.closest(".book-reader")?.querySelector<HTMLElement>(".docs-body");
    if (!body) return;
    const blocks = Array.from(body.querySelectorAll<HTMLElement>(":scope > *"));
    if (blocks.length === 0) return;
    blocks.forEach((el, i) => el.setAttribute("data-pp", String(i)));

    if (initialParagraph != null && initialParagraph > 0 && initialParagraph < blocks.length) {
      // 异步一帧,让浏览器先完成初次布局与 hash 跳转,避免恢复 scroll 被覆盖。
      window.setTimeout(() => {
        blocks[initialParagraph]?.scrollIntoView({ block: "start" });
      }, 0);
    }

    if (!canRecord) return;

    // 当前段落 = 最后一个"块顶已越过视口 25% 线"的块。
    const findCurrent = (): number => {
      const line = window.innerHeight * 0.25;
      let current = 0;
      for (const el of blocks) {
        if (el.getBoundingClientRect().top <= line) current = Number(el.dataset.pp || 0);
        else break;
      }
      return current;
    };

    let lastReported = -1;
    let timer: number | undefined;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const cur = findCurrent();
        if (cur !== lastReported) {
          lastReported = cur;
          // keepalive:页面切换时上报也能完成,不阻塞导航。
          void fetch("/api/reading-progress", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ bookId, chapterId, paragraph: cur }),
            keepalive: true,
          }).catch(() => {
            /* 进度上报失败不阻塞阅读,静默丢弃 */
          });
        }
      }, 800);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [bookId, chapterId, initialParagraph, canRecord]);

  return <div ref={markerRef} style={{ display: "none" }} aria-hidden="true" />;
}
