/**
 * 白板讲次预生成:课程旅程页就绪(已加入+真课)就为目标讲次后台请求 whiteboard/plan
 * (LLM ~40-60s);plan 一到手立刻链式预热:
 *   1) 旁白 TTS —— 全部小节,前两条立即(起讲就要),其余错峰 1.2s/条(防并发打满合成);
 *   2) 讲座配图 —— 计划含 image 步即后台生成,结果写回共享 plan 对象,
 *      服务端 hk_lecture_images 持久缓存 + 客户端 in-flight promise 共享,零重复生图。
 * 用户真正点开课堂时经 takePrefetchedEntry 复用同一份结果——plan/旁白/配图都已温,
 * intro/语音选择的停留期不再承担冷启动。
 *
 * 触发时机:页面就绪自动一次(主 CTA 目标讲次)+ 悬停讲次行 650ms 意图(任意讲次)。
 * 浪费控制:同 key 15min TTL 去重;悬停预热每次页面挂载限 4 次(plan=1 次 LLM,限 20/h);
 * key 不含 topic(服务端按 courseUuid+lecture 上下文权威解析主题)。
 */
import {
  fetchLectureImageLive,
  planLectureLive,
  type FetchImageResult,
  type LiveLecturePlan,
  type PlanLectureParams,
} from '../backend';
import { prefetchTts } from '../actions';

const TTL_MS = 15 * 60 * 1000;
/** 每次页面挂载允许的悬停意图预热次数(自动首讲预热不占额度) */
const HOVER_BUDGET = 4;
/** 第 3 条起旁白预热的错峰间隔 */
const TRICKLE_MS = 1200;
/** 单讲预热旁白上限(讲座步数上限即 8,留余量) */
const MAX_WARM_NARRATIONS = 10;

export interface PrefetchedLecture {
  plan: Promise<LiveLecturePlan | null>;
  image: Promise<FetchImageResult | null>;
}

interface Entry {
  at: number;
  plan: Promise<LiveLecturePlan | null>;
  image: Promise<FetchImageResult | null>;
}

const cache = new Map<string, Entry>();
let hoverSpent = 0;

export function planPrefetchKey(p: {
  courseUuid?: string;
  unitId?: string;
  lectureId?: string;
  sessionId?: string;
  language?: string;
}): string {
  return [p.courseUuid ?? '', p.unitId ?? '', p.lectureId ?? '', p.sessionId ?? '', p.language ?? ''].join('|');
}

function sweep(): void {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now - v.at > TTL_MS) cache.delete(k);
  }
}

/** 旁白错峰预热:前两条立即,其余逐条错峰;失败静默(播放时自有真实请求兜底) */
function warmNarrations(plan: LiveLecturePlan, voice: string, speed: number): void {
  const texts = plan.steps
    .map((s) => s.spoken_text)
    .filter((t): t is string => typeof t === 'string' && !!t.trim())
    .slice(0, MAX_WARM_NARRATIONS);
  texts.forEach((text, i) => {
    if (i < 2) {
      prefetchTts(text, voice, speed);
    } else {
      globalThis.setTimeout(() => prefetchTts(text, voice, speed), (i - 1) * TRICKLE_MS);
    }
  });
}

/** 配图预生成:结果写回共享 plan 对象(课堂侧拿到的就是这份引用) */
function warmImage(plan: LiveLecturePlan, params: PlanLectureParams): Promise<FetchImageResult | null> {
  const step = plan.steps.find((s) => s.board_action.type === 'image' && !s.board_action.url && s.board_action.prompt);
  if (!step) return Promise.resolve(null);
  return fetchLectureImageLive({
    prompt: step.board_action.prompt as string,
    caption: step.board_action.caption,
    courseUuid: params.courseUuid,
    unitId: params.unitId,
    lectureId: params.lectureId,
    sessionId: params.sessionId,
  })
    .then((img) => {
      if (img?.url) {
        step.board_action.url = img.url;
        step.board_action.caption = img.caption ?? step.board_action.caption;
      }
      return img;
    })
    .catch(() => null);
}

/**
 * 预生成 plan 并链式预热旁白/配图;同 key 在 TTL 内只跑一次。
 * source='hover' 用于悬停意图预热:占每次挂载 4 次预算,且跳过配图(悬停≠开课,
 * 配图是真图模型调用,只在自动首讲预热里做)。
 */
export function prefetchLecturePlan(
  params: PlanLectureParams,
  narration: { voice: string; speed: number } = { voice: 'calm', speed: 1 },
  source: 'auto' | 'hover' = 'auto',
): void {
  const key = planPrefetchKey(params);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return;
  if (source === 'hover') {
    if (hoverSpent >= HOVER_BUDGET) return;
    hoverSpent += 1;
  }
  const entry: Entry = { at: Date.now(), plan: Promise.resolve(null), image: Promise.resolve(null) };
  entry.plan = planLectureLive(params).then((plan) => {
    if (plan) warmNarrations(plan, narration.voice, narration.speed);
    return plan;
  });
  entry.image = entry.plan.then((plan) => (plan && source === 'auto' ? warmImage(plan, params) : null));
  cache.set(key, entry);
  sweep();
}

/**
 * 白板开课时取用预生成结果;返回 null = 没有可用预热(未预热/过期),
 * 调用方走正常 POST/生图。预热结果为 null(请求失败)也透传给调用方,由现有回退纪律处理。
 */
export function takePrefetchedEntry(params: {
  courseUuid?: string;
  unitId?: string;
  lectureId?: string;
  sessionId?: string;
  language?: string;
}): PrefetchedLecture | null {
  const hit = cache.get(planPrefetchKey(params));
  if (!hit || Date.now() - hit.at >= TTL_MS) return null;
  return { plan: hit.plan, image: hit.image };
}

/** 兼容调用方:只取 plan。 */
export function takePrefetchedPlan(params: {
  courseUuid?: string;
  unitId?: string;
  lectureId?: string;
  sessionId?: string;
  language?: string;
}): Promise<LiveLecturePlan | null> | null {
  return takePrefetchedEntry(params)?.plan ?? null;
}
