"use client";

import {
  BarChart3, ClipboardList, Cloud, FileSearch, Flag, Home,
  Lightbulb, MailPlus, RefreshCw, ScrollText, ShieldAlert, Ticket, Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  adminErrorMessage,
  adminRequest,
  type AdminData,
  type AuditEvent,
  type Client,
  type HostingGrant,
  type Invitation,
  type Member,
  type ModerationData,
  type Overview,
  type ProductReview,
  type Project,
  type Report,
  type Risk,
} from "./admin-api";
import { AdminConfirmDialog, type ConfirmRequest } from "./confirm-dialog";
import { AuditSection } from "./sections/audit";
import { ContentSection } from "./sections/content";
import { DataSection } from "./sections/data";
import { HostingGrantsSection } from "./sections/hosting-grants";
import { InboxSection } from "./sections/inbox";
import { IncubationSection } from "./sections/incubation";
import { InvitationsSection } from "./sections/invitations";
import { MembersSection } from "./sections/members";
import { RecruitSection } from "./sections/recruit";
import { ReportsRiskSection } from "./sections/reports-risk";
import { ReviewSection } from "./sections/review";

type SectionId = "inbox" | "review" | "reports" | "members" | "content" | "data" | "invitations" | "hosting" | "incubation" | "audit" | "recruit";
type Notice = { message: string; kind: "success" | "error" } | null;
type MutationResult = Record<string, unknown>;

const sections: Array<{ id: SectionId; label: string; icon: typeof Home }> = [
  { id: "inbox", label: "待办", icon: Home },
  { id: "review", label: "审核", icon: ClipboardList },
  { id: "reports", label: "举报与风险", icon: Flag },
  { id: "members", label: "会员", icon: Users },
  { id: "content", label: "内容", icon: FileSearch },
  { id: "data", label: "数据", icon: BarChart3 },
  { id: "invitations", label: "邀请码", icon: Ticket },
  { id: "hosting", label: "托管授权", icon: Cloud },
  { id: "incubation", label: "孵化", icon: Lightbulb },
  { id: "recruit", label: "选拔", icon: MailPlus },
  { id: "audit", label: "审计", icon: ScrollText },
];
const sectionIds = new Set<SectionId>(sections.map(({ id }) => id));

const emptyModeration: ModerationData = { reports: [], products: [], clients: [], risks: [] };

