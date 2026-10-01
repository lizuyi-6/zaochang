// 「今日值得学」动态资讯源(纯模块,零 import,可被单测直接加载)。
// 首页最新动态此前是写死的 5 条纯标题——点不开、不更新、换一批只是同一批轮转。
// 这里按「北京日期 + 轮次」确定性轮换学习向检索词,由路由用阶跃星辰联网搜索
// 现查现回,合并去重后返回带真实 URL 的条目。
import type { WebSearchHit } from "./websearch";

export interface FeedItem {
  title: string;
  url: string;
  /** 域名(展示用,如 nature.com) */
  source: string;
}

/** 学习向检索主题池:科学/技术/历史/太空/AI/经济,轮换覆盖面足够日更。 */
const FEED_TOPICS: readonly string[] = [
  "最新科学研究进展",
  "最新科技新闻",
  "人工智能最新进展",
  "太空与天文最新发现",
  "历史与考古新发现",
  "医学与健康研究新突破",
  "经济学与市场动态分析",
  "环境与气候科学新研究",
  "数学与物理前沿进展",
  "教育与学习方法研究",
  "工程与技术突破新闻",
  "心理学与认知科学新研究",
];

/** 北京日期键(每日一批的稳定键):UTC+8 的 YYYY-MM-DD。 */
export function beijingDayKey(nowMs: number = Date.now()): string {
  return new Date(nowMs + 8 * 3600_000).toISOString().slice(0, 10);
}

/** 每批 3 个检索词:按日期锚 + 轮次步进确定性轮换(同日同轮恒定,换轮/换日出新)。 */
export function feedQueries(dayKey: string, round: number): string[] {
  const safeDay = /^\d{4}-\d{2}-\d{2}$/.test(dayKey) ? dayKey : "1970-01-01";
  const dayNum = Number(safeDay.replaceAll("-", "")) || 0;
  const safeRound = Number.isFinite(round) ? Math.max(0, Math.floor(round)) : 0;
  const start = (dayNum + safeRound * 3) % FEED_TOPICS.length;
  const out: string[] = [];
  for (let i = 0; i < 3; i++) out.push(FEED_TOPICS[(start + i) % FEED_TOPICS.length]);
  return out;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** 标题有效字符(汉字/字母/数字)少于该值视为栏目页/索引页而非文章,弃用。 */
const MIN_TITLE_CHARS = 6;

function titleWeight(title: string): number {
  return (title.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

/** 解析检索结果的 time 字段("2026-02-03T12:36:00" 或 "2022-01-30 00:00:00"),不可解析为 NaN。 */
function hitTimeMs(time: unknown): number {
  if (typeof time !== "string") return Number.NaN;
  const ms = Date.parse(time.trim().replace(" ", "T"));
  return Number.isFinite(ms) ? ms : Number.NaN;
}

/**
 * 合并多路检索结果:仅留 http(s),按去协议 URL 去重,剔除标题带 Markdown 图链的
 * 脏行,新鲜优先排序(带可解析时间的按时间倒序,无时间按原序垫后),截断到 12 条。
 */
export function mergeFeedItems(groups: WebSearchHit[][], cap = 12): FeedItem[] {
  const seen = new Set<string>();
  const pool: Array<{ item: FeedItem; timeMs: number; order: number }> = [];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const hit of group) {
      if (!hit || typeof hit.url !== "string" || !/^https?:\/\//i.test(hit.url)) continue;
      const title = String(hit.title ?? "").trim();
      if (title.includes("![") || (title !== "" && titleWeight(title) < MIN_TITLE_CHARS)) continue;
      const key = hit.url.replace(/[#?].*$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push({
        item: { title: title || hit.url, url: hit.url, source: hostOf(hit.url) },
        timeMs: hitTimeMs(hit.time),
        order: pool.length,
      });
    }
  }
  pool.sort((a, b) => {
    const aDated = !Number.isNaN(a.timeMs);
    const bDated = !Number.isNaN(b.timeMs);
    if (aDated && bDated) return b.timeMs - a.timeMs;
    if (aDated !== bDated) return aDated ? -1 : 1;
    return a.order - b.order;
  });
  return pool.slice(0, cap).map((row) => row.item);
}
