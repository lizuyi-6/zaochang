"use client";

import { Copy, ExternalLink, Plus, Save, Send, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminRequestError, adminErrorMessage, adminRequest } from "../admin-api";
import {
  extractMailTemplatePlaceholders,
  MAIL_TEMPLATE_CATALOG,
  mailTemplateMeta,
  renderMailTemplate,
} from "../../api/_lib/mail-templates";
import { RECRUIT_STAGE_LABELS, RECRUIT_STAGES, type RecruitStage } from "../../api/_lib/recruit-candidates";

export type RecruitCandidate = {
  id: string; name: string; email: string; position: string; stage: RecruitStage;
  statusToken: string | null; note: string; createdAt: string; updatedAt: string;
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
function StatusTokenEditor({ token, busy, onSave, onStatus }: {
  token: MailStatusTokenItem;
  busy: boolean;
  onSave: (token: string, patch: Record<string, string | number>) => void;
  onStatus: (m: string, k: "success" | "error") => void;
}) {
  const [stage, setStage] = useState(token.state.stage ?? "");
  const [done, setDone] = useState(String(token.state.done ?? ""));
  const [total, setTotal] = useState(String(token.state.total ?? ""));
  const [eta, setEta] = useState(token.state.eta ?? "");
  const numericTotal = Number(total);
  const percent = Number.isFinite(numericTotal) && numericTotal > 0 && done !== ""
    ? Math.min(100, Math.round((Number(done) / numericTotal) * 100))
    : null;
  return <div className="admin-token-row">
    <div>
      <strong>{token.label || "(无标签)"}</strong>
      <small>{token.updatedAt} 更新</small>
      {percent !== null && <span className="admin-progress-track"><span className="admin-progress-fill" style={{ width: `${percent}%` }} /></span>}
    </div>
    <div className="admin-token-fields">
      <input aria-label="阶段" placeholder="阶段(如:评委评审中)" value={stage} maxLength={40} onChange={(event) => setStage(event.target.value)} />
      <input aria-label="已评份数" placeholder="已评" inputMode="numeric" value={done} onChange={(event) => setDone(event.target.value.replace(/[^0-9]/g, ""))} />
      <input aria-label="总份数" placeholder="总数" inputMode="numeric" value={total} onChange={(event) => setTotal(event.target.value.replace(/[^0-9]/g, ""))} />
      <input aria-label="预计日期" placeholder="预计(如:本周五)" value={eta} maxLength={40} onChange={(event) => setEta(event.target.value)} />
    </div>
    <div className="admin-member-actions">
      <button type="button" disabled={busy} onClick={() => onSave(token.token, {
        stage, eta,
        ...(done !== "" ? { done: Number(done) } : {}),
        ...(total !== "" ? { total: Number(total) } : {}),
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

  // 建档草稿
  const [draft, setDraft] = useState({ name: "", email: "", position: "", note: "" });
  const [draftToken, setDraftToken] = useState(true);

  // 邮件面板(全部作用于选中的候选人)
  const [templateId, setTemplateId] = useState("E0");
  const [templateHtml, setTemplateHtml] = useState<Record<string, string>>({});
  const [signature, setSignature] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [subjectSuffix, setSubjectSuffix] = useState("");
  const [attachUrl, setAttachUrl] = useState("");
  const [attachLabel, setAttachLabel] = useState("下载回执 PDF");
  const [withStatus, setWithStatus] = useState(false);
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
  const mergedValues = useMemo(() => ({ ...signature, ...values }), [signature, values]);

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
  const selectCandidate = useCallback((candidate: RecruitCandidate) => {
    setSelectedId((current) => current === candidate.id ? "" : candidate.id);
    setConfirmingSend(false);
    setAllowResend(false);
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
      await loadAll();
      selectCandidate(result.candidate);
      onStatus(draftToken ? `已为 ${result.candidate.name} 建档并选中,个人进度令牌已一并创建。` : `已为 ${result.candidate.name} 建档并选中。`, "success");
    } catch (error) {
      onStatus(adminErrorMessage("候选人建档", error), "error");
    } finally {
      setPendingKey("");
    }
  }, [draft, draftToken, loadAll, onStatus, selectCandidate]);

  const updateCandidate = useCallback(async (id: string, patch: Record<string, string | null>, actionLabel: string) => {
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
      <header className="admin-section-heading"><div><p className="admin-eyebrow">CANDIDATES</p><h2>候选人</h2><p>先建档,再点选——下面的进度调控和发信都作用于选中的这个人。</p></div></header>
      <form className="admin-recruit-form" onSubmit={(event) => { event.preventDefault(); void createCandidate(); }}>
        <label>姓名<input value={draft.name} maxLength={40} required onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
        <label>邮箱<input type="email" value={draft.email} maxLength={120} required onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /></label>
        <label>岗位<input value={draft.position} maxLength={40} required placeholder="如:前端工程师" onChange={(event) => setDraft((current) => ({ ...current, position: event.target.value }))} /></label>
        <label>备注<input value={draft.note} maxLength={500} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} /></label>
        <label className="admin-recruit-check"><input type="checkbox" checked={draftToken} onChange={(event) => setDraftToken(event.target.checked)} /> 同时创建进度令牌</label>
        <button type="submit" disabled={busyLocal || !draft.name.trim() || !draft.email.trim() || !draft.position.trim()}><UserPlus size={14} /> 建档并选中</button>
      </form>
      {loading && !candidates.length ? <p className="admin-muted">正在读取候选人…</p> : candidates.length ? <div className="admin-record-list">{candidates.map((candidate) => <article key={candidate.id} className={candidate.id === selectedId ? "is-active" : ""}>
        <button type="button" className="admin-inline-link" onClick={() => selectCandidate(candidate)}>{candidate.id === selectedId ? "取消选中" : "选中"}</button>
        <div>
          <strong>{candidate.name} · {candidate.position}</strong>
          <small>{candidate.email} · 建档 {candidate.createdAt}{candidate.note ? ` · ${candidate.note}` : ""}</small>
          {candidate.statusToken && <small>进度页:{`/email/status/${candidate.statusToken}`}</small>}
        </div>
        <select className="admin-candidate-stage" aria-label={`${candidate.name} 的环节`} value={candidate.stage} disabled={busyLocal}
          onChange={(event) => void updateCandidate(candidate.id, { stage: event.target.value }, `${candidate.name} 已推进到「${RECRUIT_STAGE_LABELS[event.target.value as RecruitStage]}」`)}>
          {RECRUIT_STAGES.map((stage) => <option key={stage} value={stage}>{RECRUIT_STAGE_LABELS[stage]}</option>)}
        </select>
      </article>)}</div> : <p className="admin-empty-state">还没有候选人,先在上面建档。</p>}
    </section>

    {selected && <section className="admin-panel">
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
                {placeholders.map((key) => <label key={key} className={key.length > 12 ? "is-wide" : ""}>{key}{signature[key] !== undefined ? ` (签名兜底:${signature[key]})` : ""}
                  {key.length > 12 || key === "反馈"
                    ? <textarea rows={3} value={values[key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />
                    : <input value={values[key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />}
                </label>)}
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
                <div className="admin-mail-preview"><iframe title="邮件预览" sandbox="" srcDoc={preview.html} /></div>
              </>}
              {!preview && <p className="admin-muted">正在读取模板…</p>}
            </div>
          </div>
        </section>
      </div>
    </section>}
    <p className="admin-policy-note">发送纪律:一人一封、不群发、不抄送;同邮箱同模板服务端去重(强制重发会留痕);【见界创赛选拔】是品牌文字不是占位符;发送成功即自动推进候选人环节,全部写管理审计。</p>
  </div>;
}
