// 见界创赛选拔笔试提交收件:飞书多维表格 → 这里 → 落库进管理台「笔试阅卷」。
//
// 两条通道共用这一个入口:
//   A. 飞书工作流「新增记录」→ POST(文本题实时,秒级到阅卷台)
//   B. 本地脚本 scripts/written-test-sync.mjs → POST(带附件字节抽出的文本)
// 两者都带同一个共享密钥头,Worker secret 是 RECRUIT_WRITTEN_TEST_TOKEN。
//
// 纪律(与 AetherGuard 回执接口同源):
// 1) 先验密钥再解析字段:未授权调用不该拿到任何字段级错误反馈;
// 2) 幂等靠 source_record_id(飞书记录 ID)唯一索引,重复提交/重跑脚本只更新不新增;
// 3) 收件只做「硬判 + 落库」,不在这条链路里跑模型——模型调用慢且花钱,
//    由阅卷台显式点「AI 初评」触发(见 /api/admin/recruit/written-test/score);
// 4) 作答原文原样保存(考生写的每一句话都要能被复核),不回显给客户端。
import { env } from "cloudflare:workers";
import { database, jsonError } from "../../_lib/community";
import { enforceRateLimit, RateLimitError, requestActorKey } from "../../_lib/rate-limit";
import { signupTokenMatches } from "../../_lib/aetherguard-signup";
import { hardScoreWrittenTest, normalizeWrittenTestSubmission, parseWrittenTestBody } from "../../_lib/recruit-written-test";
import { WRITTEN_TEST_ITEMS } from "../../_lib/recruit-written-test-rubric";

export const dynamic = "force-dynamic";

const TOKEN_HEADER = "x-recruit-token";

type ExistingRow = {
  id: string;
  answersJson: string;
  attachmentsJson: string;
};

export async function POST(request: Request) {
  try {
    const secrets = env as unknown as Record<string, string | undefined>;
    if (!(await signupTokenMatches(request.headers.get(TOKEN_HEADER), secrets.RECRUIT_WRITTEN_TEST_TOKEN))) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const raw = await request.text().catch(() => "");
    const parsed = parseWrittenTestBody(raw);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    const normalized = normalizeWrittenTestSubmission(parsed.value);
    if (!normalized.ok) return Response.json({ error: normalized.error }, { status: 400 });

    // 限流按来源 IP:一条提交不该反复刷,把接口当压测入口。
    await enforceRateLimit(await requestActorKey(request, "recruit-written-test"), 60, 60 * 60);

    const value = normalized.value;
    const hard = hardScoreWrittenTest(value);

    const answersJson = JSON.stringify(value.answers);
    const attachmentsJson = JSON.stringify(value.attachments);
    const timingsJson = JSON.stringify(value.timings);
    const positionsJson = JSON.stringify(value.positions);
    const hardScoreJson = JSON.stringify(hard.items);
    const flagsJson = JSON.stringify(hard.flags);

    const db = database();
    const existing = await db
      .prepare(
        `SELECT id, answers_json AS answersJson, attachments_json AS attachmentsJson
         FROM recruit_written_tests WHERE source_record_id = ?`,
      )
      .bind(value.sourceRecordId)
      .first<ExistingRow>();

    const submissionId = existing?.id ?? crypto.randomUUID();
    const changedKeys = changedAnswerKeys(existing, value.answers, value.attachments);

    await db
      .prepare(
        `INSERT INTO recruit_written_tests (
           id, source_record_id, name, school, contact, positions, competition,
           answers_json, attachments_json, timings_json, integrity_confirmed,
           hard_score, hard_score_json, flags_json, status, submitted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_record_id) DO UPDATE SET
           name = excluded.name,
           school = excluded.school,
           contact = excluded.contact,
           positions = excluded.positions,
           competition = excluded.competition,
           answers_json = excluded.answers_json,
           attachments_json = excluded.attachments_json,
           timings_json = excluded.timings_json,
           integrity_confirmed = excluded.integrity_confirmed,
           hard_score = excluded.hard_score,
           hard_score_json = excluded.hard_score_json,
           flags_json = excluded.flags_json,
           submitted_at = excluded.submitted_at,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        submissionId,
        value.sourceRecordId,
        value.name,
        value.school,
        value.contact,
        positionsJson,
        value.competition,
        answersJson,
        attachmentsJson,
        timingsJson,
        value.integrityConfirmed ? 1 : 0,
        hard.score,
        hardScoreJson,
        flagsJson,
        hard.flags.length ? "flagged" : "pending",
        value.submittedAt,
      )
      .run();

    // 逐题行:题面/分值跟着 rubric 走;作答变了的题要把上次的 AI 判分作废,
    // 否则会出现「答案改了、分数还是旧的」这种最难查的错。
    const itemStatements = WRITTEN_TEST_ITEMS.map((item) =>
      db
        .prepare(
          `INSERT INTO recruit_written_test_items (
             id, submission_id, item_key, label, section, max_score, ai_status
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(submission_id, item_key) DO UPDATE SET
             label = excluded.label,
             section = excluded.section,
             max_score = excluded.max_score,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(
          crypto.randomUUID(),
          submissionId,
          item.key,
          item.label,
          item.section,
          item.maxScore,
          item.kind === "manual" ? "manual" : item.kind === "info" ? "manual" : "pending",
        ),
    );
    if (itemStatements.length) await db.batch(itemStatements);

    if (changedKeys.length) {
      await db
        .prepare(
          `UPDATE recruit_written_test_items
             SET ai_score = NULL, ai_reasons_json = '[]', ai_evidence_json = '[]',
                 ai_uncertain = 0, ai_status = 'pending', updated_at = CURRENT_TIMESTAMP
           WHERE submission_id = ? AND item_key IN (${changedKeys.map(() => "?").join(", ")})`,
        )
        .bind(submissionId, ...changedKeys)
        .run();
    }

    return Response.json({
      ok: true,
      id: submissionId,
      hardScore: hard.score,
      hardMaxScore: hard.maxScore,
      flags: hard.flags,
      changed: changedKeys.length,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json({ error: error.code }, { status: error.status });
    }
    return jsonError(error);
  }
}

// 作答或附件文本变了 → 这题的 AI 判分作废,需要重跑。
function changedAnswerKeys(
  existing: ExistingRow | null,
  answers: Record<string, string>,
  attachments: Record<string, unknown>,
): string[] {
  if (!existing) return [];
  let oldAnswers: Record<string, string> = {};
  let oldAttachments: Record<string, unknown> = {};
  try {
    oldAnswers = JSON.parse(existing.answersJson) as Record<string, string>;
  } catch {
    oldAnswers = {};
  }
  try {
    oldAttachments = JSON.parse(existing.attachmentsJson) as Record<string, unknown>;
  } catch {
    oldAttachments = {};
  }
  const changed: string[] = [];
  for (const item of WRITTEN_TEST_ITEMS) {
    const answerChanged = (oldAnswers[item.key] ?? "") !== (answers[item.key] ?? "");
    const attachmentChanged = JSON.stringify(oldAttachments[item.key] ?? null) !== JSON.stringify(attachments[item.key] ?? null);
    if (answerChanged || attachmentChanged) changed.push(item.key);
  }
  return changed;
}
