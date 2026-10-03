/**
 * 每课授课语言:加入弹窗的语言选择曾经是死 UI——选了"中文"但白板实际按界面语言
 * 备课。现把选择落到按课程 UUID 持久化的偏好,白板备课与旅程页预热同源读取;
 * 未选择(老课程/直接进入)回退界面语言,行为与从前一致。
 */
const KEY = 'hk_course_lang_v1';

type Store = Record<string, 'en' | 'zh'>;

function readAll(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

export function getCourseLang(courseUuid: string | null | undefined): 'en' | 'zh' | null {
  if (!courseUuid) return null;
  const v = readAll()[courseUuid];
  return v === 'en' || v === 'zh' ? v : null;
}

export function setCourseLang(courseUuid: string, lang: 'en' | 'zh'): void {
  try {
    const all = readAll();
    all[courseUuid] = lang;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* 存储不可用:仅本次会话内退回界面语言,不阻断加入 */
  }
}
