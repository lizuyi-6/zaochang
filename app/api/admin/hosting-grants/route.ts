import { accessError, jsonError } from "../../_lib/errors";
import { requireAdmin } from "../../_lib/access-control";
import { guardWrite } from "../../_lib/route-guards";
import { listHostingGrants, revokeHostingGrant, upsertHostingGrant } from "../../_lib/hosting";

export const dynamic = "force-dynamic";

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    return value as Record<string, unknown>;
  } catch {
    throw accessError("invalid_hosting_grant", 400);
  }
}

export async function GET() {
  try {
    await requireAdmin();
    return Response.json({ grants: await listHostingGrants() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const guarded = await guardWrite(request, { member: "admin", sameOrigin: true });
    if (guarded instanceof Response) return guarded;
    const input = await readJson(request);
    const email = typeof input.email === "string" ? input.email : "";
    const maxSites = Number(input.maxSites);
    const note = typeof input.note === "string" ? input.note : "";
    const grant = await upsertHostingGrant(guarded.member, email, maxSites, note);
    return Response.json({ grant });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const guarded = await guardWrite(request, { member: "admin", sameOrigin: true });
    if (guarded instanceof Response) return guarded;
    const input = await readJson(request);
    const email = typeof input.email === "string" ? input.email : "";
    const result = await revokeHostingGrant(guarded.member, email);
    return Response.json({ ok: true, removedHostings: result.removedHostings });
  } catch (error) {
    return jsonError(error);
  }
}
