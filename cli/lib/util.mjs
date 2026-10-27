// zc CLI 共用工具:错误类型、HTTP 帮手、输入读取、浏览器拉起。
// 约定:零第三方依赖,只用 Node 22 内置模块;环境变量一律在使用点读取(懒读取),
// 保证测试可以在进程内改 env 驱动不同分支。

import { spawn } from "node:child_process";
import readline from "node:readline";

export const CLI_VERSION = "0.1.0";
export const HTTP_TIMEOUT_MS = 30_000;
// tools/call 可能触发真实的建站/上传动作,给宽一点;begin_hosting_upload 等只查库的很快。
export const MCP_TIMEOUT_MS = 120_000;

/** 用户可见错误:message 直接打印到 stderr,可选 hint 追加一行修复建议。 */
export class CliError extends Error {
  /** @param {string} message @param {{ hint?: string }} [options] */
  constructor(message, options = {}) {
    super(message);
    this.name = "CliError";
    this.hint = options.hint;
  }
}

/** 把 fetch 的非 2xx 响应转成 CliError,尽量带出 error/error_description。 */
export async function responseError(res, fallback) {
  const text = await res.text().catch(() => "");
  let detail = "";
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      detail = parsed.error_description || parsed.error || "";
    }
  } catch {
    detail = text.slice(0, 200);
  }
  const retryAfter = res.headers.get("retry-after");
  const suffix = retryAfter ? `(retry after ${retryAfter}s)` : "";
  return new CliError(`${fallback}(HTTP ${res.status}${detail ? `:${detail}` : ""})${suffix}`);
}

/** POST application/x-www-form-urlencoded,返回解析后的 JSON(或 null)。 */
export async function formPost(url, params, { timeoutMs = HTTP_TIMEOUT_MS } = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw await responseError(res, "请求被拒绝");
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** POST application/json,返回解析后的 JSON(或 null)。 */
export async function jsonPost(url, body, { headers = {}, timeoutMs = HTTP_TIMEOUT_MS } = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw await responseError(res, "请求被拒绝");
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** 从 stdin 读一行(不去回显;适合本机终端粘贴 API key,或管道输入)。stdin 提前关闭返回空串。 */
export function readLineFromStdin(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      try {
        rl.close();
      } catch {
        // 已关闭则忽略。
      }
      resolve(String(value ?? "").trim());
    };
    // 管道输入被关闭时 question 回调不会触发,必须监听 close 兜底,否则永久挂起。
    rl.on("close", () => done(""));
    rl.question(prompt, done);
  });
}

/** 尽力拉起系统浏览器;失败不抛错(调用方已把 URL 打印出来)。 */
export function openBrowser(url) {
  try {
    const platform = process.platform;
    const child = platform === "win32"
      ? spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" })
      : platform === "darwin"
        ? spawn("open", [url], { detached: true, stdio: "ignore" })
        : spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/** 统一的时间格式化(本地时区,含星期),用于 whoami/登录回显。 */
export function formatTime(epochMs) {
  return new Date(epochMs).toLocaleString("zh-CN", { hour12: false });
}
