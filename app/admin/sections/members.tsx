"use client";

import { Search, ShieldBan, ShieldCheck, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { adminErrorMessage, adminRequest, type Member } from "../admin-api";

type MemberDetail = { member: Member; audit: Array<Record<string, unknown>>; recentProducts: Array<Record<string, unknown>> };

export function MembersSection({ refreshKey, busy, onSuspend, onStatus }: {
  refreshKey: number;
  busy: boolean;
  onSuspend: (member: Member, action: "suspend" | "unsuspend") => void;
  onStatus: (message: string, kind: "success" | "error") => void;
}) {
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "suspended">("all");
  const [members, setMembers] = useState<Member[]>([]);
  const [cursorStack, setCursorStack] = useState<string[]>([""]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const loadPage = useCallback(async (q: string, selectedFilter: "all" | "suspended", cursor: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, filter: selectedFilter });
      if (cursor) params.set("cursor", cursor);
      const result = await adminRequest<{ members: Member[]; nextCursor: string | null }>(`/api/admin/members?${params}`, { cache: "no-store" });
      setMembers(result.members);
      setNextCursor(result.nextCursor);
    } catch (error) {
      onStatus(adminErrorMessage("读取会员列表", error), "error");
    } finally {
      setLoading(false);
    }
  }, [onStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadPage(appliedQuery, filter, cursorStack[cursorStack.length - 1]); }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshKey, appliedQuery, filter, cursorStack, loadPage]);

  useEffect(() => {
    if (!selectedEmail) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void adminRequest<MemberDetail>(`/api/admin/members/detail?email=${encodeURIComponent(selectedEmail)}`, { cache: "no-store" })
        .then((result) => { if (active) setDetail(result); })
        .catch((error) => { if (active) onStatus(adminErrorMessage("读取会员详情", error), "error"); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [refreshKey, selectedEmail, onStatus]);

  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = query.trim();
    setAppliedQuery(q);
    setCursorStack([""]);
    setSelectedEmail("");
    setDetail(null);
  }

  function changeFilter(value: "all" | "suspended") {
    setFilter(value);
    setCursorStack([""]);
    setSelectedEmail("");
    setDetail(null);
  }

  function openDetail(member: Member) {
    if (selectedEmail === member.email) {
      setSelectedEmail("");
      setDetail(null);
      return;
    }
    setSelectedEmail(member.email);
    setDetail(null);
  }

  function nextPage() {
    if (!nextCursor) return;
    const stack = [...cursorStack, nextCursor];
    setCursorStack(stack);
  }

  function previousPage() {
    if (cursorStack.length < 2) return;
    const stack = cursorStack.slice(0, -1);
    setCursorStack(stack);
  }

  return <div className="admin-section-stack">
    <section className="admin-panel">
      <header className="admin-section-heading"><div><p className="admin-eyebrow">MEMBERS</p><h2>会员管理</h2><p>邮箱、显示名或会员号搜索；页面仅向管理员返回会员信息。</p></div></header>
      <form className="admin-member-search" onSubmit={(event) => void search(event)}>
        <label className="admin-search-input"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} placeholder="邮箱、显示名或会员号" /></label>
        <select aria-label="会员筛选" value={filter} onChange={(event) => void changeFilter(event.target.value as "all" | "suspended")}>
          <option value="all">全部会员</option><option value="suspended">仅看已停用</option>
        </select>
        <button type="submit" disabled={loading}><Search size={14} /> 搜索</button>
      </form>
      {loading ? <p className="admin-muted">正在读取会员…</p> : members.length ? <div className="admin-member-list">{members.map((member) => <article className="admin-member-card" key={member.email}>
        <div className="admin-member-avatar"><UserRound size={19} /></div>
        <div className="admin-member-main">
          <div className="admin-member-name"><strong>{member.displayName || "未设置昵称"}</strong>{member.username && <span>{`@${member.username}`}</span>}{member.memberNumber !== null && <span>#{String(member.memberNumber).padStart(4, "0")}</span>}{member.provisioned && <em className="admin-member-tag">管理员开通</em>}{member.onboardingRequired && <em className="admin-member-tag">待完善资料</em>}{member.suspendedAt && <em>已停用</em>}</div>
          <small>{member.email} · 加入于 {member.joinedAt}</small>
          <p>登录：{member.loginMethods.length ? member.loginMethods.join("、") : "无可用登录方式"} · 作品：待审 {member.products.pendingReview} / 已批准 {member.products.approved} / 已驳回 {member.products.rejected}</p>
          <p>钱包：{member.wallet.balance} 果可用 / {member.wallet.pendingBalance} 果待结算 · {member.wallet.status ?? "无钱包"} · 会话 {member.activeSessions} · 有效 API key {member.activeApiKeys}</p>
          <button type="button" className="admin-inline-link" onClick={() => void openDetail(member)}>{selectedEmail === member.email ? "收起详情" : "查看详情"}</button>
        </div>
        <div className="admin-member-actions">
          {member.suspendedAt
            ? <button type="button" disabled={busy} onClick={() => onSuspend(member, "unsuspend")}><ShieldCheck size={14} /> 解封</button>
            : <button type="button" className="admin-danger-outline" disabled={busy} onClick={() => onSuspend(member, "suspend")}><ShieldBan size={14} /> 封禁</button>}
        </div>
        {selectedEmail === member.email && detail?.member.email === member.email && <div className="admin-member-detail">
          <p>停用信息：{detail.member.suspendedAt ? `${detail.member.suspendedAt} · ${detail.member.suspendedReason || "未填写理由"} · 操作者 ${detail.member.suspendedBy ?? "未知"}` : "账号未停用"}</p>
          <div><strong>最近作品</strong>{detail.recentProducts.length ? detail.recentProducts.map((product) => <small key={String(product.id)}>{String(product.title)} · {String(product.reviewStatus)} · {String(product.moderationStatus)}</small>) : <small>暂无作品</small>}</div>
          <div><strong>管理审计</strong>{detail.audit.length ? detail.audit.map((event) => <small key={String(event.id)}>{String(event.action)} · {String(event.createdAt)} · {String(event.detail)}</small>) : <small>暂无审计事件</small>}</div>
        </div>}
      </article>)}</div> : <p className="admin-empty-state">没有符合条件的会员</p>}
      <footer className="admin-pagination">
        <button type="button" onClick={() => void previousPage()} disabled={cursorStack.length < 2 || loading}>上一页</button>
        <span>每页 50 位会员</span>
        <button type="button" onClick={() => void nextPage()} disabled={!nextCursor || loading}>下一页</button>
      </footer>
    </section>
    <p className="admin-policy-note">封禁只影响登录凭证。内容处置请到“内容”分区，钱款和账本另行对账；封禁不会自动下架内容或改动钱包。</p>
  </div>;
}
