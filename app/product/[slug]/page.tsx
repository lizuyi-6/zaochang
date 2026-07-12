import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductCard } from "../../components/product-card";
import { database } from "../../api/_lib/community";
import { findProduct, products, type Product } from "../../lib/community-data";
import { ProductExperience } from "./product-experience";

type PageProps = { params: Promise<{ slug: string }> };

async function loadProduct(slug: string): Promise<Product | null> {
  const seeded = findProduct(slug);
  if (seeded) return seeded;
  const id = Number(slug);
  if (!Number.isInteger(id)) return null;
  try {
    const row = await database().prepare(
      `SELECT id, owner_name AS ownerName, title, description, category,
              demo_type AS demoType, demo_url AS demoUrl, image_url AS imageUrl,
              cover_theme AS coverTheme, price, likes_count AS likes,
              plays_count AS plays, created_at AS createdAt
       FROM products WHERE id = ? AND status = 'published'`,
    ).bind(id).first<Record<string, unknown>>();
    if (!row) return null;
    const theme = ["coral", "mint", "blue", "yellow", "ink"].includes(String(row.coverTheme)) ? String(row.coverTheme) as Product["coverTheme"] : "coral";
    return {
      id,
      ownerName: String(row.ownerName),
      ownerInitial: String(row.ownerName)[0],
      title: String(row.title),
      description: String(row.description),
      longDescription: String(row.description),
      category: String(row.category),
      demoType: String(row.demoType),
      demoUrl: row.demoUrl ? String(row.demoUrl) : null,
      coverTheme: theme,
      price: Number(row.price),
      likes: Number(row.likes),
      plays: Number(row.plays),
      image: row.imageUrl ? String(row.imageUrl) : "https://images.unsplash.com/photo-1558655146-9f40138edfeb?auto=format&fit=crop&w=1600&q=88",
      accent: theme === "coral" ? "#ff5c3d" : theme === "mint" ? "#b9ecc8" : theme === "blue" ? "#92c6ef" : theme === "yellow" ? "#f1ca51" : "#171816",
      release: "社区新作",
      tags: [String(row.category), "独立创作"],
    };
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
