// zc CLI(造场 MCP 客户端)测试:全部纯 Node,零第三方依赖。
//
// 思路与 tests/harness 的「真 HTTP + 真行为」一致:起一个假 origin 服务器
// (node:http),按服务端契约(app/api/mcp/route.ts、app/api/_lib/oauth-provider.ts)
// 实现 register/authorize/token/revoke/api/mcp/bundle-PUT,然后:
//  - lib 级:runLogin 全流程、PKCE 挑战交叉验证、McpSession 握手/协议头/401 刷新重试、
//    oauthTokenProvider 过期主动刷新与轮换落盘;
//  - CLI 子进程级(spawnSync/spawn 真 node):login --api-key、call 参数解析与 isError、
//    host upload 一条龙、logout 吊销、OAuth --no-browser 登录全程。

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import http from "node:http";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { test } from "node:test";

import { clearConfig, loadConfig, oauthTokenProvider, saveConfig } from "../cli/lib/config.mjs";
import { McpSession, toolErrorSummary } from "../cli/lib/mcp.mjs";
import { newPkce, newState, runLogin } from "../cli/lib/oauth.mjs";
import { CliError } from "../cli/lib/util.mjs";

const ZC_ENTRY = path.join(import.meta.dirname, "..", "cli", "zc.mjs");
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26"];

function sha256Base64Url(value) {
  return createHash("sha256").update(value).digest("base64url");
}

function tempConfigPath(name) {
  const dir = mkdtempSync(path.join(tmpdir(), `zc-cli-${name}-`));
  return path.join(dir, "config.json");
}

async function readBody(request, asBuffer = false) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  return asBuffer ? buffer : buffer.toString("utf8");
}

function jsonRpc(res, id, result, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
}

/**
 * 假造场 origin。行为可经 state.* 注入点定制(authorizeBehavior/registerBehavior/negotiate)。
 */
