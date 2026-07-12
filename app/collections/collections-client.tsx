"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, Check, FolderPlus, Sparkles, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ProductCard } from "../components/product-card";
import { products } from "../lib/community-data";

type Collection = { id: number; name: string; color: string; itemCount: number };
type Item = { collectionId: number; productRef: string };
const fallbackCollections: Collection[] = [
  { id: -1, name: "动态文字实验", color: "coral", itemCount: 3 },
  { id: -2, name: "城市与声音", color: "blue", itemCount: 3 },
  { id: -3, name: "慢工具", color: "mint", itemCount: 3 },
];

export function CollectionsClient() {
  const [collections, setCollections] = useState<Collection[]>(fallbackCollections);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("coral");
  const [notice, setNotice] = useState("");

  const load = () => fetch("/api/community", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => {
    const payload = data as { collections?: Collection[]; collectionItems?: Item[] } | null;
    if (payload?.collections?.length) setCollections(payload.collections);
    setItems(payload?.collectionItems ?? []);
  }).catch(() => undefined);

  useEffect(() => { void load(); }, []);

  const createCollection = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return;
    const response = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create_collection", name, color }) });
    if (response.status === 401) { window.location.assign("/signin?return_to=%2Fcollections"); return; }
    if (!response.ok) { setNotice("收藏夹创建失败，请稍后重试"); return; }
    const data = await response.json() as { collection: Collection };
    setCollections((current) => [...current.filter((item) => item.id > 0), { ...data.collection, itemCount: 0 }]);
    setSelected(data.collection.id);
    setName("");
    setOpen(false);
    setNotice("新收藏夹已经建立");
  };

  const selectedRefs = selected && selected > 0 ? new Set(items.filter((item) => item.collectionId === selected).map((item) => item.productRef)) : null;
  const visibleProducts = selected && selected > 0 ? products.filter((product) => selectedRefs?.has(String(product.slug ?? product.id))) : products.slice(0, 4);

  return <div className="collections-page">
    <header className="route-hero compact"><div><span className="deep-eyebrow"><Bookmark size={14} /> SAVED SIGNALS</span><h1>想再回来玩的作品</h1><p>收藏不是终点。按正在研究的方向，把灵感整理成可以继续行动的材料。</p></div><button className="primary-action" onClick={() => setOpen(true)}><FolderPlus size={17} /> 新建收藏夹</button></header>
    <section className="collection-shelves">{collections.map((collection, index) => { const refs = new Set(items.filter((item) => item.collectionId === collection.id).map((item) => item.productRef)); const previews = collection.id > 0 ? products.filter((product) => refs.has(String(product.slug ?? product.id))).slice(0, 3) : products.slice(index, index + 3); return <button key={collection.id} className={`collection-shelf ${collection.color} ${selected === collection.id ? "active" : ""}`} onClick={() => setSelected((current) => current === collection.id ? null : collection.id)}><span><Sparkles size={17} /> {collection.name}</span><strong>{String(collection.itemCount).padStart(2, "0")}</strong><small>{collection.id > 0 ? "账户收藏夹" : "灵感示例"}</small><div>{previews.map((product) => <img key={product.id} src={product.image} alt="" />)}</div></button>; })}</section>
    <section><div className="deep-section-heading"><div><span className="deep-eyebrow">{selected ? "COLLECTION CONTENT" : "RECENTLY SAVED"}</span><h2>{selected ? collections.find((item) => item.id === selected)?.name : "最近收藏"}</h2></div></div>{visibleProducts.length ? <div className="discover-grid">{visibleProducts.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}</div> : <div className="route-empty"><Bookmark size={28} /><strong>这个收藏夹还是空的</strong><p>在作品页点击收藏，作品会进入你的默认收藏夹。</p><Link className="primary-action" href="/discover">探索作品</Link></div>}</section>
    <AnimatePresence>{open && <motion.div className="action-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}><motion.form className="action-modal" onSubmit={createCollection} initial={{ opacity: 0, y: 18, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}><header><div><small>NEW COLLECTION</small><h2>新建收藏夹</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="关闭"><X size={18} /></button></header><label><span>名称</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={24} placeholder="例如：值得反复体验" /></label><fieldset><legend>识别色</legend><div className="modal-color-row">{["coral", "mint", "blue", "yellow", "ink"].map((item) => <button type="button" key={item} className={`${item} ${color === item ? "active" : ""}`} onClick={() => setColor(item)} aria-label={item}>{color === item && <Check size={13} />}</button>)}</div></fieldset><footer><button type="button" onClick={() => setOpen(false)}>取消</button><button className="primary-action" disabled={name.trim().length < 2}>创建收藏夹</button></footer></motion.form></motion.div>}</AnimatePresence>
    {notice && <button className="action-toast" onClick={() => setNotice("")}><Check size={15} />{notice}</button>}
  </div>;
}
