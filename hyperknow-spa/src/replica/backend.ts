/**
 * 同源 hyperknow 后端客户端。SPA 由同一 Worker 托管在 /lattice/,生产与 wrangler dev
 * 下相对路径 /api/hyperknow/* 直达真后端(LLM 生成);纯静态托管下 fetch 必然失败,
 * 返回 null,由调用方回退到伪生成/本地演示——两条路径共享同一套 UI。
 * SSE 帧格式:event: frame\ndata: {...}(与 Workers 路由的 frame() 逐字对应)。
 */

import { normalizeBackendCourse } from './backend-course.ts';

export interface BackendCourseSession {
  sessionId?: string;
  sessionIndex?: number;
  title: string;
  sessionTime?: number;
  depthTags?: string[];
}
export interface BackendCourseLecture {
  lectureId?: string;
  title: string;
  sessions?: BackendCourseSession[];
}
export interface BackendCourseUnit {
  unitId?: string;
  title: string;
  lectures: BackendCourseLecture[];
}
export interface BackendCourse {
  courseUuid?: string;
  courseTitle: string;
  courseDescription?: string;
  targetLearner?: string;
  tags?: string[];
  units: BackendCourseUnit[];
}

export type GenStepId = 'boot' | 'researching_the_web' | 'generating_initial_syllabus';

export interface CourseGenProgressData {
  round?: number;
  total_rounds?: number;
  sources?: number;
  status?: string;
  provider?: string;
  titles?: string[];
  links?: string[];
  reason?: string;
  keywords?: string[];
}

export interface CourseUnitProgressData {
  unit_index: number;
  total_units: number;
  unit_id?: string;
  title?: string;
  completed?: boolean;
  loading?: boolean;
  cached?: boolean;
}

export interface GenHandlers {
  onStep?: (stepId: GenStepId, status: 'loading' | 'completed', data?: Record<string, unknown>) => void;
  onProgress?: (message: string, data?: CourseGenProgressData) => void;
  onBlueprint?: (blueprint: BlueprintData, requiresConfirmation?: boolean, courseUuid?: string) => void;
  onUnitProgress?: (data: CourseUnitProgressData) => void;
  /** credit_status 帧:后端扣费后的真实余额(每日 20,课程 10/次) */
  onRemaining?: (remaining: number, max: number) => void;
}

export type CourseDepth = 'overview' | 'systematic' | 'deep';

export function normalizeDepth(depth?: string): CourseDepth {
  if (!depth) return 'systematic';
  const d = depth.trim().toLowerCase();
  if (d === 'overview' || d.includes('overview') || d.includes('通识') || d.includes('入门') || d.includes('速成')) {
    return 'overview';
  }
  if (d === 'deep' || d.includes('deep') || d.includes('严谨') || d.includes('工业') || d.includes('深度') || d.includes('学术')) {
    return 'deep';
  }
  return 'systematic';
}

export interface CourseBriefParams {
  version?: number;
  goal?: string;
  background?: string;
  duration?: string;
  depth?: CourseDepth | string;
  preference?: string;
  language?: string;
  visual?: string;
}

export interface InquiryQuestion {
  id: string;
  field: keyof Omit<CourseBriefParams, 'version'>;
  prompt: string;
  recommended: string;
  options: string[];
}

export interface InquiryResult {
  brief: CourseBriefParams;
  questions: InquiryQuestion[];
  followUpAllowed: boolean;
  followUpRound: number;
}

/** 课程前置问询与最多 2 轮智能追问 (带 5s 严格超时防卡死) */
export async function fetchCourseInquiry(args: {
  topic: string;
  brief?: CourseBriefParams;
  answers?: Record<string, string>;
  followUpRound?: number;
}): Promise<InquiryResult | null> {
  try {
    const timeout = AbortSignal.timeout(5000);
    const res = await fetch('/api/hyperknow/course-inquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: timeout,
    });
    if (!res.ok) return null;
    return (await res.json()) as InquiryResult;
  } catch {
    return null;
  }
}

export interface CourseGenParams {
  query?: string;
  brief?: CourseBriefParams;
  idempotencyKey?: string;
  resumeUuid?: string;
  action?: 'confirm_blueprint' | 'generate_units';
  selectedUnits?: string[];
  requireConfirmation?: boolean;
}

/** 在线调用失败原因:offline=静态托管/断网(可伪生成兜底);insufficient=积分不足(绝不可兜底);error=后端/上游故障。 */
export type LiveFailureReason = 'offline' | 'insufficient' | 'error';

