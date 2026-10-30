"use client";

import { Eye, MailPlus, RefreshCw, Send, UserCheck, UserX } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminErrorMessage, adminRequest, AdminRequestError } from "../admin-api";
import { APPLICATION_INVITE_DAYS } from "../../api/_lib/account-application-rules";
import { INVITATION_PREVIEW_CODE, accountProvisionedEmail, invitationEmail } from "../../api/_lib/invite-mail";

export type AccountApplication = {
  id: string; email: string; name: string; intro: string; link: string;
  source: "public" | "admin"; status: "pending" | "approved" | "rejected";
  mailStatus: "none" | "sending" | "sent" | "failed"; mailError: string | null; mailSentAt: string | null;
  decidedBy: string | null; decidedAt: string | null; decisionNote: string;
  createdAt: string; updatedAt: string;
  invitationId: string | null; invitationUses: number | null; invitationExpiresAt: string | null; invitationRevokedAt: string | null;
  isMember: boolean;
};

type Counts = { pending: number; approved: number; rejected: number };

export type ProvisionedAccount = {
  email: string; createdBy: string; note: string;
  mailStatus: "sending" | "sent" | "failed"; mailError: string | null; mailSentAt: string | null; createdAt: string;
  nickname: string; username: string | null; onboardingRequired: boolean; lastSignInAt: string | null;
};

// 申请人称呼当开通昵称:只有符合昵称长度(2–20 字)时才带上,否则交给服务端用邮箱前缀兜底。
const nicknameFrom = (name: string) => {
  const trimmed = name.replace(/\s+/g, " ").trim();
  const length = [...trimmed].length;
  return length >= 2 && length <= 20 ? trimmed : undefined;
};

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function provisionedState(account: ProvisionedAccount): string {
  const mail = account.mailStatus === "sent" ? `通知已发送 ${account.mailSentAt ?? ""}`
    : account.mailStatus === "failed" ? `通知发送失败（${account.mailError ?? "未知"}），可重发`
    : "通知投递结果未确认，可重发";
  const progress = account.onboardingRequired
    ? (account.lastSignInAt ? `已登录过（${account.lastSignInAt}），尚未完善资料` : "尚未首次登录")
    : `已完善资料 @${account.username ?? "?"}`;
  return [progress, mail].join(" · ");
}
type Filter = "pending" | "approved" | "rejected" | "all";

const FILTER_LABELS: Record<Filter, string> = { pending: "待审", approved: "已通过", rejected: "已拒绝", all: "全部" };

// 与服务端同口径:expires_at 是 UTC 的 "YYYY-MM-DD HH:MM:SS"。
const utcNow = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const utcAfterDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");

function invitationState(app: AccountApplication): string {
  if (!app.invitationId) return "";
  if (Number(app.invitationUses ?? 0) > 0) return "邀请码已使用（已注册）";
  if (app.invitationRevokedAt) return "邀请码已作废";
  if (app.invitationExpiresAt && app.invitationExpiresAt <= utcNow()) return "邀请码已过期";
  return `邀请码有效至 ${app.invitationExpiresAt ?? "?"}（UTC）`;
}

function mailState(app: AccountApplication): string {
  if (app.mailStatus === "sent") return `邮件已发送 ${app.mailSentAt ?? ""}`;
  if (app.mailStatus === "failed") return `邮件发送失败（${app.mailError ?? "未知"}），这张码已作废，可点「重发」`;
  if (app.mailStatus === "sending") return "投递结果未确认（发送后回写失败），可点「重发」换新码";
  return "";
}

function statusLine(app: AccountApplication): string {
  if (app.status === "pending") return "待审";
  if (app.status === "rejected") return `已拒绝${app.decidedBy ? ` · ${app.decidedBy}` : ""}${app.decisionNote ? ` · ${app.decisionNote}` : ""}`;
  return ["已通过", app.decidedBy ?? "", mailState(app), invitationState(app)].filter(Boolean).join(" · ");
}

