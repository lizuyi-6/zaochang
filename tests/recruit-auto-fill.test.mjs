// 选拔邮件自动填充契约:词库来自原型(ROLES/FEEDBACK/TALENT),选拔台与测试共用。
// 重点防两类回退:①岗位段落/人才库段落漏自动带出(又要手敲);
// ②模板改了占位符名字,自动填充静默失效(所以对真实模板做键名对齐断言)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  autoFillValuesForTemplate,
  feedbackLibraryFor,
  GROUP_FEEDBACK_TEMPLATES,
  RECRUIT_FEEDBACK,
  RECRUIT_ROLE_KEYS,
  RECRUIT_ROLES,
  RECRUIT_TALENT,
  ROLE_PLACEHOLDER_FIELDS,
  roleForPosition,
  TALENT_PLACEHOLDER,
} from "../app/api/_lib/recruit-roles.ts";
import { RECRUIT_POSITION_OPTIONS } from "../app/api/_lib/recruit-candidates.ts";
import { extractMailTemplatePlaceholders, MAIL_TEMPLATE_CATALOG } from "../app/api/_lib/mail-templates.ts";

test("岗位下拉与角色词表同源(名字逐字一致)", () => {
  assert.deepEqual([...RECRUIT_POSITION_OPTIONS], RECRUIT_ROLE_KEYS.map((key) => RECRUIT_ROLES[key].name));
});

test("roleForPosition:名字精确匹配(容忍空白),自定义岗位返回 null", () => {
  assert.equal(roleForPosition("队长 / 项目负责人")?.key, "captain");
  assert.equal(roleForPosition(" 队长/项目负责人 ")?.key, "captain");
  assert.equal(roleForPosition("技术 / 产品")?.key, "tech");
  assert.equal(roleForPosition("后端工程师"), null);
  assert.equal(roleForPosition(""), null);
});

test("岗位段落自动带出:群面关注点/录取职责/候补等待期建议随岗位变化", () => {
  const captain = autoFillValuesForTemplate({ position: "队长 / 项目负责人" });
  assert.equal(captain["岗位段落：群面关注点"], RECRUIT_ROLES.captain.focus);
  assert.equal(captain["岗位段落：录取后职责"], RECRUIT_ROLES.captain.duty);
  assert.equal(captain["岗位段落：候补等待期建议"], RECRUIT_ROLES.captain.wait);
  const tech = autoFillValuesForTemplate({ position: "技术 / 产品" });
  assert.equal(tech["岗位段落：群面关注点"], RECRUIT_ROLES.tech.focus);
  assert.notEqual(tech["岗位段落：群面关注点"], captain["岗位段落：群面关注点"]);
});

test("E8 的等待期建议用 reviewWait:不提群面(同学对比邮件会提前泄露结果)", () => {
  for (const key of RECRUIT_ROLE_KEYS) {
    const role = RECRUIT_ROLES[key];
    assert.ok(role.reviewWait.includes("不需要提交"), `${key}: E8 建议应说明不需提交`);
    assert.ok(!role.reviewWait.includes("群面"), `${key}: E8 建议不得提群面`);
    assert.ok(!role.reviewWait.includes("递补"), `${key}: E8 建议不得提递补`);
  }
  const values = autoFillValuesForTemplate({ position: "调研" });
  assert.equal(values["等待期建议"], RECRUIT_ROLES.research.reviewWait);
  assert.notEqual(values["等待期建议"], RECRUIT_ROLES.research.wait);
});

test("E2 模板恢复了候补等待期建议段落;E3 恢复了未通过后的建议段落(只加不删)", () => {
  for (const [id, key] of [["E2", "岗位段落：候补等待期建议"], ["E3", "岗位段落：未通过后的建议"]]) {
    const html = readFileSync(new URL(`../public/mail-templates/${id}.html`, import.meta.url), "utf8");
    assert.ok(extractMailTemplatePlaceholders(html).includes(key), `${id} 缺 ${key}`);
  }
});

test("自定义岗位不产生自动值(占位符留给运营手填)", () => {
  assert.deepEqual(autoFillValuesForTemplate({ position: "后端工程师" }), {});
});

test("人才库段落:A/B 回执各带出对应承诺,未选不带出", () => {
  const position = "调研";
  assert.equal(autoFillValuesForTemplate({ position, talent: "A" })[TALENT_PLACEHOLDER], RECRUIT_TALENT.A);
  assert.equal(autoFillValuesForTemplate({ position, talent: "B" })[TALENT_PLACEHOLDER], RECRUIT_TALENT.B);
  assert.equal(TALENT_PLACEHOLDER in autoFillValuesForTemplate({ position, talent: "" }), false);
});

test("反馈句库:群面类邮件用通用库,其余按岗位;自定义岗位无句库", () => {
  for (const templateId of GROUP_FEEDBACK_TEMPLATES) {
    assert.equal(feedbackLibraryFor("技术 / 产品", templateId), RECRUIT_FEEDBACK.group, templateId);
  }
  assert.equal(feedbackLibraryFor("技术 / 产品", "E1"), RECRUIT_FEEDBACK.tech);
  assert.equal(feedbackLibraryFor("后端工程师", "E1"), null);
  for (const key of [...RECRUIT_ROLE_KEYS, "group"]) {
    assert.ok(RECRUIT_FEEDBACK[key].pos.length >= 3, `${key} 肯定句不足`);
    assert.ok(RECRUIT_FEEDBACK[key].neg.length >= 3, `${key} 改进句不足`);
  }
});

test("真实模板对齐:每个岗位段落/人才库占位符都被自动填充覆盖", () => {
  const covered = new Set([...Object.keys(ROLE_PLACEHOLDER_FIELDS), TALENT_PLACEHOLDER]);
  for (const meta of MAIL_TEMPLATE_CATALOG) {
    const html = readFileSync(new URL(`../public/mail-templates/${meta.id}.html`, import.meta.url), "utf8");
    for (const key of extractMailTemplatePlaceholders(html)) {
      const looksAutoFilled = key.startsWith("岗位段落") || key === "等待期建议" || key === TALENT_PLACEHOLDER;
      if (!looksAutoFilled) continue;
      assert.ok(covered.has(key), `${meta.id} 的占位符「${key}」没有自动填充映射`);
    }
  }
});
