"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Heart, Image as ImageIcon, Link2, MessageCircle, Radio, Send, SmilePlus, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { posts as seedPosts, type CommunityPost } from "../lib/community-data";

function hydratePost(post: Record<string, unknown>): CommunityPost {
  const name = String(post.ownerName ?? "新创作者");
  return { id: Number(post.id), ownerName: name, ownerInitial: name[0], role: "社区创作者", content: String(post.content), createdAt: "刚刚", likes: Number(post.likes ?? 0), comments: Number(post.comments ?? 0), color: "mint" };
}

export function FeedClient() {
  const [posts, setPosts] = useState<CommunityPost[]>(seedPosts);
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState("全部");
  const [sending, setSending] = useState(false);
  const [liked, setLiked] = useState<Set<string | number>>(new Set());

  useEffect(() => {
    fetch("/api/community", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => {
      const payload = data as { posts?: Record<string, unknown>[] } | null;
      const remote = (payload?.posts ?? []).map(hydratePost);
      if (remote.length) setPosts([...remote, ...seedPosts]);
    }).catch(() => undefined);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (text.trim().length < 2) return;
    setSending(true);
    const response = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "post", content: text }) });
    if (response.status === 401) {
      window.location.href = "/signin-with-chatgpt?return_to=%2Ffeed";
      return;
    }
    if (response.ok) {
      const data = await response.json() as { post: Record<string, unknown> };
      setPosts((current) => [hydratePost(data.post), ...current]);
      setText("");
      setExpanded(false);
    }
    setSending(false);
  };

  return (
    <div className="feed-page-layout">
      <div className="feed-stream">
        <header className="route-hero minimal"><div><span className="deep-eyebrow"><Radio size={14} /> COMMUNITY SIGNAL</span><h1>作品之外，正在发生</h1><p>版本、过程、失败和共创请求，构成一件作品真正的生长记录。</p></div></header>

        <form className={expanded ? "deep-composer expanded" : "deep-composer"} onSubmit={submit}>
          <span className="deep-avatar ink">我</span>
          <div className="composer-body">
            <textarea value={text} onFocus={() => setExpanded(true)} onChange={(event) => setText(event.target.value)} placeholder="此刻你在造什么？" maxLength={280} />
            <AnimatePresence>
              {expanded && <motion.div className="composer-tools" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}><div><button type="button" title="图片"><ImageIcon size={17} /></button><button type="button" title="关联作品"><Link2 size={17} /></button><button type="button" title="表情"><SmilePlus size={17} /></button></div><span>{text.length}/280</span><button className="composer-send" disabled={sending || text.trim().length < 2}>{sending ? "发布中" : "发布"}<Send size={16} /></button></motion.div>}
            </AnimatePresence>
          </div>
        </form>

        <div className="feed-filter-tabs">{["全部", "关注", "版本发布", "共创招募"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div>

        <section className="deep-post-list">
          <AnimatePresence initial={false}>
            {posts.map((post, index) => (
              <motion.article key={post.id} layout initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.2) }}>
                <span className={`deep-avatar ${post.color}`}>{post.ownerInitial}</span>
                <div className="deep-post-body">
                  <div className="deep-post-author"><span><strong>{post.ownerName}</strong><small>{post.role} · {post.createdAt}</small></span><button>•••</button></div>
                  <p>{post.content}</p>
                  {post.image && <motion.img src={post.image} alt="动态附图" whileHover={{ scale: 1.012 }} />}
                  {post.productSlug && <Link className="linked-work" href={`/product/${post.productSlug}`}><span><Sparkles size={15} /> 关联作品</span><strong>查看这次版本变化</strong><ArrowUpRight size={16} /></Link>}
                  <div className="deep-post-actions"><button className={liked.has(post.id) ? "liked" : ""} onClick={() => setLiked((current) => new Set(current).add(post.id))}><Heart size={17} fill={liked.has(post.id) ? "currentColor" : "none"} /> {post.likes + (liked.has(post.id) ? 1 : 0)}</button><button><MessageCircle size={17} /> {post.comments}</button><button><ArrowUpRight size={17} /> 分享</button></div>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </section>
      </div>

      <aside className="feed-context">
        <section><span className="deep-eyebrow"><Users size={14} /> LIVE ROOMS</span><h3>此刻在聊</h3>{["从 MVP 删到只剩一次点击", "独立产品如何找到第一批用户", "环境声音采样接龙"].map((topic, index) => <button key={topic}><i className={["coral", "blue", "yellow"][index]} /><span><strong>{topic}</strong><small>{38 - index * 7} 人正在讨论</small></span></button>)}</section>
        <section className="feed-streak"><span>你的社区连续出现</span><strong>07<small>天</small></strong><div>{Array.from({ length: 7 }).map((_, index) => <i key={index} className={index < 6 ? "active" : ""} />)}</div><p>再分享一次过程记录，获得 6 果。</p></section>
      </aside>
    </div>
  );
}
