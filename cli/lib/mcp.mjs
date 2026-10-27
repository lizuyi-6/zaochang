// MCP 客户端(Streamable HTTP 的纯 JSON 形态),对齐 app/api/mcp/route.ts:
// - initialize 协商协议版本(服务端支持 2025-06-18 / 2025-03-26,回应服务端协商值);
// - 协商后的每个请求携带 MCP-Protocol-Version 头;
// - notifications/initialized 以「无 id 的 JSON 体」发送(服务端先 JSON.parse 再看 method,
//   空体会被打成 -32700,不能真的发空 body);
// - 401 时经 tokenProvider.invalidate() 刷新一次令牌后重试(只重试一次,避免循环);
// - 响应可能是 JSON-RPC result、JSON-RPC error,也可能是非 JSON-RPC 的 {error:...}
//   (限流/网关),三种形态都要能讲清楚。

import { MCP_TIMEOUT_MS } from "./util.mjs";

export class McpError extends Error {
  constructor(message, { code, data, status } = {}) {
    super(message);
    this.name = "McpError";
    this.code = code;
    this.data = data;
    this.status = status;
  }
}

export const LATEST_PROTOCOL_VERSION = "2025-06-18";

export class McpSession {
  #origin;
  #tokenProvider;
  #protocolVersion = null;
  #serverInfo = null;
  #initialized = false;
  #nextId = 1;

  /** @param {{ origin: string, tokenProvider: (() => Promise<string>) & { invalidate?: () => Promise<string> } }} options */
  constructor({ origin, tokenProvider }) {
    this.#origin = origin.replace(/\/+$/, "");
    this.#tokenProvider = tokenProvider;
  }

  get protocolVersion() {
    return this.#protocolVersion;
  }

  async #post(payload) {
    const token = await this.#tokenProvider();
    const headers = {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${token}`,
    };
    if (this.#protocolVersion && payload.method !== "initialize") {
      headers["mcp-protocol-version"] = this.#protocolVersion;
    }
    return fetch(`${this.#origin}/api/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
    });
  }

  /**
   * 发送一个 JSON-RPC 请求(或通知)。401 → 刷新令牌重试一次。
   * @returns {Promise<unknown | null>} 通知(202)返回 null。
   */
  async rpc(method, params, { notification = false } = {}) {
    const payload = {
      jsonrpc: "2.0",
      method,
      ...(params !== undefined ? { params } : {}),
      ...(notification ? {} : { id: this.#nextId++ }),
    };

    let response = await this.#post(payload);
    if (response.status === 401 && typeof this.#tokenProvider.invalidate === "function") {
      await this.#tokenProvider.invalidate();
      response = await this.#post(payload);
    }
    if (response.status === 202) return null;

    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new McpError(`MCP 端点返回了非 JSON 响应(HTTP ${response.status})`, {
        status: response.status,
        data: text.slice(0, 200),
      });
    }
    if (body && typeof body === "object" && "error" in body && body.error) {
      const rawError = body.error;
      const detail = typeof rawError === "string" ? rawError : rawError.message ?? "JSON-RPC 错误";
      if (response.status === 401) {
        throw new McpError(`认证失败:${detail}`, {
          code: typeof rawError === "object" ? rawError.code : undefined,
          status: 401,
          data: { hint: "重新运行 zc login。" },
        });
      }
      throw new McpError(detail, {
        code: typeof rawError === "object" ? rawError.code : undefined,
        data: typeof rawError === "object" ? rawError.data : undefined,
        status: response.status,
      });
    }
    if (!response.ok || !body || typeof body !== "object" || !("result" in body)) {
      // 非 JSON-RPC 错误体(如限流 {error:"rate_limited"}、无效凭据 {error:"invalid_api_key"})。
      const retryAfter = response.headers.get("retry-after");
      const code = body?.error ?? `http_${response.status}`;
      const message = response.status === 401
        ? `认证失败:${code};请重新 zc login 或检查 API key`
        : `请求失败:${code}${retryAfter ? `(retry after ${retryAfter}s)` : ""}`;
      throw new McpError(message, { status: response.status, data: body });
    }
    return body.result;
  }

  /** initialize 握手 + initialized 通知。重复调用直接返回上次的服务端信息。 */
  async initialize() {
    if (this.#initialized) return this.#serverInfo;
    const result = await this.rpc("initialize", {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "zc-cli", title: "造场 zc 命令行", version: "0.1.0" },
    });
    if (!result || typeof result !== "object" || typeof result.protocolVersion !== "string") {
      throw new McpError("initialize 响应缺少 protocolVersion。");
    }
    this.#protocolVersion = result.protocolVersion;
    await this.rpc("notifications/initialized", undefined, { notification: true });
    this.#initialized = true;
    this.#serverInfo = result;
    return result;
  }

  async ping() {
    await this.initialize();
    return this.rpc("ping", {});
  }

  async listTools() {
    await this.initialize();
    const result = await this.rpc("tools/list", {});
    return Array.isArray(result?.tools) ? result.tools : [];
  }

  /**
   * 调用工具。返回 { content, structuredContent, isError } 原样;
   * isError 为真时由调用方决定如何呈现(本方法不抛,保留服务端错误码与 retryAfterSeconds)。
   */
  async callTool(name, args = {}) {
    await this.initialize();
    return this.rpc("tools/call", { name, arguments: args });
  }
}

/**
 * tools/call 结果的统一呈现:成功时优先 structuredContent(与 content[0].text 等价,
 * 但结构化),失败时把错误码讲成人话。供 zc.mjs 与 host 上传复用。
 */
export function toolErrorSummary(result) {
  const error = result?.structuredContent?.error ?? result?.content?.[0]?.text ?? "unknown_error";
  const retryAfter = result?.structuredContent?.retryAfterSeconds;
  return retryAfter ? `${error}(retry after ${retryAfter}s)` : String(error);
}
