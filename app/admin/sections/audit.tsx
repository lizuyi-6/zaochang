"use client";

import { Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { adminErrorMessage, adminRequest, type AuditEvent } from "../admin-api";

export function AuditSection({ onStatus }: { onStatus: (message: string, kind: "success" | "error") => void }) {
  const [source, setSource] = useState<"all" | "admin" | "mcp">("all");
  const [action, setAction] = useState("");
  const [appliedAction, setAppliedAction] = useState("");
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [cursorStack, setCursorStack] = useState<string[]>([""]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (selectedSource: "all" | "admin" | "mcp", selectedAction: string, cursor: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedSource !== "all") params.set("source", selectedSource);
      if (selectedAction) params.set("action", selectedAction);
      if (cursor) params.set("cursor", cursor);
      const result = await adminRequest<{ events: AuditEvent[]; nextCursor: string | null }>(`/api/admin/audit?${params}`, { cache: "no-store" });
      setEvents(result.events);
      setNextCursor(result.nextCursor);
    } catch (error) {
      onStatus(adminErrorMessage("读取审计日志", error), "error");
    } finally {
      setLoading(false);
    }
  }, [onStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load("all", "", ""); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = action.trim();
    setAppliedAction(value);
    setCursorStack([""]);
    await load(source, value, "");
  }

  async function changeSource(value: "all" | "admin" | "mcp") {
    setSource(value);
    setCursorStack([""]);
    await load(value, appliedAction, "");
  }

  async function nextPage() {
    if (!nextCursor) return;
    setCursorStack((stack) => [...stack, nextCursor]);
    await load(source, appliedAction, nextCursor);
  }

  async function previousPage() {
    if (cursorStack.length < 2) return;
    const stack = cursorStack.slice(0, -1);
    setCursorStack(stack);
    await load(source, appliedAction, stack[stack.length - 1]);
  }

  return <section className="admin-panel">
    <header className="admin-section-heading"><div><p className="admin-eyebrow">AUDIT LOG</p><h2>审计日志</h2><p>管理操作与 MCP 工具写入记录，按时间倒序分页。</p></div></header>
    <form className="admin-audit-search" onSubmit={(event) => void search(event)}>
      <label>来源<select value={source} onChange={(event) => void changeSource(event.target.value as "all" | "admin" | "mcp")}><option value="all">全部来源</option><option value="admin">管理操作</option><option value="mcp">MCP 写入</option></select></label>
      <label>操作<input value={action} onChange={(event) => setAction(event.target.value)} maxLength={100} placeholder="例如 suspend_member" /></label>
      <button type="submit" disabled={loading}><Search size={14} /> 筛选</button>
    </form>
    {loading ? <p className="admin-muted">正在读取审计…</p> : events.length ? <div className="admin-audit-list">{events.map((event) => <article key={`${event.source}:${event.id}`}>
      <div><strong>{event.action} <em className={event.source === "mcp" ? "admin-source-mcp" : "admin-source-admin"}>{event.source === "mcp" ? "MCP" : "管理操作"}</em></strong>
        <small>{event.actorEmail} · {event.targetType} / {event.targetRef} · {event.createdAt}</small>
        {event.source === "mcp" && <small>{event.credentialKind} · credential {event.credentialId} · result {event.result}</small>}
        {event.detail && <p>{event.detail}</p>}
      </div>
    </article>)}</div> : <p className="admin-empty-state">没有匹配的审计记录</p>}
    <footer className="admin-pagination"><button type="button" onClick={() => void previousPage()} disabled={cursorStack.length < 2 || loading}>上一页</button><span>每页 50 条</span><button type="button" onClick={() => void nextPage()} disabled={!nextCursor || loading}>下一页</button></footer>
  </section>;
}
