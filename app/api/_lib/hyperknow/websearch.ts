// 课程生成的联网研学。原复刻版 courseGenWs 的 researching_the_web 是纯装饰
// (固定 sleep + 假 "round 1/3" 帧);Workers 版接真搜索供应商,把研学结果注入
// 大纲提示词。纪律与站内其余双轨一致:
// - 供应商可插拔(stepfun/tavily/brave/cloudflare),按 env 现有配置与密钥自动选择;
//   HK_WEB_SEARCH_PROVIDER 可显式指定或 "off" 关闭。默认优先现有 AI 渠道 (stepfun)。
// - stepfun 供应商复用 resolveHyperknowAiConfig 的 URL 与 API Key,绝不硬编码官方
//   地址或回退;使用独立的 HK_WEB_SEARCH_MODEL (默认 step-3.7-flash),不改变其他 LLM;
//   stepfun 忽略独立搜索 base override。
// - 未配置/上游失败/超时一律降级为"无研学上下文",课程照常生成——搜索是增强,
//   不是门槛,绝不因搜索不可用把建课打死,也绝不虚报搜到了东西。
// - HK_WEB_SEARCH_BASE_URL 覆盖外部搜索(tavily/brave/cloudflare)基地址,供测试注入假上游。

import { env } from "cloudflare:workers";
import { resolveHyperknowAiConfig } from "./config";
import {
  extractStepfunHits,
  resolveStepfunChatCompletionsUrl,
  type WebSearchHit,
} from "./protocol";

export { extractStepfunHits, resolveStepfunChatCompletionsUrl, type WebSearchHit };

export type ProviderId = "stepfun" | "tavily" | "brave" | "cloudflare";

export type SearchOutcomeStatus =
  | "success"
  | "not_triggered"
  | "no_results"
  | "auth_failed"
  | "rate_limited"
  | "upstream_error"
  | "protocol_error"
  | "timeout"
  | "disabled";

export type SearchOutcome = {
  status: SearchOutcomeStatus;
  hits: WebSearchHit[];
  provider: ProviderId | "none";
  reason?: string;
  query?: string;
};

export type SearchConfig = {
  provider: ProviderId;
  apiKey: string;
  baseUrl: string;
  accountId?: string;
  model?: string;
};

const DEFAULT_BASES: Record<Exclude<ProviderId, "stepfun">, string> = {
  tavily: "https://api.tavily.com",
  brave: "https://api.search.brave.com",
  cloudflare: "https://api.cloudflare.com/client/v4",
};

