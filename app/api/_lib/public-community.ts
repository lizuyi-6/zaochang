import { PUBLISHED_PRODUCT_SQL } from "../../lib/product-policy";
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

// 圈子统计(成员数 + 近 7 天讨论数):/api/community 公开半边与轻量站壳接口
// /api/shell-state 共用同一实现,避免两处 SQL 漂移。
export async function loadCircleStats(db: ReturnType<typeof database>): Promise<{ slug: string; members: number; recentDiscussions: number }[]> {
  const [circleMembers, circleDiscussions] = await Promise.all([
    db.prepare(`SELECT target_ref AS slug, COUNT(*) AS members FROM community_actions WHERE kind = 'join_circle' GROUP BY target_ref`).all<CircleCount>(),
    db.prepare(`SELECT substr(target_ref, 1, instr(target_ref, ':') - 1) AS slug, COUNT(*) AS recentDiscussions FROM comments WHERE target_type = 'circle_topic' AND moderation_status = 'visible' AND created_at >= datetime('now', '-7 days') GROUP BY slug`).all<CircleCount>(),
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
  return [...circles.values()];
}

// 可见帖子数:站壳顶栏"动态"徽标只需这一个数,不必拉整份公开社区聚合。
export async function countVisiblePosts(db: ReturnType<typeof database>): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS posts FROM posts WHERE moderation_status = 'visible'`)
    .first<{ posts: number }>();
  return numeric(row?.posts);
}

export async function loadPublicCommunityState(): Promise<PublicCommunityState> {
  const db = database();
  const [productsResult, postsResult, aggregate, circleStats, liveRoomStats] = await Promise.all([
    db
      .prepare(
        `SELECT id, owner_name AS ownerName, title, description, category,
                demo_type AS demoType, demo_url AS demoUrl,
                image_url AS imageUrl, cover_theme AS coverTheme, price,
                pricing_model AS pricingModel, likes_count AS likes,
                plays_count AS plays, created_at AS createdAt
         FROM products WHERE ${PUBLISHED_PRODUCT_SQL}
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
           (SELECT COUNT(*) FROM products WHERE ${PUBLISHED_PRODUCT_SQL}) AS products,
           (SELECT COUNT(*) FROM posts WHERE moderation_status = 'visible') AS posts,
           (SELECT COALESCE(SUM(plays_count), 0) FROM products WHERE ${PUBLISHED_PRODUCT_SQL}) AS productPlays,
           (SELECT COALESCE(SUM(ABS(delta)), 0) FROM fruit_entries
              WHERE date(created_at, '+8 hours') = date('now', '+8 hours')) AS todayFruitMovement`,
      )
      .first<Record<string, unknown>>(),
    loadCircleStats(db),
    db.prepare(`SELECT target_ref AS topic, COUNT(*) AS recentMessages FROM comments WHERE target_type = 'live_room' AND moderation_status = 'visible' AND created_at >= datetime('now', '-24 hours') GROUP BY target_ref`).all<{ topic: string; recentMessages: number }>(),
  ]);

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
    circleStats,
    liveRoomStats: liveRoomStats.results.map((row) => ({ topic: row.topic, recentMessages: numeric(row.recentMessages) })),
  };
}
