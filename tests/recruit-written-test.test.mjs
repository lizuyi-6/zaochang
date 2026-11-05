// 笔试阅卷的纯逻辑契约:评分口径 / 提交归一 / 硬判 / 初评提示词与解析。
// 这些模块不依赖 Workers 绑定,路由与阅卷台共用同一份事实。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WRITTEN_TEST_ITEMS,
  WRITTEN_TEST_SINGLE_CHOICE,
  WRITTEN_TEST_TIMING_FIELDS,
  WRITTEN_TEST_TOTAL_SCORE,
  writtenTestFieldMap,
  writtenTestItem,
  writtenTestTotalScore,
} from "../app/api/_lib/recruit-written-test-rubric.ts";
import {
  WRITTEN_TEST_LIMITS,
  hardScoreWrittenTest,
  normalizeSelectionAnswer,
  normalizeWrittenTestManualPatch,
  normalizeWrittenTestSubmission,
  parseWrittenTestBody,
  writtenTestOptionLetter,
} from "../app/api/_lib/recruit-written-test.ts";
import {
  buildWrittenTestGradePrompt,
  parseWrittenTestGrade,
  writtenTestGradeTargets,
} from "../app/api/_lib/recruit-written-test-grader.ts";

test("评分口径:分值合计恒等于 100(总分失去意义时所有统计都不可信)", () => {
  assert.equal(writtenTestTotalScore(), WRITTEN_TEST_TOTAL_SCORE);
  assert.equal(WRITTEN_TEST_TOTAL_SCORE, 100);
});

test("评分口径:题目 key / label / 飞书字段标题都不重复", () => {
  const keys = WRITTEN_TEST_ITEMS.map((item) => item.key);
  assert.equal(new Set(keys).size, keys.length, "key 重复");
  const labels = WRITTEN_TEST_ITEMS.map((item) => item.label);
  assert.equal(new Set(labels).size, labels.length, "label 重复");
  const fields = WRITTEN_TEST_ITEMS.map((item) => item.sourceField).filter(Boolean);
  assert.equal(new Set(fields).size, fields.length, "飞书字段标题重复");
});

test("评分口径:计分题都要有评分点,评分点分值之和恒等于满分,hard 题必须写死标准答案", () => {
  for (const item of WRITTEN_TEST_ITEMS) {
    if (item.maxScore <= 0) continue;
    assert.ok(item.rubric.every((point) => point.text.trim().length > 0), `${item.key} 有空评分点`);
    assert.ok(
      item.rubric.every((point) => Number.isFinite(point.score) && point.score > 0),
      `${item.key} 有非正分值的评分点`,
    );
    assert.equal(
      new Set(item.rubric.map((point) => point.text)).size,
      item.rubric.length,
      `${item.key} 评分点重复`,
    );
    const weightSum = item.rubric.reduce((sum, point) => sum + point.score, 0);
    assert.equal(weightSum, item.maxScore, `${item.key} 评分点分值之和(${weightSum})≠满分(${item.maxScore})`);
    if (item.kind === "hard") {
      assert.ok(item.rubric.length >= 1, `${item.key} 评分点为空`);
      assert.ok(item.correctOption, `${item.key} 缺标准答案`);
      assert.equal(item.maxScore, 1, "单选每题 1 分");
      continue;
    }
    assert.ok(item.rubric.length >= 1, `${item.key} 评分点为空`);
  }
});

test("评分口径:1.2 必须给「提到改口原因」留分(周五下午开会过材料是可答信息)", () => {
  const item = writtenTestItem("t1_2");
  assert.ok(item.rubric.some((point) => point.text.includes("原因") && point.score === 1));
});

test("评分口径:4.1 的「第一三段未动」和「三处大白话」分值与内部标准一致(2/3)", () => {
  const item = writtenTestItem("t4_1");
  const untouched = item.rubric.find((point) => point.text.includes("第一段和第三段"));
  const jargon = item.rubric.find((point) => point.text.includes("SSE"));
  assert.equal(untouched.score, 2);
  assert.equal(jargon.score, 3);
});