async function startFakeOrigin() {
  const state = {
    negotiate: "2025-06-18",
    registrations: [],
    authorizeRequests: [],
    tokenRequests: [],
    revocations: [],
    mcpRequests: [],
    toolCalls: [],
    bundles: new Map(),
    validBearers: new Set(),
    refreshLedger: new Map(),
    authorizeBehavior: null,
    registerBehavior: null,
  };
  let issuedCounter = 0;

  const issueTokens = (res, scope) => {
    issuedCounter += 1;
    const accessToken = `zca_a${issuedCounter}`.padEnd(47, "x");
    const refreshToken = `zcr_r${issuedCounter}`.padEnd(52, "x");
    state.validBearers.add(accessToken);
    state.refreshLedger.set(refreshToken, { status: "active" });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: refreshToken,
      scope: scope ?? "mcp:projects",
    }));
    return { accessToken, refreshToken };
  };

  const server = http.createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://placeholder.invalid");
      const pathname = url.pathname;

      if (request.method === "POST" && pathname === "/api/oauth/register") {
        const body = JSON.parse(await readBody(request));
        if (state.registerBehavior) return state.registerBehavior(request, response, body);
        state.registrations.push(body);
        const redirect = body.redirect_uris?.[0];
        if (!redirect || !/^http:\/\/127\.0\.0\.1:\d+\/callback$/.test(redirect)) {
          response.writeHead(400, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "invalid_client_metadata" }));
          return;
        }
        response.writeHead(201, { "content-type": "application/json" });
        response.end(JSON.stringify({
          client_id: "zc_client_1",
          client_name: body.client_name ?? "未命名 AI 客户端",
          redirect_uris: body.redirect_uris,
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
          scope: "mcp:projects",
        }));
        return;
      }

      if (request.method === "GET" && pathname === "/oauth/authorize") {
        const params = Object.fromEntries(url.searchParams);
        if (state.authorizeBehavior) return state.authorizeBehavior(request, response, params);
        state.authorizeRequests.push(params);
        if (params.response_type !== "code" || params.code_challenge_method !== "S256"
          || !/^[A-Za-z0-9\-._~]{43,128}$/.test(params.code_challenge ?? "")
          || !/^[A-Za-z0-9._~-]{8,200}$/.test(params.state ?? "")) {
          response.writeHead(400, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "invalid_request" }));
          return;
        }
        const location = new URL(params.redirect_uri);
        location.searchParams.set("code", `zcc_code_${state.authorizeRequests.length}`);
        location.searchParams.set("state", params.state);
        // writeHead 之后必须 end,否则响应永不落盘、客户端 fetch 永久挂起。
        response.writeHead(302, { location: location.toString() });
        response.end();
        return;
      }

      if (request.method === "POST" && pathname === "/api/oauth/token") {
        const params = new URLSearchParams(await readBody(request));
        const body = Object.fromEntries(params);
        state.tokenRequests.push(body);
        if (body.grant_type === "authorization_code") {
          const lastAuthorize = state.authorizeRequests.at(-1);
          if (!body.code?.startsWith("zcc_") || !/^[A-Za-z0-9\-._~]{43,128}$/.test(body.code_verifier ?? "")
            || body.client_id !== "zc_client_1"
            || (lastAuthorize && sha256Base64Url(body.code_verifier) !== lastAuthorize.code_challenge)) {
            response.writeHead(400, { "content-type": "application/json" });
            response.end(JSON.stringify({ error: "invalid_grant" }));
            return;
          }
          issueTokens(response, body.scope);
          return;
        }
        if (body.grant_type === "refresh_token") {
          const entry = state.refreshLedger.get(body.refresh_token ?? "");
          if (!entry || entry.status !== "active") {
            response.writeHead(400, { "content-type": "application/json" });
            response.end(JSON.stringify({ error: "invalid_grant" }));
            return;
          }
          entry.status = "replaced";
          issueTokens(response, body.scope);
          return;
        }
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "unsupported_grant_type" }));
        return;
      }

      if (request.method === "POST" && pathname === "/api/oauth/revoke") {
        const params = new URLSearchParams(await readBody(request));
        state.revocations.push(Object.fromEntries(params));
        response.writeHead(200, { "content-type": "application/json" });
        response.end("{}");
        return;
      }

      if (request.method === "PUT" && pathname.startsWith("/api/hosting/bundles/")) {
        const token = pathname.slice("/api/hosting/bundles/".length);
        if (state.bundles.has(token)) {
          response.writeHead(410, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "already_used" }));
          return;
        }
        state.bundles.set(token, { bytes: await readBody(request, true), contentType: request.headers["content-type"] });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
        return;
      }

      if (request.method === "POST" && pathname === "/api/mcp") {
        const authorization = request.headers.authorization ?? "";
        const bearer = /^Bearer\s+(.+)$/.exec(authorization)?.[1] ?? "";
        const body = JSON.parse(await readBody(request));
        const protocolHeader = request.headers["mcp-protocol-version"] ?? null;
        if (!state.validBearers.has(bearer)) {
          response.writeHead(401, {
            "content-type": "application/json",
            "www-authenticate": `Bearer resource_metadata="http://placeholder.invalid/.well-known/oauth-protected-resource/api/mcp"`,
          });
          response.end(JSON.stringify({ error: "invalid_api_key" }));
          return;
        }
        state.mcpRequests.push({ method: body.method, protocolHeader, hasId: Object.hasOwn(body, "id") });
        if (body.method !== "initialize" && protocolHeader !== null && !SUPPORTED_PROTOCOLS.includes(protocolHeader)) {
          response.writeHead(400, { "content-type": "application/json" });
          response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id ?? null, error: { code: -32600, message: "Unsupported MCP-Protocol-Version" } }));
          return;
        }
        if (body.method === "initialize") {
          jsonRpc(response, body.id ?? null, {
            protocolVersion: state.negotiate,
            capabilities: { tools: {} },
            serverInfo: { name: "zaochang", title: "造场 Agent 接入", version: "1.0.0" },
          });
          return;
        }
        if (body.method === "notifications/initialized") {
          if (Object.hasOwn(body, "id")) throw new Error("notification 不应携带 id");
          response.writeHead(202);
          response.end();
          return;
        }
        if (body.method === "ping") {
          jsonRpc(response, body.id, {});
          return;
        }
        if (body.method === "tools/list") {
          jsonRpc(response, body.id, { tools: [
            { name: "list_my_products", description: "列出当前授权会员自己的项目及审核状态。", inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false } },
            { name: "get_product", description: "读取一个项目。", inputSchema: { type: "object", properties: { id: { type: "integer", minimum: 1 } }, required: ["id"], additionalProperties: false } },
          ] });
          return;
        }
        if (body.method === "tools/call") {
          const name = body.params?.name;
          const toolArguments = body.params?.arguments ?? {};
          state.toolCalls.push({ name, arguments: toolArguments, protocolHeader });
          if (name === "begin_hosting_upload") {
            jsonRpc(response, body.id, {
              content: [{ type: "text", text: "{}" }],
              structuredContent: {
                upload_url: `http://127.0.0.1:${server.address().port}/api/hosting/bundles/tok_${state.toolCalls.length}`,
                method: "PUT",
                content_type: "application/zip",
                expires_at: "2030-01-01T00:00:00.000Z",
                max_bytes: 10000,
                instructions: "one-time",
              },
            });
            return;
          }
          if (name === "get_hosting_status") {
            jsonRpc(response, body.id, {
              content: [{ type: "text", text: "{}" }],
              structuredContent: { hosting: { state: "queued", desired: "staged" }, next_step: "等待部署器。" },
            });
            return;
          }
          if (name === "fail_tool") {
            jsonRpc(response, body.id, {
              isError: true,
              content: [{ type: "text", text: "invalid_arguments" }],
              structuredContent: { error: "invalid_arguments" },
            });
            return;
          }
          jsonRpc(response, body.id, {
            content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
            structuredContent: { ok: true, got: toolArguments },
          });
          return;
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id ?? null, error: { code: -32601, message: "Method not found" } }));
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
    })().catch((error) => {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "fake_origin_error", detail: String(error?.message ?? error) }));
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const close = () => new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
  return { origin, state, close };
}

