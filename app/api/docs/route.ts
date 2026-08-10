import { requireFounder } from "../_lib/admin";
import { database, jsonError } from "../_lib/community";
import { DOC_COLUMNS, normalizeSlug, normalizeVisibility } from "../_lib/docs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireFounder();
    const rows = await database().prepare(
      `SELECT ${DOC_COLUMNS} FROM docs ORDER BY sort_order ASC, created_at ASC`,
    ).all();
    return Response.json({ docs: rows.results });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const founder = await requireFounder();
    const input = await request.json() as Record<string, unknown>;
    const title = String(input.title ?? "").trim().slice(0, 120);
    const slug = normalizeSlug(String(input.slug ?? title));
    const visibility = normalizeVisibility(String(input.visibility ?? "private"));
    const parentId = input.parentId ? String(input.parentId) : null;
    const bodyMd = String(input.bodyMd ?? "").slice(0, 200_000);
    const isBook = input.isBook ? 1 : 0;
    const coverHue = Math.max(0, Math.min(360, Math.floor(Number(input.coverHue)) || 0));
    const summary = String(input.summary ?? "").trim().slice(0, 240);
    const coverImage = String(input.coverImage ?? "").trim().slice(0, 400);
    const bannerImage = String(input.bannerImage ?? "").trim().slice(0, 400);
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
      ).bind(id, slug, parentId, title, bodyMd, visibility, founder.email, isBook, coverHue, summary, coverImage, bannerImage).run();
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        return Response.json({ error: "slug_taken" }, { status: 409 });
      }
      throw error;
    }
    return Response.json({ doc: { id, slug, parentId, title, visibility } }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireFounder();
    const input = await request.json() as Record<string, unknown>;
    const id = String(input.id ?? "").slice(0, 80);
    if (!id) return Response.json({ error: "invalid_doc" }, { status: 400 });
    const existing = await database().prepare(`SELECT ${DOC_COLUMNS} FROM docs WHERE id = ?`).bind(id).first<{ id: string; parentId: string | null }>();
    if (!existing) return Response.json({ error: "doc_not_found" }, { status: 404 });

    const title = input.title !== undefined ? String(input.title).trim().slice(0, 120) : undefined;
    const slug = input.slug !== undefined ? normalizeSlug(String(input.slug)) : undefined;
    const visibility = input.visibility !== undefined ? normalizeVisibility(String(input.visibility)) : undefined;
    const bodyMd = input.bodyMd !== undefined ? String(input.bodyMd).slice(0, 200_000) : undefined;
    const parentId = input.parentId !== undefined ? (input.parentId ? String(input.parentId) : null) : undefined;

    if (parentId !== undefined && parentId !== null) {
      if (parentId === id) return Response.json({ error: "doc_cycle" }, { status: 409 });
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
    if (input.isBook !== undefined) { sets.push("is_book = ?"); values.push(input.isBook ? 1 : 0); }
    if (input.coverHue !== undefined) { sets.push("cover_hue = ?"); values.push(Math.max(0, Math.min(360, Math.floor(Number(input.coverHue)) || 0))); }
    if (input.summary !== undefined) { sets.push("summary = ?"); values.push(String(input.summary).trim().slice(0, 240)); }
    if (input.coverImage !== undefined) { sets.push("cover_image = ?"); values.push(String(input.coverImage).trim().slice(0, 400)); }
    if (input.bannerImage !== undefined) { sets.push("banner_image = ?"); values.push(String(input.bannerImage).trim().slice(0, 400)); }
    if (sets.length === 0) return Response.json({ error: "nothing_to_update" }, { status: 400 });
    sets.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);
    try {
      await database().prepare(`UPDATE docs SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        return Response.json({ error: "slug_taken" }, { status: 409 });
      }
      throw error;
    }
    return Response.json({ updated: true, id });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireFounder();
    const input = await request.json() as Record<string, unknown>;
    const id = String(input.id ?? "").slice(0, 80);
    if (!id) return Response.json({ error: "invalid_doc" }, { status: 400 });
    const child = await database().prepare(`SELECT id FROM docs WHERE parent_id = ? LIMIT 1`).bind(id).first();
    if (child) return Response.json({ error: "doc_has_children" }, { status: 409 });
    const result = await database().prepare(`DELETE FROM docs WHERE id = ?`).bind(id).run();
    if (result.meta.changes !== 1) return Response.json({ error: "doc_not_found" }, { status: 404 });
    return Response.json({ deleted: true, id });
  } catch (error) {
    return jsonError(error);
  }
}
