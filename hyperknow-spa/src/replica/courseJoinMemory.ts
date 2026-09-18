/**
 * 课程加入记忆:按"账户 + 课程键"把已加入的课程记在 localStorage,
 * 刷新/深链(#/course/preview)/集市重开不再重复弹"加入课程"确认。
 * 键 = 课程 UUID;无 UUID 的内置演示课(公开演讲)用固定键。
 * 与 materials/memory 同约定:存储不可用时静默退化,加入态仅本会话有效。
 */

const KEY_PREFIX = 'hk_course_joins:';
/** 内置演示课(公开演讲,无后端 UUID)的稳定键 */
export const DEMO_COURSE_KEY = 'public-speaking-demo';

export function courseJoinKey(courseUuid?: string | null): string {
  const uuid = (courseUuid || '').trim();
  return uuid || DEMO_COURSE_KEY;
}

function load(scope: string): string[] {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + scope);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

export function isCourseJoined(scope: string, key: string): boolean {
  return load(scope).includes(key);
}

export function markCourseJoined(scope: string, key: string): void {
  try {
    const list = load(scope);
    if (list.includes(key)) return;
    localStorage.setItem(KEY_PREFIX + scope, JSON.stringify([...list, key]));
  } catch {
    /* 存储不可用 → 加入态仅本会话内有效 */
  }
}