test("评分口径:1.4 四道情景单选的标准答案与试卷一致(B/C/B/B)", () => {
  assert.deepEqual(
    WRITTEN_TEST_SINGLE_CHOICE.map((choice) => [choice.key, choice.correctOption]),
    [["t1_4_1", "B"], ["t1_4_2", "C"], ["t1_4_3", "B"], ["t1_4_4", "B"]],
  );
});

test("飞书字段映射:字段标题能对上稳定键,四部分用时单独登记", () => {
  const map = writtenTestFieldMap();
  assert.equal(map["1.1 任务卡"], "t1_1");
  assert.equal(map["2.1 简介全文"], "t2_1");
  assert.equal(map["4.3 其他问题"], "t4_3");
  for (const entry of WRITTEN_TEST_TIMING_FIELDS) {
    assert.equal(map[entry.field], entry.key);
  }
});

test("提交归一:驼峰键与飞书中文字段键等价,附件数组被拆成结构化条目", () => {
  const camel = normalizeWrittenTestSubmission({
    sourceRecordId: "rec123",
    name: " 张三 ",
    school: "测试大学 · 计算机 · 大三",
    contact: "13800000000",
    positions: ["商业计划书"],
    competition: "无",
    t1_1: "交一份一页简介",
    t1_4_1: "B. 删到只剩这一页最重要的一个观点",
    time1: 30,
    integrityConfirmed: true,
    attachments: { t2_1: [{ fileToken: "ft-1", name: "intro.pdf", size: 2048, text: "正文" }] },
  });
  assert.equal(camel.ok, true);
  assert.equal(camel.value.name, "张三");
  assert.equal(camel.value.answers.t1_1, "交一份一页简介");
  assert.deepEqual(camel.value.positions, ["商业计划书"]);
  assert.equal(camel.value.timings.part1, 30);
  assert.equal(camel.value.integrityConfirmed, true);
  assert.equal(camel.value.attachments.t2_1[0].fileToken, "ft-1");
  assert.equal(camel.value.attachments.t2_1[0].text, "正文");

  const chinese = normalizeWrittenTestSubmission({
    记录ID: "rec123",
    姓名: "张三",
    "学校、专业、年级": "测试大学 · 计算机 · 大三",
    手机或微信: "13800000000",
    意向岗位: ["商业计划书"],
    "1.1 任务卡": "交一份一页简介",
    "第一部分实际用时（分钟）": 30,
    诚信确认: ["我确认"],
  });
  assert.equal(chinese.ok, true);
  assert.equal(chinese.value.name, "张三");
  assert.equal(chinese.value.answers.t1_1, "交一份一页简介");
  assert.equal(chinese.value.timings.part1, 30);
  assert.equal(chinese.value.integrityConfirmed, true);
});

test("提交归一:坏输入给稳定错误码,不留半个可用的提交", () => {
  assert.deepEqual(normalizeWrittenTestSubmission(null), { ok: false, error: "invalid_body" });
  assert.equal(normalizeWrittenTestSubmission({ name: "张三" }).error, "invalid_source_record_id");
  assert.equal(normalizeWrittenTestSubmission({ sourceRecordId: "r", name: "" }).error, "invalid_name");
  assert.equal(
    normalizeWrittenTestSubmission({ sourceRecordId: "r", name: "x".repeat(WRITTEN_TEST_LIMITS.name + 1) }).error,
    "invalid_name",
  );
  assert.equal(
    normalizeWrittenTestSubmission({ sourceRecordId: "r".repeat(WRITTEN_TEST_LIMITS.sourceRecordId + 1), name: "张三" }).error,
    "invalid_source_record_id",
  );
});

test("选项字母解析:带「B.」「B、」「B)」都能取出,空答案取不到", () => {
  assert.equal(writtenTestOptionLetter("B. 删到只剩这一页最重要的一个观点"), "B");
  assert.equal(writtenTestOptionLetter("C、我们计划让见界帮乡村老师备课"), "C");
  assert.equal(writtenTestOptionLetter("D) 拆成两页"), "D");
  assert.equal(writtenTestOptionLetter("随便写点什么"), "");
  assert.equal(writtenTestOptionLetter(""), "");
});

