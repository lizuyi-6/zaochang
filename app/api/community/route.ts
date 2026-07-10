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
                  cover_theme AS coverTheme, price, likes_count AS likes,
                  plays_count AS plays, created_at AS createdAt
           FROM products WHERE status = 'published'
           ORDER BY created_at DESC LIMIT 24`,
        )
        .all(),
      db
        .prepare(
          `SELECT id, owner_name AS ownerName, content, product_id AS productId,
                  likes_count AS likes, comments_count AS comments,
                  created_at AS createdAt
           FROM posts ORDER BY created_at DESC LIMIT 20`,
        )
        .all(),
    ] as const;

    const [productsResult, postsResult] = await Promise.all(queries);
    let wallet = null;
    let transactions: unknown[] = [];

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
    }

    return Response.json({
      products: productsResult.results,
      posts: postsResult.results,
      wallet,
      transactions,
    });
  } catch (error) {
    return jsonError(error);
  }
}
