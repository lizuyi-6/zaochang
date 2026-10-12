import { accessError, jsonError } from "../../../_lib/errors";
import { requireMember } from "../../../_lib/access-control";
import { guardWrite } from "../../../_lib/route-guards";
import { getHostingStatus, requestHostingRemoval } from "../../../_lib/hosting";

export const dynamic = "force-dynamic";

function parseId(raw: string): number {
  if (!/^[1-9][0-9]*$/.test(raw)) throw accessError("product_not_found", 404);
  const id = Number(raw);
  if (!Number.isSafeInteger(id)) throw accessError("product_not_found", 404);
  return id;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireMember();
    const { id } = await context.params;
    return Response.json(await getHostingStatus(member, parseId(id)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const guarded = await guardWrite(request, { member: "member", sameOrigin: true });
    if (guarded instanceof Response) return guarded;
    const { id } = await context.params;
    await requestHostingRemoval(guarded.member, parseId(id));
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
