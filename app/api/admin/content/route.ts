import { requireAdmin } from "../../_lib/access-control";
import { applyAdminContentAction } from "../../_lib/moderation";
import { database, jsonError } from "../../_lib/community";
import { accessError } from "../../_lib/errors";
import { assertSameOrigin } from "../../_lib/request-origin";

export const dynamic = "force-dynamic";
type ContentType = "product" | "post" | "comment";

function decodeCursor(cursor: string) {
  const separator = cursor.indexOf("|");
  if (separator < 1) throw accessError("invalid_cursor", 400);
  return { createdAt: cursor.slice(0, separator), id: Number(cursor.slice(separator + 1)) };
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams;
    const type = params.get("type") ?? "";
    if (!["product", "post", "comment"].includes(type)) throw accessError("invalid_content_type", 400);
    const q = (params.get("q") ?? "").trim().slice(0, 120);
    const cursorValue = params.get("cursor") ?? "";
    if (cursorValue.length > 700) throw accessError("invalid_cursor", 400);
    const cursor = cursorValue ? decodeCursor(cursorValue) : null;
    if (cursor && (!cursor.createdAt || !Number.isSafeInteger(cursor.id) || cursor.id < 1)) throw accessError("invalid_cursor", 400);

    const contentType = type as ContentType;
    const table = contentType === "product" ? "products" : contentType === "post" ? "posts" : "comments";
    const textColumn = contentType === "product" ? "description" : "content";
    const ownerColumn = contentType === "comment" ? "user_email" : "owner_email";
    const columns = contentType === "product"
      ? `id, owner_email AS ownerEmail, owner_name AS ownerName, title, description AS body,
         review_status AS reviewStatus, status AS contentStatus, moderation_status AS moderationStatus,
         created_at AS createdAt`
      : contentType === "post"
        ? `id, owner_email AS ownerEmail, owner_name AS ownerName, content AS body,
           post_type AS contentType, moderation_status AS moderationStatus, created_at AS createdAt`
        : `id, user_email AS ownerEmail, owner_name AS ownerName, content AS body,
           target_type AS targetType, target_ref AS targetRef, moderation_status AS moderationStatus,
           created_at AS createdAt`;
    const conditions: string[] = [];
    const bindings: string[] = [];
    if (q) {
      // instr 而非 LIKE:D1 的 LIKE 模式有长度上限(长邮箱/长标题即 500),且 % _ 会被当通配符。
      const extraColumns = contentType === "product"
        ? ["title", "owner_name"]
        : contentType === "comment" ? ["target_ref", "target_type"] : ["owner_name"];
      const columns = [textColumn, ownerColumn, ...extraColumns];
      const needle = q.toLowerCase();
      conditions.push(`(${columns.map((column) => `instr(lower(${column}), ?) > 0`).join(" OR ")})`);
      bindings.push(...columns.map(() => needle));
    }
    if (cursor) {
      conditions.push("(created_at < ? OR (created_at = ? AND id < ?))");
      bindings.push(cursor.createdAt, cursor.createdAt, String(cursor.id));
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await database().prepare(
      `SELECT ${columns} FROM ${table} ${where} ORDER BY created_at DESC, id DESC LIMIT 51`,
    ).bind(...bindings).all<Record<string, unknown>>();
    const rows = result.results ?? [];
    const hasMore = rows.length > 50;
    const page = rows.slice(0, 50);
    const last = page[page.length - 1] as { createdAt?: string; id?: number } | undefined;
    return Response.json({
      type: contentType,
      items: page,
      nextCursor: hasMore && last?.createdAt && last.id ? `${last.createdAt}|${last.id}` : null,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const input = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!input || typeof input !== "object" || Array.isArray(input)) throw accessError("invalid_request", 400);
    return await applyAdminContentAction(admin, input);
  } catch (error) {
    return jsonError(error);
  }
}
