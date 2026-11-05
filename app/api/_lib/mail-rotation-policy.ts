// 发信轮换的纯策略:邮箱池、失败归类、冷却排序。不碰 D1 与网络,可直接跑单测。
// 执行与留痕见 mail-rotation.ts。

export type MailboxProfile = {
  /** 池内标识:留痕与冷却都按它记。 */
  id: string;
  /** 发件人显示名,可直接进邮件头。 */
  label: string;
  host: string;
  user: string;
  pass: string;
};

type Secrets = Record<string, string | undefined>;

/**
 * 邮箱池:品牌发件箱排在前面,通用发件箱兜底。
 * 按 user 去重——两组 secret 指向同一个邮箱时不该重复尝试。
 */
export function mailboxPool(secrets: Secrets): MailboxProfile[] {
  const candidates: MailboxProfile[] = [
    {
      id: "aetherguard",
      label: "AetherGuard 项目组",
      host: secrets.AETHERGUARD_MAIL_HOST ?? secrets.MAIL_HOST_SMTP ?? "",
      user: secrets.AETHERGUARD_MAIL_USER ?? "",
      pass: secrets.AETHERGUARD_MAIL_PASS ?? "",
    },
    {
      id: "zaochang",
      label: "AetherGuard 项目组",
      host: secrets.MAIL_HOST_SMTP ?? "",
      user: secrets.MAIL_USER ?? "",
      pass: secrets.MAIL_PASS ?? "",
    },
  ];
  const seen = new Set<string>();
  const pool: MailboxProfile[] = [];
  for (const mailbox of candidates) {
    if (!mailbox.host || !mailbox.user || !mailbox.pass) continue;
    const key = mailbox.user.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(mailbox);
  }
  return pool;
}

export type SmtpFailureKind = "auth_blocked" | "rate_limited" | "recipient_rejected" | "transient";

export type SmtpFailure = { kind: SmtpFailureKind; code: string };

const BLOCKED_CODES = new Set(["534", "535", "537"]);
const RATE_CODES = new Set(["421", "450", "451", "452"]);
const RECIPIENT_CODES = new Set(["550", "551", "552", "553"]);

/**
 * 给一次发信失败归类。mail-send.ts 的报错形如
 * `smtp_auth_pass_535: 535 Error: authentication failed, system busy`。
 * 归类决定「换发件箱重试」还是「直接判失败」。
 */
export function classifySmtpFailure(error: unknown): SmtpFailure {
  const message = String(error instanceof Error ? error.message : error ?? "");
  const matched = /smtp_[a-z_]+_(\d{3})/.exec(message);
  const status = matched ? matched[1] : "";
  const code = matched ? matched[0].replace(/:\s*$/, "") : message.slice(0, 40);

  if (BLOCKED_CODES.has(status) || /system busy|authentication failed|auth.*fail/i.test(message)) {
    return { kind: "auth_blocked", code: code || "auth_blocked" };
  }
  if (RATE_CODES.has(status) || /too many|rate ?limit|slow down|try again later/i.test(message)) {
    return { kind: "rate_limited", code: code || "rate_limited" };
  }
  if (RECIPIENT_CODES.has(status) && /rcpt|mail from/i.test(message)) {
    return { kind: "recipient_rejected", code: code || "recipient_rejected" };
  }
  return { kind: "transient", code: code || "transient" };
}

/** 该失败是否值得换下一个发件箱再试一次。 */
export function shouldTryNextMailbox(failure: SmtpFailure): boolean {
  return failure.kind === "auth_blocked" || failure.kind === "rate_limited";
}

/** 留痕里记的 error_code 是否代表「这个发件箱当前被风控」。 */
export function isBlockingErrorCode(code: string): boolean {
  const matched = /_(\d{3})$/.exec(code);
  if (matched) return BLOCKED_CODES.has(matched[1]) || RATE_CODES.has(matched[1]);
  return /auth_blocked|rate_limited/.test(code);
}

/** 冷却期:被风控的发件箱在这段时间内直接跳过。 */
export const MAILBOX_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * 在候选池里排出发送顺序:未冷却的按原顺序在前,冷却中的兜底排后
 * (全池都冷却时仍然尝试,总比一封都不发好)。
 */
export function orderMailboxes(pool: MailboxProfile[], cooling: Set<string>): MailboxProfile[] {
  const ready = pool.filter((mailbox) => !cooling.has(mailbox.id));
  const cold = pool.filter((mailbox) => cooling.has(mailbox.id));
  return [...ready, ...cold];
}
