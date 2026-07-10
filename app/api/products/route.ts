import { database, jsonError, requireMember } from "../_lib/community";

const themes = ["coral", "mint", "blue", "yellow", "ink"];
const categories = ["效率工具", "互动体验", "声音影像", "生活方式", "开发工具"];

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const input = (await request.json()) as Record<string, unknown>;
    const title = String(input.title ?? "").trim().slice(0, 36);
    const description = String(input.description ?? "").trim().slice(0, 180);
    const category = String(input.category ?? "");
    const demoUrl = String(input.demoUrl ?? "").trim().slice(0, 500) || null;
    const price = Math.max(0, Math.min(99, Math.floor(Number(input.price) || 0)));
    const coverTheme = themes.includes(String(input.coverTheme))
      ? String(input.coverTheme)
      : "coral";

    if (title.length < 2 || description.length < 12 || !categories.includes(category)) {
      return Response.json({ error: "invalid_product" }, { status: 400 });
    }
    if (demoUrl && !/^https?:\/\//i.test(demoUrl)) {
      return Response.json({ error: "invalid_demo_url" }, { status: 400 });
    }

    const db = database();
    const created = await db
      .prepare(
        `INSERT INTO products
         (owner_email, owner_name, title, description, category, demo_type,
          demo_url, cover_theme, price)
         VALUES (?, ?, ?, ?, ?, 'prototype', ?, ?, ?)
         RETURNING id, owner_name AS ownerName, title, description, category,
                   demo_type AS demoType, demo_url AS demoUrl,
                   cover_theme AS coverTheme, price, likes_count AS likes,
                   plays_count AS plays, created_at AS createdAt`,
      )
      .bind(
        member.email,
        member.displayName,
        title,
        description,
        category,
        demoUrl,
        coverTheme,
        price,
      )
      .first();

    await db.batch([
      db
        .prepare(
          `UPDATE wallets SET balance = balance + 20,
             lifetime_earned = lifetime_earned + 20,
             updated_at = CURRENT_TIMESTAMP WHERE user_email = ?`,
        )
        .bind(member.email),
      db
        .prepare(
          `INSERT INTO transactions
           (user_email, delta, type, description, reference_id)
           VALUES (?, 20, 'publish_reward', '发布作品奖励', ?)`,
        )
        .bind(member.email, `product:${String(created?.id ?? "new")}`),
    ]);

    return Response.json({ product: created, reward: 20 }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