/** 模拟浏览器:跟随授权 302,把回调打到 CLI 的 loopback 服务器。 */
async function driveBrowserAuthorize(authorizeUrl) {
  const page = await fetch(authorizeUrl, { redirect: "manual" });
  assert.equal(page.status, 302, "authorize 应返回 302");
  const location = page.headers.get("location");
  assert.ok(location, "authorize 302 缺少 location");
  // 先构造一个被篡改 state 的回调:CLI 必须拒绝(400)并继续等待真正的回调。
  const tampered = new URL(location);
  tampered.searchParams.set("state", "tampered-state-1");
  const tamperedResponse = await fetch(tampered);
  assert.equal(tamperedResponse.status, 400, "state 不匹配的回调必须被 loopback 拒绝");
  const good = await fetch(location);
  assert.equal(good.status, 200, "正确回调应返回 200");
}

/**
 * 异步跑一次 CLI 子进程。必须用异步 spawn:假 origin 服务器跑在本进程,
 * spawnSync 会阻塞事件循环,子进程 fetch 不到响应 → 父子死锁。
 */
function runCli(args, { input = "", env = {}, timeoutMs = 30_000 } = {}) {
  return new Promise((resolve) => {
    // 先清掉宿主环境里可能存在的 ZC_API_KEY,再合并测试显式传入的 env。
    const childEnv = { ...process.env };
    delete childEnv.ZC_API_KEY;
    Object.assign(childEnv, env);
    const child = spawn(process.execPath, [ZC_ENTRY, ...args], { env: childEnv });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, stdout, stderr });
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({ status: null, timedOut: true });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => finish({ status: null, spawnError: String(error) }));
    child.on("close", (code) => finish({ status: code }));
    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

const FAKE_API_KEY = `zc_${"k".repeat(43)}`;

test("PKCE 与 state 的格式落在服务端约束内,挑战可由 verifier 复算", async () => {
  const { verifier, challenge } = await newPkce();
  assert.match(verifier, /^[A-Za-z0-9\-._~]{43,128}$/);
  assert.equal(challenge, sha256Base64Url(verifier));
  const state = newState();
  assert.match(state, /^[A-Za-z0-9._~-]{8,200}$/);
});

