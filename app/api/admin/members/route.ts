import { requireAdmin } from "../../_lib/access-control";
import { changeMemberSuspension, listAdminMembers } from "../../_lib/admin-members";
import { jsonError } from "../../_lib/community";
import { accessError } from "../../_lib/errors";
import { assertSameOrigin } from "../../_lib/request-origin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams;
    const filter = params.get("filter") ?? "all";
    if (filter !== "all" && filter !== "suspended") throw accessError("invalid_member_filter", 400);
    const q = (params.get("q") ?? "").trim().slice(0, 120);
    const cursor = params.get("cursor") ?? "";
    if (cursor.length > 500) throw accessError("invalid_cursor", 400);
    return Response.json(await listAdminMembers({ q, cursor, filter }));
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
    const action = input.action;
    const email = typeof input.email === "string" ? input.email : "";
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (action !== "suspend" && action !== "unsuspend") throw accessError("invalid_member_action", 400);
    if (reason.length < 4) throw accessError("invalid_admin_reason", 400);
    return Response.json(await changeMemberSuspension(admin, action, email, reason));
  } catch (error) {
    return jsonError(error);
  }
}
