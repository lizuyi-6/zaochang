// 邮件模板目录/渲染逻辑契约:渲染语义必须与发送器 tmp/mail/send.mjs 保持一致——
// 管理台预览到的 HTML 就是收件人收到的 HTML。用 public/mail-templates/ 真实模板断言,
// 改模板(锚点/状态块/标题)会在这里当场炸出来。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  extractMailTemplatePlaceholders,
  MAIL_SIGNATURE_ANCHOR,
  MAIL_TEMPLATE_BRAND,
  MAIL_TEMPLATE_CATALOG,
  mailTemplateMeta,
  missingMailTemplatePlaceholders,
  renderMailTemplate,
} from "../app/api/_lib/mail-templates.ts";
import { RECRUIT_STAGES } from "../app/api/_lib/recruit-candidates.ts";

const readTemplate = (id) => readFileSync(new URL(`../public/mail-templates/${id}.html`, import.meta.url), "utf8");

test("catalog 覆盖 E0–E8,每个文件存在且 <title> 与 catalog.subject 一致", () => {
  const files = readdirSync(new URL("../public/mail-templates/", import.meta.url)).filter((name) => /^E\d+\.html$/.test(name)).sort();
  assert.deepEqual(files, MAIL_TEMPLATE_CATALOG.map((meta) => `${meta.id}.html`).sort());
  for (const meta of MAIL_TEMPLATE_CATALOG) {
    const html = readTemplate(meta.id);
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
    assert.equal(title, meta.subject, `${meta.id} 标题与 catalog 不一致`);
    assert.ok(title.includes(MAIL_TEMPLATE_BRAND), "主题必须含品牌前缀");
    assert.equal(html.includes("<!--STATUS-BLOCK-START-->"), meta.hasStatusBlock, `${meta.id} 状态块标记与 catalog 不一致`);
    // 附件按钮锚点:每个模板恰好一次(send.mjs 注入前置校验同款)。
    assert.equal(html.split(MAIL_SIGNATURE_ANCHOR).length - 1, 1, `${meta.id} 签名锚点必须恰好一次`);
  }
});

test("catalog.nextStage 全部落在候选人环节白名单内", () => {
  for (const meta of MAIL_TEMPLATE_CATALOG) {
    assert.ok(RECRUIT_STAGES.includes(meta.nextStage), `${meta.id} nextStage=${meta.nextStage}`);
  }
  assert.equal(mailTemplateMeta("E8")?.hasStatusBlock, true);
  assert.equal(mailTemplateMeta("E9"), null);
});

test("占位符抽取:【】按出现顺序去重;品牌文字不是占位符;{{}} 不算", () => {
  const keys = extractMailTemplatePlaceholders(readTemplate("E1"));
  assert.deepEqual(keys, ["姓名", "岗位", "反馈", "群面时间", "群面地点或会议链接", "岗位段落：群面关注点", "确认截止日期", "发件人姓名", "手机/微信", "发件邮箱", "公司全称"]);
  assert.ok(!keys.includes(MAIL_TEMPLATE_BRAND));
  const e8 = readTemplate("E8");
  assert.ok(e8.includes("{{statusImg}}") && e8.includes("{{statusUrl}}"), "E8 状态块占位必须存在");
  assert.ok(!extractMailTemplatePlaceholders(e8).some((key) => key.includes("status")), "{{status*}} 不得被当成【】占位符");
});

test("missing:未填的列出、填了的不列、品牌永不列", () => {
  const html = readTemplate("E0");
  const all = extractMailTemplatePlaceholders(html);
  assert.deepEqual(missingMailTemplatePlaceholders(html, {}), all);
  const values = Object.fromEntries(all.map((key) => [key, "x"]));
  assert.deepEqual(missingMailTemplatePlaceholders(html, values), []);
});

