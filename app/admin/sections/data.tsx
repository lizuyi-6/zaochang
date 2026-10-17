"use client";

import { useCallback, useEffect, useState } from "react";
import { adminErrorMessage, adminRequest, type Overview } from "../admin-api";

type ReviewWallet = { email: string; displayName: string; memberNumber: number | null; balance: number; pendingBalance: number; status: string; reviewSince: string };

export function DataSection({ overview, onStatus }: {
  overview: Overview | null;
  onStatus: (message: string, kind: "success" | "error") => void;
}) {
  const [wallets, setWallets] = useState<ReviewWallet[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (pageCursor = "") => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (pageCursor) params.set("cursor", pageCursor);
      const result = await adminRequest<{ wallets: ReviewWallet[]; nextCursor: string | null; reviewTimeField: string }>(`/api/admin/wallets/review?${params}`, { cache: "no-store" });
      setWallets(result.wallets);
      setCursor(pageCursor || null);
      setNextCursor(result.nextCursor);
    } catch (error) {
      onStatus(adminErrorMessage("读取复核钱包", error), "error");
    } finally {
      setLoading(false);
    }
  }, [onStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return <div className="admin-section-stack">
    <section className="admin-panel">
      <header className="admin-section-heading"><div><p className="admin-eyebrow">PLATFORM DATA</p><h2>数据总览</h2><p>聚合统计，不包含会员明细。</p></div></header>
      {overview ? <div className="admin-metric-grid">
        <Metric label="会员" value={overview.members.total} detail={`今日新增 ${overview.members.newToday} · 7 日新增 ${overview.members.new7Days} · 已停用 ${overview.members.suspended}`} />
        <Metric label="作品审核" value={overview.products.byReviewStatus.pendingReview} detail={`待审 · 已批准 ${overview.products.byReviewStatus.approved} · 已驳回 ${overview.products.byReviewStatus.rejected}`} />
        <Metric label="帖子" value={overview.posts.total} detail="包含隐藏内容" />
        <Metric label="待办队列" value={overview.queues.fruitRisk.total + overview.queues.reports + overview.queues.productReviews + overview.queues.thirdPartyApps + overview.queues.incubation} detail={`高风险 ${overview.queues.fruitRisk.high} · 举报 ${overview.queues.reports} · 应用 ${overview.queues.thirdPartyApps}`} />
        <Metric label="可用钱包余额" value={`${overview.fruit.walletBalanceTotal} 果`} detail={`待结算 ${overview.fruit.walletPendingBalanceTotal} 果 · 合计 ${overview.fruit.walletCombinedTotal} 果`} />
        <Metric label="果子活动" value={overview.fruit.operationsLast24h} detail={`近 24 小时 · 复核钱包 ${overview.fruit.reviewWallets} 个`} />
      </div> : <p className="admin-muted">总览数据暂不可用。</p>}
    </section>
    <section className="admin-panel">
      <header className="admin-section-heading"><div><p className="admin-eyebrow">WALLET REVIEW</p><h2>复核钱包</h2><p>只读列表；不提供改账操作。</p></div></header>
      {loading ? <p className="admin-muted">正在读取复核钱包…</p> : wallets.length ? <div className="admin-record-list">{wallets.map((wallet) => <article key={wallet.email}>
        <div><strong>{wallet.displayName} · {wallet.email}</strong><small>{wallet.memberNumber !== null ? `会员号 #${String(wallet.memberNumber).padStart(4, "0")} · ` : ""}可用 {wallet.balance} 果 · 待结算 {wallet.pendingBalance} 果</small></div>
        <time dateTime={wallet.reviewSince.replace(" ", "T") + "Z"}>状态最近更新时间 {wallet.reviewSince}</time>
      </article>)}</div> : <p className="admin-empty-state">没有处于复核状态的钱包</p>}
      <footer className="admin-pagination"><button type="button" onClick={() => void load("")} disabled={!cursor || loading}>第一页</button><span>每页 50 个 · 时间字段 wallets.updated_at</span><button type="button" onClick={() => nextCursor && void load(nextCursor)} disabled={!nextCursor || loading}>下一页</button></footer>
      <p className="admin-policy-note">当前 schema 没有单独的“进入复核”时间列，这里显示 wallets.updated_at（最后状态更新时间）。</p>
    </section>
  </div>;
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div className="admin-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}
