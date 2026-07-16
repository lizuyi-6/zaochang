import { database, jsonError, requireMember } from "../_lib/community";
import { awardProductLike, removeProductLike, tipProduct } from "../_lib/fruit";
import { enforceRateLimit, rateLimitKey, requestActorKey } from "../_lib/rate-limit";
import { findProduct } from "../../lib/community-data";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as Record<string, unknown>;
    const action = String(input.action ?? "");
    const db = database();

    if (action === "experience") {
      await enforceRateLimit(await requestActorKey(request, "experience"), 120, 60 * 60);
      const productId = Number(input.productId);
      if (Number.isInteger(productId)) {
        const update = await db
          .prepare(`UPDATE products SET plays_count = plays_count + 1
                    WHERE id = ? AND status = 'published' AND moderation_status = 'visible'
                      AND review_status = 'approved' AND approved_version = review_version`)
          .bind(productId)
          .run();
        if ((update.meta?.changes ?? 0) === 0) {
          return Response.json({ error: "product_not_found" }, { status: 404 });
        }
      } else if (!findProduct(String(input.productId ?? ""))) {
        return Response.json({ error: "product_not_found" }, { status: 404 });
      }
      return Response.json({ recorded: true });
    }

    const member = await requireMember();
    await enforceRateLimit(await rateLimitKey("member-action", member.email), 180, 60 * 60);

    if (action === "like") {
      const productId = Number(input.productId);
      if (!Number.isInteger(productId)) {
        const productRef = String(input.productId ?? "").trim().slice(0, 80);
        if (!findProduct(productRef)) return Response.json({ error: "product_not_found" }, { status: 404 });
        const existing = await db
          .prepare("SELECT 1 AS found FROM community_actions WHERE user_email = ? AND kind = 'like_showcase' AND target_ref = ?")
          .bind(member.email, productRef)
          .first();
        if (existing) {
          await db.prepare("DELETE FROM community_actions WHERE user_email = ? AND kind = 'like_showcase' AND target_ref = ?")
            .bind(member.email, productRef).run();
          return Response.json({ liked: false, added: false, reward: { granted: false, amount: 0, reason: "showcase_product" } });
        }
        await db.prepare("INSERT INTO community_actions (user_email, kind, target_ref) VALUES (?, 'like_showcase', ?)")
          .bind(member.email, productRef).run();
        return Response.json({ liked: true, added: true, reward: { granted: false, amount: 0, reason: "showcase_product" } });
      }
      const existing = await db
        .prepare("SELECT 1 AS found FROM product_likes WHERE product_id = ? AND user_email = ?")
        .bind(productId, member.email)
        .first();
      const product = await db
        .prepare(`SELECT owner_email AS ownerEmail FROM products
                  WHERE id = ? AND status = 'published' AND moderation_status = 'visible'
                    AND review_status = 'approved' AND approved_version = review_version`)
        .bind(productId)
        .first<{ ownerEmail: string }>();
      if (!product) return Response.json({ error: "product_not_found" }, { status: 404 });
      if (existing) {
        const removed = await removeProductLike(product.ownerEmail, member.email, productId);
        return Response.json({ liked: false, added: false, reward: removed.reward });
      }
      let insert;
      try {
        insert = await db
          .prepare("INSERT INTO product_likes (product_id, user_email) VALUES (?, ?)")
          .bind(productId, member.email)
          .run();
      } catch (error) {
        if (error instanceof Error && error.message.includes("product_like_product_not_approved")) {
          return Response.json({ error: "product_not_found" }, { status: 404 });
        }
        throw error;
      }
      const reward = (insert.meta?.changes ?? 0) > 0
        ? await awardProductLike(product.ownerEmail, member.email, productId)
        : { granted: false, amount: 0, reason: "already_liked" };
      return Response.json({ liked: true, added: (insert.meta?.changes ?? 0) > 0, reward });
    }

    if (action === "check_in") {
      return Response.json({ error: "daily_claim_removed", earningPath: "qualified_product_likes" }, { status: 410 });
    }

    if (action === "tip") {
      const productId = Number(input.productId);
      const amount = Number(input.amount);
      const idempotencyKey = String(input.idempotencyKey ?? "");
      return Response.json(await tipProduct(member.email, productId, amount, idempotencyKey));
    }

    if (action === "post") {
      await enforceRateLimit(await rateLimitKey("post", member.email), 20, 60 * 60);
      const content = String(input.content ?? "").trim().slice(0, 280);
      const imageUrl = String(input.imageUrl ?? "").trim().slice(0, 500) || null;
      const linkedProductRef = String(input.linkedProductRef ?? "").trim().slice(0, 80) || null;
      const postType = ["记录", "版本发布", "共创招募"].includes(String(input.postType)) ? String(input.postType) : "记录";
      if (content.length < 2) {
        return Response.json({ error: "invalid_post" }, { status: 400 });
      }
      if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
        return Response.json({ error: "invalid_image_url" }, { status: 400 });
      }
      const post = await db
        .prepare(
          `INSERT INTO posts (owner_email, owner_name, content, image_url, linked_product_ref, post_type)
           VALUES (?, ?, ?, ?, ?, ?)
           RETURNING id, owner_name AS ownerName, content,
                     image_url AS imageUrl, linked_product_ref AS linkedProductRef,
                     post_type AS postType,
                     likes_count AS likes, comments_count AS comments,
                     created_at AS createdAt`,
        )
        .bind(member.email, member.displayName, content, imageUrl, linkedProductRef, postType)
        .first();
      return Response.json({ post }, { status: 201 });
    }

    if (action === "mark_notifications_read") {
      const targetRefs = Array.isArray(input.targetRefs)
        ? [...new Set(input.targetRefs.map((item) => String(item).trim().slice(0, 120)).filter(Boolean))].slice(0, 50)
        : [];
      if (targetRefs.length === 0) {
        return Response.json({ error: "invalid_notifications" }, { status: 400 });
      }
      await db.batch(targetRefs.map((targetRef) => db
        .prepare("INSERT OR IGNORE INTO community_actions (user_email, kind, target_ref) VALUES (?, 'read_notification', ?)")
        .bind(member.email, targetRef)));
      return Response.json({ read: targetRefs });
    }

    if (action === "toggle_action") {
      const kind = String(input.kind ?? "");
      const targetRef = String(input.targetRef ?? "").trim().slice(0, 120);
      const allowedKinds = ["follow_creator", "join_circle", "like_post", "like_comment"];
      if (!allowedKinds.includes(kind) || !targetRef) {
        return Response.json({ error: "invalid_action" }, { status: 400 });
      }
      const existing = await db
        .prepare("SELECT 1 AS found FROM community_actions WHERE user_email = ? AND kind = ? AND target_ref = ?")
        .bind(member.email, kind, targetRef)
        .first();
      if (existing) {
        await db.prepare("DELETE FROM community_actions WHERE user_email = ? AND kind = ? AND target_ref = ?")
          .bind(member.email, kind, targetRef).run();
        return Response.json({ active: false });
      }
      await db.prepare("INSERT INTO community_actions (user_email, kind, target_ref) VALUES (?, ?, ?)")
        .bind(member.email, kind, targetRef).run();
      return Response.json({ active: true });
    }

    if (action === "create_collection") {
      const name = String(input.name ?? "").trim().slice(0, 24);
      const color = ["coral", "mint", "blue", "yellow", "ink"].includes(String(input.color)) ? String(input.color) : "coral";
      if (name.length < 2) return Response.json({ error: "invalid_collection" }, { status: 400 });
      const collection = await db.prepare(
        `INSERT INTO collections (user_email, name, color) VALUES (?, ?, ?)
         RETURNING id, name, color, created_at AS createdAt`,
      ).bind(member.email, name, color).first();
      return Response.json({ collection }, { status: 201 });
    }

    if (action === "add_to_collection") {
      const productRef = String(input.productRef ?? "").trim().slice(0, 80);
      let collectionId = Number(input.collectionId);
      if (!productRef) return Response.json({ error: "invalid_collection_item" }, { status: 400 });
      if (!Number.isInteger(collectionId)) {
        const first = await db.prepare("SELECT id FROM collections WHERE user_email = ? ORDER BY created_at ASC LIMIT 1")
          .bind(member.email).first<{ id: number }>();
        collectionId = Number(first?.id);
      }
      const owner = await db.prepare("SELECT id FROM collections WHERE id = ? AND user_email = ?")
        .bind(collectionId, member.email).first();
      if (!owner) return Response.json({ error: "collection_not_found" }, { status: 404 });
      const insert = await db.prepare("INSERT OR IGNORE INTO collection_items (collection_id, product_ref) VALUES (?, ?)")
        .bind(collectionId, productRef).run();
      return Response.json({ saved: true, added: (insert.meta?.changes ?? 0) > 0, collectionId });
    }

    if (action === "update_profile") {
      const bio = String(input.bio ?? "").trim().slice(0, 180);
      const location = String(input.location ?? "").trim().slice(0, 40);
      const website = String(input.website ?? "").trim().slice(0, 120);
      if (bio.length < 4 || !location) return Response.json({ error: "invalid_profile" }, { status: 400 });
      if (website && !/^(https?:\/\/|[\w.-]+\.[a-z]{2,})/i.test(website)) {
        return Response.json({ error: "invalid_website" }, { status: 400 });
      }
      await db.prepare("UPDATE members SET bio = ?, location = ?, website = ? WHERE email = ?")
        .bind(bio, location, website, member.email).run();
      return Response.json({ profile: { bio, location, website } });
    }

    return Response.json({ error: "unknown_action" }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}
