"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  Check,
  Copy,
  Heart,
  Image as ImageIcon,
  Link2,
  MessageCircle,
  MoreHorizontal,
  Radio,
  Send,
  SmilePlus,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { products, type CommunityPost } from "../lib/community-data";

type Comment = {
  id: number;
  ownerName: string;
  content: string;
  createdAt: string;
};
type LiveRoomStat = { topic: string; recentMessages: number };

function publishedAt(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "时间未记录";
  const parsed = new Date(
    raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`,
  );
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(parsed);
}

function hydratePost(post: Record<string, unknown>): CommunityPost {
  const name = String(post.ownerName ?? "新创作者");
  const id = Number(post.id);
  const colors = ["coral", "mint", "blue", "yellow"] as const;
  return {
    id,
    ownerName: name,
    ownerInitial: name[0],
    role: "社区创作者",
    content: String(post.content),
    createdAt: publishedAt(post.createdAt),
    likes: Number(post.likes ?? 0),
    comments: Number(post.comments ?? 0),
    color: colors[Math.abs(id || 0) % colors.length],
    image: post.imageUrl ? String(post.imageUrl) : undefined,
    productSlug: post.linkedProductRef
      ? String(post.linkedProductRef)
      : undefined,
    postType: String(post.postType ?? "记录") as CommunityPost["postType"],
  };
}

export function FeedClient() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState("全部");
  const [sending, setSending] = useState(false);
  const [liked, setLiked] = useState<Set<string | number>>(new Set());
  const [hidden, setHidden] = useState<Set<string | number>>(new Set());
  const [menuOpen, setMenuOpen] = useState<string | number | null>(null);
  const [commentsOpen, setCommentsOpen] = useState<string | number | null>(
    null,
  );
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentText, setCommentText] = useState("");
  const [tool, setTool] = useState<"image" | "link" | "emoji" | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [linkedProductRef, setLinkedProductRef] = useState("");
  const [postType, setPostType] = useState<"记录" | "版本发布" | "共创招募">(
    "记录",
  );
  const [notice, setNotice] = useState("");
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [roomComments, setRoomComments] = useState<Comment[]>([]);
  const [roomText, setRoomText] = useState("");
  const [sendingRoom, setSendingRoom] = useState(false);
  const [liveRoomStats, setLiveRoomStats] = useState<Record<string, number>>(
    {},
  );
  const [feedState, setFeedState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    fetch("/api/community", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data) {
          setFeedState("error");
          return;
        }
        const payload = data as {
          posts?: Record<string, unknown>[];
          actions?: { kind: string; targetRef: string }[];
          liveRoomStats?: LiveRoomStat[];
        };
        const remote = (payload?.posts ?? []).map(hydratePost);
        setPosts(remote);
        setFollowed(
          new Set(
            (payload?.actions ?? [])
              .filter((item) => item.kind === "follow_creator")
              .map((item) => item.targetRef),
          ),
        );
        setLiked(
          new Set(
            (payload?.actions ?? [])
              .filter((item) => item.kind === "like_post")
              .map((item) => item.targetRef),
          ),
        );
        setLiveRoomStats(
          Object.fromEntries(
            (payload.liveRoomStats ?? []).map((item) => [
              item.topic,
              Number(item.recentMessages ?? 0),
            ]),
          ),
        );
        setFeedState("ready");
      })
      .catch(() => setFeedState("error"));
  }, []);

  const visiblePosts = useMemo(
    () =>
      posts
        .filter((post) => !hidden.has(post.id))
        .filter((post) => {
          if (filter === "全部") return true;
          if (filter === "关注") return followed.has(post.ownerName);
          return (
            post.postType === filter ||
            (filter === "版本发布" && Boolean(post.productSlug))
          );
        }),
    [filter, followed, hidden, posts],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (text.trim().length < 2) return;
    setSending(true);
    const response = await fetch("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "post",
        content: text,
        imageUrl,
        linkedProductRef,
        postType,
      }),
    });
    if (response.status === 401) {
      window.location.assign("/signin?return_to=%2Ffeed");
      return;
    }
    if (response.ok) {
      const data = (await response.json()) as { post: Record<string, unknown> };
      setPosts((current) => [hydratePost(data.post), ...current]);
      setText("");
      setImageUrl("");
      setLinkedProductRef("");
      setPostType("记录");
      setExpanded(false);
      setTool(null);
      setNotice("动态已经发布");
    } else setNotice("发布失败，请检查图片链接后重试");
    setSending(false);
  };

  const toggleLike = async (post: CommunityPost) => {
    const response = await fetch("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "toggle_action",
        kind: "like_post",
        targetRef: String(post.id),
      }),
    });
    if (response.status === 401) {
      window.location.assign("/signin?return_to=%2Ffeed");
      return;
    }
    if (!response.ok) return;
    const data = (await response.json()) as { active: boolean };
    setLiked((current) => {
      const next = new Set(current);
      const key = String(post.id);
      if (data.active) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const openComments = async (post: CommunityPost) => {
    if (commentsOpen === post.id) {
      setCommentsOpen(null);
      return;
    }
    setCommentsOpen(post.id);
    setCommentText("");
    const response = await fetch(
      `/api/comments?targetType=post&targetRef=${encodeURIComponent(String(post.id))}`,
      { cache: "no-store" },
    );
    if (response.ok) {
      const data = (await response.json()) as { comments: Comment[] };
      setComments((current) => ({
        ...current,
        [String(post.id)]: data.comments,
      }));
    }
  };

  const sendComment = async (post: CommunityPost) => {
    if (commentText.trim().length < 2) return;
    const response = await fetch("/api/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetType: "post",
        targetRef: String(post.id),
        content: commentText,
      }),
    });
    if (response.status === 401) {
      window.location.assign("/signin?return_to=%2Ffeed");
      return;
    }
    if (response.ok) {
      const data = (await response.json()) as { comment: Comment };
      setComments((current) => ({
        ...current,
        [String(post.id)]: [...(current[String(post.id)] ?? []), data.comment],
      }));
      setCommentText("");
    }
  };

  const share = async (post: CommunityPost) => {
    const url = `${window.location.origin}/feed#post-${post.id}`;
    try {
      if (navigator.share)
        await navigator.share({
          title: `${post.ownerName} 的造场动态`,
          text: post.content,
          url,
        });
      else {
        await navigator.clipboard.writeText(url);
        setNotice("动态链接已复制");
      }
    } catch {
      setNotice("浏览器未允许分享或复制，请从地址栏手动复制链接");
    }
  };

  const enterRoom = async (topic: string) => {
    setActiveRoom(topic);
    setRoomText("");
    const response = await fetch(
      `/api/comments?targetType=live_room&targetRef=${encodeURIComponent(topic)}`,
      { cache: "no-store" },
    );
    if (response.ok) {
      const data = (await response.json()) as { comments: Comment[] };
      setRoomComments(data.comments);
    }
  };
  const sendRoomComment = async () => {
    if (!activeRoom || roomText.trim().length < 2) return;
    setSendingRoom(true);
    const response = await fetch("/api/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetType: "live_room",
        targetRef: activeRoom,
        content: roomText,
      }),
    });
    if (response.status === 401) {
      window.location.assign("/signin?return_to=%2Ffeed");
      return;
    }
    if (response.ok) {
      const data = (await response.json()) as { comment: Comment };
      setRoomComments((current) => [...current, data.comment]);
      setRoomText("");
    } else setNotice("讨论发送失败，请稍后重试");
    setSendingRoom(false);
  };

  return (
    <div className="feed-page-layout">
      <div className="feed-stream">
        <header className="route-hero minimal">
          <div>
            <span className="deep-eyebrow">
              <Radio size={14} /> COMMUNITY SIGNAL
            </span>
            <h1>作品之外，正在发生</h1>
            <p>版本、过程、失败和共创请求，构成一件作品真正的生长记录。</p>
          </div>
        </header>
        <form
          className={expanded ? "deep-composer expanded" : "deep-composer"}
          onSubmit={submit}
        >
          <span className="deep-avatar ink">我</span>
          <div className="composer-body">
            <textarea
              value={text}
              onFocus={() => setExpanded(true)}
              onChange={(event) => setText(event.target.value)}
              placeholder="此刻你在造什么？"
              maxLength={280}
            />
            <AnimatePresence>
              {expanded && (
                <motion.div
                  className="composer-tools"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <div>
                    <button
                      type="button"
                      className={tool === "image" ? "active" : ""}
                      onClick={() => setTool(tool === "image" ? null : "image")}
                      title="图片链接"
                    >
                      <ImageIcon size={17} />
                    </button>
                    <button
                      type="button"
                      className={tool === "link" ? "active" : ""}
                      onClick={() => setTool(tool === "link" ? null : "link")}
                      title="关联作品"
                    >
                      <Link2 size={17} />
                    </button>
                    <button
                      type="button"
                      className={tool === "emoji" ? "active" : ""}
                      onClick={() => setTool(tool === "emoji" ? null : "emoji")}
                      title="表情"
                    >
                      <SmilePlus size={17} />
                    </button>
                    <select
                      value={postType}
                      onChange={(event) =>
                        setPostType(event.target.value as typeof postType)
                      }
                      aria-label="动态类型"
                    >
                      <option>记录</option>
                      <option>版本发布</option>
                      <option>共创招募</option>
                    </select>
                  </div>
                  <span>{text.length}/280</span>
                  <button
                    className="composer-send"
                    disabled={sending || text.trim().length < 2}
                  >
                    {sending ? "发布中" : "发布"}
                    <Send size={16} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            {tool === "image" && (
              <div className="composer-option">
                <ImageIcon size={15} />
                <input
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                  placeholder="粘贴图片 URL（https://）"
                />
                <button
                  type="button"
                  onClick={() => {
                    setImageUrl("");
                    setTool(null);
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {tool === "link" && (
              <div className="composer-option">
                <Link2 size={15} />
                <select
                  value={linkedProductRef}
                  onChange={(event) => setLinkedProductRef(event.target.value)}
                >
                  <option value="">选择关联作品</option>
                  {products.map((product) => (
                    <option
                      value={String(product.slug ?? product.id)}
                      key={product.id}
                    >
                      {product.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {tool === "emoji" && (
              <div className="composer-emoji">
                {["✨", "🌱", "🪐", "🎧", "🧩", "💡"].map((emoji) => (
                  <button
                    type="button"
                    key={emoji}
                    onClick={() => setText((value) => `${value}${emoji}`)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        </form>
        <div className="feed-filter-tabs">
          {["全部", "关注", "版本发布", "共创招募"].map((item) => (
            <button
              key={item}
              className={filter === item ? "active" : ""}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <section className="deep-post-list">
          <AnimatePresence initial={false}>
            {visiblePosts.map((post, index) => (
              <motion.article
                id={`post-${post.id}`}
                key={post.id}
                layout
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.04, 0.2) }}
              >
                <span className={`deep-avatar ${post.color}`}>
                  {post.ownerInitial}
                </span>
                <div className="deep-post-body">
                  <div className="deep-post-author">
                    <span>
                      <strong>{post.ownerName}</strong>
                      <small>
                        {post.role} · {post.createdAt}
                        {post.postType ? ` · ${post.postType}` : ""}
                      </small>
                    </span>
                    <div className="post-menu-wrap">
                      <button
                        onClick={() =>
                          setMenuOpen(menuOpen === post.id ? null : post.id)
                        }
                        aria-label="动态菜单"
                      >
                        <MoreHorizontal size={17} />
                      </button>
                      {menuOpen === post.id && (
                        <div className="post-menu">
                          <button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(post.content);
                                setNotice("正文已复制");
                              } catch {
                                setNotice("浏览器未允许复制，请手动选择正文");
                              }
                              setMenuOpen(null);
                            }}
                          >
                            <Copy size={14} /> 复制正文
                          </button>
                          <button
                            onClick={() => {
                              setHidden((current) =>
                                new Set(current).add(post.id),
                              );
                              setMenuOpen(null);
                            }}
                          >
                            <X size={14} /> 不感兴趣
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <p>{post.content}</p>
                  {post.image && (
                    <motion.img
                      src={post.image}
                      alt="动态附图"
                      whileHover={{ scale: 1.012 }}
                    />
                  )}
                  {post.productSlug && (
                    <Link
                      className="linked-work"
                      href={`/product/${post.productSlug}`}
                    >
                      <span>
                        <Sparkles size={15} /> 关联作品
                      </span>
                      <strong>查看这次版本变化</strong>
                      <ArrowUpRight size={16} />
                    </Link>
                  )}
                  <div className="deep-post-actions">
                    <button
                      className={liked.has(String(post.id)) ? "liked" : ""}
                      onClick={() => toggleLike(post)}
                    >
                      <Heart
                        size={17}
                        fill={
                          liked.has(String(post.id)) ? "currentColor" : "none"
                        }
                      />{" "}
                      {post.likes + (liked.has(String(post.id)) ? 1 : 0)}
                    </button>
                    <button
                      className={commentsOpen === post.id ? "active" : ""}
                      onClick={() => openComments(post)}
                    >
                      <MessageCircle size={17} />{" "}
                      {post.comments + (comments[String(post.id)]?.length ?? 0)}
                    </button>
                    <button onClick={() => share(post)}>
                      <ArrowUpRight size={17} /> 分享
                    </button>
                  </div>
                  {commentsOpen === post.id && (
                    <div className="post-comments">
                      <div>
                        {(comments[String(post.id)] ?? []).map((comment) => (
                          <article key={comment.id}>
                            <span>{comment.ownerName[0]}</span>
                            <p>
                              <strong>{comment.ownerName}</strong>
                              {comment.content}
                            </p>
                          </article>
                        ))}
                      </div>
                      <label>
                        <input
                          value={commentText}
                          onChange={(event) =>
                            setCommentText(event.target.value)
                          }
                          placeholder="写下具体回应"
                        />
                        <button
                          onClick={() => sendComment(post)}
                          disabled={commentText.trim().length < 2}
                        >
                          <Send size={14} />
                        </button>
                      </label>
                    </div>
                  )}
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
          {visiblePosts.length === 0 && (
            <div className="route-empty">
              <Users size={28} />
              <strong>
                {feedState === "loading"
                  ? "正在读取公开动态"
                  : feedState === "error"
                    ? "动态暂时无法读取"
                    : filter === "关注"
                      ? "关注创作者后，动态会出现在这里"
                      : "当前还没有公开动态"}
              </strong>
              {feedState === "ready" && filter !== "全部" && (
                <button onClick={() => setFilter("全部")}>查看全部</button>
              )}
            </div>
          )}
        </section>
      </div>
      <aside className="feed-context">
        <section>
          <span className="deep-eyebrow">
            <Users size={14} /> DISCUSSION ROOMS
          </span>
          <h3>开放讨论</h3>
          {[
            "从 MVP 删到只剩一次点击",
            "独立产品如何找到第一批用户",
            "环境声音采样接龙",
          ].map((topic, index) => (
            <button
              className={activeRoom === topic ? "active" : ""}
              key={topic}
              onClick={() => enterRoom(topic)}
            >
              <i className={["coral", "blue", "yellow"][index]} />
              <span>
                <strong>{topic}</strong>
                <small>{liveRoomStats[topic] ?? 0} 条近 24 小时回应</small>
              </span>
              {activeRoom === topic && <Check size={14} />}
            </button>
          ))}
        </section>
        {activeRoom && (
          <section className="live-room-panel">
            <span className="deep-eyebrow">ROOM OPEN</span>
            <h3>{activeRoom}</h3>
            <div>
              {roomComments.map((comment) => (
                <article key={comment.id}>
                  <b>{comment.ownerName[0]}</b>
                  <p>
                    <strong>{comment.ownerName}</strong>
                    {comment.content}
                  </p>
                </article>
              ))}
              {roomComments.length === 0 && (
                <small>还没有记录，写下第一条具体回应。</small>
              )}
            </div>
            <label>
              <input
                value={roomText}
                onChange={(event) => setRoomText(event.target.value)}
                placeholder="加入当前讨论"
                maxLength={360}
              />
              <button
                onClick={sendRoomComment}
                disabled={sendingRoom || roomText.trim().length < 2}
              >
                <Send size={14} />
              </button>
            </label>
          </section>
        )}
        <section className="feed-streak">
          <span>社区记录原则</span>
          <strong>
            过程<small>优先</small>
          </strong>
          <p>写下版本变化、失败原因和下一步；发布动态不会额外发行果子。</p>
        </section>
      </aside>
      {notice && (
        <button className="action-toast" onClick={() => setNotice("")}>
          <Check size={15} />
          {notice}
        </button>
      )}
    </div>
  );
}