test("渲染:占位符替换、主题来自 <title>、后缀/覆盖生效", () => {
  const html = readTemplate("E0");
  const values = Object.fromEntries(extractMailTemplatePlaceholders(html).map((key) => [key, `值-${key}`]));
  const result = renderMailTemplate(html, { values });
  assert.equal(result.missing.length, 0);
  assert.ok(result.html.includes("值-姓名"));
  assert.ok(result.html.includes(`【${MAIL_TEMPLATE_BRAND}】`), "品牌文字必须原样保留");
  assert.equal(result.subject, "【见界创赛选拔】作业已收到");
  assert.equal(renderMailTemplate(html, { values, subjectSuffix: "(试发)" }).subject, "【见界创赛选拔】作业已收到(试发)");
  assert.equal(renderMailTemplate(html, { values, subjectOverride: "自定义" }).subject, "自定义");
});

test("渲染:未填占位符原样留在预览里并列入 missing(与 send.mjs 拦发口径一致)", () => {
  const html = readTemplate("E0");
  const result = renderMailTemplate(html, { values: { 姓名: "张三" } });
  assert.ok(result.html.includes("【岗位】"), "未填占位符应在预览中原样可见");
  assert.ok(result.missing.includes("岗位") && !result.missing.includes("姓名"));
});

test("附件按钮:注入到签名区上方;非 aetherstudio 域当场拒绝", () => {
  const html = readTemplate("E6");
  const values = Object.fromEntries(extractMailTemplatePlaceholders(html).map((key) => [key, "x"]));
  const url = "https://aetherstudio.top/api/uploads/abc.pdf";
  const result = renderMailTemplate(html, { values, attach: { url } });
  const buttonAt = result.html.indexOf(url);
  const anchorAt = result.html.indexOf(MAIL_SIGNATURE_ANCHOR);
  assert.ok(buttonAt > 0 && buttonAt < anchorAt, "按钮必须在签名锚点之前");
  assert.ok(result.html.includes("下载回执 PDF"), "默认按钮文字");
  assert.throws(() => renderMailTemplate(html, { values, attach: { url: "https://evil.example/x.pdf" } }), /attach_url_not_aetherstudio/);
  assert.throws(() => renderMailTemplate(html, { values, attach: { url: "http://aetherstudio.top/x.pdf" } }), /attach_url_not_aetherstudio/);
});

test("E8 状态块:带 token 换真实链接、不带整块摘除、坏 token 拒发", () => {
  const html = readTemplate("E8");
  const values = Object.fromEntries(extractMailTemplatePlaceholders(html).map((key) => [key, "x"]));
  const token = "a".repeat(32);
  const withToken = renderMailTemplate(html, { values, statusToken: token });
  assert.ok(withToken.html.includes(`/email/status/${token}.png`), "进度图 URL");
  assert.ok(withToken.html.includes(`/email/status/${token}`), "进度页 URL");
  assert.ok(!withToken.html.includes("{{status"), "不得残留 {{status*}}");
  assert.ok(!withToken.html.includes("STATUS-BLOCK"), "标记注释不得进正文");
  const stripped = renderMailTemplate(html, { values, statusToken: null });
  assert.ok(!stripped.html.includes("STATUS-BLOCK") && !stripped.html.includes("{{status"), "不带 token 整块摘除");
  assert.throws(() => renderMailTemplate(html, { values, statusToken: "xyz" }), /invalid_status_token/);
  // 非 E8 模板给了 token 也不受影响(没有块可换)。
  const e0 = readTemplate("E0");
  const untouched = renderMailTemplate(e0, { values: Object.fromEntries(extractMailTemplatePlaceholders(e0).map((key) => [key, "x"])), statusToken: token });
  assert.ok(!untouched.html.includes(token));
});

test("signature.json 存在且含签名兜底两键", () => {
  const signature = JSON.parse(readFileSync(new URL("../public/mail-templates/signature.json", import.meta.url), "utf8"));
  assert.ok(signature["公司全称"], "公司全称兜底");
  assert.ok(signature["发件邮箱"], "发件邮箱兜底");
  // 兜底键必须是模板里真实存在的占位符,否则填了也白填。
  for (const key of Object.keys(signature)) {
    assert.ok(MAIL_TEMPLATE_CATALOG.some((meta) => extractMailTemplatePlaceholders(readTemplate(meta.id)).includes(key)), `${key} 必须是模板占位符`);
  }
});
