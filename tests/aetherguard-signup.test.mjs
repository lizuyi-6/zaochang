// AetherGuard 报名回执 · 纯逻辑契约(无 Wrangler):字段校验、中英文字段名兼容、
// 回执不泄露学号/手机号、HTML 转义、共享密钥比对。真实发信走 sendEmail,
// 端到端(飞书自动化 → 回执)在部署后用真实提交验证。
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeAetherGuardSignup,
  renderAetherGuardReceipt,
  signupReference,
  signupTokenMatches,
} from "../app/api/_lib/aetherguard-signup.ts";

const VALID = {
  recordId: "recvAbCdEf12345678",
  name: "张三",
  email: "ZhangSan@Example.com",
  grade: "大二",
  major: "计算机科学与技术",
  studentId: "2024123456",
  phone: "13800001234",
};

test("接受驼峰字段名并规整邮箱大小写", () => {
  const parsed = normalizeAetherGuardSignup(VALID);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.email, "zhangsan@example.com");
  assert.equal(parsed.value.name, "张三");
});

test("接受中文字段名(飞书列名直接映射)", () => {
  const parsed = normalizeAetherGuardSignup({
    记录ID: "recvAbCdEf12345678",
    姓名: "李四",
    邮箱: "lisi@example.com",
    年级: "研一",
    专业: "网络空间安全",
    学号: "2024999999",
    手机号: "+86 138-0000-1234",
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.grade, "研一");
  assert.equal(parsed.value.phone, "+86 138-0000-1234");
});

test("缺字段与非法值返回稳定错误码", () => {
  assert.deepEqual(normalizeAetherGuardSignup({}), { ok: false, error: "invalid_name" });
  assert.deepEqual(normalizeAetherGuardSignup({ ...VALID, email: "not-an-email" }), { ok: false, error: "invalid_email" });
  assert.deepEqual(normalizeAetherGuardSignup({ ...VALID, phone: "abc" }), { ok: false, error: "invalid_phone" });
  assert.deepEqual(normalizeAetherGuardSignup({ ...VALID, studentId: "" }), { ok: false, error: "invalid_student_id" });
  assert.deepEqual(normalizeAetherGuardSignup({ ...VALID, grade: "" }), { ok: false, error: "invalid_grade" });
  assert.deepEqual(normalizeAetherGuardSignup({ ...VALID, major: "" }), { ok: false, error: "invalid_major" });
  assert.deepEqual(normalizeAetherGuardSignup(null), { ok: false, error: "invalid_body" });
});

test("超长字段被拒绝", () => {
  assert.deepEqual(
    normalizeAetherGuardSignup({ ...VALID, name: "名".repeat(41) }),
    { ok: false, error: "invalid_name" },
  );
  assert.deepEqual(
    normalizeAetherGuardSignup({ ...VALID, studentId: "1".repeat(33) }),
    { ok: false, error: "invalid_student_id" },
  );
});

test("报名编号取记录键尾部 8 位", () => {
  assert.equal(signupReference("recvAbCdEf12345678"), "12345678");
  assert.equal(signupReference(""), "--------");
});

test("回执不含学号与手机号", () => {
  const parsed = normalizeAetherGuardSignup(VALID);
  assert.equal(parsed.ok, true);
  const receipt = renderAetherGuardReceipt(parsed.value);
  const body = `${receipt.subject}\n${receipt.text}\n${receipt.html}`;
  assert.equal(body.includes(VALID.studentId), false);
  assert.equal(body.includes(VALID.phone), false);
  assert.equal(body.includes("12345678"), true);
  assert.equal(body.includes("zhangsan@example.com"), true);
});

test("回执走 01 号模板:text 版有纯链接与编号,html 版有按钮、编号与兜底链接", () => {
  const parsed = normalizeAetherGuardSignup(VALID);
  assert.equal(parsed.ok, true);
  const receipt = renderAetherGuardReceipt(parsed.value, { now: new Date("2026-11-05T04:32:00Z") });
  const url = "https://tcnii2lehoms.feishu.cn/share/base/shrcnts2MqEefdrHLbqMkLmGGNg";
  // 主题走模板口径,报名编号贯穿主题外的凭证与笔试引导
  assert.ok(receipt.subject.includes("已收到你的报名"), "主题要是模板的报名确认口径");
  // text 版:链接必须原样出现(候选人在纯文本客户端也能拿到),编号跟在笔试引导里
  assert.ok(receipt.text.includes(url), "text 版必须含笔试链接原文");
  assert.ok(receipt.text.includes("报名编号 12345678"), "text 版要给出报名编号");
  assert.ok(receipt.text.includes("2026-11-05"), "text 版要给出提交时间(北京时间)");
  // html 版:按钮链接到笔试表单,旁边给报名编号,另有兜底链接
  assert.ok(receipt.html.includes(`href="${url}"`), "html 版按钮必须链到笔试表单");
  assert.ok(receipt.html.includes("进入笔试"), "html 版要有按钮文案");
  assert.ok(receipt.html.includes(">12345678</span>"), "html 版要在按钮旁给出报名编号");
  // 笔试入口放在凭证之后、隐私承诺之前(先给下一步,再给留存说明)
  assert.ok(
    receipt.html.indexOf('href="' + url + '"') < receipt.html.indexOf("个人信息只用于本次招聘"),
    "笔试按钮要出现在隐私承诺段落之前",
  );
  // 模板进度轨道在,说明走的是模板而不是旧手写版式
  assert.ok(receipt.html.includes("报名·审阅中") || receipt.html.includes("审阅中"), "html 版要有模板进度轨道");
});

test("HTML 转义报名者可控文本", () => {
  const parsed = normalizeAetherGuardSignup({ ...VALID, name: '<img src=x onerror="alert(1)">' });
  assert.equal(parsed.ok, true);
  const receipt = renderAetherGuardReceipt(parsed.value);
  assert.equal(receipt.html.includes("<img src=x"), false);
  assert.equal(receipt.html.includes("&lt;img"), true);
});

test("收题回执(06 号模板):只含评阅信息,不含岗位/学号/手机号", async () => {
  const { renderAnswerReceived } = await import("../app/api/_lib/recruit-email-templates.ts");
  const receipt = renderAnswerReceived({
    applyId: "12345678",
    candidateName: "张三",
    candidateEmail: "zhangsan@example.com",
    submitTime: "2026-11-05 12:07",
  });
  assert.ok(receipt.subject.includes("已收到你的笔试答卷"), "主题要是收题口径");
  assert.ok(receipt.html.includes("12345678"), "凭证里要有报名编号");
  assert.ok(receipt.html.includes("2026-11-05 12:07"), "要给出提交时间");
  const body = `${receipt.subject}\n${receipt.text}\n${receipt.html}`;
  assert.equal(body.includes("商业计划书"), false, "报名/收题邮件不出现岗位");
  assert.equal(body.includes("2024123456"), false, "回执不含学号");
  assert.equal(body.includes("13800001234"), false, "回执不含手机号");
});

test("共享密钥比对:空值一律不通过", async () => {
  assert.equal(await signupTokenMatches("same-token", "same-token"), true);
  assert.equal(await signupTokenMatches("wrong", "same-token"), false);
  assert.equal(await signupTokenMatches(null, "same-token"), false);
  assert.equal(await signupTokenMatches("same-token", undefined), false);
  assert.equal(await signupTokenMatches("same-token", ""), false);
});