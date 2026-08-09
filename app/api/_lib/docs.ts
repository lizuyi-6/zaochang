import { marked } from "marked";
import katex from "katex";
import sanitizeHtml from "sanitize-html";
import { database, optionalMember, type MemberIdentity } from "./community";

export type DocVisibility = "public" | "members" | "private";

export type DocRow = {
  id: string;
  slug: string;
  parentId: string | null;
  title: string;
  bodyMd: string;
  visibility: DocVisibility;
  authorEmail: string;
  sortOrder: number;
  isBook: number;
  coverHue: number;
  summary: string;
  coverImage: string;
  createdAt: string;
  updatedAt: string;
};

export type DocNode = DocRow & { children: DocNode[] };

export const DOC_COLUMNS = `id, slug, parent_id AS parentId, title, body_md AS bodyMd,
  visibility, author_email AS authorEmail, sort_order AS sortOrder,
  is_book AS isBook, cover_hue AS coverHue, summary, cover_image AS coverImage,
  created_at AS createdAt, updated_at AS updatedAt`;

// ---- Markdown -> 安全 HTML。安全红线:禁行内原始 HTML,只允许白名单标签/属性。----
// 三层防线:marked 不执行 HTML;marked-katex 扩展把 $...$/$$...$$ 交给 KaTeX 服务端
// 渲染成纯 span 结构(无脚本);sanitize-html 再做白名单消毒。fail-closed。

// 自定义 marked 扩展:行内 $...$ 与块级 $$...$$ 数学公式,服务端 KaTeX 渲染。
// throwOnError:false + strict:"ignore":单个公式语法错误只渲染该公式为错误标记,
// 不让整篇渲染崩溃(容错但不放行原始 HTML)。
const KATEX_OPTS: katex.KatexOptions = { throwOnError: false, strict: "ignore", output: "html" };
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

// 把 ```mermaid 围栏改写成 <pre class="mermaid">,交给前端 mermaid.js 渲染成 SVG。
// 用占位替换避开 marked 把围栏当普通 code 处理;mermaid 源码本身不进消毒白名单,
// 因此先抽离、消毒后再回填,保证 mermaid 文本不被 sanitize 当作未知标签剥掉。
const MERMAID_PLACEHOLDER = "ZAOCHANGMERMAIDBLOCK";
function extractMermaid(bodyMd: string): { md: string; blocks: string[] } {
  const blocks: string[] = [];
  const md = bodyMd.replace(/```mermaid\r?\n([\s\S]*?)```/g, (_all, code: string) => {
    blocks.push(code.replace(/\s+$/, ""));
    return `\n\n${MERMAID_PLACEHOLDER}${blocks.length - 1}\n\n`;
  });
  return { md, blocks };
}

const markedKatex = marked.use(katexExtension);

export function renderDocHtml(bodyMd: string): string {
  const { md, blocks } = extractMermaid(bodyMd);
  const raw = markedKatex.parse(md, { async: false }) as string;
  let clean = sanitizeHtml(raw, {
    allowedTags: [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "a", "ul", "ol", "li", "blockquote", "pre", "code",
      "strong", "em", "del", "hr", "br",
      "table", "thead", "tbody", "tr", "th", "td",
      "img",
      // KaTeX 输出仅用 span 承载结构,放行 span(不允许 style/事件属性)。
      "span",
    ],
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt", "title"],
      code: ["class"],
      th: ["align"],
      td: ["align"],
      // KaTeX 依赖 class 区分 .katex/.katex-html/.katex-base/.mord 等;style 一律不放行,
      // 防止借 style 注入(定位/背景图外链)。
      span: ["class", "aria-hidden"],
      p: ["class"],
    },
    allowedClasses: {
      span: [/^katex/, /^mord$/, /^mbin$/, /^mrel$/, /^mopen$/, /^mclose$/, /^mpunct$/, /^mop$/, /^msupsub$/, /^vlist/, /^sizing/, /^pstrut$/, /^strut$/, /^delimsizing/, /^nulldelimiter$/, /^base$/, /^text$/, /^rm$/, /^textit$/, /^textbf$/, /^mathrm$/, /^mathbf$/, /^mathit$/, /^mathbb$/, /^mathcal$/, /^mathsf$/, /^mathtt$/, /^cjk_fallback$/, /^accent/, /^sout$/, /^overline/, /^underline/, /^x-arrow/, /^stretchy$/, /^cr$/, /^halfarrow/, /^hline/, /^hdashline/, /^vertical-separator$/, /^mfrac$/, /^frac-line$/, /^sqrt$/, /^root$/, /^mspace$/, /^llap$/, /^rlap$/, /^rule$/, /^hide-tail$/, /^svg-align$/, /^mtable$/, /^col-align/, /^arraycolsep$/, /^vertical-separator$/, /^binrel$/, /^katex-error$/],
      code: [/^language-/],
      p: [/^katex-block$/],
    },
    allowedSchemes: ["https", "http", "mailto"],
    // 禁止 data: 协议与 javascript:,防 XSS。
    allowProtocolRelative: false,
  });
  // 回填 mermaid 块为 <pre class="mermaid">(内容仅文本,不含可执行标签)。
  clean = clean.replace(new RegExp(`<p>${MERMAID_PLACEHOLDER}(\\d+)</p>`, "g"), (_all, idx: string) => {
    const code = blocks[Number(idx)] ?? "";
    return `<pre class="mermaid">${sanitizeHtml(code, { allowedTags: [], allowedAttributes: {} })}</pre>`;
  });
  return clean;
}

