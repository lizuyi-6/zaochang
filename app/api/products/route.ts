import { database, jsonError, requireMember } from "../_lib/community";

const themes = ["coral", "mint", "blue", "yellow", "ink"];
const categories = ["效率工具", "互动体验", "声音影像", "生活方式", "开发工具"];
const pricingModels = ["free", "one_time", "per_use"];

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const input = (await request.json()) as Record<string, unknown>;
    const title = String(input.title ?? "").trim().slice(0, 36);
    const description = String(input.description ?? "").trim().slice(0, 180);
    const category = String(input.category ?? "");
    const demoUrl = String(input.demoUrl ?? "").trim().slice(0, 500) || null;
    const imageUrl = String(input.imageUrl ?? "").trim().slice(0, 500) || null;
    const pricingModel = pricingModels.includes(String(input.pricingModel)) ? String(input.pricingModel) : "free";
    const requestedPrice = Math.max(0, Math.min(99, Math.floor(Number(input.price) || 0)));
    const price = pricingModel === "free" ? 0 : Math.max(1, requestedPrice);
    const coverTheme = themes.includes(String(input.coverTheme))
      ? String(input.coverTheme)
      : "coral";

    if (title.length < 2 || description.length < 12 || !categories.includes(category)) {
      return Response.json({ error: "invalid_product" }, { status: 400 });
    }
    if (demoUrl && !/^https?:\/\//i.test(demoUrl)) {
      return Response.json({ error: "invalid_demo_url" }, { status: 400 });
    }
    if (imageUrl && !(/^https?:\/\//i.test(imageUrl) || /^\/api\/uploads\/[a-f0-9-]+(?:\.[a-zA-Z0-9]{1,8})?$/.test(imageUrl))) {
      return Response.json({ error: "invalid_image_url" }, { status: 400 });
    }

    const db = database();
    const created = await db
      .prepare(
        `INSERT INTO products
         (owner_email, owner_name, title, description, category, demo_type,
          demo_url, image_url, cover_theme, price, pricing_model)
         VALUES (?, ?, ?, ?, ?, 'prototype', ?, ?, ?, ?, ?)
         RETURNING id, owner_name AS ownerName, title, description, category,
                   demo_type AS demoType, demo_url AS demoUrl, image_url AS imageUrl,
                   cover_theme AS coverTheme, price, pricing_model AS pricingModel, likes_count AS likes,
                   plays_count AS plays, created_at AS createdAt`,
      )
      .bind(
        member.email,
        member.displayName,
        title,
        description,
        category,
        demoUrl,
        imageUrl,
        coverTheme,
        price,
        pricingModel,
      )
      .first();
    return Response.json({ product: created, reward: 0 }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
