import { requireDocEditor } from "../_lib/access-control";
import { guardWrite } from "../_lib/route-guards";
import { createDoc, deleteDoc, DOC_COLUMNS, updateDoc } from "../_lib/docs";
import { database, jsonError } from "../_lib/community";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireDocEditor();
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
    const guarded = await guardWrite(request, { member: "docEditor", sameOrigin: true });
    if (guarded instanceof Response) return guarded;
    const input = await request.json() as Record<string, unknown>;
    return await createDoc(guarded.member, input);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const guarded = await guardWrite(request, { member: "docEditor", sameOrigin: true });
    if (guarded instanceof Response) return guarded;
    const input = await request.json() as Record<string, unknown>;
    return await updateDoc(input);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const guarded = await guardWrite(request, { member: "founder", sameOrigin: true });
    if (guarded instanceof Response) return guarded;
    const input = await request.json() as Record<string, unknown>;
    return await deleteDoc(input);
  } catch (error) {
    return jsonError(error);
  }
}
