// zc CLI 的 OAuth 客户端实现,严格对齐造场服务端(app/api/_lib/oauth-provider.ts):
// - 动态注册(RFC 7591):公开客户端、token_endpoint_auth_method=none、loopback 回调精确到端口。
// - 授权码 + PKCE S256;state 为 8–200 位 unreserved;授权请求显式带 scope=mcp:projects
//   和 resource=<origin>/api/mcp(服务端只接受这一个 resource)。
// - 刷新令牌轮换:每次刷新返回新 refresh_token,旧令牌即刻作废;重放会吊销整个令牌族,
//   所以拿到新令牌必须立刻交给调用方落盘(本模块不写文件,保持可测)。

import http from "node:http";
import { hostname } from "node:os";
import { CliError, formPost, jsonPost, openBrowser } from "./util.mjs";

const PKCE_VERIFIER_BYTES = 32; // base64url 后 43 位,落在服务端 43–128 的合法区间
const STATE_BYTES = 32;
/** 服务端授权请求有效期 10 分钟(AUTHORIZATION_REQUEST_SECONDS),客户端等 9 分钟留余量。 */
export const LOGIN_TIMEOUT_MS = 9 * 60_000;

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

/** 生成 verifier + S256 challenge(crypto.subtle 是异步的,所以真正用的入口是这个)。 */
export async function newPkce() {
  const verifier = base64Url(randomBytes(PKCE_VERIFIER_BYTES));
  return { verifier, challenge: await sha256Base64Url(verifier) };
}

export function newState() {
  return base64Url(randomBytes(STATE_BYTES));
}

/** 默认客户端名:主名称「zc CLI」不含任何平台冒充词;括号里是本机名,方便在同意页辨认。 */
export function defaultClientName() {
  const machine = hostname().replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "local";
  return `zc CLI (${machine})`;
}

/**
 * 动态注册客户端。服务端拒绝冒充平台名的注册,此处把 error/error_description 原样带出。
 * @returns {Promise<{ client_id: string, client_name: string, redirect_uris: string[] }>}
 */
export async function registerClient(origin, { name, redirectUri }) {
  const client = await jsonPost(`${origin}/api/oauth/register`, {
    client_name: name,
    redirect_uris: [redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: "mcp:projects",
  });
  if (!client || typeof client.client_id !== "string") {
    throw new CliError("注册响应缺少 client_id。");
  }
  return client;
}

/** 组装授权 URL(用户浏览器打开;需要已有造场登录会话,同意页由服务端渲染)。 */
export function buildAuthorizeUrl({ origin, clientId, redirectUri, state, challenge }) {
  const url = new URL("/oauth/authorize", origin);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", "mcp:projects");
  url.searchParams.set("resource", `${origin}/api/mcp`);
  return url.toString();
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server.address()));
  });
}

function closeServer(server) {
  // undici 的连接池会保持 keep-alive 连接不关,server.close() 会一直等下去;
  // 先主动断掉全部连接再关,否则登录收尾永久挂起。
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

function callbackPage(message) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui,sans-serif;padding:32px;line-height:1.6"><p>${message}</p></body></html>`;
}

/**
 * 完整登录流程:起 loopback 监听 → 注册客户端 → 产出授权 URL → 等回调 → 换令牌。
 * 不落盘、不打印(除拉浏览器外),输出交给 onAuthorizeUrl/log 回调,便于测试与 --no-browser。
 * @param {{ origin: string, clientName?: string, noBrowser?: boolean,
 *           onAuthorizeUrl?: (url: string) => void, log?: (line: string) => void,
 *           timeoutMs?: number }} options
 * @returns {Promise<{ clientId: string, clientName: string, redirectUri: string,
 *                     tokens: { access_token: string, refresh_token: string | null,
 *                               expires_in: number, scope: string } }>}
 */
