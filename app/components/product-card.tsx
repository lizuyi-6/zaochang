"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BadgeCheck, Coins, Eye, Heart, Play } from "lucide-react";
import Link from "next/link";
import { compactNumber, type Product } from "../lib/community-data";
import { ReportButton } from "./report-button";

export function ProductCard({ product, index = 0, large = false }: { product: Product; index?: number; large?: boolean }) {
  const reduced = useReducedMotion();
  const priceLabel = product.pricingModel === "free" || product.price === 0
    ? "免费"
    : <><Coins size={13} /> {product.price}{product.pricingModel === "per_use" ? " / 次" : " 解锁"}</>;
  return (
    <motion.article
      className={large ? "deep-product-card large" : "deep-product-card"}
      initial={reduced ? false : { opacity: 0, y: 24 }}
      animate={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.06, 0.3), duration: 0.48 }}
      whileHover={reduced ? undefined : { y: -6 }}
    >
      <Link className={`deep-product-cover theme-${product.coverTheme}`} href={`/product/${product.slug ?? product.id}`}>
        <img src={product.image} alt={`${product.title} 作品预览`} />
        <span className="deep-cover-shade" />
        <motion.span className="deep-cover-play" whileHover={{ scale: 1.08 }}><Play size={18} fill="currentColor" /></motion.span>
        <span className="deep-price">{priceLabel}</span>
        <span className="deep-release">{product.release}</span>
      </Link>
      <div className="deep-product-copy">
        <span className="deep-category">{product.category}</span>
        <Link href={`/product/${product.slug ?? product.id}`}><h3>{product.title}</h3></Link>
        <p>{product.description}</p>
        <div className="deep-product-meta">
          <span className={`deep-avatar ${product.coverTheme}`}>{product.ownerInitial}</span>
          <strong>{product.ownerName}{product.founderOwned && <BadgeCheck className="founder-product-mark" size={13} aria-label="造场创始人" />}</strong>
          <span><Eye size={14} /> {compactNumber(product.plays)}</span>
          <span><Heart size={14} /> {compactNumber(product.likes)}</span>
          {typeof product.id === "number" && <ReportButton targetType="product" targetRef={String(product.id)} />}
        </div>
      </div>
    </motion.article>
  );
}
