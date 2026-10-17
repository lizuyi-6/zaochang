"use client";

import { Copy, UserPlus, X } from "lucide-react";
import { invitationStatus, type Invitation } from "../admin-api";

export function InvitationsSection({ invitations, draft, setDraft, newCode, onCreate, onCopy, onRevoke, busy } : {
  invitations: Invitation[];
  draft: { label: string; maxUses: number; expiresDays: number };
  setDraft: (update: (current: { label: string; maxUses: number; expiresDays: number }) => { label: string; maxUses: number; expiresDays: number }) => void;
  newCode: string;
  onCreate: () => void;
  onCopy: () => void;
  onRevoke: (invitation: Invitation) => void;
  busy: boolean;
}) {
  return <div className="admin-section-stack">
    <section className="admin-panel">
      <header className="admin-section-heading"><div><p className="admin-eyebrow">INVITATIONS</p><h2>公开测试邀请码</h2><p>新码只在创建时显示一次，请立即复制保存。</p></div></header>
      <div className="admin-invitation-form">
        <label>用途<input value={draft.label} maxLength={80} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} /></label>
        <label>可用次数<input type="number" min={1} max={25} value={draft.maxUses} onChange={(event) => setDraft((current) => ({ ...current, maxUses: Number(event.target.value) }))} /></label>
        <label>有效天数<input type="number" min={1} max={90} value={draft.expiresDays} onChange={(event) => setDraft((current) => ({ ...current, expiresDays: Number(event.target.value) }))} /></label>
        <button type="button" disabled={busy || draft.maxUses < 1 || draft.maxUses > 25 || draft.expiresDays < 1 || draft.expiresDays > 90} onClick={onCreate}><UserPlus size={15} /> 生成邀请码</button>
      </div>
      {newCode && <div className="admin-invitation-code" role="status"><code>{newCode}</code><button type="button" onClick={onCopy}><Copy size={14} /> 复制</button><small>离开或刷新后不再显示明文</small></div>}
    </section>
    <section className="admin-panel">
      <header className="admin-section-heading"><div><h2>邀请码记录</h2><p>有效、已用完、已过期和已撤销记录。</p></div></header>
      {invitations.length ? <div className="admin-record-list">{invitations.map((invitation) => {
        const status = invitationStatus(invitation);
        return <article key={invitation.id}>
          <div><strong>{invitation.label}</strong><small>{invitation.usesCount}/{invitation.maxUses} 次 · 到期 {invitation.expiresAt} · {status}{invitation.lastUsedAt ? ` · 最近使用 ${invitation.lastUsedAt}` : ""}</small></div>
          <button type="button" className="admin-danger-outline" disabled={status !== "有效" || busy} onClick={() => onRevoke(invitation)}><X size={14} /> 撤销</button>
        </article>;
      })}</div> : <p className="admin-empty-state">还没有邀请码</p>}
    </section>
  </div>;
}
