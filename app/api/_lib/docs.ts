import { marked } from "marked";
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
  createdAt: string;
  updatedAt: string;
};

export type DocNode = DocRow & { children: DocNode[] };

const DOC_COLUMNS = `id, slug, parent_id AS parentId, title, body_md AS bodyMd,
  visibility, author_email AS authorEmail, sort_order AS sortOrder,
  created_at AS createdAt, updated_at AS updatedAt`;

// Markdown -> 安全 HTML。安全红线:禁行内原始 HTML,只允许白名单标签/属性。
// marked 不执行 HTML,sanitize-html 再做一次白名单消毒,双重防线(fail-closed)。
export function renderDocHtml(bodyMd: string): string {
  const raw = marked.parse(bodyMd, { async: false }) as string;
  return sanitizeHtml(raw, {
    allowedTags: [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "a", "ul", "ol", "li", "blockquote", "pre", "code",
      "strong", "em", "del", "hr", "br",
      "table", "thead", "tbody", "tr", "th", "td",
      "img",
    ],
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt", "title"],
      code: ["class"],
      th: ["align"],
      td: ["align"],
    },
    allowedSchemes: ["https", "http", "mailto"],
    // 禁止 data: 协议与 javascript:,防 XSS。
    allowProtocolRelative: false,
  });
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
  const visible = rows.filter((row) => canViewDoc(row, member));
  const nodes = new Map<string, DocNode>();
  for (const row of visible) nodes.set(row.id, { ...row, children: [] });
  const roots: DocNode[] = [];
  for (const node of nodes.values()) {
    // 父级不可见或不存在时,把节点提升到根,避免整枝消失。
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
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

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,80}$/;

export function normalizeSlug(input: string): string {
  const slug = input.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return SLUG_PATTERN.test(slug) ? slug : "";
}

export function normalizeVisibility(input: string): DocVisibility {
  return input === "public" || input === "members" || input === "private" ? input : "private";
}
