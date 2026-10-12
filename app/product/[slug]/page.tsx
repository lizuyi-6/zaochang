import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductCard } from "../../components/product-card";
import { database } from "../../api/_lib/community";
import { hostedUrlSelect } from "../../api/_lib/hosting-sql";
import { findProduct, products, type Product } from "../../lib/community-data";
import { hydrateProductRow, PUBLISHED_PRODUCT_SQL_QUALIFIED } from "../../lib/product-hydrate";
import { ProductExperience } from "./product-experience";

type PageProps = { params: Promise<{ slug: string }> };
type LoadedProduct = Product & { hostedUrl: string | null };

async function loadProduct(slug: string): Promise<LoadedProduct | null> {
  const seeded = findProduct(slug);
  if (seeded) return { ...seeded, hostedUrl: null };
  const id = Number(slug);
  if (!Number.isInteger(id)) return null;
  try {
    const row = await database().prepare(
      `SELECT p.id, p.owner_name AS ownerName, p.title, p.description, p.category,
              p.demo_type AS demoType, p.demo_url AS demoUrl, p.image_url AS imageUrl,
              p.cover_theme AS coverTheme, p.price, p.pricing_model AS pricingModel, p.likes_count AS likes,
              p.plays_count AS plays, p.created_at AS createdAt, ${hostedUrlSelect("p")}
       FROM products p WHERE p.id = ? AND ${PUBLISHED_PRODUCT_SQL_QUALIFIED}`,
    ).bind(id).first<Record<string, unknown>>();
    if (!row) return null;
    return { ...hydrateProductRow(row, { release: "社区新作", tags: [String(row.category), "独立创作"] }), hostedUrl: typeof row.hostedUrl === "string" ? row.hostedUrl : null };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  return product ? { title: product.title, description: product.description } : { title: "作品不存在" };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) notFound();
  const related = products.filter((item) => item.id !== product.id && (item.category === product.category || item.demoType === product.demoType)).slice(0, 3);
  return <div className={`product-detail-page${product.official ? " official-product-page" : ""}`}><ProductExperience product={product} /><section className="related-works"><div className="deep-section-heading"><div><span className="deep-eyebrow">KEEP EXPLORING</span><h2>沿着这个方向继续</h2></div></div><div className="discover-grid">{related.map((item, index) => <ProductCard key={item.id} product={item} index={index} />)}</div></section></div>;
}
