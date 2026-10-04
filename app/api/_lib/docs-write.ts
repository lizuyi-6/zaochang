// 文档写侧(create/update/delete)独立模块(2026-10 审计重构 #11):读侧(渲染/树/
// 可见性/缓存)留在 docs.ts,写侧的校验、防环与 UPSERT 语义原样迁入。错误码
// (slug_taken/doc_cycle/parent_not_found...)与行为逐字不变。
import { UPLOAD_KEY_URL_PATTERN } from "./upload-core";
import { isUniqueConstraintError } from "./errors";
import { database } from "./community";
import type { MemberIdentity } from "./community";
import { invalidateDocDataCache, normalizeSlug, normalizeVisibility } from "./docs";

// M3(2026-10 审计):文档封面/横幅图片 URL 白名单——只允许站内上传键(经扫描管道)
// 或既定的产品配图域。任意外链会把读者 IP/Referer 泄露给外站(agent 也能写入)。
export function validDocImageUrl(value: string): boolean {
  if (!value) return true;
  return UPLOAD_KEY_URL_PATTERN.test(value)
    || value.startsWith("https://images.unsplash.com/");
}

export async function createDoc(editor: MemberIdentity, input: Record<string, unknown>): Promise<Response> {
  const title = String(input.title ?? "").trim().slice(0, 120);

  const slug = normalizeSlug(String(input.slug ?? title));
  const visibility = normalizeVisibility(String(input.visibility ?? "private"));
  const parentId = input.parentId ? String(input.parentId) : null;
  const bodyMd = String(input.bodyMd ?? "").slice(0, 200_000);
  // 严格布尔:truthiness 会把字符串 "false" 变成 1(错误建书);与 PATCH 对齐。
  const isBook = input.isBook === true ? 1 : 0;
  const coverHue = Math.max(0, Math.min(360, Math.floor(Number(input.coverHue)) || 0));
  const summary = String(input.summary ?? "").trim().slice(0, 240);
  const coverImage = String(input.coverImage ?? "").trim().slice(0, 400);
  const bannerImage = String(input.bannerImage ?? "").trim().slice(0, 400);
  if (!validDocImageUrl(coverImage) || !validDocImageUrl(bannerImage)) {
    return Response.json({ error: "invalid_doc_image" }, { status: 400 });
  }
  if (title.length < 1 || !slug) {
    return Response.json({ error: "invalid_doc" }, { status: 400 });
  }
  if (parentId) {
    const parent = await database().prepare(`SELECT id FROM docs WHERE id = ?`).bind(parentId).first();
    if (!parent) return Response.json({ error: "parent_not_found" }, { status: 404 });
  }
  const id = `doc:${crypto.randomUUID()}`;
  try {
    await database().prepare(
      `INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, is_book, cover_hue, summary, cover_image, banner_image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, slug, parentId, title, bodyMd, visibility, editor.email, isBook, coverHue, summary, coverImage, bannerImage).run();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return Response.json({ error: "slug_taken" }, { status: 409 });
    }
    throw error;
  }
  // 写入成功后失效本 isolate 的文档数据缓存(其他 isolate 最多滞后 TTL 秒)。
  invalidateDocDataCache();
  return Response.json({ doc: { id, slug, parentId, title, visibility } }, { status: 201 });
}

export async function updateDoc(input: Record<string, unknown>): Promise<Response> {
  const id = String(input.id ?? "").slice(0, 80);
  if (!id) return Response.json({ error: "invalid_doc" }, { status: 400 });
  const existing = await database().prepare(`SELECT id FROM docs WHERE id = ?`).bind(id).first<{ id: string }>();
  if (!existing) return Response.json({ error: "doc_not_found" }, { status: 404 });

  const title = input.title !== undefined ? String(input.title).trim().slice(0, 120) : undefined;
  const slug = input.slug !== undefined ? normalizeSlug(String(input.slug)) : undefined;
  const visibility = input.visibility !== undefined ? normalizeVisibility(String(input.visibility)) : undefined;
  const bodyMd = input.bodyMd !== undefined ? String(input.bodyMd).slice(0, 200_000) : undefined;
  const parentId = input.parentId !== undefined ? (input.parentId ? String(input.parentId) : null) : undefined;

  if (parentId !== undefined && parentId !== null) {
    if (parentId === id) return Response.json({ error: "doc_cycle" }, { status: 409 });
    // 父级必须真实存在:不存在的 parentId 会让防环游标立即断链、通过校验,
    // 写入后 buildDocTree 把孤儿"提升到根",过期标签页即可静默重构公开文档树。
    const parentExists = await database().prepare(`SELECT id FROM docs WHERE id = ?`).bind(parentId).first();
    if (!parentExists) return Response.json({ error: "parent_not_found" }, { status: 404 });
    // 防环:新父级不能是自己的后代。
    let cursor: string | null = parentId;
    const seen = new Set<string>([id]);
    while (cursor) {
      if (seen.has(cursor)) return Response.json({ error: "doc_cycle" }, { status: 409 });
      seen.add(cursor);
      const node: { parentId: string | null } | null = await database().prepare(`SELECT parent_id AS parentId FROM docs WHERE id = ?`).bind(cursor).first<{ parentId: string | null }>();
      cursor = node?.parentId ?? null;
    }
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  if (title !== undefined) { sets.push("title = ?"); values.push(title); }
  if (slug !== undefined) {
    if (!slug) return Response.json({ error: "invalid_doc" }, { status: 400 });
    sets.push("slug = ?"); values.push(slug);
  }
  if (visibility !== undefined) { sets.push("visibility = ?"); values.push(visibility); }
  if (bodyMd !== undefined) { sets.push("body_md = ?"); values.push(bodyMd); }
  if (parentId !== undefined) { sets.push("parent_id = ?"); values.push(parentId); }
  if (input.sortOrder !== undefined) { sets.push("sort_order = ?"); values.push(Math.floor(Number(input.sortOrder)) || 0); }
  if (input.isBook !== undefined) { sets.push("is_book = ?"); values.push(input.isBook === true ? 1 : 0); }
  if (input.coverHue !== undefined) { sets.push("cover_hue = ?"); values.push(Math.max(0, Math.min(360, Math.floor(Number(input.coverHue)) || 0))); }
  if (input.summary !== undefined) { sets.push("summary = ?"); values.push(String(input.summary).trim().slice(0, 240)); }
  // M3(2026-10 审计):封面/横幅只允许站内上传键或白名单域,建书/改书同规。
  if (input.coverImage !== undefined) {
    const coverValue = String(input.coverImage).trim().slice(0, 400);
    if (!validDocImageUrl(coverValue)) return Response.json({ error: "invalid_doc_image" }, { status: 400 });
    sets.push("cover_image = ?"); values.push(coverValue);
  }
  if (input.bannerImage !== undefined) {
    const bannerValue = String(input.bannerImage).trim().slice(0, 400);
    if (!validDocImageUrl(bannerValue)) return Response.json({ error: "invalid_doc_image" }, { status: 400 });
    sets.push("banner_image = ?"); values.push(bannerValue);
  }
  if (sets.length === 0) return Response.json({ error: "nothing_to_update" }, { status: 400 });
  sets.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);
  try {
    await database().prepare(`UPDATE docs SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return Response.json({ error: "slug_taken" }, { status: 409 });
    }
    throw error;
  }
  // 写入成功后失效本 isolate 的文档数据缓存(其他 isolate 最多滞后 TTL 秒)。
  invalidateDocDataCache();
  return Response.json({ updated: true, id });
}

export async function deleteDoc(input: Record<string, unknown>): Promise<Response> {
  const id = String(input.id ?? "").slice(0, 80);
  if (!id) return Response.json({ error: "invalid_doc" }, { status: 400 });
  const child = await database().prepare(`SELECT id FROM docs WHERE parent_id = ? LIMIT 1`).bind(id).first();
  if (child) return Response.json({ error: "doc_has_children" }, { status: 409 });
  const result = await database().prepare(`DELETE FROM docs WHERE id = ?`).bind(id).run();
  if (result.meta.changes !== 1) return Response.json({ error: "doc_not_found" }, { status: 404 });
  // 写入成功后失效本 isolate 的文档数据缓存(其他 isolate 最多滞后 TTL 秒)。
  invalidateDocDataCache();
  return Response.json({ deleted: true, id });
}
