import { database, jsonError, optionalMember, requireMember } from "../_lib/community";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const targetType = url.searchParams.get("targetType") ?? "";
    const targetRef = url.searchParams.get("targetRef") ?? "";
    if (!targetType || !targetRef) return Response.json({ error: "invalid_target" }, { status: 400 });
    const result = await database().prepare(
      `SELECT id, owner_name AS ownerName, content, created_at AS createdAt
       FROM comments WHERE target_type = ? AND target_ref = ?
       ORDER BY created_at ASC, id ASC LIMIT 80`,
    ).bind(targetType, targetRef).all();
    const member = await optionalMember();
    return Response.json({ comments: result.results, signedIn: Boolean(member) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const input = await request.json() as Record<string, unknown>;
    const targetType = String(input.targetType ?? "").slice(0, 24);
    const targetRef = String(input.targetRef ?? "").slice(0, 120);
    const content = String(input.content ?? "").trim().slice(0, 360);
    if (!targetType || !targetRef || content.length < 2) {
      return Response.json({ error: "invalid_comment" }, { status: 400 });
    }
    const db = database();
    const comment = await db.prepare(
      `INSERT INTO comments (user_email, owner_name, target_type, target_ref, content)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id, owner_name AS ownerName, content, created_at AS createdAt`,
    ).bind(member.email, member.displayName, targetType, targetRef, content).first();
    if (targetType === "post" && /^\d+$/.test(targetRef)) {
      await db.prepare("UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?")
        .bind(Number(targetRef)).run();
    }
    return Response.json({ comment }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
