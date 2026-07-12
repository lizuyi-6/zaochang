import { database, ensureMember, jsonError, optionalMember } from "../_lib/community";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = database();
    const member = await optionalMember();
    if (member) await ensureMember(member);

    const queries = [
      db
        .prepare(
          `SELECT id, owner_name AS ownerName, title, description, category,
                  demo_type AS demoType, demo_url AS demoUrl,
                  image_url AS imageUrl, cover_theme AS coverTheme, price, likes_count AS likes,
                  plays_count AS plays, created_at AS createdAt
           FROM products WHERE status = 'published'
           ORDER BY created_at DESC LIMIT 24`,
        )
        .all(),
      db
        .prepare(
          `SELECT id, owner_name AS ownerName, content, product_id AS productId,
                  linked_product_ref AS linkedProductRef, image_url AS imageUrl,
                  post_type AS postType,
                  likes_count AS likes, comments_count AS comments,
                  created_at AS createdAt
           FROM posts ORDER BY created_at DESC LIMIT 20`,
        )
        .all(),
    ] as const;

    const [productsResult, postsResult] = await Promise.all(queries);
    let wallet = null;
    let transactions: unknown[] = [];
    let profile = null;
    let actions: unknown[] = [];
    let collections: unknown[] = [];
    let collectionItems: unknown[] = [];
    let ownedProducts: unknown[] = [];
    let notifications: unknown[] = [];

    if (member) {
      wallet = await db
        .prepare(
          `SELECT balance, lifetime_earned AS lifetimeEarned,
                  lifetime_spent AS lifetimeSpent
           FROM wallets WHERE user_email = ?`,
        )
        .bind(member.email)
        .first();
      transactions = (
        await db
          .prepare(
            `SELECT id, delta, type, description, created_at AS createdAt
             FROM transactions WHERE user_email = ?
             ORDER BY created_at DESC, id DESC LIMIT 12`,
          )
          .bind(member.email)
          .all()
      ).results;
      profile = await db
        .prepare(
          `SELECT display_name AS displayName, bio, location, website,
                  reputation, joined_at AS joinedAt
           FROM members WHERE email = ?`,
        )
        .bind(member.email)
        .first();
      actions = (
        await db
          .prepare(
            `SELECT kind, target_ref AS targetRef, created_at AS createdAt
             FROM community_actions WHERE user_email = ?`,
          )
          .bind(member.email)
          .all()
      ).results;
      collections = (
        await db
          .prepare(
            `SELECT id, name, color, created_at AS createdAt,
                    (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id = collections.id) AS itemCount
             FROM collections WHERE user_email = ? ORDER BY created_at ASC`,
          )
          .bind(member.email)
          .all()
      ).results;
      collectionItems = (
        await db
          .prepare(
            `SELECT ci.collection_id AS collectionId, ci.product_ref AS productRef
             FROM collection_items ci JOIN collections c ON c.id = ci.collection_id
             WHERE c.user_email = ?`,
          )
          .bind(member.email)
          .all()
      ).results;
      ownedProducts = (
        await db
          .prepare(
            `SELECT id, owner_name AS ownerName, title, description, category,
                    demo_type AS demoType, demo_url AS demoUrl, image_url AS imageUrl,
                    cover_theme AS coverTheme, price, likes_count AS likes,
                    plays_count AS plays, status, created_at AS createdAt
             FROM products WHERE owner_email = ?
             ORDER BY created_at DESC, id DESC`,
          )
          .bind(member.email)
          .all()
      ).results;
      notifications = (
        await db
          .prepare(
            `SELECT 'comment:' || c.id AS id, '讨论' AS type,
                    c.owner_name || ' 评论了你的作品' AS title,
                    substr(c.content, 1, 90) AS detail,
                    c.created_at AS createdAt, '/product/' || p.id AS href
             FROM comments c
             JOIN products p ON c.target_type = 'product' AND c.target_ref = CAST(p.id AS TEXT)
             WHERE p.owner_email = ? AND c.user_email <> ?
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
          .bind(member.email, member.email, member.email, member.email, member.displayName, member.email, member.email)
          .all()
      ).results;
    }

    return Response.json({
      products: productsResult.results,
      posts: postsResult.results,
      wallet,
      transactions,
      profile,
      actions,
      collections,
      collectionItems,
      ownedProducts,
      notifications,
      signedIn: Boolean(member),
    });
  } catch (error) {
    return jsonError(error);
  }
}
