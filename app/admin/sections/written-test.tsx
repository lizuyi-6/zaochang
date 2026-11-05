"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Download, FileText, RefreshCw, Save } from "lucide-react";
import { adminErrorMessage, adminRequest, adminWriteInit } from "../admin-api";

// 笔试阅卷台:飞书笔试提交进来后,AI 先按服务端评分点给建议分,人工在这里改分、定稿。
// 纪律:AI 分与人工分分列保存(人工改判不覆盖 AI 记录);最终分 = 人工分 ?? AI 建议分。

type Submission = {
  id: string;
  sourceRecordId: string;
  name: string;
  school: string;
  contact: string;
  positions: string[];
  competition: string;
  integrityConfirmed: boolean;
  hardScore: number;
  flags: string[];
  aiScore: number | null;
  manualScore: number | null;
  finalScore: number;
  finalMaxScore: number;
  gradedCount: number;
  status: string;
  note: string;
  gradedBy: string;
  submittedAt: string;
};

type Item = {
  key: string;
  label: string;
  section: string;
  maxScore: number;
  answer: string;
  attachments: Array<{ fileToken: string; name: string; size: number | null; text: string }>;
  aiScore: number | null;
  aiReasons: string[];
  aiEvidence: string[];
  aiUncertain: boolean;
  aiStatus: string;
  manualScore: number | null;
  manualNote: string;
  finalScore: number | null;
  gradedBy: string;
  gradedAt: string | null;
};

type Detail = {
  submission: Submission;
  items: Item[];
  timings: Record<string, number | null>;
};

type Draft = { score: string; note: string };

const STATUS_LABELS: Record<string, string> = {
  pending: "待评",
  reviewing: "评阅中",
  done: "已定稿",
  flagged: "需复核",
};

const AI_STATUS_LABELS: Record<string, string> = {
  pending: "未初评",
  graded: "已初评",
  ungraded: "初评不可用",
  manual: "纯人工",
};

function formatTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("zh-CN", { hour12: false });
}

