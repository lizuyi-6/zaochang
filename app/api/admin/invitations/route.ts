import { requireAdmin } from "../../_lib/access-control";
import { guardWrite } from "../../_lib/route-guards";
import { createInvitation, listInvitations, revokeInvitation } from "../../_lib/invitations";
import { jsonError } from "../../_lib/community";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    return await listInvitations();
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const guarded = await guardWrite(request, { member: "admin", sameOrigin: true });
    if (guarded instanceof Response) return guarded;
    const input = await request.json() as Record<string, unknown>;
    return await createInvitation(guarded.member, input);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const guarded = await guardWrite(request, { member: "admin", sameOrigin: true });
    if (guarded instanceof Response) return guarded;
    const input = await request.json() as Record<string, unknown>;
    return await revokeInvitation(guarded.member, input);
  } catch (error) {
    return jsonError(error);
  }
}
