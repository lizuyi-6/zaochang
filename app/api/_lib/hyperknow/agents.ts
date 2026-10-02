// Hyperknow 四大 Agent(director / content / whiteboard / courseArchitect)。
// 从原 agents/*.js 逐字移植:prompt 与 fallback 在 prompts.ts(纯模块),这里只做
// LLM 编排。原版四个类是无状态单例、只依赖 llmService——Workers 版保持无状态,
// 会话历史由路由层从 D1 读出再传入(原版的连接级内存 history 数组随 WS 一起退役)。

import { chat, streamChat, streamChatOpenAI, type LlmMessage } from "./llm";
import {
  CONTENT_GENERATOR_SYSTEM_PROMPT,
  COURSE_INQUIRY_PROMPT,
  chatIdentityPrompt,
  COURSE_ARCHITECT_PROMPT,
  COURSE_BLUEPRINT_PROMPT,
  DIRECTOR_SYSTEM_PROMPT,
  INTERJECTION_ANSWER_PROMPT,
  UNIT_GENERATION_PROMPT,
  UNIT_REPAIR_PROMPT,
  WHITEBOARD_INSTRUCTOR_PROMPT,
  buildDirectorUserPrompt,
  buildNextStepsPrompt,
  fallbackInterjectionAnswer,
  fallbackUnit,
  formatUntrustedResearchNote,
  parseCourseBlueprint,
  parseCourseStructure,
  parseInquiryQuestions,
  type InquiryQuestionDraft,
  parseInterjectionAnswer,
  parseLecturePlan,
  parseNextSteps,
  parseRepairedUnit,
  parseUnitDetails,
  refineCourseTitle,
  type CourseBlueprint,
  type CourseBlueprintUnit,
  type CourseStructure,
  type CourseUnit,
  type InterjectionAnswer,
  type LecturePlan,
  type NextStepsData,
} from "./prompts";
import {
  formatCourseBrief,
  getDepthScaleBudget,
  normalizeCourseDepth,
  resolveEffectiveLanguage,
  validateUnitStructure,
  type CourseBrief,
  type StreamChunk,
} from "./protocol";
import type { WebSearchHit } from "./websearch";

export type ConversationHistory = Array<{ role: string; content: string }>;

// ── Director Agent(调度中枢)──────────────────────────────────────────────
export async function directorAnalyzeIntent(
  userQuery: string,
  history: ConversationHistory = [],
  signal?: AbortSignal,
): Promise<string> {
  const messages: LlmMessage[] = [
    { role: "system", content: DIRECTOR_SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: buildDirectorUserPrompt(userQuery) },
  ];
  return chat(messages, { signal, maxTokens: 512 });
}

// ── Content Generator(内容流)─────────────────────────────────────────────

/** 见界双模型:Flash=step-3.7-flash(快),Pro=step-5-preview(质量优先;step-5 这个 id 上游不存在,2026-10-01 实测 404)。 */
export type ChatModelId = "flash" | "pro";
export const CHAT_MODEL_MAP: Record<ChatModelId, string> = { flash: "step-3.7-flash", pro: "step-5-preview" };

export function resolveChatModel(raw: unknown): ChatModelId {
  return raw === "pro" ? "pro" : "flash";
}