test("硬判:1.4 选对得分选错不得分,硬判总分上限 4", () => {
  const normalized = normalizeWrittenTestSubmission({
    sourceRecordId: "rec1",
    name: "张三",
    t1_4_1: "B. 删到只剩这一页最重要的一个观点",
    t1_4_2: "C. 我们计划让见界帮乡村老师备课，目前正在调研从哪一步切入",
    t1_4_3: "A. 字号和行距调小，挤进一页",
    t1_4_4: "B. 只改第三段的措辞，意思不变",
  });
  assert.equal(normalized.ok, true);
  const hard = hardScoreWrittenTest(normalized.value);
  assert.equal(hard.score, 3);
  assert.equal(hard.maxScore, 4);
  const wrong = hard.items.find((item) => item.key === "t1_4_3");
  assert.equal(wrong.score, 0);
  assert.match(wrong.reason, /标准答案是 B/);
});

test("合规筛查:没勾诚信确认、2.2 超字数、漏答计分题都要被标出来", () => {
  const normalized = normalizeWrittenTestSubmission({
    sourceRecordId: "rec2",
    name: "李四",
    t2_2: "一".repeat(80),
  });
  assert.equal(normalized.ok, true);
  const hard = hardScoreWrittenTest(normalized.value);
  assert.ok(hard.flags.some((flag) => flag.includes("诚信确认")));
  assert.ok(hard.flags.some((flag) => flag.includes("超过 60 字")));
  assert.ok(hard.flags.some((flag) => flag.includes("未作答")));
});

