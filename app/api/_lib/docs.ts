import sanitizeHtml from "sanitize-html";
import { cache } from "react";
import { renderMarkdownKatexHtml } from "@/app/lib/markdown-katex";
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
  bannerImage: string;
  createdAt: string;
  updatedAt: string;
};

export type DocNode = DocRow & { children: DocNode[] };

export const DOC_COLUMNS = `id, slug, parent_id AS parentId, title, body_md AS bodyMd,
  visibility, author_email AS authorEmail, sort_order AS sortOrder,
  is_book AS isBook, cover_hue AS coverHue, summary, cover_image AS coverImage, banner_image AS bannerImage,
  created_at AS createdAt, updated_at AS updatedAt`;

// ---- Markdown -> 安全 HTML 的核心管线(marked + KaTeX 扩展 + sanitize 白名单)已抽到
// @/app/lib/markdown-katex.ts(零 cloudflare import),与问 AI 面板的客户端渲染共用一份
// 白名单。本文件只保留书籍正文特有的预处理(MkDocs 图标宏/链接重写/admonition/mermaid)。

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

// ---- MkDocs 搬运内容的兼容预处理 ----
// 该书源文件是从 MkDocs Material 项目直接搬来的,带两种造场不支持的标记:
//  1) `:material-*:` 图标短码(marked 不认识,原样输出成裸文本)。
//  2) `.md` 相对文件链接(MkDocs 源文件路径,造场路由是 /bookshelf/<book>/<...slug>,点不动)。
// 处理策略:
//  - 图标宏:删掉宏文本、只留后面的文字(用户选定:不引入图标,保持 quiet 版式)。对所有文档
//    安全——`:material-xxx:` 形式在非 MkDocs 内容里不该出现,不误伤正常文本。
//  - .md 链接:需要书上下文(章节 slug → 书内完整路径),仅书架页通过 bookCtx 传入时重写;
//    无 bookCtx(独立文档页/创作台预览)不重写、保持原样,行为不变。
// 图标宏:形如 :material-book-arrow-right: / :fontawesome-*: 等,前后允许空格。
const MKDOCS_ICON_MACRO = /:(?:material|fontawesome|octicons|simple-icons|ion|feather)-[a-z0-9-]+:/g;

// 书籍上下文:把 .md 相对链接重写成造场书架路由。pathByLeafSlug 由调用方从目录树构建,
// 键是章节叶子 slug(如 "01-why-token"),值是书内完整路径(如 "part-1/01-why-token")。
export type BookLinkContext = {
  bookSlug: string;
  // 章节叶子 slug -> 书内路径(不含 /bookshelf/<book> 前缀)
  pathByLeafSlug: ReadonlyMap<string, string>;
};

