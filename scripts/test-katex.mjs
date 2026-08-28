// KaTeX 渲染管线快测:直接驱动 app/lib/markdown-katex.ts(零 cloudflare import,
// 与 docs.ts 的服务端书籍渲染、问 AI 面板的客户端渲染共用同一份实现)。
// 运行: node --experimental-strip-types scripts/test-katex.mjs
import { renderMarkdownKatexHtml } from "../app/lib/markdown-katex.ts";

const cases = [
  {
    name: "行内公式 \\frac + \\text{中文}",
    md: "时钟周期 $T = \\frac{1}{\\text{主频 } f}$",
    check: (html) => html.includes("katex") && !html.includes("katex-error"),
  },
  {
    name: "块级公式 $$...$$",
    md: "$$CPI = T_c \\times (\\text{指令条数} + \\text{停顿周期})$$",
    check: (html) => html.includes('<p class="katex-block">') && !html.includes("katex-error"),
  },
  {
    name: "坏公式容错 (throwOnError:false, 单公式降级不整篇崩)",
    md: "前文 $\\frac{1}{$ 正常,坏公式 $\\unknowncmd{$ 之后仍渲染",
    check: (html) => html.includes("katex-error") && html.includes("前文"),
  },
];

let failed = 0;
for (const c of cases) {
  let html;
  try {
    html = renderMarkdownKatexHtml(c.md);
  } catch (err) {
    console.error(`FAIL [${c.name}] 渲染抛异常:`, err);
    failed += 1;
    continue;
  }
  if (c.check(html)) {
    console.log(`PASS [${c.name}]`);
  } else {
    console.error(`FAIL [${c.name}] 断言不满足, 输出片段:\n`, html.slice(0, 300));
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\n${failed}/${cases.length} 用例失败`);
  process.exitCode = 1;
} else {
  console.log(`\n全部 ${cases.length} 个用例通过`);
}