export async function listAllDocs(): Promise<DocRow[]> {
  const result = await database().prepare(
    `SELECT ${DOC_COLUMNS} FROM docs ORDER BY sort_order ASC, created_at ASC, id ASC`,
  ).all<DocRow>();
  return result.results;
}

// 可见性规则:public 人人可见;members/private 需登录(后续可再细分创始人可见)。
export function canViewDoc(doc: DocRow, member: MemberIdentity | null): boolean {
  if (doc.visibility === "public") return true;
  return member !== null;
}

// 只保留对当前访问者可见的文档,再组装成目录树。
export function buildDocTree(rows: DocRow[], member: MemberIdentity | null): DocNode[] {
  const allIds = new Set(rows.map((row) => row.id));
  const visible = rows.filter((row) => canViewDoc(row, member));
  const nodes = new Map<string, DocNode>();
  for (const row of visible) nodes.set(row.id, { ...row, children: [] });
  const roots: DocNode[] = [];
  for (const node of nodes.values()) {
    if (!node.parentId) { roots.push(node); continue; }
    const parent = nodes.get(node.parentId);
    if (parent) {
      parent.children.push(node);
    } else if (!allIds.has(node.parentId)) {
      // 父级真的不存在(孤儿数据),提升到根。
      roots.push(node);
    }
    // 父级存在但不可见 -> 该节点经父级路径不可达,不显示(避免"目录列出但点击 404")。
  }
  return roots;
}

// 按嵌套 slug 路径逐段解析。fail-closed:任一段不存在、或对当前访问者不可见,
// 都返回 null(对外 404),不暴露该文档的存在性——匿名访问 members/private 文档与
// 访问不存在的文档对外表现一致,符合权限边界最严格缺省。
export async function findDocByPath(slugs: string[], member: MemberIdentity | null): Promise<DocRow | null> {
  if (slugs.length === 0) return null;
  let parentId: string | null = null;
  let current: DocRow | null = null;
  for (const slug of slugs) {
    const row: DocRow | null = await database().prepare(
      `SELECT ${DOC_COLUMNS} FROM docs WHERE slug = ? AND ${parentId === null ? "parent_id IS NULL" : "parent_id = ?"} LIMIT 1`,
    ).bind(...(parentId === null ? [slug] : [slug, parentId])).first<DocRow>();
    if (!row || !canViewDoc(row, member)) return null;
    current = row;
    parentId = row.id;
  }
  return current;
}

// 面包屑:从当前文档一路向父级回溯到根。
export async function docBreadcrumbs(doc: DocRow, member: MemberIdentity | null): Promise<DocRow[]> {
  const chain: DocRow[] = [];
  let cursor: DocRow | null = doc;
  const seen = new Set<string>();
  while (cursor) {
    if (seen.has(cursor.id)) break; // 防御环
    seen.add(cursor.id);
    chain.unshift(cursor);
    if (!cursor.parentId) break;
    const parent: DocRow | null = await database().prepare(
      `SELECT ${DOC_COLUMNS} FROM docs WHERE id = ? LIMIT 1`,
    ).bind(cursor.parentId).first<DocRow>();
    cursor = parent && canViewDoc(parent, member) ? parent : null;
  }
  return chain;
}

