// 产品行水合的单一事实来源:此前 product 页/profile 页/discover 客户端各有一份
// 15 行的 row→Product 转换,主题白名单散落 6 处、已发布 SQL 重复 2 处。
// 集中后,新增字段或调整规则只改这里。纯策略常量的定义在 product-policy.ts,
// 这里保留既有 import surface 供调用方继续使用。
// 显式 .ts 扩展名:本模块同时被 bundler 与纯 Node 契约测试加载,后者不做扩展名解析。
import type { Product } from "./community-data.ts";
import {
  normalizePricingModel,
  normalizeProductTheme,
  PRODUCT_IMAGE_FALLBACK,
  THEME_ACCENTS,
} from "./product-policy.ts";

export {
  PRICING_MODELS,
  PRODUCT_IMAGE_FALLBACK,
  PRODUCT_THEMES,
  PUBLISHED_PRODUCT_SQL,
  PUBLISHED_PRODUCT_SQL_QUALIFIED,
  THEME_ACCENTS,
  normalizePricingModel,
  normalizeProductTheme,
} from "./product-policy.ts";
export type { PricingModel, ProductTheme } from "./product-policy.ts";

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
