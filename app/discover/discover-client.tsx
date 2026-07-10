"use client";

import { LayoutGroup, motion } from "framer-motion";
import { ArrowDownUp, Grid2X2, List, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ProductCard } from "../components/product-card";
import { products as seedProducts, type Product } from "../lib/community-data";

const categories = ["全部", "互动体验", "效率工具", "声音影像", "生活方式", "开发工具"];

function hydrateRemote(product: Record<string, unknown>): Product {
  const theme = ["coral", "mint", "blue", "yellow", "ink"].includes(String(product.coverTheme)) ? String(product.coverTheme) as Product["coverTheme"] : "coral";
  return {
    id: Number(product.id),
    ownerName: String(product.ownerName ?? "新创作者"),
    ownerInitial: String(product.ownerName ?? "新")[0],
    title: String(product.title),
    description: String(product.description),
    longDescription: String(product.description),
    category: String(product.category),
    demoType: String(product.demoType ?? "prototype"),
    demoUrl: product.demoUrl ? String(product.demoUrl) : null,
    coverTheme: theme,
    price: Number(product.price ?? 0),
    likes: Number(product.likes ?? 0),
    plays: Number(product.plays ?? 0),
    image: "https://images.unsplash.com/photo-1558655146-9f40138edfeb?auto=format&fit=crop&w=1200&q=85",
    accent: theme === "coral" ? "#ff5c3d" : theme === "mint" ? "#b9ecc8" : theme === "blue" ? "#92c6ef" : theme === "yellow" ? "#f1ca51" : "#171816",
    release: "刚刚发布",
    tags: [String(product.category), "社区新作"],
  };
}

export function DiscoverClient() {
  const [category, setCategory] = useState("全部");
  const [sort, setSort] = useState("趋势");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [remote, setRemote] = useState<Product[]>([]);

  useEffect(() => {
    fetch("/api/community", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        const payload = data as { products?: Record<string, unknown>[] } | null;
        setRemote((payload?.products ?? []).map(hydrateRemote));
      })
      .catch(() => undefined);
  }, []);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = [...remote, ...seedProducts].filter((product) => {
      const categoryMatch = category === "全部" || product.category === category;
      const queryMatch = !normalized || `${product.title} ${product.ownerName} ${product.description}`.toLowerCase().includes(normalized);
      return categoryMatch && queryMatch;
    });
    return filtered.sort((a, b) => sort === "最新" ? String(b.release).localeCompare(String(a.release)) : sort === "最多体验" ? b.plays - a.plays : b.likes + b.plays / 20 - (a.likes + a.plays / 20));
  }, [category, query, remote, sort]);

  return (
    <div className="discover-page">
      <header className="route-hero compact">
        <div><span className="deep-eyebrow"><Sparkles size={14} /> EXPLORE / 1842 WORKS</span><h1>从一个能玩的版本开始</h1><p>按感觉、用途或创作方式，找到此刻值得进入的作品。</p></div>
        <div className="discover-orbit"><i /><i /><i /><span>DISCOVER</span></div>
      </header>

      <section className="discover-controls">
        <label className="inline-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="在探索页中搜索" /></label>
        <LayoutGroup>
          <div className="category-tabs">
            {categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={category === item ? "active" : ""}>{category === item && <motion.i layoutId="category-active" />}{item}</button>)}
          </div>
        </LayoutGroup>
        <div className="discover-actions">
          <button onClick={() => setSort((value) => value === "趋势" ? "最新" : value === "最新" ? "最多体验" : "趋势")}><ArrowDownUp size={15} /> {sort}</button>
          <button aria-label="筛选" title="筛选"><SlidersHorizontal size={16} /></button>
          <div className="view-toggle"><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="网格视图"><Grid2X2 size={16} /></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="列表视图"><List size={17} /></button></div>
        </div>
      </section>

      <div className="result-count"><span>找到 <strong>{visible.length}</strong> 件作品</span><small>内容会随社区发布实时更新</small></div>
      <motion.section className={view === "grid" ? "discover-grid" : "discover-grid list"} layout>
        {visible.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}
      </motion.section>
      {visible.length === 0 && <div className="route-empty"><Search size={30} /><strong>没有找到相关作品</strong><button onClick={() => { setQuery(""); setCategory("全部"); }}>清除筛选</button></div>}
    </div>
  );
}
