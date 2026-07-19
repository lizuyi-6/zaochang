"use client";

import { Check, RefreshCw, ShieldAlert, X } from "lucide-react";
import { useEffect, useState } from "react";

type Report = { id: string; targetType: string; targetRef: string; reason: string; details: string; createdAt: string };
type ProductReview = { id: number; ownerEmail: string; ownerName: string; title: string; description: string; category: string; demoUrl: string | null; imageUrl: string | null; price: number; pricingModel: string; reviewStatus: string; reviewVersion: number; submittedAt: string };
type Client = { clientId: string; name: string; websiteUrl: string; allowedScopes: string };
type Risk = { id: string; userEmail: string; kind: string; severity: string; evidence: string; createdAt: string };
type Project = { id: number; name: string; userEmail: string; status: string; currentTask: string; assignedOwner: string | null; nextAction: string; waitingReason: string; progressPercent: number; updatedAt: string };
type Invitation = { id: string; label: string; maxUses: number; usesCount: number; expiresAt: string; revokedAt: string | null; createdBy: string; createdAt: string; lastUsedAt: string | null };
type ModerationData = { reports: Report[]; products: ProductReview[]; clients: Client[]; risks: Risk[] };
type AdminData = { moderation: ModerationData; projects: Project[]; stages: string[]; invitations: Invitation[] };

async function fetchAdminData(): Promise<AdminData> {
  const [moderationResponse, incubationResponse, invitationsResponse] = await Promise.all([
    fetch("/api/admin/moderation", { cache: "no-store" }),
    fetch("/api/admin/incubation", { cache: "no-store" }),
    fetch("/api/admin/invitations", { cache: "no-store" }),
  ]);
  const moderation = moderationResponse.ok
    ? await moderationResponse.json() as AdminData["moderation"]
    : { reports: [], products: [], clients: [], risks: [] };
  const incubation = incubationResponse.ok
    ? await incubationResponse.json() as Pick<AdminData, "projects" | "stages">
    : { projects: [], stages: [] };
  const invitations = invitationsResponse.ok
    ? (await invitationsResponse.json() as { invitations: Invitation[] }).invitations
    : [];
  return { moderation, ...incubation, invitations };
}

