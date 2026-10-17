import { requireAdmin } from "../../../_lib/access-control";
import { getAdminMemberDetail } from "../../../_lib/admin-members";
import { jsonError } from "../../../_lib/community";
import { accessError } from "../../../_lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const email = (new URL(request.url).searchParams.get("email") ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw accessError("invalid_member_email", 400);
    }
    return Response.json(await getAdminMemberDetail(email));
  } catch (error) {
    return jsonError(error);
  }
}
