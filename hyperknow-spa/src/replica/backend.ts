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

export interface GenHandlers {
  onStep?: (stepId: GenStepId, status: 'loading' | 'completed') => void;
  onProgress?: (message: string) => void;
  /** credit_status 帧:后端扣费后的真实余额(每日 20,课程 10/次) */
  onRemaining?: (remaining: number, max: number) => void;
}

/** 在线调用失败原因:offline=静态托管/断网(可伪生成兜底);insufficient=积分不足(绝不可兜底);error=后端/上游故障。 */
export type LiveFailureReason = 'offline' | 'insufficient' | 'error';

export type CourseGenResult = { ok: true; course: BackendCourse } | { ok: false; reason: LiveFailureReason };

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
export async function generateCourseLive(query: string, handlers: GenHandlers, signal?: AbortSignal): Promise<CourseGenResult> {
  let res: Response;
  try {
    res = await fetch('/api/hyperknow/course-generation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
      signal,
    });
  } catch {
    return { ok: false, reason: 'offline' }; // 断网/静态托管
  }
  if (!res.ok) return { ok: false, reason: await failureReason(res) }; // 鉴权/限流/积分不足/未配置 AI
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('text/event-stream') || !res.body) return { ok: false, reason: 'error' };

  try {
    /* 用容器规避 TS 对闭包内赋值的收窄(直接 let 会被推断为 never) */
    const found: { course: BackendCourse | null; failed: boolean } = { course: null, failed: false };
    await consumeSse(res.body, (data) => {
      const type = data.type as string | undefined;
      if (type === 'course_generation_step') {
        handlers.onStep?.(data.step_id as GenStepId, data.status as 'loading' | 'completed');
      } else if (type === 'course_generation_progress') {
        handlers.onProgress?.(String(data.message ?? ''));
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
    const course = found.course;
    return course && !found.failed ? { ok: true, course } : { ok: false, reason: 'error' };
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

export interface LiveBoardAction {
  type: 'card' | 'formula' | 'diagram' | 'quick_check';
  title?: string;
  content?: string;
  latex?: string;
  code?: string;
  question?: string;
  options?: string[];
  answer?: number;
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

const ACTION_TYPES = ['card', 'formula', 'diagram', 'quick_check'] as const;

/**
 * 真实白板讲座计划(原 WS whiteboard/ws 的无状态化端点,见 HYPERKNOW.md)。
 * 返回 null = 不可用(未登录/静态托管/限流/上游故障),调用方回退本地演示
 * 脚本——与其余端点同一双轨纪律。不扣积分(限流 20/h)。
 */
export async function planLectureLive(topic: string, signal?: AbortSignal): Promise<LiveLecturePlan | null> {
  let res: Response;
  try {
    res = await fetch('/api/hyperknow/whiteboard/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic }),
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
        ...(typeof action.question === 'string' && action.question ? { question: action.question } : {}),
        ...(Array.isArray(action.options)
          ? { options: action.options.filter((o): o is string => typeof o === 'string' && !!o).slice(0, 4) }
          : {}),
        ...(typeof action.answer === 'number' ? { answer: action.answer } : {}),
      };
      steps.push({ step_id: String(step.step_id ?? `step_${steps.length + 1}`), spoken_text: step.spoken_text, board_action });
    }
    return steps.length
      ? { session_id: typeof json.session_id === 'string' ? json.session_id : '', topic: String(json.topic ?? topic), steps }
      : null;
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
      /* 本人课程带完整 units 树:课节数现算;官方样例带 sessionCount/joinCount */
      let sessionCount: number | null = typeof c.sessionCount === 'number' ? c.sessionCount : null;
      if (sessionCount === null && Array.isArray(c.units)) {
        sessionCount = (c.units as Array<{ lectures?: unknown[] }>).reduce(
          (n, u) => n + (Array.isArray(u.lectures) ? u.lectures.length : 0),
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
