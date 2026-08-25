// 共享的 Markdown -> 安全 HTML 渲染管线(marked + KaTeX + sanitize-html)。
// 零 cloudflare import:服务端(书籍正文, app/api/_lib/docs.ts)与客户端(问 AI 面板,
// app/bookshelf/reading-ai-dock.tsx)共用同一份白名单与公式渲染逻辑,只维护一处。
// 安全红线:禁行内原始 HTML,只允许白名单标签/属性。三层防线:marked 不执行 HTML;
// marked-katex 扩展把 $...$/$$...$$ 交给 KaTeX 渲染成纯 span 结构(无脚本);
// sanitize-html 再做白名单消毒。fail-closed。

import { marked } from "marked";
import katex from "katex";
import sanitizeHtml from "sanitize-html";

// 自定义 marked 扩展:行内 $...$ 与块级 $$...$$ 数学公式,KaTeX 渲染。
// throwOnError:false + strict:"ignore":单个公式语法错误只渲染该公式为错误标记,
// 不让整篇渲染崩溃(容错但不放行原始 HTML)。
// KaTeX 渲染:恢复 mathml+html 双输出(默认 htmlAndMathml)。
// 原因:katex CSS 的 mathml 视觉隐藏(clip-path)依赖 <span class="katex-mathml"> 作为
// .katex 第一个子节点来锚定;若禁用 mathml,clip 失去锚点,分数/上下标等重叠布局会整排错乱。
const KATEX_OPTS: katex.KatexOptions = { throwOnError: false, strict: "ignore" };

// KaTeX 视觉层(html span)的垂直/水平定位全部写死在 inline style 上(vlist 的 top、
// 分数线的 height、定界符的 vertical-align 等)。sanitize 若剥掉 style,这些 span 退化为
// 普通流,公式即塌陷(分子掉到分数线下方、范数重叠)。因此必须放行 style —— 但用
// allowedStyles 按"属性白名单 + 值正则"锁定:只允许几何长度(em/px/%/数字/负值)与
// position:relative,拒一切 url(/expression(/behavior/javascript,不扩大 XSS 面。
// 实测 KaTeX 仅 span 携带 style、且只出现下列 11 个属性(见 .tmp 测量脚本)。
const KATEX_LEN = /^-?\d+(\.\d+)?(em|rem|px|pt|%)?$/;
const KATEX_ALLOWED_STYLES: Record<string, Record<string, RegExp[]>> = {
  "*": {
    top: [KATEX_LEN],
    left: [KATEX_LEN],
    height: [KATEX_LEN],
    width: [KATEX_LEN],
    "min-width": [KATEX_LEN],
    "margin-left": [KATEX_LEN],
    "margin-right": [KATEX_LEN],
    "padding-left": [KATEX_LEN],
    "vertical-align": [KATEX_LEN],
    "border-bottom-width": [KATEX_LEN],
    position: [/^relative$/],
  },
};
const katexExtension = {
  extensions: [
    {
      name: "inlineKatex",
      level: "inline" as const,
      start(src: string) { const i = src.indexOf("$"); return i < 0 ? undefined : i; },
      tokenizer(src: string) {
        const m = /^\$([^$\n]+?)\$/.exec(src);
        if (m) return { type: "inlineKatex", raw: m[0], text: m[1] };
        return undefined;
      },
      renderer(tok: { text: string }) { return katex.renderToString(tok.text, KATEX_OPTS); },
    },
    {
      name: "blockKatex",
      level: "block" as const,
      start(src: string) { const i = src.indexOf("$$"); return i < 0 ? undefined : i; },
      tokenizer(src: string) {
        const m = /^\$\$([\s\S]+?)\$\$(?:\n+|$)/.exec(src);
        if (m) return { type: "blockKatex", raw: m[0], text: m[1].trim() };
        return undefined;
      },
      renderer(tok: { text: string }) {
        return `<p class="katex-block">${katex.renderToString(tok.text, { ...KATEX_OPTS, displayMode: true })}</p>\n`;
      },
    },
  ],
};

const markedKatex = marked.use(katexExtension);

