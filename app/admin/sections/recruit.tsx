"use client";

import { Archive, ArchiveRestore, Copy, ExternalLink, Plus, Save, Send, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminRequestError, adminErrorMessage, adminRequest } from "../admin-api";
import {
  extractMailTemplatePlaceholders,
  MAIL_TEMPLATE_CATALOG,
  mailTemplateMeta,
  renderMailTemplate,
} from "../../api/_lib/mail-templates";
import { MAIL_STATUS_STAGE_OPTIONS } from "../../api/_lib/mail-status";
import {
  autoFillValuesForTemplate,
  feedbackLibraryFor,
  ROLE_PLACEHOLDER_FIELDS,
  TALENT_PLACEHOLDER,
  type RecruitTalentChoice,
} from "../../api/_lib/recruit-roles";
import {
  RECRUIT_POSITION_OPTIONS,
  RECRUIT_STAGE_LABELS,
  RECRUIT_STAGES,
  type RecruitStage,
} from "../../api/_lib/recruit-candidates";

export type RecruitCandidate = {
  id: string; name: string; email: string; position: string; stage: RecruitStage;
  statusToken: string | null; note: string; archivedAt: string | null; createdAt: string; updatedAt: string;
};

export type MailStatusTokenItem = {
  token: string; label: string;
  state: { stage?: string; done?: number; total?: number; eta?: string; note?: string };
  updatedAt: string; pageUrl: string; pngUrl: string;
};

const RENDER_ERROR_TEXT: Record<string, string> = {
  attach_url_not_aetherstudio: "附件链接必须是 https://aetherstudio.top 域下的链接。",
  status_block_malformed: "模板状态块标记不完整(只有开始没有结束),请检查模板文件。",
  invalid_status_token: "进度令牌应为 32 位十六进制。",
  status_block_unreplaced: "状态块替换后仍有未替换占位,请检查模板文件。",
};

function renderErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("attach_anchor_mismatch")) return "签名锚点数量异常,按钮注入已中止(模板可能被改过)。";
  return RENDER_ERROR_TEXT[message] ?? `渲染失败:${message}`;
}

async function copyText(text: string, onStatus: (m: string, k: "success" | "error") => void, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    onStatus(`${label}已复制到剪贴板。`, "success");
  } catch {
    onStatus(`浏览器未允许自动复制,请手动选择${label}。`, "error");
  }
}

// 发件人字段(跟着操作者走,不跟着候选人走):换候选人时保留,并落在 localStorage。
const SENDER_KEYS = ["发件人姓名", "手机/微信"] as const;
const SENDER_STORAGE_KEY = "recruit-sender-fields";

// ———— 进度令牌编辑器:本地草稿 + 保存(局部更新,未动的字段保持原值) ————
// 行组件以 token+updatedAt 为 key,保存成功后数据变化即重挂载,不需要 effect 同步草稿。
// 字段全部做成选择/日期选择:值守时点几下就能改完,不用逐字敲。
const CUSTOM_POSITION = "__custom";
const POSITION_PRESETS: readonly string[] = RECRUIT_POSITION_OPTIONS;
const TOTAL_CHOICES = Array.from({ length: 10 }, (_, index) => index + 1);