function failureMessage(action: string, error: unknown): string {
  if (error instanceof AdminRequestError) {
    if (error.code === "applicant_already_member") return `${action}：这个邮箱已经是造场会员，不需要邀请码。`;
    if (error.code === "application_pending_exists") return `${action}：这个邮箱已有一条待审申请，请直接在列表里审核它。`;
    if (error.code === "invitation_already_used") return `${action}：邀请码已经被使用（对方已注册），无需重发。`;
    if (error.code === "email_not_configured") return `${action}：邮件通道未配置，没有生成邀请码。`;
    if (error.code === "invite_mail_failed") return `${action}：邮件没有发出去，刚生成的邀请码已作废；稍后点「重发」重试。`;
    if (error.code === "rate_limit_exceeded") return `${action}：发信太频繁（每小时 30 封），请稍后再试。`;
    if (error.code === "account_already_exists") return `${action}：这个邮箱已经有造场账户了。`;
    if (error.code === "provision_mail_failed") return `${action}：账户已开通，但通知邮件没发出去；可在「管理员开通的账户」里点「重发通知」。`;
    if (error.code === "account_already_active") return `${action}：对方已经完成首次登录，不再发通知。`;
    if (error.code === "invalid_nickname" || error.code === "nickname_reserved") return `${action}：昵称需 2–20 字，且不能含「官方」「管理员」等字样。`;
  }
  return adminErrorMessage(action, error);
}

