import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import localeTrees from './locales.json';

/* 1:1 复刻原站 i18next 体系:7 语言单 translation 树(locales.json 由原站 bundle 提取,
   存储键/规范化/复数后缀/插值均与原站一致)。 */

export interface LanguageEntry {
  code: string;
  nativeLabel: string;
  englishLabel: string;
  shortLabel: string;
  backendLang: string;
}

export const LANGUAGES: LanguageEntry[] = [
  { code: 'en', nativeLabel: 'English', englishLabel: 'English', shortLabel: 'EN', backendLang: 'en' },
  { code: 'zh-CN', nativeLabel: '简体中文', englishLabel: 'Chinese (Simplified)', shortLabel: '简', backendLang: 'zh' },
  { code: 'zh-TW', nativeLabel: '繁體中文', englishLabel: 'Chinese (Traditional)', shortLabel: '繁', backendLang: 'zh' },
  { code: 'es', nativeLabel: 'Español', englishLabel: 'Spanish', shortLabel: 'ES', backendLang: 'es' },
  { code: 'ko', nativeLabel: '한국어', englishLabel: 'Korean', shortLabel: '한', backendLang: 'ko' },
  { code: 'hi', nativeLabel: 'हिन्दी', englishLabel: 'Hindi', shortLabel: 'हि', backendLang: 'hi' },
  { code: 'ur', nativeLabel: 'اردو', englishLabel: 'Urdu', shortLabel: 'اردو', backendLang: 'ur' },
];

const SUPPORTED_CODES = LANGUAGES.map((l) => l.code);
const OY: Record<string, string> = {
  zh: 'zh-CN',
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  'zh-HK': 'zh-TW',
  'zh-MO': 'zh-TW',
};
export const DEFAULT_LNG = 'en';
const STORAGE_KEY = 'app_language';

const TREES = localeTrees as Record<string, Record<string, unknown>>;

export function normalizeLng(input: string | null | undefined): string {
  if (!input) return DEFAULT_LNG;
  if (SUPPORTED_CODES.includes(input)) return input;
  if (OY[input]) return OY[input];
  const t = input.toLowerCase().replace(/_/g, '-');
  if (t.startsWith('zh')) return /hant|-tw|-hk|-mo/.test(t) ? 'zh-TW' : 'zh-CN';
  const base = t.split('-')[0];
  return SUPPORTED_CODES.find((c) => c.split('-')[0] === base) || DEFAULT_LNG;
}

export function languageEntry(code: string): LanguageEntry {
  return LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
}

function readStoredLng(): string {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage 不可用时回退默认语言 */
  }
  const normalized = normalizeLng(stored);
  if (stored && stored !== normalized) {
    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      /* ignore */
    }
  }
  return normalized;
}

function resolvePath(tree: unknown, path: string): string | undefined {
  let cur: unknown = tree;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

function pluralize(tree: unknown, path: string, lng: string, count: number): string | undefined {
  const cat = new Intl.PluralRules(lng).select(count);
  const suffix = cat === 'other' ? '_other' : cat;
  return resolvePath(tree, `${path}_${suffix}`) ?? resolvePath(tree, `${path}_other`);
}

export type TVars = Record<string, string | number>;

/** 取当前语言下某个子树的原始对象(版本日志这类结构化内容用)。 */
export function localeObject<T = Record<string, unknown>>(path: string): T | undefined {
  const tree = TREES[activeLng] || TREES[DEFAULT_LNG];
  let cur: unknown = tree;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur as T | undefined;
}

export function translate(lng: string, path: string, vars?: TVars): string {
  const tree = TREES[lng] || TREES[DEFAULT_LNG];
  const count = vars?.count;
  let value =
    resolvePath(tree, path) ??
    (typeof count === 'number' ? pluralize(tree, path, lng, count) : undefined);
  if (value === undefined && lng !== DEFAULT_LNG) {
    const fb = TREES[DEFAULT_LNG];
    value =
      resolvePath(fb, path) ??
      (typeof count === 'number' ? pluralize(fb, path, DEFAULT_LNG, count) : undefined);
  }
  if (value === undefined) return path;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) value = value.replaceAll(`{{${k}}}`, String(v));
  }
  return value;
}

/* 原站 Gy:本地化字段回退链(课程标题等 {zh-CN:…, en:…} 结构)。 */
export function localizedField<T>(obj: Record<string, T> | null | undefined, field: string, lng: string): T | undefined {
  const chain = [field, ...(lng === 'zh' ? ['zh-CN', 'zh-TW', 'zh'] : []), lng, 'en'];
  for (const key of chain) {
    const v = obj?.[key];
    if (v != null && v !== '') return v;
  }
  return undefined;
}

const initialLng = readStoredLng();
let activeLng = initialLng;

/* 供非 React 模块(wsClient 等)读取当前语言。 */
export const getCurrentLng = (): string => activeLng;
export const getBackendLang = (): string => languageEntry(activeLng).backendLang;

interface I18nContextValue {
  lng: string;
  entry: LanguageEntry;
  t: (path: string, vars?: TVars) => string;
  setLng: (code: string) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lng, setLngState] = useState<string>(initialLng);

  useEffect(() => {
    document.documentElement.lang = lng;
  }, [lng]);

  const setLng = useCallback((code: string) => {
    const next = normalizeLng(code);
    activeLng = next;
    setLngState(next);
    document.documentElement.lang = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      lng,
      entry: languageEntry(lng),
      t: (path: string, vars?: TVars) => translate(lng, path, vars),
      setLng,
    }),
    [lng, setLng],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

/* 轻量富文本:原站字典串带 <part>/<brandLock>/<highlight>/<span>/<orbie/> 标记,
   且各语言语序不同(如中文把品牌段提前),必须按标记解析而非拆固定段。 */
function renderRich(
  text: string,
  orbie: React.ReactNode,
  classes: Record<string, string>,
  keyPrefix: string,
  renderers?: Record<string, (children: React.ReactNode) => React.ReactNode>,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /<(part|brandLock|highlight|span|\d+)>([\s\S]*?)<\/\1>|<orbie\/>|<br\s*\/?>/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      /* 命名开闭标签(<part>/<brandLock>/<highlight>/<span>) — 注意 <brandLock> 以
         "<br" 开头,不能再用 startsWith('<br') 判定换行,须按分组号区分 */
      const tag = m[1];
      const inner = renderRich(m[2]!, orbie, classes, `${keyPrefix}${k++}.`, renderers);
      const custom = renderers?.[tag];
      if (custom) {
        out.push(<React.Fragment key={`${keyPrefix}${k++}`}>{custom(inner)}</React.Fragment>);
      } else {
        const cls = classes[tag];
        out.push(
          cls ? (
            <span key={`${keyPrefix}${k++}`} className={cls}>{inner}</span>
          ) : (
            <React.Fragment key={`${keyPrefix}${k++}`}>{inner}</React.Fragment>
          ),
        );
      }
    } else if (m[0] === '<orbie/>') {
      out.push(<React.Fragment key={`${keyPrefix}${k++}`}>{orbie}</React.Fragment>);
    } else {
      out.push(<br key={`${keyPrefix}${k++}`} />);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export const TRich: React.FC<{
  text: string;
  orbie?: React.ReactNode;
  classes?: Record<string, string>;
  renderers?: Record<string, (children: React.ReactNode) => React.ReactNode>;
}> = ({ text, orbie = null, classes = {}, renderers }) => (
  <>{renderRich(text, orbie, classes, '', renderers)}</>
);
