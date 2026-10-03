import React, { useEffect, useState } from 'react';

/**
 * 板书公式块:KaTeX 按需加载(独立异步 chunk + 样式,仅在公式出现时下载),
 * display 模式渲染;加载中/加载失败回退为等宽 LaTeX 源码(诚实可读,绝不白屏)。
 * 此前公式动作直接把源码当等宽文本上板——学员看到的是 \text \iff 原始记号。
 */
export const FormulaBlock: React.FC<{ latex: string }> = ({ latex }) => {
  const [html, setHtml] = useState<string | null>(null);

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

  if (html) {
    return <div className="wb-formula" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <pre className="wb-code-content wb-formula-fallback">{latex}</pre>;
};