export function AdminConsole() {
  const [section, setSection] = useState<SectionId>("inbox");
  const [moderation, setModeration] = useState<ModerationData>(emptyModeration);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [hostingGrants, setHostingGrants] = useState<HostingGrant[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [recentAudit, setRecentAudit] = useState<AuditEvent[]>([]);
  const [hostingGrantDraft, setHostingGrantDraft] = useState({ email: "", maxSites: 3, note: "" });
  const [invitationDraft, setInvitationDraft] = useState({ label: "公开测试邀请", maxUses: 1, expiresDays: 14 });
  const [newInvitationCode, setNewInvitationCode] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [pendingAction, setPendingAction] = useState("");
  const [sectionRefreshKey, setSectionRefreshKey] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const busy = Boolean(pendingAction);

  const showStatus = useCallback((message: string, kind: "success" | "error") => {
    setNotice({ message, kind });
  }, []);

  const closeConfirm = useCallback(() => setConfirmRequest(null), []);

  const loadData = useCallback(async (announce = true) => {
    const results = await Promise.allSettled([
      adminRequest<ModerationData>("/api/admin/moderation", { cache: "no-store" }),
      adminRequest<Pick<AdminData, "projects" | "stages">>("/api/admin/incubation", { cache: "no-store" }),
      adminRequest<{ invitations: Invitation[] }>("/api/admin/invitations", { cache: "no-store" }),
      adminRequest<{ grants: HostingGrant[] }>("/api/admin/hosting-grants", { cache: "no-store" }),
      adminRequest<Overview>("/api/admin/overview", { cache: "no-store" }),
      adminRequest<{ events: AuditEvent[] }>("/api/admin/audit", { cache: "no-store" }),
    ]);
    const [moderationResult, incubationResult, invitationResult, grantsResult, overviewResult, auditResult] = results;
    const labels = ["读取审核与风险队列", "读取孵化项目", "读取邀请码", "读取托管授权", "读取平台总览", "读取最近审计"];
    const errors = results.flatMap((result, index) => result.status === "rejected"
      ? [adminErrorMessage(labels[index], result.reason)]
      : []);
    setModeration(moderationResult.status === "fulfilled" ? moderationResult.value : emptyModeration);
    setProjects(incubationResult.status === "fulfilled" ? incubationResult.value.projects : []);
    setStages(incubationResult.status === "fulfilled" ? incubationResult.value.stages : []);
    setInvitations(invitationResult.status === "fulfilled" ? invitationResult.value.invitations : []);
    setHostingGrants(grantsResult.status === "fulfilled" ? grantsResult.value.grants : []);
    setOverview(overviewResult.status === "fulfilled" ? overviewResult.value : null);
    setRecentAudit(auditResult.status === "fulfilled" ? auditResult.value.events.slice(0, 10) : []);
    if (announce) {
      if (errors.length) showStatus(errors.join(" "), "error");
      else showStatus("管理数据已刷新。", "success");
    }
    return errors;
  }, [showStatus]);

  useEffect(() => {
    // 首次进入只在读取失败时提示;「已刷新」只回应手动刷新,免得一进页面就是一条噪声。
    const timer = window.setTimeout(() => {
      void loadData(false).then((errors) => { if (errors.length) showStatus(errors.join(" "), "error"); });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData, showStatus]);

  useEffect(() => {
    const syncSectionFromUrl = () => {
      const url = new URL(window.location.href);
      const candidate = url.searchParams.get("section") as SectionId | null;
      const selected = candidate && sectionIds.has(candidate) ? candidate : "inbox";
      setSection(selected);
      if (candidate !== selected) {
        url.searchParams.set("section", selected);
        window.history.replaceState(window.history.state, "", url);
      }
    };
    syncSectionFromUrl();
    window.addEventListener("popstate", syncSectionFromUrl);
    return () => window.removeEventListener("popstate", syncSectionFromUrl);
  }, []);

  const openSection = useCallback((id: string) => {
    const selected = sectionIds.has(id as SectionId) ? id as SectionId : "inbox";
    setSection(selected);
    const url = new URL(window.location.href);
    url.searchParams.set("section", selected);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const runMutation = useCallback(async (
    key: string,
    actionLabel: string,
    url: string,
    body: unknown,
    success: string | ((result: MutationResult) => string),
    method: "POST" | "PATCH" | "DELETE" = "PATCH",
    errorText?: (error: unknown) => string,
  ): Promise<MutationResult | null> => {
    if (pendingAction) return null;
    setPendingAction(key);
    try {
      const result = await adminRequest<MutationResult>(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setConfirmRequest(null);
      const errors = await loadData(false);
      setSectionRefreshKey((value) => value + 1);
      const message = typeof success === "function" ? success(result) : success;
      if (errors.length) showStatus(`${message}但刷新数据失败：${errors.join(" ")}`, "error");
      else showStatus(message, "success");
      return result;
    } catch (error) {
      setConfirmRequest(null);
      showStatus(errorText?.(error) ?? adminErrorMessage(actionLabel, error), "error");
      return null;
    } finally {
      setPendingAction("");
    }
  }, [loadData, pendingAction, showStatus]);

  const runModeration = useCallback(async (action: string, targetRef: string, note = "") => {
    return runMutation(`${action}:${targetRef}`, "管理操作未生效", "/api/admin/moderation", { action, targetRef, note }, (result) => {
      if (result.remediation && typeof result.remediation === "object") {
        const remediation = result.remediation as { refundedPending?: number; compensatedSettled?: number; revokedEntitlements?: number };
        return `操作已写入审计记录；退回 ${remediation.refundedPending ?? 0} 笔待结算订单，补偿 ${remediation.compensatedSettled ?? 0} 笔已结算订单，撤销 ${remediation.revokedEntitlements ?? 0} 份权益。`;
      }
      return "操作已写入审计记录。";
    }, "PATCH", (error) => {
      if (error instanceof Error && "code" in error && error.code === "moderation_refund_reserve_unavailable") {
        return "处置未生效：卖家待结算账本不足，内容保持原状态并等待人工对账。";
      }
      if (error instanceof Error && "code" in error && error.code === "external_demo_requires_immutable_package") {
        return "无法批准：外部体验链接可被原地替换，请改为站内不可变原型后重新提交。";
      }
      return adminErrorMessage("管理操作未生效", error);
    });
  }, [runMutation]);

  const reviewProduct = useCallback((action: "approve_product" | "reject_product" | "remove_hosting", product: ProductReview, note: string) => {
    if (action === "approve_product") {
      void runMutation(`${action}:${product.id}`, "商品审核决定未生效", "/api/admin/moderation", { action, targetRef: String(product.id), note }, "商品审核决定已写入审计记录。").then((result) => {
        if (result) setReviewNotes((current) => { const next = { ...current }; delete next[product.id]; return next; });
      });
      return;
    }
    setConfirmRequest({
      title: action === "reject_product" ? "驳回作品" : "移除托管站点",
      target: `${product.title} · 作品 #${product.id} · ${product.ownerEmail}`,
      consequence: action === "reject_product"
        ? "驳回当前审核版本；作者修改后需按正常流程重新提交预审。"
        : "提交托管站点移除请求；远端部署器异步处理，移除状态会留在托管记录中。",
      submit: async (reason) => {
        const result = await runMutation(`${action}:${product.id}`, action === "remove_hosting" ? "移除托管未生效" : "商品驳回未生效", "/api/admin/moderation", { action, targetRef: String(product.id), note: reason }, action === "remove_hosting" ? "已提交托管站点移除请求，并写入审计记录。" : "作品审核决定已写入审计记录。");
        if (result) setReviewNotes((current) => { const next = { ...current }; delete next[product.id]; return next; });
      },
    });
  }, [runMutation]);

  const moderateReport = useCallback((action: "hide_reported_content" | "dismiss_report", report: Report) => {
    const target = `${report.targetType} / ${report.targetRef} · 举报 ${report.id}`;
    setConfirmRequest({
      title: action === "hide_reported_content" ? "隐藏举报内容" : "驳回举报",
      target,
      consequence: action === "hide_reported_content"
        ? report.targetType === "product"
          ? "作品将对公众隐藏；一次解锁订单会退款或补偿，相关权益会撤销。资金补救不足时整批处置失败。"
          : "内容将对公众隐藏，举报会标记为已处理。"
        : "举报会标记为驳回，目标内容状态不变。",
      submit: async (reason) => { await runModeration(action, report.id, reason); },
    });
  }, [runModeration]);

  const moderateClient = useCallback((action: "approve_client" | "reject_client", client: Client) => {
    if (action === "approve_client") {
      void runModeration(action, client.clientId);
      return;
    }
    setConfirmRequest({
      title: "拒绝第三方应用",
      target: `${client.name} · ${client.clientId}`,
      consequence: "拒绝当前应用审核，并撤销该应用现有访问令牌与同意。",
      submit: async (reason) => { await runModeration(action, client.clientId, reason); },
    });
  }, [runModeration]);

  const resolveRisk = useCallback((action: "resolve_risk" | "dismiss_risk", risk: Risk) => {
    const resolving = action === "resolve_risk";
    setConfirmRequest({
      title: resolving ? "标记风险已处置" : "确认风险误报",
      target: `${risk.severity} · ${risk.kind} · ${risk.userEmail} · ${risk.id}`,
      consequence: resolving
        ? "关闭此风险队列项并写入审计记录；不会自动改动钱包或账本。"
        : "将此风险队列项标记为误报并写入审计记录；不会自动改动钱包或账本。",
      submit: async (reason) => { await runModeration(action, risk.id, reason); },
    });
  }, [runModeration]);

  const createInvitation = useCallback(async () => {
    const result = await runMutation("create-invitation", "邀请码未生成", "/api/admin/invitations", invitationDraft, (payload) => {
      const invitation = payload.invitation as Invitation & { code?: string } | undefined;
      if (typeof invitation?.code === "string") setNewInvitationCode(invitation.code);
      return "邀请码已生成；明文只显示这一次，请立即复制保存。";
    }, "POST");
    if (result) {
      const invitation = result.invitation as Invitation & { code?: string } | undefined;
      if (typeof invitation?.code === "string") setNewInvitationCode(invitation.code);
    }
  }, [invitationDraft, runMutation]);

  const copyInvitation = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(newInvitationCode);
      showStatus("邀请码已复制到剪贴板。", "success");
    } catch {
      showStatus("浏览器未允许自动复制，请手动选择邀请码。", "error");
    }
  }, [newInvitationCode, showStatus]);

  const revokeInvitation = useCallback((invitation: Invitation) => {
    setConfirmRequest({
      title: "撤销邀请码",
      target: `${invitation.label} · ${invitation.id}`,
      consequence: "邀请码立即失效，未使用额度不能再注册。",
      submit: async (reason) => { await runMutation(`revoke-invitation:${invitation.id}`, "邀请码未撤销", "/api/admin/invitations", { action: "revoke", id: invitation.id, reason }, "邀请码已撤销，未使用额度立即失效。"); },
    });
  }, [runMutation]);

  const submitHostingGrant = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runMutation("hosting-grant", "托管授权未保存", "/api/admin/hosting-grants", { ...hostingGrantDraft, email: hostingGrantDraft.email.trim() }, "托管授权已保存。", "POST").then((result) => {
      if (result) setHostingGrantDraft({ email: "", maxSites: 3, note: "" });
    });
  }, [hostingGrantDraft, runMutation]);

  const revokeHostingGrant = useCallback((grant: HostingGrant) => {
    setConfirmRequest({
      title: "撤销托管授权",
      target: grant.memberEmail,
      consequence: `授权将撤销，并向部署器提交移除该会员 ${grant.usedSites} 个托管站点的请求；远端移除可能异步完成。`,
      submit: async (reason) => {
        await runMutation(`hosting-revoke:${grant.memberEmail}`, "托管授权未撤销", "/api/admin/hosting-grants", { email: grant.memberEmail, reason }, (result) => `托管授权已撤销，已提交移除 ${Number(result.removedHostings ?? 0)} 个站点的请求。`, "DELETE");
      },
    });
  }, [runMutation]);

  const updateProject = useCallback((project: Project) => {
    void runMutation(`project:${project.id}`, "项目状态未更新", "/api/admin/incubation", { ...project, projectId: project.id, feedback: `项目阶段更新为：${project.status}` }, "项目状态已更新。");
  }, [runMutation]);

  const changeProject = useCallback((id: number, patch: Partial<Project>) => {
    setProjects((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  }, []);

  const suspendMember = useCallback((member: Member, action: "suspend" | "unsuspend") => {
    const isSuspend = action === "suspend";
    setConfirmRequest({
      title: isSuspend ? "封禁会员账号" : "解除会员封禁",
      target: `${member.displayName} · ${member.email}`,
      consequence: isSuspend
        ? "阻止该账号登录，删除现有会话并吊销 API key 与 OAuth 凭证。不会下架内容，也不改钱包或账本；内容请在“内容”分区处置，钱款另行对账。"
        : "账号可重新登录；旧会话、API key 和 OAuth 凭证不会恢复，会员需重新登录并重新创建 key。",
      submit: async (reason) => {
        await runMutation(`${action}:${member.email}`, isSuspend ? "会员封禁未生效" : "会员解封未生效", "/api/admin/members", { action, email: member.email, reason }, isSuspend ? "会员已停用，现有登录凭证已撤销。" : "会员已解封；旧登录凭证不会恢复。");
      },
    });
  }, [runMutation]);

  const moderateContent = useCallback((action: "takedown" | "restore", type: "product" | "post" | "comment", item: { id: number; title?: string; ownerEmail: string }) => {
    const target = `${type} #${item.id}${item.title ? ` · ${item.title}` : ""} · ${item.ownerEmail}`;
    setConfirmRequest({
      title: action === "takedown" ? "主动下架内容" : "恢复内容显示",
      target,
      consequence: action === "takedown"
        ? type === "product"
          ? "作品将从公开页面隐藏；系统会处理一次解锁订单并撤销权益。作者修改后进入正常预审。"
          : "帖子或评论将对公众隐藏；后续可在内容分区恢复。"
        : "帖子或评论会恢复显示，并写入管理审计记录。",
      submit: async (reason) => {
        await runMutation(`${action}-content:${type}:${item.id}`, action === "takedown" ? "内容下架未生效" : "内容恢复未生效", "/api/admin/content", { action, type, ref: String(item.id), reason }, action === "takedown" ? "内容已下架，处置结果已写入审计记录。" : "内容已恢复显示，操作已写入审计记录。");
      },
    });
  }, [runMutation]);

  const copyHostingHash = useCallback(async (sha256: string) => {
    try {
      await navigator.clipboard.writeText(sha256);
      showStatus("完整 SHA-256 已复制。", "success");
    } catch {
      showStatus("浏览器未允许自动复制，请手动选择完整 SHA-256。", "error");
    }
  }, [showStatus]);

  const queues = overview?.queues;
  const todoTotal = queues
    ? queues.fruitRisk.total + queues.reports + queues.productReviews + queues.thirdPartyApps + queues.incubation
    : moderation.products.length + moderation.reports.length + moderation.clients.length + moderation.risks.length + projects.length;
  const badgeCounts: Partial<Record<SectionId, number>> = {
    inbox: todoTotal,
    review: (queues?.productReviews ?? moderation.products.length) + (queues?.thirdPartyApps ?? moderation.clients.length),
    reports: (queues?.reports ?? moderation.reports.length) + (queues?.fruitRisk.total ?? moderation.risks.length),
    incubation: queues?.incubation ?? 0,
    data: overview?.fruit.reviewWallets ?? 0,
  };

  return <main className="admin-console">
    <header className="admin-topbar">
      <div><span className="admin-eyebrow"><ShieldAlert size={17} /> ZAOCHANG OPERATIONS</span><h1>造场管理中心</h1><p>从待办开始，按分区处理平台运营与管控事项。</p></div>
      <button type="button" className="admin-secondary-button" onClick={() => { void loadData().then(() => setSectionRefreshKey((value) => value + 1)); }} disabled={busy}><RefreshCw size={15} /> 刷新数据</button>
    </header>
    <div className="admin-layout">
      <nav className="admin-sidebar" aria-label="管理分区">
        <span className="admin-sidebar-label">工作区</span>
        {sections.map(({ id, label, icon: Icon }) => {
          const count = badgeCounts[id] ?? 0;
          return <button type="button" key={id} data-section={id} className={section === id ? "is-active" : ""} aria-current={section === id ? "page" : undefined} onClick={() => openSection(id)}>
            <Icon size={17} /><span>{label}</span>{count > 0 && <b className="admin-count-badge" aria-label={`${count} 项待处理`}>{count > 99 ? "99+" : count}</b>}
          </button>;
        })}
      </nav>
      <div className="admin-main-column">
        {notice && <p className={`admin-status admin-status-${notice.kind}`} role="status" aria-live="polite">{notice.message}</p>}
        <div className="admin-section-content" key={section}>
          {section === "inbox" && <InboxSection overview={overview} recentAudit={recentAudit} onOpen={openSection} />}
          {section === "review" && <ReviewSection products={moderation.products} clients={moderation.clients} notes={reviewNotes} setNotes={setReviewNotes} busy={busy} pendingAction={pendingAction} onProductAction={reviewProduct} onClientAction={moderateClient} onCopyHash={(hash) => void copyHostingHash(hash)} />}
          {section === "reports" && <ReportsRiskSection reports={moderation.reports} risks={moderation.risks} busy={busy} onModerate={moderateReport} onRiskAction={resolveRisk} />}
          {section === "members" && <MembersSection refreshKey={sectionRefreshKey} busy={busy} onSuspend={suspendMember} onStatus={showStatus} />}
          {section === "content" && <ContentSection refreshKey={sectionRefreshKey} busy={busy} onAction={moderateContent} onStatus={showStatus} />}
          {section === "data" && <DataSection overview={overview} onStatus={showStatus} />}
          {section === "invitations" && <InvitationsSection invitations={invitations} draft={invitationDraft} setDraft={setInvitationDraft} newCode={newInvitationCode} onCreate={() => void createInvitation()} onCopy={() => void copyInvitation()} onRevoke={revokeInvitation} busy={busy} />}
          {section === "hosting" && <HostingGrantsSection grants={hostingGrants} draft={hostingGrantDraft} setDraft={setHostingGrantDraft} onSubmit={submitHostingGrant} onRevoke={revokeHostingGrant} busy={busy} />}
          {section === "incubation" && <IncubationSection projects={projects} stages={stages} onChange={changeProject} onSave={updateProject} busy={busy} />}
          {section === "recruit" && <RecruitSection refreshKey={sectionRefreshKey} busy={busy} onStatus={showStatus} />}
          {section === "audit" && <AuditSection onStatus={showStatus} />}
        </div>
      </div>
    </div>
    <AdminConfirmDialog request={confirmRequest} busy={busy} onClose={closeConfirm} />
  </main>;
}
