import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * 板书公式块:KaTeX 按需加载(独立异步 chunk + 样式,仅在公式出现时下载),
 * display 模式渲染;加载中/加载失败回退为等宽 LaTeX 源码(诚实可读,绝不白屏)。
 * 此前公式动作直接把源码当等宽文本上板——学员看到的是 \text \iff 原始记号。
 */
export const FormulaBlock: React.FC<{ latex: string }> = ({ latex }) => {
  const [html, setHtml] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<{ scale: number; height: number } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [katexMod] = await Promise.all([import('katex'), import('katex/dist/katex.min.css')]);
        if (!alive) return;
        const katex = katexMod.default;
        setHtml(
          katex.renderToString(latex, {
            displayMode: true,
            throwOnError: false,
            strict: false,
            /* LLM 公式偶发未闭合括号/多余记号:errorColor 标红该段,其余照常排 */
            errorColor: '#B23A1F',
          }),
        );
      } catch {
        /* 回退等宽源码(html 保持 null) */
      }
    })();
    return () => {
      alive = false;
    };
  }, [latex]);

  /* 宽公式(全概率分母、长等式链)按栏宽等比缩小:display 公式不折行,旧实现直接越出
   * 320px 栏、压进相邻栏的板书。缩放后用实际高度占位,不留空白也不压下方元素。
   * 依赖 KaTeX 字体已就位——字体异步注入后再量一次。 */
  useLayoutEffect(() => {
    if (!html) return;
    const measure = () => {
      const box = boxRef.current;
      const inner = innerRef.current;
      if (!box || !inner) return;
      const avail = box.clientWidth;
      const need = inner.scrollWidth;
      const scale = need > avail && avail > 0 ? Math.max(0.5, avail / need) : 1;
      setFit(scale < 1 ? { scale, height: inner.offsetHeight * scale } : null);
    };
    measure();
    let alive = true;
    void document.fonts?.ready.then(() => alive && measure());
    return () => {
      alive = false;
    };
  }, [html]);

  if (html) {
    return (
      <div ref={boxRef} className="wb-formula-box" style={fit ? { height: fit.height } : undefined}>
        <div
          ref={innerRef}
          className="wb-formula"
          style={fit ? { transform: `scale(${fit.scale})`, transformOrigin: 'left top', width: 'max-content' } : { width: 'max-content', maxWidth: 'none' }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    );
  }
  return <pre className="wb-code-content wb-formula-fallback">{latex}</pre>;
};
