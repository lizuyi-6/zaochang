// 候选人校验纯逻辑契约:建档全字段 + 局部更新语义。路由与 Node 测试共用同一份事实。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRecruitCandidateInput,
  normalizeRecruitCandidatePatch,
  RECRUIT_CANDIDATE_LIMITS,
  RECRUIT_POSITION_OPTIONS,
  RECRUIT_STAGE_LABELS,
  RECRUIT_STAGES,
} from "../app/api/_lib/recruit-candidates.ts";

test("建档:正常输入规整(trim、邮箱小写、默认 applied)", () => {
  const result = normalizeRecruitCandidateInput({ name: " 张三 ", email: " Zhang@Example.COM ", position: " 前端工程师 ", note: " 推荐人:李四 " });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { name: "张三", email: "zhang@example.com", position: "前端工程师", stage: "applied", note: "推荐人:李四" });
});

test("建档:坏输入一律稳定错误码", () => {
  assert.deepEqual(normalizeRecruitCandidateInput(null), { ok: false, error: "invalid_body" });
  assert.equal(normalizeRecruitCandidateInput({ name: "", email: "a@b.co", position: "x" }).error, "invalid_name");
  assert.equal(normalizeRecruitCandidateInput({ name: "x".repeat(RECRUIT_CANDIDATE_LIMITS.name + 1), email: "a@b.co", position: "x" }).error, "invalid_name");
  for (const email of ["", "no-at", "a@b", "a b@c.d", "a@b c.d"]) {
    assert.equal(normalizeRecruitCandidateInput({ name: "x", email, position: "x" }).error, "invalid_email", email);
  }
  assert.equal(normalizeRecruitCandidateInput({ name: "x", email: "a@b.co", position: "" }).error, "invalid_position");
  assert.equal(normalizeRecruitCandidateInput({ name: "x", email: "a@b.co", position: "x", stage: "ceo" }).error, "invalid_stage");
  assert.equal(normalizeRecruitCandidateInput({ name: "x", email: "a@b.co", position: "x", note: "n".repeat(RECRUIT_CANDIDATE_LIMITS.note + 1) }).error, "invalid_note");
});

test("局部更新:只校验带来的字段;空 patch 合法;未知键忽略", () => {
  const stageOnly = normalizeRecruitCandidatePatch({ stage: "group" });
  assert.equal(stageOnly.ok, true);
  assert.deepEqual(stageOnly.patch, { stage: "group" });
  const mixed = normalizeRecruitCandidatePatch({ note: "终面表现好", hacker: "ignored" });
  assert.equal(mixed.ok, true);
  assert.deepEqual(mixed.patch, { note: "终面表现好" });
  assert.deepEqual(normalizeRecruitCandidatePatch({}), { ok: true, patch: {} });
  assert.equal(normalizeRecruitCandidatePatch({ stage: "ceo" }).error, "invalid_stage");
  assert.equal(normalizeRecruitCandidatePatch({ email: "bad" }).error, "invalid_email");
  assert.equal(normalizeRecruitCandidatePatch("x").error, "invalid_body");
});

test("局部更新 statusToken:32 位十六进制绑定、null 解绑、其它一律拒", () => {
  const token = "a".repeat(32);
  const bound = normalizeRecruitCandidatePatch({ statusToken: token });
  assert.equal(bound.ok, true);
  assert.deepEqual(bound.patch, { statusToken: token });
  assert.deepEqual(normalizeRecruitCandidatePatch({ statusToken: null }).patch, { statusToken: null });
  for (const bad of ["xyz", "A".repeat(32), 42, "a".repeat(31)]) {
    assert.equal(normalizeRecruitCandidatePatch({ statusToken: bad }).error, "invalid_status_token", String(bad));
  }
});

test("局部更新 archived:严格布尔(归档/恢复);字符串/数字/null 一律拒,不带该键则不影响", () => {
  assert.deepEqual(normalizeRecruitCandidatePatch({ archived: true }).patch, { archived: true });
  assert.deepEqual(normalizeRecruitCandidatePatch({ archived: false }).patch, { archived: false });
  // 机器通道传错类型必须炸出稳定错误码,不能静默归档/漏归档。
  for (const bad of ["true", "false", 1, 0, null]) {
    assert.equal(normalizeRecruitCandidatePatch({ archived: bad }).error, "invalid_archived", String(bad));
  }
  // 不带 archived 的老调用不受影响(空 patch/纯 stage 推进都不出现该键)。
  assert.ok(!("archived" in normalizeRecruitCandidatePatch({ stage: "group" }).patch));
  assert.ok(!("archived" in normalizeRecruitCandidatePatch({}).patch));
  // 可与其它字段混合:一次调用既推进又归档是合法输入。
  assert.deepEqual(normalizeRecruitCandidatePatch({ stage: "rejected", archived: true }).patch, { stage: "rejected", archived: true });
});

test("环节白名单与中文标签一一对应", () => {
  for (const stage of RECRUIT_STAGES) {
    assert.ok(RECRUIT_STAGE_LABELS[stage], `${stage} 缺标签`);
  }
  assert.equal(Object.keys(RECRUIT_STAGE_LABELS).length, RECRUIT_STAGES.length);
});

test("岗位预置选项:与结果邮件原型的角色划分一致,且不构成白名单", () => {
  assert.deepEqual([...RECRUIT_POSITION_OPTIONS], ["队长 / 项目负责人", "调研", "商业计划书 / 文案", "PPT / 视觉", "技术 / 产品"]);
  // 下拉只是快捷方式:预置之外的岗位仍可建档(否则历史档案/新岗位会被堵死)。
  const custom = normalizeRecruitCandidateInput({ name: "李四", email: "li@example.com", position: "前端工程师" });
  assert.equal(custom.ok, true);
  assert.equal(custom.value.position, "前端工程师");
});
