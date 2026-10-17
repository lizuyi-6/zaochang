"use client";

import { Check, X } from "lucide-react";
import type { Report, Risk } from "../admin-api";

const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function ReportsRiskSection({ reports, risks, busy, onModerate, onRiskAction }: {
  reports: Report[];
  risks: Risk[];
  busy: boolean;
  onModerate: (action: "hide_reported_content" | "dismiss_report", report: Report) => void;
  onRiskAction: (action: "resolve_risk" | "dismiss_risk", risk: Risk) => void;
}) {
  const orderedRisks = [...risks].sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3) || a.createdAt.localeCompare(b.createdAt));
  return <div className="admin-section-stack">
    <section className="admin-panel">
      <header className="admin-section-heading"><div><p className="admin-eyebrow">REPORTS</p><h2>内容举报</h2><p>下架作品会执行订单补救并记录资金处理结果。</p></div></header>
      {reports.length ? <div className="admin-record-list">{reports.map((report) => <article key={report.id}>
        <div><strong>{report.targetType} / {report.targetRef}</strong><small>{report.reason} · {report.createdAt}</small><p>{report.details || "未补充说明"}</p></div>
        <button type="button" className="admin-danger-outline" disabled={busy} onClick={() => onModerate("hide_reported_content", report)}><Check size={14} /> {report.targetType === "product" ? "下架并处理一次解锁订单" : "隐藏内容"}</button>
        <button type="button" disabled={busy} onClick={() => onModerate("dismiss_report", report)}><X size={14} /> 驳回举报</button>
      </article>)}</div> : <p className="admin-empty-state">没有待处理举报</p>}
    </section>
    <section className="admin-panel">
      <header className="admin-section-heading"><div><p className="admin-eyebrow">FRUIT RISK</p><h2>果子风险事件</h2><p>高风险事件优先显示；处置不会自动改账。</p></div></header>
      {orderedRisks.length ? <div className="admin-record-list">{orderedRisks.map((risk) => <article key={risk.id}>
        <div><strong><span className={`admin-severity admin-severity-${risk.severity}`}>{risk.severity}</span> · {risk.kind}</strong><small>{risk.userEmail} · {risk.createdAt}</small><p>{risk.evidence}</p></div>
        <button type="button" disabled={busy} onClick={() => onRiskAction("resolve_risk", risk)}><Check size={14} /> 已处置</button>
        <button type="button" disabled={busy} onClick={() => onRiskAction("dismiss_risk", risk)}><X size={14} /> 误报</button>
      </article>)}</div> : <p className="admin-empty-state">没有待处理风险事件</p>}
    </section>
  </div>;
}
