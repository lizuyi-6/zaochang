// 发信执行层:按池轮换发信 + 每次尝试写 mail_deliveries。
//
// 背景(2026-11-05 事故):腾讯企业邮把 AetherGuard 发件箱以 535「system busy」
// 临时风控,报名回执从王娜起连续 13 封全部发不出去,而接口仍按既有逻辑返回 502,
// 没有补发、没有告警、也没有任何一行记录——谁都发现不了。
//
// 划分:池/归类/排序等纯策略在 mail-rotation-policy.ts(可单测);这里只做
// 「取冷却状态 → 逐个尝试 → 留痕」,以及保证留痕失败不影响发信结果。
import { env } from "cloudflare:workers";
import { database } from "./community.ts";
import { sendSmtpMail } from "./mail-send.ts";
import {
  classifySmtpFailure,
  isBlockingErrorCode,
  mailboxPool,
  orderMailboxes,
  shouldTryNextMailbox,
  MAILBOX_COOLDOWN_MS,
  type SmtpFailure,
} from "./mail-rotation-policy.ts";

export type MailAttempt = { mailbox: string; ok: boolean; code: string };

export type SendResult = {
  sent: boolean;
  /** 最终使用的发件箱 id;一封都没尝试时为空串。 */
  mailbox: string;
  attempts: MailAttempt[];
  /** 没发出去时的失败分类,便于调用方决定响应措辞。 */
  failure?: SmtpFailure;
};

export type RecruitMailKind = "signup_receipt" | "answer_receipt";

/**
 * 按池轮换发一封招募邮件,并把每次尝试写进 mail_deliveries。
 * 只有 auth_blocked / rate_limited 才会换下一个发件箱;
 * 收件人被拒(55x)等其它失败直接返回,不浪费别的发件箱配额。
 */
export async function sendRecruitMail(input: {
  kind: RecruitMailKind;
  reference: string;
  to: string;
  subject: string;
  html: string;
  fromName: string;
  messageIdPrefix: string;
}): Promise<SendResult> {
  const secrets = env as unknown as Record<string, string | undefined>;
  const pool = mailboxPool(secrets);
  if (!pool.length) {
    return { sent: false, mailbox: "", attempts: [], failure: { kind: "transient", code: "mail_not_configured" } };
  }

  const db = database();
  const cooling = await recentCoolingMailboxes(db);
  const attempts: MailAttempt[] = [];

  for (const mailbox of orderMailboxes(pool, cooling)) {
    try {
      await sendSmtpMail(
        { host: mailbox.host, port: 465, user: mailbox.user, pass: mailbox.pass },
        {
          to: input.to,
          subject: input.subject,
          html: input.html,
          fromName: input.fromName || mailbox.label,
          messageId: `${input.messageIdPrefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        },
      );
      attempts.push({ mailbox: mailbox.id, ok: true, code: "" });
      await recordDelivery(db, input, mailbox.id, "sent", "");
      return { sent: true, mailbox: mailbox.id, attempts };
    } catch (error) {
      const failure = classifySmtpFailure(error);
      attempts.push({ mailbox: mailbox.id, ok: false, code: failure.code });
      await recordDelivery(db, input, mailbox.id, "failed", failure.code);
      if (!shouldTryNextMailbox(failure)) {
        return { sent: false, mailbox: mailbox.id, attempts, failure };
      }
    }
  }

  const last = attempts[attempts.length - 1];
  return {
    sent: false,
    mailbox: last?.mailbox ?? "",
    attempts,
    failure: last ? { kind: "auth_blocked", code: last.code } : undefined,
  };
}

/** 最近被风控过的发件箱 id 集合(冷却期内跳过)。 */
async function recentCoolingMailboxes(db: D1Database): Promise<Set<string>> {
  const cooling = new Set<string>();
  try {
    const since = new Date(Date.now() - MAILBOX_COOLDOWN_MS).toISOString();
    const rows = await db
      .prepare(
        `SELECT mailbox, error_code AS errorCode FROM mail_deliveries
         WHERE status = 'failed' AND created_at >= ?`,
      )
      .bind(since)
      .all<{ mailbox: string; errorCode: string }>();
    for (const row of rows.results ?? []) {
      if (isBlockingErrorCode(row.errorCode)) cooling.add(row.mailbox);
    }
  } catch {
    // 读不到冷却状态就按「都不冷却」处理:多发一次比一封不发好。
  }
  return cooling;
}

async function recordDelivery(
  db: D1Database,
  input: { kind: RecruitMailKind; reference: string; to: string },
  mailbox: string,
  status: "sent" | "failed",
  errorCode: string,
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO mail_deliveries (id, kind, reference, to_email, mailbox, status, error_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.kind,
        input.reference,
        input.to,
        mailbox,
        status,
        errorCode.slice(0, 120),
        new Date().toISOString(),
      )
      .run();
  } catch {
    // 留痕失败不能影响发信结果;补发核对可以退化到按 aetherguard_signups 对账。
  }
}