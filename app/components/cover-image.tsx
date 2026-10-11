"use client";

import { useEffect, useRef, useState } from "react";
import { coverImageSources } from "../lib/cover-image-sources";

// 封面图加载失败(外部图源不可达/断网/下架)时不再渲染 <img>,露出容器的主题渐变兜底,
// 避免浏览器裂图图标与裸 alt 文本直接暴露给用户。主题渐变声明在 globals.css 的
// .deep-product-cover.theme-* 上。
//
// 失败判定只认"真实 error 事件":
// - 水合后由 onError 直接判定;
// - 水合前就已失败(onError 尚未挂上,事件丢失)的情况,挂载时若 <img> 看起来是
//   complete && naturalWidth===0,不直接判失败,而是用独立 Image() 对同一 URL 复核,
//   只有复核触发 error 才隐藏。这样:未开始加载的 lazy 图(不合规范的引擎可能报 complete=true)、
//   部分引擎下无固有尺寸的 SVG(naturalWidth 可为 0)都不会被误判为失败。
// - loading="lazy" 的图只在进入视口后才复核,避免为屏外图提前发起下载。
export function CoverImage({ src, alt = "", sizes = "(max-width: 640px) 100vw, 640px", loading = "eager" }: { src?: string | null; alt?: string; sizes?: string; loading?: "lazy" | "eager" }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const element = image.current;
    if (!src || !element || !element.complete || element.naturalWidth > 0) return;
    let probe: HTMLImageElement | null = null;
    let observer: IntersectionObserver | null = null;
    const verify = () => {
      observer?.disconnect();
      // 复核前状态可能已变(水合后 onLoad/onError 已接管或图已加载成功)。
      if (!element.complete || element.naturalWidth > 0) return;
      probe = new Image();
      probe.onerror = () => setFailedSrc(src);
      probe.src = element.currentSrc || element.src;
    };
    if (loading === "lazy" && typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) verify();
      });
      observer.observe(element);
    } else {
      verify();
    }
    return () => {
      observer?.disconnect();
      if (probe) { probe.onerror = null; probe = null; }
    };
  }, [src, loading]);
  if (!src || failedSrc === src) return null;
  return <img ref={image} {...coverImageSources(src)} sizes={sizes} alt={alt} loading={loading} decoding="async" onError={() => setFailedSrc(src)} />;
}
