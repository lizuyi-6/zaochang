// 笔试阅卷(admin/agent 机器通道 + 管理台「笔试阅卷」分区)。
// GET  ?id=…  取单份提交详情(含逐题作答、AI 初评、人工分);不带 id 取列表。
// PATCH      保存人工分/备注/状态(逐题局部更新,不覆盖 AI 记录)。
// 分数口径:一题的最终分 = manual_score ?? ai_score;两者都没有算未评。
// AI 只给建议分,人工定稿写 manual_score——面试还要当面讲解,自动分不能当结论。
import { guardWrite } from "../../../_lib/route-guards";
import { requireAdminOrAgent } from "../../../_lib/access-control";
import { database, jsonError } from "../../../_lib/community";
import { auditAdminAction } from "../../../_lib/admin";
import { normalizeWrittenTestManualPatch } from "../../../_lib/recruit-written-test";
import { WRITTEN_TEST_ITEMS } from "../../../_lib/recruit-written-test-rubric";

export const dynamic = "force-dynamic";

type SubmissionRow = {
  id: string;
  sourceRecordId: string;
  signupReference: string;
  name: string;
  school: string;
  contact: string;
  positions: string;
  competition: string;
  answersJson: string;
  attachmentsJson: string;
  timingsJson: string;
  integrityConfirmed: number;
  hardScore: number;
  hardScoreJson: string;
  flagsJson: string;
  aiScore: number | null;
  manualScore: number | null;
  status: string;
  note: string;
  gradedBy: string;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
  finalScore: number | null;
  finalMaxScore: number | null;
  gradedCount: number;
};

type ItemRow = {
  id: string;
  itemKey: string;
  label: string;
  section: string;
  maxScore: number;
  aiScore: number | null;
  aiReasonsJson: string;
  aiEvidenceJson: string;
  aiUncertain: number;
  aiStatus: string;
  manualScore: number | null;
  manualNote: string;
  gradedBy: string;
  gradedAt: string | null;
};

