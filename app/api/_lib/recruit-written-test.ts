// 见界创赛选拔笔试提交:纯逻辑(字段归一 / 硬判 / 合规筛查),不碰 D1 与网络。
//
// 两条收件通道共用这一份归一逻辑:
//   A. 飞书工作流「新增记录」→ POST /api/recruit/written-test(文本题实时,秒级)
//   B. 本地脚本 scripts/written-test-sync.mjs → 同一个接口(带附件字节抽出的文本)
//
// 纪律:
// 1) 先验密钥再解析字段(见路由),这里只管把两种形状的载荷整理成同一种提交;
// 2) 硬判只做「标准答案已知」的那几道单选,主观题一律留给模型初评 + 人工定稿,
//    宁可少判也不误判——笔试还会在面试现场当面讲;
// 3) 密钥比对复用 AetherGuard 那套 SHA-256 + 逐字节比较,不再写第二份。
import { normalizeSignupReferenceInput } from "./aetherguard-signup.ts";
import { WRITTEN_TEST_ITEMS, WRITTEN_TEST_SINGLE_CHOICE, writtenTestItem } from "./recruit-written-test-rubric.ts";

export const WRITTEN_TEST_LIMITS = {
  sourceRecordId: 64,
  signupRef: 32,
  name: 40,
  school: 120,
  contact: 40,
  competition: 4000,
  answer: 20000,
  attachmentText: 60000,
  attachmentName: 200,
  fileToken: 200,
  positions: 8,
} as const;

export type WrittenTestAttachment = {
  fileToken: string;
  name: string;
  size: number | null;
  /** 本地脚本抽出的附件文本;为空表示还没拿到字节(纯人工评)。 */
  text: string;
};

export type WrittenTestTimings = {
  part1: number | null;
  part2: number | null;
  part3: number | null;
  part4: number | null;
};

export type WrittenTestSubmission = {
  sourceRecordId: string;
  /** 考生在笔试表单里填的报名ID(报名回执邮件的「报名编号」,尾 8 位大写)。 */
  signupRef: string;
  /**
   * 候选人身份由本地同步脚本按报名ID从报名表反查回填(工作流通道不带)。
   * 空表示还没关联——阅卷台会显示「待关联」标记,不影响落库。
   */
  name: string;
  school: string;
  contact: string;
  positions: string[];
  competition: string;
  answers: Record<string, string>;
  attachments: Record<string, WrittenTestAttachment[]>;
  timings: WrittenTestTimings;
  integrityConfirmed: boolean;
  submittedAt: string;
};

export type WrittenTestHardItem = { key: string; score: number; maxScore: number; reason: string };

export type WrittenTestHardScore = {
  score: number;
  maxScore: number;
  items: WrittenTestHardItem[];
  /** 需要人工确认的合规/异常提示(不扣分,只标记)。 */
  flags: string[];
};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

// 飞书 HTTP 节点与本地脚本的字段名都按我们自己拼;这里同时接受驼峰与中文字段名,
// 避免以后在飞书后台改名时整条链路静默失效(改错字段=400,不是"发出去了")。
function pick(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = text(raw[key]);
    if (value) return value;
  }
  return "";
}

function pickNumber(raw: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function pickList(raw: Record<string, unknown>, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = raw[key];
    if (Array.isArray(value)) {
      const items = value.map((entry) => text(entry)).filter(Boolean);
      if (items.length) return items;
      continue;
    }
    const single = text(value);
    if (single) return [single];
  }
  return [];
}

/** 单选/多选答案统一成字符串数组(飞书里 select 字段是数组,工作流 ref 可能给字符串)。 */
function pickOptions(raw: Record<string, unknown>, ...keys: string[]): string[] {
  return pickList(raw, ...keys);
}

/**
 * 把「选项字段」的取值收拾成一个选项文本。
 * 飞书工作流把 select 字段的 ref 展开后可能是:
 *   "商业计划书" / ["商业计划书"] / [{"name":"商业计划书"}]
 * 三种都要能认出来——单选题的判分要从答案开头取字母(「B. …」)。
 */
export function normalizeSelectionAnswer(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[")) return trimmed.replace(/^"|"$/g, "").trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      const first = parsed[0];
      if (typeof first === "string" && first.trim()) return first.trim();
      if (first && typeof first === "object") {
        const object = first as Record<string, unknown>;
        const name = text(object.name ?? object.text ?? object.value ?? object.id);
        if (name) return name.trim();
      }
    }
  } catch {
    // 不是合法 JSON:按字符串清理(去掉方括号与首尾引号)。
  }
  return trimmed.replace(/^\[|\]$/g, "").replace(/^"|"$/g, "").trim();
}

/**
 * 收件载荷解析:飞书工作流走表单编码(JSON 手拼会被数组字段展开破坏),
 * 本地同步脚本走 JSON。两种都支持,谁先能用算谁。
 */
export function parseWrittenTestBody(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "invalid_body" };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ok: true, value: parsed as Record<string, unknown> };
    }
  } catch {
    // 继续按表单解析。
  }
  const params = new URLSearchParams(trimmed);
  const value: Record<string, unknown> = {};
  for (const [key, entry] of params.entries()) {
    if (value[key] === undefined) value[key] = entry;
  }
  if (!Object.keys(value).length) return { ok: false, error: "invalid_body" };
  return { ok: true, value };
}

