import { requireAdmin } from "../../../_lib/access-control";
import { database, jsonError } from "../../../_lib/community";
import { accessError } from "../../../_lib/errors";

export const dynamic = "force-dynamic";

function decodeCursor(cursor: string) {
  const separator = cursor.indexOf("|");
  if (separator < 1) throw accessError("invalid_cursor", 400);
  try {
    const updatedAt = decodeURIComponent(cursor.slice(0, separator));
    const email = decodeURIComponent(cursor.slice(separator + 1));
    if (!updatedAt || !email || !email.includes("@")) throw new Error("invalid");
    return { updatedAt, email };
  } catch {
    throw accessError("invalid_cursor", 400);
  }
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams;
    const cursorValue = params.get("cursor") ?? "";
    if (cursorValue.length > 700) throw accessError("invalid_cursor", 400);
    const cursor = cursorValue ? decodeCursor(cursorValue) : null;
    const conditions = ["w.status = 'review'"];
    const bindings: string[] = [];
    if (cursor) {
      conditions.push("(w.updated_at > ? OR (w.updated_at = ? AND w.user_email > ?))");
      bindings.push(cursor.updatedAt, cursor.updatedAt, cursor.email);
    }
    const result = await database().prepare(
      `SELECT w.user_email AS email, m.display_name AS displayName, m.member_number AS memberNumber,
              w.balance, w.pending_balance AS pendingBalance, w.status, w.updated_at AS reviewSince
       FROM wallets w JOIN members m ON m.email = w.user_email
       WHERE ${conditions.join(" AND ")}
       ORDER BY w.updated_at ASC, w.user_email ASC LIMIT 51`,
    ).bind(...bindings).all();
    const rows = result.results ?? [];
    const hasMore = rows.length > 50;
    const page = rows.slice(0, 50);
    const last = page[page.length - 1] as { reviewSince?: string; email?: string } | undefined;
    return Response.json({
      wallets: page,
      // wallets has no dedicated status-entered timestamp; updated_at is the latest state update.
      nextCursor: hasMore && last?.reviewSince && last.email
        ? `${encodeURIComponent(last.reviewSince)}|${encodeURIComponent(last.email)}`
        : null,
      reviewTimeField: "wallets.updated_at",
    });
  } catch (error) {
    return jsonError(error);
  }
}
