import { requireAdmin } from "../../_lib/access-control";
import { database, jsonError } from "../../_lib/community";
import { accessError } from "../../_lib/errors";

export const dynamic = "force-dynamic";

function decodeCursor(cursor: string) {
  const parts = cursor.split("|");
  if (parts.length !== 3 || !parts[0] || !["admin", "mcp"].includes(parts[1]) || !parts[2]) {
    throw accessError("invalid_cursor", 400);
  }
  return { createdAt: parts[0], source: parts[1], id: parts[2] };
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams;
    const source = params.get("source");
    if (source && source !== "admin" && source !== "mcp") throw accessError("invalid_audit_source", 400);
    const action = (params.get("action") ?? "").trim().slice(0, 100);
    const cursorValue = params.get("cursor") ?? "";
    if (cursorValue.length > 700) throw accessError("invalid_cursor", 400);
    const cursor = cursorValue ? decodeCursor(cursorValue) : null;
    const db = database();
    const filters: string[] = [];
    const bindings: string[] = [];
    if (source) {
      filters.push("source = ?");
      bindings.push(source);
    }
    if (action) {
      filters.push("action = ?");
      bindings.push(action);
    }
    if (cursor) {
      filters.push("(createdAt < ? OR (createdAt = ? AND (source > ? OR (source = ? AND id < ?))))");
      bindings.push(cursor.createdAt, cursor.createdAt, cursor.source, cursor.source, cursor.id);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const result = await db.prepare(
      `SELECT * FROM (
        SELECT id, 'admin' AS source, actor_email AS actorEmail, action,
               target_type AS targetType, target_ref AS targetRef, detail, created_at AS createdAt,
               NULL AS credentialKind, NULL AS credentialId, NULL AS result, NULL AS productId
        FROM admin_audit_events
        UNION ALL
        SELECT id, 'mcp' AS source, member_email AS actorEmail, tool_name AS action,
               'mcp_tool' AS targetType, COALESCE(CAST(product_id AS TEXT), credential_id) AS targetRef,
               result AS detail, created_at AS createdAt, credential_kind AS credentialKind,
               credential_id AS credentialId, result, product_id AS productId
        FROM mcp_write_audit
      ) events ${where}
       ORDER BY createdAt DESC, source ASC, id DESC LIMIT 51`,
    ).bind(...bindings).all<Record<string, unknown>>();
    const rows = result.results ?? [];
    const hasMore = rows.length > 50;
    const page = rows.slice(0, 50);
    const last = page[page.length - 1] as { createdAt?: string; source?: string; id?: string } | undefined;
    return Response.json({
      events: page,
      nextCursor: hasMore && last?.createdAt && last.source && last.id
        ? `${last.createdAt}|${last.source}|${last.id}`
        : null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
