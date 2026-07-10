import type { Metadata } from "next";
import { Bookmark, FolderPlus, Sparkles } from "lucide-react";
import { ProductCard } from "../components/product-card";
import { products } from "../lib/community-data";

export const metadata: Metadata = { title: "灵感收藏" };

export default function CollectionsPage() {
  return (
    <div className="collections-page">
      <header className="route-hero compact"><div><span className="deep-eyebrow"><Bookmark size={14} /> SAVED SIGNALS</span><h1>想再回来玩的作品</h1><p>收藏不是终点。按正在研究的方向，把灵感整理成可以继续行动的材料。</p></div><button className="primary-action"><FolderPlus size={17} /> 新建收藏夹</button></header>
      <section className="collection-shelves"><article className="collection-shelf coral"><span><Sparkles size={17} /> 动态文字实验</span><strong>12</strong><small>最近更新 2 小时前</small><div>{products.slice(0, 3).map((product) => <img key={product.id} src={product.image} alt="" />)}</div></article><article className="collection-shelf blue"><span><Sparkles size={17} /> 城市与声音</span><strong>08</strong><small>最近更新 昨天</small><div>{products.slice(1, 4).map((product) => <img key={product.id} src={product.image} alt="" />)}</div></article><article className="collection-shelf mint"><span><Sparkles size={17} /> 慢工具</span><strong>06</strong><small>最近更新 4 天前</small><div>{products.slice(2, 5).map((product) => <img key={product.id} src={product.image} alt="" />)}</div></article></section>
      <section><div className="deep-section-heading"><div><span className="deep-eyebrow">RECENTLY SAVED</span><h2>最近收藏</h2></div></div><div className="discover-grid">{products.slice(0, 4).map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}</div></section>
    </div>
  );
}