test("配置文件:缺失为 null、回写可读、损坏报错并给出修复提示、登出真删", (t) => {
  const file = tempConfigPath("config");
  process.env.ZC_CLI_CONFIG = file;
  t.after(() => { delete process.env.ZC_CLI_CONFIG; });
  assert.equal(loadConfig(), null);

  saveConfig(undefined, { origin: "https://example.test", auth: { mode: "oauth", clientId: "zc_c", clientName: "n", accessToken: "zca_a", refreshToken: "zcr_r", accessExpiresAt: 1 } });
  const loaded = loadConfig();
  assert.equal(loaded.origin, "https://example.test");
  assert.equal(loaded.auth.mode, "oauth");
  assert.equal(loaded.auth.refreshToken, "zcr_r");

  writeFileSync(file, "{not json", "utf8");
  assert.throws(() => loadConfig(), (error) => error instanceof CliError && /删除该文件/.test(error.hint ?? ""));

  clearConfig();
  assert.equal(loadConfig(), null);
});

test("runLogin 全流程:注册参数合规、PKCE 挑战交叉验证、令牌落袋", async (t) => {
  const fake = await startFakeOrigin();
  t.after(async () => { await fake.close(); });

  const login = await runLogin({
    origin: fake.origin,
    clientName: "zc CLI (test-box)",
    noBrowser: true,
    onAuthorizeUrl: (url) => driveBrowserAuthorize(url),
  });

  assert.equal(login.clientId, "zc_client_1");
  assert.match(login.tokens.access_token, /^zca_/);
  assert.match(login.tokens.refresh_token ?? "", /^zcr_/);

  const registration = fake.state.registrations.at(-1);
  assert.equal(registration.token_endpoint_auth_method, "none");
  assert.deepEqual(registration.grant_types, ["authorization_code", "refresh_token"]);
  assert.match(registration.redirect_uris[0], /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  assert.ok(!("client_secret" in registration));

  const authorize = fake.state.authorizeRequests.at(-1);
  assert.equal(authorize.response_type, "code");
  assert.equal(authorize.code_challenge_method, "S256");
  assert.equal(authorize.resource, `${fake.origin}/api/mcp`);
  assert.equal(authorize.redirect_uri, registration.redirect_uris[0]);

  const exchange = fake.state.tokenRequests.at(-1);
  assert.equal(exchange.grant_type, "authorization_code");
  assert.equal(exchange.client_id, "zc_client_1");
  assert.ok(exchange.code.startsWith("zcc_"));
  assert.equal(sha256Base64Url(exchange.code_verifier), authorize.code_challenge);
});

test("runLogin:用户在同意页拒绝(access_denied)时给出明确错误", async (t) => {
  const fake = await startFakeOrigin();
  t.after(async () => { await fake.close(); });
  fake.state.authorizeBehavior = (request, response, params) => {
    fake.state.authorizeRequests.push(params);
    const location = new URL(params.redirect_uri);
    location.searchParams.set("error", "access_denied");
    location.searchParams.set("state", params.state);
    response.writeHead(302, { location: location.toString() });
    response.end();
  };
  // 这里不走 driveBrowserAuthorize:那个驱动断言 302 后回调返回 200/400,
  // 而 access_denied 回调由 loopback 的 error 分支处理并直接让登录失败。
  const followAuthorize = async (url) => {
    const page = await fetch(url, { redirect: "manual" });
    const location = page.headers.get("location");
    assert.ok(location, "authorize 302 缺少 location");
    await fetch(location);
  };
  await assert.rejects(
    runLogin({ origin: fake.origin, noBrowser: true, onAuthorizeUrl: (url) => followAuthorize(url).catch(() => {}) }),
    (error) => error instanceof CliError && /access_denied/.test(error.message),
  );
});

test("runLogin:注册被服务端拒绝(如冒充平台名)时错误信息透传", async (t) => {
  const fake = await startFakeOrigin();
  t.after(async () => { await fake.close(); });
  fake.state.registerBehavior = (request, response) => {
    fake.state.registrations.push({});
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "invalid_client_metadata", error_description: "应用名称不能冒充造场官方、管理员或平台名称。" }));
  };
  await assert.rejects(
    runLogin({ origin: fake.origin, clientName: "造场官方", noBrowser: true }),
    (error) => error instanceof CliError && /冒充/.test(error.message),
  );
});

