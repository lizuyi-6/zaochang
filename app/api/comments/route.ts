import { database, jsonError, optionalMember, requireMember } from "../_lib/community";
import { enforceRateLimit, rateLimitKey } from "../_lib/rate-limit";
import { findProduct } from "../../lib/community-data";
import { assertSameOrigin } from "../_lib/request-origin";

export const dynamic = "force-dynamic";

// 评论目标的合法类型白名单：product / post / circle_topic / live_room。
// 其余任意 targetType 一律 400 拒绝，避免产生指向不存在目标的孤儿评论。
const COMMENT_TARGET_TYPES = ["product", "post", "circle_topic", "live_room"];

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const targetType = url.searchParams.get("targetType") ?? "";
    const targetRef = url.searchParams.get("targetRef") ?? "";
    if (!targetType || !targetRef) return Response.json({ error: "invalid_target" }, { status: 400 });
    if (targetType === "product" && !(await productIsPublic(targetRef))) {
      return Response.json({ error: "product_not_found" }, { status: 404 });
    }
    // 帖子与产品同规:被隐藏的帖子,其评论区对读取一并关闭(写侧另有 DB 触发器兜底)。
    if (targetType === "post" && !(await postIsVisible(targetRef))) {
      return Response.json({ error: "post_not_found" }, { status: 404 });
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
    // CSRF 纵深:跨站写请求 403(见 request-origin.ts;SameSite=Lax 之外的防线)。
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    await enforceRateLimit(await rateLimitKey("comment", member.email), 60, 60 * 60);
    const input = await request.json() as Record<string, unknown>;
    const targetType = String(input.targetType ?? "").slice(0, 24);
    const targetRef = String(input.targetRef ?? "").slice(0, 120);
    const content = String(input.content ?? "").trim().slice(0, 360);
    if (!targetType || !targetRef || content.length < 2) {
      return Response.json({ error: "invalid_comment" }, { status: 400 });
    }
    if (!COMMENT_TARGET_TYPES.includes(targetType)) {
      return Response.json({ error: "invalid_target" }, { status: 400 });
    }
    if (targetType === "product" && !(await productIsPublic(targetRef))) {
      return Response.json({ error: "product_not_found" }, { status: 404 });
    }
    if (targetType === "post" && !(await postIsVisible(targetRef))) {
      return Response.json({ error: "post_not_found" }, { status: 404 });
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
      // 隐藏帖评论闸(0019 触发器):POST 侧校验与触发器之间帖子被隐藏的竞态在这里落地。
      if (error instanceof Error && error.message.includes("post_comment_post_not_visible")) {
        return Response.json({ error: "post_not_found" }, { status: 404 });
      }
      throw error;
    }
    // comments_count 由 0019 触发器原子维护(此前是这里的一条独立 UPDATE,非原子
    // 且无递减路径);应用层不再手写计数。
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

async function postIsVisible(targetRef: string) {
  if (!/^\d+$/.test(targetRef)) return false;
  const post = await database().prepare(
    `SELECT 1 AS found FROM posts WHERE id = ? AND moderation_status = 'visible'`,
  ).bind(Number(targetRef)).first();
  return Boolean(post);
}