const SUBMISSION_COLUMNS = `s.id, s.source_record_id AS sourceRecordId, s.signup_reference AS signupReference, s.name, s.school, s.contact,
  s.positions, s.competition, s.answers_json AS answersJson, s.attachments_json AS attachmentsJson,
  s.timings_json AS timingsJson, s.integrity_confirmed AS integrityConfirmed, s.hard_score AS hardScore,
  s.hard_score_json AS hardScoreJson, s.flags_json AS flagsJson, s.ai_score AS aiScore,
  s.manual_score AS manualScore, s.status, s.note, s.graded_by AS gradedBy,
  s.submitted_at AS submittedAt, s.created_at AS createdAt, s.updated_at AS updatedAt,
  (SELECT SUM(COALESCE(i.manual_score, i.ai_score)) FROM recruit_written_test_items i WHERE i.submission_id = s.id) AS finalScore,
  (SELECT SUM(i.max_score) FROM recruit_written_test_items i WHERE i.submission_id = s.id AND (i.manual_score IS NOT NULL OR i.ai_score IS NOT NULL)) AS finalMaxScore,
  (SELECT COUNT(*) FROM recruit_written_test_items i WHERE i.submission_id = s.id AND (i.manual_score IS NOT NULL OR i.ai_score IS NOT NULL)) AS gradedCount`;

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toSubmissionView(row: SubmissionRow) {
  return {
    id: row.id,
    sourceRecordId: row.sourceRecordId,
    signupReference: row.signupReference,
    name: row.name,
    school: row.school,
    contact: row.contact,
    positions: parseJson<string[]>(row.positions, []),
    competition: row.competition,
    integrityConfirmed: row.integrityConfirmed === 1,
    hardScore: row.hardScore,
    hardScores: parseJson<Array<{ key: string; score: number; maxScore: number; reason: string }>>(row.hardScoreJson, []),
    flags: parseJson<string[]>(row.flagsJson, []),
    aiScore: row.aiScore,
    manualScore: row.manualScore,
    finalScore: row.finalScore ?? 0,
    finalMaxScore: row.finalMaxScore ?? 0,
    gradedCount: row.gradedCount,
    status: row.status,
    note: row.note,
    gradedBy: row.gradedBy,
    submittedAt: row.submittedAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET(request: Request) {
  try {
    await requireAdminOrAgent();
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();

    if (!id) {
      const rows = await database().prepare(
        `SELECT ${SUBMISSION_COLUMNS} FROM recruit_written_tests s ORDER BY s.submitted_at DESC, s.id DESC LIMIT 300`,
      ).all<SubmissionRow>();
      return Response.json({ submissions: (rows.results ?? []).map(toSubmissionView) });
    }

    const submission = await database().prepare(
      `SELECT ${SUBMISSION_COLUMNS} FROM recruit_written_tests s WHERE s.id = ?`,
    ).bind(id).first<SubmissionRow>();
    if (!submission) return Response.json({ error: "written_test_not_found" }, { status: 404 });

    const itemRows = await database().prepare(
      `SELECT id, item_key AS itemKey, label, section, max_score AS maxScore, ai_score AS aiScore,
              ai_reasons_json AS aiReasonsJson, ai_evidence_json AS aiEvidenceJson,
              ai_uncertain AS aiUncertain, ai_status AS aiStatus, manual_score AS manualScore,
              manual_note AS manualNote, graded_by AS gradedBy, graded_at AS gradedAt
         FROM recruit_written_test_items WHERE submission_id = ?`,
    ).bind(id).all<ItemRow>();

    const answers = parseJson<Record<string, string>>(submission.answersJson, {});
    const attachments = parseJson<Record<string, Array<{ fileToken: string; name: string; size: number | null; text: string }>>>(
      submission.attachmentsJson,
      {},
    );

    const items = (itemRows.results ?? []).map((row) => ({
      key: row.itemKey,
      label: row.label,
      section: row.section,
      maxScore: row.maxScore,
      answer: answers[row.itemKey] ?? "",
      attachments: attachments[row.itemKey] ?? [],
      aiScore: row.aiScore,
      aiReasons: parseJson<string[]>(row.aiReasonsJson, []),
      aiEvidence: parseJson<string[]>(row.aiEvidenceJson, []),
      aiUncertain: row.aiUncertain === 1,
      aiStatus: row.aiStatus,
      manualScore: row.manualScore,
      manualNote: row.manualNote,
      finalScore: row.manualScore ?? row.aiScore,
      gradedBy: row.gradedBy,
      gradedAt: row.gradedAt,
    }));

    return Response.json({
      submission: toSubmissionView(submission),
      items,
      timings: parseJson<Record<string, number | null>>(submission.timingsJson, {}),
      rubric: WRITTEN_TEST_ITEMS.map((item) => ({
        key: item.key,
        label: item.label,
        section: item.section,
        maxScore: item.maxScore,
        kind: item.kind,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const guarded = await guardWrite(request, {
      member: "adminOrAgent",
      sameOrigin: true,
      rate: { bucket: "recruit-written-test-write", limit: 240, windowSeconds: 60 * 60 },
    });
    if (guarded instanceof Response) return guarded;
    const actor = guarded.member;

    const input = await request.json().catch(() => ({})) as Record<string, unknown>;
    const normalized = normalizeWrittenTestManualPatch(input);
    if (!normalized.ok) return Response.json({ error: normalized.error }, { status: 400 });
    const patch = normalized.value;

    const db = database();
    const existing = await db.prepare(`SELECT id FROM recruit_written_tests WHERE id = ?`).bind(patch.id).first<{ id: string }>();
    if (!existing) return Response.json({ error: "written_test_not_found" }, { status: 404 });

    const statements = patch.items.map((item) =>
      db
        .prepare(
          `UPDATE recruit_written_test_items
             SET manual_score = ?, manual_note = ?, graded_by = ?, graded_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
           WHERE submission_id = ? AND item_key = ?`,
        )
        .bind(item.score, item.note, actor.email, patch.id, item.key),
    );
    if (statements.length) await db.batch(statements);

    // 人工总分 = 各题最终分之和(manual ?? ai);没给人工分的题用 AI 建议分。
    const totals = await db
      .prepare(
        `SELECT SUM(COALESCE(manual_score, ai_score)) AS finalScore,
                SUM(CASE WHEN manual_score IS NOT NULL THEN 1 ELSE 0 END) AS manualCount
           FROM recruit_written_test_items WHERE submission_id = ?`,
      )
      .bind(patch.id)
      .first<{ finalScore: number | null; manualCount: number | null }>();

    const status = patch.status || (totals?.manualCount ? "reviewing" : "");
    await db
      .prepare(
        `UPDATE recruit_written_tests
           SET manual_score = ?, status = CASE WHEN ? != '' THEN ? ELSE status END,
               note = CASE WHEN ? != '' THEN ? ELSE note END,
               graded_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        totals?.finalScore ?? null,
        status,
        status,
        patch.note,
        patch.note,
        actor.email,
        patch.id,
      )
      .run();

    await auditAdminAction(
      actor.email,
      "recruit_written_test.grade",
      "recruit_written_test",
      patch.id,
      `${patch.items.length} 题:${patch.items.map((item) => `${item.key}=${item.score ?? "清空"}`).join(",")}`,
    );

    const updated = await db.prepare(`SELECT ${SUBMISSION_COLUMNS} FROM recruit_written_tests s WHERE s.id = ?`).bind(patch.id).first<SubmissionRow>();
    return Response.json({ submission: updated ? toSubmissionView(updated) : null });
  } catch (error) {
    return jsonError(error);
  }
}
