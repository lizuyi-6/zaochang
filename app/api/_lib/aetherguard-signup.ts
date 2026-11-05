// AetherGuard 报名确认回执:纯逻辑(校验 / 渲染 / 密钥比对),不碰 D1 与网络。
// 入口见 app/api/forms/aetherguard-signup/route.ts;飞书多维表格自动化在
// 「新增记录」时带共享密钥 POST 过来,本模块只负责把记录整理成一封回执。
//
// 纪律:
// 1) 回执不包含学号和手机号——邮件会长期留在收件箱与转发链里,报名表里已有一份;
// 2) 报名编号用记录 ID 的后 8 位,能在后台对上人,又不至于把整条记录键暴露给转发者;
// 3) 密钥比对走 SHA-256 后再逐字节比较,避免按前缀时序猜密钥。

export const AETHERGUARD_SIGNUP_LIMITS = {
  recordId: 64,
  name: 40,
  email: 120,
  grade: 20,
  major: 60,
  studentId: 32,
  phone: 20,
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-() ]{6,20}$/;

export type AetherGuardSignup = {
  recordId: string;
  name: string;
  email: string;
  grade: string;
  major: string;
  studentId: string;
  phone: string;
};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

// 飞书 HTTP 请求节点的字段名由我们自己拼,这里同时接受驼峰与中文字段名,
// 避免以后在飞书后台改名时整条链路静默失效(改错字段=400,不是"发出去了"）。
function pick(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = text(raw[key]);
    if (value) return value;
  }
  return "";
}

export function normalizeAetherGuardSignup(
  input: unknown,
): { ok: true; value: AetherGuardSignup } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "invalid_body" };
  const raw = input as Record<string, unknown>;

  const recordId = pick(raw, "recordId", "record_id", "记录ID");
  const name = pick(raw, "name", "姓名");
  const email = pick(raw, "email", "邮箱").toLowerCase();
  const grade = pick(raw, "grade", "年级");
  const major = pick(raw, "major", "专业");
  const studentId = pick(raw, "studentId", "student_id", "学号");
  const phone = pick(raw, "phone", "手机号");

  if (recordId.length > AETHERGUARD_SIGNUP_LIMITS.recordId) return { ok: false, error: "invalid_record_id" };
  if (!name || name.length > AETHERGUARD_SIGNUP_LIMITS.name) return { ok: false, error: "invalid_name" };
  if (!EMAIL_PATTERN.test(email) || email.length > AETHERGUARD_SIGNUP_LIMITS.email) {
    return { ok: false, error: "invalid_email" };
  }
  if (!grade || grade.length > AETHERGUARD_SIGNUP_LIMITS.grade) return { ok: false, error: "invalid_grade" };
  if (!major || major.length > AETHERGUARD_SIGNUP_LIMITS.major) return { ok: false, error: "invalid_major" };
  if (!studentId || studentId.length > AETHERGUARD_SIGNUP_LIMITS.studentId) {
    return { ok: false, error: "invalid_student_id" };
  }
  if (!PHONE_PATTERN.test(phone)) return { ok: false, error: "invalid_phone" };

  return { ok: true, value: { recordId, name, email, grade, major, studentId, phone } };
}