export async function listChildren(docId: string | null, member: MemberIdentity | null): Promise<DocRow[]> {
  const result = docId === null
    ? await database().prepare(
      `SELECT ${DOC_COLUMNS} FROM docs WHERE parent_id IS NULL ORDER BY sort_order ASC, created_at ASC`,
    ).all<DocRow>()
    : await database().prepare(
      `SELECT ${DOC_COLUMNS} FROM docs WHERE parent_id = ? ORDER BY sort_order ASC, created_at ASC`,
    ).bind(docId).all<DocRow>();
  return result.results.filter((row) => canViewDoc(row, member));
}

// 计算某节点的完整 URL 路径(嵌套 slug)。
export async function docUrlPath(doc: DocRow, member: MemberIdentity | null): Promise<string> {
  const crumbs = await docBreadcrumbs(doc, member);
  return "/docs/" + crumbs.map((crumb) => encodeURIComponent(crumb.slug)).join("/");
}

export async function currentMember(): Promise<MemberIdentity | null> {
  return optionalMember();
}

// ---- 书架:一本书 = 一棵以 is_book=1 行为根的文档树。----

export type BookSummary = DocRow & { chapterCount: number };

// 列出所有对当前访问者可见的书(书架卡片)。章节数只统计可见后代。
export async function listBooks(member: MemberIdentity | null): Promise<BookSummary[]> {
  const result = await database().prepare(
    `SELECT ${DOC_COLUMNS} FROM docs WHERE is_book = 1 ORDER BY sort_order ASC, created_at ASC, id ASC`,
  ).all<DocRow>();
  const visibleBooks = result.results.filter((row) => canViewDoc(row, member));
  // 每本书统计可见章节数(后代中 body 非空、非书自身的可见节点)。
  const all = await listAllDocs();
  return visibleBooks.map((book) => {
    let chapterCount = 0;
    const stack = [book.id];
    const seen = new Set<string>([book.id]);
    while (stack.length > 0) {
      const pid = stack.pop() as string;
      for (const row of all) {
        if (row.parentId !== pid || seen.has(row.id)) continue;
        seen.add(row.id);
        if (canViewDoc(row, member) && row.id !== book.id) chapterCount += 1;
        stack.push(row.id);
      }
    }
    return { ...book, chapterCount };
  });
}

// 一本书的完整目录树(从书根向下,递归可见子节点)。
export async function bookTree(book: DocRow, member: MemberIdentity | null): Promise<DocNode[]> {
  const rows = await listAllDocs();
  const tree = buildDocTree(rows, member);
  const findNode = (nodes: DocNode[], id: string): DocNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const hit = findNode(node.children, id);
      if (hit) return hit;
    }
    return null;
  };
  const root = findNode(tree, book.id);
  return root ? root.children : [];
}

// 按「书 slug + 书内章节 slug 路径」解析。第一段定位书根(is_book=1 且 slug 匹配),
// 其余段在该书子树内逐段解析。fail-closed:书不可见/任一段不存在都返回 null。
export async function findInBook(slugs: string[], member: MemberIdentity | null): Promise<{ book: DocRow; doc: DocRow } | null> {
  if (slugs.length === 0) return null;
  const bookRow: DocRow | null = await database().prepare(
    `SELECT ${DOC_COLUMNS} FROM docs WHERE slug = ? AND is_book = 1 LIMIT 1`,
  ).bind(slugs[0]).first<DocRow>();
  if (!bookRow || !canViewDoc(bookRow, member)) return null;
  if (slugs.length === 1) return { book: bookRow, doc: bookRow };
  let parentId = bookRow.id;
  let current: DocRow | null = null;
  for (const slug of slugs.slice(1)) {
    const row: DocRow | null = await database().prepare(
      `SELECT ${DOC_COLUMNS} FROM docs WHERE slug = ? AND parent_id = ? LIMIT 1`,
    ).bind(slug, parentId).first<DocRow>();
    if (!row || !canViewDoc(row, member)) return null;
    current = row;
    parentId = row.id;
  }
  return current ? { book: bookRow, doc: current } : null;
}

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,80}$/;

export function normalizeSlug(input: string): string {
  const slug = input.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return SLUG_PATTERN.test(slug) ? slug : "";
}

export function normalizeVisibility(input: string): DocVisibility {
  return input === "public" || input === "members" || input === "private" ? input : "private";
}
