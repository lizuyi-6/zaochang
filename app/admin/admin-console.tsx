"use client";

import { Check, Copy, RefreshCw, ShieldAlert, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { hostingFailureMessage } from "../hosting/hosting-copy";

function pricingModelLabel(pricingModel: string, price: number) {
  if (pricingModel === "free") return "免费";
  if (pricingModel === "one_time") return `${price} 果 / 一次解锁`;
  if (pricingModel === "per_use") return `${price} 果 / 按次体验`;
  // 未知值不能默认为某个收费模型,否则脏数据会被展示成可收费。
  return "未知定价";
}

type Report = { id: string; targetType: string; targetRef: string; reason: string; details: string; createdAt: string };
type AdminHosting = { id: number; state: string; desired: string; reviewVersion: number; approvedVersion: number; bundleFileCount: number; bundleUncompressedBytes: number; bundleSha256: string; previewUrl: string | null; previewExpiresAt: string | null; failureCode: string | null; failureDetail: string | null };
type ProductReview = { id: number; ownerEmail: string; ownerName: string; title: string; description: string; category: string; demoUrl: string | null; imageUrl: string | null; price: number; pricingModel: string; reviewStatus: string; reviewVersion: number; submittedAt: string; hosting: AdminHosting | null };
type Client = { clientId: string; name: string; websiteUrl: string; allowedScopes: string };
type Risk = { id: string; userEmail: string; kind: string; severity: string; evidence: string; createdAt: string };
type Project = { id: number; name: string; userEmail: string; status: string; currentTask: string; assignedOwner: string | null; nextAction: string; waitingReason: string; progressPercent: number; updatedAt: string };
type Invitation = { id: string; label: string; maxUses: number; usesCount: number; expiresAt: string; revokedAt: string | null; createdBy: string; createdAt: string; lastUsedAt: string | null };
type HostingGrant = { memberEmail: string; maxSites: number; note: string; grantedBy: string; createdAt: string; revokedAt: string | null; usedSites: number };
type ModerationData = { reports: Report[]; products: ProductReview[]; clients: Client[]; risks: Risk[] };
type AdminData = { moderation: ModerationData; projects: Project[]; stages: string[]; invitations: Invitation[]; hostingGrants: HostingGrant[]; errors: string[] };

class AdminRequestError extends Error {
  constructor(readonly status: number, readonly code?: string) {
    super(code ?? `http_${status}`);
  }
}

async function adminRequest<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error("network");
  }
  const payload = await response.json().catch(() => null) as { error?: unknown } | null;
  const code = typeof payload?.error === "string" ? payload.error : undefined;
  if (!response.ok) throw new AdminRequestError(response.status, code);
  if (!payload) throw new Error("invalid_response");
  return payload as T;
}

function adminErrorMessage(action: string, error: unknown): string {
  if (error instanceof AdminRequestError) {
    if (error.code === "hosting_not_staged") return `${action}：托管包尚未部署完成，审核决定未生效。`;
    if (error.status === 403) return `${action}：权限不足（403），当前账号无权执行此操作。`;
    if (error.status === 409) return `${action}：状态冲突（409）${error.code ? `（${error.code}）` : ""}，请刷新后确认当前状态。`;
    return `${action}：请求失败（HTTP ${error.status}）${error.code ? `，错误码 ${error.code}` : ""}。`;
  }
  if (error instanceof Error && error.message === "network") return `${action}：网络异常，请检查连接后重试。`;
  if (error instanceof Error && error.message !== "invalid_response") return `${action}：${error.message}。`;
  return `${action}：服务器响应无法读取，请稍后重试。`;
}

function formatHostingBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function hostingStateLabel(state: string): string {
  return ({ queued: "排队中", deploying: "部署中", staged: "待审核预览", promoting: "上线中", live: "已上线", removing: "移除中", removed: "已移除", failed: "失败" } as Record<string, string>)[state] ?? "未知状态";
}

