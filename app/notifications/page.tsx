"use client";

import { Bell, Check, Heart, LogIn, MessageCircle, PackageCheck, Sparkles, UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Notification = { id: string; type: "互动" | "讨论" | "作品" | "关注"; title: string; detail: string; createdAt: string; href: string };
const icons = { 互动: Heart, 讨论: MessageCircle, 作品: PackageCheck, 关注: UserPlus };

export default function NotificationsPage() {
  const [filter, setFilter] = useState("全部");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/community", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => {
      const payload = data as { signedIn?: boolean; notifications?: Notification[]; actions?: { kind: string; targetRef: string }[] } | null;
      setSignedIn(Boolean(payload?.signedIn));
      setNotifications(payload?.notifications ?? []);
      setRead(new Set((payload?.actions ?? []).filter((item) => item.kind === "read_notification").map((item) => item.targetRef)));
    }).catch(() => setSignedIn(false));
  }, []);

  const visible = useMemo(() => filter === "全部" ? notifications : notifications.filter((item) => item.type === filter), [filter, notifications]);
  const persistRead = (ids: string[]) => fetch("/api/actions", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "mark_notifications_read", targetRefs: ids }) });
  const markRead = (ids: string[]) => {
    const unread = ids.filter((id) => !read.has(id));
    if (unread.length === 0) return;
    setRead((current) => new Set([...current, ...unread]));
    void persistRead(unread);
  };
  const markAllRead = async () => {
    const unread = notifications.map((item) => item.id).filter((id) => !read.has(id));
    if (unread.length === 0) return;
    setSaving(true);
    const response = await persistRead(unread);
    if (response.status === 401) { window.location.assign("/signin?return_to=%2Fnotifications"); return; }
    if (response.ok) setRead(new Set(notifications.map((item) => item.id)));
    setSaving(false);
  };

  return <div className="notifications-page">
    <header className="route-hero compact"><div><span className="deep-eyebrow"><Bell size={14} /> SIGNAL INBOX</span><h1>与你有关的信号</h1><p>喜欢、讨论、版本和协作邀请集中在这里，不让重要回应沉进信息流。</p></div><button className="primary-action" onClick={markAllRead} disabled={saving || notifications.every((item) => read.has(item.id))}><Check size={16} /> {saving ? "保存中" : "全部已读"}</button></header>
    <div className="notification-tabs">{["全部", "互动", "讨论", "作品", "关注"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div>
    <section className="notification-list">
      {visible.map((item) => { const Icon = icons[item.type]; const isRead = read.has(item.id); return <Link key={item.id} className={isRead ? "read" : ""} href={item.href} onClick={() => markRead([item.id])}><span><Icon size={18} /></span><div><strong>{item.title}</strong><p>{item.detail}</p><small>{item.createdAt}</small></div>{!isRead && <i />}</Link>; })}
      {signedIn === false && <div className="notification-empty"><LogIn size={24} /><strong>登录后查看与你有关的信号</strong><p>作品反馈、喜欢、关注与账户变动会集中在这里。</p><Link className="primary-action" href="/signin?return_to=%2Fnotifications">登录造场</Link></div>}
      {signedIn === true && visible.length === 0 && <div className="notification-empty"><Sparkles size={24} /><strong>{filter === "全部" ? "还没有新的信号" : `暂时没有${filter}通知`}</strong><p>发布作品或参与讨论后，相关回应会出现在这里。</p><Link href="/discover">去探索作品</Link></div>}
    </section>
    <div className="notification-footer"><Sparkles size={15} /> 只保留与你的作品、关系和项目进度直接相关的通知。</div>
  </div>;
}