export interface BlueprintData {
  courseTitle?: string;
  courseDescription?: string;
  targetLearner?: string;
  tags?: string[];
  totalUnits?: number;
  totalLectures?: number;
  totalSessions?: number;
  estimatedMinutes?: number;
  estimatedHours?: number;
  units?: Array<{
    unitId?: string;
    title?: string;
    prerequisites?: string[];
    objectives?: string[];
    completionCriteria?: string[];
    lectureCount?: number;
    sessionCount?: number;
    estimatedMinutes?: number;
  }>;
}

export type CourseGenResult =
  | { ok: true; course: BackendCourse }
  | { ok: true; blueprint: BlueprintData; courseUuid: string; requiresConfirmation: true }
  | { ok: false; reason: LiveFailureReason };

/** 解析一条 "data: {...}" 行;非 data 行返回 null。 */
function parseDataLine(line: string): Record<string, unknown> | null {
  if (!line.startsWith('data: ')) return null;
  const jsonStr = line.slice(6).trim();
  if (!jsonStr || jsonStr === '[DONE]') return null;
  try {
    const data: unknown = JSON.parse(jsonStr);
    return typeof data === 'object' && data !== null && !Array.isArray(data) ? data as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function consumeSse(body: ReadableStream<Uint8Array>, onFrame: (data: Record<string, unknown>) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const data = parseDataLine(line);
        if (data) onFrame(data);
      }
    }
    const tail = parseDataLine(buffer + decoder.decode());
    if (tail) onFrame(tail);
  } finally {
    reader.releaseLock();
  }
}

/** SSE 错误响应 → 失败原因二分:402 insufficient_credits 单独成类,其余归 error。 */
async function failureReason(res: Response): Promise<LiveFailureReason> {
  try {
    const json = (await res.json()) as { error?: unknown };
    if (json?.error === 'insufficient_credits') return 'insufficient';
  } catch {
    /* 非 JSON 错误体 */
  }
  return 'error';
}

/** 消费 credit_status 帧(后端扣费后的真实余额)。 */
function creditInfoOf(data: Record<string, unknown>): { remaining: number; max: number } | null {
  if (data.type !== 'credit_status') return null;
  const info = data.credit_info as { remaining?: unknown; max?: unknown } | undefined;
  if (!info || typeof info.remaining !== 'number' || typeof info.max !== 'number') return null;
  return { remaining: info.remaining, max: info.max };
}

/**
 * 真实课程生成。积分不足(insufficient)必须由调用方显式提示,绝不能落进伪生成
 * 兜底——否则"没积分"反而白拿一门假课。断网/静态托管(offline)才允许伪生成。
 */
