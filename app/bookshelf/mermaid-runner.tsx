"use client";

import { useEffect } from "react";

// 把服务端产出的 <pre class="mermaid"> 代码块在客户端渲染成 SVG 图。
// mermaid 体积大(且其依赖会拉入 katex),改为动态 import:仅当页面确有 mermaid
// 块时才下载/执行,符合 CSP script-src 'self'(本地打包,无外链)。
export function MermaidRunner() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("pre.mermaid:not([data-processed])"));
    if (nodes.length === 0) return;
    void (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
        await mermaid.run({ nodes });
      } catch {
        // 单个图语法错误不影响整篇;mermaid 会把错误图标记 data-processed,其余照常渲染。
      }
    })();
  }, []);
  return null;
}
