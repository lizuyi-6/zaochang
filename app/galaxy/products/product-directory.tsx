"use client";

import { ArrowRight, ArrowUpRight, Grid2X2, List, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PLANET_BY_ID } from "../cosmic-atlas";
import { GALAXY_BUSINESS, GALAXY_PRODUCTS, STATUS_ORDER, type ProductStatus } from "../product-galaxy";
import styles from "../ecosystem.module.css";

type ViewMode = "grid" | "list";

export function ProductDirectory() {
  const [query, setQuery] = useState("");
  const [galaxy, setGalaxy] = useState("all");
  const [status, setStatus] = useState<ProductStatus | "all">("all");
  const [view, setView] = useState<ViewMode>("grid");

  const filtered = useMemo(() => GALAXY_PRODUCTS.filter((product) => {
    const planet = PLANET_BY_ID[product.planetId];
    const haystack = `${product.name} ${product.codeName} ${product.tagline} ${product.capabilities.join(" ")}`.toLowerCase();
    return (!query.trim() || haystack.includes(query.trim().toLowerCase()))
      && (galaxy === "all" || planet.galaxyId === galaxy)
      && (status === "all" || product.status === status);
  }), [galaxy, query, status]);

  return (
    <div className={styles.directoryPage}>
      <section className={styles.pageIntro}>
        <div><span>PRODUCT CONSTELLATION / 12</span><h1>全部产品</h1><p>用真实业务分类和明确状态快速找到产品；世界观名称保留，但不再代替产品信息。</p></div>
        <div className={styles.introStats}><span><strong>12</strong><small>产品</small></span><span><strong>04</strong><small>赛道</small></span><span><strong>06</strong><small>开放体验</small></span></div>
      </section>

      <section className={styles.filters} aria-label="产品筛选">
        <label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索产品、能力或代号" /></label>
        <div className={styles.filterGroup}><SlidersHorizontal size={14} /><select value={galaxy} onChange={(event) => setGalaxy(event.target.value)} aria-label="按星系筛选"><option value="all">全部赛道</option>{Object.values(GALAXY_BUSINESS).map((item) => <option key={item.id} value={item.id}>{item.businessName}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value as ProductStatus | "all")} aria-label="按状态筛选"><option value="all">全部状态</option>{STATUS_ORDER.map((item) => <option key={item}>{item}</option>)}</select></div>
        <div className={styles.viewSwitch} aria-label="视图模式"><button className={view === "grid" ? styles.active : ""} onClick={() => setView("grid")} aria-label="网格模式"><Grid2X2 size={15} /></button><button className={view === "list" ? styles.active : ""} onClick={() => setView("list")} aria-label="列表模式"><List size={16} /></button></div>
      </section>

      <div className={styles.resultMeta}><span>显示 {filtered.length} / {GALAXY_PRODUCTS.length} 个产品</span><Link href="/galaxy">返回银河探索 <ArrowRight size={13} /></Link></div>

      {filtered.length ? (
        <section className={`${styles.productGrid} ${view === "list" ? styles.listView : ""}`}>
          {filtered.map((product, index) => {
            const planet = PLANET_BY_ID[product.planetId];
            const business = GALAXY_BUSINESS[planet.galaxyId];
            return (
              <article id={product.planetId} key={product.planetId} className={styles.productCard} style={{ "--product-accent": planet.accent } as React.CSSProperties}>
                <div className={styles.productIdentity}><span className={styles.planetMark}><i /><b>{String(index + 1).padStart(2, "0")}</b></span><div><small>{product.codeName} · {business.worldName}</small><h2>{product.name}</h2><p>{product.tagline}</p></div><em data-status={product.status}>{product.status}</em></div>
                <div className={styles.productDetail}><p>{product.description}</p><dl><div><dt>面向用户</dt><dd>{product.audience}</dd></div><div><dt>当前版本</dt><dd>{product.version}</dd></div><div><dt>下一里程碑</dt><dd>{product.nextMilestone}</dd></div></dl><ul>{product.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul></div>
                <footer><span>{business.businessName}</span><div><Link href={`/galaxy?planet=${product.planetId}`}>查看行星</Link><Link className={styles.cardPrimary} href={product.actionHref}>{product.actionLabel} <ArrowUpRight size={13} /></Link></div></footer>
              </article>
            );
          })}
        </section>
      ) : <section className={styles.emptyResult}><strong>没有找到匹配的产品</strong><p>尝试减少筛选条件，或回到全部状态。</p><button onClick={() => { setQuery(""); setGalaxy("all"); setStatus("all"); }}>清除筛选</button></section>}
    </div>
  );
}