test("人工分归一:分数必须在题目满分之内,未知题键忽略,空改动拒绝", () => {
  const ok = normalizeWrittenTestManualPatch({ id: "s1", items: [{ key: "t1_1", score: 6, note: "任务卡要素齐" }] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value.items, [{ key: "t1_1", score: 6, note: "任务卡要素齐" }]);
  assert.equal(normalizeWrittenTestManualPatch({ id: "s1", items: [{ key: "t1_1", score: 9 }] }).error, "invalid_score");
  assert.equal(normalizeWrittenTestManualPatch({ id: "s1", items: [{ key: "t1_1", score: -1 }] }).error, "invalid_score");
  assert.equal(normalizeWrittenTestManualPatch({ id: "s1", items: [{ key: "not_a_key", score: 1 }] }).error, "empty_patch");
  assert.equal(normalizeWrittenTestManualPatch({ id: "s1", items: [] }).error, "empty_patch");
  assert.equal(normalizeWrittenTestManualPatch({ items: [{ key: "t1_1", score: 1 }] }).error, "missing_id");
});

test("初评选题:只送主观题给模型,附件没字节的题退回人工", () => {
  const normalized = normalizeWrittenTestSubmission({
    sourceRecordId: "rec3",
    name: "王五",
    t1_1: "交一份一页简介…",
    t1_4_1: "B. 删到只剩这一页最重要的一个观点",
    attachments: { t2_1: [{ fileToken: "ft-2", name: "intro.pdf", size: 10, text: "简介正文" }] },
  });
  assert.equal(normalized.ok, true);
  const targets = writtenTestGradeTargets(normalized.value);
  const keys = targets.map((target) => target.key);
  assert.ok(keys.includes("t1_1"), "文本题要送模型");
  assert.ok(keys.includes("t2_1"), "附件题(有文本)要送模型");
  assert.ok(!keys.includes("t1_4_1"), "硬判题不送模型");
  assert.ok(!keys.includes("name"), "不计分的信息题不送模型");
  const attachment = targets.find((target) => target.key === "t2_1");
  assert.equal(attachment.manualReason, "");
  assert.equal(attachment.answer, "简介正文");

  const withoutBytes = normalizeWrittenTestSubmission({
    sourceRecordId: "rec4",
    name: "赵六",
    attachments: { t3_2: [{ fileToken: "ft-3", name: "deck.pdf", size: 10, text: "" }] },
  });
  const manualTarget = writtenTestGradeTargets(withoutBytes.value).find((target) => target.key === "t3_2");
  assert.match(manualTarget.manualReason, /人工/);
});

test("初评解析:合法输出给分,越界/缺字段/非 JSON 一律判为不可用", () => {
  const good = parseWrittenTestGrade('{"score":6,"reasons":["任务卡要素齐"],"evidence":["交一份一页简介"],"uncertain":false}', 8);
  assert.equal(good.score, 6);
  assert.deepEqual(good.reasons, ["任务卡要素齐"]);
  assert.equal(good.uncertain, false);
  assert.equal(parseWrittenTestGrade('{"score":9,"reasons":["超纲"]}', 8), null, "分数越界要判不可用");
  assert.equal(parseWrittenTestGrade('{"score":6}', 8), null, "缺 reasons 要判不可用");
  assert.equal(parseWrittenTestGrade("不是 JSON", 8), null);
  assert.equal(parseWrittenTestGrade('```json\n{"score":6,"reasons":["行"]}\n```', 8).score, 6, "围栏要能剥掉");
});

test("初评提示词:评分点来自服务端,考生作答被标成不可信数据", () => {
  const spec = writtenTestItem("t1_1");
  const prompt = buildWrittenTestGradePrompt(spec, "交一份一页简介,周四晚上给评委看");
  assert.match(prompt.system, /不可信数据/);
  assert.match(prompt.system, /只输出 JSON/);
  assert.match(prompt.user, /服务端评分标准/);
  assert.match(prompt.user, /不可信数据/);
  assert.match(prompt.user, /交一份一页简介/);
  assert.ok(prompt.user.includes("不超过 6 行"), "评分点必须在提示词里");
});

test("载荷解析:JSON 与表单编码两种形状都要能收(飞书工作流走表单,本地脚本走 JSON)", () => {
  const json = parseWrittenTestBody(JSON.stringify({ sourceRecordId: "rec1", name: "张三" }));
  assert.equal(json.ok, true);
  assert.equal(json.value.name, "张三");

  const form = parseWrittenTestBody("sourceRecordId=rec1&name=%E5%BC%A0%E4%B8%89&t1_1=%E4%BA%A4%E4%B8%80%E4%BB%BD");
  assert.equal(form.ok, true);
  assert.equal(form.value.sourceRecordId, "rec1");
  assert.equal(form.value.name, "张三");
  assert.equal(form.value.t1_1, "交一份");

  assert.equal(parseWrittenTestBody("").ok, false);
  assert.equal(parseWrittenTestBody("   ").ok, false);
});

test("选项取值:数组展开的三种形状都要收拾成同一条选项文本", () => {
  assert.equal(normalizeSelectionAnswer("B. 删到只剩这一页最重要的一个观点"), "B. 删到只剩这一页最重要的一个观点");
  assert.equal(normalizeSelectionAnswer('["B. 删到只剩这一页最重要的一个观点"]'), "B. 删到只剩这一页最重要的一个观点");
  assert.equal(normalizeSelectionAnswer('[{"name":"B. 删到只剩这一页最重要的一个观点"}]'), "B. 删到只剩这一页最重要的一个观点");
  assert.equal(normalizeSelectionAnswer("商业计划书"), "商业计划书");
});

test("表单通道:选项字段是数组展开片段时,单选题照样能判分、诚信确认照样认得出", () => {
  const form = parseWrittenTestBody(
    [
      "sourceRecordId=rec5",
      "name=%E5%BC%A0%E4%B8%89",
      "t1_4_1=" + encodeURIComponent('["B. 删到只剩这一页最重要的一个观点"]'),
      "integrityConfirmed=" + encodeURIComponent('["我确认"]'),
    ].join("&"),
  );
  assert.equal(form.ok, true);
  const normalized = normalizeWrittenTestSubmission(form.value);
  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.answers.t1_4_1, "B. 删到只剩这一页最重要的一个观点");
  assert.equal(normalized.value.integrityConfirmed, true);
  const hard = hardScoreWrittenTest(normalized.value);
  assert.equal(hard.score, 1, "选对 B 要给分");
  assert.ok(!hard.flags.some((flag) => flag.includes("诚信确认")), "勾了确认就不该再报警");
});