// 已存文本("10 月 24 日")↔ 日期控件值(yyyy-mm-dd)。解析不了的历史值
// 原样保留:保存时若没动日期,就把旧文本写回去,不做静默清空。
function etaToDateInput(eta: string): string {
  const match = /^(\d{1,2})\s*月\s*(\d{1,2})\s*日$/.exec(eta.trim());
  if (!match) return "";
  const now = new Date();
  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = now.getFullYear();
  // 落到半年前的日期视为来年(12 月填 1 月)。
  if (new Date(year, month - 1, day).getTime() < now.getTime() - 180 * 24 * 3600 * 1000) year += 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateInputToEta(value: string): string {
  const [, month, day] = value.split("-");
  if (!month || !day) return "";
  return `${Number(month)} 月 ${Number(day)} 日`;
}

function StatusTokenEditor({ token, busy, onSave, onStatus }: {
  token: MailStatusTokenItem;
  busy: boolean;
  onSave: (token: string, patch: Record<string, string | number>) => void;
  onStatus: (m: string, k: "success" | "error") => void;
}) {
  const [stage, setStage] = useState(token.state.stage ?? "");
  // 数量字段没有"清空"语义(合并补丁只增不减),所以直接给默认值 0/5:
  // 下拉永远有确定选项,保存后进度图一定有数字。
  const [done, setDone] = useState(String(token.state.done ?? 0));
  const [total, setTotal] = useState(String(token.state.total ?? 5));
  const initialEtaDate = etaToDateInput(token.state.eta ?? "");
  const [etaDate, setEtaDate] = useState(initialEtaDate);
  // 阶段词表之外的存量值(老数据/特殊阶段)也要能继续选中,不能被下拉"吃掉"。
  const stageChoices = stage && !(MAIL_STATUS_STAGE_OPTIONS as readonly string[]).includes(stage)
    ? [stage, ...MAIL_STATUS_STAGE_OPTIONS]
    : [...MAIL_STATUS_STAGE_OPTIONS];
  const totalValue = Math.max(Number(total), 1);
  const doneChoices = Array.from({ length: totalValue + 1 }, (_, index) => index);
  if (Number(done) > totalValue) doneChoices.push(Number(done));
  const percent = Math.min(100, Math.round((Number(done) / totalValue) * 100));
  const eta = etaDate === initialEtaDate
    ? (token.state.eta ?? "")
    : (etaDate ? dateInputToEta(etaDate) : "");
  return <div className="admin-token-row">
    <div>
      <strong>{token.label || "(无标签)"}</strong>
      <small>{token.updatedAt} 更新</small>
      {percent !== null && <span className="admin-progress-track"><span className="admin-progress-fill" style={{ width: `${percent}%` }} /></span>}
    </div>
    <div className="admin-token-fields">
      <select aria-label="阶段" value={stage} onChange={(event) => setStage(event.target.value)}>
        <option value="">阶段未设置</option>
        {stageChoices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
      </select>
      <select aria-label="已评份数" value={done} onChange={(event) => setDone(event.target.value)}>
        {doneChoices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
      </select>
      <select aria-label="总份数" value={total} onChange={(event) => {
        const next = event.target.value;
        setTotal(next);
        if (Number(done) > Number(next)) setDone(next);
      }}>
        {TOTAL_CHOICES.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
        {totalValue > TOTAL_CHOICES[TOTAL_CHOICES.length - 1] && <option value={total}>{total}</option>}
      </select>
      <input type="date" aria-label="预计日期" value={etaDate} onChange={(event) => setEtaDate(event.target.value)} />
    </div>
    <div className="admin-member-actions">
      <button type="button" disabled={busy} onClick={() => onSave(token.token, {
        stage,
        eta,
        total: Number(total),
        done: Number(done),
      })}><Save size={14} /> 保存进度</button>
      <button type="button" onClick={() => void copyText(token.pageUrl, onStatus, "进度页链接")}><Copy size={14} /> 链接</button>
      <a className="admin-inline-link" href={token.pageUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> 打开</a>
    </div>
  </div>;
}

export function RecruitSection({ refreshKey, busy, onStatus }: {
  refreshKey: number;
  busy: boolean;
  onStatus: (message: string, kind: "success" | "error") => void;
}) {
  const [candidates, setCandidates] = useState<RecruitCandidate[]>([]);
  const [tokens, setTokens] = useState<MailStatusTokenItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingKey, setPendingKey] = useState("");
  const busyLocal = busy || Boolean(pendingKey);

  const [selectedId, setSelectedId] = useState("");
  const selected = candidates.find((candidate) => candidate.id === selectedId) ?? null;
  const selectedToken = selected?.statusToken ? tokens.find((token) => token.token === selected.statusToken) ?? null : null;

  // 归档视图:默认只看在招;归档只隐藏不删除,展开可查看/恢复。
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = candidates.filter((candidate) => candidate.archivedAt).length;
  const visibleCandidates = showArchived ? candidates : candidates.filter((candidate) => !candidate.archivedAt);

  // 建档草稿
  const [draft, setDraft] = useState({ name: "", email: "", position: "", note: "" });
  const [draftToken, setDraftToken] = useState(true);
  // 岗位默认走预置角色下拉;选「自定义…」才出现输入框(岗位本身仍是自由文本)。
  const [customPosition, setCustomPosition] = useState(false);

  // 邮件面板(全部作用于选中的候选人)
  const [templateId, setTemplateId] = useState("E0");
  const [templateHtml, setTemplateHtml] = useState<Record<string, string>>({});
  const [signature, setSignature] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [subjectSuffix, setSubjectSuffix] = useState("");
  const [attachUrl, setAttachUrl] = useState("");
  const [attachLabel, setAttachLabel] = useState("下载回执 PDF");
  const [withStatus, setWithStatus] = useState(false);
  const [talentChoice, setTalentChoice] = useState<RecruitTalentChoice | "">("");
  // 反馈做成"选一句肯定 + 选一句改进 + 自定义补充":值守时点两下就成稿,
  // 需要贴合这份作业再改写时,直接写在自定义里(两者会拼在一起)。
  const [feedbackPicks, setFeedbackPicks] = useState({ pos: "", neg: "", custom: "" });
  const [confirmingSend, setConfirmingSend] = useState(false);
  const [allowResend, setAllowResend] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [candidateResult, tokenResult] = await Promise.allSettled([
        adminRequest<{ candidates: RecruitCandidate[] }>("/api/admin/recruit-candidates", { cache: "no-store" }),
        adminRequest<{ tokens: MailStatusTokenItem[] }>("/api/admin/mail-status", { cache: "no-store" }),
      ]);
      if (candidateResult.status === "fulfilled") setCandidates(candidateResult.value.candidates);
      if (tokenResult.status === "fulfilled") setTokens(tokenResult.value.tokens);
      const errors = [candidateResult, tokenResult].flatMap((result, index) => result.status === "rejected"
        ? [adminErrorMessage(index === 0 ? "读取候选人" : "读取进度令牌", result.reason)]
        : []);
      if (errors.length) onStatus(errors.join(" "), "error");
    } finally {
      setLoading(false);
    }
  }, [onStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadAll(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshKey, loadAll]);

  // 签名兜底值与模板正文都从静态目录读(与发送端同源:public/mail-templates/)。
  useEffect(() => {
    let active = true;
    fetch("/mail-templates/signature.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<Record<string, string>> : {})
      .then((json) => { if (active) setSignature(json); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // 发件人字段跨会话记忆(每封都要签,重开页面不重填)。
  // 恢复走 setTimeout 异步回填(loadAll 同款惯例),不在 effect 体里同步 setState。
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(SENDER_STORAGE_KEY) ?? "{}") as Record<string, string>;
        const restored = Object.fromEntries(SENDER_KEYS.flatMap((key) => typeof saved[key] === "string" ? [[key, saved[key]]] : []));
        if (Object.keys(restored).length) setValues((current) => ({ ...restored, ...current }));
      } catch { /* 坏缓存当没有 */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const senderValues = Object.fromEntries(SENDER_KEYS.flatMap((key) => values[key]?.trim() ? [[key, values[key]]] : []));
    try { window.localStorage.setItem(SENDER_STORAGE_KEY, JSON.stringify(senderValues)); } catch { /* 隐私模式算了 */ }
  }, [values]);

  useEffect(() => {
    if (templateHtml[templateId]) return;
    let active = true;
    // 静态托管把 .html 收敛成无扩展名(307 美化跳转);直接取无扩展名,少一跳。
    fetch(`/mail-templates/${templateId}`, { cache: "no-store" })
      .then((response) => response.ok ? response.text() : Promise.reject(new Error(`http_${response.status}`)))
      .then((text) => { if (active) setTemplateHtml((current) => ({ ...current, [templateId]: text })); })
      .catch((error) => { if (active) onStatus(adminErrorMessage("读取模板文件", error), "error"); });
    return () => { active = false; };
  }, [templateId, templateHtml, onStatus]);

  const meta = mailTemplateMeta(templateId) ?? MAIL_TEMPLATE_CATALOG[0];
  const html = templateHtml[templateId] ?? "";
  const placeholders = useMemo(() => html ? extractMailTemplatePlaceholders(html) : [], [html]);
  // 自动填充(原型里的 ROLES/FEEDBACK/TALENT):岗位段落按候选人岗位带出,
  // 人才库段落按 A/B 回执带出。只在渲染时合并——手填值永远优先,不会覆盖运营的改写。
  const autoValues = useMemo(
    () => selected ? autoFillValuesForTemplate({ position: selected.position, talent: talentChoice }) : {},
    [selected, talentChoice],
  );
  // 反馈由三个选择合成;三者全空时不写这个键(让缺项检查如实拦住发送)。
  const feedbackText = `${feedbackPicks.pos}${feedbackPicks.neg}${feedbackPicks.custom}`;
  const mergedValues = useMemo<Record<string, string>>(() => ({
    ...signature,
    ...autoValues,
    ...values,
    ...(feedbackText ? { 反馈: feedbackText } : {}),
  }), [signature, autoValues, values, feedbackText]);

  const preview = useMemo(() => {
    if (!html) return null;
    try {
      return renderMailTemplate(html, {
        values: mergedValues,
        subjectSuffix,
        attach: attachUrl.trim() ? { url: attachUrl.trim(), label: attachLabel } : null,
        statusToken: meta.hasStatusBlock && withStatus && selectedToken ? selectedToken.token : null,
      });
    } catch (error) {
      return { error: renderErrorText(error) };
    }
  }, [html, mergedValues, subjectSuffix, attachUrl, attachLabel, meta.hasStatusBlock, withStatus, selectedToken]);

  // 选中候选人 = 之后所有操作的作用对象:邮件收件人、姓名/岗位占位符、
  // 进度令牌一并带入。换候选人时清掉上一个人的内容型占位符(反馈等),发件人字段保留。
  // 岗位段落由 autoValues 按新候选人的岗位重新带出,上一个人的手改写不会残留。
  const selectCandidate = useCallback((candidate: RecruitCandidate) => {
    setSelectedId((current) => current === candidate.id ? "" : candidate.id);
    setConfirmingSend(false);
    setAllowResend(false);
    setTalentChoice("");
    setFeedbackPicks({ pos: "", neg: "", custom: "" });
    setValues((current) => ({
      ...Object.fromEntries(SENDER_KEYS.flatMap((key) => current[key] ? [[key, current[key]]] : [])),
      姓名: candidate.name,
      岗位: candidate.position,
    }));
    setWithStatus(Boolean(candidate.statusToken));
  }, []);

  const createCandidate = useCallback(async () => {
    setPendingKey("candidate-create");
    try {
      const result = await adminRequest<{ candidate: RecruitCandidate }>("/api/admin/recruit-candidates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, createStatusToken: draftToken }),
      });
      setDraft({ name: "", email: "", position: "", note: "" });
      setCustomPosition(false);
      await loadAll();
      selectCandidate(result.candidate);
      onStatus(draftToken ? `已为 ${result.candidate.name} 建档并选中,个人进度令牌已一并创建。` : `已为 ${result.candidate.name} 建档并选中。`, "success");
    } catch (error) {
      onStatus(adminErrorMessage("候选人建档", error), "error");
    } finally {
      setPendingKey("");
    }
  }, [draft, draftToken, loadAll, onStatus, selectCandidate]);

  const updateCandidate = useCallback(async (id: string, patch: Record<string, string | boolean | null>, actionLabel: string) => {
    setPendingKey(`candidate-${id}`);
    try {
      await adminRequest("/api/admin/recruit-candidates", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      await loadAll();
      onStatus(`${actionLabel}。`, "success");
    } catch (error) {
      onStatus(adminErrorMessage(actionLabel, error), "error");
    } finally {
      setPendingKey("");
    }
  }, [loadAll, onStatus]);

  // 归档:收纳整届结束/不再跟进的档案。归档的是当前选中人时先取消选中——
  // 工作台(进度调控/发信)不再作用于 TA,恢复后重新选中即可继续。
  const archiveCandidate = useCallback(async (candidate: RecruitCandidate) => {
    setSelectedId((current) => (current === candidate.id ? "" : current));
    await updateCandidate(candidate.id, { archived: true }, `${candidate.name} 已归档(点「显示已归档」可找回、恢复)`);
  }, [updateCandidate]);

  const saveToken = useCallback(async (token: string, patch: Record<string, string | number>) => {
    setPendingKey(`token-${token}`);
    try {
      await adminRequest("/api/admin/mail-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, ...patch }),
      });
      await loadAll();
      onStatus("进度已更新;已发出的 E8 邮件里的进度图随收件人下次打开刷新。", "success");
    } catch (error) {
      onStatus(adminErrorMessage("进度更新", error), "error");
    } finally {
      setPendingKey("");
    }
  }, [loadAll, onStatus]);

  // 选中的人还没有进度令牌:建一个并绑定回档案。
  const createTokenForSelected = useCallback(async () => {
    if (!selected) return;
    setPendingKey("token-create");
    try {
      const created = await adminRequest<{ token: string }>("/api/admin/mail-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: `${selected.name} · ${selected.position}` }),
      });
      await adminRequest("/api/admin/recruit-candidates", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: selected.id, statusToken: created.token }),
      });
      await loadAll();
      onStatus(`已为 ${selected.name} 创建并绑定进度令牌。`, "success");
    } catch (error) {
      onStatus(adminErrorMessage("创建进度令牌", error), "error");
    } finally {
      setPendingKey("");
    }
  }, [selected, loadAll, onStatus]);

  const sendMail = useCallback(async (force: boolean) => {
    if (!selected) return;
    setPendingKey("mail-send");
    try {
      const result = await adminRequest<{ ok: boolean; subject: string; candidateStage: string | null }>("/api/admin/mail-send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: selected.email,
          candidateId: selected.id,
          template: templateId,
          values: mergedValues,
          subjectSuffix,
          ...(attachUrl.trim() ? { attachUrl: attachUrl.trim(), attachLabel } : {}),
          ...(meta.hasStatusBlock && withStatus && selectedToken ? { statusToken: selectedToken.token } : {}),
          force,
        }),
      });
      setConfirmingSend(false);
      setAllowResend(false);
      await loadAll();
      onStatus(`已发送给 ${selected.email}:${result.subject}${result.candidateStage ? `;环节已推进到「${RECRUIT_STAGE_LABELS[result.candidateStage as RecruitStage]}」` : ""}`, "success");
    } catch (error) {
      if (error instanceof AdminRequestError && error.code === "mail_already_sent") {
        setAllowResend(true);
        onStatus(`这个邮箱已经发过 ${templateId},确认无误再点「强制重发」。`, "error");
      } else if (error instanceof AdminRequestError && error.code === "missing_placeholders") {
        onStatus("还有占位符未填,发送已被拦截。", "error");
      } else {
        onStatus(adminErrorMessage("发送邮件", error), "error");
      }
    } finally {
      setPendingKey("");
    }
  }, [selected, templateId, mergedValues, subjectSuffix, attachUrl, attachLabel, meta.hasStatusBlock, withStatus, selectedToken, loadAll, onStatus]);

  const missing = preview && !("error" in preview) ? preview.missing : [];
  const canSend = Boolean(selected && preview && !("error" in preview) && !missing.length && !busyLocal);

  return <div className="admin-section-stack">
    <section className="admin-panel">
      <header className="admin-section-heading"><div><p className="admin-eyebrow">CANDIDATES</p><h2>候选人</h2><p>先建档,再点选——下面的进度调控和发信都作用于选中的这个人。整届结束的档案点「归档」收纳,归档只隐藏不删除,随时恢复。</p></div></header>
      <form className="admin-recruit-form" onSubmit={(event) => { event.preventDefault(); void createCandidate(); }}>
        <label>姓名<input value={draft.name} maxLength={40} required onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
        <label>邮箱<input type="email" value={draft.email} maxLength={120} required onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /></label>
        <label>岗位
          <select
            aria-label="岗位"
            value={customPosition ? CUSTOM_POSITION : (POSITION_PRESETS.includes(draft.position) ? draft.position : "")}
            onChange={(event) => {
              const value = event.target.value;
              if (value === CUSTOM_POSITION) {
                setCustomPosition(true);
                if (POSITION_PRESETS.includes(draft.position)) setDraft((current) => ({ ...current, position: "" }));
                return;
              }
              setCustomPosition(false);
              setDraft((current) => ({ ...current, position: value }));
            }}
          >
            <option value="">请选择岗位</option>
            {RECRUIT_POSITION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            <option value={CUSTOM_POSITION}>自定义…</option>
          </select>
        </label>
        {customPosition && <label>自定义岗位<input value={draft.position} maxLength={40} required placeholder="如:前端工程师" onChange={(event) => setDraft((current) => ({ ...current, position: event.target.value }))} /></label>}
        <label>备注<input value={draft.note} maxLength={500} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} /></label>
        <label className="admin-recruit-check"><input type="checkbox" checked={draftToken} onChange={(event) => setDraftToken(event.target.checked)} /> 同时创建进度令牌</label>
        <button type="submit" disabled={busyLocal || !draft.name.trim() || !draft.email.trim() || !draft.position.trim()}><UserPlus size={14} /> 建档并选中</button>
      </form>
      {loading && !candidates.length ? <p className="admin-muted">正在读取候选人…</p> : candidates.length ? <>
        {archivedCount > 0 && <p className="admin-muted">
          <button type="button" className="admin-inline-link" onClick={() => setShowArchived((current) => !current)}>
            {showArchived ? `隐藏已归档(共 ${archivedCount} 人)` : `显示已归档(共 ${archivedCount} 人)`}
          </button>
        </p>}
        {visibleCandidates.length ? <div className="admin-record-list">{visibleCandidates.map((candidate) => {
          const isArchived = Boolean(candidate.archivedAt);
          return <article key={candidate.id} className={`${candidate.id === selectedId ? "is-active" : ""}${isArchived ? " is-archived" : ""}`}>
            {isArchived
              ? <button type="button" className="admin-inline-link" disabled={busyLocal}
                onClick={() => void updateCandidate(candidate.id, { archived: false }, `${candidate.name} 已恢复,回到在招列表`)}>
                <ArchiveRestore size={13} /> 恢复
              </button>
              : <button type="button" className="admin-inline-link" onClick={() => selectCandidate(candidate)}>{candidate.id === selectedId ? "取消选中" : "选中"}</button>}
            <div>
              <strong>{candidate.name} · {candidate.position}</strong>
              <small>{candidate.email} · 建档 {candidate.createdAt}{isArchived ? ` · 归档 ${candidate.archivedAt}` : ""}{candidate.note ? ` · ${candidate.note}` : ""}</small>
              {candidate.statusToken && !isArchived && <small>进度页:{`/email/status/${candidate.statusToken}`}</small>}
            </div>
            {!isArchived && <>
              <select className="admin-candidate-stage" aria-label={`${candidate.name} 的环节`} value={candidate.stage} disabled={busyLocal}
                onChange={(event) => void updateCandidate(candidate.id, { stage: event.target.value }, `${candidate.name} 已推进到「${RECRUIT_STAGE_LABELS[event.target.value as RecruitStage]}」`)}>
                {RECRUIT_STAGES.map((stage) => <option key={stage} value={stage}>{RECRUIT_STAGE_LABELS[stage]}</option>)}
              </select>
              <button type="button" className="admin-inline-link" disabled={busyLocal} onClick={() => void archiveCandidate(candidate)}><Archive size={13} /> 归档</button>
            </>}
          </article>;
        })}</div>
        : <p className="admin-empty-state">在招候选人都在归档里,点上面「显示已归档」可以找回、恢复。</p>}
      </> : <p className="admin-empty-state">还没有候选人,先在上面建档。</p>}
    </section>

    {selected && !selected.archivedAt && <section className="admin-panel">
      <header className="admin-section-heading"><div><p className="admin-eyebrow">WORKSPACE</p><h2>{selected.name} · {RECRUIT_STAGE_LABELS[selected.stage]}</h2><p>{selected.email} · {selected.position}。这里的一切操作只作用于 TA。</p></div></header>

      <div className="admin-section-stack">
        <section>
          <h3>实时进度(E8 邮件用)</h3>
          {selectedToken
            ? <StatusTokenEditor key={`${selectedToken.token}:${selectedToken.updatedAt}`} token={selectedToken} busy={busyLocal} onSave={(token, patch) => void saveToken(token, patch)} onStatus={onStatus} />
            : <div className="admin-member-actions">
                <p className="admin-muted">{selected.statusToken ? "令牌数据读取中或未找到…" : "还没有进度令牌。"}</p>
                {!selected.statusToken && <button type="button" disabled={busyLocal} onClick={() => void createTokenForSelected()}><Plus size={14} /> 为 TA 创建进度令牌</button>}
              </div>}
        </section>

        <section>
          <h3>发送邮件</h3>
          <div className="admin-recruit-two-col">
            <div className="admin-section-stack">
              <div className="admin-template-grid">
                {MAIL_TEMPLATE_CATALOG.map((item) => <button type="button" key={item.id} className={`admin-template-card${item.id === templateId ? " is-active" : ""}`} onClick={() => { setTemplateId(item.id); setConfirmingSend(false); setAllowResend(false); }}>
                  <strong>{item.id} · {item.name}</strong>
                  <small>{item.scenario}</small>
                </button>)}
              </div>
              <div className="admin-mail-fields">
                <label>主题后缀(试发用)<input value={subjectSuffix} maxLength={20} placeholder="如:(试发)" onChange={(event) => setSubjectSuffix(event.target.value)} /></label>
                {meta.hasStatusBlock && <label className="admin-recruit-check"><input type="checkbox" checked={withStatus && Boolean(selectedToken)} disabled={!selectedToken} onChange={(event) => setWithStatus(event.target.checked)} /> 附实时进度块{selectedToken ? "" : "(需先创建令牌)"}</label>}
                {placeholders.map((key) => {
                  const roleField = ROLE_PLACEHOLDER_FIELDS[key];
                  const autoText = autoValues[key];
                  const feedbackLibrary = key === "反馈" && selected ? feedbackLibraryFor(selected.position, templateId) : null;
                  if (key === "反馈") return <div key={key} className="admin-feedback-block is-wide">
                    <small className="admin-feedback-label">反馈{selected ? `(按 ${selected.position} 的句库)` : ""}</small>
                    <div className="admin-feedback-selects">
                      <label>肯定一句
                        <select aria-label="反馈肯定句" value={feedbackPicks.pos} onChange={(event) => setFeedbackPicks((current) => ({ ...current, pos: event.target.value }))}>
                          <option value="">未选</option>
                          {(feedbackLibrary?.pos ?? []).map((sentence) => <option key={sentence} value={sentence}>{sentence}</option>)}
                        </select>
                      </label>
                      <label>改进一句
                        <select aria-label="反馈改进句" value={feedbackPicks.neg} onChange={(event) => setFeedbackPicks((current) => ({ ...current, neg: event.target.value }))}>
                          <option value="">未选</option>
                          {(feedbackLibrary?.neg ?? []).map((sentence) => <option key={sentence} value={sentence}>{sentence}</option>)}
                        </select>
                      </label>
                    </div>
                    <label>自定义补充(可留空;要整段手写就选两个「未选」写在这里)
                      <textarea rows={2} value={feedbackPicks.custom} onChange={(event) => setFeedbackPicks((current) => ({ ...current, custom: event.target.value }))} />
                    </label>
                    {!feedbackLibrary && <small className="admin-muted">这个岗位没有预置句库,直接把整段反馈写进上面的自定义。</small>}
                    {feedbackText && <small className="admin-muted">成稿:{feedbackText}</small>}
                  </div>;
                  return <label key={key} className={key.length > 12 ? "is-wide" : ""}>{key}{signature[key] !== undefined ? ` (签名兜底:${signature[key]})` : ""}
                    {roleField && <small className="admin-muted">{autoText ? "已按岗位自动带出,可直接改写" : "岗位未匹配预置角色,请手填"}</small>}
                    {key === TALENT_PLACEHOLDER && <select
                      aria-label="人才库回执"
                      value={talentChoice}
                      onChange={(event) => {
                        setTalentChoice(event.target.value as RecruitTalentChoice | "");
                        // 切换回执即清掉这一段的手改写,让新的 A/B 段落生效。
                        setValues((current) => {
                          const next = { ...current };
                          delete next[key];
                          return next;
                        });
                      }}
                    >
                      <option value="">未选</option>
                      <option value="A">A:同意加入人才库</option>
                      <option value="B">B:未同意,删除报名信息</option>
                    </select>}
                    {key.length > 12
                      ? <textarea rows={3} value={mergedValues[key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />
                      : <input value={mergedValues[key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />}
                  </label>;
                })}
                <label className="is-wide">附件链接(可选,只认 aetherstudio.top;回执 PDF 用 mount.mjs 挂载)<input value={attachUrl} placeholder="https://aetherstudio.top/api/uploads/….pdf" onChange={(event) => setAttachUrl(event.target.value)} /></label>
                {attachUrl.trim() && <label>附件按钮文字<input value={attachLabel} maxLength={20} onChange={(event) => setAttachLabel(event.target.value)} /></label>}
              </div>
              <div className="admin-member-actions">
                {!allowResend
                  ? <button type="button" className={confirmingSend ? "admin-danger-button" : ""} disabled={!canSend}
                      onClick={() => {
                        if (!confirmingSend) { setConfirmingSend(true); return; }
                        void sendMail(false);
                      }}>
                      <Send size={14} /> {confirmingSend ? `再点一次,确认发给 ${selected.email}` : `发送给 ${selected.name}`}
                    </button>
                  : <button type="button" className="admin-danger-button" disabled={!canSend} onClick={() => void sendMail(true)}>
                      <Send size={14} /> 强制重发(该邮箱已发过 {templateId})
                    </button>}
                {confirmingSend && <button type="button" onClick={() => setConfirmingSend(false)}>取消</button>}
                {missing.length > 0 && <small className="admin-muted">未填:{missing.join("、")}</small>}
              </div>
            </div>
            <div className="admin-section-stack">
              {preview && "error" in preview && <p className="admin-status admin-status-error">{preview.error}</p>}
              {preview && !("error" in preview) && <>
                <p className="admin-muted">主题:{preview.subject || "(空)"} · 收件人:{selected.email}</p>
                {/* key 绑定令牌更新时间:进度图 URL 不变、内容随保存变化,srcdoc 字符串不变时
                    React 不重设属性、iframe 不重载,图会一直停在建档时的空状态。保存进度后
                    updatedAt 变化 → 重挂载 → 重新取图,预览始终反映最新进度。 */}
                <div className="admin-mail-preview"><iframe key={selectedToken ? `${selectedToken.token}:${selectedToken.updatedAt}` : "no-token"} title="邮件预览" sandbox="" srcDoc={preview.html} /></div>
              </>}
              {!preview && <p className="admin-muted">正在读取模板…</p>}
            </div>
          </div>
        </section>
      </div>
    </section>}
    <p className="admin-policy-note">发送纪律:一人一封、不群发、不抄送;同邮箱同模板服务端去重(强制重发会留痕);【见界创赛选拔】是品牌文字不是占位符;发送成功即自动推进候选人环节,全部写管理审计。归档是软收纳(可恢复、留审计),归档期间服务端也会拦下发信;归档不解除 email 唯一——同人再报名先恢复原档案。</p>
  </div>;
}
