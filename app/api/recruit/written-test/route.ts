// 见界创赛选拔笔试提交收件:飞书多维表格 → 这里 → 落库进管理台「笔试阅卷」。
//
// 两条通道共用这一个入口:
//   A. 飞书工作流「新增记录」→ POST(文本题实时,秒级到阅卷台)
//   B. 本地脚本 scripts/written-test-sync.mjs → POST(带附件字节抽出的文本)
// 两者都带同一个共享密钥头,Worker secret 是 RECRUIT_WRITTEN_TEST_TOKEN。
//
// 身份关联(报名ID → 报名记录):笔试表单不再收姓名/学校/联系方式,只收报名编号;
// 这里按编号反查 aetherguard_signups(报名工作流发回执时落库的)回填身份。
// 查不到不拒收——先把卷子存下来、落旗标让人工核对,绝不因为编号敲错丢一份卷子。
//
// 纪律(与 AetherGuard 回执接口同源):
// 1) 先验密钥再解析字段:未授权调用不该拿到任何字段级错误反馈;
// 2) 幂等靠 source_record_id(飞书记录 ID)唯一索引,重复提交/重跑脚本只更新不新增;
// 3) 收件只做「硬判 + 落库」,不在这条链路里跑模型——模型调用慢且花钱,
//    由阅卷台显式点「AI 初评」触发(见 /api/admin/recruit/written-test/score);
// 4) 作答原文原样保存(考生写的每一句话都要能被复核),不回显给客户端。
import { env } from "cloudflare:workers";
import { database, jsonError } from "../../_lib/community";
import { sendRecruitMail } from "../../_lib/mail-rotation";
import { enforceRateLimit, RateLimitError, requestActorKey } from "../../_lib/rate-limit";
import { signupTokenMatches } from "../../_lib/aetherguard-signup";
import { formatRecruitDateTime, renderAnswerReceived } from "../../_lib/recruit-email-templates";
import {
  attachmentUploadPlan,
  hardScoreWrittenTest,
  normalizeWrittenTestSubmission,
  parseWrittenTestBody,
  stripTransportFields,
} from "../../_lib/recruit-written-test";
import { WRITTEN_TEST_ITEMS } from "../../_lib/recruit-written-test-rubric";

export const dynamic = "force-dynamic";

const TOKEN_HEADER = "x-recruit-token";
const FROM_NAME = "AetherGuard 项目组";

type ExistingRow = {
  id: string;
  answersJson: string;
  attachmentsJson: string;
};

type SignupMatch = {
  name: string;
  email: string;
  grade: string;
  major: string;
  phone: string;
};

/** 按报名编号反查报名记录:恰好一条才算匹配,0 条/多条都不回填(人工核对)。 */
async function lookupSignupByReference(db: D1Database, reference: string): Promise<SignupMatch | null> {
  const rows = await db
    .prepare(
      `SELECT name, email, grade, major, phone FROM aetherguard_signups
       WHERE reference = ? ORDER BY submitted_at DESC LIMIT 2`,
    )
    .bind(reference)
    .all<SignupMatch>();
  return rows.results?.length === 1 ? (rows.results[0] ?? null) : null;
}

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

    // 图片附件落 R2:同步脚本带来的 base64 只在这一步转成对象,键按记录+fileToken
    // 幂等(重跑同步覆盖同一键);R2 挂了不拒卷,只是这题退回人工评。
    const bucket = (env as unknown as { UPLOADS?: R2Bucket }).UPLOADS;
    let imagesStored = 0;
    if (bucket) {
      for (const plan of attachmentUploadPlan(value.attachments, value.sourceRecordId)) {
        try {
          await bucket.put(plan.r2Key, plan.bytes);
          const files = value.attachments[plan.itemKey];
          const file = files?.[plan.index];
          if (file) {
            file.r2Key = plan.r2Key;
            file.mime = plan.mime;
            imagesStored += 1;
          }
        } catch {
          // 放弃这一张:没有 r2Key,初评自然落回人工。
        }
      }
    }
    const storableAttachments = stripTransportFields(value.attachments);

    // 身份回填:按报名ID反查报名库。匹配不到(敲错/报名还没落库)不拒收,
    // 落旗标让阅卷人核对——卷子永远先保住。
    const db = database();
    const signup = await lookupSignupByReference(db, value.signupRef);
    const name = signup?.name || value.name;
    const school = signup ? `${signup.grade} · ${signup.major}` : value.school;
    const contact = signup?.phone || value.contact;
    const flags = signup ? hard.flags : [...hard.flags, `报名ID ${value.signupRef} 未匹配到报名记录,身份待人工核对`];

    const answersJson = JSON.stringify(value.answers);
    const attachmentsJson = JSON.stringify(storableAttachments);
    const timingsJson = JSON.stringify(value.timings);
    const positionsJson = JSON.stringify(value.positions);
    const hardScoreJson = JSON.stringify(hard.items);
    const flagsJson = JSON.stringify(flags);

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
           id, source_record_id, signup_reference, name, school, contact, positions, competition,
           answers_json, attachments_json, timings_json, integrity_confirmed,
           hard_score, hard_score_json, flags_json, status, submitted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_record_id) DO UPDATE SET
           signup_reference = excluded.signup_reference,
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
           -- status 跟随旗标自愈:旗标清了要从 flagged 回到 pending,否则阅卷台会挂着
           -- 一个没有旗标内容的「异常」角标;但人工推进过的(reviewing/done)不被重置。
           status = CASE
             WHEN recruit_written_tests.status IN ('flagged', 'pending') THEN excluded.status
             ELSE recruit_written_tests.status
           END,
           -- 提交时间以首次入库为准:同步脚本重跑(补附件)不带 submittedAt,
           -- 覆盖会把所有人的交卷时间刷成「同步时刻」,阅卷台排序和用时全乱。
           submitted_at = recruit_written_tests.submitted_at,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        submissionId,
        value.sourceRecordId,
        value.signupRef,
        name,
        school,
        contact,
        positionsJson,
        value.competition,
        answersJson,
        attachmentsJson,
        timingsJson,
        value.integrityConfirmed ? 1 : 0,
        hard.score,
        hardScoreJson,
        flagsJson,
        flags.length ? "flagged" : "pending",
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

    // 收题回执(06 号模板):只在这份卷子第一次入库时发,且必须能对上报名记录
    // (笔试表单没有邮箱字段,地址来自报名库)。重复触发/同步脚本重跑都不重发;
    // 发信失败不拒卷——卷子已经保住,回执可以让人工在阅卷台看到后补。
    let receiptSent = false;
    let receiptMailbox = "";
    if (!existing && signup) {
      const receipt = renderAnswerReceived({
        applyId: value.signupRef,
        candidateName: name,
        candidateEmail: signup.email,
        submitTime: formatRecruitDateTime(value.submittedAt),
      });
      // 走轮换池:品牌发件箱被风控时自动落到通用发件箱;失败不拒卷。
      const delivery = await sendRecruitMail({
        kind: "answer_receipt",
        reference: value.signupRef,
        to: signup.email,
        subject: receipt.subject,
        html: receipt.html,
        fromName: FROM_NAME,
        messageIdPrefix: "aetherguard-wt",
      });
      receiptSent = delivery.sent;
      receiptMailbox = delivery.mailbox;
    }

    return Response.json({
      ok: true,
      id: submissionId,
      hardScore: hard.score,
      hardMaxScore: hard.maxScore,
      flags,
      signupMatched: Boolean(signup),
      receiptSent,
      receiptMailbox,
      imagesStored,
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