function pickAttachments(raw: Record<string, unknown>, key: string): WrittenTestAttachment[] {
  const nested = raw.attachments;
  const source =
    nested && typeof nested === "object" && Array.isArray((nested as Record<string, unknown>)[key])
      ? ((nested as Record<string, unknown>)[key] as unknown[])
      : Array.isArray(raw[key])
        ? (raw[key] as unknown[])
        : [];
  const out: WrittenTestAttachment[] = [];
  for (const entry of source) {
    if (!entry || typeof entry !== "object") continue;
    const value = entry as Record<string, unknown>;
    const fileToken = pick(value, "fileToken", "file_token", "token");
    const name = pick(value, "name", "fileName", "file_name").slice(0, WRITTEN_TEST_LIMITS.attachmentName);
    if (!fileToken && !name) continue;
    const size = pickNumber(value, "size", "fileSize");
    const body = pick(value, "text", "extractedText", "content").slice(0, WRITTEN_TEST_LIMITS.attachmentText);
    out.push({ fileToken: fileToken.slice(0, WRITTEN_TEST_LIMITS.fileToken), name, size, text: body });
    if (out.length >= 5) break;
  }
  return out;
}

/** 从「B. 删到只剩…」这类答案里取出选项字母。 */
export function writtenTestOptionLetter(answer: string): string {
  const match = /^\s*([A-D])\s*[.．、:：)]/.exec(answer);
  return match ? match[1].toUpperCase() : "";
}

export function normalizeWrittenTestSubmission(
  input: unknown,
): { ok: true; value: WrittenTestSubmission } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "invalid_body" };
  const raw = input as Record<string, unknown>;

  const sourceRecordId = pick(raw, "sourceRecordId", "source_record_id", "recordId", "record_id", "记录ID");
  if (!sourceRecordId || sourceRecordId.length > WRITTEN_TEST_LIMITS.sourceRecordId) {
    return { ok: false, error: "invalid_source_record_id" };
  }

  // 报名ID 是唯一的身份入口(笔试表单第一题):缺它没法关联报名记录,直接拒收,
  // 让飞书工作流日志大声报错——比悄悄落一份「不知道是谁的卷子」好。
  const signupRefRaw = pick(raw, "signupRef", "signup_ref", "signupReference", "signup_reference", "报名ID", "报名编号");
  const signupRef = normalizeSignupReferenceInput(signupRefRaw);
  if (!signupRef || signupRef.length > WRITTEN_TEST_LIMITS.signupRef) return { ok: false, error: "invalid_signup_ref" };

  // 身份字段不再由表单收集:来自同步脚本/历史数据的兼容通道,有就带上(收件后按报名ID反查覆盖)。
  const name = pick(raw, "name").slice(0, WRITTEN_TEST_LIMITS.name);
  const school = pick(raw, "school", "学校、专业、年级", "学校专业年级").slice(0, WRITTEN_TEST_LIMITS.school);
  const contact = pick(raw, "contact", "手机或微信", "联系方式").slice(0, WRITTEN_TEST_LIMITS.contact);
  const competition = pick(raw, "competition", "做过的比赛或项目").slice(0, WRITTEN_TEST_LIMITS.competition);
  const positions = pickOptions(raw, "positions", "position", "意向岗位")
    .map((entry) => normalizeSelectionAnswer(entry))
    .filter(Boolean)
    .slice(0, WRITTEN_TEST_LIMITS.positions);

  const answers: Record<string, string> = {};
  const attachments: Record<string, WrittenTestAttachment[]> = {};
  const choiceKeys = new Set<string>(WRITTEN_TEST_SINGLE_CHOICE.map((choice) => choice.key));
  for (const item of WRITTEN_TEST_ITEMS) {
    // 不计分的信息题(姓名/学校/用时/诚信)各有专属字段,不再重复塞进作答表。
    if (item.kind === "info") continue;
    const rawAnswer = pick(raw, item.key, item.label, item.sourceField);
    // 单选题的取值可能是数组展开后的片段,收拾成一条选项文本再判分。
    const answer = choiceKeys.has(item.key) ? normalizeSelectionAnswer(rawAnswer) : rawAnswer;
    if (answer) answers[item.key] = answer.slice(0, WRITTEN_TEST_LIMITS.answer);
    const files = pickAttachments(raw, item.key);
    if (files.length) attachments[item.key] = files;
  }
  // 工作流通道也可能把选项放在 answers 里(数组被拼成字符串),这里再收一次选项题。
  for (const choice of WRITTEN_TEST_SINGLE_CHOICE) {
    const options = pickOptions(raw, `${choice.key}_option`, `${choice.key}选项`);
    if (options.length && !answers[choice.key]) answers[choice.key] = options.join(" ");
  }

  const timings: WrittenTestTimings = {
    part1: pickNumber(raw, "time1", "timing_part1", "第一部分实际用时（分钟）"),
    part2: pickNumber(raw, "time2", "timing_part2", "第二部分实际用时（分钟）"),
    part3: pickNumber(raw, "time3", "timing_part3", "第三部分实际用时（分钟）"),
    part4: pickNumber(raw, "time4", "timing_part4", "第四部分实际用时（分钟）"),
  };

  const integrityRaw = raw.integrityConfirmed ?? raw.integrity_confirmed ?? raw.integrity ?? raw["诚信确认"];
  // 飞书里「诚信确认」是单选,值可能是数组/数组展开片段;工作流通道也可能给字符串或布尔。
  const integrityText = Array.isArray(integrityRaw)
    ? integrityRaw.map((entry) => normalizeSelectionAnswer(text(entry))).filter(Boolean).join(" ")
    : normalizeSelectionAnswer(text(integrityRaw));
  const integrityConfirmed =
    integrityRaw === true ||
    integrityRaw === 1 ||
    integrityText === "我确认" ||
    integrityText === "true" ||
    integrityText.includes("我确认");

  const submittedAt = pick(raw, "submittedAt", "submitted_at") || new Date().toISOString();

  return {
    ok: true,
    value: {
      sourceRecordId,
      signupRef,
      name,
      school,
      contact,
      positions,
      competition,
      answers,
      attachments,
      timings,
      integrityConfirmed,
      submittedAt,
    },
  };
}