export function WrittenTestSection({
  refreshKey,
  busy,
  onStatus,
}: {
  refreshKey: number;
  busy: boolean;
  onStatus: (message: string, kind: "success" | "error") => void;
}) {
  const [list, setList] = useState<Submission[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const data = await adminRequest<{ submissions: Submission[] }>("/api/admin/recruit/written-test", { cache: "no-store" });
      setList(data.submissions ?? []);
    } catch (error) {
      onStatus(adminErrorMessage("读取笔试提交", error), "error");
    }
  }, [onStatus]);

  useEffect(() => {
    // 恢复走 setTimeout 异步回填(与「选拔」分区同款惯例),不在 effect 体里同步 setState。
    const timer = window.setTimeout(() => { void loadList(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadList, refreshKey]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const data = await adminRequest<Detail>(`/api/admin/recruit/written-test?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      setDetail(data);
      const next: Record<string, Draft> = {};
      for (const item of data.items) {
        next[item.key] = {
          score: item.manualScore === null || item.manualScore === undefined ? "" : String(item.manualScore),
          note: item.manualNote ?? "",
        };
      }
      setDrafts(next);
      setTouched(new Set());
    } catch (error) {
      onStatus(adminErrorMessage("读取提交详情", error), "error");
    }
  }, [onStatus]);

  const filtered = useMemo(() => {
    const key = query.trim().toLowerCase();
    if (!key) return list;
    return list.filter((entry) =>
      [entry.name, entry.school, entry.contact, entry.sourceRecordId, entry.positions.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(key),
    );
  }, [list, query]);

  const metrics = useMemo(() => {
    const scored = list.filter((entry) => entry.finalScore > 0);
    const aiScored = list.filter((entry) => typeof entry.aiScore === "number");
    const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
    return {
      total: list.length,
      pending: list.filter((entry) => entry.status === "pending").length,
      flagged: list.filter((entry) => entry.status === "flagged" || !entry.integrityConfirmed).length,
      avgFinal: average(scored.map((entry) => entry.finalScore)),
      avgAi: average(aiScored.map((entry) => entry.aiScore as number)),
    };
  }, [list]);

  const updateDraft = (key: string, patch: Partial<Draft>) => {
    setDrafts((current) => {
      const base = current[key] ?? { score: "", note: "" };
      return { ...current, [key]: { ...base, ...patch } };
    });
    setTouched((current) => new Set(current).add(key));
  };

  const saveScores = async () => {
    if (!detail) return;
    const items = [...touched].map((key) => {
      const draft = drafts[key] ?? { score: "", note: "" };
      const trimmed = draft.score.trim();
      return {
        key,
        score: trimmed === "" ? null : Number(trimmed),
        note: draft.note,
      };
    });
    if (!items.length) {
      onStatus("没有改动需要保存", "error");
      return;
    }
    setWorking(true);
    try {
      await adminRequest("/api/admin/recruit/written-test", adminWriteInit({ id: detail.submission.id, items }));
      onStatus(`已保存 ${items.length} 题的人工分`, "success");
      await loadDetail(detail.submission.id);
      await loadList();
    } catch (error) {
      onStatus(adminErrorMessage("保存人工分", error), "error");
    } finally {
      setWorking(false);
    }
  };

  const runAiGrading = async () => {
    if (!detail) return;
    setWorking(true);
    onStatus("AI 初评中：会按服务端评分点逐题调用模型，请稍候", "success");
    try {
      const result = await adminRequest<{ graded: number; results: Array<{ key: string; status: string }> }>(
        "/api/admin/recruit/written-test/score",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: detail.submission.id }) },
      );
      const failed = result.results.filter((entry) => entry.status === "ungraded").length;
      onStatus(
        failed
          ? `AI 初评完成：${result.graded} 题有建议分，${failed} 题输出不可用已留空`
          : `AI 初评完成：${result.graded} 题给出建议分`,
        failed ? "error" : "success",
      );
      await loadDetail(detail.submission.id);
      await loadList();
    } catch (error) {
      onStatus(adminErrorMessage("AI 初评", error), "error");
    } finally {
      setWorking(false);
    }
  };

  const acceptAllAi = () => {
    if (!detail) return;
    const next: Record<string, Draft> = { ...drafts };
    const keys = new Set(touched);
    for (const item of detail.items) {
      if (item.aiScore === null || item.aiScore === undefined) continue;
      next[item.key] = { score: String(item.aiScore), note: next[item.key]?.note ?? "" };
      keys.add(item.key);
    }
    setDrafts(next);
    setTouched(keys);
    onStatus("已把 AI 建议分填入评分框，确认后点保存", "success");
  };

  const exportCsv = () => {
    const header = ["提交时间", "姓名", "学校专业年级", "意向岗位", "诚信确认", "硬判分", "AI 建议分", "最终分", "状态"];
    const rows = list.map((entry) => [
      entry.submittedAt,
      entry.name,
      entry.school,
      entry.positions.join("/"),
      entry.integrityConfirmed ? "已确认" : "未确认",
      String(entry.hardScore),
      entry.aiScore === null ? "" : String(entry.aiScore),
      String(entry.finalScore),
      STATUS_LABELS[entry.status] ?? entry.status,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `笔试阅卷表-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const sections = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of detail?.items ?? []) {
      const list = map.get(item.section) ?? [];
      list.push(item);
      map.set(item.section, list);
    }
    return [...map.entries()];
  }, [detail]);

  return (
    <>
      <section className="admin-panel">
        <div className="admin-section-heading">
          <div>
            <p className="admin-eyebrow">RECRUIT / WRITTEN TEST</p>
            <h2>笔试阅卷</h2>
            <p>飞书笔试提交进来后先做硬判,AI 按服务端评分点给建议分,人工在这里改分定稿。</p>
          </div>
          <button type="button" className="admin-secondary-button" onClick={() => void loadList()} disabled={busy || working}>
            <RefreshCw size={13} /> 刷新
          </button>
        </div>
        <div className="admin-metric-grid">
          <div className="admin-metric">
            <span>提交份数</span>
            <strong>{metrics.total}</strong>
          </div>
          <div className="admin-metric">
            <span>待评 / 需复核</span>
            <strong>
              {metrics.pending} / {metrics.flagged}
            </strong>
          </div>
          <div className="admin-metric">
            <span>平均最终分 / AI 建议分</span>
            <strong>
              {metrics.avgFinal.toFixed(1)} / {metrics.avgAi.toFixed(1)}
            </strong>
          </div>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-section-heading">
          <div>
            <h2>提交列表</h2>
            <p>点一条看逐题作答与评分;分数口径:最终分 = 人工分(优先)或 AI 建议分。</p>
          </div>
          <button type="button" className="admin-secondary-button" onClick={exportCsv} disabled={!list.length}>
            <Download size={13} /> 导出 CSV
          </button>
        </div>
        <input
          className="admin-search-input"
          value={query}
          placeholder="按姓名 / 学校 / 联系方式搜索"
          onChange={(event) => setQuery(event.target.value)}
        />
        {filtered.length === 0 ? (
          <p className="admin-empty-state">还没有笔试提交。飞书表单提交后会自动出现在这里。</p>
        ) : (
          <div className="admin-record-list">
            {filtered.map((entry) => (
              <article key={entry.id} className={entry.id === selectedId ? "is-active" : ""}>
                <div>
                  <strong>
                    {entry.name} · {entry.school || "未填学校"}
                  </strong>
                  <small>
                    {formatTime(entry.submittedAt)} · {entry.positions.join("/") || "未选岗位"} · 硬判 {entry.hardScore}/4
                    {entry.aiScore !== null ? ` · AI ${entry.aiScore}` : " · 未初评"}
                    {entry.finalScore > 0 ? ` · 最终 ${entry.finalScore}` : ""}
                  </small>
                  {entry.flags.length ? <small>⚠ {entry.flags.join("；")}</small> : null}
                </div>
                <button type="button" onClick={() => { setSelectedId(entry.id); void loadDetail(entry.id); }}>
                  {entry.id === selectedId ? "正在看" : "阅卷"}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {detail ? (
        <section className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <p className="admin-eyebrow">SUBMISSION</p>
              <h2>
                {detail.submission.name} · {detail.submission.school || "未填学校"}
              </h2>
              <p>
                {detail.submission.contact || "未留联系方式"} · {detail.submission.positions.join("/") || "未选岗位"} · 诚信确认
                {detail.submission.integrityConfirmed ? "已勾选" : "未勾选"} · 最终分 {detail.submission.finalScore}
                {detail.submission.finalMaxScore ? `/${detail.submission.finalMaxScore}` : ""}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="admin-secondary-button" onClick={() => void runAiGrading()} disabled={busy || working}>
                <Bot size={13} /> {working ? "处理中…" : "AI 初评"}
              </button>
              <button type="button" className="admin-secondary-button" onClick={acceptAllAi} disabled={busy || working}>
                全部采纳建议分
              </button>
              <button type="button" onClick={() => void saveScores()} disabled={busy || working || !touched.size}>
                <Save size={13} /> 保存{touched.size ? `(${touched.size})` : ""}
              </button>
            </div>
          </div>

          {detail.submission.flags.length ? (
            <p className="admin-status admin-status-error">⚠ {detail.submission.flags.join("；")}</p>
          ) : null}

          <p className="admin-policy-note">
            AI 分是建议,不是结论:面试还要当面讲解与现场修改。每题都留判据与引文,改判请在备注里写原因。
          </p>

          {sections.map(([section, items]) => (
            <div key={section} style={{ marginTop: 14 }}>
              <p className="admin-eyebrow">{section}</p>
              {items.map((item) => {
                const draft = drafts[item.key] ?? { score: "", note: "" };
                const aiReady = item.aiScore !== null && item.aiScore !== undefined;
                return (
                  <div key={item.key} className="admin-panel" style={{ marginTop: 8, padding: 14 }}>
                    <div className="admin-section-heading" style={{ marginBottom: 8, paddingBottom: 8 }}>
                      <div>
                        <strong>
                          {item.label}
                          {item.maxScore ? ` · ${item.maxScore} 分` : ""}
                        </strong>
                        <small>
                          AI {aiReady ? `${item.aiScore} 分(${AI_STATUS_LABELS[item.aiStatus] ?? item.aiStatus})` : AI_STATUS_LABELS[item.aiStatus] ?? item.aiStatus}
                          {item.aiUncertain ? " · 存疑" : ""}
                          {item.manualScore !== null && item.manualScore !== undefined ? ` · 人工 ${item.manualScore} 分` : ""}
                        </small>
                      </div>
                    </div>

                    {item.answer ? <p className="admin-record-list"><small>{item.answer}</small></p> : null}
                    {item.attachments.length ? (
                      <p className="admin-muted">
                        {item.attachments.map((file) => (
                          <span key={file.fileToken || file.name} style={{ display: "inline-flex", alignItems: "center", gap: 5, marginRight: 10 }}>
                            <FileText size={12} /> {file.name}
                            {file.text ? "（已抽文本）" : "（未抽文本）"}
                          </span>
                        ))}
                      </p>
                    ) : null}

                    {item.aiReasons.length ? (
                      <ul className="admin-muted" style={{ margin: "6px 0", paddingLeft: 18 }}>
                        {item.aiReasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    ) : null}
                    {item.aiEvidence.length ? (
                      <p className="admin-muted">引文:{item.aiEvidence.join(" / ")}</p>
                    ) : null}

                    {item.maxScore > 0 ? (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                        <label className="admin-muted" htmlFor={`score-${item.key}`}>
                          人工分 / {item.maxScore}
                        </label>
                        <input
                          id={`score-${item.key}`}
                          type="number"
                          min={0}
                          max={item.maxScore}
                          step={0.5}
                          value={draft.score}
                          style={{ width: 88 }}
                          onChange={(event) => updateDraft(item.key, { score: event.target.value })}
                        />
                        {aiReady ? (
                          <button type="button" className="admin-secondary-button" onClick={() => updateDraft(item.key, { score: String(item.aiScore) })}>
                            采纳 {item.aiScore}
                          </button>
                        ) : null}
                        <input
                          value={draft.note}
                          placeholder="改判原因 / 备注"
                          style={{ flex: "1 1 220px" }}
                          onChange={(event) => updateDraft(item.key, { note: event.target.value })}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}
