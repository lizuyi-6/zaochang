"use client";

import { useState } from "react";

// 封面图加载失败(外部图源不可达/断网/下架)时不再渲染 <img>,露出容器的主题渐变兜底,
// 避免浏览器裂图图标与裸 alt 文本直接暴露给用户。主题渐变声明在 globals.css 的
// .deep-product-cover.theme-* 上。
export function CoverImage({ src, alt = "" }: { src?: string | null; alt?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return <img src={src} alt={alt} onError={() => setFailed(true)} />;
}
