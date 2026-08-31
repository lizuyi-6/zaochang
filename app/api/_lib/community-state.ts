// 登录态社区聚合:GET /api/community 中"当前成员自己的数据"半边。
// 与 public-community.ts(匿名公开半边)对称;此前 12 条内联 SQL 全在路由里,
// 收编后路由只负责身份、结算触发与两半合并。SQL 与响应形状逐字不变。
import type { MemberIdentity } from "./access-control";
import { listRecentReading } from "./docs";
import { getWalletOverview } from "./fruit";
import { database } from "./community";

export type MemberCommunityState = {
  wallet: unknown;
  transactions: unknown[];
  profile: unknown;
  actions: unknown[];
  collections: unknown[];
  collectionItems: unknown[];
  ownedProducts: unknown[];
  notifications: unknown[];
  orders: unknown[];
  productLikes: unknown[];
  authoredBooks: unknown[];
  recentReading: unknown[];
};

// 成员行为流水(含已读标记):/api/community 与轻量站壳接口 /api/shell-state 共用,
// 后者用它推导"是否有未读通知"。SQL 与返回形状逐字保持。
export async function listMemberActions(
  db: ReturnType<typeof database>,
  email: string,
): Promise<{ kind: string; targetRef: string; createdAt: string }[]> {
  return (
    await db
      .prepare(
        `SELECT kind, target_ref AS targetRef, created_at AS createdAt
         FROM community_actions WHERE user_email = ?`,
      )
      .bind(email)
      .all<{ kind: string; targetRef: string; createdAt: string }>()
  ).results;
}

// 轻量站壳接口只需"哪些通知已读":只取 read_notification 标记,不把成员全部
// 行为流水(关注/入圈/点赞,随账户历史线性增长)从 D1 搬到 Worker 再在 JS 里过滤。
export async function listReadNotificationRefs(
  db: ReturnType<typeof database>,
  email: string,
): Promise<Set<string>> {
  const rows = (
    await db
      .prepare(
        `SELECT target_ref AS targetRef FROM community_actions WHERE user_email = ? AND kind = 'read_notification'`,
      )
      .bind(email)
      .all<{ targetRef: string }>()
  ).results;
  return new Set(rows.map((row) => String(row.targetRef)));
}

// 成员通知 UNION 流(评论/点赞/关注/交易):同上,两处共用一份 SQL。
export async function listMemberNotifications(
  db: ReturnType<typeof database>,
  email: string,
  displayName: string,
): Promise<{ id: string; type: string; title: string; detail: string; createdAt: string; href: string }[]> {
  return (
    await db
      .prepare(
        `SELECT 'comment:' || c.id AS id, '讨论' AS type,
                c.owner_name || ' 评论了你的作品' AS title,
                substr(c.content, 1, 90) AS detail,
                c.created_at AS createdAt, '/product/' || p.id AS href
         FROM comments c
         JOIN products p ON c.target_type = 'product' AND c.target_ref = CAST(p.id AS TEXT)
         WHERE p.owner_email = ? AND c.user_email <> ? AND c.moderation_status = 'visible'
         UNION ALL
         SELECT 'like:' || pl.product_id || ':' || pl.user_email AS id, '互动' AS type,
                m.display_name || ' 喜欢了你的作品' AS title,
                p.title || ' 收到一次新的喜欢。' AS detail,
                pl.created_at AS createdAt, '/product/' || p.id AS href
         FROM product_likes pl
         JOIN products p ON p.id = pl.product_id
         JOIN members m ON m.email = pl.user_email
         WHERE p.owner_email = ? AND pl.user_email <> ?
         UNION ALL
         SELECT 'follow:' || ca.user_email AS id, '关注' AS type,
                m.display_name || ' 开始关注你' AS title,
                '对方会在关注动态中看到你的新作品与版本记录。' AS detail,
                ca.created_at AS createdAt, '/profile' AS href
         FROM community_actions ca
         JOIN members m ON m.email = ca.user_email
         WHERE ca.kind = 'follow_creator' AND ca.target_ref = ? AND ca.user_email <> ?
         UNION ALL
         SELECT 'transaction:' || t.id AS id, '作品' AS type,
                t.description AS title,
                CASE WHEN t.delta > 0 THEN '+' || t.delta || ' 果已进入账户。'
                     ELSE t.delta || ' 果已从账户支出。' END AS detail,
                t.created_at AS createdAt, '/wallet' AS href
         FROM transactions t
         WHERE t.user_email = ? AND t.type <> 'welcome'
         ORDER BY createdAt DESC LIMIT 20`,
      )
      .bind(email, email, email, email, displayName, email, email)
      .all<{ id: string; type: string; title: string; detail: string; createdAt: string; href: string }>()
  ).results;
}