export async function generateCourseLive(
  input: string | CourseGenParams,
  handlers: GenHandlers,
  signal?: AbortSignal,
): Promise<CourseGenResult> {
  const reqBody = typeof input === 'string' ? { query: input } : input;
  let res: Response;
  try {
    res = await fetch('/api/hyperknow/course-generation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(reqBody),
      signal,
    });
  } catch {
    return { ok: false, reason: 'offline' }; // 断网/静态托管
  }
  if (!res.ok) return { ok: false, reason: await failureReason(res) }; // 鉴权/限流/积分不足/未配置 AI
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('text/event-stream') || !res.body) return { ok: false, reason: 'error' };

  try {
    const found: {
      course: BackendCourse | null;
      blueprint: BlueprintData | null;
      courseUuid: string;
      requiresConfirmation: boolean;
      failed: boolean;
    } = { course: null, blueprint: null, courseUuid: '', requiresConfirmation: false, failed: false };

    await consumeSse(res.body, (data) => {
      const type = data.type as string | undefined;
      if (type === 'course_generation_step') {
        handlers.onStep?.(data.step_id as GenStepId, data.status as 'loading' | 'completed');
      } else if (type === 'course_generation_progress') {
        handlers.onProgress?.(String(data.message ?? ''), data.data as CourseGenProgressData | undefined);
      } else if (type === 'blueprint_ready') {
        const bp = data.blueprint as BlueprintData | undefined;
        const reqConfirm = Boolean(data.requires_confirmation);
        const uuid = String(data.course_uuid ?? '');
        if (bp) {
          found.blueprint = bp;
          found.courseUuid = uuid;
          found.requiresConfirmation = reqConfirm;
          handlers.onBlueprint?.(bp, reqConfirm, uuid);
        }
      } else if (type === 'course_unit_progress') {
        handlers.onUnitProgress?.(data.data as CourseUnitProgressData);
      } else if (type === 'course_structure_ready') {
        found.course = normalizeBackendCourse(data.course);
        if (!found.course) found.failed = true;
      } else if (type === 'course_generation_error' || type === 'error') {
        found.failed = true;
      } else {
        const info = creditInfoOf(data);
        if (info) handlers.onRemaining?.(info.remaining, info.max);
      }
    });

    if (found.failed) return { ok: false, reason: 'error' };
    if (found.course) return { ok: true, course: found.course };
    if (found.blueprint && found.requiresConfirmation) {
      return { ok: true, blueprint: found.blueprint, courseUuid: found.courseUuid, requiresConfirmation: true };
    }
    return { ok: false, reason: 'error' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export interface ChatHandlers {
  onChunk?: (text: string) => void;
  /** conversation_created 帧:后端为本条消息落库的会话 ID(续聊/历史列表回填用)。 */
  onConversationId?: (id: string) => void;
  /** credit_status 帧:后端扣费后的真实余额(每日 20,对话 2/次)。 */
  onRemaining?: (remaining: number, max: number) => void;
}

export type ChatResult = { ok: true; text: string } | { ok: false; reason: LiveFailureReason };

export interface ChatSendOptions {
  signal?: AbortSignal;
  /** 续聊的会话 ID(缺省开新会话) */
  conversationId?: string;
  /** 回复模式(standard/fast):原 WS 协议字段,透传后端 */
  mode?: string;
}

/** 真实主对话。传 conversationId 则续聊同一会话;失败按 reason 二分(见 LiveFailureReason)。 */
export async function chatLive(message: string, handlers: ChatHandlers, options: ChatSendOptions = {}): Promise<ChatResult> {
  let res: Response;
  try {
    res = await fetch('/api/hyperknow/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message,
        ...(options.conversationId ? { conversation_id: options.conversationId } : {}),
        ...(options.mode ? { mode: options.mode } : {}),
      }),
      signal: options.signal,
    });
  } catch {
    return { ok: false, reason: 'offline' };
  }
  if (!res.ok) return { ok: false, reason: await failureReason(res) };
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('text/event-stream') || !res.body) return { ok: false, reason: 'error' };

  try {
    let acc = '';
    let complete = false;
    let failed = false;
    await consumeSse(res.body, (data) => {
      const type = data.type;
      // 服务端 error 不得被之前的正文或之后的 complete 掩盖。
      if (type === 'error') {
        failed = true;
        return;
      }
      if (failed) return;
      if (type === 'complete') {
        complete = true;
        return;
      }
      if (complete) return;
      if (type === 'content_chunk' && typeof data.chunk === 'string' && data.chunk) {
        acc += data.chunk;
        handlers.onChunk?.(data.chunk);
      } else if (type === 'conversation_created' && typeof data.conversation_id === 'string') {
        handlers.onConversationId?.(data.conversation_id);
      } else {
        const info = creditInfoOf(data);
        if (info) handlers.onRemaining?.(info.remaining, info.max);
      }
    });
    return complete && !failed && acc.length ? { ok: true, text: acc } : { ok: false, reason: 'error' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export interface TranslateHandlers {
  onChunk?: (text: string) => void;
  onRemaining?: (remaining: number, max: number) => void;
}

/**
 * 真实翻译(不落库):把导师回复翻成目标语言,同样按对话计价(2 积分)。
 * 与 chatLive 共用 SSE 解析与失败二分。
 */
export async function translateLive(
  text: string,
  targetLanguage: string,
  handlers: TranslateHandlers,
  signal?: AbortSignal,
): Promise<ChatResult> {
  let res: Response;
  try {
    res = await fetch('/api/hyperknow/translate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, target_language: targetLanguage }),
      signal,
    });
  } catch {
    return { ok: false, reason: 'offline' };
  }
  if (!res.ok) return { ok: false, reason: await failureReason(res) };
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('text/event-stream') || !res.body) return { ok: false, reason: 'error' };

  try {
    let acc = '';
    let complete = false;
    let failed = false;
    await consumeSse(res.body, (data) => {
      const type = data.type;
      // 服务端 error 不得被之前的正文或之后的 complete 掩盖。
      if (type === 'error') {
        failed = true;
        return;
      }
      if (failed) return;
      if (type === 'complete') {
        complete = true;
        return;
      }
      if (complete) return;
      if (type === 'content_chunk' && typeof data.chunk === 'string' && data.chunk) {
        acc += data.chunk;
        handlers.onChunk?.(data.chunk);
      } else {
        const info = creditInfoOf(data);
        if (info) handlers.onRemaining?.(info.remaining, info.max);
      }
    });
    return complete && !failed && acc.length ? { ok: true, text: acc } : { ok: false, reason: 'error' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/* ---------------- 白板讲座计划(直播放适配器) ---------------- */

const ACTION_TYPES = ['card', 'formula', 'diagram', 'image', 'quick_check'] as const;

export interface LiveBoardAction {
  type: (typeof ACTION_TYPES)[number];
  title?: string;
  content?: string;
  latex?: string;
  code?: string;
  prompt?: string;
  caption?: string;
  url?: string;
  width?: number;
  height?: number;
  question?: string;
  options?: string[];
  answer?: number;
  nodes?: Array<{ id: string; label: string }>;
  edges?: Array<{ from: string; to: string; label?: string }>;
}

export interface LiveLectureStep {
  step_id: string;
  spoken_text: string;
  board_action: LiveBoardAction;
}

export interface LiveLecturePlan {
  session_id: string;
  topic: string;
  steps: LiveLectureStep[];
}

export interface PlanLectureParams {
  topic: string;
  courseUuid?: string;
  unitId?: string;
  lectureId?: string;
  sessionId?: string;
  language?: string;
}

/**
 * 真实白板讲座计划(原 WS whiteboard/ws 的无状态化端点,见 HYPERKNOW.md)。
 * 支持 courseUuid/unitId/lectureId/sessionId 严密锁定，拒绝默认第一讲。
 * 支持 language 字段供白板代理传入，默认 zh-CN。
 * 返回 null = 不可用(未登录/静态托管/限流/上游故障),调用方回退本地演示
 * 脚本——与其余端点同一双轨纪律。不扣积分(限流 20/h)。
 */
export async function planLectureLive(
  params: string | PlanLectureParams,
  signal?: AbortSignal,
): Promise<LiveLecturePlan | null> {
  const reqBody = typeof params === 'string'
    ? { topic: params, language: 'zh-CN' }
    : { language: 'zh-CN', ...params };
  let res: Response;
  try {
    res = await fetch('/api/hyperknow/whiteboard/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(reqBody),
      signal,
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    const json = (await res.json()) as { session_id?: unknown; topic?: unknown; steps?: unknown };
    if (!Array.isArray(json.steps) || !json.steps.length) return null;
    const steps: LiveLectureStep[] = [];
    for (const raw of json.steps) {
      const step = raw as Record<string, unknown>;
      if (typeof step.spoken_text !== 'string' || !step.spoken_text) continue;
      const action = (step.board_action ?? {}) as Record<string, unknown>;
      const type = String(action.type ?? 'card');
      const board_action: LiveBoardAction = {
        type: (ACTION_TYPES as readonly string[]).includes(type) ? (type as LiveBoardAction['type']) : 'card',
        ...(typeof action.title === 'string' && action.title ? { title: action.title } : {}),
        ...(typeof action.content === 'string' && action.content ? { content: action.content } : {}),
        ...(typeof action.latex === 'string' && action.latex ? { latex: action.latex } : {}),
        ...(typeof action.code === 'string' && action.code ? { code: action.code } : {}),
        ...(typeof action.prompt === 'string' && action.prompt ? { prompt: action.prompt } : {}),
        ...(typeof action.caption === 'string' && action.caption ? { caption: action.caption } : {}),
        ...(typeof action.url === 'string' && action.url ? { url: action.url } : {}),
        ...(typeof action.width === 'number' ? { width: action.width } : {}),
        ...(typeof action.height === 'number' ? { height: action.height } : {}),
        ...(typeof action.question === 'string' && action.question ? { question: action.question } : {}),
        ...(Array.isArray(action.options)
          ? { options: action.options.filter((o): o is string => typeof o === 'string' && !!o).slice(0, 4) }
          : {}),
        ...(typeof action.answer === 'number' ? { answer: action.answer } : {}),
      };
      steps.push({ step_id: String(step.step_id ?? `step_${steps.length + 1}`), spoken_text: step.spoken_text, board_action });
    }
    return steps.length
      ? { session_id: typeof json.session_id === 'string' ? json.session_id : '', topic: String(json.topic ?? reqBody.topic), steps }
      : null;
  } catch {
    return null;
  }
}

/* ---------------- 白板课堂按需生图(阶跃生图接入) ---------------- */

export interface FetchImageParams {
  prompt: string;
  caption?: string;
  courseUuid?: string;
  unitId?: string;
  lectureId?: string;
  sessionId?: string;
}

export interface FetchImageResult {
  url: string;
  caption?: string;
  width?: number;
  height?: number;
  cached?: boolean;
}

export async function fetchLectureImageLive(
  params: FetchImageParams,
  signal?: AbortSignal,
): Promise<FetchImageResult | null> {
  try {
    const res = await fetch('/api/hyperknow/whiteboard/image', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
      signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { url?: string; caption?: string; width?: number; height?: number; cached?: boolean };
    if (typeof json.url === 'string' && json.url) {
      return {
        url: json.url,
        caption: json.caption ?? params.caption,
        width: json.width,
        height: json.height,
        cached: json.cached,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/* ---------------- 白板举手插话(讲座进行中的自由提问) ---------------- */

export interface InterjectAnswer {
  answerText: string;
  /** 答疑结束、主线恢复前的过渡句(原 WS interject 的 resume 事件) */
  resumeTransition: string;
}

/**
 * 真实举手插话:按讲座会话取上下文答疑。返回 null = 不可用(未登录/静态托管/
 * 限流/上游故障),调用方给本地兜底反馈——绝不让提问静默落空。
 */
export async function interjectLive(
  sessionId: string,
  stepId: string,
  question: string,
  signal?: AbortSignal,
): Promise<InterjectAnswer | null> {
  let res: Response;
  try {
    res = await fetch('/api/hyperknow/whiteboard/interject', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, step_id: stepId, question: question.slice(0, 500) }),
      signal,
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    const json = (await res.json()) as { answer_text?: unknown; resume_transition?: unknown };
    if (typeof json.answer_text !== 'string' || !json.answer_text) return null;
    return { answerText: json.answer_text, resumeTransition: typeof json.resume_transition === 'string' ? json.resume_transition : '' };
  } catch {
    return null;
  }
}

/* ---------------- 课程市场与课程详情(D1 持久化) ---------------- */

export interface MarketCourse {
  /** 本人生成的课程(uuid 越权不可见);官方样例只有 marketplaceId */
  uuid: string | null;
  marketId: string;
  title: string;
  description: string;
  unitCount: number | null;
  sessionCount: number | null;
  joinCount: number | null;
}

/**
 * 课程市场列表:本人 D1 课程在前、两条官方样例在后(后端 1:1 复刻原版形状)。
 * 返回 null = 不可用(纯静态托管/未登录),调用方回退演示卡片。
 */
export async function fetchMarketCourses(): Promise<MarketCourse[] | null> {
  let res: Response;
  try {
    res = await fetch('/api/hyperknow/marketplace/courses');
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    const json = (await res.json()) as { success?: boolean; courses?: unknown };
    if (!json.success || !Array.isArray(json.courses)) return null;
    const rows: MarketCourse[] = [];
    for (const raw of json.courses) {
      const c = raw as Record<string, unknown>;
      const title = typeof c.courseTitle === 'string' ? c.courseTitle : '';
      const uuid = typeof c.courseUuid === 'string' && c.courseUuid ? c.courseUuid : null;
      const marketId = uuid ?? (typeof c.marketplaceId === 'string' ? c.marketplaceId : '');
      if (!title || !marketId) continue;
      /* 本人课程带完整 units 树:节数按 session(最小可学单元)现算,与详情页一致;
       * 官方样例带服务端现算的 sessionCount/joinCount */
      let sessionCount: number | null = typeof c.sessionCount === 'number' ? c.sessionCount : null;
      if (sessionCount === null && Array.isArray(c.units)) {
        sessionCount = (c.units as Array<{ lectures?: Array<{ sessions?: unknown[] }> }>).reduce(
          (n, u) =>
            n +
            (Array.isArray(u.lectures)
              ? u.lectures.reduce((m, l) => m + (Array.isArray(l?.sessions) ? l.sessions.length : 0), 0)
              : 0),
          0,
        );
      }
      rows.push({
        uuid,
        marketId,
        title,
        description: typeof c.courseDescription === 'string' ? c.courseDescription : '',
        unitCount: typeof c.unitCount === 'number' ? c.unitCount : Array.isArray(c.units) ? (c.units as unknown[]).length : null,
        sessionCount,
        joinCount: typeof c.joinCount === 'number' ? c.joinCount : null,
      });
    }
    return rows;
  } catch {
    return null;
  }
}

/** 课程详情(本人归属;越权/不存在 404)。不可用返回 null。 */
export async function fetchCourseDetail(uuid: string, signal?: AbortSignal): Promise<BackendCourse | null> {
  let res: Response;
  try {
    res = await fetch(`/api/hyperknow/courses/${encodeURIComponent(uuid)}`, { signal });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    const json = (await res.json()) as { success?: boolean; data?: unknown };
    return json?.success ? normalizeBackendCourse(json.data) : null;
  } catch {
    return null;
  }
}

/** 后端连通性探测:返回往返毫秒数;不可达返回 null(状态面板用)。 */
export async function pingBackend(): Promise<number | null> {
  const started = performance.now();
  try {
    const res = await fetch('/api/hyperknow/auth/get_user_info', { cache: 'no-store' });
    await res.json().catch(() => null);
    if (!res.ok) return null;
    return Math.round(performance.now() - started);
  } catch {
    return null;
  }
}

/* ---------------- 模型探针(白板连接面板"检查模型状态") ---------------- */

export type ModelCheckResult =
  | { ok: true; latencyMs: number }
  | { ok: false; reason: 'model_down' | 'probe_failed' | 'unauthorized' };

/** 一次最小代价的真实模型调用;不扣积分、不落库(见后端 /model-check 注释)。 */
export async function modelCheck(): Promise<ModelCheckResult> {
  try {
    const res = await fetch('/api/hyperknow/model-check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'unauthorized' };
    const data = (await res.json().catch(() => null)) as { ok?: boolean; latency_ms?: number; error?: string } | null;
    if (res.ok && data?.ok && typeof data.latency_ms === 'number') return { ok: true, latencyMs: data.latency_ms };
    if (data?.error === 'ai_upstream_error' || data?.error === 'no_answer' || data?.error === 'ai_rate_limited') {
      return { ok: false, reason: 'model_down' };
    }
    return { ok: false, reason: 'probe_failed' };
  } catch {
    return { ok: false, reason: 'probe_failed' };
  }
}

/* ---------------- 造场账户身份与历史(后端按会话成员隔离) ---------------- */
export interface MeInfo {
  username: string;
  email: string;
  tier: string;
  credits: number;
}

/** 当前登录成员身份(造场会话);纯静态托管/未登录下返回 null,由调用方回退演示数据。 */
export async function fetchMe(): Promise<MeInfo | null> {
  let res: Response;
  try {
    res = await fetch('/api/hyperknow/auth/get_user_info');
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    const json = (await res.json()) as {
      success?: boolean;
      data?: { username?: string; email?: string; subscription?: { tier?: string; remaining_credits?: number } };
    };
    if (!json.success || !json.data?.email) return null;
    return {
      username: json.data.username || json.data.email,
      email: json.data.email,
      tier: json.data.subscription?.tier || 'FREE',
      credits: json.data.subscription?.remaining_credits ?? 20,
    };
  } catch {
    return null;
  }
}

export interface ConvMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface ConvRow {
  id: string;
  title: string;
  updatedAt: string;
  messages: ConvMessage[];
}

/** 当前成员的历史会话列表(按造场账户隔离);不可用时返回 null。 */
export async function fetchConversations(): Promise<ConvRow[] | null> {
  let res: Response;
  try {
    res = await fetch('/api/hyperknow/conversations/list_past_conversations');
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    const json = (await res.json()) as {
      conversations?: Array<{
        conversation_id?: unknown;
        title?: unknown;
        last_updated_at?: unknown;
        history?: unknown;
      }>;
    };
    const rows: ConvRow[] = [];
    for (const c of json.conversations ?? []) {
      if (typeof c.conversation_id !== 'string' || !c.conversation_id) continue;
      const messages: ConvMessage[] = Array.isArray(c.history)
        ? (c.history as Array<{ role?: unknown; content?: unknown }>)
            .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .map((m) => ({ role: m.role as 'user' | 'assistant', text: m.content as string }))
        : [];
      rows.push({
        id: c.conversation_id,
        title: typeof c.title === 'string' && c.title ? c.title : '(untitled)',
        updatedAt: typeof c.last_updated_at === 'string' ? c.last_updated_at : '',
        messages,
      });
    }
    return rows;
  } catch {
    return null;
  }
}
