/**
 * 同源 hyperknow 后端客户端。SPA 由同一 Worker 托管在 /lattice/,生产与 wrangler dev
 * 下相对路径 /api/hyperknow/* 直达真后端(LLM 生成);纯静态托管下 fetch 必然失败,
 * 返回 null,由调用方回退到伪生成/本地演示——两条路径共享同一套 UI。
 * SSE 帧格式:event: frame\ndata: {...}(与 Workers 路由的 frame() 逐字对应)。
 */

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
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function consumeSse(body: ReadableStream<Uint8Array>, onFrame: (data: Record<string, unknown>) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
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
  const tail = parseDataLine(buffer);
  if (tail) onFrame(tail);
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
    const found: { course: BackendCourse | null } = { course: null };
    await consumeSse(res.body, (data) => {
      const type = data.type as string | undefined;
      if (type === 'course_generation_step') {
        handlers.onStep?.(data.step_id as GenStepId, data.status as 'loading' | 'completed');
      } else if (type === 'course_generation_progress') {
        handlers.onProgress?.(String(data.message ?? ''));
      } else if (type === 'course_structure_ready') {
        found.course = (data.course as BackendCourse) ?? null;
      } else if (type === 'course_generation_error') {
        found.course = null;
      } else {
        const info = creditInfoOf(data);
        if (info) handlers.onRemaining?.(info.remaining, info.max);
      }
    });
    const course = found.course;
    return course && course.units?.length ? { ok: true, course } : { ok: false, reason: 'error' };
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
    await consumeSse(res.body, (data) => {
      const type = data.type as string | undefined;
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
    return acc.length ? { ok: true, text: acc } : { ok: false, reason: 'error' };
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
    await consumeSse(res.body, (data) => {
      const type = data.type as string | undefined;
      if (type === 'content_chunk' && typeof data.chunk === 'string' && data.chunk) {
        acc += data.chunk;
        handlers.onChunk?.(data.chunk);
      } else {
        const info = creditInfoOf(data);
        if (info) handlers.onRemaining?.(info.remaining, info.max);
      }
    });
    return acc.length ? { ok: true, text: acc } : { ok: false, reason: 'error' };
  } catch {
    return { ok: false, reason: 'error' };
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
