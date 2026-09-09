// 课程生成的联网研学。原复刻版 courseGenWs 的 researching_the_web 是纯装饰
// (固定 sleep + 假 "round 1/3" 帧);Workers 版接真搜索供应商,把研学结果注入
// 大纲提示词。纪律与站内其余双轨一致:
// - 供应商可插拔(tavily/brave/cloudflare),按 env 现有密钥自动选择;
//   HK_WEB_SEARCH_PROVIDER 可显式指定或 "off" 关闭。
// - 未配置/上游失败/超时一律降级为"无研学上下文",课程照常生成——搜索是增强,
//   不是门槛,绝不因搜索不可用把建课打死,也绝不虚报搜到了东西。
// - HK_WEB_SEARCH_BASE_URL 覆盖基地址,供测试 harness 注入假上游。

import { env } from "cloudflare:workers";

export type WebSearchHit = { title: string; url: string; snippet: string };

type ProviderId = "tavily" | "brave" | "cloudflare";

type SearchConfig = {
  provider: ProviderId;
  apiKey: string;
  accountId?: string;
  baseUrl: string;
};

const DEFAULT_BASES: Record<ProviderId, string> = {
  tavily: "https://api.tavily.com",
  brave: "https://api.search.brave.com",
  cloudflare: "https://api.cloudflare.com/client/v4",
};

// 三家供应商的响应形状互不相同,且 cloudflare 的 web search 返回体历史上变过
// 形状(content 内嵌 JSON 串 / 直接数组都出现过)——解析全部走宽松路径:找得到
// {title,url} 就收,snippet 容忍 content/description/snippet/text 多种键名。
function extractHits(payload: unknown): WebSearchHit[] {
  const hits: WebSearchHit[] = [];
  const rows: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { results?: unknown[] })?.results)
      ? (payload as { results: unknown[] }).results
      : Array.isArray((payload as { web?: { results?: unknown[] } })?.web?.results)
        ? (payload as { web: { results: unknown[] } }).web.results
        : [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const url = typeof rec.url === "string" ? rec.url : "";
    if (!/^https?:\/\//i.test(url)) continue;
    const title = String(rec.title ?? "").trim().slice(0, 160) || url;
    const rawSnippet = [rec.content, rec.description, rec.snippet, rec.text].find(
      (value) => typeof value === "string" && value.length > 0,
    ) as string | undefined;
    hits.push({ title, url, snippet: (rawSnippet ?? "").trim().slice(0, 320) });
  }
  return hits;
}

// cloudflare 的搜索正文可能是 JSON 串包着 {results:[...]}——再剥一层。
function extractCloudflareHits(envelope: unknown): WebSearchHit[] {
  const result = (envelope as { result?: unknown })?.result ?? envelope;
  const direct = extractHits(result);
  if (direct.length > 0) return direct;
  const content = (result as { content?: unknown })?.content;
  if (typeof content !== "string") return [];
  try {
    return extractHits(JSON.parse(content));
  } catch {
    return [];
  }
}

export function resolveSearchConfig(): SearchConfig | null {
  const values = env as unknown as Record<string, string | undefined>;
  const explicit = values.HK_WEB_SEARCH_PROVIDER?.trim().toLowerCase();
  if (explicit === "off") return null;
  const tavilyKey = values.HK_TAVILY_API_KEY || values.TAVILY_API_KEY;
  const braveKey = values.HK_BRAVE_SEARCH_API_KEY || values.BRAVE_SEARCH_API_KEY;
  const cfAccount = values.HK_SEARCH_ACCOUNT_ID || values.CLOUDFLARE_ACCOUNT_ID;
  const cfToken = values.HK_SEARCH_API_TOKEN || values.CLOUDFLARE_API_TOKEN || values.CF_API_TOKEN;
  const has = { tavily: !!tavilyKey, brave: !!braveKey, cloudflare: !!(cfAccount && cfToken) };
  let provider: ProviderId | null = null;
  if (explicit && explicit in has) provider = explicit as ProviderId;
  else provider = has.tavily ? "tavily" : has.brave ? "brave" : has.cloudflare ? "cloudflare" : null;
  if (!provider || !has[provider]) return null;
  const apiKey =
    provider === "tavily" ? tavilyKey! : provider === "brave" ? braveKey! : cfToken!;
  return {
    provider,
    apiKey,
    ...(provider === "cloudflare" && cfAccount ? { accountId: cfAccount } : {}),
    baseUrl: values.HK_WEB_SEARCH_BASE_URL || DEFAULT_BASES[provider],
  };
}

// 派生研学查询:沿用原复刻版假帧里的关键词(现在是真的去搜),补一条入门
// 路线索引——3 条正好对上 "round 1/3" 的复刻节奏,不虚标轮数。
export function researchQueriesFor(query: string): string[] {
  return [`${query} curriculum`, `${query} core foundations`, `${query} beginner guide`];
}

// 单轮搜索:失败/超时回 [] 由调用方降级,不抛错(搜索不可用不阻断建课)。
export async function searchOnce(query: string, signal?: AbortSignal): Promise<WebSearchHit[]> {
  const config = resolveSearchConfig();
  if (!config) return [];
  const timeout = AbortSignal.timeout(9000);
  const perCallSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    let response: Response;
    if (config.provider === "brave") {
      response = await fetch(
        `${config.baseUrl}/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
        { headers: { Accept: "application/json", "X-Subscription-Token": config.apiKey }, signal: perCallSignal },
      );
    } else if (config.provider === "tavily") {
      response = await fetch(`${config.baseUrl}/search`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, max_results: 5, search_depth: "basic" }),
        signal: perCallSignal,
      });
    } else {
      response = await fetch(`${config.baseUrl}/accounts/${config.accountId}/ai/search`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google-search", messages: [{ role: "user", content: query }] }),
        signal: perCallSignal,
      });
    }
    if (!response.ok) return [];
    const payload = (await response.json()) as unknown;
    return config.provider === "cloudflare" ? extractCloudflareHits(payload) : extractHits(payload);
  } catch {
    return [];
  }
}
