// 选拔分区预览的源码级契约:进度图的"活图片"设计(同 URL、内容随保存变化)
// 在 srcdoc iframe 里有个坑——srcdoc 字符串不变时 React 不重设属性、iframe 不重载,
// 进度图会永远停在首次渲染时的状态。回归防线:预览 iframe 必须以令牌 updatedAt 作 key,
// 保存进度后强制重挂载取新图。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../app/admin/sections/recruit.tsx", import.meta.url), "utf8");

test("邮件预览 iframe 以进度令牌 token:updatedAt 作 key(保存进度后重挂载取新图)", () => {
  assert.match(src, /<iframe key=\{selectedToken \? `\$\{selectedToken\.token\}:\$\{selectedToken\.updatedAt\}`/,
    "预览 iframe 必须随令牌 updatedAt 重挂载,否则进度图停留在旧渲染");
});

test("邮件预览 iframe 保留 sandbox(占位符值原样进 HTML,脚本必须保持禁用)", () => {
  assert.match(src, /<iframe key=\{selectedToken[\s\S]{0,160}?title="邮件预览" sandbox="" srcDoc=\{preview\.html\} \/>/,
    "sandbox 属性不得移除");
});

test("预览渲染与服务端发送共用 renderMailTemplate,且仅 E8 类模板在勾选后注入 statusToken", () => {
  assert.match(src, /renderMailTemplate\(html, \{[\s\S]*?statusToken: meta\.hasStatusBlock && withStatus && selectedToken \? selectedToken\.token : null/,
    "预览必须和发送走同一渲染函数、同一令牌注入条件");
});

test("进度编辑器:阶段/已评/总数是下拉,预计是日期选择(值守时点选而非手敲)", () => {
  assert.match(src, /<select aria-label="阶段"[\s\S]{0,400}?MAIL_STATUS_STAGE_OPTIONS|stageChoices\.map/,
    "阶段必须是下拉(词表来自 MAIL_STATUS_STAGE_OPTIONS)");
  assert.match(src, /<select aria-label="已评份数"/, "已评必须是下拉");
  assert.match(src, /<select aria-label="总份数"/, "总数必须是下拉");
  assert.match(src, /<input type="date" aria-label="预计日期"/, "预计日期必须是日期选择");
});

test("阶段下拉不吞存量自定义值(词表外旧值仍作为选项出现)", () => {
  assert.match(src, /stage && !\(MAIL_STATUS_STAGE_OPTIONS as readonly string\[\]\)\.includes\(stage\)/,
    "词表外的既有阶段必须保留为选项,不能被下拉静默改写");
});

test("岗位是下拉选择(预置角色 + 自定义入口),不是纯输入框", () => {
  assert.match(src, /<select\s+aria-label="岗位"|aria-label="岗位"[\s\S]{0,200}?RECRUIT_POSITION_OPTIONS\.map/,
    "岗位必须渲染为下拉");
  assert.match(src, /RECRUIT_POSITION_OPTIONS\.map/, "下拉选项必须来自共享词表");
  assert.match(src, /CUSTOM_POSITION\}>自定义…/, "必须保留自定义岗位入口(只加不删)");
  assert.match(src, /自定义岗位<input/, "自定义岗位仍可手填");
});

test("自动填充接入:岗位段落/人才库段落来自共享函数,且手填值优先", () => {
  assert.match(src, /autoFillValuesForTemplate\(\{ position: selected\.position, talent: talentChoice \}\)/,
    "岗位段落必须按候选人岗位自动带出");
  assert.match(src, /\{ \.\.\.signature, \.\.\.autoValues, \.\.\.values \}/,
    "合并顺序必须是 签名兜底 < 自动填充 < 手填(运营改写优先)");
  assert.match(src, /ROLE_PLACEHOLDER_FIELDS\[key\]/, "岗位段落占位符要标注自动带出");
  assert.match(src, /aria-label="人才库回执"/, "人才库段落要有 A/B 回执选择");
  assert.match(src, /feedbackLibraryFor\(selected\.position, templateId\)/, "反馈句库要按岗位/邮件类型取");
  assert.match(src, /admin-chip/, "反馈句必须可点选追加");
});