/**
 * 硬判 + 合规筛查。
 * 硬判只覆盖标准答案已知的单选(1.4 ×4 = 4 分);主观题一律留给模型初评 + 人工定稿。
 */
export function hardScoreWrittenTest(value: WrittenTestSubmission): WrittenTestHardScore {
  const items: WrittenTestHardItem[] = [];
  const flags: string[] = [];
  let score = 0;
  let maxScore = 0;

  for (const choice of WRITTEN_TEST_SINGLE_CHOICE) {
    const spec = writtenTestItem(choice.key);
    if (!spec) continue;
    const answer = value.answers[choice.key] ?? "";
    const letter = writtenTestOptionLetter(answer);
    const hit = letter === choice.correctOption;
    items.push({
      key: choice.key,
      score: hit ? spec.maxScore : 0,
      maxScore: spec.maxScore,
      reason: hit
        ? `选中 ${choice.correctOption},与标准答案一致`
        : answer
          ? `选了 ${letter || "?"},标准答案是 ${choice.correctOption}`
          : "未作答",
    });
    score += hit ? spec.maxScore : 0;
    maxScore += spec.maxScore;
  }

  if (!value.integrityConfirmed) flags.push("未勾选诚信确认:笔试要求未使用 AI 工具且同意面试现场讲解,需人工复核后再采信分数");
  const oneLiner = value.answers.t2_2 ?? "";
  const oneLinerLimit = writtenTestItem("t2_2")?.maxChars ?? 60;
  if (oneLiner && oneLiner.length > oneLinerLimit) {
    flags.push(`2.2 一句话版本 ${oneLiner.length} 字,超过 ${oneLinerLimit} 字上限`);
  }
  const timingValues = [value.timings.part1, value.timings.part2, value.timings.part3, value.timings.part4];
  if (timingValues.some((entry) => entry !== null && (entry <= 0 || entry > 300))) {
    flags.push("实际用时存在 0 或超过 300 分钟的异常值,请核对");
  }
  const missingRequired = WRITTEN_TEST_ITEMS.filter(
    (item) => item.maxScore > 0 && !value.answers[item.key] && !(value.attachments[item.key]?.length ?? 0),
  );
  if (missingRequired.length) {
    flags.push(`有 ${missingRequired.length} 道计分题未作答:${missingRequired.map((item) => item.label).join("、")}`);
  }

  return { score, maxScore, items, flags };
}

/** 阅卷台保存人工分数时的入参归一:只允许改已存在的题目键。 */
export function normalizeWrittenTestManualPatch(
  input: unknown,
): { ok: true; value: { id: string; items: Array<{ key: string; score: number | null; note: string }>; status: string; note: string } }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "invalid_body" };
  const raw = input as Record<string, unknown>;
  const id = text(raw.id);
  if (!id) return { ok: false, error: "missing_id" };

  const items: Array<{ key: string; score: number | null; note: string }> = [];
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  for (const entry of rawItems) {
    if (!entry || typeof entry !== "object") continue;
    const value = entry as Record<string, unknown>;
    const key = text(value.key);
    const spec = key ? writtenTestItem(key) : undefined;
    if (!spec || spec.maxScore <= 0) continue;
    const score = value.score === null || value.score === undefined ? null : Number(value.score);
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > spec.maxScore)) {
      return { ok: false, error: "invalid_score" };
    }
    items.push({ key, score, note: text(value.note).slice(0, 500) });
  }
  if (!items.length) return { ok: false, error: "empty_patch" };

  const status = pick(raw, "status");
  const allowed = ["pending", "reviewing", "done", "flagged"];
  return {
    ok: true,
    value: {
      id,
      items,
      status: allowed.includes(status) ? status : "",
      note: pick(raw, "note").slice(0, 2000),
    },
  };
}
