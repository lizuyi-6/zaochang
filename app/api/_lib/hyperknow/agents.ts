// Hyperknow 四大 Agent(director / content / whiteboard / courseArchitect)。
// 从原 agents/*.js 逐字移植:prompt 与 fallback 在 prompts.ts(纯模块),这里只做
// LLM 编排。原版四个类是无状态单例、只依赖 llmService——Workers 版保持无状态,
// 会话历史由路由层从 D1 读出再传入(原版的连接级内存 history 数组随 WS 一起退役)。

import { chat, streamChat, type LlmMessage } from "./llm";
import {
  CONTENT_GENERATOR_SYSTEM_PROMPT,
  COURSE_ARCHITECT_PROMPT,
  DIRECTOR_SYSTEM_PROMPT,
  FALLBACK_GUIDELINE,
  INTERJECTION_ANSWER_PROMPT,
  WHITEBOARD_INSTRUCTOR_PROMPT,
  buildDirectorUserPrompt,
  buildNextStepsPrompt,
  fallbackInterjectionAnswer,
  parseCourseStructure,
  parseInterjectionAnswer,
  parseLecturePlan,
  parseNextSteps,
  type CourseStructure,
  type InterjectionAnswer,
  type LecturePlan,
  type NextStepsData,
} from "./prompts";
import type { StreamChunk } from "./protocol";

export type ConversationHistory = Array<{ role: string; content: string }>;

// ── Director Agent(调度中枢)──────────────────────────────────────────────
// 原版只在非推理模型路径调用(Messages 协议路径用静态 guideline);保留实现以
// 维持 1:1 架构面,路由层按 isReasoning 语义不触发它。
export async function directorAnalyzeIntent(userQuery: string, history: ConversationHistory = []): Promise<string> {
  const messages: LlmMessage[] = [
    { role: "system", content: DIRECTOR_SYSTEM_PROMPT },
    ...history.slice(-4).map((entry) => ({ role: entry.role === "assistant" ? "assistant" : "user", content: entry.content }) as LlmMessage),
    { role: "user", content: buildDirectorUserPrompt(userQuery) },
  ];
  const guideline = await chat(messages, { maxTokens: 1024 });
  return guideline || FALLBACK_GUIDELINE;
}

// ── Content Generator(内容生成,流式)────────────────────────────────────
export async function* contentGenerateStream(
  userQuery: string,
  guideline: string,
  history: ConversationHistory = [],
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const messages: LlmMessage[] = [
    { role: "system", content: CONTENT_GENERATOR_SYSTEM_PROMPT },
    ...history.slice(-4).map((entry) => ({ role: entry.role === "assistant" ? "assistant" : "user", content: entry.content }) as LlmMessage),
    { role: "system", content: `[DIRECTOR GUIDELINE FOR THIS TURN]:\n${guideline}` },
    { role: "user", content: userQuery },
  ];
  yield* streamChat(messages, { signal });
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
export async function planLecture(topic: string, signal?: AbortSignal): Promise<LecturePlan> {
  const jsonStr = await chat(
    [
      { role: "system", content: WHITEBOARD_INSTRUCTOR_PROMPT },
      { role: "user", content: `Create a step-by-step whiteboard lecture for: "${topic}"` },
    ],
    { jsonMode: true, signal },
  ).catch(() => "");
  return parseLecturePlan(jsonStr, topic);
}

export async function answerInterjection(question: string, currentStep: unknown, signal?: AbortSignal): Promise<InterjectionAnswer> {
  const jsonStr = await chat(
    [
      { role: "system", content: INTERJECTION_ANSWER_PROMPT },
      { role: "user", content: `Current lecture step: "${JSON.stringify(currentStep)}"\nStudent interruption question: "${question}"` },
    ],
    { jsonMode: true, signal },
  ).catch(() => "");
  return jsonStr ? parseInterjectionAnswer(jsonStr) : fallbackInterjectionAnswer();
}

// ── Course Architect(三级课程大纲)────────────────────────────────────────
export async function generateCourse(query: string, signal?: AbortSignal): Promise<CourseStructure> {
  const jsonStr = await chat(
    [
      { role: "system", content: COURSE_ARCHITECT_PROMPT },
      { role: "user", content: `Design a comprehensive, structured course for: "${query}"` },
    ],
    { jsonMode: true, signal },
  ).catch(() => "");
  return parseCourseStructure(jsonStr, query);
}
