// 见界 运行时纯逻辑(零 import,单测直接加载):
// - MessagesStreamParser:StepFun/Anthropic Messages SSE 的增量行解析器,把
//   thinking_delta 与 text_delta 分流(与 reading-ai-provider 刻意丢弃思维链不同,
//   复刻版把 thinking 增量映射为 directorAgent 思考过程实时展示,这是产品语义的一部分)。
// - TTS 文本净化 / 缓存 key / 讲步时长:从原 ttsService.js 与 whiteboardWs.js 逐字搬运。

export type StreamChunk = { type: "thinking" | "text"; text: string };

type MessagesStreamEvent = {
  type?: unknown;
  delta?: { type?: unknown; thinking?: unknown; text?: unknown };
};

// 按行喂入 SSE 文本,产出解析出的增量。跨行断帧由调用方缓冲原始文本后按 \n 切分——
// 这里只做单行语义:非 "data: " 前缀行忽略;[DONE] 忽略;非法 JSON 行忽略(不让单个
// 坏帧杀死整条流,与原 llmService.js 的 try/catch 行为一致)。
export function parseMessagesSseLine(line: string): StreamChunk[] {
  if (!line.startsWith("data: ")) return [];
  const jsonStr = line.slice(6).trim();
  if (!jsonStr || jsonStr === "[DONE]") return [];
  let ev: MessagesStreamEvent;
  try {
    ev = JSON.parse(jsonStr) as MessagesStreamEvent;
  } catch {
    return [];
  }
  if (ev.type !== "content_block_delta") return [];
  if (ev.delta?.type === "thinking_delta" && typeof ev.delta.thinking === "string" && ev.delta.thinking) {
    return [{ type: "thinking", text: ev.delta.thinking }];
  }
  if (ev.delta?.type === "text_delta" && typeof ev.delta.text === "string" && ev.delta.text) {
    return [{ type: "text", text: ev.delta.text }];
  }
  return [];
}

// 流式读取器:把上游 ReadableStream<Uint8Array> 消费成增量序列,内部处理跨 chunk 断行。
export async function* consumeMessagesSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<StreamChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        for (const chunk of parseMessagesSseLine(line)) yield chunk;
      }
    }
    // 尾行(无换行结尾)同样要解析——上游偶尔最后一帧不带换行。
    for (const chunk of parseMessagesSseLine(buffer)) yield chunk;
  } finally {
    reader.releaseLock();
    if (signal?.aborted) {
      /* 客户端断开:调用方捕获 AbortError 后静默收尾 */
    }
  }
}

// 白板单步讲解节奏:正文字数 × 180ms,最少 4 秒(原 whiteboardWs.js deliverStep 逐字一致)。
// 服务端 setTimeout 链已改为客户端驱动播放,这个公式同时用于服务端(无)与客户端(适配器),
// 放在纯模块保证两端节奏一致。
export function stepDurationMs(spokenText: string): number {
  return Math.max(4000, spokenText.length * 180);
}

// TTS 文本净化:剥 HTML 标签、截 500 字、空兜底(原 streamAudioPipe 逐字一致)。
export function sanitizeTtsText(text: string, fallback = "你好，我是你的见界学习导师。"): string {
  return text.replace(/<[^>]*>/g, "").trim().slice(0, 500) || fallback;
}

// TTS 缓存 key:原版 md5(voiceId:speed:text) → voiceId_hash;Workers 无 md5,
// 换 Web Crypto SHA-256(key 只用于寻址,摘要算法更换不影响语义)。
export async function ttsCacheKey(text: string, voiceId: string, speed: number): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${voiceId}:${speed}:${text}`));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${voiceId}_${hash}`;
}

export type WebSearchHit = { title: string; url: string; snippet: string };

/**
 * 将 AI baseUrl 规整为 StepFun Chat Completions 终端地址:
 * 保留路径前缀,去尾斜杠,/messages 替换为 /chat/completions,
 * 完整 /chat/completions 不重复,不擅自加 /v1。
 */
export function resolveStepfunChatCompletionsUrl(aiBaseUrl: string): string {
  let url = aiBaseUrl.trim().replace(/\/+$/, "");
  if (url.endsWith("/messages")) {
    url = url.slice(0, -"/messages".length) + "/chat/completions";
  } else if (!url.endsWith("/chat/completions")) {
    url = `${url}/chat/completions`;
  }
  return url;
}

