"use client";

import { KeyRound, X } from "lucide-react";
import type { HostingGrant } from "../admin-api";

export function HostingGrantsSection({ grants, draft, setDraft, onSubmit, onRevoke, busy }: {
  grants: HostingGrant[];
  draft: { email: string; maxSites: number; note: string };
  setDraft: (update: (current: { email: string; maxSites: number; note: string }) => { email: string; maxSites: number; note: string }) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onRevoke: (grant: HostingGrant) => void;
  busy: boolean;
}) {
  return <div className="admin-section-stack">
    <section className="admin-panel">
      <header className="admin-section-heading"><div><p className="admin-eyebrow">HOSTING ACCESS</p><h2>托管授权</h2><p>授权会员托管静态作品，并设置可使用站点额度。</p></div></header>
      <form className="admin-hosting-grant-form" onSubmit={onSubmit}>
        <label>成员邮箱<input type="email" required maxLength={254} value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} placeholder="name@example.com" /></label>
        <label>站点额度<input type="number" required min={1} max={20} value={draft.maxSites} onChange={(event) => setDraft((current) => ({ ...current, maxSites: Number(event.target.value) }))} /></label>
        <label>备注<input maxLength={300} value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} placeholder="授权说明" /></label>
        <button type="submit" disabled={busy || draft.maxSites < 1 || draft.maxSites > 20}><KeyRound size={15} /> 授予/调整授权</button>
      </form>
    </section>
    <section className="admin-panel">
      <header className="admin-section-heading"><div><h2>授权记录</h2><p>撤销授权也会提交移除该会员托管站点的请求。</p></div></header>
      {grants.length ? <div className="admin-hosting-grant-list">{grants.map((grant) => <article key={`${grant.memberEmail}:${grant.createdAt}`}>
        <div><strong>{grant.memberEmail}</strong><small>额度 {grant.maxSites} · 已用 {grant.usedSites} · {grant.revokedAt ? "已撤销" : "有效"}</small><small>备注：{grant.note || "未填写"} · 授权人：{grant.grantedBy} · {grant.createdAt}</small></div>
        {!grant.revokedAt && <button type="button" className="admin-danger-outline" disabled={busy} onClick={() => onRevoke(grant)}><X size={14} /> 撤销授权</button>}
      </article>)}</div> : <p className="admin-empty-state">暂无托管授权记录</p>}
    </section>
  </div>;
}