// 共享密钥比对:先各自 SHA-256,再逐字节异或累加,长度与时序都不泄露前缀。
export async function signupTokenMatches(provided: string | null, expected: string | undefined): Promise<boolean> {
  if (!provided || !expected) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

export function signupReference(recordId: string): string {
  // 取记录键的尾部作为对外编号;不足 8 位时原样返回,空键回 "--------"。
  const compact = recordId.replace(/[^0-9a-zA-Z]/g, "");
  return compact ? compact.slice(-8).toUpperCase() : "--------";
}

/**
 * 考生在笔试表单里手敲的报名编号收拾成可比对形态:去分隔符/空白 + 大写。
 * 不在这里截断长度——超长是输入错误,必须让调用方按上限拒收,不能悄悄截短成另一个编号。
 */
export function normalizeSignupReferenceInput(value: string): string {
  return value.replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 笔试入口:飞书公开表单(报名回执里引导候选人完成的下一环节)。链接不是密钥,可以明写。 */
export const AETHERGUARD_WRITTEN_TEST_URL =
  "https://tcnii2lehoms.feishu.cn/share/base/shrcnts2MqEefdrHLbqMkLmGGNg";

export function renderAetherGuardReceipt(value: AetherGuardSignup): { subject: string; text: string; html: string } {
  const reference = signupReference(value.recordId);
  const subject = `AetherGuard 报名已收到 · ${reference}`;
  const text = [
    `${value.name} 你好：`,
    "",
    "我们已收到你在 AetherGuard 项目的报名。",
    "",
    `报名编号：${reference}`,
    `姓名：${value.name}`,
    `邮箱：${value.email}`,
    `年级专业：${value.grade} · ${value.major}`,
    "",
    "下一步:请完成笔试。",
    `笔试入口(复制到浏览器打开):${AETHERGUARD_WRITTEN_TEST_URL}`,
    "笔试里有需要上传文件的题目,建议在电脑上完成;提交后答案会直接进入我们的阅卷流程。",
    `进入笔试时,在第一题填写你的报名编号:${reference}(笔试不再重复收集姓名、学校、联系方式)。`,
    "",
    "审核结果会通过本邮箱联系你，请留意收件与垃圾邮件箱。",
    "本邮件由系统自动发送，请勿直接回复。",
    "",
    "AetherGuard 项目组",
  ].join("\n");

  const rows: Array<[string, string]> = [
    ["报名编号", reference],
    ["姓名", value.name],
    ["邮箱", value.email],
    ["年级专业", `${value.grade} · ${value.major}`],
  ];
  const cells = rows
    .map(
      ([label, content]) =>
        `<tr><td style="padding:8px 16px 8px 0;color:#6b7280;font-size:14px;white-space:nowrap">${escapeHtml(label)}</td>` +
        `<td style="padding:8px 0;color:#111827;font-size:14px">${escapeHtml(content)}</td></tr>`,
    )
    .join("");

  // 笔试按钮:邮件客户端经常禁用 <button>,用表格包 <a> 是兼容性最好的按钮写法;
  // 下面再放一条纯文本链接兜底(按钮被拦时候选人仍能点到)。笔试表单只填报名编号,
  // 不再重复收个人信息,所以编号必须跟着按钮一起出现。
  const writtenTestButton = [
    '<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.7">下一步:请完成笔试。笔试里有需要上传文件的题目,建议在电脑上完成。</p>',
    '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 12px"><tr><td style="background:#0f766e;border-radius:8px">',
    `<a href="${AETHERGUARD_WRITTEN_TEST_URL}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px">进入笔试</a>`,
    "</td></tr></table>",
    `<p style="margin:0 0 8px;color:#111827;font-size:15px;line-height:1.7">进入笔试时,在第一题填写你的<b>报名编号:${escapeHtml(reference)}</b>(笔试不再重复收集姓名、学校、联系方式)。</p>`,
    `<p style="margin:0 0 20px;color:#9ca3af;font-size:13px;line-height:1.7">按钮无法点击时，复制链接到浏览器打开：<br />${escapeHtml(AETHERGUARD_WRITTEN_TEST_URL)}</p>`,
  ].join("");

  const html = [
    '<div style="margin:0;padding:32px 16px;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'Microsoft YaHei\',sans-serif">',
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb">',
    '<p style="margin:0 0 8px;color:#0f766e;font-size:13px;letter-spacing:.12em;text-transform:uppercase">AetherGuard</p>',
    `<h1 style="margin:0 0 16px;color:#111827;font-size:22px;line-height:1.4">报名已收到</h1>`,
    `<p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7">${escapeHtml(value.name)} 你好，我们已收到你在 AetherGuard 项目的报名，下面是提交的信息摘要。</p>`,
    `<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 20px">${cells}</table>`,
    writtenTestButton,
    '<p style="margin:0 0 8px;color:#374151;font-size:15px;line-height:1.7">审核结果会通过本邮箱联系你，请留意收件与垃圾邮件箱。</p>',
    '<p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.7">本邮件由系统自动发送，请勿直接回复。</p>',
    "</div>",
    '<p style="max-width:560px;margin:16px auto 0;text-align:center;color:#9ca3af;font-size:12px">AetherGuard 项目组</p>',
    "</div>",
  ].join("");

  return { subject, text, html };
}