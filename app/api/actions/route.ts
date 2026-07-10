import { database, jsonError, requireMember } from "../_lib/community";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as Record<string, unknown>;
    const action = String(input.action ?? "");
    const db = database();

    if (action === "experience") {
      const productId = Number(input.productId);
      if (Number.isInteger(productId)) {
        await db
          .prepare("UPDATE products SET plays_count = plays_count + 1 WHERE id = ?")
          .bind(productId)
          .run();
      }
      return Response.json({ recorded: true });
    }

    const member = await requireMember();

    if (action === "like") {
      const productId = Number(input.productId);
      if (!Number.isInteger(productId)) {
        return Response.json({ liked: true, localOnly: true });
      }
      const insert = await db
        .prepare("INSERT OR IGNORE INTO product_likes (product_id, user_email) VALUES (?, ?)")
        .bind(productId, member.email)
        .run();
      if ((insert.meta?.changes ?? 0) > 0) {
        await db
          .prepare("UPDATE products SET likes_count = likes_count + 1 WHERE id = ?")
          .bind(productId)
          .run();
      }
      return Response.json({ liked: true, added: (insert.meta?.changes ?? 0) > 0 });
    }

    if (action === "check_in") {
      const claimDate = new Date().toISOString().slice(0, 10);
      const claimed = await db
        .prepare(
          "INSERT OR IGNORE INTO daily_claims (user_email, claim_date, amount) VALUES (?, ?, 8)",
        )
        .bind(member.email, claimDate)
        .run();
      if ((claimed.meta?.changes ?? 0) === 0) {
        return Response.json({ error: "already_claimed" }, { status: 409 });
      }
      await db.batch([
        db
          .prepare(
            `UPDATE wallets SET balance = balance + 8,
             lifetime_earned = lifetime_earned + 8,
             updated_at = CURRENT_TIMESTAMP WHERE user_email = ?`,
          )
          .bind(member.email),
        db
          .prepare(
            `INSERT INTO transactions
             (user_email, delta, type, description, reference_id)
             VALUES (?, 8, 'daily_claim', '每日灵感补给', ?)`,
          )
          .bind(member.email, claimDate),
      ]);
      return Response.json({ claimed: 8 });
    }

    if (action === "tip") {
      const productId = Number(input.productId);
      const amount = Number(input.amount);
      if (!Number.isInteger(productId) || ![5, 10, 25].includes(amount)) {
        return Response.json({ error: "invalid_tip" }, { status: 400 });
      }
      const product = await db
        .prepare("SELECT owner_email AS ownerEmail, title FROM products WHERE id = ?")
        .bind(productId)
        .first<{ ownerEmail: string; title: string }>();
      if (!product || product.ownerEmail === member.email) {
        return Response.json({ error: "tip_not_allowed" }, { status: 409 });
      }
      const reference = `tip:${productId}:${crypto.randomUUID()}`;
      await db.batch([
        db
          .prepare(
            `UPDATE wallets SET balance = balance - ?,
             lifetime_spent = lifetime_spent + ?,
             updated_at = CURRENT_TIMESTAMP WHERE user_email = ?`,
          )
          .bind(amount, amount, member.email),
        db
          .prepare(
            `UPDATE wallets SET balance = balance + ?,
             lifetime_earned = lifetime_earned + ?,
             updated_at = CURRENT_TIMESTAMP WHERE user_email = ?`,
          )
          .bind(amount, amount, product.ownerEmail),
        db
          .prepare(
            `INSERT INTO transactions
             (user_email, delta, type, description, reference_id)
             VALUES (?, ?, 'tip_sent', ?, ?)`,
          )
          .bind(member.email, -amount, `支持《${product.title}》`, reference),
        db
          .prepare(
            `INSERT INTO transactions
             (user_email, delta, type, description, reference_id)
             VALUES (?, ?, 'tip_received', ?, ?)`,
          )
          .bind(product.ownerEmail, amount, `作品《${product.title}》收到支持`, reference),
      ]);
      return Response.json({ tipped: amount });
    }

    if (action === "post") {
      const content = String(input.content ?? "").trim().slice(0, 280);
      if (content.length < 2) {
        return Response.json({ error: "invalid_post" }, { status: 400 });
      }
      const post = await db
        .prepare(
          `INSERT INTO posts (owner_email, owner_name, content)
           VALUES (?, ?, ?)
           RETURNING id, owner_name AS ownerName, content,
                     likes_count AS likes, comments_count AS comments,
                     created_at AS createdAt`,
        )
        .bind(member.email, member.displayName, content)
        .first();
      return Response.json({ post }, { status: 201 });
    }

    return Response.json({ error: "unknown_action" }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}
