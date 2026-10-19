"use client";

import { CheckCheck, Copy, ExternalLink, MailPlus, Plus, Save, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminErrorMessage, adminRequest } from "../admin-api";
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

// ———— 进度令牌单行:本地草稿 + 保存(局部更新,未动的字段保持原值) ————
function StatusTokenRow({ token, busy, onSave, onStatus }: {
  token: MailStatusTokenItem;
  busy: boolean;
  onSave: (token: string, patch: Record<string, string | number>) => void;
  onStatus: (m: string, k: "success" | "error") => void;
}) {
  // 草稿初值来自 props;行组件以 token+updatedAt 为 key,保存成功后数据变化即重挂载,
  // 不需要 effect 同步(set-state-in-effect 会级联重渲染,lint 也拦)。
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
      })}><Save size={14} /> 保存</button>
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

  // 候选人建档草稿
  const [draft, setDraft] = useState({ name: "", email: "", position: "", note: "" });
  const [draftToken, setDraftToken] = useState(true);

  // 新建进度令牌
  const [newTokenLabel, setNewTokenLabel] = useState("");

  // 邮件面板
  const [templateId, setTemplateId] = useState("E0");
  const [templateHtml, setTemplateHtml] = useState<Record<string, string>>({});
  const [signature, setSignature] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [recipient, setRecipient] = useState("");
  const [subjectSuffix, setSubjectSuffix] = useState("");
  const [attachUrl, setAttachUrl] = useState("");
  const [attachLabel, setAttachLabel] = useState("下载回执 PDF");
  const [withStatus, setWithStatus] = useState(false);
  const [statusToken, setStatusToken] = useState("");

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

  // 签名兜底值与模板正文都从静态目录读(与 send.mjs 读的是同一批文件)。
  useEffect(() => {
    let active = true;
    fetch("/mail-templates/signature.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<Record<string, string>> : {})
      .then((json) => { if (active) setSignature(json); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (templateHtml[templateId]) return;
    let active = true;
    fetch(`/mail-templates/${templateId}.html`, { cache: "no-store" })
      .then((response) => response.ok ? response.text() : Promise.reject(new Error(`http_${response.status}`)))
      .then((text) => { if (active) setTemplateHtml((current) => ({ ...current, [templateId]: text })); })
      .catch((error) => { if (active) onStatus(adminErrorMessage("读取模板文件", error), "error"); });
    return () => { active = false; };
  }, [templateId, templateHtml, onStatus]);

  const meta = mailTemplateMeta(templateId) ?? MAIL_TEMPLATE_CATALOG[0];
  const html = templateHtml[templateId] ?? "";
  const placeholders = useMemo(() => html ? extractMailTemplatePlaceholders(html) : [], [html]);
  // 表单值 = 签名兜底 + 已填值;改模板时不清空已填值(同名占位符跨模板复用,如 反馈/确认截止日期)。
  const mergedValues = useMemo(() => ({ ...signature, ...values }), [signature, values]);

  const preview = useMemo(() => {
    if (!html) return null;
    try {
      return renderMailTemplate(html, {
        values: mergedValues,
        subjectSuffix,
        attach: attachUrl.trim() ? { url: attachUrl.trim(), label: attachLabel } : null,
        statusToken: meta.hasStatusBlock && withStatus ? statusToken : null,
      });
    } catch (error) {
      return { error: renderErrorText(error) };
    }
  }, [html, mergedValues, subjectSuffix, attachUrl, attachLabel, meta.hasStatusBlock, withStatus, statusToken]);

  const matchedCandidate = candidates.find((candidate) => candidate.email === recipient.trim().toLowerCase()) ?? null;

  const valuesFileContent = useMemo(() => {
    const filled = Object.fromEntries(Object.entries(mergedValues).filter(([, value]) => String(value).trim()));
    return JSON.stringify(filled, null, 2);
  }, [mergedValues]);

  const sendCommand = useMemo(() => {
    const parts = ["node tmp/mail/send.mjs", `--template ${templateId}`, `--to ${recipient.trim() || "<收件邮箱>"}`, "--set-file recruit-mail.json"];
    if (attachUrl.trim()) parts.push(`--attach-url ${attachUrl.trim()}`, `--attach-label "${attachLabel.trim() || "下载回执 PDF"}"`);
    if (meta.hasStatusBlock && withStatus && statusToken) parts.push(`--status-token ${statusToken}`);
    if (subjectSuffix.trim()) parts.push(`--subject-suffix "${subjectSuffix.trim()}"`);
    return parts.join(" ");
  }, [templateId, recipient, attachUrl, attachLabel, meta.hasStatusBlock, withStatus, statusToken, subjectSuffix]);

  const createCandidate = useCallback(async () => {
    setPendingKey("candidate-create");
    try {
      await adminRequest("/api/admin/recruit-candidates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, createStatusToken: draftToken }),
      });
      setDraft({ name: "", email: "", position: "", note: "" });
      await loadAll();
      onStatus(draftToken ? "候选人已建档,个人进度令牌已一并创建。" : "候选人已建档。", "success");
    } catch (error) {
      onStatus(adminErrorMessage("候选人建档", error), "error");
    } finally {
      setPendingKey("");
    }
  }, [draft, draftToken, loadAll, onStatus]);

  const updateCandidate = useCallback(async (id: string, patch: Record<string, string>, actionLabel: string) => {
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
      onStatus("进度已更新;所有已发出邮件里的进度图随下次打开刷新。", "success");
    } catch (error) {
      onStatus(adminErrorMessage("进度更新", error), "error");
    } finally {
      setPendingKey("");
    }
  }, [loadAll, onStatus]);

  const createToken = useCallback(async () => {
    if (!newTokenLabel.trim()) return;
    setPendingKey("token-create");
    try {
      await adminRequest("/api/admin/mail-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: newTokenLabel.trim() }),
      });
      setNewTokenLabel("");
      await loadAll();
      onStatus("进度令牌已创建。", "success");
    } catch (error) {
      onStatus(adminErrorMessage("创建进度令牌", error), "error");
    } finally {
      setPendingKey("");
    }
  }, [newTokenLabel, loadAll, onStatus]);

  // 候选人 → 邮件面板:带入姓名/岗位/收件邮箱;有个人令牌时默认勾选进度块。
  const fillFromCandidate = useCallback((candidate: RecruitCandidate) => {
    setRecipient(candidate.email);
    setValues((current) => ({ ...current, 姓名: candidate.name, 岗位: candidate.position }));
    if (candidate.statusToken) {
      setStatusToken(candidate.statusToken);
      if (meta.hasStatusBlock) setWithStatus(true);
    }
    onStatus(`已把 ${candidate.name} 带入邮件面板。`, "success");
  }, [meta.hasStatusBlock, onStatus]);

  const markSent = useCallback(() => {
    if (!matchedCandidate) return;
    void updateCandidate(matchedCandidate.id, { stage: meta.nextStage }, `已标记发送,${matchedCandidate.name} 推进到「${RECRUIT_STAGE_LABELS[meta.nextStage]}」`);
  }, [matchedCandidate, meta.nextStage, updateCandidate]);

  return <div className="admin-section-stack">
    <section className="admin-panel">
      <header className="admin-section-heading"><div><p className="admin-eyebrow">CANDIDATES</p><h2>候选人</h2><p>建档即入库;勾选「同时创建进度令牌」会顺手建好该候选人的实时进度页(E8 邮件用)。</p></div></header>
      <form className="admin-recruit-form" onSubmit={(event) => { event.preventDefault(); void createCandidate(); }}>
        <label>姓名<input value={draft.name} maxLength={40} required onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
        <label>邮箱<input type="email" value={draft.email} maxLength={120} required onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /></label>
        <label>岗位<input value={draft.position} maxLength={40} required placeholder="如:前端工程师" onChange={(event) => setDraft((current) => ({ ...current, position: event.target.value }))} /></label>
        <label>备注<input value={draft.note} maxLength={500} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} /></label>
        <label className="admin-recruit-check"><input type="checkbox" checked={draftToken} onChange={(event) => setDraftToken(event.target.checked)} /> 同时创建进度令牌</label>
        <button type="submit" disabled={busyLocal || !draft.name.trim() || !draft.email.trim() || !draft.position.trim()}><UserPlus size={14} /> 建档</button>
      </form>
      {loading && !candidates.length ? <p className="admin-muted">正在读取候选人…</p> : candidates.length ? <div className="admin-record-list">{candidates.map((candidate) => <article key={candidate.id}>
        <div>
          <strong>{candidate.name} · {candidate.position}</strong>
          <small>{candidate.email} · 建档 {candidate.createdAt}{candidate.note ? ` · ${candidate.note}` : ""}</small>
          {candidate.statusToken && <small>进度页:{`/email/status/${candidate.statusToken}`}</small>}
        </div>
        <select className="admin-candidate-stage" aria-label={`${candidate.name} 的环节`} value={candidate.stage} disabled={busyLocal}
          onChange={(event) => void updateCandidate(candidate.id, { stage: event.target.value }, `${candidate.name} 已推进到「${RECRUIT_STAGE_LABELS[event.target.value as RecruitStage]}」`)}>
          {RECRUIT_STAGES.map((stage) => <option key={stage} value={stage}>{RECRUIT_STAGE_LABELS[stage]}</option>)}
        </select>
        <button type="button" onClick={() => fillFromCandidate(candidate)}><MailPlus size={14} /> 发邮件</button>
      </article>)}</div> : <p className="admin-empty-state">还没有候选人,先在上面建档。</p>}
    </section>

    <section className="admin-panel">
      <header className="admin-section-heading"><div><p className="admin-eyebrow">LIVE PROGRESS</p><h2>进度调控</h2><p>每得到一次评委进度就在这里保存一次;已发出的 E8 邮件里的进度图随收件人下次打开刷新。只放聚合进度,不放评委身份。</p></div></header>
      <form className="admin-recruit-form" onSubmit={(event) => { event.preventDefault(); void createToken(); }}>
        <label className="is-wide">新令牌标签<input value={newTokenLabel} maxLength={60} placeholder="如:前端组作业评审" onChange={(event) => setNewTokenLabel(event.target.value)} /></label>
        <button type="submit" disabled={busyLocal || !newTokenLabel.trim()}><Plus size={14} /> 创建进度令牌</button>
      </form>
      {tokens.length ? <div>{tokens.map((token) => <StatusTokenRow key={`${token.token}:${token.updatedAt}`} token={token} busy={busyLocal} onSave={(tokenId, patch) => void saveToken(tokenId, patch)} onStatus={onStatus} />)}</div> : <p className="admin-empty-state">还没有进度令牌。</p>}
    </section>

    <section className="admin-panel">
      <header className="admin-section-heading"><div><p className="admin-eyebrow">EMAIL</p><h2>模板与发送</h2><p>选模板、填占位符、右侧实时预览(所见即收件人所得)。网页不发信:复制下方命令到本机跑,SMTP 凭据只在本机。一人一封,不群发不抄送。</p></div></header>
      <div className="admin-recruit-two-col">
        <div className="admin-section-stack">
          <div className="admin-template-grid">
            {MAIL_TEMPLATE_CATALOG.map((item) => <button type="button" key={item.id} className={`admin-template-card${item.id === templateId ? " is-active" : ""}`} onClick={() => setTemplateId(item.id)}>
              <strong>{item.id} · {item.name}</strong>
              <small>{item.scenario}</small>
            </button>)}
          </div>
          <div className="admin-mail-fields">
            <label>收件邮箱<input type="email" value={recipient} maxLength={120} placeholder="候选人邮箱;可从上方候选人卡片「发邮件」带入" onChange={(event) => setRecipient(event.target.value)} /></label>
            <label>主题后缀(试发用)<input value={subjectSuffix} maxLength={20} placeholder="如:(试发)" onChange={(event) => setSubjectSuffix(event.target.value)} /></label>
            {placeholders.map((key) => <label key={key} className={key.length > 12 ? "is-wide" : ""}>{key}{signature[key] !== undefined ? ` (签名兜底:${signature[key]})` : ""}
              {key.length > 12 || key === "反馈"
                ? <textarea rows={3} value={values[key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />
                : <input value={values[key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />}
            </label>)}
            <label className="is-wide">附件链接(可选,只认 aetherstudio.top;回执 PDF 用 mount.mjs 挂载)<input value={attachUrl} placeholder="https://aetherstudio.top/api/uploads/….pdf" onChange={(event) => setAttachUrl(event.target.value)} /></label>
            {attachUrl.trim() && <label>附件按钮文字<input value={attachLabel} maxLength={20} onChange={(event) => setAttachLabel(event.target.value)} /></label>}
            {meta.hasStatusBlock && <label className="admin-recruit-check is-wide"><input type="checkbox" checked={withStatus} onChange={(event) => setWithStatus(event.target.checked)} /> 附实时进度块(不勾则整块摘除)</label>}
            {meta.hasStatusBlock && withStatus && <label className="is-wide">进度令牌
              <select value={statusToken} onChange={(event) => setStatusToken(event.target.value)}>
                <option value="">选择令牌…</option>
                {tokens.map((token) => <option key={token.token} value={token.token}>{token.label || token.token.slice(0, 8)}</option>)}
              </select>
            </label>}
          </div>
          <div className="admin-copy-block">
            <strong>① 保存为 recruit-mail.json(占位符值)</strong>
            <pre>{valuesFileContent}</pre>
            <strong>② 本机执行(含 --dry-run 自检建议先跑一遍)</strong>
            <pre>{sendCommand}</pre>
            <div className="admin-member-actions">
              <button type="button" onClick={() => void copyText(valuesFileContent, onStatus, "占位符 JSON")}><Copy size={14} /> 复制 JSON</button>
              <button type="button" onClick={() => void copyText(sendCommand, onStatus, "发送命令")}><Copy size={14} /> 复制命令</button>
              {matchedCandidate && <button type="button" disabled={busyLocal} onClick={markSent}><CheckCheck size={14} /> 标记已发送,推进到「{RECRUIT_STAGE_LABELS[meta.nextStage]}」</button>}
            </div>
          </div>
        </div>
        <div className="admin-section-stack">
          {preview && "error" in preview && <p className="admin-status admin-status-error">{preview.error}</p>}
          {preview && !("error" in preview) && <>
            <p className="admin-muted">主题:{preview.subject || "(空)"}{preview.missing.length ? ` · 未填占位符:${preview.missing.join("、")}(发信脚本会拒发)` : " · 占位符已填齐"}</p>
            <div className="admin-mail-preview"><iframe title="邮件预览" sandbox="" srcDoc={preview.html} /></div>
          </>}
          {!preview && <p className="admin-muted">正在读取模板…</p>}
        </div>
      </div>
    </section>
    <p className="admin-policy-note">发送纪律:一人一封、不群发、不抄送,逐封间隔约 5 秒;【见界创赛选拔】是品牌文字不是占位符;邮件发出不可撤回,先发自己试发一封再发候选人。</p>
  </div>;
}
