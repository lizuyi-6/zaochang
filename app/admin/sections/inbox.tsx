"use client";

import { ArrowRight, AlertTriangle, FileCheck2, Flag, Layers3, WalletCards } from "lucide-react";
import type { AuditEvent, Overview } from "../admin-api";

const dateLabel = (value: string) => new Date(`${value.replace(" ", "T")}Z`).toLocaleString("zh-CN", { timeZone: "UTC" });

export function InboxSection({ overview, recentAudit, onOpen }: {
  overview: Overview | null;
  recentAudit: AuditEvent[];
  onOpen: (section: string) => void;
}) {
  const queues = overview?.queues;
  const items = [
    { id: "reports", title: "果子风险", count: queues?.fruitRisk.total ?? 0, detail: `${queues?.fruitRisk.high ?? 0} 件高风险，按严重度优先复核`, icon: WalletCards },
    { id: "reports", title: "内容举报", count: queues?.reports ?? 0, detail: "需要决定隐藏内容或驳回举报", icon: Flag },
    { id: "review", title: "作品预审", count: queues?.productReviews ?? 0, detail: "检查作品内容、定价与托管包后作出决定", icon: FileCheck2 },
    { id: "review", title: "第三方应用", count: queues?.thirdPartyApps ?? 0, detail: "核对应用信息与申请的权限范围", icon: Layers3 },
    { id: "incubation", title: "孵化项目", count: queues?.incubation ?? 0, detail: "查看项目阶段、负责人和下一步安排", icon: AlertTriangle },
  ];
  const pending = items.filter((item) => item.count > 0);
  return (
    <div className="admin-section-stack">
      <section className="admin-panel">
        <header className="admin-section-heading"><div><p className="admin-eyebrow">INBOX</p><h2>待办收件箱</h2><p>先处理高风险和用户正在等待的事项。</p></div></header>
        {pending.length ? <div className="admin-inbox-list">{pending.map(({ id, title, count, detail, icon: Icon }) => (
          <article className="admin-inbox-card" key={`${id}:${title}`}>
            <span className="admin-inbox-icon"><Icon size={19} /></span>
            <div><strong>{title}</strong><p><b>{count}</b> 件 · {detail}</p></div>
            <button type="button" onClick={() => onOpen(id)}>去处理 <ArrowRight size={15} /></button>
          </article>
        ))}</div> : <p className="admin-empty-state">没有待处理事项</p>}
      </section>

      <section className="admin-panel">
        <header className="admin-section-heading"><div><p className="admin-eyebrow">PLATFORM</p><h2>平台概况</h2><p>统计由服务端聚合，不展示会员明细。</p></div></header>
        {overview ? <div className="admin-metric-grid">
          <Metric label="会员总数" value={overview.members.total} hint={`今日新增 ${overview.members.newToday} · 7 日新增 ${overview.members.new7Days}`} />
          <Metric label="被停用会员" value={overview.members.suspended} hint="不含未登录的封禁理由" />
          <Metric label="作品待预审" value={overview.products.byReviewStatus.pendingReview} hint={`已批准 ${overview.products.byReviewStatus.approved} · 已驳回 ${overview.products.byReviewStatus.rejected}`} />
          <Metric label="帖子总数" value={overview.posts.total} hint="包括已隐藏帖子" />
          <Metric label="可用钱包余额" value={`${overview.fruit.walletBalanceTotal} 果`} hint={`待结算 ${overview.fruit.walletPendingBalanceTotal} 果`} />
          <Metric label="近 24 小时果子操作" value={overview.fruit.operationsLast24h} hint={`复核钱包 ${overview.fruit.reviewWallets} 个`} />
        </div> : <p className="admin-muted">总览数据暂不可用。</p>}
      </section>

      <section className="admin-panel">
        <header className="admin-section-heading"><div><p className="admin-eyebrow">AUDIT</p><h2>最近管理操作</h2><p>最近 10 条后台操作与 MCP 写入记录。</p></div><button type="button" className="admin-secondary-button" onClick={() => onOpen("audit")}>查看全部</button></header>
        {recentAudit.length ? <div className="admin-audit-list">{recentAudit.slice(0, 10).map((event) => (
          <article key={`${event.source}:${event.id}`}>
            <div><strong>{event.action}</strong><small>{event.actorEmail} · {event.source === "mcp" ? "MCP" : "管理后台"} · {event.targetType} / {event.targetRef}</small></div>
            <time dateTime={event.createdAt.replace(" ", "T") + "Z"}>{dateLabel(event.createdAt)}</time>
          </article>
        ))}</div> : <p className="admin-empty-state">暂无管理操作记录</p>}
      </section>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return <div className="admin-metric"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>;
}