test("McpSession:initialize 协商、后续请求携带协议头、通知 202、工具列表", async (t) => {
  const fake = await startFakeOrigin();
  t.after(async () => { await fake.close(); });
  fake.state.validBearers.add("zca_ok");

  const session = new McpSession({ origin: fake.origin, tokenProvider: async () => "zca_ok" });
  const info = await session.initialize();
  assert.equal(info.serverInfo.title, "造场 Agent 接入");
  assert.equal(session.protocolVersion, "2025-06-18");

  const tools = await session.listTools();
  assert.equal(tools.length, 2);
  await session.ping();

  const initializeEntry = fake.state.mcpRequests.find((entry) => entry.method === "initialize");
  assert.equal(initializeEntry.protocolHeader, null, "initialize 请求不应带协议头");
  const later = fake.state.mcpRequests.filter((entry) => entry.method !== "initialize");
  assert.ok(later.length >= 3);
  for (const entry of later) assert.equal(entry.protocolHeader, "2025-06-18");
  const notification = fake.state.mcpRequests.find((entry) => entry.method === "notifications/initialized");
  assert.ok(notification, "必须发送 notifications/initialized");
  assert.equal(notification.hasId, false);
});

test("McpSession:服务端协商旧协议版本时采用服务端值", async (t) => {
  const fake = await startFakeOrigin();
  t.after(async () => { await fake.close(); });
  fake.state.negotiate = "2025-03-26";
  fake.state.validBearers.add("zca_ok");
  const session = new McpSession({ origin: fake.origin, tokenProvider: async () => "zca_ok" });
  await session.initialize();
  assert.equal(session.protocolVersion, "2025-03-26");
  await session.ping();
  const ping = fake.state.mcpRequests.find((entry) => entry.method === "ping");
  assert.equal(ping.protocolHeader, "2025-03-26");
});

test("McpSession:401 → 刷新一次 → 重试成功;不会再多刷", async (t) => {
  const fake = await startFakeOrigin();
  t.after(async () => { await fake.close(); });
  fake.state.validBearers.add("zca_a1");

  let current = "zca_a1";
  let invalidations = 0;
  const provider = async () => current;
  provider.invalidate = async () => {
    invalidations += 1;
    current = "zca_b2";
    fake.state.validBearers.add("zca_b2");
    return current;
  };

  const session = new McpSession({ origin: fake.origin, tokenProvider: provider });
  await session.initialize();
  await session.callTool("get_product", { id: 5 });
  // 服务端此刻吊销 a1:下一次调用 401,客户端应刷新到 b2 并重试成功。
  fake.state.validBearers.delete("zca_a1");
  const result = await session.callTool("get_product", { id: 6 });
  assert.equal(result.isError, undefined);
  assert.equal(invalidations, 1);
  const calls = fake.state.mcpRequests.filter((entry) => entry.method === "tools/call");
  assert.equal(calls.length, 2, "重试后 tools/call 总共两次");
});

test("oauthTokenProvider:过期主动刷新、轮换立刻落盘、旧令牌重放被拒后引导重登", async (t) => {
  const fake = await startFakeOrigin();
  t.after(async () => { await fake.close(); });
  const file = tempConfigPath("provider");
  process.env.ZC_CLI_CONFIG = file;
  t.after(() => { delete process.env.ZC_CLI_CONFIG; });

  // 直接在假服务端登记一枚可用刷新令牌(等价于一次成功登录的产物)。
  const seedRefresh = "zcr_seed" + "s".repeat(45);
  fake.state.refreshLedger.set(seedRefresh, { status: "active" });

  saveConfig(undefined, {
    origin: fake.origin,
    auth: { mode: "oauth", clientId: "zc_client_1", clientName: "n", accessToken: "zca_dead", refreshToken: seedRefresh, accessExpiresAt: Date.now() - 1000 },
  });

  const provider = oauthTokenProvider({
    origin: fake.origin,
    loadAuth: async () => loadConfig().auth,
    saveAuth: async (auth) => saveConfig(undefined, { ...(loadConfig() ?? {}), auth }),
  });

  const first = await provider();
  assert.match(first, /^zca_/);
  const afterRefresh = loadConfig();
  assert.notEqual(afterRefresh.auth.refreshToken, seedRefresh, "轮换后的新刷新令牌必须立刻落盘");
  assert.ok(afterRefresh.auth.accessExpiresAt > Date.now());

  const tokenRequestsBefore = fake.state.tokenRequests.length;
  await provider();
  assert.equal(fake.state.tokenRequests.length, tokenRequestsBefore, "令牌未过期时不得重复刷新");

  // 把最新落盘的刷新令牌标记为已被服务端替换(模拟重放/吊销),再强制刷新 → invalid_grant。
  const replaced = loadConfig().auth.refreshToken;
  fake.state.refreshLedger.get(replaced).status = "replaced";
  await assert.rejects(
    provider.invalidate(),
    (error) => error instanceof CliError && /重新运行 zc login/.test(error.hint ?? ""),
  );
});

