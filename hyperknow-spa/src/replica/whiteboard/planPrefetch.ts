/**
 * 白板讲次 plan 预生成:课程旅程页就绪(已加入+真课)就为"开始学习"的目标讲次
 * 后台请求 whiteboard/plan(LLM ~40-60s),plan 一到手立刻预热前两条旁白 TTS。
 * 用户真正点开课堂时经 takePrefetchedPlan 复用同一份结果——plan 与首音都已温,
 *  intro/语音选择的停留期不再承担冷启动。
 *
 * 浪费控制:只在已加入的课程旅程页触发一次(主 CTA 目标讲次),15 分钟 TTL,
 * 同 key 去重;key 不含 topic(服务端按 courseUuid+lecture 上下文权威解析主题)。
 */
import { planLectureLive, type LiveLecturePlan, type PlanLectureParams } from '../backend';
import { prefetchTts } from '../actions';

const TTL_MS = 15 * 60 * 1000;

interface Entry {
  at: number;
  promise: Promise<LiveLecturePlan | null>;
}

const cache = new Map<string, Entry>();

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

/** 预生成 plan 并预热首两条旁白;同 key 在 TTL 内只跑一次。 */
export function prefetchLecturePlan(
  params: PlanLectureParams,
  narration: { voice: string; speed: number } = { voice: 'calm', speed: 1 },
): void {
  const key = planPrefetchKey(params);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return;
  const promise = planLectureLive(params).then((plan) => {
    if (plan) {
      plan.steps
        .filter((s) => s.spoken_text)
        .slice(0, 2)
        .forEach((s) => prefetchTts(s.spoken_text, narration.voice, narration.speed));
    }
    return plan;
  });
  cache.set(key, { promise, at: Date.now() });
  sweep();
}

/**
 * 白板开课时取用预生成结果;返回 null = 没有可用预热(未预热/过期),
 * 调用方走正常 POST。预热结果为 null(请求失败)也返回给调用方,由现有回退纪律处理。
 */
export function takePrefetchedPlan(params: {
  courseUuid?: string;
  unitId?: string;
  lectureId?: string;
  sessionId?: string;
  language?: string;
}): Promise<LiveLecturePlan | null> | null {
  const hit = cache.get(planPrefetchKey(params));
  if (!hit || Date.now() - hit.at >= TTL_MS) return null;
  return hit.promise;
}
