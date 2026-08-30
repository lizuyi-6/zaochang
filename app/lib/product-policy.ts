// 产品策略的单一事实来源：主题/定价白名单、公开可见 SQL、带别名 SQL。
// 这里只放纯常量与纯判定，不依赖 Next/React/Cloudflare，供页面、API 与 Worker 共用。

export const PRODUCT_THEMES = ["coral", "mint", "blue", "yellow", "ink"] as const;
export type ProductTheme = (typeof PRODUCT_THEMES)[number];

export const PRICING_MODELS = ["free", "one_time", "per_use"] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

export const THEME_ACCENTS: Record<ProductTheme, string> = {
  coral: "#ff5c3d",
  mint: "#b9ecc8",
  blue: "#92c6ef",
  yellow: "#f1ca51",
  ink: "#171816",
};

export const PRODUCT_IMAGE_FALLBACK = "https://images.unsplash.com/photo-1558655146-9f40138edfeb?auto=format&fit=crop&w=1600&q=88";

// 已发布产品的可见性谓词：SQL 与页面判定必须表达同一条规则。
// approved 单独存在不够，批准版本必须仍等于当前审核版本；编辑重审后旧批准立即失效。
export const PUBLISHED_PRODUCT_SQL =
  "status = 'published' AND moderation_status = 'visible' AND review_status = 'approved' AND approved_version = review_version";

// JOIN 场景的 products 表别名版本。别名固定为 p，调用方不得用字符串改写常量。
export const PUBLISHED_PRODUCT_SQL_QUALIFIED =
  "p.status = 'published' AND p.moderation_status = 'visible' AND p.review_status = 'approved' AND p.approved_version = p.review_version";

export function isCurrentApprovedProduct(product: {
  reviewStatus: string;
  approvedVersion?: number | null;
  reviewVersion?: number | null;
}): boolean {
  return product.reviewStatus === "approved"
    && Number.isInteger(product.approvedVersion)
    && Number.isInteger(product.reviewVersion)
    && product.approvedVersion === product.reviewVersion;
}

export function normalizeProductTheme(value: unknown): ProductTheme {
  return (PRODUCT_THEMES as readonly string[]).includes(String(value)) ? String(value) as ProductTheme : "coral";
}

export function normalizePricingModel(value: unknown): PricingModel {
  return (PRICING_MODELS as readonly string[]).includes(String(value)) ? String(value) as PricingModel : "free";
}