// 三家传统搜索供应商的响应解析:找得到 {title,url} 就收,snippet 容忍多种键名。
export function extractHits(payload: unknown): WebSearchHit[] {
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
    const url = typeof rec.url === "string" ? rec.url.trim() : "";
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
export function extractCloudflareHits(envelope: unknown): WebSearchHit[] {
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

export function resolveSearchConfig(overrideProvider?: string): SearchConfig | null {
  const values = env as unknown as Record<string, string | undefined>;
  const explicit = (overrideProvider || values.HK_WEB_SEARCH_PROVIDER)?.trim().toLowerCase();
  if (explicit === "off") return null;

  const aiConfig = resolveHyperknowAiConfig();
  const tavilyKey = values.HK_TAVILY_API_KEY || values.TAVILY_API_KEY;
  const braveKey = values.HK_BRAVE_SEARCH_API_KEY || values.BRAVE_SEARCH_API_KEY;
  const cfAccount = values.HK_SEARCH_ACCOUNT_ID || values.CLOUDFLARE_ACCOUNT_ID;
  const cfToken = values.HK_SEARCH_API_TOKEN || values.CLOUDFLARE_API_TOKEN || values.CF_API_TOKEN;

  const has: Record<ProviderId, boolean> = {
    stepfun: !!(aiConfig?.baseUrl && aiConfig?.apiKey),
    tavily: !!tavilyKey,
    brave: !!braveKey,
    cloudflare: !!(cfAccount && cfToken),
  };

  let provider: ProviderId | null = null;
  if (explicit) {
    if (explicit === "stepfun" || explicit === "tavily" || explicit === "brave" || explicit === "cloudflare") {
      if (has[explicit]) provider = explicit;
      else return null;
    } else {
      return null;
    }
  } else {
    // 默认优先现有 AI 渠道 (stepfun)，保留显式 Tavily/Brave
    if (has.stepfun) provider = "stepfun";
    else if (has.tavily) provider = "tavily";
    else if (has.brave) provider = "brave";
    else if (has.cloudflare) provider = "cloudflare";
    else return null;
  }

  if (!provider) return null;

  if (provider === "stepfun") {
    // stepfun 忽略独立搜索 base override，绝不硬编码官方地址或回退
    return {
      provider: "stepfun",
      apiKey: aiConfig!.apiKey,
      baseUrl: resolveStepfunChatCompletionsUrl(aiConfig!.baseUrl),
      model: values.HK_WEB_SEARCH_MODEL?.trim() || "step-3.7-flash",
    };
  }

  const apiKey = provider === "tavily" ? tavilyKey! : provider === "brave" ? braveKey! : cfToken!;
  return {
    provider,
    apiKey,
    ...(provider === "cloudflare" && cfAccount ? { accountId: cfAccount } : {}),
    baseUrl: values.HK_WEB_SEARCH_BASE_URL || DEFAULT_BASES[provider],
  };
}

// 派生研学查询:供传统外部搜索供应商使用
export function researchQueriesFor(query: string): string[] {
  return [`${query} curriculum`, `${query} core foundations`, `${query} beginner guide`];
}

/**
 * 结构化单次搜索:
 * 严格区分 success / not_triggered / no_results / auth_failed / rate_limited /
 * upstream_error / protocol_error / timeout / disabled。
 * 独立有界超时 15s 符合路由时间预算。调用方取消信号通过则继续向上抛出。
 */
export async function searchWithOutcome(query: string, signal?: AbortSignal, overrideProvider?: string): Promise<SearchOutcome> {
  const config = resolveSearchConfig(overrideProvider);
  if (!config) {
    return { status: "disabled", hits: [], provider: "none", reason: "Web search is disabled or not configured" };
  }

  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
  }

  const timeout = AbortSignal.timeout(15_000);
  const perCallSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

  try {
    let response: Response;
    if (config.provider === "stepfun") {
      // StepFun 使用 fetch 非流式 Chat Completions，tools 工具声明 web_search，tool_choice 为 auto
      response = await fetch(config.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model || "step-3.7-flash",
          messages: [{ role: "user", content: query }],
          tools: [
            {
              type: "web_search",
              function: {
                description: "检索课程主题相关的官方文档、权威教程与最新资料",
              },
            },
          ],
          tool_choice: "auto",
          stream: false,
        }),
        signal: perCallSignal,
      });
    } else if (config.provider === "brave") {
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

    if (response.status === 401 || response.status === 403) {
      return { status: "auth_failed", hits: [], provider: config.provider, reason: "Search upstream authentication failed" };
    }
    if (response.status === 429) {
      return { status: "rate_limited", hits: [], provider: config.provider, reason: "Search upstream rate limit exceeded" };
    }
    if (!response.ok) {
      return { status: "upstream_error", hits: [], provider: config.provider, reason: `Search upstream returned status ${response.status}` };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { status: "protocol_error", hits: [], provider: config.provider, reason: "Invalid JSON response from search upstream" };
    }

    if (config.provider === "stepfun") {
      const { hits, triggered } = extractStepfunHits(payload);
      if (!triggered) {
        return { status: "not_triggered", hits: [], provider: "stepfun", reason: "Model did not trigger web search" };
      }
      if (hits.length === 0) {
        return { status: "no_results", hits: [], provider: "stepfun", reason: "No relevant search results found" };
      }
      return { status: "success", hits, provider: "stepfun", query };
    }

    const hits = config.provider === "cloudflare" ? extractCloudflareHits(payload) : extractHits(payload);
    if (hits.length === 0) {
      return { status: "no_results", hits: [], provider: config.provider, reason: "No relevant search results found" };
    }
    return { status: "success", hits, provider: config.provider, query };
  } catch (error: unknown) {
    if (signal?.aborted) {
      throw error;
    }
    if (timeout.aborted) {
      return { status: "timeout", hits: [], provider: config.provider, reason: "Search request timed out" };
    }
    const message = error instanceof Error ? error.message : "Search upstream connection error";
    return { status: "upstream_error", hits: [], provider: config.provider, reason: message };
  }
}

// 保持兼容的原单轮搜索函数:失败返回 [] 不阻断建课，调用方取消则继续抛出
export async function searchOnce(query: string, signal?: AbortSignal): Promise<WebSearchHit[]> {
  try {
    const outcome = await searchWithOutcome(query, signal);
    return outcome.hits;
  } catch (error) {
    if (signal?.aborted) throw error;
    return [];
  }
}
