"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Check, Coins, Eye, Heart, MessageCircle, Pause, Play, RotateCcw, SlidersHorizontal, Sparkles, Volume2 } from "lucide-react";
import { useState } from "react";
import { compactNumber, type Product } from "../../lib/community-data";

export function ProductExperience({ product }: { product: Product }) {
  const reduced = useReducedMotion();
  const [running, setRunning] = useState(false);
  const [intensity, setIntensity] = useState(64);
  const [accent, setAccent] = useState(product.accent);
  const [tab, setTab] = useState("体验");
  const [liked, setLiked] = useState(false);
  const [notice, setNotice] = useState("");

  const like = async () => {
    if (liked) return;
    const response = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "like", productId: product.id }) });
    if (response.status === 401) {
      window.location.href = `/signin-with-chatgpt?return_to=${encodeURIComponent(`/product/${product.slug ?? product.id}`)}`;
      return;
    }
    setLiked(true);
  };

  const tip = async (amount: number) => {
    if (typeof product.id !== "number") {
      setNotice("展示作品暂不接收果子，但你的喜欢会被记录");
      return;
    }
    const response = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "tip", productId: product.id, amount }) });
    if (response.status === 401) {
      window.location.href = `/signin-with-chatgpt?return_to=${encodeURIComponent(`/product/${product.id}`)}`;
      return;
    }
    const data = await response.json() as { error?: string };
    setNotice(response.ok ? `已用 ${amount} 果支持创作者` : data.error === "insufficient_balance" ? "果子余额不足" : "暂时无法完成支持");
  };

  return (
    <>
      <header className="product-detail-head">
        <div className="product-identity"><span className={`deep-avatar ${product.coverTheme}`}>{product.ownerInitial}</span><span><small>{product.category} / {product.release}</small><h1>{product.title}</h1><p>{product.description}</p><div>{product.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></span></div>
        <div className="product-head-stats"><span><Eye size={16} /><strong>{compactNumber(product.plays)}</strong><small>体验</small></span><span><Heart size={16} /><strong>{compactNumber(product.likes + (liked ? 1 : 0))}</strong><small>喜欢</small></span><button className={liked ? "liked" : ""} onClick={like}><Heart size={18} fill={liked ? "currentColor" : "none"} /> {liked ? "已喜欢" : "喜欢"}</button></div>
      </header>

      <div className="product-tabs">{["体验", "关于", "版本记录", "讨论 28"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div>

      <AnimatePresence mode="wait">
        {tab === "体验" ? (
          <motion.section key="experience" className="immersive-experience" style={{ "--product-accent": accent } as React.CSSProperties} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <img src={product.image} alt="" />
            <span className="experience-shade" />
            <div className="experience-grid-lines" />
            <motion.div className="experience-console" initial={reduced ? false : { opacity: 0, scale: 0.94, y: 28 }} animate={reduced ? undefined : { opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.55 }}>
              <span className="console-kicker">LIVE PROTOTYPE / {product.demoType.toUpperCase()}</span>
              <div className="console-status"><span className={running ? "active" : ""} /><small>{running ? "SESSION ACTIVE" : "READY TO ENTER"}</small></div>
              <strong>{product.demoType === "focus" ? (running ? "24:47" : "25:00") : product.title}</strong>
              <p>{running ? "体验正在发生，试着改变下方参数。" : "这是一个可以直接操作的作品片段。"}</p>
              <button className="console-play" onClick={() => setRunning((value) => !value)}>{running ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}{running ? "暂停体验" : "开始体验"}</button>
              <label><span><SlidersHorizontal size={14} /> 强度</span><input type="range" min="10" max="100" value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} /><b>{intensity}</b></label>
              <div className="console-colors">{[product.accent, "#ff5c3d", "#92c6ef", "#f1ca51", "#f8f7f2"].map((color) => <button key={color} style={{ background: color }} className={accent === color ? "active" : ""} onClick={() => setAccent(color)} aria-label="切换体验色" />)}</div>
              <div className="console-footer"><button><Volume2 size={15} /> 环境声</button><button onClick={() => { setIntensity(64); setAccent(product.accent); setRunning(false); }}><RotateCcw size={15} /> 重置</button>{product.demoUrl && <a href={product.demoUrl} target="_blank" rel="noreferrer">完整版本 <ArrowUpRight size={15} /></a>}</div>
            </motion.div>
            <div className="experience-wave">{Array.from({ length: 42 }).map((_, index) => <motion.i key={index} animate={running && !reduced ? { height: [`${10 + ((index * 13) % 35)}%`, `${20 + ((index * intensity) % 78)}%`, `${10 + ((index * 17) % 42)}%`] } : { height: `${12 + ((index * 11) % 38)}%` }} transition={{ duration: 0.9 + (index % 5) * 0.13, repeat: running ? Infinity : 0, repeatType: "mirror" }} />)}</div>
          </motion.section>
        ) : tab === "关于" ? (
          <motion.section key="about" className="product-about" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}><div><span className="deep-eyebrow">ABOUT THIS WORK</span><h2>这件作品为什么存在</h2><p>{product.longDescription}</p><blockquote>“我不想再做一个催促人完成更多事情的工具。它应该让时间本身变得值得感受。”</blockquote></div><aside><span className={`deep-avatar ${product.coverTheme}`}>{product.ownerInitial}</span><h3>{product.ownerName}</h3><p>独立创作者 · 已发布 4 件作品</p><button>关注创作者</button></aside></motion.section>
        ) : tab === "版本记录" ? (
          <motion.section key="versions" className="version-timeline" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>{[{ version: "v1.7", title: "让声音随天气变化", detail: "加入实时天气参数，雨天会出现更密的低频环境声。", time: "2 天前" }, { version: "v1.6", title: "重做专注结束页", detail: "不再展示效率分数，改为回放这段时间里森林发生的变化。", time: "8 天前" }, { version: "v1.5", title: "第一次公开测试", detail: "邀请 86 位社区成员体验，收到 132 条具体反馈。", time: "18 天前" }].map((item, index) => <article key={item.version}><span><Check size={15} /></span><div><small>{item.version} · {item.time}</small><h3>{item.title}</h3><p>{item.detail}</p></div>{index === 0 && <em>当前版本</em>}</article>)}</motion.section>
        ) : (
          <motion.section key="discussion" className="product-discussion" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}><div className="discussion-composer"><span className="deep-avatar ink">我</span><input placeholder="留下体验反馈或具体建议" /><button><MessageCircle size={16} /> 发送</button></div>{["雨天的声音变化特别好，但希望可以单独关掉鸟声。", "结束页不再显示效率分数以后，反而更愿意连续使用。", "可以开放自定义采样包吗？想做一片属于自己的森林。"].map((text, index) => <article key={text}><span className={`deep-avatar ${["blue", "yellow", "mint"][index]}`}>{["听", "贺", "N"][index]}</span><div><strong>{["听筒", "贺千", "Niko"][index]}</strong><small>{index + 1} 小时前</small><p>{text}</p><button><Heart size={14} /> {12 - index * 3}</button></div></article>)}</motion.section>
        )}
      </AnimatePresence>

      <section className="product-support"><div><span className="deep-eyebrow"><Sparkles size={14} /> SUPPORT THE MAKER</span><h2>让创作者知道，这件作品值得继续</h2><p>果子直接进入创作者账户，不影响推荐排名。</p></div><div>{[5, 10, 25].map((amount) => <motion.button key={amount} onClick={() => tip(amount)} whileHover={{ y: -4 }}><Coins size={17} /><strong>{amount}</strong><small>果</small></motion.button>)}</div></section>
      {notice && <motion.div className="product-notice" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><Check size={16} /> {notice}</motion.div>}
    </>
  );
}
