// 造场账户申请的校验纯逻辑(零 import,Node 测试与前端表单共用同一份上限)。
// 存储见 db/schema.ts account_applications;流程见 account-applications.ts。

export const ACCOUNT_APPLICATION_LIMITS = {
  name: 40,
  email: 254,
  introMin: 10,
  introMax: 1000,
  link: 300,
  note: 500,
} as const;

// 邀请码有效天数:与管理台「邀请码」分区同一区间(invitations.ts createInvitation 1..90)。
export const APPLICATION_INVITE_DAYS = { min: 1, max: 90, fallback: 14 } as const;

// 与邮箱验证码登录(email-codes.ts)同一个形状校验:申请邮箱就是日后注册/登录用的邮箱,
// 这里能过、那里不过会让申请人拿着邀请码注册不了。
export const APPLICATION_EMAIL_PATTERN = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/;

export type AccountApplicationInput = { name: string; email: string; intro: string; link: string };

// 去掉控制字符;intro 保留换行(统一成 \n),其余字段压成单行。
const stripControls = (value: string, keepNewlines: boolean) => {
  const unified = value.replace(/\r\n?/g, "\n");
  return keepNewlines ? unified.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "") : unified.replace(/[\u0000-\u001f\u007f]/g, " ");
};

export function normalizeApplicationEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > ACCOUNT_APPLICATION_LIMITS.email) return null;
  return APPLICATION_EMAIL_PATTERN.test(email) ? email : null;
}

export function normalizeApplicationName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = stripControls(value, false).replace(/\s+/g, " ").trim();
  return name && name.length <= ACCOUNT_APPLICATION_LIMITS.name ? name : null;
}

// 链接可空;非空时必须是 http(s) 绝对地址(管理台把它渲染成可点链接,
// javascript:/data: 之类的协议在这里就拦掉,不指望渲染层兜底)。
export function normalizeApplicationLink(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const link = value.trim();
  if (!link) return "";
  if (link.length > ACCOUNT_APPLICATION_LIMITS.link) return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  return link;
}

export function normalizeApplicationInput(
  input: unknown,
): { ok: true; value: AccountApplicationInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "invalid_request" };
  const raw = input as Record<string, unknown>;
  const name = normalizeApplicationName(raw.name);
  if (!name) return { ok: false, error: "invalid_name" };
  const email = normalizeApplicationEmail(raw.email);
  if (!email) return { ok: false, error: "invalid_email" };
  const intro = typeof raw.intro === "string" ? stripControls(raw.intro, true).trim() : "";
  if (intro.length < ACCOUNT_APPLICATION_LIMITS.introMin || intro.length > ACCOUNT_APPLICATION_LIMITS.introMax) {
    return { ok: false, error: "invalid_intro" };
  }
  const link = normalizeApplicationLink(raw.link);
  if (link === null) return { ok: false, error: "invalid_link" };
  return { ok: true, value: { name, email, intro, link } };
}

// 有效天数:缺省 14;给了就必须是区间内整数(不静默夹逼——越界直接 400)。
export function normalizeInviteDays(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return APPLICATION_INVITE_DAYS.fallback;
  const days = Number(value);
  if (!Number.isInteger(days) || days < APPLICATION_INVITE_DAYS.min || days > APPLICATION_INVITE_DAYS.max) return null;
  return days;
}

export function normalizeDecisionNote(value: unknown): string {
  return typeof value === "string" ? stripControls(value, false).trim().slice(0, ACCOUNT_APPLICATION_LIMITS.note) : "";
}
