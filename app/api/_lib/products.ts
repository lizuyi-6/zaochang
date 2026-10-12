import { database } from "./community";
import { hostedUrlSelect } from "./hosting-sql";
import { accessError } from "./errors";
import { enforceRateLimit, rateLimitKey } from "./rate-limit";
import { UPLOAD_KEY_URL_PATTERN, verifyScannedUpload } from "./upload-core";
import { normalizePricingModel, normalizeProductTheme } from "../../lib/product-hydrate";
import type { MemberIdentity } from "./community";

export const PRODUCT_CATEGORIES = ["效率工具", "互动体验", "声音影像", "生活方式", "开发工具"] as const;

type ProductInput = Record<string, unknown>;
type ProductInputSource = ProductInput | (() => Promise<ProductInput>);
type NormalizedProduct = {
  title: string;
  description: string;
  category: string;
  demoUrl: string | null;
  imageUrl: string | null;
  coverTheme: string;
  pricingModel: string;
  price: number;
};

const owns = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const valueFrom = (input: ProductInput, key: string, fallback?: unknown) =>
  owns(input, key) ? input[key] : fallback;

function normalizeProduct(input: ProductInput): NormalizedProduct {
  const title = String(valueFrom(input, "title") ?? "").trim().slice(0, 36);
  const description = String(valueFrom(input, "description") ?? "").trim().slice(0, 180);
  const category = String(valueFrom(input, "category") ?? "");
  const demoUrl = String(valueFrom(input, "demoUrl") ?? "").trim().slice(0, 500) || null;
  const imageUrl = String(valueFrom(input, "imageUrl") ?? "").trim().slice(0, 500) || null;
  const pricingModel = normalizePricingModel(valueFrom(input, "pricingModel"));
  const requestedPrice = Math.max(0, Math.min(99, Math.floor(Number(valueFrom(input, "price")) || 0)));
  const price = pricingModel === "free" ? 0 : Math.max(1, requestedPrice);
  const coverTheme = normalizeProductTheme(valueFrom(input, "coverTheme"));

  if (title.length < 2 || description.length < 12 || !PRODUCT_CATEGORIES.includes(category as typeof PRODUCT_CATEGORIES[number])) {
    throw accessError("invalid_product", 400);
  }
  if (demoUrl && !/^https:\/\//i.test(demoUrl)) throw accessError("invalid_demo_url", 400);
  if (imageUrl && !(/^https?:\/\//i.test(imageUrl) || UPLOAD_KEY_URL_PATTERN.test(imageUrl))) {
    throw accessError("invalid_image_url", 400);
  }

  return { title, description, category, demoUrl, imageUrl, coverTheme, price, pricingModel };
}

async function verifyProductCover(member: MemberIdentity, imageUrl: string | null) {
  if (!imageUrl?.startsWith("/api/uploads/")) return;
  const key = decodeURIComponent(imageUrl.slice("/api/uploads/".length));
  const check = await verifyScannedUpload({ key, ownerEmail: member.email, expectedPurpose: "product_cover" });
  if (check.bucketMissing) throw accessError("storage_unavailable", 503);
  if (check.verdict === "not_owned") throw accessError("product_cover_not_owned", 403);
  if (check.verdict === "not_scanned") throw accessError("invalid_product_cover", 400);
}

async function enforceProductSubmissionLimit(member: MemberIdentity) {
  // 与网页发布接口共用原有键:每天最多 10 次项目提交/实质修改。
  await enforceRateLimit(await rateLimitKey("publish-product", member.email), 10, 24 * 60 * 60);
}

const productReturning = `id, owner_name AS ownerName, title, description, category, demo_type AS demoType,
  demo_url AS demoUrl, image_url AS imageUrl, cover_theme AS coverTheme, price,
  pricing_model AS pricingModel, likes_count AS likes, plays_count AS plays, status,
  review_status AS reviewStatus, review_version AS reviewVersion, submitted_at AS submittedAt,
  created_at AS createdAt`;

export async function createProduct(member: MemberIdentity, input: ProductInputSource) {
  await enforceProductSubmissionLimit(member);
  const requestInput = typeof input === "function" ? await input() : input;
  const product = normalizeProduct(requestInput);
  await verifyProductCover(member, product.imageUrl);
  const inserted = await database().prepare(
    `INSERT INTO products
     (owner_email, owner_name, title, description, category, demo_type,
      demo_url, image_url, cover_theme, price, pricing_model, status,
      moderation_status, review_status, review_version, approved_version)
     VALUES (?, ?, ?, ?, ?, 'prototype', ?, ?, ?, ?, ?,
             'pending_review', 'visible', 'pending_review', 1, 0)
     RETURNING id`,
  ).bind(
    member.email,
    member.displayName,
    product.title,
    product.description,
    product.category,
    product.demoUrl,
    product.imageUrl,
    product.coverTheme,
    product.price,
    product.pricingModel,
  ).first<{ id: number }>();
  if (!inserted) return null;
  return database().prepare(
    `SELECT ${productReturning}, ${hostedUrlSelect("products")}
     FROM products WHERE id = ?`,
  ).bind(inserted.id).first();
}

export async function listMyProducts(member: MemberIdentity) {
  const result = await database().prepare(
    `SELECT id, owner_name AS ownerName, title, description, category,
            demo_type AS demoType, demo_url AS demoUrl, image_url AS imageUrl,
            cover_theme AS coverTheme, price, pricing_model AS pricingModel,
            likes_count AS likes, plays_count AS plays, status, review_status,
            ${hostedUrlSelect("products")},
            review_version, approved_version, submitted_at AS submittedAt, created_at AS createdAt
     FROM products WHERE owner_email = ? ORDER BY created_at DESC, id DESC`,
  ).bind(member.email).all();
  return result.results ?? [];
}

export async function getProduct(member: MemberIdentity, id: number) {
  const product = await database().prepare(
    `SELECT owner_email AS ownerEmail, ${productReturning}, approved_version AS approvedVersion,
            ${hostedUrlSelect("products")}
     FROM products WHERE id = ?`,
  ).bind(id).first<{ id: number; ownerEmail: string }>();
  if (!product) throw accessError("not_found", 404);
  if (product.ownerEmail !== member.email) throw accessError("not_owned", 403);
  return product;
}

export async function updateProduct(member: MemberIdentity, id: number, input: ProductInput) {
  const db = database();
  const current = await db.prepare(
    `SELECT id, owner_email AS ownerEmail, title, description, category,
            demo_url AS demoUrl, image_url AS imageUrl, cover_theme AS coverTheme,
            pricing_model AS pricingModel, price
     FROM products WHERE id = ?`,
  ).bind(id).first<NormalizedProduct & { id: number; ownerEmail: string }>();
  if (!current) throw accessError("not_found", 404);
  if (current.ownerEmail !== member.email) throw accessError("not_owned", 403);

  const mutable = ["title", "description", "category", "demoUrl", "imageUrl", "coverTheme", "pricingModel", "price"];
  if (!mutable.some((field) => owns(input, field))) {
    throw accessError("invalid_product_update", 400);
  }
  const merged: ProductInput = {};
  for (const field of mutable) merged[field] = valueFrom(input, field, current[field as keyof NormalizedProduct]);
  const product = normalizeProduct(merged);
  await verifyProductCover(member, product.imageUrl);
  await enforceProductSubmissionLimit(member);

  const updated = await db.prepare(
    `UPDATE products SET title = ?, description = ?, category = ?, demo_url = ?, image_url = ?,
       cover_theme = ?, pricing_model = ?, price = ?
     WHERE id = ? AND owner_email = ?
     RETURNING id`,
  ).bind(
    product.title,
    product.description,
    product.category,
    product.demoUrl,
    product.imageUrl,
    product.coverTheme,
    product.pricingModel,
    product.price,
    id,
    member.email,
  ).first<{ id: number }>();
  if (!updated) throw accessError("not_owned", 403);

  // RETURNING on SQLite is evaluated before AFTER triggers; re-read to include the
  // product_material_change_requires_review trigger's review state transition.
  return db.prepare(`SELECT ${productReturning}, approved_version AS approvedVersion,
                       ${hostedUrlSelect("products")} FROM products WHERE id = ?`)
    .bind(id).first();
}
