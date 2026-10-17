"use client";

import { Search, Undo2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { adminErrorMessage, adminRequest } from "../admin-api";

type ContentType = "product" | "post" | "comment";
type ContentItem = { id: number; ownerEmail: string; ownerName?: string; title?: string; body: string; createdAt: string; moderationStatus: string; reviewStatus?: string; contentStatus?: string; contentType?: string; targetType?: string; targetRef?: string };

export function ContentSection({ refreshKey, busy, onAction, onStatus }: {
  refreshKey: number;
  busy: boolean;
  onAction: (action: "takedown" | "restore", type: ContentType, item: ContentItem) => void;
  onStatus: (message: string, kind: "success" | "error") => void;
}) {
  const [type, setType] = useState<ContentType>("product");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [items, setItems] = useState<ContentItem[]>([]);
  const [cursorStack, setCursorStack] = useState<string[]>([""]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadPage = useCallback(async (selectedType: ContentType, q: string, cursor: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: selectedType, q });
      if (cursor) params.set("cursor", cursor);
      const result = await adminRequest<{ items: ContentItem[]; nextCursor: string | null }>(`/api/admin/content?${params}`, { cache: "no-store" });
      setItems(result.items);
      setNextCursor(result.nextCursor);
    } catch (error) {
      onStatus(adminErrorMessage("读取内容", error), "error");
    } finally {
      setLoading(false);
    }
  }, [onStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPage(type, appliedQuery, cursorStack[cursorStack.length - 1]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshKey, type, appliedQuery, cursorStack, loadPage]);

  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = query.trim();
    setAppliedQuery(q);
    setCursorStack([""]);
  }

  function changeType(value: ContentType) {
    setType(value);
    setCursorStack([""]);
  }

  function nextPage() {
    if (!nextCursor) return;
    setCursorStack((stack) => [...stack, nextCursor]);
  }

  function previousPage() {
    if (cursorStack.length < 2) return;
    const stack = cursorStack.slice(0, -1);
    setCursorStack(stack);
  }

  return <section className="admin-panel">
    <header className="admin-section-heading"><div><p className="admin-eyebrow">CONTENT CONTROL</p><h2>内容管理</h2><p>搜索全部状态的作品、帖子和评论，可主动下架已上线内容。</p></div></header>
    <form className="admin-content-search" onSubmit={(event) => void search(event)}>
      <label><span>内容类型</span><select value={type} onChange={(event) => void changeType(event.target.value as ContentType)}><option value="product">作品</option><option value="post">帖子</option><option value="comment">评论</option></select></label>
      <label className="admin-search-input"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} placeholder="标题、正文或作者邮箱" /></label>
      <button type="submit" disabled={loading}><Search size={14} /> 搜索</button>
    </form>
    {loading ? <p className="admin-muted">正在搜索内容…</p> : items.length ? <div className="admin-record-list">{items.map((item) => <article key={`${type}:${item.id}`}>
      <div className="admin-content-item">
        <strong>{item.title || `${type === "post" ? "帖子" : type === "comment" ? "评论" : "作品"} #${item.id}`}</strong>
        <small>{item.ownerName ?? item.ownerEmail} · {item.ownerEmail} · {item.createdAt}</small>
        <p>{item.body}</p>
        {type === "product" && <small>审核：{item.reviewStatus} · 发布状态：{item.contentStatus} · 管控：{item.moderationStatus}</small>}
        {type === "post" && <small>类型：{item.contentType} · 管控：{item.moderationStatus}</small>}
        {type === "comment" && <small>目标：{item.targetType} / {item.targetRef} · 管控：{item.moderationStatus}</small>}
      </div>
      {item.moderationStatus === "hidden"
        ? type === "product"
          ? <p className="admin-muted">作品不能在此恢复；作者修改后重新提交，按正常预审流程处理。</p>
          : <button type="button" disabled={busy} onClick={() => onAction("restore", type, item)}><Undo2 size={14} /> 恢复显示</button>
        : <button type="button" className="admin-danger-outline" disabled={busy} onClick={() => onAction("takedown", type, item)}>主动下架</button>}
    </article>)}</div> : <p className="admin-empty-state">没有符合条件的内容</p>}
    <footer className="admin-pagination"><button type="button" onClick={() => previousPage()} disabled={cursorStack.length < 2 || loading}>上一页</button><span>每页 50 条，按创建时间倒序</span><button type="button" onClick={() => nextPage()} disabled={!nextCursor || loading}>下一页</button></footer>
    <p className="admin-policy-note">作品下架会处理一次解锁订单、撤销权益；帖子和评论可恢复。钱包异常会保持复核状态并返回错误，不提供此处改账功能。</p>
  </section>;
}
