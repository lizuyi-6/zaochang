"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, MessageCircle, Radio, Search, Send, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Reveal } from "../components/reveal";
import { circles } from "../lib/community-data";

type Circle = (typeof circles)[number];
type TopicComment = { id: number; ownerName: string; content: string; createdAt: string };
type CircleStat = { slug: string; members: number; recentDiscussions: number };
const circleTopics = ["本周进展与删除", "需要真实用户反馈", "寻找共创伙伴"];

export function CirclesClient() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"discussion" | "members">("discussion");
  const [selected, setSelected] = useState<Circle | null>(null);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<Record<string, CircleStat>>({});
  const [notice, setNotice] = useState("");
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [topicComments, setTopicComments] = useState<TopicComment[]>([]);
  const [topicText, setTopicText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch("/api/community", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => {
      const payload = data as { actions?: { kind: string; targetRef: string }[]; circleStats?: CircleStat[] } | null;
      setJoined(new Set((payload?.actions ?? []).filter((item) => item.kind === "join_circle").map((item) => item.targetRef)));
      setStats(Object.fromEntries((payload?.circleStats ?? []).map((item) => [item.slug, item])));
    }).catch(() => undefined);
  }, []);

  const visible = useMemo(() => circles.filter((circle) => `${circle.name} ${circle.topic}`.includes(query.trim())).sort((a, b) => sort === "members" ? (stats[b.slug]?.members ?? 0) - (stats[a.slug]?.members ?? 0) : (stats[b.slug]?.recentDiscussions ?? 0) - (stats[a.slug]?.recentDiscussions ?? 0)), [query, sort, stats]);
  const enterCircle = (circle: Circle) => { setSelected(circle); setActiveTopic(null); setTopicComments([]); setTopicText(""); };
  const openTopic = async (topic: string) => {
    if (!selected) return;
    setActiveTopic(topic); setTopicText("");
    const targetRef = `${selected.slug}:${circleTopics.indexOf(topic)}`;
    const response = await fetch(`/api/comments?targetType=circle_topic&targetRef=${encodeURIComponent(targetRef)}`, { cache: "no-store" });
    if (response.ok) setTopicComments(((await response.json()) as { comments: TopicComment[] }).comments);
  };
  const sendTopicComment = async () => {
    if (!selected || !activeTopic || topicText.trim().length < 2) return;
    setSending(true);
    const targetRef = `${selected.slug}:${circleTopics.indexOf(activeTopic)}`;
    const response = await fetch("/api/comments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetType: "circle_topic", targetRef, content: topicText }) });
    if (response.status === 401) { window.location.assign(`/signin?return_to=${encodeURIComponent(`/circles#${selected.slug}`)}`); return; }
    if (response.ok) { const data = await response.json() as { comment: TopicComment }; setTopicComments((items) => [...items, data.comment]); setTopicText(""); }
    else setNotice("回应未发送，请稍后重试");
    setSending(false);
  };
  const toggleJoin = async (circle: Circle) => {
    const response = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "toggle_action", kind: "join_circle", targetRef: circle.slug }) });
    if (response.status === 401) { window.location.assign(`/signin?return_to=${encodeURIComponent(`/circles#${circle.slug}`)}`); return; }
    if (!response.ok) { setNotice("圈子状态没有更新"); return; }
    const data = await response.json() as { active: boolean };
    setJoined((current) => {
      const next = new Set(current);
      if (data.active) next.add(circle.slug);
      else next.delete(circle.slug);
      return next;
    });
    setStats((current) => ({ ...current, [circle.slug]: { slug: circle.slug, recentDiscussions: current[circle.slug]?.recentDiscussions ?? 0, members: Math.max(0, (current[circle.slug]?.members ?? 0) + (data.active ? 1 : -1)) } }));
  };

  return <div className="circles-page"><header className="route-hero circles-hero"><div><span className="deep-eyebrow"><Users size={14} /> {circles.length} TOPIC CIRCLES</span><h1>围绕做东西，形成关系</h1><p>成员数来自实际加入记录，讨论数统计最近七天公开回应；平台目前不展示无法可靠计算的“在线人数”。</p></div><label className="inline-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索圈子或话题" /></label></header>
    <section className="circle-featured-grid">{circles.slice(0, 2).map((circle, index) => <Reveal key={circle.slug} delay={index * .08}><article id={circle.slug} className={`circle-featured ${circle.color}`}><div className="circle-featured-head"><span><i />{circle.name}</span><small>{stats[circle.slug]?.recentDiscussions ?? 0} 条近期讨论</small></div><h2>{circle.topic}</h2><p>{index === 0 ? "分享这一周主动删掉的功能，以及它让核心体验变清楚的瞬间。" : "用一分钟录音回应上一个人，最后拼成一张城市的声音地图。"}</p><div className="circle-member-stack"><small>{stats[circle.slug]?.members ?? 0} 位实际成员</small></div><button onClick={() => enterCircle(circle)}>进入圈子 <ArrowRight size={16} /></button><div className="circle-rings"><i /><i /><i /></div></article></Reveal>)}</section>
    <section className="all-circles"><div className="deep-section-heading"><div><span className="deep-eyebrow"><Radio size={14} /> DIRECTORY</span><h2>全部圈子</h2></div><button onClick={() => setSort((value) => value === "discussion" ? "members" : "discussion")}>按{sort === "discussion" ? "近期讨论" : "成员数"}排序</button></div><div className="circle-list">{visible.map((circle, index) => <button onClick={() => enterCircle(circle)} id={circle.slug} key={circle.slug}><span className={`circle-number ${circle.color}`}>0{index + 1}</span><span><strong>{circle.name}</strong><small>{circle.topic}</small></span><span><Users size={14} /> {stats[circle.slug]?.members ?? 0}</span><span><MessageCircle size={14} /> {stats[circle.slug]?.recentDiscussions ?? 0}</span><ArrowRight size={16} /></button>)}</div>{visible.length === 0 && <div className="route-empty"><Search size={28} /><strong>没有找到相关圈子</strong><button onClick={() => setQuery("")}>清除搜索</button></div>}</section>
    <AnimatePresence>{selected && <motion.div className="action-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><motion.section className={`circle-room-modal ${selected.color}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}><header><div>{activeTopic && <button className="circle-topic-back" onClick={() => setActiveTopic(null)}><ArrowLeft size={14} /> 返回话题</button>}<small>{stats[selected.slug]?.recentDiscussions ?? 0} RECENT DISCUSSIONS</small><h2>{selected.name}</h2></div><button onClick={() => setSelected(null)} aria-label="关闭"><X size={18} /></button></header>{activeTopic ? <div className="circle-topic-detail"><span>TOPIC / {String(circleTopics.indexOf(activeTopic) + 1).padStart(2, "0")}</span><h3>{activeTopic}</h3><div className="circle-topic-comments">{topicComments.map((comment) => <article key={comment.id}><b>{comment.ownerName[0]}</b><div><strong>{comment.ownerName}</strong><small>{comment.createdAt}</small><p>{comment.content}</p></div></article>)}{topicComments.length === 0 && <small>还没有回应，写下第一条具体进展。</small>}</div><label><input value={topicText} onChange={(event) => setTopicText(event.target.value)} placeholder="写下具体进展或问题" maxLength={360} /><button onClick={sendTopicComment} disabled={sending || topicText.trim().length < 2}><Send size={15} /></button></label></div> : <><h3>{selected.topic}</h3><p>这里显示真实持久化讨论，不生成在线人数或成员规模。</p><div className="circle-room-topics">{circleTopics.map((item, index) => <button key={item} onClick={() => openTopic(item)}><span>0{index + 1}</span><strong>{item}</strong><ArrowRight size={15} /></button>)}</div><footer><button className={joined.has(selected.slug) ? "joined" : "primary-action"} onClick={() => toggleJoin(selected)}>{joined.has(selected.slug) ? <><Check size={15} /> 已加入</> : <><Users size={15} /> 加入圈子</>}</button></footer></>}</motion.section></motion.div>}</AnimatePresence>
    {notice && <button className="action-toast" onClick={() => setNotice("")}><Check size={15} />{notice}</button>}
  </div>;
}
