import { database, jsonError, optionalMember, requireMember } from "../_lib/community";
import { enforceRateLimit, rateLimitKey } from "../_lib/rate-limit";
import { findProduct } from "../../lib/community-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const targetType = url.searchParams.get("targetType") ?? "";
    const targetRef = url.searchParams.get("targetRef") ?? "";
    if (!targetType || !targetRef) return Response.json({ error: "invalid_target" }, { status: 400 });
    if (targetType === "product" && !(await productIsPublic(targetRef))) {
      return Response.json({ error: "product_not_found" }, { status: 404 });
    }
    const result = await database().prepare(
      `SELECT id, owner_name AS ownerName, content, created_at AS createdAt
       FROM comments WHERE target_type = ? AND target_ref = ? AND moderation_status = 'visible'
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
    await enforceRateLimit(await rateLimitKey("comment", member.email), 60, 60 * 60);
    const input = await request.json() as Record<string, unknown>;
    const targetType = String(input.targetType ?? "").slice(0, 24);
    const targetRef = String(input.targetRef ?? "").slice(0, 120);
    const content = String(input.content ?? "").trim().slice(0, 360);
    if (!targetType || !targetRef || content.length < 2) {
      return Response.json({ error: "invalid_comment" }, { status: 400 });
    }
    if (targetType === "product" && !(await productIsPublic(targetRef))) {
      return Response.json({ error: "product_not_found" }, { status: 404 });
    }
    const db = database();
    let comment;
    try {
      comment = await db.prepare(
        `INSERT INTO comments (user_email, owner_name, target_type, target_ref, content)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id, owner_name AS ownerName, content, created_at AS createdAt`,
      ).bind(member.email, member.displayName, targetType, targetRef, content).first();
    } catch (error) {
      if (error instanceof Error && error.message.includes("product_comment_product_not_approved")) {
        return Response.json({ error: "product_not_found" }, { status: 404 });
      }
      throw error;
    }
    if (targetType === "post" && /^\d+$/.test(targetRef)) {
      await db.prepare("UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?")
        .bind(Number(targetRef)).run();
    }
    return Response.json({ comment }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

async function productIsPublic(targetRef: string) {
  if (!/^\d+$/.test(targetRef)) return Boolean(findProduct(targetRef));
  const product = await database().prepare(
    `SELECT 1 AS found FROM products
     WHERE id = ? AND status = 'published' AND moderation_status = 'visible'
       AND review_status = 'approved' AND approved_version = review_version`,
  ).bind(Number(targetRef)).first();
  return Boolean(product);
}
