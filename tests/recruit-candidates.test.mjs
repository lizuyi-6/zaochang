// 候选人校验纯逻辑契约:建档全字段 + 局部更新语义。路由与 Node 测试共用同一份事实。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRecruitCandidateInput,
  normalizeRecruitCandidatePatch,
  RECRUIT_CANDIDATE_LIMITS,
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

test("环节白名单与中文标签一一对应", () => {
  for (const stage of RECRUIT_STAGES) {
    assert.ok(RECRUIT_STAGE_LABELS[stage], `${stage} 缺标签`);
  }
  assert.equal(Object.keys(RECRUIT_STAGE_LABELS).length, RECRUIT_STAGES.length);
});