export async function runLogin(options) {
  const { origin, clientName = defaultClientName(), noBrowser = false, timeoutMs = LOGIN_TIMEOUT_MS } = options;
  const onAuthorizeUrl = options.onAuthorizeUrl ?? (() => {});
  const log = options.log ?? (() => {});

  const server = http.createServer();
  const address = await listen(server, "127.0.0.1", 0);
  const redirectUri = `http://127.0.0.1:${address.port}/callback`;

  try {
    const client = await registerClient(origin, { name: clientName, redirectUri });
    const { verifier, challenge } = await newPkce();
    const state = newState();
    const authorizeUrl = buildAuthorizeUrl({ origin, clientId: client.client_id, redirectUri, state, challenge });

    const callback = new Promise((resolve, reject) => {
      server.on("request", (request, response) => {
        const url = new URL(request.url ?? "/", `http://127.0.0.1:${address.port}`);
        if (url.pathname !== "/callback" || request.method !== "GET") {
          response.statusCode = 404;
          response.end();
          return;
        }
        const error = url.searchParams.get("error");
        if (error) {
          response.setHeader("content-type", "text/html; charset=utf-8");
          response.end(callbackPage("授权被拒绝,请回到终端查看原因。"));
          reject(new CliError(`授权被拒绝:${error}`, { hint: "在同意页选择「允许」后重试 zc login。" }));
          return;
        }
        const code = url.searchParams.get("code");
        if (!code || url.searchParams.get("state") !== state) {
          response.statusCode = 400;
          response.setHeader("content-type", "text/html; charset=utf-8");
          response.end(callbackPage("回调参数无效(state 不匹配或缺少授权码)。"));
          return;
        }
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(callbackPage("已收到授权码,正在换取令牌…请回到终端。"));
        resolve(code);
      });
    });

    onAuthorizeUrl(authorizeUrl);
    log(`请在浏览器中完成授权(若未自动打开):\n  ${authorizeUrl}`);
    if (!noBrowser) openBrowser(authorizeUrl);

    let code;
    try {
      code = await Promise.race([
        callback,
        new Promise((_, reject) => setTimeout(() => reject(
          new CliError("等待浏览器授权超时。", { hint: "授权链接 10 分钟内有效,请重新 zc login。" }),
        ), timeoutMs).unref?.()),
      ]);
    } catch (error) {
      throw error instanceof Error ? error : new CliError(String(error));
    }

    const tokens = await exchangeCode({ origin, clientId: client.client_id, redirectUri, code, verifier });
    return {
      clientId: client.client_id,
      clientName: client.client_name ?? clientName,
      redirectUri,
      tokens,
    };
  } finally {
    await closeServer(server);
  }
}

/**
 * 授权码换令牌。公开客户端:client_id 走表单参数,绝不能带 client_secret
 * (服务端对公开客户端收到 secret 一律 invalid_client)。
 */
export async function exchangeCode({ origin, clientId, redirectUri, code, verifier }) {
  const tokens = await formPost(`${origin}/api/oauth/token`, {
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    client_id: clientId,
  });
  if (!tokens || typeof tokens.access_token !== "string") {
    throw new CliError("令牌响应缺少 access_token。");
  }
  return tokens;
}

/**
 * 刷新令牌(轮换)。invalid_grant 视为登录失效,给出明确的重新登录指引;
 * 其它错误(限流/网络)原样抛出,不误导用户去重登。
 */
export async function refreshTokens({ origin, clientId, refreshToken }) {
  let tokens;
  try {
    tokens = await formPost(`${origin}/api/oauth/token`, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    });
  } catch (error) {
    if (error instanceof CliError && /invalid_grant/.test(error.message)) {
      throw new CliError("登录已失效(刷新令牌被拒绝)。", { hint: "重新运行 zc login。" });
    }
    throw error;
  }
  if (!tokens || typeof tokens.access_token !== "string") {
    throw new CliError("刷新响应缺少 access_token。", { hint: "重新运行 zc login。" });
  }
  return tokens;
}

/** RFC 7009 吊销。调用方在登出时使用;失败不应阻断本地凭据清理,由调用方决定吞掉与否。 */
export async function revokeToken({ origin, clientId, token }) {
  await formPost(`${origin}/api/oauth/revoke`, { token, client_id: clientId });
}
