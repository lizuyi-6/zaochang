"use client";

import { ExternalLink, LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const EMBEDDED_PRODUCTS = new Set([
  "loops",
  "minute",
  "mori",
  "sprout",
  "typewave",
  "wander",
]);

export function hasEmbeddedProduct(productRef: string) {
  return EMBEDDED_PRODUCTS.has(productRef);
}

export function EmbeddedProduct({ productRef, title, official }: { productRef: string; title: string; official: boolean }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [frameState, setFrameState] = useState<{ key: string; status: "loading" | "ready" | "failed" }>({ key: "", status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const params = new URLSearchParams({ embed: "1", lang: "zh-CN" });
  if (official) params.set("official", "1");
  const src = `/product-apps/${productRef}/index.html?${params.toString()}`;
  const frameKey = `${src}:${reloadKey}`;
  const state = frameState.key === frameKey ? frameState.status : "loading";

  useEffect(() => {
    const timeout = window.setTimeout(() => setFrameState((current) => (
      current.key === frameKey && current.status === "ready"
        ? current
        : { key: frameKey, status: "failed" }
    )), 12000);
    return () => window.clearTimeout(timeout);
  }, [frameKey]);

  return (
    <section className="embedded-product" data-product-app={productRef} data-embed-state={state}>
      {state !== "ready" && (
        <div className={`embedded-product-status ${state}`} role="status">
          {state === "loading" ? (
            <><LoaderCircle size={22} className="embedded-product-spinner" /><strong>正在进入 {title}</strong><span>加载完整作品体验</span></>
          ) : (
            <><strong>作品暂时没有响应</strong><span>可以重新载入，或在独立页面中打开。</span><button type="button" onClick={() => setReloadKey((key) => key + 1)}><RotateCcw size={15} />重新载入</button></>
          )}
        </div>
      )}
      <iframe
        key={reloadKey}
        ref={iframeRef}
        className={state === "ready" ? "ready" : ""}
        src={src}
        title={`${title} 完整作品体验`}
        loading="eager"
        sandbox="allow-scripts allow-same-origin allow-downloads"
        allow="autoplay"
        onLoad={() => setFrameState({ key: frameKey, status: "ready" })}
      />
      <a className="embedded-product-popout" href={src} target="_blank" rel="noreferrer">
        独立打开 <ExternalLink size={14} />
      </a>
    </section>
  );
}
