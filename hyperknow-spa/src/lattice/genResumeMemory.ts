/**
 * 未完成课程生成的断点记忆:按账户把 { uuid, query } 记在 localStorage。
 * 断点本身(任务行/检查点)在服务端 D1;这里只记"去哪个任务 UUID 恢复"——此前它只活在
 * 内存 state 里,刷新/关页后「我的课程」的"继续生成"入口随之消失,"进度已保存"成了空话。
 * 与 courseJoinMemory 同约定:存储不可用时静默退化为仅本会话有效。
 */

const KEY_PREFIX = 'hk_gen_resume:';

export interface GenResumeEntry {
  uuid: string;
  query: string;
}

export function loadGenResume(scope: string): GenResumeEntry | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + scope);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GenResumeEntry> | null;
    if (!parsed || typeof parsed.uuid !== 'string' || !parsed.uuid) return null;
    return { uuid: parsed.uuid, query: typeof parsed.query === 'string' ? parsed.query : '' };
  } catch {
    return null;
  }
}

export function saveGenResume(scope: string, entry: GenResumeEntry | null | undefined): void {
  try {
    if (entry && entry.uuid) {
      localStorage.setItem(KEY_PREFIX + scope, JSON.stringify({ uuid: entry.uuid, query: entry.query ?? '' }));
    } else {
      localStorage.removeItem(KEY_PREFIX + scope);
    }
  } catch {
    /* 存储不可用 → 断点入口仅本会话内有效 */
  }
}
