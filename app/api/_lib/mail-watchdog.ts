// 回执补发守护:每 15 分钟由 Worker cron 调一次,把「尝试过但没发成功」的
// 报名回执 / 收题回执补发出去。
//
// 为什么只挑「有失败留痕」的编号:
// - 2026-11-05 轮换上线之前的老数据没有 mail_deliveries 行,分不清是发过还是没发,
//   自动群发会造成重复回执;这类只做人工补发。
// - 有 failed 行说明这封确实没发出去,补发是安全的:只要有 sent 行就跳过。
//
// 节奏:同一编号 20 分钟内只试一次,最多 5 次;每次仍走 mail-rotation 的
// 池轮换与冷却策略,腾讯风控期间会自动落到另一个发件箱,不会死磕一个账号。
import { env } from "cloudflare:workers";
import { database } from "./community.ts";
import { sendRecruitMail } from "./mail-rotation.ts";
import { renderAetherGuardReceipt } from "./aetherguard-signup.ts";
import { formatRecruitDateTime, renderAnswerReceived } from "./recruit-email-templates.ts";

const FROM_NAME = "AetherGuard 项目组";
/** 同一封最多试几次(含首发的失败),超过就停在人工补发。 */
const MAX_ATTEMPTS = 5;
/** 两次补发之间至少隔这么久,避免风控期间把邮箱池的失败计数刷满。 */
const RETRY_GAP_MINUTES = 20;
/** 只补最近三天的,更早的走人工。 */
const LOOKBACK_HOURS = 72;
/** 单次 cron 最多补几封,给 15 分钟的执行窗口留余量。 */
const MAX_PER_RUN = 10;

export type WatchdogSummary = {
  signup: { retried: number; sent: number };
  answer: { retried: number; sent: number };
};

type PendingSignup = {
  reference: string;
  recordId: string;
  name: string;
  email: string;
  grade: string;
  major: string;
  studentId: string;
  phone: string;
  submittedAt: string;
};

type PendingAnswer = {
  reference: string;
  name: string;
  email: string;
  submittedAt: string;
};

export async function retryUnsentRecruitMail(
  db: D1Database = database(),
  secrets: Record<string, string | undefined> = env as unknown as Record<string, string | undefined>,
): Promise<WatchdogSummary> {
  const summary: WatchdogSummary = {
    signup: { retried: 0, sent: 0 },
    answer: { retried: 0, sent: 0 },
  };

  for (const row of await pendingSignups(db)) {
    summary.signup.retried += 1;
    try {
      const receipt = renderAetherGuardReceipt(
        {
          recordId: row.recordId,
          name: row.name,
          email: row.email,
          grade: row.grade,
          major: row.major,
          studentId: row.studentId,
          phone: row.phone,
        },
        { now: submissionTime(row.submittedAt) },
      );
      const delivery = await sendRecruitMail(
        {
          kind: "signup_receipt",
          reference: row.reference,
          to: row.email,
          subject: receipt.subject,
          html: receipt.html,
          fromName: FROM_NAME,
          messageIdPrefix: "aetherguard-retry",
        },
        { db, secrets },
      );
      if (delivery.sent) summary.signup.sent += 1;
    } catch (error) {
      // 单封补发炸了不能拖住后面的;失败留痕由 sendRecruitMail 负责。
      console.error("[recruit-mail-watchdog] signup retry failed", row.reference, error);
    }
  }

  for (const row of await pendingAnswers(db)) {
    summary.answer.retried += 1;
    try {
      const receipt = renderAnswerReceived({
        applyId: row.reference,
        candidateName: row.name,
        candidateEmail: row.email,
        submitTime: formatRecruitDateTime(row.submittedAt),
      });
      const delivery = await sendRecruitMail(
        {
          kind: "answer_receipt",
          reference: row.reference,
          to: row.email,
          subject: receipt.subject,
          html: receipt.html,
          fromName: FROM_NAME,
          messageIdPrefix: "aetherguard-wt-retry",
        },
        { db, secrets },
      );
      if (delivery.sent) summary.answer.sent += 1;
    } catch (error) {
      console.error("[recruit-mail-watchdog] answer retry failed", row.reference, error);
    }
  }

  return summary;
}

async function pendingSignups(db: D1Database): Promise<PendingSignup[]> {
  const rows = await db
    .prepare(
      `SELECT s.reference AS reference, s.record_id AS recordId, s.name AS name, s.email AS email,
              s.grade AS grade, s.major AS major, s.student_id AS studentId, s.phone AS phone,
              s.submitted_at AS submittedAt
         FROM aetherguard_signups s
        WHERE datetime(s.created_at) >= datetime('now', ?)
          AND EXISTS (
            SELECT 1 FROM mail_deliveries m
             WHERE m.reference = s.reference AND m.kind = 'signup_receipt' AND m.status = 'failed'
          )
          AND NOT EXISTS (
            SELECT 1 FROM mail_deliveries ok
             WHERE ok.reference = s.reference AND ok.kind = 'signup_receipt' AND ok.status = 'sent'
          )
          AND (
            SELECT COUNT(*) FROM mail_deliveries m
             WHERE m.reference = s.reference AND m.kind = 'signup_receipt' AND m.status = 'failed'
          ) < ?
          AND (
            SELECT datetime(MAX(m.created_at)) FROM mail_deliveries m
             WHERE m.reference = s.reference AND m.kind = 'signup_receipt' AND m.status = 'failed'
          ) <= datetime('now', ?)
        ORDER BY s.created_at
        LIMIT ?`,
    )
    .bind(`-${LOOKBACK_HOURS} hours`, MAX_ATTEMPTS, `-${RETRY_GAP_MINUTES} minutes`, MAX_PER_RUN)
    .all<PendingSignup>();
  return rows.results ?? [];
}

async function pendingAnswers(db: D1Database): Promise<PendingAnswer[]> {
  const rows = await db
    .prepare(
      `SELECT w.signup_reference AS reference, MAX(w.name) AS name, s.email AS email,
              MIN(w.submitted_at) AS submittedAt
         FROM recruit_written_tests w
         JOIN aetherguard_signups s ON s.reference = w.signup_reference
        WHERE datetime(w.submitted_at) >= datetime('now', ?)
          AND EXISTS (
            SELECT 1 FROM mail_deliveries m
             WHERE m.reference = w.signup_reference AND m.kind = 'answer_receipt' AND m.status = 'failed'
          )
          AND NOT EXISTS (
            SELECT 1 FROM mail_deliveries ok
             WHERE ok.reference = w.signup_reference AND ok.kind = 'answer_receipt' AND ok.status = 'sent'
          )
          AND (
            SELECT COUNT(*) FROM mail_deliveries m
             WHERE m.reference = w.signup_reference AND m.kind = 'answer_receipt' AND m.status = 'failed'
          ) < ?
          AND (
            SELECT datetime(MAX(m.created_at)) FROM mail_deliveries m
             WHERE m.reference = w.signup_reference AND m.kind = 'answer_receipt' AND m.status = 'failed'
          ) <= datetime('now', ?)
        GROUP BY w.signup_reference
        ORDER BY MIN(w.submitted_at)
        LIMIT ?`,
    )
    .bind(`-${LOOKBACK_HOURS} hours`, MAX_ATTEMPTS, `-${RETRY_GAP_MINUTES} minutes`, MAX_PER_RUN)
    .all<PendingAnswer>();
  return rows.results ?? [];
}

/** 库里既有 ISO 也有 `YYYY-MM-DD HH:MM:SS`;解析不了就退回当前时间,别让补发卡死。 */
function submissionTime(value: string): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}