export function AdminConsole() {
  const [moderation, setModeration] = useState<ModerationData>({ reports: [], products: [], clients: [], risks: [] });
  const [projects, setProjects] = useState<Project[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [invitationDraft, setInvitationDraft] = useState({ label: "公开测试邀请", maxUses: 1, expiresDays: 14 });
  const [newInvitationCode, setNewInvitationCode] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [notice, setNotice] = useState("");
  const load = async () => {
    const data = await fetchAdminData();
    setModeration(data.moderation);
    setProjects(data.projects);
    setStages(data.stages);
    setInvitations(data.invitations);
  };
  useEffect(() => {
    let active = true;
    void fetchAdminData().then((data) => {
      if (!active) return;
      setModeration(data.moderation);
      setProjects(data.projects);
      setStages(data.stages);
      setInvitations(data.invitations);
    });
    return () => { active = false; };
  }, []);
  const moderate = async (action: string, targetRef: string) => {
    const response = await fetch("/api/admin/moderation", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, targetRef }) });
    const result = await response.json().catch(() => ({})) as { error?: string; remediation?: { refundedPending: number; compensatedSettled: number; revokedEntitlements: number } };
    const remediationText = result.remediation
      ? `；退回 ${result.remediation.refundedPending} 笔待结算订单，补偿 ${result.remediation.compensatedSettled} 笔已结算订单，撤销 ${result.remediation.revokedEntitlements} 份权益`
      : "";
    setNotice(response.ok ? `操作已写入审计记录${remediationText}` : result.error === "moderation_refund_reserve_unavailable" ? "处置未生效：卖家待结算账本不足，内容保持原状态并等待人工对账" : "操作未生效");
    if (response.ok) await load();
  };
  const reviewProduct = async (action: "approve_product" | "reject_product", productId: number) => {
    const note = reviewNotes[productId]?.trim() ?? "";
    const response = await fetch("/api/admin/moderation", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, targetRef: String(productId), note }) });
    const result = await response.json().catch(() => ({})) as { error?: string };
    setNotice(response.ok ? "商品审核决定已写入审计记录" : result.error === "external_demo_requires_immutable_package" ? "无法批准：外部体验链接可被原地替换，请改为站内不可变原型后重新提交" : "商品审核决定未生效");
    if (response.ok) {
      setReviewNotes((current) => { const next = { ...current }; delete next[productId]; return next; });
      await load();
    }
  };
  const updateProject = async (project: Project) => {
    const response = await fetch("/api/admin/incubation", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...project, projectId: project.id, feedback: `项目阶段更新为：${project.status}` }) });
    setNotice(response.ok ? "项目状态已更新" : "项目状态未更新");
    if (response.ok) await load();
  };
  const changeProject = (id: number, patch: Partial<Project>) => setProjects((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const createInvitation = async () => {
    const response = await fetch("/api/admin/invitations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(invitationDraft) });
    const result = await response.json().catch(() => ({})) as { error?: string; invitation?: Invitation & { code: string } };
    if (!response.ok || !result.invitation) {
      setNotice(`邀请码未生成：${result.error ?? "请求失败"}`);
      return;
    }
    setNewInvitationCode(result.invitation.code);
    setNotice("邀请码已生成；明文只显示这一次，请立即复制保存。 ");
    await load();
  };
  const copyInvitation = async () => {
    try {
      await navigator.clipboard.writeText(newInvitationCode);
      setNotice("邀请码已复制到剪贴板。 ");
    } catch {
      setNotice("浏览器未允许自动复制，请手动选择邀请码。 ");
    }
  };
  const revokeInvitation = async (id: string) => {
    const response = await fetch("/api/admin/invitations", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "revoke", id }) });
    const result = await response.json().catch(() => ({})) as { error?: string };
    setNotice(response.ok ? "邀请码已撤销，未使用额度立即失效。 " : `邀请码未撤销：${result.error ?? "请求失败"}`);
    if (response.ok) await load();
  };

  return <main className="admin-console"><header><span><ShieldAlert size={18} /> ZAOCHANG OPERATIONS</span><h1>发布运营控制台</h1><button onClick={() => void load()}><RefreshCw size={15} /> 刷新</button></header>{notice && <p className="admin-notice">{notice}</p>}
    <section><h2>公开测试邀请码</h2><div className="admin-invitation-form"><label>用途<input value={invitationDraft.label} maxLength={80} onChange={(event) => setInvitationDraft((current) => ({ ...current, label: event.target.value }))} /></label><label>可用次数<input type="number" min={1} max={25} value={invitationDraft.maxUses} onChange={(event) => setInvitationDraft((current) => ({ ...current, maxUses: Number(event.target.value) }))} /></label><label>有效天数<input type="number" min={1} max={90} value={invitationDraft.expiresDays} onChange={(event) => setInvitationDraft((current) => ({ ...current, expiresDays: Number(event.target.value) }))} /></label><button onClick={() => void createInvitation()}>生成邀请码</button></div>{newInvitationCode && <div className="admin-invitation-code" role="status"><code>{newInvitationCode}</code><button onClick={() => void copyInvitation()}>复制</button><small>离开或刷新后不再显示明文</small></div>}{invitations.length ? invitations.map((invitation) => <article key={invitation.id}><div><strong>{invitation.label}</strong><small>{invitation.usesCount}/{invitation.maxUses} 次 · 到期 {invitation.expiresAt} · {invitation.revokedAt ? "已撤销" : "有效"}</small></div><button disabled={Boolean(invitation.revokedAt)} onClick={() => void revokeInvitation(invitation.id)}><X size={14} /> 撤销</button></article>) : <p>还没有邀请码</p>}</section>
    <section><h2>商品发布预审</h2>{moderation.products.length ? moderation.products.map((product) => <article className="admin-product-review" key={product.id}><div><strong>{product.title}</strong><small>{product.ownerName} · {product.ownerEmail} · V{product.reviewVersion} · {product.submittedAt}</small><p>{product.description}</p><p>{product.category} · {product.pricingModel === "free" ? "免费" : `${product.price} 果 / ${product.pricingModel === "one_time" ? "一次解锁" : "按次体验"}`}</p>{product.demoUrl && <><a href={product.demoUrl} target="_blank" rel="noreferrer">检查体验地址</a><p role="alert">外部链接可被原地替换，当前版本只能驳回并要求改为站内原型。</p></>}{product.imageUrl && <a href={product.imageUrl} target="_blank" rel="noreferrer">检查商品封面</a>}</div><label>审核意见<textarea value={reviewNotes[product.id] ?? ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [product.id]: event.target.value }))} maxLength={500} placeholder="至少 4 个字，说明通过依据或驳回原因" /></label><button disabled={Boolean(product.demoUrl) || (reviewNotes[product.id]?.trim().length ?? 0) < 4} onClick={() => void reviewProduct("approve_product", product.id)}><Check size={14} /> {product.demoUrl ? "外链不可批准" : "批准上线"}</button><button disabled={(reviewNotes[product.id]?.trim().length ?? 0) < 4} onClick={() => void reviewProduct("reject_product", product.id)}><X size={14} /> 驳回</button></article>) : <p>没有待预审商品</p>}</section>
    <section><h2>内容举报</h2>{moderation.reports.length ? moderation.reports.map((report) => <article key={report.id}><div><strong>{report.targetType} / {report.targetRef}</strong><small>{report.reason} · {report.createdAt}</small><p>{report.details || "未补充说明"}</p></div><button onClick={() => void moderate("hide_reported_content", report.id)}><Check size={14} /> {report.targetType === "product" ? "下架并处理一次解锁订单" : "隐藏内容"}</button><button onClick={() => void moderate("dismiss_report", report.id)}><X size={14} /> 驳回</button></article>) : <p>没有待处理举报</p>}</section>
    <section><h2>第三方应用审核</h2>{moderation.clients.length ? moderation.clients.map((client) => <article key={client.clientId}><div><strong>{client.name}</strong><small>{new URL(client.websiteUrl).hostname}</small><p>{client.allowedScopes}</p></div><button onClick={() => void moderate("approve_client", client.clientId)}><Check size={14} /> 验证并批准</button><button onClick={() => void moderate("reject_client", client.clientId)}><X size={14} /> 拒绝</button></article>) : <p>没有待审核应用</p>}</section>
    <section><h2>果子风险事件</h2>{moderation.risks.length ? moderation.risks.map((risk) => <article key={risk.id}><div><strong>{risk.severity} · {risk.kind}</strong><small>{risk.userEmail} · {risk.createdAt}</small><p>{risk.evidence}</p></div><button onClick={() => void moderate("resolve_risk", risk.id)}><Check size={14} /> 已处置</button><button onClick={() => void moderate("dismiss_risk", risk.id)}><X size={14} /> 误报</button></article>) : <p>没有待处理风险事件</p>}</section>
    <section><h2>孵化项目</h2>{projects.length ? projects.map((project) => <article className="admin-project" key={project.id}><div><strong>{project.name}</strong><small>{project.userEmail} · {project.updatedAt}</small></div><label>阶段<select value={project.status} onChange={(event) => changeProject(project.id, { status: event.target.value })}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></label><label>负责人<input value={project.assignedOwner ?? ""} onChange={(event) => changeProject(project.id, { assignedOwner: event.target.value })} /></label><label>当前任务<input value={project.currentTask} onChange={(event) => changeProject(project.id, { currentTask: event.target.value })} /></label><label>下一步<input value={project.nextAction} onChange={(event) => changeProject(project.id, { nextAction: event.target.value })} /></label><label>等待原因<input value={project.waitingReason} onChange={(event) => changeProject(project.id, { waitingReason: event.target.value })} /></label><label>进度<input type="number" min={0} max={100} value={project.progressPercent} onChange={(event) => changeProject(project.id, { progressPercent: Number(event.target.value) })} /></label><button onClick={() => void updateProject(project)}>保存项目状态</button></article>) : <p>没有孵化项目</p>}</section>
  </main>;
}