function approvalBlockReason(hosting: AdminHosting | null): string {
  if (!hosting || hosting.state === "staged" || hosting.state === "live") return "";
  if (hosting.state === "failed") return "托管部署失败";
  if (hosting.state === "queued" || hosting.state === "deploying" || hosting.state === "promoting") return "托管包尚未部署完成";
  return "当前托管状态不允许批准";
}

// 状态以"现在还能不能被人拿来注册"为准:已撤销/已用完/已过期都不可再消费,
// 只有三者都不满足才显示「有效」。expires_at 是 UTC 的 "YYYY-MM-DD HH:MM:SS",
// 须显式补 T/Z 解析,否则按本地时区解释会把未过期的码误判过期(反之亦然)。
function invitationStatus(invitation: Invitation) {
  if (invitation.revokedAt) return "已撤销";
  if (invitation.usesCount >= invitation.maxUses) return "已用完";
  if (new Date(`${invitation.expiresAt.replace(" ", "T")}Z`).getTime() <= Date.now()) return "已过期";
  return "有效";
}

async function fetchAdminData(): Promise<AdminData> {
  const results = await Promise.allSettled([
    adminRequest<ModerationData>("/api/admin/moderation", { cache: "no-store" }),
    adminRequest<Pick<AdminData, "projects" | "stages">>("/api/admin/incubation", { cache: "no-store" }),
    adminRequest<{ invitations: Invitation[] }>("/api/admin/invitations", { cache: "no-store" }),
    adminRequest<{ grants: HostingGrant[] }>("/api/admin/hosting-grants", { cache: "no-store" }),
  ]);
  const [moderationResult, incubationResult, invitationResult, grantsResult] = results;
  const errors = results.flatMap((result, index) => result.status === "rejected"
    ? [adminErrorMessage(["读取商品与审核队列", "读取孵化项目", "读取邀请码", "读取托管授权"][index], result.reason)]
    : []);
  return {
    moderation: moderationResult.status === "fulfilled" ? moderationResult.value : { reports: [], products: [], clients: [], risks: [] },
    ...(incubationResult.status === "fulfilled" ? incubationResult.value : { projects: [], stages: [] }),
    invitations: invitationResult.status === "fulfilled" ? invitationResult.value.invitations : [],
    hostingGrants: grantsResult.status === "fulfilled" ? grantsResult.value.grants : [],
    errors,
  };
}

