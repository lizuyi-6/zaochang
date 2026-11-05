// 笔试 AI 初评:按服务端评分点给主观题打「建议分 + 判据 + 引文」。
//
// 纪律:
// 1) 评分点只来自服务端 rubric(不进请求体),考生作答当不可信数据;
// 2) 模型输出严格校验,不合格的题落 ungraded(不给分),不用猜的分数凑总分;
// 3) 初评是显式动作,不是收件时的副作用——模型调用慢且花钱,阅卷人点一下才跑;
// 4) 初评结果只写 ai_* 字段,人工分(manual_*)不受影响,人工随时可以覆盖。
import { env } from "cloudflare:workers";
import { guardWrite } from "../../../../_lib/route-guards";
import { database, jsonError } from "../../../../_lib/community";
import { auditAdminAction } from "../../../../_lib/admin";
import { chat, type LlmMessage } from "../../../../_lib/hyperknow/llm";
import {
  buildWrittenTestGradePrompt,
  buildWrittenTestGradeUserParts,
  parseWrittenTestGrade,
  writtenTestGradeTargets,
  type TargetImage,
  type WrittenTestGradeTarget,
} from "../../../../_lib/recruit-written-test-grader";
import type { WrittenTestSubmission } from "../../../../_lib/recruit-written-test";
import { writtenTestItem } from "../../../../_lib/recruit-written-test-rubric";

export const dynamic = "force-dynamic";

const CONCURRENCY = 3;
const CALL_TIMEOUT_MS = 45_000;
/** 单张图片送模型的字节上限(R2 里取出的原始字节);超过落人工评。 */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

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
    const bucket = (env as unknown as { UPLOADS?: R2Bucket }).UPLOADS;

    // 图片题先从 R2 取字节:取不到(键丢失/对象被清)就退回人工评,不用猜测的分数凑数。
    const hydrated = new Map<string, TargetImage[]>();
    if (bucket) {
      for (const target of targets) {
        if (!target.imageKeys.length) continue;
        const images: TargetImage[] = [];
        for (const key of target.imageKeys) {
          try {
            const object = await bucket.get(key);
            if (!object) continue;
            const bytes = await object.arrayBuffer();
            if (bytes.byteLength > MAX_IMAGE_BYTES) continue;
            images.push({
              mime: key.endsWith(".png") ? "image/png" : key.endsWith(".webp") ? "image/webp" : "image/jpeg",
              base64: bytesToBase64(new Uint8Array(bytes)),
              name: key,
            });
          } catch {
            // 单张失败跳过,剩下的图继续。
          }
        }
        hydrated.set(target.key, images);
      }
    }

    const runnable = targets.filter(
      (target) => !target.manualReason && (!target.imageKeys.length || (hydrated.get(target.key)?.length ?? 0) > 0),
    );
    const skipped = targets
      .filter((target) => target.manualReason || (target.imageKeys.length > 0 && !hydrated.get(target.key)?.length))
      .map((target) => ({
        key: target.key,
        label: target.label,
        status: "manual",
        reason: target.manualReason || "图片读取失败(对象丢失或超过大小上限),需人工评",
      }));

    const results: Array<{ key: string; label: string; status: string; score: number | null; maxScore: number; reasons: string[] }> = [];
    const db2 = db;
    for (let index = 0; index < runnable.length; index += CONCURRENCY) {
      const chunk = runnable.slice(index, index + CONCURRENCY);
      const graded = await Promise.all(chunk.map((target) => gradeOne(target, hydrated.get(target.key) ?? [])));
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

async function gradeOne(target: WrittenTestGradeTarget, images: TargetImage[]): Promise<{
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
  const prompt = buildWrittenTestGradePrompt(spec, target.answer, images.length);
  const messages: LlmMessage[] = [
    { role: "system", content: prompt.system },
    images.length
      ? { role: "user", content: buildWrittenTestGradeUserParts(prompt.user, images) }
      : { role: "user", content: prompt.user },
  ];
  try {
    const raw = await chat(messages, { jsonMode: true, maxTokens: 4096, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
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