test("CLI 子进程:login --api-key 格式非法不落盘;合法则保存并通过握手验证", async (t) => {
  const fake = await startFakeOrigin();
  t.after(async () => { await fake.close(); });
  const file = tempConfigPath("apikey-login");
  fake.state.validBearers.add(FAKE_API_KEY);

  const bad = await runCli(["login", "--api-key", "--origin", fake.origin, "--config", file], { input: "not-a-key\n" });
  assert.notEqual(bad.status, 0, "非法 key 必须失败");
  assert.equal(existsSync(file), false, "验证失败不得写入配置");

  const good = await runCli(["login", "--api-key", "--origin", fake.origin, "--config", file], { input: `${FAKE_API_KEY}\n` });
  assert.equal(good.status, 0, good.stderr);
  const saved = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(saved.auth.mode, "api_key");
  assert.equal(saved.auth.apiKey, FAKE_API_KEY);
  assert.ok(/验证通过/.test(good.stdout));

  const whoami = await runCli(["whoami", "--config", file]);
  assert.equal(whoami.status, 0, whoami.stderr);
  assert.match(whoami.stdout, /造场 Agent 接入/);
  assert.match(whoami.stdout, new RegExp(fake.origin));
});

test("CLI 子进程:call 的 --arg 解析(JSON 数字/纯文本)、协议头、isError 退出码", async (t) => {
  const fake = await startFakeOrigin();
  t.after(async () => { await fake.close(); });
  fake.state.validBearers.add(FAKE_API_KEY);

  const call = await runCli([
    "call", "echo_tool", "--origin", fake.origin,
    "--arg", "product_id=7", "--arg", "title=纯文本标题", "--arg", "price=3",
  ], { env: { ZC_API_KEY: FAKE_API_KEY } });
  assert.equal(call.status, 0, call.stderr);
  const output = JSON.parse(call.stdout);
  assert.equal(output.got.product_id, 7);
  assert.equal(output.got.title, "纯文本标题");
  assert.equal(output.got.price, 3);
  assert.equal(fake.state.toolCalls.at(-1).protocolHeader, "2025-06-18");

  const failed = await runCli(["call", "fail_tool", "--origin", fake.origin], { env: { ZC_API_KEY: FAKE_API_KEY } });
  assert.notEqual(failed.status, 0, "isError 必须以非零退出");
  assert.match(failed.stderr, /invalid_arguments/);
});