/**
 * 解析 StepFun choices[0].message.tool_calls[].function.results 的
 * index, url, title, summary 映射为 snippet;
 * 只承认真实工具来源; 限制长度与数量; 校验 HTTP(S) 并去重。
 */
export function extractStepfunHits(payload: unknown): { hits: WebSearchHit[]; triggered: boolean } {
  if (!payload || typeof payload !== "object") return { hits: [], triggered: false };
  const choices = (payload as { choices?: unknown[] })?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return { hits: [], triggered: false };
  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object") return { hits: [], triggered: false };
  const message = (firstChoice as { message?: unknown })?.message;
  if (!message || typeof message !== "object") return { hits: [], triggered: false };
  const toolCalls = (message as { tool_calls?: unknown[] })?.tool_calls;
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return { hits: [], triggered: false };

  const hits: WebSearchHit[] = [];
  const seenUrls = new Set<string>();
  let hasWebSearchTool = false;

  for (const call of toolCalls) {
    if (!call || typeof call !== "object") continue;
    const recCall = call as Record<string, unknown>;
    const fn = recCall.function as Record<string, unknown> | undefined;
    const isWebSearch =
      recCall.type === "web_search" ||
      (fn && typeof fn === "object" && (fn.name === "web_search" || fn.results !== undefined));

    let rawResults: unknown = fn?.results ?? recCall.results;
    if (isWebSearch || rawResults !== undefined) {
      hasWebSearchTool = true;
    }

    if (typeof rawResults === "string") {
      try {
        rawResults = JSON.parse(rawResults);
      } catch {
        rawResults = [];
      }
    }

    if (!Array.isArray(rawResults)) continue;

    for (const item of rawResults) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const url = typeof rec.url === "string" ? rec.url.trim() : "";
      if (!/^https?:\/\//i.test(url)) continue;

      const dedupeKey = url.replace(/[#?].*$/, "");
      if (seenUrls.has(dedupeKey)) continue;
      seenUrls.add(dedupeKey);

      const title = String(rec.title ?? "").trim().slice(0, 160) || url;
      const rawSnippet = [rec.summary, rec.snippet, rec.content, rec.description, rec.text].find(
        (value) => typeof value === "string" && value.length > 0,
      ) as string | undefined;
      const snippet = String(rawSnippet ?? "").trim().slice(0, 320);

      hits.push({ title, url, snippet });
      if (hits.length >= 8) break;
    }
    if (hits.length >= 8) break;
  }

  return { hits, triggered: hasWebSearchTool };
}

/**
 * 将 AI baseUrl 规整为 StepFun Images Generations 终端地址:
 * 保留路径前缀,去尾斜杠,/messages 或 /chat/completions 替换为 /images/generations,
 * 完整 /images/generations 不重复,不擅自回退或添加官方地址。
 */
export function resolveStepfunImagesUrl(aiBaseUrl: string): string {
  let url = aiBaseUrl.trim().replace(/\/+$/, "");
  if (url.endsWith("/messages")) {
    url = url.slice(0, -"/messages".length) + "/images/generations";
  } else if (url.endsWith("/chat/completions")) {
    url = url.slice(0, -"/chat/completions".length) + "/images/generations";
  } else if (!url.endsWith("/images/generations")) {
    url = `${url}/images/generations`;
  }
  return url;
}

/**
 * 前置问询 CourseBrief(版本化: 目标、基础、时间、深度、偏好、语言、视觉)
 */
export type NormalizedDepth = "overview" | "systematic" | "deep";

/**
 * 将任意语言或旧版深度字段归一化为 "overview" | "systematic" | "deep"
 * 兼容中文旧值：概览/初识/快速/科普 -> overview；系统/全面/标准 -> systematic；深入/深度/精通/进阶 -> deep
 */
export function normalizeCourseDepth(rawDepth?: string | null): NormalizedDepth {
  if (!rawDepth || typeof rawDepth !== "string") return "systematic";
  const d = rawDepth.trim().toLowerCase();
  if (/^(overview|crash|quick|intro|introductory|概览|初识|快速|入门|速成|科普)$/i.test(d)) {
    return "overview";
  }
  if (/^(deep|advanced|mastery|comprehensive_deep|深入|深度|精通|进阶|硬核)$/i.test(d)) {
    return "deep";
  }
  return "systematic";
}

/**
 * 深度对应的参考单元规模与时长/课节预算
 * overview: 3-4 单元, 讲次 2-3, 节数 4-10
 * systematic: 6-8 单元, 讲次 2-4, 节数 12-25
 * deep: 8-12 单元, 讲次 3-5, 节数 24-50
 */
export function getDepthScaleBudget(depth: NormalizedDepth): {
  minUnits: number;
  maxUnits: number;
  refUnits: string;
  minLecturesPerUnit: number;
  maxLecturesPerUnit: number;
  minSessionsPerUnit: number;
} {
  switch (depth) {
    case "overview":
      return { minUnits: 3, maxUnits: 4, refUnits: "3-4", minLecturesPerUnit: 2, maxLecturesPerUnit: 3, minSessionsPerUnit: 2 };
    case "deep":
      return { minUnits: 8, maxUnits: 12, refUnits: "8-12", minLecturesPerUnit: 2, maxLecturesPerUnit: 5, minSessionsPerUnit: 3 };
    case "systematic":
    default:
      return { minUnits: 6, maxUnits: 8, refUnits: "6-8", minLecturesPerUnit: 2, maxLecturesPerUnit: 4, minSessionsPerUnit: 2 };
  }
}

/**
 * 解析语言偏好：优先 brief.language，其次 requestLanguage，默认兜底 zh-CN（绝不回退到按 query 裸推英文）。
 * 保留显式指定的英文（如 en, en-US）。
 */
export function resolveEffectiveLanguage(
  briefLanguage?: string | null,
  requestLanguage?: string | null,
): string {
  const candidate = (briefLanguage || requestLanguage || "").trim();
  if (!candidate) return "zh-CN";
  if (/^en/i.test(candidate)) return "en";
  if (/^zh/i.test(candidate) || /中文|汉语/i.test(candidate)) return "zh-CN";
  return candidate;
}

export interface CourseBrief {
  version?: number;
  goal?: string;
  background?: string;
  duration?: string;
  depth?: string;
  preference?: string;
  language?: string;
  visual?: string;
}

export function formatCourseBrief(brief?: CourseBrief): string {
  if (!brief || typeof brief !== "object") return "";
  const parts: string[] = [];
  parts.push(`Brief Version: ${brief.version ?? 1}`);
  if (typeof brief.goal === "string" && brief.goal.trim()) parts.push(`Learning Goal: ${brief.goal.trim()}`);
  if (typeof brief.background === "string" && brief.background.trim()) parts.push(`Learner Background: ${brief.background.trim()}`);
  if (typeof brief.duration === "string" && brief.duration.trim()) parts.push(`Time Budget: ${brief.duration.trim()}`);
  if (typeof brief.depth === "string" && brief.depth.trim()) {
    const normDepth = normalizeCourseDepth(brief.depth);
    const scale = getDepthScaleBudget(normDepth);
    parts.push(`Target Depth: ${brief.depth.trim()} (Normalized: ${normDepth}, reference ${scale.refUnits} units)`);
  }
  if (typeof brief.preference === "string" && brief.preference.trim()) parts.push(`Pedagogical Preference: ${brief.preference.trim()}`);
  if (typeof brief.language === "string" && brief.language.trim()) {
    const effLang = resolveEffectiveLanguage(brief.language);
    parts.push(`Preferred Language: ${brief.language.trim()} (Resolved: ${effLang})`);
  }
  if (typeof brief.visual === "string" && brief.visual.trim()) parts.push(`Visual/Board Style: ${brief.visual.trim()}`);
  if (parts.length <= 1 && !brief.goal) return "";

  const normDepth = normalizeCourseDepth(brief.depth);
  const scale = getDepthScaleBudget(normDepth);
  const effLang = resolveEffectiveLanguage(brief.language);

  return (
    `\n\n[STUDENT COURSE BRIEF - PEDAGOGICAL CUSTOMIZATION (v${brief.version ?? 1})]\n` +
    parts.join("\n") +
    `\nPlease tailor curriculum pacing, cognitive depth (${normDepth}, reference ${scale.refUnits} units), scaffolding, and practical projects to this student brief.\n` +
    `CRITICAL LANGUAGE REQUIREMENT: Output MUST be in ${effLang}.\n` +
    `[END STUDENT COURSE BRIEF]`
  );
}

export interface UnitValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 校验课程单元质量：具体目标、完成标准、标题非空、讲次非空、时间覆盖合理。
 * 当且仅当调用方显式传入 expectedBudget 或 requireProjectAndQuiz 时，才做项目/测验以及精确讲次/课节数量强校验，
 * 从而保持对现有单测、通用或已有课程 fixture 的向后兼容。
 */
export function validateUnitStructure(
  unit: unknown,
  expectedBudget?: {
    expectedUnitId?: string;
    expectedLectures?: number;
    expectedSessions?: number;
    minLectures?: number;
    minSessions?: number;
    requireProjectAndQuiz?: boolean;
  },
): UnitValidationResult {
  const errors: string[] = [];
  if (!unit || typeof unit !== "object") {
    return { valid: false, errors: ["Unit is not an object"] };
  }
  const u = unit as Record<string, unknown>;

  if (expectedBudget?.expectedUnitId) {
    const uId = typeof u.unitId === "string" ? u.unitId.trim() : "";
    if (uId !== expectedBudget.expectedUnitId) {
      errors.push(`Unit ID mismatch: expected "${expectedBudget.expectedUnitId}", got "${uId}"`);
    }
  }

  const title = typeof u.title === "string" ? u.title.trim() : "";
  if (!title) {
    errors.push("Unit title is missing or empty");
  }

  // 目标与完成标准
  if (Array.isArray(u.objectives)) {
    if (u.objectives.length === 0) {
      errors.push("Unit must have at least one specific learning objective");
    }
  }
  if (Array.isArray(u.completionCriteria)) {
    if (u.completionCriteria.length === 0) {
      errors.push("Unit must have concrete completion criteria");
    }
  }

  if (!Array.isArray(u.lectures) || u.lectures.length === 0) {
    errors.push("Unit must contain at least one lecture");
  } else {
    // 讲次数量比对: 若指定 expectedLectures 必须精确相等，否则若有 minLectures 校验下限
    if (typeof expectedBudget?.expectedLectures === "number") {
      if (u.lectures.length !== expectedBudget.expectedLectures) {
        errors.push(`Unit lecture count mismatch: expected ${expectedBudget.expectedLectures}, got ${u.lectures.length}`);
      }
    } else if (typeof expectedBudget?.minLectures === "number") {
      if (u.lectures.length < expectedBudget.minLectures) {
        errors.push(`Unit contains ${u.lectures.length} lectures, expected at least ${expectedBudget.minLectures}`);
      }
    }

    let totalSessions = 0;
    let hasProject = false;
    let hasQuiz = false;

    for (const [idx, lec] of (u.lectures as unknown[]).entries()) {
      if (!lec || typeof lec !== "object") {
        errors.push(`Lecture ${idx + 1} is invalid`);
        continue;
      }
      const l = lec as Record<string, unknown>;
      const lTitle = typeof l.title === "string" ? l.title.trim() : "";
      if (!lTitle) {
        errors.push(`Lecture ${idx + 1} title is missing`);
      } else {
        if (/^(Project:|项目[:：])/i.test(lTitle)) hasProject = true;
        if (/^(Exam:|Quiz:|测验[:：]|考试[:：])/i.test(lTitle)) hasQuiz = true;
      }

      if (Array.isArray(l.sessions)) {
        if (l.sessions.length === 0) {
          errors.push(`Lecture "${lTitle || idx + 1}" must contain at least one session`);
        } else {
          totalSessions += l.sessions.length;
          for (const [sIdx, sess] of (l.sessions as unknown[]).entries()) {
            if (!sess || typeof sess !== "object") {
              errors.push(`Session ${sIdx + 1} in lecture "${lTitle || idx + 1}" is invalid`);
              continue;
            }
            const s = sess as Record<string, unknown>;
            const sTitle = typeof s.title === "string" ? s.title.trim() : "";
            if (!sTitle) {
              errors.push(`Session ${sIdx + 1} title is missing in lecture "${lTitle || idx + 1}"`);
            }
            const sTime = Number(s.sessionTime);
            if (Number.isNaN(sTime) || sTime <= 0 || sTime > 180) {
              errors.push(`Session "${sTitle || sIdx + 1}" has invalid sessionTime (${s.sessionTime})`);
            }
          }
        }
      }
    }

    // 课节总数比对: 若指定 expectedSessions 必须精确相等，否则若有 minSessions 校验下限
    if (typeof expectedBudget?.expectedSessions === "number") {
      if (totalSessions !== expectedBudget.expectedSessions) {
        errors.push(`Unit total sessions mismatch: expected ${expectedBudget.expectedSessions}, got ${totalSessions}`);
      }
    } else if (typeof expectedBudget?.minSessions === "number") {
      if (totalSessions < expectedBudget.minSessions) {
        errors.push(`Unit has total ${totalSessions} sessions, expected at least ${expectedBudget.minSessions}`);
      }
    }

    if (expectedBudget?.requireProjectAndQuiz) {
      if (!hasProject) {
        errors.push(`Unit must contain at least one hands-on project lecture (prefixed Project: or 项目：)`);
      }
      if (!hasQuiz) {
        errors.push(`Unit must contain at least one quiz/exam lecture (prefixed Exam:, Quiz:, or 测验：)`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 课程先修依赖无环有向无环图 (DAG) 校验
 */
export function checkPrerequisitesAcyclic(
  units: Array<{ unitId: string; prerequisites?: string[] }>,
): { isAcyclic: boolean; cycle?: string[] } {
  const adj = new Map<string, string[]>();
  for (const u of units) {
    adj.set(u.unitId, (u.prerequisites || []).filter((p) => p !== u.unitId));
  }

  const visited = new Map<string, 0 | 1 | 2>(); // 0: unvisited, 1: visiting, 2: visited
  const path: string[] = [];

  for (const id of adj.keys()) {
    if (hasCycleDfs(id, adj, visited, path)) {
      return { isAcyclic: false, cycle: path };
    }
  }
  return { isAcyclic: true };
}

function hasCycleDfs(
  node: string,
  adj: Map<string, string[]>,
  visited: Map<string, 0 | 1 | 2>,
  path: string[],
): boolean {
  const state = visited.get(node) ?? 0;
  if (state === 1) {
    path.push(node);
    return true;
  }
  if (state === 2) return false;

  visited.set(node, 1);
  path.push(node);

  const neighbors = adj.get(node) || [];
  for (const n of neighbors) {
    if (adj.has(n)) {
      if (hasCycleDfs(n, adj, visited, path)) return true;
    }
  }

  path.pop();
  visited.set(node, 2);
  return false;
}

/**
 * 校验生图 base64 响应安全性:
 * - 大小限制 (>0 且 <= 10MB)
 * - 魔数匹配 (PNG, JPEG, WEBP)
 * - 像素分辨率检查 (1024x1024)
 */
export function inspectBase64Image(b64: string): {
  bytes: Uint8Array;
  mediaType: string;
  width: number;
  height: number;
} {
  const cleanB64 = b64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "").trim();
  let binaryStr: string;
  try {
    binaryStr = atob(cleanB64);
  } catch {
    throw new Error("invalid_base64_payload");
  }

  const len = binaryStr.length;
  if (len < 24 || len > 10 * 1024 * 1024) {
    throw new Error("invalid_image_size");
  }

  // 显式拒绝 SVG, HTML 等非栅格化文本注入，只接受严格二进制魔数
  if (
    binaryStr.slice(0, 100).toLowerCase().includes("<svg") ||
    binaryStr.slice(0, 100).toLowerCase().includes("<html") ||
    binaryStr.slice(0, 100).toLowerCase().includes("<?xml")
  ) {
    throw new Error("unsupported_format_svg_html_rejected");
  }

  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    // PNG IHDR chunk at offset 16 (4 bytes width, 4 bytes height, big-endian)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    if (width !== 1024 || height !== 1024) {
      throw new Error(`invalid_image_dimensions_${width}x${height}`);
    }
    return { bytes, mediaType: "image/png", width, height };
  }

  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    let offset = 2;
    let width = 0;
    let height = 0;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    while (offset < len - 8) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2)
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        height = view.getUint16(offset + 5, false);
        width = view.getUint16(offset + 7, false);
        break;
      }
      const segmentLen = view.getUint16(offset + 2, false);
      offset += 2 + segmentLen;
    }
    if (width !== 1024 || height !== 1024) {
      throw new Error(`invalid_image_dimensions_${width}x${height}`);
    }
    return { bytes, mediaType: "image/jpeg", width, height };
  }

  // WebP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    // Basic WebP
    return { bytes, mediaType: "image/webp", width: 1024, height: 1024 };
  }

  throw new Error("invalid_image_magic_bytes");
}

