import { database } from "./community";

type CircleCount = { slug: string; members?: number; recentDiscussions?: number };

export type PublicCommunityState = {
  products: Record<string, unknown>[];
  posts: Record<string, unknown>[];
  platformStats: {
    members: number;
    products: number;
    posts: number;
    productPlays: number;
    todayFruitMovement: number;
  };
  circleStats: { slug: string; members: number; recentDiscussions: number }[];
  liveRoomStats: { topic: string; recentMessages: number }[];
};

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function loadPublicCommunityState(): Promise<PublicCommunityState> {
  const db = database();
  const [productsResult, postsResult, aggregate, circleMembers, circleDiscussions, liveRoomStats] = await Promise.all([
    db
      .prepare(
        `SELECT id, owner_name AS ownerName, title, description, category,
                demo_type AS demoType, demo_url AS demoUrl,
                image_url AS imageUrl, cover_theme AS coverTheme, price,
                pricing_model AS pricingModel, likes_count AS likes,
                plays_count AS plays, created_at AS createdAt
         FROM products WHERE status = 'published' AND moderation_status = 'visible'
           AND review_status = 'approved' AND approved_version = review_version
         ORDER BY created_at DESC LIMIT 24`,
      )
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT id, owner_name AS ownerName, content, product_id AS productId,
                linked_product_ref AS linkedProductRef, image_url AS imageUrl,
                post_type AS postType,
                likes_count AS likes, comments_count AS comments,
                created_at AS createdAt
         FROM posts WHERE moderation_status = 'visible' ORDER BY created_at DESC LIMIT 20`,
      )
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM members) AS members,
           (SELECT COUNT(*) FROM products
              WHERE status = 'published' AND moderation_status = 'visible'
                AND review_status = 'approved' AND approved_version = review_version) AS products,
           (SELECT COUNT(*) FROM posts WHERE moderation_status = 'visible') AS posts,
           (SELECT COALESCE(SUM(plays_count), 0) FROM products
              WHERE status = 'published' AND moderation_status = 'visible'
                AND review_status = 'approved' AND approved_version = review_version) AS productPlays,
           (SELECT COALESCE(SUM(ABS(delta)), 0) FROM fruit_entries
              WHERE date(created_at, '+8 hours') = date('now', '+8 hours')) AS todayFruitMovement`,
      )
      .first<Record<string, unknown>>(),
    db.prepare(`SELECT target_ref AS slug, COUNT(*) AS members FROM community_actions WHERE kind = 'join_circle' GROUP BY target_ref`).all<CircleCount>(),
    db.prepare(`SELECT substr(target_ref, 1, instr(target_ref, ':') - 1) AS slug, COUNT(*) AS recentDiscussions FROM comments WHERE target_type = 'circle_topic' AND moderation_status = 'visible' AND created_at >= datetime('now', '-7 days') GROUP BY slug`).all<CircleCount>(),
    db.prepare(`SELECT target_ref AS topic, COUNT(*) AS recentMessages FROM comments WHERE target_type = 'live_room' AND moderation_status = 'visible' AND created_at >= datetime('now', '-24 hours') GROUP BY target_ref`).all<{ topic: string; recentMessages: number }>(),
  ]);

  const circles = new Map<string, { slug: string; members: number; recentDiscussions: number }>();
  for (const row of circleMembers.results) {
    circles.set(row.slug, { slug: row.slug, members: numeric(row.members), recentDiscussions: 0 });
  }
  for (const row of circleDiscussions.results) {
    const current = circles.get(row.slug) ?? { slug: row.slug, members: 0, recentDiscussions: 0 };
    current.recentDiscussions = numeric(row.recentDiscussions);
    circles.set(row.slug, current);
  }

  return {
    products: productsResult.results,
    posts: postsResult.results,
    platformStats: {
      members: numeric(aggregate?.members),
      products: numeric(aggregate?.products),
      posts: numeric(aggregate?.posts),
      productPlays: numeric(aggregate?.productPlays),
      todayFruitMovement: numeric(aggregate?.todayFruitMovement),
    },
    circleStats: [...circles.values()],
    liveRoomStats: liveRoomStats.results.map((row) => ({ topic: row.topic, recentMessages: numeric(row.recentMessages) })),
  };
}