// 把 MkDocs 源里的 .md 相对链接重写成造场路由。仅处理能唯一映射的目标:
//   NN-slug.md / chapters/NN-slug.md  → /bookshelf/<book>/<path-of-NN-slug>
//   preface.md                        → /bookshelf/<book>/preface(若存在)
//   ../index.md 或 index.md           → /bookshelf/<book>(封面)
// 映射不到的(外部 .md、锚点等)保持原样,不猜。
function rewriteBookLinks(md: string, ctx: BookLinkContext): string {
  const base = `/bookshelf/${encodeURIComponent(ctx.bookSlug)}`;
  // 匹配 markdown 链接目标:](xxx.md) 或 ](xxx.md#anchor),允许 ./ ../ chapters/ 前缀。
  return md.replace(/\]\((\.\.\/|\.\/)?(?:chapters\/)?([a-z0-9][a-z0-9-]*)\.md(#[^)\s]*)?\)/gi,
    (all, _prefix: string, stem: string, anchor: string | undefined) => {
      const leaf = stem.toLowerCase();
      // index → 封面
      if (leaf === "index") return `](${base})`;
      const path = ctx.pathByLeafSlug.get(leaf);
      if (!path) return all; // 映射不到,保持原样
      return `](${base}/${path.split("/").map(encodeURIComponent).join("/")}${anchor ?? ""})`;
    });
}

// MkDocs admonition 提示框:`!!! type "标题"` + 后续 4 空格(或 Tab)缩进的内容行。
// marked 不认识,会把 `!!!` 裸露成文本、把内容塞进同一 <p>。这里在解析前改写成标准
// markdown blockquote(书的提示框版式),标题加粗作首行,缩进内容逐行转为引用行。
// 内容行可能含 **/code 等内联 markdown,逐行加 `> ` 前缀后由 marked 正常解析。
// 仅匹配已知类型(info/warning/note/tip/danger/...),避免误伤正文里以 !!! 开头的普通强调。
const ADMONITION_TYPES = "(?:note|info|tip|hint|important|warning|caution|danger|error|success|question|quote|example|abstract)";
const ADMONITION_RE = new RegExp(
  "^!!! ?" + ADMONITION_TYPES + "[ \\t]+[\"']([^\"']*)[\"'][ \\t]*\\r?\\n((?:[ \\t]{4}[^\\n]*\\r?\\n?)+)",
  "gm",
);
function convertAdmonitions(md: string): string {
  return md.replace(ADMONITION_RE, (_all, title: string, body: string) => {
    const lines = body.split(/\r?\n/)
      .map((line) => line.replace(/^[ \t]{4}/, "")) // 去 4 空格缩进
      .filter((line) => line.trim().length > 0);
    const quoted = lines.map((line) => `> ${line}`).join("\n");
    return `> **${title}**\n>\n${quoted}\n`;
  });
}

export function renderDocHtml(bodyMd: string, bookCtx?: BookLinkContext): string {
  // 1) 删 MkDocs 图标宏(留文字)。
  let pre = bodyMd.replace(MKDOCS_ICON_MACRO, "");
  // 2) 书内 .md 链接重写(仅书架页传入 bookCtx 时)。
  if (bookCtx) pre = rewriteBookLinks(pre, bookCtx);
  // 3) MkDocs admonition(!!! type "标题" + 缩进内容)→ blockquote。
  pre = convertAdmonitions(pre);
  const { md, blocks } = extractMermaid(pre);
  // 4) 核心管线(strong-emphasis 闭合修复 + marked + KaTeX + sanitize 白名单)在
  //    @/app/lib/markdown-katex.ts,与问 AI 面板客户端渲染共用一份。
  let clean = renderMarkdownKatexHtml(md);
  // 回填 mermaid 块为 <pre class="mermaid">(内容仅文本,不含可执行标签)。
  clean = clean.replace(new RegExp(`<p>${MERMAID_PLACEHOLDER}(\\d+)</p>`, "g"), (_all, idx: string) => {
    const code = blocks[Number(idx)] ?? "";
    return `<pre class="mermaid">${sanitizeHtml(code, { allowedTags: [], allowedAttributes: {} })}</pre>`;
  });
  return clean;
}

// 性能:本文件的所有"读整表"型查询(书架/章节/目录/面包屑)都收敛到这一个
// per-request 缓存的 listAllDocs 上(React cache:同一请求内——含 generateMetadata
// 与页面组件的重复调用——只查一次 D1;docs 表 112 行/285KB,单查询取回远比
// 逐段/逐父级的串行小查询快:D1 与 Worker 可能跨洋,每次往返边际成本 ~百毫秒级)。
export const listAllDocs = cache(async (): Promise<DocRow[]> => {
  const result = await database().prepare(
    `SELECT ${DOC_COLUMNS} FROM docs ORDER BY sort_order ASC, created_at ASC, id ASC`,
  ).all<DocRow>();
  return result.results;
});

// /docs 文档目录专用:只返回独立文档(is_book=0),剔除所有书根(is_book=1)
// 及其整棵章节子树。一个节点若其祖先链(含自身)任一是书根,即属书子树——
// 它只该从书架进入,不在文档目录重复出现。整体剔除(而非只去掉书根那一行),
// 否则书的章节会因父级缺失被 buildDocTree 提升为文档目录的根条目。
export async function listStandaloneDocs(): Promise<DocRow[]> {
  const all = await listAllDocs();
  const bookIds = new Set(all.filter((row) => row.isBook === 1).map((row) => row.id));
  if (bookIds.size === 0) return all;
  const byId = new Map(all.map((row) => [row.id, row] as const));
  const inBookSubtree = (row: DocRow): boolean => {
    let cursor: DocRow | undefined = row;
    const seen = new Set<string>();
    while (cursor) {
      if (seen.has(cursor.id)) break; // 防御环(脏数据)
      seen.add(cursor.id);
      if (bookIds.has(cursor.id)) return true;
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return false;
  };
  return all.filter((row) => !inBookSubtree(row));
}

// 判断路径第一段是否对应一本对当前访问者可见的书根(is_book=1)。用于把旧的
// /docs/<book>/... URL 永久重定向到 /bookshelf/<book>/...。fail-closed:
// 书不存在或不可见(members/private 且未登录)返回 null,由调用方走 404,
// 不借重定向泄露书的存在性。
export async function resolveBookRootSlug(rootSlug: string, member: MemberIdentity | null): Promise<DocRow | null> {
  const row = await database().prepare(
    `SELECT ${DOC_COLUMNS} FROM docs WHERE slug = ? AND parent_id IS NULL LIMIT 1`,
  ).bind(rootSlug).first<DocRow>();
  if (!row || row.isBook !== 1 || !canViewDoc(row, member)) return null;
  return row;
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

// 面包屑:从当前文档一路向父级回溯到根。改为从 per-request 的 listAllDocs 内存
// 查表(等价:parent 命中按主键 id 最多一行,与原 WHERE id=? 相同),消除逐父级
// 串行 D1 往返——章节深度 N 原来 = N 次跨洋查询,现在 0 次。
export const docBreadcrumbs = cache(async (doc: DocRow, member: MemberIdentity | null): Promise<DocRow[]> => {
  const byId = new Map((await listAllDocs()).map((row) => [row.id, row] as const));
  const chain: DocRow[] = [];
  let cursor: DocRow | null = doc;
  const seen = new Set<string>();
  while (cursor) {
    if (seen.has(cursor.id)) break; // 防御环(脏数据)
    seen.add(cursor.id);
    chain.unshift(cursor);
    if (!cursor.parentId) break;
    const parent: DocRow | null = byId.get(cursor.parentId) ?? null;
    cursor = parent && canViewDoc(parent, member) ? parent : null;
  }
  return chain;
});

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

// per-request 缓存:generateMetadata 与页面组件都会调 currentMember(各触发一次
// 会话→成员 D1 查询);cache() 让同一请求内只查一次。请求间互不影响(语义不变)。
export const currentMember = cache(async (): Promise<MemberIdentity | null> => optionalMember());

// ---- 阅读进度(每用户每书一条恢复点:章节 + 段落序号)。----

// 取某用户在某书的"继续阅读"点:上次的章节标题 + URL 路径 + 段落序号。
// 进度指向书根本身(封面页)或章节已不可见/已删除 → 返回 null(fail-closed,不暴露)。
export const getBookContinueReading = cache(async (
  member: MemberIdentity,
  book: DocRow,
): Promise<{ chapterId: string; title: string; href: string; paragraph: number } | null> => {
  const row = await database().prepare(
    "SELECT last_chapter_id AS lastChapterId, last_paragraph AS lastParagraph FROM reading_progress WHERE user_email = ? AND book_id = ?",
  ).bind(member.email, book.id).first<{ lastChapterId: string; lastParagraph: number }>();
  if (!row || row.lastChapterId === book.id) return null;
  // 章节行从 per-request 的 listAllDocs 查表(页面渲染本来就会取它),免一次串行往返。
  const chapter = (await listAllDocs()).find((r) => r.id === row.lastChapterId) ?? null;
  if (!chapter || !canViewDoc(chapter, member)) return null;
  const crumbs = await docBreadcrumbs(chapter, member);
  // crumbs[0] 是书根;书内章节路径取 slice(1) 的 slug 链。
  const chapterPath = crumbs.slice(1).map((c) => encodeURIComponent(c.slug)).join("/");
  if (!chapterPath) return null;
  return { chapterId: chapter.id, title: chapter.title, href: `/bookshelf/${encodeURIComponent(book.slug)}/${chapterPath}`, paragraph: row.lastParagraph };
});

// 取某用户在某书"当前章节"的段落恢复点:仅当进度恰好指向 chapterId 时返回段落序号,
// 否则 null(用户主动导航到别处,不强行 scroll)。
export async function getChapterParagraph(
  member: MemberIdentity,
  bookId: string,
  chapterId: string,
): Promise<number | null> {
  const row = await database().prepare(
    "SELECT last_paragraph AS lastParagraph FROM reading_progress WHERE user_email = ? AND book_id = ? AND last_chapter_id = ?",
  ).bind(member.email, bookId, chapterId).first<{ lastParagraph: number }>();
  return row?.lastParagraph ?? null;
}

// 批量取当前用户在所有书的"继续阅读"点(书架首页用)。返回 bookId → 点 的映射。
// 排除进度指向书根本身的(停在封面页 = 无有效章节恢复点)。章节已删除/不可见 → 不含。
export async function listReadingProgressForBooks(
  member: MemberIdentity,
): Promise<Map<string, { chapterId: string; title: string; href: string; paragraph: number }>> {
  const db = database();
  const rows = (
    await db
      .prepare(
        `SELECT rp.book_id AS bookId, rp.last_chapter_id AS lastChapterId, rp.last_paragraph AS lastParagraph,
                b.slug AS bookSlug, c.title AS chapterTitle
         FROM reading_progress rp
         JOIN docs b ON b.id = rp.book_id
         JOIN docs c ON c.id = rp.last_chapter_id
         WHERE rp.user_email = ? AND rp.last_chapter_id <> rp.book_id`,
      )
      .bind(member.email)
      .all<{ bookId: string; lastChapterId: string; lastParagraph: number; bookSlug: string; chapterTitle: string }>()
  ).results;
  const all = await listAllDocs();
  const byId = new Map(all.map((r) => [r.id, r] as const));
  const result = new Map<string, { chapterId: string; title: string; href: string; paragraph: number }>();
  for (const r of rows) {
    const chapter = byId.get(r.lastChapterId);
    if (!chapter || !canViewDoc(chapter, member)) continue;
    const crumbs = await docBreadcrumbs(chapter, member);
    const chapterPath = crumbs.slice(1).map((c) => encodeURIComponent(c.slug)).join("/");
    if (!chapterPath) continue;
    result.set(r.bookId, { chapterId: chapter.id, title: r.chapterTitle, href: `/bookshelf/${encodeURIComponent(r.bookSlug)}/${chapterPath}`, paragraph: r.lastParagraph });
  }
  return result;
}

// 最近阅读列表(studio "最近阅读"用):当前用户所有有进度的书,按 updated_at 倒序。
// 每条含书的展示信息 + 上次章节标题 + 可直接续读的 href(一步到章节,非两步经封面)。
// 章节已删除/停在封面/章节不可见 → href 退化为书封面页,chapterTitle 退化为"封面"。
// 不从结果里删除这些条目:用户打开过封面也算"最近阅读",只是续读入口弱化。
export async function listRecentReading(
  member: MemberIdentity,
): Promise<
  Array<{
    bookId: string;
    bookSlug: string;
    bookTitle: string;
    coverHue: number;
    coverImage: string;
    visibility: DocVisibility;
    summary: string;
    chapterId: string;
    chapterTitle: string;
    href: string;
    updatedAt: string;
  }>
> {
  const db = database();
  const rows = (
    await db
      .prepare(
        `SELECT rp.book_id AS bookId, rp.last_chapter_id AS lastChapterId,
                rp.updated_at AS updatedAt,
                b.slug AS bookSlug, b.title AS bookTitle,
                b.cover_hue AS coverHue, b.cover_image AS coverImage,
                b.visibility, b.summary,
                c.title AS chapterTitle
         FROM reading_progress rp
         JOIN docs b ON b.id = rp.book_id
         LEFT JOIN docs c ON c.id = rp.last_chapter_id
         WHERE rp.user_email = ?
         ORDER BY rp.updated_at DESC`,
      )
      .bind(member.email)
      .all<{
        bookId: string;
        lastChapterId: string;
        updatedAt: string;
        bookSlug: string;
        bookTitle: string;
        coverHue: number;
        coverImage: string;
        visibility: DocVisibility;
        summary: string;
        chapterTitle: string | null;
      }>()
  ).results;
  const all = await listAllDocs();
  const byId = new Map(all.map((r) => [r.id, r] as const));
  const result: Array<{
    bookId: string;
    bookSlug: string;
    bookTitle: string;
    coverHue: number;
    coverImage: string;
    visibility: DocVisibility;
    summary: string;
    chapterId: string;
    chapterTitle: string;
    href: string;
    updatedAt: string;
  }> = [];
  for (const r of rows) {
    let href = `/bookshelf/${encodeURIComponent(r.bookSlug)}`;
    let chapterTitle = r.chapterTitle ?? "封面";
    const chapter = byId.get(r.lastChapterId);
    if (chapter && r.lastChapterId !== r.bookId && canViewDoc(chapter, member)) {
      const crumbs = await docBreadcrumbs(chapter, member);
      const chapterPath = crumbs.slice(1).map((c) => encodeURIComponent(c.slug)).join("/");
      if (chapterPath) href = `/bookshelf/${encodeURIComponent(r.bookSlug)}/${chapterPath}`;
    } else {
      chapterTitle = "封面";
    }
    result.push({
      bookId: r.bookId,
      bookSlug: r.bookSlug,
      bookTitle: r.bookTitle,
      coverHue: r.coverHue,
      coverImage: r.coverImage,
      visibility: r.visibility,
      summary: r.summary,
      chapterId: r.lastChapterId,
      chapterTitle,
      href,
      updatedAt: r.updatedAt,
    });
  }
  return result;
}

// ---- 书架:一本书 = 一棵以 is_book=1 行为根的文档树。----

export type BookSummary = DocRow & { chapterCount: number };

// 列出所有对当前访问者可见的书(书架卡片)。章节数只统计可见后代。
// 书根与章节统计共用同一次 listAllDocs(per-request 缓存),替代原来的
// "书根一次查询 + 全表一次查询"两条串行往返;排序与原查询一致
// (sort_order, created_at, id)。
export async function listBooks(member: MemberIdentity | null): Promise<BookSummary[]> {
  const all = await listAllDocs();
  const visibleBooks = all.filter((row) => row.isBook === 1 && canViewDoc(row, member));
  // 每本书统计可见章节数(后代中非书自身的可见节点)。
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
// 改为在 per-request 的 listAllDocs 上内存解析:原实现是"书根 1 查询 + 每段 1 查询"
// 的串行往返(章节深度 N = N+1 次 D1 往返,跨洋时每次 ~百毫秒)。语义等价:
// 段内 (parent_id, slug) 有 UNIQUE 索引保证至多一行,与原 WHERE slug=? AND parent_id=?
// 相同;书根若理论上出现同名多本,取排序靠前的第一本(原 LIMIT 1 无排序,本就未定义)。
export const findInBook = cache(async (
  slugs: string[],
  member: MemberIdentity | null,
): Promise<{ book: DocRow; doc: DocRow } | null> => {
  if (slugs.length === 0) return null;
  const all = await listAllDocs();
  const bookRow = all.find((row) => row.isBook === 1 && row.slug === slugs[0]) ?? null;
  if (!bookRow || !canViewDoc(bookRow, member)) return null;
  if (slugs.length === 1) return { book: bookRow, doc: bookRow };
  let current = bookRow;
  for (const slug of slugs.slice(1)) {
    const next = all.find((row) => row.parentId === current.id && row.slug === slug) ?? null;
    if (!next || !canViewDoc(next, member)) return null;
    current = next;
  }
  return { book: bookRow, doc: current };
});

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,80}$/;

export function normalizeSlug(input: string): string {
  const slug = input.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return SLUG_PATTERN.test(slug) ? slug : "";
}

export function normalizeVisibility(input: string): DocVisibility {
  return input === "public" || input === "members" || input === "private" ? input : "private";
}