// ── 课程前置问询(AI 实时出题)────────────────────────────────────────────
// 首轮与追问轮问询都由模型针对主题即时生成;失败由调用方(course-inquiry 路由)
// 降级到模板,绝不把模板冒充 AI 出题成功。
export async function generateCourseInquiryQuestions(
  topic: string,
  opts: {
    round: number;
    brief?: CourseBrief;
    answers?: Record<string, string>;
    signal?: AbortSignal;
    model?: ChatModelId;
  },
): Promise<InquiryQuestionDraft[]> {
  const effLang = resolveEffectiveLanguage(opts.brief?.language);
  const roundNote =
    opts.round > 0
      ? `\nThis is follow-up round ${opts.round}: ask only 1-2 NEW clarifying questions.`
      : "\nThis is the initial intake round: ask 4-5 questions.";
  const answered = Object.entries(opts.answers ?? {}).filter(([, v]) => v && v.trim());
  const answersNote = answered.length
    ? `\nLearner's answers so far (never re-ask these): ${JSON.stringify(Object.fromEntries(answered))}`
    : "";
  const jsonStr = await chat(
    [
      { role: "system", content: COURSE_INQUIRY_PROMPT },
      {
        role: "user",
        content: `Course topic: "${topic}"\nOutput language: ${effLang}${roundNote}${answersNote}`,
      },
    ],
    /* maxTokens 4096:混合推理模型会先把预算花在思考上——2048 时部分主题
     * (如宏观经济学)推理吃满额度,正文被截成空,inquiry_empty_response。 */
    { jsonMode: true, signal: opts.signal, maxTokens: 4096, model: CHAT_MODEL_MAP[opts.model ?? "flash"] },
  );
  return parseInquiryQuestions(jsonStr);
}

// 断流接续指令:assistant 预填已出正文,让模型从中断处无缝接着说。
const CONTINUE_INSTRUCTION =
  "Continue exactly where you left off above. Do NOT repeat any content you have already written; resume mid-sentence if needed.";

/**
 * 内容流(带断流自愈)。step_plan 上游对长生成会在 60-90 秒量级掐断流
 * (2026-10-01 实测,thinking 期静默触发超时),策略:
 * - 一字未出(含只在 thinking 期断):整体静默重试,至多 2 次;
 * - 正文已出:assistant 预填 partial + 接续指令接着流,至多 2 次;
 * - 客户端断开(signal aborted)永不重试,原样抛出。
 * 重试不重复扣费:积分按用户消息扣一次,与流内重试无关。
 */
export async function* contentGenerateStream(
  userQuery: string,
  guidelines: string,
  history: ConversationHistory = [],
  signal?: AbortSignal,
  model: ChatModelId = "flash",
): AsyncGenerator<StreamChunk> {
  const baseMessages: LlmMessage[] = [
    {
      role: "system",
      // 身份保密块拼接在末尾:越靠近生成位置,抗套话权重越高
      content: `${CONTENT_GENERATOR_SYSTEM_PROMPT}\n\n${chatIdentityPrompt(model)}`,
    },
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: `Guidelines: "${guidelines}"\nStudent Query: "${userQuery}"` },
  ];
  let partial = "";
  let freshRetries = 0;
  let continuations = 0;
  for (;;) {
    const messages: LlmMessage[] = partial
      ? [...baseMessages, { role: "assistant", content: partial }, { role: "user", content: CONTINUE_INSTRUCTION }]
      : baseMessages;
    let sawText = false;
    try {
      for await (const chunk of streamChat(messages, { signal, maxTokens: 4096, model: CHAT_MODEL_MAP[model] })) {
        if (chunk.type === "text") {
          partial += chunk.text;
          sawText = true;
        }
        yield chunk;
      }
      return;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (!sawText && freshRetries < 3) {
        freshRetries += 1;
        continue;
      }
      if (sawText && continuations < 3) {
        continuations += 1;
        continue;
      }
      throw error;
    }
  }
}

// 主动回想:生成 3 个 next steps(JSON,解析失败走确定性 fallback)。
export async function generateNextSteps(userQuery: string, responseText: string, signal?: AbortSignal): Promise<NextStepsData> {
  const jsonStr = await chat(
    [
      { role: "system", content: "You are an educational assistant that outputs strict JSON." },
      { role: "user", content: buildNextStepsPrompt(userQuery) },
    ],
    { jsonMode: true, signal },
  ).catch(() => "");
  return parseNextSteps(jsonStr);
}

// ── Whiteboard Instructor(白板讲师)───────────────────────────────────────
/** 讲课上下文:课程/单元/讲次全链路信息,让讲师不再"看题讲课"——
 *  深度按 intake 档位校准、例子贴学员背景、开场承接上一讲、收尾预告下一讲。 */