export async function loadMemberCommunityState(member: MemberIdentity): Promise<MemberCommunityState> {
  const db = database();
  const wallet = await getWalletOverview(member.email);
  const transactions = (
    await db
      .prepare(
        `SELECT id, delta, type, description, created_at AS createdAt
         FROM transactions WHERE user_email = ?
         ORDER BY created_at DESC, id DESC LIMIT 12`,
      )
      .bind(member.email)
      .all()
  ).results;
  const profile = await db
    .prepare(
      `SELECT display_name AS displayName, bio, location, website,
              reputation, joined_at AS joinedAt, member_number AS memberNumber
       FROM members WHERE email = ?`,
    )
    .bind(member.email)
    .first();
  const productLikes = (
    await db
      .prepare("SELECT product_id AS productId FROM product_likes WHERE user_email = ?")
      .bind(member.email)
      .all()
  ).results;
  const actions = await listMemberActions(db, member.email);
  const collections = (
    await db
      .prepare(
        `SELECT id, name, color, created_at AS createdAt,
                (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id = collections.id) AS itemCount
         FROM collections WHERE user_email = ? ORDER BY created_at ASC`,
      )
      .bind(member.email)
      .all()
  ).results;
  const collectionItems = (
    await db
      .prepare(
        `SELECT ci.collection_id AS collectionId, ci.product_ref AS productRef
         FROM collection_items ci JOIN collections c ON c.id = ci.collection_id
         WHERE c.user_email = ?`,
      )
      .bind(member.email)
      .all()
  ).results;
  const ownedProducts = (
    await db
      .prepare(
        `SELECT id, owner_name AS ownerName, title, description, category,
                demo_type AS demoType, demo_url AS demoUrl, image_url AS imageUrl,
                cover_theme AS coverTheme, price, pricing_model AS pricingModel, likes_count AS likes,
                plays_count AS plays, status, review_status AS reviewStatus,
                review_version AS reviewVersion, approved_version AS approvedVersion,
                reviewed_at AS reviewedAt, review_note AS reviewNote,
                submitted_at AS submittedAt, created_at AS createdAt
         FROM products WHERE owner_email = ?
         ORDER BY created_at DESC, id DESC`,
      )
      .bind(member.email)
      .all()
  ).results;
  const internalOrders = (
    await db
      .prepare(
        `SELECT o.id, o.product_id AS productId, p.title AS productTitle,
                o.pricing_model AS pricingModel, o.amount, o.status,
                o.purchased_at AS purchasedAt, o.refundable_until AS refundableUntil,
                CASE WHEN o.status = 'paid' AND o.pricing_model = 'one_time'
                          AND o.refundable_until > CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS refundable,
                'internal' AS source, NULL AS clientName
         FROM product_orders o JOIN products p ON p.id = o.product_id
         WHERE o.buyer_email = ? ORDER BY o.purchased_at DESC LIMIT 20`,
      )
      .bind(member.email)
      .all()
  ).results;
  const externalOrders = (
    await db
      .prepare(
        `SELECT e.id, NULL AS productId, e.title AS productTitle,
                e.pricing_model AS pricingModel, e.amount, e.status,
                e.created_at AS purchasedAt, e.refundable_until AS refundableUntil,
                CASE WHEN e.status = 'paid' AND e.pricing_model = 'one_time'
                          AND e.refundable_until > CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS refundable,
                'external' AS source, c.name AS clientName
         FROM external_fruit_payments e JOIN oauth_provider_clients c ON c.client_id = e.client_id
         WHERE e.payer_email = ? ORDER BY e.created_at DESC LIMIT 20`,
      )
      .bind(member.email)
      .all()
  ).results;
  const orders = [...internalOrders, ...externalOrders]
    .sort((left, right) => String((right as { purchasedAt?: string }).purchasedAt ?? "").localeCompare(String((left as { purchasedAt?: string }).purchasedAt ?? "")))
    .slice(0, 20);
  const notifications = await listMemberNotifications(db, member.email, member.displayName);
  const recentReading = await listRecentReading(member);
  // 当前账户名下的书(is_book=1 且 author_email 匹配)。章节数用递归 CTE 统计
  // 该书根的全部后代,与书架前台 listBooks 的 chapterCount 同语义。
  const authoredBooks = (
    await db
      .prepare(
        `WITH RECURSIVE tree(root, doc_id) AS (
             SELECT id, id FROM docs WHERE author_email = ? AND is_book = 1
             UNION ALL
             SELECT t.root, c.id FROM tree t JOIN docs c ON c.parent_id = t.doc_id
           )
           SELECT b.id, b.slug, b.title, b.summary, b.cover_hue AS coverHue,
                  b.cover_image AS coverImage, b.banner_image AS bannerImage,
                  b.visibility, b.updated_at AS updatedAt,
                  COALESCE((SELECT COUNT(*) FROM tree t WHERE t.root = b.id AND t.doc_id <> b.id), 0) AS chapterCount
           FROM docs b
           WHERE b.author_email = ? AND b.is_book = 1
           ORDER BY b.sort_order ASC, b.created_at ASC`,
      )
      .bind(member.email, member.email)
      .all()
  ).results;
  return {
    wallet,
    transactions,
    profile,
    actions,
    collections,
    collectionItems,
    ownedProducts,
    notifications,
    orders,
    productLikes,
    authoredBooks,
    recentReading,
  };
}