// CommonMark 的 strong-emphasis 闭合规则(Rule 16)有一个边界:`**内容**` 的内容若以标点
// (如 ) 。 , 」 》 )结尾、且闭合 ** 后紧跟非标点字符(如中文字),marked 判定不闭合,
// **X** 原样裸露成文本、不渲染成 <strong>。中文书籍"中文术语(English)"写法大量命中(例如
// `**视觉编码器(ViT, Vision Transformer)**`、`**模态对齐(Modal Alignment)**`)。
// 预处理:遍历每对 **X** (非贪心顺序配对),若 inner 末字符是标点且闭合 ** 后是非空白非
// 标点字符(marked 漏渲染的精确条件),直接改写成 <strong>X</strong>(sanitize 允许 strong)。
// 仅干预 inner 不含 [ ` ~ 的简单强调——避免破坏链接/代码/删除线嵌套。
// 注:"闭合后非标点"判定必须放回调里用 offset 取,不能放正则 lookahead——lookahead 失败
// 时引擎会把闭合 ** 当下一对的开启,错配到后续 **,漏掉紧随的合法 emphasis(例如
// `**A)**——x **B)**z`,lookahead 版会漏修 B)。
function fixStrongEmphasis(md: string): string {
  return md.replace(/\*\*([^*\n[`~]+?)\*\*/gu, (all, inner: string, offset: number, str: string) => {
    if (!/\p{P}$/u.test(inner)) return all; // inner 末非标点,marked 能正常渲染
    const after = str[offset + all.length] ?? "";
    if (after === "" || /\s/.test(after) || /\p{P}/u.test(after)) return all; // 闭合后空白/标点/EOF,marked 能渲染
    return `<strong>${inner}</strong>`;
  });
}

// Markdown → 消毒 HTML。返回串可直接 dangerouslySetInnerHTML(白名单见下)。
export function renderMarkdownKatexHtml(md: string): string {
  const raw = markedKatex.parse(fixStrongEmphasis(md), { async: false }) as string;
  return sanitizeHtml(raw, {
    allowedTags: [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "a", "ul", "ol", "li", "blockquote", "pre", "code",
      "strong", "em", "del", "hr", "br",
      "table", "thead", "tbody", "tr", "th", "td",
      "img",
      // KaTeX 输出仅用 span 承载结构,放行 span(不允许 style/事件属性)。
      "span",
      // KaTeX mathml 输出(可访问性层 + 视觉隐藏锚点):纯语义标签,无 style/事件属性。
      "math", "semantics", "annotation", "mrow", "mi", "mn", "mo", "mtext",
      "mfrac", "msqrt", "msub", "msup", "msubsup", "munder", "mover", "mspace",
      "mstyle", "mtable", "mtr", "mtd",
    ],
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt", "title"],
      code: ["class"],
      th: ["align"],
      td: ["align"],
      // KaTeX 依赖 class 区分 .katex/.katex-html/.katex-base/.mord 等;style 必须放行给
      // span(vlist 定位全靠 inline top/height/vertical-align),但由 allowedStyles 按
      // 属性+值正则锁定(见上方 KATEX_ALLOWED_STYLES),只允许几何长度,拒 url/expression。
      span: ["class", "aria-hidden", "style"],
      p: ["class"],
      // mathml 展示属性(按 KaTeX 实际输出实测的最小集;不放行 style/事件属性)。
      math: ["xmlns"],
      mi: ["mathvariant"],
      mo: ["fence", "separator", "stretchy"],
      mfrac: ["linethickness"],
      mover: ["accent"],
      mspace: ["width"],
      mstyle: ["displaystyle", "scriptlevel"],
      mtable: ["columnalign", "columnspacing", "rowspacing"],
      annotation: ["encoding"],
    },
    allowedClasses: {
      span: [/^katex/, /^mord$/, /^mbin$/, /^mrel$/, /^mopen$/, /^mclose$/, /^mpunct$/, /^mop$/, /^msupsub$/, /^vlist/, /^sizing/, /^pstrut$/, /^strut$/, /^delimsizing/, /^nulldelimiter$/, /^base$/, /^text$/, /^rm$/, /^textit$/, /^textbf$/, /^mathrm$/, /^mathbf$/, /^mathit$/, /^mathbb$/, /^mathcal$/, /^mathsf$/, /^mathtt$/, /^cjk_fallback$/, /^accent/, /^sout$/, /^overline$/, /^underline$/, /^x-arrow$/, /^stretchy$/, /^cr$/, /^halfarrow$/, /^hline$/, /^hdashline$/, /^vertical-separator$/, /^mfrac$/, /^frac-line$/, /^sqrt$/, /^root$/, /^mspace$/, /^llap$/, /^rlap$/, /^rule$/, /^hide-tail$/, /^svg-align$/, /^mtable$/, /^col-align/, /^arraycolsep$/, /^vertical-separator$/, /^binrel$/, /^katex-error$/],
      code: [/^language-/],
      p: [/^katex-block$/],
    },
    allowedSchemes: ["https", "http", "mailto"],
    // 禁止 data: 协议与 javascript:,防 XSS。
    allowProtocolRelative: false,
    // KaTeX 视觉层定位 style 白名单(属性 + 值正则),见上方 KATEX_ALLOWED_STYLES。
    allowedStyles: KATEX_ALLOWED_STYLES,
  });
}