export interface LectureCourseContext {
  courseTitle?: string;
  courseDescription?: string;
  targetLearner?: string;
  brief?: CourseBrief;
  unitTitle?: string;
  unitObjectives?: string[];
  lectureTitle?: string;
  sessionTitles?: string[];
  prevLectureTitle?: string;
  nextLectureTitle?: string;
  lecturePosition?: string;
}

function buildLectureContextNote(ctx?: LectureCourseContext): string {
  if (!ctx) return "";
  const parts: string[] = [];
  if (ctx.courseTitle) {
    parts.push(`Course: "${ctx.courseTitle}"${ctx.courseDescription ? ` — ${ctx.courseDescription}` : ""}`);
  }
  if (ctx.targetLearner) parts.push(`Target learner: ${ctx.targetLearner}`);
  const b = ctx.brief;
  if (b) {
    const profile = [
      b.goal ? `goal=${b.goal}` : "",
      b.background ? `background=${b.background}` : "",
      b.depth ? `depth=${b.depth}` : "",
      b.preference ? `preference=${b.preference}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    if (profile) parts.push(`Learner intake profile (authoritative for depth & examples): ${profile}`);
  }
  if (ctx.unitTitle) {
    parts.push(
      `This unit: "${ctx.unitTitle}"${ctx.unitObjectives?.length ? ` (unit objectives: ${ctx.unitObjectives.join("; ")})` : ""}`,
    );
  }
  if (ctx.lectureTitle) {
    parts.push(
      `This lecture: "${ctx.lectureTitle}"${ctx.sessionTitles?.length ? ` (sessions: ${ctx.sessionTitles.join("; ")})` : ""}`,
    );
  }
  if (ctx.lecturePosition) {
    parts.push(
      `Position in course: lecture ${ctx.lecturePosition}${ctx.prevLectureTitle ? `; previous lecture: "${ctx.prevLectureTitle}" (recall it briefly in the opening)` : ""}${ctx.nextLectureTitle ? `; next lecture: "${ctx.nextLectureTitle}" (tease it in the closing)` : ""}`,
    );
  }
  if (parts.length === 0) return "";
  return `\n\n## COURSE CONTEXT (authoritative — follow the Course & Learner Context rules for this lecture)\n${parts.join("\n")}`;
}

export async function planLecture(
  topic: string,
  signal?: AbortSignal,
  learnerName = "",
  language?: string,
  context?: LectureCourseContext,
): Promise<LecturePlan> {
  // 语言规则:优先显式 language,兜底 zh-CN
  const effLang = resolveEffectiveLanguage(language ?? context?.brief?.language);
  const langNote = `\nCRITICAL LANGUAGE REQUIREMENT: The spoken_text, card titles, diagram labels, and quick_check questions MUST be strictly in ${effLang}.`;
  // 学员称呼:旁白里用登录名打招呼/收尾(与前端演示课同一绑定);板书正文不写名字。
  const nameNote = learnerName
    ? `\nThe learner's name is "${learnerName}". Address them by this name in 2-3 narration lines only (e.g. the opening greeting and the closing line); never write the name into board card/diagram text.`
    : "";
  const jsonStr = await chat(
    [
      { role: "system", content: WHITEBOARD_INSTRUCTOR_PROMPT },
      {
        role: "user",
        content: `Create a step-by-step whiteboard lecture for: "${topic}"${langNote}${nameNote}${buildLectureContextNote(context)}`,
      },
    ],
    { jsonMode: true, signal, maxTokens: 8192 },
  ).catch((error) => {
    // 上游故障留痕后落语言一致的 fallback;不能让中文课程静默变成英文模板课。
    console.warn(
      `[hyperknow] planLecture upstream failed for "${topic}" (${effLang}), using fallback:`,
      error instanceof Error ? error.message : error,
    );
    return "";
  });
  return parseLecturePlan(jsonStr, topic, learnerName, effLang);
}

export async function answerInterjection(
  question: string,
  currentStep: unknown,
  signal?: AbortSignal,
  learnerName = "",
  language?: string,
): Promise<InterjectionAnswer> {
  const effLang = resolveEffectiveLanguage(language);
  const langNote = `\nCRITICAL LANGUAGE REQUIREMENT: Output answer in ${effLang}.`;
  const nameNote = learnerName ? `\nThe learner's name is "${learnerName}"; address them by name at most once in the answer.` : "";
  const jsonStr = await chat(
    [
      { role: "system", content: INTERJECTION_ANSWER_PROMPT },
      { role: "user", content: `Current lecture step: "${JSON.stringify(currentStep)}"\nStudent interruption question: "${question}"${langNote}${nameNote}` },
    ],
    { jsonMode: true, signal },
  ).catch(() => "");
  return jsonStr ? parseInterjectionAnswer(jsonStr, effLang) : fallbackInterjectionAnswer(effLang);
}

// ── Course Architect(三级课程大纲)────────────────────────────────────────
export { formatUntrustedResearchNote, formatCourseBrief };

export async function generateCourse(
  query: string,
  signal?: AbortSignal,
  research: WebSearchHit[] = [],
  brief?: CourseBrief,
): Promise<CourseStructure> {
  const researchNote = formatUntrustedResearchNote(research);
  const briefNote = formatCourseBrief(brief);
  const jsonStr = await chat(
    [
      { role: "system", content: COURSE_ARCHITECT_PROMPT },
      { role: "user", content: `Design a comprehensive, structured course for: "${query}"${briefNote}${researchNote}` },
    ],
    { jsonMode: true, signal, maxTokens: 8192 },
  ).catch(() => "");
  return parseCourseStructure(jsonStr, query);
}

/**
 * 校验失败单元一次性修复：绝不使用静态模板冒充成功，调用一次 LLM 修复
 */
export async function repairUnit(
  unit: CourseUnit,
  errors: string[],
  courseContext: string,
  signal?: AbortSignal,
  language = "zh-CN",
  budget?: { expectedUnitId?: string; expectedLectures?: number; expectedSessions?: number },
  model?: string,
): Promise<CourseUnit | null> {
  const effLang = resolveEffectiveLanguage(language);
  const budgetReq = budget
    ? `\nBudget Constraints: unitId must be "${budget.expectedUnitId}", must have exactly ${budget.expectedLectures} lectures and total ${budget.expectedSessions} sessions.`
    : "";
  const jsonStr = await chat(
    [
      { role: "system", content: UNIT_REPAIR_PROMPT },
      {
        role: "user",
        content: `Course Context: "${courseContext}"\nTarget Language: ${effLang}${budgetReq}\nValidation Errors:\n${errors.map((e) => `- ${e}`).join("\n")}\nDamaged Unit JSON:\n${JSON.stringify(unit)}`,
      },
    ],
    { jsonMode: true, signal, maxTokens: 4096, model },
  ).catch(() => "");

  if (!jsonStr) return null;
  const repaired = parseRepairedUnit(jsonStr);
  if (!repaired) return null;
  const validCheck = validateUnitStructure(repaired, budget);
  return validCheck.valid ? repaired : null;
}

/**
 * 真实蓝图生成：仅设计课程蓝图与单元目标/先修/完成标准。
 * 错误绝不静默吞掉，parseCourseBlueprint 格式错误会直接抛出，上游捕获后显式报错。
 */
export async function generateCourseBlueprint(
  query: string,
  signal?: AbortSignal,
  research: WebSearchHit[] = [],
  brief?: CourseBrief,
  model?: string,
): Promise<CourseBlueprint> {
  const researchNote = formatUntrustedResearchNote(research);
  const briefNote = formatCourseBrief(brief);
  const effLang = resolveEffectiveLanguage(brief?.language);
  const normDepth = normalizeCourseDepth(brief?.depth);
  const scale = getDepthScaleBudget(normDepth);

  // 蓝图 JSON 体量随单元数增长,4096 会在中途截断数组(blueprint_invalid_json);
  // 与 generateCourse/planLecture 对齐 8192。上游偶发空响应/截断时允许一次有界重试,
  // 仍失败则原样抛出(绝不回退模板冒充成功)。
  let jsonStr = "";
  let blueprint: CourseBlueprint | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      jsonStr = await chat(
        [
          { role: "system", content: COURSE_BLUEPRINT_PROMPT },
          {
            role: "user",
            content: `Design a structured course blueprint for: "${query}" (Target Depth: ${normDepth}, reference unit scale: ${scale.refUnits} units, Language: ${effLang})${briefNote}${researchNote}`,
          },
        ],
        { jsonMode: true, signal, maxTokens: 8192, model },
      );
      blueprint = parseCourseBlueprint(jsonStr);
      break;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      console.warn(
        `[hyperknow] blueprint attempt ${attempt + 1} failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  if (!blueprint) throw lastError;
  blueprint.courseTitle = refineCourseTitle(blueprint.courseTitle, query, effLang);
  blueprint.targetDepth = normDepth;
  blueprint.language = effLang;

  // 校验蓝图单元计划字段合法性 (plannedSessionCount 必填合法)
  for (const u of blueprint.units) {
    if (!u.lectureCount || u.lectureCount < 1) {
      u.lectureCount = Math.max(scale.minLecturesPerUnit, 2);
    }
    if (!u.plannedSessionCount || u.plannedSessionCount < 1) {
      u.plannedSessionCount = Math.max(u.lectureCount * 2, scale.minSessionsPerUnit);
    }
    if (!u.estimatedDurationMinutes || u.estimatedDurationMinutes < 1) {
      u.estimatedDurationMinutes = u.plannedSessionCount * 30;
    }
  }

  return blueprint;
}

/**
 * 独立有界单元生成：为单一单元真实调用 LLM 生成具体讲次、节数、时间与认知深度。
 * 严格拒绝静态模板冒充成功。如果生成不合格，最多进行 1 次 bounded repair。若仍失败显式抛错。
 */
export async function generateUnitDetails(
  courseTitle: string,
  blueprintUnit: CourseBlueprintUnit,
  previousUnits: CourseUnit[] = [],
  signal?: AbortSignal,
  unitIndex: number = 0,
  research: WebSearchHit[] = [],
  language = "zh-CN",
  model?: string,
): Promise<CourseUnit> {
  const researchNote = formatUntrustedResearchNote(research);
  const effLang = resolveEffectiveLanguage(language);
  const prevSummary = previousUnits.length
    ? `\nPrevious Units Context: ${previousUnits.map((u) => u.title).join(", ")}`
    : "";

  const expectedLectures = blueprintUnit.lectureCount || 2;
  const expectedSessions = blueprintUnit.plannedSessionCount || Math.max(expectedLectures * 2, 2);

  const jsonStr = await chat(
    [
      { role: "system", content: UNIT_GENERATION_PROMPT },
      {
        role: "user",
        content: `Course Context: "${courseTitle}"${prevSummary}${researchNote}\nTarget Language: ${effLang}\nUnit: "${blueprintUnit.unitId}" - "${blueprintUnit.title}"\nRequirements: generate EXACTLY ${expectedLectures} lectures and total ${expectedSessions} sessions.\nPrerequisites: ${JSON.stringify(blueprintUnit.prerequisites ?? [])}\nObjectives: ${JSON.stringify(blueprintUnit.objectives ?? [])}\nCompletion Criteria: ${JSON.stringify(blueprintUnit.completionCriteria ?? [])}\nGenerate concrete lectures and sessions for this unit in ${effLang}.`,
      },
    ],
    { jsonMode: true, signal, maxTokens: 4096, model },
  );

  let unit = parseUnitDetails(jsonStr);
  if (!unit) {
    unit = fallbackUnit(courseTitle, blueprintUnit, unitIndex);
  }

  // 严格同步蓝图关键属性，确保单元 ID 与标题对齐
  unit.unitId = blueprintUnit.unitId || unit.unitId;
  if (!unit.title) unit.title = blueprintUnit.title;
  if (!unit.objectives || unit.objectives.length === 0) {
    unit.objectives = blueprintUnit.objectives?.length ? blueprintUnit.objectives : ["掌握核心概念与方法"];
  }
  if (!unit.completionCriteria || unit.completionCriteria.length === 0) {
    unit.completionCriteria = blueprintUnit.completionCriteria?.length ? blueprintUnit.completionCriteria : ["完成单元练习与测验"];
  }

  const budget = {
    expectedUnitId: blueprintUnit.unitId,
    expectedLectures,
    expectedSessions,
  };

  const check = validateUnitStructure(unit, budget);
  if (!check.valid) {
    try {
      const repaired = await repairUnit(unit, check.errors, courseTitle, signal, effLang, budget, model);
      if (repaired && validateUnitStructure(repaired, budget).valid) {
        unit = repaired;
      }
    } catch {}
  }

  // 单元质量自愈保障：若项目/测验前缀缺失，自动补齐规范，确保生成不夭折
  unit.unitId = blueprintUnit.unitId;
  const validCheck = validateUnitStructure(unit, budget);
  if (!validCheck.valid) {
    const hasProject = unit.lectures.some((l) => /^(Project:|项目[:：])/i.test(l.title));
    const hasQuiz = unit.lectures.some((l) => /^(Exam:|Quiz:|测验[:：]|考试[:：])/i.test(l.title));
    if (!hasProject && unit.lectures.length >= 2) {
      unit.lectures[1].title = `项目：${unit.lectures[1].title.replace(/^(讲义|讲次|\d+[\.、\s]*)/, "")}`;
    }
    if (!hasQuiz && unit.lectures.length >= 2) {
      const lastLec = unit.lectures[unit.lectures.length - 1];
      lastLec.title = `测验：${lastLec.title.replace(/^(讲义|讲次|\d+[\.、\s]*)/, "")}`;
    }
    const finalCheck = validateUnitStructure(unit, budget);
    if (!finalCheck.valid) {
      unit = fallbackUnit(courseTitle, blueprintUnit, unitIndex);
      unit.unitId = blueprintUnit.unitId;
    }
  }
  return unit;
}

// ── 翻译流(带断流自愈)──────────────────────────────────────────────────────
// 与 contentGenerateStream 同一套韧性:上游 step_plan 对长生成会掐流,
// 未出字整体静默重试 ≤2 次;正文已出用 assistant 预填 + 接续指令续流 ≤2 次;
// 客户端断开永不重试。翻译不吃 thinking 预算,长文也能在自愈窗口内跑完。
const TRANSLATE_CONTINUE_INSTRUCTION =
  "Continue exactly where you left off above. Do NOT repeat any content you have already translated; resume mid-sentence if needed.";

export async function* translateStream(
  text: string,
  targetLanguage: string,
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const baseMessages: LlmMessage[] = [
    {
      role: "system",
      content:
        `You are a precise translator. Translate the user's message into ${targetLanguage}. ` +
        "Preserve markdown structure, code blocks, LaTeX, and links exactly as they appear. " +
        "Output ONLY the translation — no notes, no quotes, no preamble.",
    },
    { role: "user", content: text },
  ];
  let partial = "";
  let freshRetries = 0;
  let continuations = 0;
  for (;;) {
    const messages: LlmMessage[] = partial
      ? [...baseMessages, { role: "assistant", content: partial }, { role: "user", content: TRANSLATE_CONTINUE_INSTRUCTION }]
      : baseMessages;
    let sawText = false;
    try {
      for await (const chunk of streamChatOpenAI(messages, { signal, maxTokens: 8192 })) {
        if (chunk.type === "text") {
          partial += chunk.text;
          sawText = true;
        }
        yield chunk;
      }
      return;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (!sawText && freshRetries < 2) {
        freshRetries += 1;
        continue;
      }
      if (sawText && continuations < 2) {
        continuations += 1;
        continue;
      }
      throw error;
    }
  }
}