test("CLI 子进程:host upload 一条龙:申请地址→PUT 精确字节→查询状态;超限本地拒绝", async (t) => {
  const fake = await startFakeOrigin();
  t.after(async () => { await fake.close(); });
  const file = tempConfigPath("host");
  fake.state.validBearers.add(FAKE_API_KEY);
  saveConfig(file, { origin: fake.origin, auth: { mode: "api_key", apiKey: FAKE_API_KEY } });

  const dir = path.dirname(file);
  const zipPath = path.join(dir, "bundle.zip");
  const zipBytes = Buffer.from(Array.from({ length: 1000 }, (_, index) => index % 251));
  writeFileSync(zipPath, zipBytes);

  const upload = await runCli(["host", "upload", "7", zipPath, "--config", file]);
  assert.equal(upload.status, 0, upload.stderr);
  assert.match(upload.stdout, /上传完成/);

  assert.equal(fake.state.bundles.size, 1);
  const uploaded = [...fake.state.bundles.values()][0];
  assert.deepEqual(uploaded.bytes, zipBytes, "上传字节必须与本地文件完全一致");
  assert.equal(uploaded.contentType, "application/zip");
  assert.deepEqual(fake.state.toolCalls.map((entry) => entry.name), ["begin_hosting_upload", "get_hosting_status"]);
  assert.equal(fake.state.toolCalls[0].arguments.product_id, 7);

  const oversize = path.join(dir, "big.zip");
  writeFileSync(oversize, Buffer.alloc(20001));
  const rejected = await runCli(["host", "upload", "7", oversize, "--config", file]);
  assert.notEqual(rejected.status, 0, "超过 max_bytes 必须失败");
  assert.match(rejected.stderr, /超过托管上限/);
  assert.equal(fake.state.bundles.size, 1, "超限文件不得发起 PUT");
});

test("CLI 子进程:logout 吊销刷新令牌并删除本地凭据", async (t) => {
  const fake = await startFakeOrigin();
  t.after(async () => { await fake.close(); });
  const file = tempConfigPath("logout");
  saveConfig(file, {
    origin: fake.origin,
    auth: { mode: "oauth", clientId: "zc_client_1", clientName: "n", accessToken: "zca_a", refreshToken: "zcr_r", accessExpiresAt: Date.now() + 3600_000 },
  });
  const logout = await runCli(["logout", "--config", file]);
  assert.equal(logout.status, 0, logout.stderr);
  assert.equal(fake.state.revocations.length, 1);
  assert.equal(fake.state.revocations[0].token, "zcr_r");
  assert.equal(fake.state.revocations[0].client_id, "zc_client_1");
  assert.equal(existsSync(file), false, "登出后凭据文件必须被删除");
});

test("CLI 子进程:OAuth --no-browser 登录全程(授权 URL→回调→换令牌→ping)", async (t) => {
  const fake = await startFakeOrigin();
  t.after(async () => { await fake.close(); });
  const file = tempConfigPath("oauth-login");

  const childEnv = { ...process.env, ZC_CLI_CONFIG: file };
  delete childEnv.ZC_API_KEY;
  const child = spawn(process.execPath, [ZC_ENTRY, "login", "--origin", fake.origin, "--no-browser", "--config", file], { env: childEnv });
  t.after(() => child.kill());

  const authorizeUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("等授权 URL 超时")), 20_000);
    const rl = readline.createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      const match = /^\s*(https?:\/\/\S+)/.exec(line);
      if (match) {
        clearTimeout(timer);
        rl.close();
        resolve(match[1]);
      }
    });
    child.once("exit", (code) => reject(new Error(`login 提前退出(exit ${code}))`)));
  });
  assert.equal(new URL(authorizeUrl).pathname, "/oauth/authorize");
  await driveBrowserAuthorize(authorizeUrl);

  const exitCode = await new Promise((resolve) => child.once("exit", resolve));
  assert.equal(exitCode, 0);

  const saved = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(saved.auth.mode, "oauth");
  assert.equal(saved.auth.clientId, "zc_client_1");
  assert.match(saved.auth.accessToken, /^zca_/);
  assert.ok(saved.auth.accessExpiresAt > Date.now());

  const ping = await runCli(["ping", "--config", file]);
  assert.equal(ping.status, 0, ping.stderr);
  assert.match(ping.stdout, /pong/);
});

test("toolErrorSummary:错误码与 retryAfterSeconds 的呈现", () => {
  assert.equal(toolErrorSummary({ isError: true, structuredContent: { error: "validation_secret" } }), "validation_secret");
  assert.equal(
    toolErrorSummary({ isError: true, structuredContent: { error: "upload_capacity_exceeded", retryAfterSeconds: 42 } }),
    "upload_capacity_exceeded(retry after 42s)",
  );
  assert.equal(toolErrorSummary({ isError: true, content: [{ type: "text", text: "rate_limited" }] }), "rate_limited");
});