// 账户申请审核 + 邀请码邮件发放。通过 = 服务端生成单次 ZC- 码并按模板发到申请邮箱;
// 明文只在那封邮件里,管理台看不到(要人工转交请去「邀请码」分区另生成)。
// 预览与线上所发是同一个 invitationEmail(),只把码换成占位码。
export function ApplicationsSection({ refreshKey, busy, onStatus }: {
  refreshKey: number;
  busy: boolean;
  onStatus: (message: string, kind: "success" | "error") => void;
}) {
  const [applications, setApplications] = useState<AccountApplication[]>([]);
  const [counts, setCounts] = useState<Counts>({ pending: 0, approved: 0, rejected: 0 });
  const [filter, setFilter] = useState<Filter>("pending");
  const [loading, setLoading] = useState(false);
  const [pendingKey, setPendingKey] = useState("");
  const busyLocal = busy || Boolean(pendingKey);

  const [days, setDays] = useState<number>(APPLICATION_INVITE_DAYS.fallback);
  const [previewId, setPreviewId] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const [rejectId, setRejectId] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [direct, setDirect] = useState({ name: "", email: "", note: "" });
  const [directPreview, setDirectPreview] = useState(false);
  // 预览哪封信:邀请码邮件(通过申请/直接邀请)或开通通知(直接开通账户)。
  const [previewMode, setPreviewMode] = useState<"invite" | "provision">("invite");
  const [provisionConfirmId, setProvisionConfirmId] = useState("");
  const [accounts, setAccounts] = useState<ProvisionedAccount[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminRequest<{ applications: AccountApplication[]; counts: Counts }>(
        `/api/admin/account-applications?status=${filter}`, { cache: "no-store" },
      );
      setApplications(result.applications);
      setCounts(result.counts);
    } catch (error) {
      onStatus(adminErrorMessage("读取账户申请", error), "error");
    } finally {
      setLoading(false);
    }
  }, [filter, onStatus]);

  const loadAccounts = useCallback(async () => {
    try {
      const result = await adminRequest<{ accounts: ProvisionedAccount[] }>("/api/admin/accounts", { cache: "no-store" });
      setAccounts(result.accounts);
    } catch (error) {
      onStatus(adminErrorMessage("读取管理员开通的账户", error), "error");
    }
  }, [onStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); void loadAccounts(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshKey, load, loadAccounts]);

  const daysValid = Number.isInteger(days) && days >= APPLICATION_INVITE_DAYS.min && days <= APPLICATION_INVITE_DAYS.max;

  const renderPreview = useCallback((name: string, email: string) => previewMode === "provision"
    ? accountProvisionedEmail({ nickname: nicknameFrom(name) ?? email.slice(0, email.indexOf("@")), email, signinUrl: `${window.location.origin}/signin` })
    : invitationEmail({
      name,
      email,
      code: INVITATION_PREVIEW_CODE,
      expiresAt: utcAfterDays(daysValid ? days : APPLICATION_INVITE_DAYS.fallback),
      signinUrl: `${window.location.origin}/signin`,
    }), [days, daysValid, previewMode]);

  const previewApp = applications.find((app) => app.id === previewId) ?? null;
  const preview = useMemo(() => {
    if (directPreview) return direct.email ? { ...renderPreview(direct.name, direct.email), to: direct.email } : null;
    return previewApp ? { ...renderPreview(previewApp.name, previewApp.email), to: previewApp.email } : null;
  }, [direct.email, direct.name, directPreview, previewApp, renderPreview]);

  const decide = useCallback(async (app: AccountApplication, action: "approve" | "resend" | "reject") => {
    setPendingKey(`${action}-${app.id}`);
    const label = action === "approve" ? "通过并发送邀请码" : action === "resend" ? "重发邀请码" : "拒绝申请";
    try {
      await adminRequest("/api/admin/account-applications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "reject"
          ? { id: app.id, action, note: rejectNote }
          : { id: app.id, action, expiresDays: days }),
      });
      setConfirmId("");
      setRejectId("");
      onStatus(action === "reject" ? `已拒绝 ${app.email} 的申请（不发邮件）。` : `邀请码邮件已发送到 ${app.email}，有效期 ${days} 天。`, "success");
    } catch (error) {
      onStatus(failureMessage(label, error), "error");
    } finally {
      setPendingKey("");
      await load();
    }
  }, [days, load, onStatus, rejectNote]);

  const inviteDirect = useCallback(async () => {
    setPendingKey("direct");
    try {
      await adminRequest("/api/admin/account-applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: direct.name, email: direct.email, note: direct.note, expiresDays: days }),
      });
      onStatus(`邀请码邮件已发送到 ${direct.email.trim().toLowerCase()}，有效期 ${days} 天。`, "success");
      setDirect({ name: "", email: "", note: "" });
      setDirectPreview(false);
    } catch (error) {
      onStatus(failureMessage("直接邀请", error), "error");
    } finally {
      setPendingKey("");
      await load();
    }
  }, [days, direct, load, onStatus]);

  const provision = useCallback(async (payload: { email: string; nickname?: string; note: string }, key: string) => {
    setPendingKey(key);
    try {
      await adminRequest("/api/admin/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      onStatus(`已为 ${payload.email.trim().toLowerCase()} 开通账户并发送通知；对方用邮箱验证码登录，首次登录会设置用户名。`, "success");
      setProvisionConfirmId("");
      if (key === "provision-direct") { setDirect({ name: "", email: "", note: "" }); setDirectPreview(false); }
    } catch (error) {
      onStatus(failureMessage("直接开通账户", error), "error");
    } finally {
      setPendingKey("");
      await Promise.all([load(), loadAccounts()]);
    }
  }, [load, loadAccounts, onStatus]);

  const resendNotice = useCallback(async (account: ProvisionedAccount) => {
    setPendingKey(`resend-notice-${account.email}`);
    try {
      await adminRequest("/api/admin/accounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: account.email, action: "resend_notice" }),
      });
      onStatus(`开通通知已重发到 ${account.email}。`, "success");
    } catch (error) {
      onStatus(failureMessage("重发开通通知", error), "error");
    } finally {
      setPendingKey("");
      await loadAccounts();
    }
  }, [loadAccounts, onStatus]);

  const canInviteDirect = !busyLocal && daysValid && direct.name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(direct.email.trim());

  return <div className="admin-section-stack">
    <section className="admin-panel">
      <header className="admin-section-heading"><div>
        <p className="admin-eyebrow">ACCOUNT APPLICATIONS</p>
        <h2>账户申请与开通</h2>
        <p>公开申请页 <a className="admin-inline-link" href="/apply" target="_blank" rel="noreferrer">/apply</a>。点「通过」会生成一张单次邀请码并发到申请邮箱（发件人 zaochang@aetherstudio.top）；明文只在邮件里，这里看不到。</p>
      </div></header>
      <div className="admin-invitation-form">
        <label>邀请码有效天数<input type="number" min={APPLICATION_INVITE_DAYS.min} max={APPLICATION_INVITE_DAYS.max} value={days} onChange={(event) => setDays(Number(event.target.value))} /></label>
      </div>
      <h3>直接邀请 / 直接开通（无需对方申请）</h3>
      <p className="admin-muted">「发送邀请码」：对方收到单次邀请码，自己注册。「直接开通账户」：立即建好账户，对方用邮箱验证码直接登录，无需邀请码。两种方式首次登录都会要求设置用户名和昵称。</p>
      <div className="admin-invitation-form">
        <label>称呼<input value={direct.name} maxLength={40} onChange={(event) => setDirect((current) => ({ ...current, name: event.target.value }))} /></label>
        <label>邮箱<input type="email" value={direct.email} maxLength={254} onChange={(event) => setDirect((current) => ({ ...current, email: event.target.value }))} /></label>
        <label>备注（仅内部可见）<input value={direct.note} maxLength={500} onChange={(event) => setDirect((current) => ({ ...current, note: event.target.value }))} /></label>
        <button type="button" disabled={!direct.email} onClick={() => { setDirectPreview(true); setPreviewId(""); setPreviewMode("invite"); }}><Eye size={15} /> 预览邀请码邮件</button>
        <button type="button" disabled={!canInviteDirect} onClick={() => void inviteDirect()}><MailPlus size={15} /> 发送邀请码</button>
        <button type="button" disabled={!direct.email} onClick={() => { setDirectPreview(true); setPreviewId(""); setPreviewMode("provision"); }}><Eye size={15} /> 预览开通通知</button>
        <button type="button" disabled={busyLocal || !EMAIL_SHAPE.test(direct.email.trim())} onClick={() => void provision({ email: direct.email, nickname: nicknameFrom(direct.name), note: direct.note }, "provision-direct")}><UserCheck size={15} /> 直接开通账户</button>
      </div>
    </section>

    {preview && <section className="admin-panel">
      <header className="admin-section-heading"><div>
        <h2>邮件预览</h2>
        <p>主题：{preview.subject} · 收件人：{preview.to} · 预览里的邀请码是占位码，真码在发送时由服务端生成。</p>
      </div><button type="button" className="admin-preview-close" onClick={() => { setPreviewId(""); setDirectPreview(false); }}>关闭预览</button></header>
      <div className="admin-mail-preview"><iframe title="邀请码邮件预览" sandbox="" srcDoc={preview.html} /></div>
    </section>}

    <section className="admin-panel">
      <header className="admin-section-heading"><div>
        <h2>申请列表</h2>
        <p>待审 {counts.pending} · 已通过 {counts.approved} · 已拒绝 {counts.rejected}</p>
      </div>
        <span className="admin-member-actions">
          <select aria-label="按状态筛选" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
            {(Object.keys(FILTER_LABELS) as Filter[]).map((key) => <option key={key} value={key}>{FILTER_LABELS[key]}</option>)}
          </select>
          <button type="button" disabled={loading} onClick={() => void load()}><RefreshCw size={14} /> 刷新</button>
        </span>
      </header>
      {loading && !applications.length ? <p className="admin-muted">正在读取申请…</p>
        : applications.length ? <div className="admin-record-list">{applications.map((app) => {
          const canResend = app.status === "approved" && !app.isMember && Number(app.invitationUses ?? 0) === 0;
          return <article key={app.id} className={previewId === app.id ? "is-active" : ""}>
            <div>
              <strong>{app.name} · {app.email}{app.isMember ? " · 已是会员" : ""}{app.source === "admin" ? " · 管理员直邀" : ""}</strong>
              <p className="admin-application-intro">{app.intro}</p>
              {app.link && <a href={app.link} target="_blank" rel="noopener noreferrer nofollow">{app.link}</a>}
              <small>申请于 {app.createdAt}（UTC） · {statusLine(app)}</small>
            </div>
            <span className="admin-member-actions">
              {(app.status === "pending" || canResend) && <button type="button" onClick={() => { setPreviewId(app.id); setDirectPreview(false); setPreviewMode("invite"); }}><Eye size={14} /> 预览邮件</button>}
              {app.status === "pending" && !app.isMember && (confirmId === app.id
                ? <>
                    <button type="button" disabled={busyLocal || !daysValid} onClick={() => void decide(app, "approve")}><Send size={14} /> 确认发送（{days} 天）</button>
                    <button type="button" onClick={() => setConfirmId("")}>取消</button>
                  </>
                : <button type="button" disabled={busyLocal} onClick={() => { setConfirmId(app.id); setRejectId(""); setProvisionConfirmId(""); setPreviewId(app.id); setDirectPreview(false); setPreviewMode("invite"); }}><MailPlus size={14} /> 通过（发邀请码）</button>)}
              {app.status === "pending" && !app.isMember && (provisionConfirmId === app.id
                ? <>
                    <button type="button" disabled={busyLocal} onClick={() => void provision({ email: app.email, nickname: nicknameFrom(app.name), note: "来自账户申请" }, `provision-${app.id}`)}><UserCheck size={14} /> 确认直接开通</button>
                    <button type="button" onClick={() => setProvisionConfirmId("")}>取消</button>
                  </>
                : <button type="button" disabled={busyLocal} onClick={() => { setProvisionConfirmId(app.id); setConfirmId(""); setRejectId(""); setPreviewId(app.id); setDirectPreview(false); setPreviewMode("provision"); }}><UserCheck size={14} /> 直接开通</button>)}
              {app.status === "pending" && (rejectId === app.id
                ? <>
                    <input value={rejectNote} maxLength={500} placeholder="拒绝原因（内部可见，不发邮件）" aria-label="拒绝原因" onChange={(event) => setRejectNote(event.target.value)} />
                    <button type="button" className="admin-danger-outline" disabled={busyLocal} onClick={() => void decide(app, "reject")}><UserX size={14} /> 确认拒绝</button>
                    <button type="button" onClick={() => setRejectId("")}>取消</button>
                  </>
                : <button type="button" className="admin-danger-outline" disabled={busyLocal} onClick={() => { setRejectId(app.id); setConfirmId(""); setRejectNote(""); }}><UserX size={14} /> 拒绝</button>)}
              {canResend && <button type="button" disabled={busyLocal || !daysValid} onClick={() => void decide(app, "resend")}><RefreshCw size={14} /> 重发（换新码）</button>}
            </span>
          </article>;
        })}</div>
        : <p className="admin-empty-state">{filter === "pending" ? "没有待审申请。" : "没有记录。"}</p>}
    </section>

    <section className="admin-panel">
      <header className="admin-section-heading"><div>
        <h2>管理员开通的账户</h2>
        <p>直接开通、免邀请码的账户。对方首次登录完善资料前可以重发开通通知。</p>
      </div></header>
      {accounts.length ? <div className="admin-record-list">{accounts.map((account) => (
        <article key={account.email}>
          <div>
            <strong>{account.nickname} · {account.email}{account.username ? ` · @${account.username}` : ""}</strong>
            {account.note && <p>{account.note}</p>}
            <small>开通于 {account.createdAt}（UTC） · {account.createdBy} · {provisionedState(account)}</small>
          </div>
          {account.onboardingRequired && <span className="admin-member-actions">
            <button type="button" disabled={busyLocal} onClick={() => void resendNotice(account)}><RefreshCw size={14} /> 重发通知</button>
          </span>}
        </article>
      ))}</div> : <p className="admin-empty-state">还没有管理员直接开通的账户。</p>}
    </section>
  </div>;
}