export function AdminConsole() {
  const [moderation, setModeration] = useState<ModerationData>({ reports: [], products: [], clients: [], risks: [] });
  const [projects, setProjects] = useState<Project[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [hostingGrants, setHostingGrants] = useState<HostingGrant[]>([]);
  const [hostingGrantDraft, setHostingGrantDraft] = useState({ email: "", maxSites: 3, note: "" });
  const [invitationDraft, setInvitationDraft] = useState({ label: "公开测试邀请", maxUses: 1, expiresDays: 14 });
  const [newInvitationCode, setNewInvitationCode] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [pendingAction, setPendingAction] = useState("");
  const [notice, setNotice] = useState("");
  const load = async () => {
    const data = await fetchAdminData();
    setModeration(data.moderation);
    setProjects(data.projects);
    setStages(data.stages);
    setInvitations(data.invitations);
    setHostingGrants(data.hostingGrants);
    setNotice(data.errors.join(" "));
    return data.errors.length === 0;
  };
  useEffect(() => {
    let active = true;
    void fetchAdminData().then((data) => {
      if (!active) return;
      setModeration(data.moderation);
      setProjects(data.projects);
      setStages(data.stages);
      setInvitations(data.invitations);
      setHostingGrants(data.hostingGrants);
      setNotice(data.errors.join(" "));
    }).catch((error: unknown) => setNotice(adminErrorMessage("读取管理数据", error)));
    return () => { active = false; };
  }, []);
  const moderate = async (action: string, targetRef: string) => {
    const key = `${action}:${targetRef}`;
    if (pendingAction) return;
    setPendingAction(key);
    setNotice("");
    try {
      const result = await adminRequest<{ remediation?: { refundedPending: number; compensatedSettled: number; revokedEntitlements: number } }>("/api/admin/moderation", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, targetRef }) });
      const remediationText = result.remediation
        ? `；退回 ${result.remediation.refundedPending} 笔待结算订单，补偿 ${result.remediation.compensatedSettled} 笔已结算订单，撤销 ${result.remediation.revokedEntitlements} 份权益`
        : "";
      if (await load()) setNotice(`操作已写入审计记录${remediationText}`);
    } catch (error) {
      setNotice(error instanceof AdminRequestError && error.code === "moderation_refund_reserve_unavailable"
        ? "处置未生效：卖家待结算账本不足，内容保持原状态并等待人工对账。"
        : adminErrorMessage("操作未生效", error));
    } finally {
      setPendingAction("");
    }
  };
  const reviewProduct = async (action: "approve_product" | "reject_product" | "remove_hosting", productId: number) => {
    const note = reviewNotes[productId]?.trim() ?? "";
    if (note.length < 4 || pendingAction) return;
    setPendingAction(`${action}:${productId}`);
    setNotice("");
    try {
      await adminRequest("/api/admin/moderation", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, targetRef: String(productId), note }) });
      setReviewNotes((current) => { const next = { ...current }; delete next[productId]; return next; });
      if (await load()) setNotice(action === "remove_hosting" ? "移除托管请求已写入审计记录。" : "商品审核决定已写入审计记录。");
    } catch (error) {
      setNotice(error instanceof AdminRequestError && error.code === "external_demo_requires_immutable_package"
        ? "无法批准：外部体验链接可被原地替换，请改为站内不可变原型后重新提交。"
        : adminErrorMessage(action === "remove_hosting" ? "移除托管未生效" : "商品审核决定未生效", error));
    } finally {
      setPendingAction("");
    }
  };
  const updateProject = async (project: Project) => {
    if (pendingAction) return;
    setPendingAction(`project:${project.id}`);
    setNotice("");
    try {
      await adminRequest("/api/admin/incubation", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...project, projectId: project.id, feedback: `项目阶段更新为：${project.status}` }) });
      if (await load()) setNotice("项目状态已更新。");
    } catch (error) {
      setNotice(adminErrorMessage("项目状态未更新", error));
    } finally {
      setPendingAction("");
    }
  };
  const changeProject = (id: number, patch: Partial<Project>) => setProjects((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const createInvitation = async () => {
    if (pendingAction) return;
    setPendingAction("create-invitation");
    setNotice("");
    try {
      const result = await adminRequest<{ invitation: Invitation & { code: string } }>("/api/admin/invitations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(invitationDraft) });
      if (!result.invitation) throw new Error("invalid_response");
      setNewInvitationCode(result.invitation.code);
      if (await load()) setNotice("邀请码已生成；明文只显示这一次，请立即复制保存。 ");
    } catch (error) {
      setNotice(adminErrorMessage("邀请码未生成", error));
    } finally {
      setPendingAction("");
    }
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
    if (pendingAction) return;
    setPendingAction(`revoke-invitation:${id}`);
    setNotice("");
    try {
      await adminRequest("/api/admin/invitations", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "revoke", id }) });
      if (await load()) setNotice("邀请码已撤销，未使用额度立即失效。 ");
    } catch (error) {
      setNotice(adminErrorMessage("邀请码未撤销", error));
    } finally {
      setPendingAction("");
    }
  };

  const submitHostingGrant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingAction) return;
    setPendingAction("hosting-grant");
    setNotice("");
    try {
      await adminRequest<{ grant: HostingGrant }>("/api/admin/hosting-grants", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...hostingGrantDraft, email: hostingGrantDraft.email.trim() }) });
      if (await load()) {
        setHostingGrantDraft({ email: "", maxSites: 3, note: "" });
        setNotice("托管授权已保存。");
      }
    } catch (error) {
      setNotice(adminErrorMessage("托管授权未保存", error));
    } finally {
      setPendingAction("");
    }
  };

  const revokeHostingGrant = async (memberEmail: string) => {
    if (!window.confirm("撤销会同时移除该会员所有托管站点。确认撤销该授权吗？")) return;
    if (pendingAction) return;
    setPendingAction(`hosting-revoke:${memberEmail}`);
    setNotice("");
    try {
      const result = await adminRequest<{ ok: true; removedHostings: number }>("/api/admin/hosting-grants", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: memberEmail }) });
      if (await load()) setNotice(`托管授权已撤销，已提交移除 ${result.removedHostings} 个站点的请求。`);
    } catch (error) {
      setNotice(adminErrorMessage("托管授权未撤销", error));
    } finally {
      setPendingAction("");
    }
  };

  const copyHostingHash = async (sha256: string) => {
    try {
      await navigator.clipboard.writeText(sha256);
      setNotice("完整 SHA-256 已复制。");
    } catch {
      setNotice("浏览器未允许自动复制，请手动选择完整 SHA-256。");
    }
  };

  const pendingTotal = moderation.products.length + moderation.reports.length + moderation.clients.length + moderation.risks.length + projects.length;

  return <main className="admin-console"><header><span><ShieldAlert size={18} /> ZAOCHANG OPERATIONS</span><h1>造场管理中心</h1><p>管理产品预审、社区安全、第三方接入、公开测试邀请与项目孵化。</p><button onClick={() => void load()}><RefreshCw size={15} /> 刷新</button></header>{notice && <p className="admin-notice" role="status">{notice}</p>}
    <section className="admin-overview" aria-label="管理事项总览"><div><span>待处理总数</span><strong>{pendingTotal}</strong></div><div><span>商品预审</span><strong>{moderation.products.length}</strong></div><div><span>内容与风险</span><strong>{moderation.reports.length + moderation.risks.length}</strong></div><div><span>孵化项目</span><strong>{projects.length}</strong></div></section>
    <nav className="admin-shortcuts" aria-label="管理分区"><a href="#invitations">邀请码</a><a href="#product-review">商品预审</a><a href="#hosting-grants">托管授权</a><a href="#reports">内容举报</a><a href="#applications">第三方应用</a><a href="#risks">果子风险</a><a href="#incubation">项目孵化</a></nav>
    <section id="invitations"><h2>公开测试邀请码</h2><div className="admin-invitation-form"><label>用途<input value={invitationDraft.label} maxLength={80} onChange={(event) => setInvitationDraft((current) => ({ ...current, label: event.target.value }))} /></label><label>可用次数<input type="number" min={1} max={25} value={invitationDraft.maxUses} onChange={(event) => setInvitationDraft((current) => ({ ...current, maxUses: Number(event.target.value) }))} /></label><label>有效天数<input type="number" min={1} max={90} value={invitationDraft.expiresDays} onChange={(event) => setInvitationDraft((current) => ({ ...current, expiresDays: Number(event.target.value) }))} /></label><button onClick={() => void createInvitation()}>生成邀请码</button></div>{newInvitationCode && <div className="admin-invitation-code" role="status"><code>{newInvitationCode}</code><button onClick={() => void copyInvitation()}>复制</button><small>离开或刷新后不再显示明文</small></div>}{invitations.length ? invitations.map((invitation) => <article key={invitation.id}><div><strong>{invitation.label}</strong><small>{invitation.usesCount}/{invitation.maxUses} 次 · 到期 {invitation.expiresAt} · {invitationStatus(invitation)}{invitation.lastUsedAt ? ` · 最近使用 ${invitation.lastUsedAt}` : ""}</small></div><button disabled={invitationStatus(invitation) !== "有效"} onClick={() => void revokeInvitation(invitation.id)}><X size={14} /> 撤销</button></article>) : <p>还没有邀请码</p>}</section>
    <section id="product-review"><h2>商品发布预审</h2>{moderation.products.length ? moderation.products.map((product) => {
      const hasExternalDemo = Boolean(product.demoUrl);
      const hasExternalImage = Boolean(product.imageUrl && !product.imageUrl.startsWith("/api/uploads/"));
      const hostingReason = approvalBlockReason(product.hosting);
      const noteTooShort = (reviewNotes[product.id]?.trim().length ?? 0) < 4;
      const actionBusy = pendingAction === `approve_product:${product.id}` || pendingAction === `reject_product:${product.id}` || pendingAction === `remove_hosting:${product.id}`;
      return <article className="admin-product-review" key={product.id}>
        <div><strong>{product.title}</strong><small>{product.ownerName} · {product.ownerEmail} · V{product.reviewVersion} · {product.submittedAt}</small><p>{product.description}</p><p>{product.category} · {pricingModelLabel(product.pricingModel, product.price)}</p>{product.demoUrl && <><a href={product.demoUrl} target="_blank" rel="noreferrer">检查体验地址</a><p role="alert">外部链接可被原地替换，当前版本只能驳回并要求改为站内原型。</p></>}{product.imageUrl && <a href={product.imageUrl} target="_blank" rel="noreferrer">检查商品封面</a>}{hasExternalImage && <p role="alert">封面为外部图床链接，过审后可被原地替换；请驳回并要求改为站内上传。</p>}</div>
        {product.hosting && <div className="admin-product-hosting"><header><strong>静态托管 · {hostingStateLabel(product.hosting.state)}</strong><small>托管版本 V{product.hosting.reviewVersion} · 已批准 V{product.hosting.approvedVersion}</small></header><dl><div><dt>文件数</dt><dd>{product.hosting.bundleFileCount}</dd></div><div><dt>未压缩体积</dt><dd>{formatHostingBytes(product.hosting.bundleUncompressedBytes)}</dd></div><div><dt>SHA-256</dt><dd><code>{product.hosting.bundleSha256.slice(0, 12)}</code><button type="button" onClick={() => void copyHostingHash(product.hosting!.bundleSha256)} aria-label="复制完整 SHA-256"><Copy size={13} /> 复制全文</button></dd></div></dl>{product.hosting.previewUrl && <a href={product.hosting.previewUrl} target="_blank" rel="noreferrer noopener">打开审核预览</a>}{product.hosting.previewExpiresAt && <small>预览过期时间：{product.hosting.previewExpiresAt}</small>}{product.hosting.failureCode && <p className="admin-hosting-failure">{hostingFailureMessage(product.hosting.failureCode)} <small>错误码：{product.hosting.failureCode}</small></p>}{hostingReason && <small className="admin-review-block-reason">{hostingReason}</small>}<button type="button" disabled={noteTooShort || actionBusy || Boolean(pendingAction)} onClick={() => void reviewProduct("remove_hosting", product.id)}>{pendingAction === `remove_hosting:${product.id}` ? "正在提交…" : "移除托管"}</button></div>}
        <label>审核意见<textarea value={reviewNotes[product.id] ?? ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [product.id]: event.target.value }))} maxLength={500} placeholder="至少 4 个字，说明通过依据或驳回原因" /></label>
        <button disabled={hasExternalDemo || hasExternalImage || Boolean(hostingReason) || noteTooShort || actionBusy || Boolean(pendingAction)} onClick={() => void reviewProduct("approve_product", product.id)}><Check size={14} /> {pendingAction === `approve_product:${product.id}` ? "正在提交…" : hasExternalDemo || hasExternalImage ? "外链不可批准" : hostingReason || "批准上线"}</button>
        <button disabled={noteTooShort || actionBusy || Boolean(pendingAction)} onClick={() => void reviewProduct("reject_product", product.id)}><X size={14} /> {pendingAction === `reject_product:${product.id}` ? "正在提交…" : "驳回"}</button>
      </article>;
    }) : <p>没有待预审商品</p>}</section>
    <section id="hosting-grants"><h2>托管授权</h2><form className="admin-hosting-grant-form" onSubmit={(event) => void submitHostingGrant(event)}><label>成员邮箱<input type="email" required maxLength={254} value={hostingGrantDraft.email} onChange={(event) => setHostingGrantDraft((current) => ({ ...current, email: event.target.value }))} placeholder="name@example.com" /></label><label>站点额度<input type="number" required min={1} max={20} value={hostingGrantDraft.maxSites} onChange={(event) => setHostingGrantDraft((current) => ({ ...current, maxSites: Number(event.target.value) }))} /></label><label>备注<input maxLength={300} value={hostingGrantDraft.note} onChange={(event) => setHostingGrantDraft((current) => ({ ...current, note: event.target.value }))} placeholder="授权说明" /></label><button type="submit" disabled={pendingAction === "hosting-grant" || Boolean(pendingAction) || hostingGrantDraft.maxSites < 1 || hostingGrantDraft.maxSites > 20}>{pendingAction === "hosting-grant" ? "正在保存…" : "授予/调整授权"}</button></form>{hostingGrants.length ? <div className="admin-hosting-grant-list">{hostingGrants.map((grant) => <article key={`${grant.memberEmail}:${grant.createdAt}`}><div><strong>{grant.memberEmail}</strong><small>额度 {grant.maxSites} · 已用 {grant.usedSites} · {grant.revokedAt ? "已撤销" : "有效"}</small><small>备注：{grant.note || "未填写"} · 授权人：{grant.grantedBy} · {grant.createdAt}</small></div>{!grant.revokedAt && <button type="button" disabled={Boolean(pendingAction)} onClick={() => void revokeHostingGrant(grant.memberEmail)}>{pendingAction === `hosting-revoke:${grant.memberEmail}` ? "正在撤销…" : "撤销授权"}</button>}</article>)}</div> : <p>暂无托管授权记录</p>}</section>
    <section id="reports"><h2>内容举报</h2>{moderation.reports.length ? moderation.reports.map((report) => <article key={report.id}><div><strong>{report.targetType} / {report.targetRef}</strong><small>{report.reason} · {report.createdAt}</small><p>{report.details || "未补充说明"}</p></div><button onClick={() => void moderate("hide_reported_content", report.id)}><Check size={14} /> {report.targetType === "product" ? "下架并处理一次解锁订单" : "隐藏内容"}</button><button onClick={() => void moderate("dismiss_report", report.id)}><X size={14} /> 驳回</button></article>) : <p>没有待处理举报</p>}</section>
    <section id="applications"><h2>第三方应用审核</h2>{moderation.clients.length ? moderation.clients.map((client) => <article key={client.clientId}><div><strong>{client.name}</strong><small>{new URL(client.websiteUrl).hostname}</small><p>{client.allowedScopes}</p></div><button onClick={() => void moderate("approve_client", client.clientId)}><Check size={14} /> 验证并批准</button><button onClick={() => void moderate("reject_client", client.clientId)}><X size={14} /> 拒绝</button></article>) : <p>没有待审核应用</p>}</section>
    <section id="risks"><h2>果子风险事件</h2>{moderation.risks.length ? moderation.risks.map((risk) => <article key={risk.id}><div><strong>{risk.severity} · {risk.kind}</strong><small>{risk.userEmail} · {risk.createdAt}</small><p>{risk.evidence}</p></div><button onClick={() => void moderate("resolve_risk", risk.id)}><Check size={14} /> 已处置</button><button onClick={() => void moderate("dismiss_risk", risk.id)}><X size={14} /> 误报</button></article>) : <p>没有待处理风险事件</p>}</section>
    <section id="incubation"><h2>孵化项目</h2>{projects.length ? projects.map((project) => <article className="admin-project" key={project.id}><div><strong>{project.name}</strong><small>{project.userEmail} · {project.updatedAt}</small></div><label>阶段<select value={project.status} onChange={(event) => changeProject(project.id, { status: event.target.value })}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></label><label>负责人<input value={project.assignedOwner ?? ""} onChange={(event) => changeProject(project.id, { assignedOwner: event.target.value })} /></label><label>当前任务<input value={project.currentTask} onChange={(event) => changeProject(project.id, { currentTask: event.target.value })} /></label><label>下一步<input value={project.nextAction} onChange={(event) => changeProject(project.id, { nextAction: event.target.value })} /></label><label>等待原因<input value={project.waitingReason} onChange={(event) => changeProject(project.id, { waitingReason: event.target.value })} /></label><label>进度<input type="number" min={0} max={100} value={project.progressPercent} onChange={(event) => changeProject(project.id, { progressPercent: Number(event.target.value) })} /></label><button onClick={() => void updateProject(project)}>保存项目状态</button></article>) : <p>没有孵化项目</p>}</section>
  </main>;
}
