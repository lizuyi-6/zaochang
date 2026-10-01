import { requireMember } from "../../_lib/access-control";
import { enforceRateLimit, rateLimitKey } from "../../_lib/rate-limit";
import { resolveSearchConfig, searchWithOutcome } from "../../_lib/hyperknow/websearch";
import { beijingDayKey, feedQueries, mergeFeedItems } from "../../_lib/hyperknow/feed";
import type { FeedItem } from "../../_lib/hyperknow/feed";

export const dynamic = "force-dynamic";

// 首页「今日值得学」动态资讯源:阶跃星辰联网搜索现查现回。
// - 查询词按「北京日期 + 轮次」确定性轮换:日更由日期锚保证,换一批由轮次保证;
// - 进程内小缓存(同日同轮 10 分钟)防止多个用户同时落home打爆搜索上游;
// - 搜索未配置/关闭 → 503,客户端回退静态列表(静态项链到 Google 搜索该标题)。

const CACHE_TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; items: FeedItem[] }>();

function cachedGet(key: string): FeedItem[] | null {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;
  cache.delete(key);
  return null;
}

function cacheSet(key: string, items: FeedItem[]): void {
  // 只保留最近 12 个键,防长驻实例内存增长
  cache.set(key, { at: Date.now(), items });
  while (cache.size > 12) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (!oldest) break;
    cache.delete(oldest[0]);
  }
}

export async function GET(request: Request) {
  try {
    const member = await requireMember();
    await enforceRateLimit(await rateLimitKey("hyperknow-feed", member.email), 20, 60 * 60);

    const url = new URL(request.url);
    const rawRound = Number(url.searchParams.get("round") ?? "0");
    const round = Number.isFinite(rawRound) ? Math.min(5, Math.max(0, Math.floor(rawRound))) : 0;
    const dayKey = beijingDayKey();
    const cacheKey = `${dayKey}:${round}`;

    const cached = cachedGet(cacheKey);
    if (cached) {
      return Response.json({ success: true, data: { day: dayKey, round, items: cached, cached: true } });
    }

    const config = resolveSearchConfig();
    if (!config) {
      return Response.json({ error: "feed_unavailable" }, { status: 503 });
    }

    const queries = feedQueries(dayKey, round);
    const settled = await Promise.allSettled(
      queries.map((q) => searchWithOutcome(q, AbortSignal.timeout(12_000), config.provider)),
    );
    const items = mergeFeedItems(settled.map((s) => (s.status === "fulfilled" ? s.value.hits : [])));

    if (items.length === 0) {
      return Response.json({ error: "feed_upstream_error" }, { status: 502 });
    }
    cacheSet(cacheKey, items);
    return Response.json({ success: true, data: { day: dayKey, round, items, cached: false } });
  } catch {
    return jsonError("feed_failed", 500);
  }
}
