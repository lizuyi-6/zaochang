// AetherGuard 报名确认回执:纯逻辑(校验 / 渲染 / 密钥比对),不碰 D1 与网络。
// 入口见 app/api/forms/aetherguard-signup/route.ts;飞书多维表格自动化在
// 「新增记录」时带共享密钥 POST 过来,本模块只负责把记录整理成一封回执。
//
// 纪律:
// 1) 回执不包含学号和手机号——邮件会长期留在收件箱与转发链里,报名表里已有一份;
// 2) 报名编号用记录 ID 的后 8 位,能在后台对上人,又不至于把整条记录键暴露给转发者;
// 3) 密钥比对走 SHA-256 后再逐字节比较,避免按前缀时序猜密钥。
// 4) 回执版式走 recruit-email-templates 的 01 号模板(Networksafe 模板库移植),
//    这里只负责把报名记录填进变量,不再手写 HTML。
import { formatRecruitDateTime, renderApplicationReceived } from "./recruit-email-templates.ts";

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

// 笔试入口链接的唯一事实源在 recruit-email-templates(报名回执按钮与兜底链接共用),
// 这里按旧名字转出口,历史引用与测试不用跟着改。
export { TEST_ENTRY_URL as AETHERGUARD_WRITTEN_TEST_URL } from "./recruit-email-templates.ts";

/** 渲染报名确认回执(01 号模板):岗位用默认占位,提交时间按北京时间展示。 */
export function renderAetherGuardReceipt(
  value: AetherGuardSignup,
  opts?: { now?: Date },
): { subject: string; text: string; html: string } {
  const reference = signupReference(value.recordId);
  return renderApplicationReceived({
    applyId: reference,
    candidateName: value.name,
    candidateEmail: value.email,
    applyDate: formatRecruitDateTime((opts?.now ?? new Date()).toISOString()),
  });
}