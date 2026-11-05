// 笔试 AI 初评:按服务端评分点给主观题打「建议分 + 判据 + 引文」。
//
// 纪律:
// 1) 评分点只来自服务端 rubric(不进请求体),考生作答当不可信数据;
// 2) 模型输出严格校验,不合格的题落 ungraded(不给分),不用猜的分数凑总分;
// 3) 初评是显式动作,不是收件时的副作用——模型调用慢且花钱,阅卷人点一下才跑;
// 4) 初评结果只写 ai_* 字段,人工分(manual_*)不受影响,人工随时可以覆盖。
import { guardWrite } from "../../../../_lib/route-guards";
import { database, jsonError } from "../../../../_lib/community";
import { auditAdminAction } from "../../../../_lib/admin";
import { chat } from "../../../../_lib/hyperknow/llm";
import {
  buildWrittenTestGradePrompt,
  parseWrittenTestGrade,
  writtenTestGradeTargets,
  type WrittenTestGradeTarget,
} from "../../../../_lib/recruit-written-test-grader";
import type { WrittenTestSubmission } from "../../../../_lib/recruit-written-test";
import { writtenTestItem } from "../../../../_lib/recruit-written-test-rubric";

export const dynamic = "force-dynamic";

const CONCURRENCY = 3;
const CALL_TIMEOUT_MS = 45_000;

type StoredRow = {
  id: string;
  answersJson: string;
  attachmentsJson: string;
};

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function POST(request: Request) {
  try {
    const guarded = await guardWrite(request, {
      member: "adminOrAgent",
      sameOrigin: true,
      rate: { bucket: "recruit-written-test-score", limit: 60, windowSeconds: 60 * 60 },
    });
    if (guarded instanceof Response) return guarded;
    const actor = guarded.member;

    const input = await request.json().catch(() => ({})) as Record<string, unknown>;
    const id = typeof input.id === "string" ? input.id.trim() : "";
    if (!id) return Response.json({ error: "missing_id" }, { status: 400 });
    const keys = Array.isArray(input.keys)
      ? (input.keys as unknown[]).map((entry) => (typeof entry === "string" ? entry : "")).filter(Boolean)
      : [];

    const db = database();
    const stored = await db
      .prepare(`SELECT id, answers_json AS answersJson, attachments_json AS attachmentsJson FROM recruit_written_tests WHERE id = ?`)
      .bind(id)
      .first<StoredRow>();
    if (!stored) return Response.json({ error: "written_test_not_found" }, { status: 404 });

    const answers = parseJson<Record<string, string>>(stored.answersJson, {});
    const attachments = parseJson<WrittenTestSubmission["attachments"]>(stored.attachmentsJson, {});
    const submission = {
      answers,
      attachments,
    } as WrittenTestSubmission;

    const targets = writtenTestGradeTargets(submission, keys.length ? keys : undefined);
    const runnable = targets.filter((target) => !target.manualReason);
    const skipped = targets
      .filter((target) => target.manualReason)
      .map((target) => ({ key: target.key, label: target.label, status: "manual", reason: target.manualReason }));

    const results: Array<{ key: string; label: string; status: string; score: number | null; maxScore: number; reasons: string[] }> = [];
    const db2 = db;
    for (let index = 0; index < runnable.length; index += CONCURRENCY) {
      const chunk = runnable.slice(index, index + CONCURRENCY);
      const graded = await Promise.all(chunk.map((target) => gradeOne(target)));
      for (const item of graded) {
        if (item.status === "graded") {
          await db2
            .prepare(
              `UPDATE recruit_written_test_items
                 SET ai_score = ?, ai_reasons_json = ?, ai_evidence_json = ?, ai_uncertain = ?, ai_status = 'graded',
                     updated_at = CURRENT_TIMESTAMP
               WHERE submission_id = ? AND item_key = ?`,
            )
            .bind(
              item.score,
              JSON.stringify(item.reasons),
              JSON.stringify(item.evidence),
              item.uncertain ? 1 : 0,
              id,
              item.key,
            )
            .run();
        } else {
          await db2
            .prepare(
              `UPDATE recruit_written_test_items
                 SET ai_score = NULL, ai_reasons_json = '[]', ai_evidence_json = '[]', ai_uncertain = 0,
                     ai_status = 'ungraded', updated_at = CURRENT_TIMESTAMP
               WHERE submission_id = ? AND item_key = ?`,
            )
            .bind(id, item.key)
            .run();
        }
        results.push({
          key: item.key,
          label: item.label,
          status: item.status,
          score: item.score,
          maxScore: item.maxScore,
          reasons: item.reasons,
        });
      }
    }

    const total = await db
      .prepare(`SELECT SUM(ai_score) AS aiScore FROM recruit_written_test_items WHERE submission_id = ?`)
      .bind(id)
      .first<{ aiScore: number | null }>();
    await db
      .prepare(
        `UPDATE recruit_written_tests
           SET ai_score = ?, ai_graded_at = CURRENT_TIMESTAMP,
               status = CASE WHEN status = 'pending' THEN 'reviewing' ELSE status END,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(total?.aiScore ?? null, id)
      .run();

    await auditAdminAction(
      actor.email,
      "recruit_written_test.ai_grade",
      "recruit_written_test",
      id,
      `初评 ${results.filter((item) => item.status === "graded").length}/${results.length} 题可用`,
    );

    return Response.json({
      ok: true,
      id,
      aiScore: total?.aiScore ?? null,
      graded: results.filter((item) => item.status === "graded").length,
      results: [...results, ...skipped],
    });
  } catch (error) {
    return jsonError(error);
  }
}

async function gradeOne(target: WrittenTestGradeTarget): Promise<{
  key: string;
  label: string;
  status: "graded" | "ungraded";
  score: number | null;
  maxScore: number;
  reasons: string[];
  evidence: string[];
  uncertain: boolean;
}> {
  const spec = writtenTestItem(target.key);
  if (!spec) {
    return { key: target.key, label: target.label, status: "ungraded", score: null, maxScore: target.maxScore, reasons: [], evidence: [], uncertain: true };
  }
  const prompt = buildWrittenTestGradePrompt(spec, target.answer);
  try {
    const raw = await chat(
      [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      { jsonMode: true, maxTokens: 4096, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) },
    );
    const parsed = parseWrittenTestGrade(raw, target.maxScore);
    if (!parsed) {
      return { key: target.key, label: target.label, status: "ungraded", score: null, maxScore: target.maxScore, reasons: [], evidence: [], uncertain: true };
    }
    return {
      key: target.key,
      label: target.label,
      status: "graded",
      score: parsed.score,
      maxScore: target.maxScore,
      reasons: parsed.reasons,
      evidence: parsed.evidence,
      uncertain: parsed.uncertain,
    };
  } catch {
    return { key: target.key, label: target.label, status: "ungraded", score: null, maxScore: target.maxScore, reasons: [], evidence: [], uncertain: true };
  }
}
