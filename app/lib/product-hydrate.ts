// 产品行水合的单一事实来源:此前 product 页/profile 页/discover 客户端各有一份
// 15 行的 row→Product 转换,主题白名单散落 6 处、已发布 SQL 重复 2 处。
// 集中后,新增字段或调整规则只改这里。
import type { Product } from "./community-data";

export const PRODUCT_THEMES = ["coral", "mint", "blue", "yellow", "ink"] as const;
export type ProductTheme = (typeof PRODUCT_THEMES)[number];

export const PRICING_MODELS = ["free", "one_time", "per_use"] as const;

export const THEME_ACCENTS: Record<ProductTheme, string> = {
  coral: "#ff5c3d",
  mint: "#b9ecc8",
  blue: "#92c6ef",
  yellow: "#f1ca51",
  ink: "#171816",
};

export const PRODUCT_IMAGE_FALLBACK = "https://images.unsplash.com/photo-1558655146-9f40138edfeb?auto=format&fit=crop&w=1600&q=88";

// 已发布产品的可见性谓词:SQL(WHERE 子句)与语义说明共用同一段文字,
// 任何一侧调整都必须同步另一侧——所以放在一起。
export const PUBLISHED_PRODUCT_SQL =
  "status = 'published' AND moderation_status = 'visible' AND review_status = 'approved' AND approved_version = review_version";

export function normalizeProductTheme(value: unknown): ProductTheme {
  return (PRODUCT_THEMES as readonly string[]).includes(String(value)) ? String(value) as ProductTheme : "coral";
}

export function normalizePricingModel(value: unknown): Product["pricingModel"] {
  return ((PRICING_MODELS as readonly string[]).includes(String(value)) ? String(value) : "free") as Product["pricingModel"];
}

export type ProductRowLike = {
  id?: unknown;
  ownerName?: unknown;
  title?: unknown;
  description?: unknown;
  category?: unknown;
  demoType?: unknown;
  demoUrl?: unknown;
  coverTheme?: unknown;
  price?: unknown;
  pricingModel?: unknown;
  likes?: unknown;
  plays?: unknown;
  imageUrl?: unknown;
};

// DB 行(或 /api/community 载荷里的产品对象)→ 展示用 Product。
// release/tags/兜底图按调用面语境传入;ownerInitial 缺省取 ownerName 首字符。
export function hydrateProductRow(row: ProductRowLike, options: {
  release: string;
  tags: string[];
  ownerInitial?: string;
  fallbackImage?: string;
}): Product {
  const theme = normalizeProductTheme(row.coverTheme);
  const ownerName = String(row.ownerName ?? "新创作者");
  return {
    id: Number(row.id),
    ownerName,
    ownerInitial: options.ownerInitial ?? ownerName[0],
    title: String(row.title),
    description: String(row.description),
    longDescription: String(row.description),
    category: String(row.category),
    demoType: String(row.demoType ?? "prototype"),
    demoUrl: row.demoUrl ? String(row.demoUrl) : null,
    coverTheme: theme,
    price: Number(row.price ?? 0),
    pricingModel: normalizePricingModel(row.pricingModel),
    likes: Number(row.likes ?? 0),
    plays: Number(row.plays ?? 0),
    image: row.imageUrl ? String(row.imageUrl) : (options.fallbackImage ?? PRODUCT_IMAGE_FALLBACK),
    accent: THEME_ACCENTS[theme],
    release: options.release,
    tags: options.tags,
  };
}
