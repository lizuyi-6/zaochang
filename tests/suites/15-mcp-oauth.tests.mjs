import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  adminEmail,
  authHeaders,
  baseUrl,
  executeLocalD1,
  onePixelPng,
  queryLocalD1 as queryLocalD1Raw,
  runId,
  uploadScannerRequestCount,
} from "../harness/preview.mjs";

// D1 本地查询返回 null 原型行;展开成普通对象后才能与字面量做 deepStrictEqual(与 suite 14 的 { ...row } 做法一致)。
const queryLocalD1 = async (sql) => (await queryLocalD1Raw(sql)).map((row) => ({ ...row }));
const quoteSql = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const jsonRpc = (method, params = {}) => ({ jsonrpc: "2.0", id: 1, method, params });
let registrationIpSequence = 1;

function sessionCookie(response) {
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];
  return cookies.find((value) => value.startsWith("zaochang_session="))?.split(";")[0] ?? null;
}

async function login(email) {
  const response = await fetch(`${baseUrl}/api/auth/dev-login?email=${encodeURIComponent(email)}`, {
    headers: { origin: baseUrl },
    redirect: "manual",
  });
  assert.equal(response.status, 307);
  const cookie = sessionCookie(response);
  assert.ok(cookie);
  return cookie;
}

async function registerDynamic({
  name = `MCP client ${runId}`,
  redirectUri = `http://127.0.0.1:43127/callback/${runId}`,
  scope,
  ip = `203.0.113.${registrationIpSequence++}`,
  ...metadata
} = {}) {
  const payload = { redirect_uris: [redirectUri], client_name: name, ...metadata };
  if (scope !== undefined) payload.scope = scope;
  const response = await fetch(`${baseUrl}/api/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(payload),
  });
  return { response, body: await response.json().catch(() => null) };
}

async function pkce() {
  const verifier = `v${"a".repeat(42)}${Math.random().toString(36).slice(2, 15)}`.slice(0, 64);
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

function authorizeUrl({ clientId, redirectUri, scope = "mcp:projects", resource = `${baseUrl}/api/mcp`, state, challenge }) {
  const url = new URL(`${baseUrl}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  if (scope !== null) url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (resource !== null) url.searchParams.set("resource", resource);
  return url;
}

async function consent({ cookie, clientId, redirectUri, scope = "mcp:projects", resource = `${baseUrl}/api/mcp`, state = `state-${runId}-${Math.random().toString(36).slice(2)}` }) {
  const { verifier, challenge } = await pkce();
  const url = authorizeUrl({ clientId, redirectUri, scope, resource, state, challenge });
  const page = await fetch(url, { headers: { cookie } });
  const html = await page.text();
  const requestToken = html.match(/name="request_token" value="([^"]+)"/)?.[1];
  return { page, html, requestToken, verifier, challenge, state, url };
}

// 同意提交后返回中转页(meta refresh),不再 303:同意页 CSP 为 form-action 'self',浏览器会拦截
// 表单提交后跳往客户端回调的重定向(2026-10-12 生产实测 Claude Code 登录卡住)。断言 CSP 未被放宽。
async function consentCallback(response) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html/);
  assert.equal(response.headers.get("location"), null);
  assert.match(response.headers.get("content-security-policy") ?? "", /form-action 'self';/);
  const html = await response.text();
  const target = html.match(/<meta http-equiv="refresh" content="0;url=([^"]+)">/)?.[1];
  assert.ok(target, html.slice(0, 300));
  return new URL(target.replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&"));
}

async function approve({ cookie, requestToken, decision = "allow" }) {
  return fetch(`${baseUrl}/api/oauth/authorize`, {
    method: "POST",
    redirect: "manual",
    headers: { cookie, origin: baseUrl, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ request_token: requestToken, decision }),
  });
}

async function exchangeCode({ clientId, code, redirectUri, verifier, resource = `${baseUrl}/api/mcp`, extra = {} }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    ...(resource === null ? {} : { resource }),
    ...extra,
  });
  return fetch(`${baseUrl}/api/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

async function mcp(token, method, params = {}, headers = {}) {
  return fetch(`${baseUrl}/api/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, origin: baseUrl, "content-type": "application/json", ...headers },
    body: JSON.stringify(jsonRpc(method, params)),
  });
}

async function oauthFlow({ email, name = `Flow client ${runId}`, redirectUri = `http://127.0.0.1:43218/callback/${runId}`, scope = "mcp:projects", ip } = {}) {
  const cookie = await login(email);
  const registered = await registerDynamic({ name, redirectUri, scope, ip });
  assert.equal(registered.response.status, 201, JSON.stringify(registered.body));
  const pending = await consent({ cookie, clientId: registered.body.client_id, redirectUri, scope });
  assert.equal(pending.page.status, 200);
  assert.ok(pending.requestToken);
  const allowed = await approve({ cookie, requestToken: pending.requestToken });
  const callback = await consentCallback(allowed);
  assert.equal(callback.origin, new URL(redirectUri).origin);
  assert.equal(callback.searchParams.get("state"), pending.state);
  const codeResponse = await exchangeCode({
    clientId: registered.body.client_id,
    code: callback.searchParams.get("code"),
    redirectUri,
    verifier: pending.verifier,
  });
  assert.equal(codeResponse.status, 200);
  return { cookie, registered: registered.body, pending, tokens: await codeResponse.json(), callback };
}

async function createApiKey(cookie) {
  const response = await fetch(`${baseUrl}/api/api-keys`, {
    method: "POST",
    headers: { cookie, origin: baseUrl, "content-type": "application/json" },
    body: JSON.stringify({ name: "OAuth test key", expires_in_days: 30 }),
  });
  assert.equal(response.status, 201);
  return response.json();
}

async function createDeveloperClient(email, cookie, { name = `OIDC app ${runId}`, redirectUri = `https://client-${runId}.example/callback` } = {}) {
  const response = await fetch(`${baseUrl}/api/developer/clients`, {
    method: "POST",
    headers: { ...authHeaders("OIDC test developer", email), cookie, origin: baseUrl },
    body: JSON.stringify({
      name,
      description: "Ordinary OIDC profile test client",
      websiteUrl: "https://developer.example/app",
      redirectUris: [redirectUri],
      clientType: "confidential",
      allowedScopes: "openid profile",
    }),
  });
  const text = await response.text();
  assert.equal(response.status, 201, text);
  return JSON.parse(text).client;
}

async function authorizeDeveloperClient({ client, cookie, redirectUri, email }) {
  const pending = await consent({
    cookie,
    clientId: client.clientId,
    redirectUri,
    scope: "openid profile",
    resource: null,
  });
  assert.equal(pending.page.status, 200);
  assert.ok(pending.requestToken);
  const allowed = await approve({ cookie, requestToken: pending.requestToken });
  const callback = await consentCallback(allowed);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: client.clientId,
    client_secret: client.clientSecret,
    code: callback.searchParams.get("code"),
    redirect_uri: redirectUri,
    code_verifier: pending.verifier,
  });
  const tokenResponse = await fetch(`${baseUrl}/api/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  assert.equal(tokenResponse.status, 200, `developer token for ${email}`);
  return tokenResponse.json();
}

export function register() {
  test("mcp oauth: resource, authorization-server, OIDC discovery and unauthenticated challenge metadata", async () => {
    const protectedPaths = ["/.well-known/oauth-protected-resource/api/mcp", "/.well-known/oauth-protected-resource"];
    for (const path of protectedPaths) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("access-control-allow-origin"), "*");
      assert.deepEqual(await response.json(), {
        resource: `${baseUrl}/api/mcp`,
        authorization_servers: [baseUrl],
        scopes_supported: ["mcp:projects"],
        bearer_methods_supported: ["header"],
      });
    }
    const preflight = await fetch(`${baseUrl}/.well-known/oauth-protected-resource/api/mcp`, { method: "OPTIONS" });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-methods"), "GET, OPTIONS");
    const forbiddenMethod = await fetch(`${baseUrl}/.well-known/oauth-protected-resource/api/mcp`, { method: "POST" });
    assert.equal(forbiddenMethod.status, 405);

    const authorizationServer = await (await fetch(`${baseUrl}/.well-known/oauth-authorization-server`)).json();
    assert.equal(authorizationServer.issuer, baseUrl);
    assert.equal(authorizationServer.authorization_endpoint, `${baseUrl}/oauth/authorize`);
    assert.equal(authorizationServer.token_endpoint, `${baseUrl}/api/oauth/token`);
    assert.equal(authorizationServer.registration_endpoint, `${baseUrl}/api/oauth/register`);
    assert.equal(authorizationServer.revocation_endpoint, `${baseUrl}/api/oauth/revoke`);
    assert.deepEqual(authorizationServer.response_types_supported, ["code"]);
    assert.deepEqual(authorizationServer.grant_types_supported, ["authorization_code", "refresh_token"]);
    assert.deepEqual(authorizationServer.code_challenge_methods_supported, ["S256"]);
    assert.equal(authorizationServer.token_endpoint_auth_methods_supported.includes("none"), true);
    // 只公布 MCP scope:Codex CLI 实测会把该列表原样用于动态注册(公布全量 scope 时注册被 400 拒绝)。
    assert.deepEqual(authorizationServer.scopes_supported, ["mcp:projects"]);

    const registrationOptions = await fetch(`${baseUrl}/api/oauth/register`, { method: "OPTIONS" });
    assert.equal(registrationOptions.status, 204);
    assert.equal(registrationOptions.headers.get("access-control-allow-origin"), "*");
    assert.equal(registrationOptions.headers.get("access-control-allow-methods"), "POST, OPTIONS");

    const oidc = await (await fetch(`${baseUrl}/.well-known/openid-configuration`)).json();
    assert.equal(oidc.registration_endpoint, `${baseUrl}/api/oauth/register`);
    assert.equal(oidc.scopes_supported.includes("mcp:projects"), true);
    assert.equal(oidc.scopes_supported.includes("fruit:pay"), true, "the existing fruit scope remains advertised");

    const noBearer = await fetch(`${baseUrl}/api/mcp`, {
      method: "POST",
      headers: { origin: baseUrl, "content-type": "application/json" },
      body: JSON.stringify(jsonRpc("tools/list")),
    });
    assert.equal(noBearer.status, 401);
    assert.match(noBearer.headers.get("www-authenticate") ?? "", new RegExp(`resource_metadata="${baseUrl.replaceAll(".", "\\.")}/\\.well-known/oauth-protected-resource/api/mcp"`));
    const cookie = await login(`mcp-oauth-cookie-${runId}@example.com`);
    const cookieOnly = await fetch(`${baseUrl}/api/mcp`, {
      method: "POST",
      headers: { cookie, origin: baseUrl, "content-type": "application/json" },
      body: JSON.stringify(jsonRpc("tools/list")),
    });
    assert.equal(cookieOnly.status, 401);
    const crossOrigin = await fetch(`${baseUrl}/api/mcp`, {
      method: "POST",
      headers: { authorization: "Bearer zc_invalid", origin: "https://attacker.example", "content-type": "application/json" },
      body: JSON.stringify(jsonRpc("tools/list")),
    });
    assert.equal(crossOrigin.status, 403);
    assert.equal((await crossOrigin.json()).error, "origin_not_allowed");
  });

  test("mcp oauth: dynamic registration validates metadata, stores no owner, and enforces IP/capacity limits", async () => {
    for (const [host, index] of [["localhost", 1], ["127.0.0.1", 2], ["[::1]", 3]]) {
      const redirectUri = `http://${host}:441${index}/oauth/callback`;
      const result = await registerDynamic({ name: `Unverified test client ${index}`, redirectUri, ip: `198.51.100.${40 + index}` });
      assert.equal(result.response.status, 201, JSON.stringify(result.body));
      assert.equal(result.body.token_endpoint_auth_method, "none");
      assert.equal(result.body.scope, "mcp:projects", "registration without scope defaults to MCP projects");
      assert.equal(result.body.client_id_issued_at > 0, true);
      assert.equal(result.body.client_name, `Unverified test client ${index}`);
      assert.deepEqual(result.body.redirect_uris, [redirectUri]);
      assert.deepEqual(result.body.response_types, ["code"]);
      assert.equal(result.body.grant_types.includes("authorization_code"), true);
      assert.equal(Object.hasOwn(result.body, "client_secret"), false);
      assert.equal(Object.hasOwn(result.body, "registration_access_token"), false);
      const row = await queryLocalD1(
        `SELECT registration_source, owner_email, client_type, write_access_approved, review_status, allowed_scopes FROM oauth_provider_clients WHERE client_id = ${quoteSql(result.body.client_id)}`,
      );
      assert.deepEqual(row, [{ registration_source: "dynamic", owner_email: null, client_type: "public", write_access_approved: 0, review_status: "unverified", allowed_scopes: "mcp:projects" }]);
    }

    const openidClient = await registerDynamic({ name: `OpenID MCP client ${runId}`, scope: "openid mcp:projects", ip: "198.51.100.39" });
    assert.equal(openidClient.response.status, 201);
    assert.equal(openidClient.body.scope, "openid mcp:projects");
    assert.deepEqual(await queryLocalD1(`SELECT allowed_scopes FROM oauth_provider_clients WHERE client_id = ${quoteSql(openidClient.body.client_id)}`), [{ allowed_scopes: "openid mcp:projects" }]);
    // Codex CLI 0.162 实测:注册时发送空字符串 scope;必须视同未提供并默认 mcp:projects(真实客户端曾因此被 400 拒绝)。
    const emptyScope = await registerDynamic({ name: `Empty scope client ${runId}`, scope: "", redirectUri: `http://127.0.0.1:43129/empty/${runId}`, ip: "198.51.100.33" });
    assert.equal(emptyScope.response.status, 201, JSON.stringify(emptyScope.body));
    assert.equal(emptyScope.body.scope, "mcp:projects");
    assert.deepEqual(await queryLocalD1(`SELECT allowed_scopes FROM oauth_provider_clients WHERE client_id = ${quoteSql(emptyScope.body.client_id)}`), [{ allowed_scopes: "mcp:projects" }]);
    // Claude Code 2.1.296 实测:注册名为 "Claude Code (<用户本地服务器名>)";按文档把服务器命名为 zaochang 时
    // 括号内含品牌词,不能因此拒绝(真实客户端曾被 400 拒绝)。
    const claudeCodeName = await registerDynamic({ name: "Claude Code (zaochang)", redirectUri: "http://localhost:41348/callback", ip: "198.51.100.32" });
    assert.equal(claudeCodeName.response.status, 201, JSON.stringify(claudeCodeName.body));
    assert.equal(claudeCodeName.body.client_name, "Claude Code (zaochang)");
    const sanitized = await registerDynamic({ name: "  AI\u0000   helper  ", redirectUri: "https://sanitized.example/callback", ip: "198.51.100.37" });
    assert.equal(sanitized.response.status, 201);
    assert.equal(sanitized.body.client_name, "AI helper");
    const unnamedResponse = await fetch(`${baseUrl}/api/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.38" },
      body: JSON.stringify({ redirect_uris: ["https://unnamed.example/callback"] }),
    });
    assert.equal(unnamedResponse.status, 201);
    assert.equal((await unnamedResponse.json()).client_name, "未命名 AI 客户端");

    const beforeInvalid = Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM oauth_provider_clients WHERE registration_source = 'dynamic'`))[0].count);
    const invalids = [
      { name: "custom scheme", redirect_uris: ["vscode://oauth/callback"] },
      { name: "non-loopback http", redirect_uris: ["http://192.168.1.25:4410/callback"] },
      { name: "userinfo", redirect_uris: ["https://user@client.example/callback"] },
      { name: "fragment", redirect_uris: ["https://client.example/callback#token"] },
      { name: "fruit scope", redirect_uris: ["https://client.example/callback"], scope: "mcp:projects fruit:pay" },
      { name: "email scope", redirect_uris: ["https://client.example/callback"], scope: "mcp:projects email" },
      { name: "client secret method", redirect_uris: ["https://client.example/callback"], token_endpoint_auth_method: "client_secret_basic" },
      { name: "fullwidth admin impersonation", redirect_uris: ["https://client.example/callback"], client_name: "ＡＤＭＩＮ helper" },
      { name: "brand impersonation before a parenthetical", redirect_uris: ["https://client.example/callback"], client_name: "造场官方 (Claude Code)" },
      { name: "parenthetical-only brand name", redirect_uris: ["https://client.example/callback"], client_name: "(zaochang)" },
      { name: "unsupported grant", redirect_uris: ["https://client.example/callback"], grant_types: ["client_credentials"] },
      { name: "unsupported response", redirect_uris: ["https://client.example/callback"], response_types: ["token"] },
      { name: "six redirect URIs", redirect_uris: Array.from({ length: 6 }, (_, index) => `https://client.example/${index}`) },
      { name: "client name over 60 characters", redirect_uris: ["https://client.example/callback"], client_name: "x".repeat(61) },
    ];
    for (const [index, metadata] of invalids.entries()) {
      const response = await fetch(`${baseUrl}/api/oauth/register`, {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": `198.51.100.${80 + index}` },
        body: JSON.stringify({ redirect_uris: ["https://client.example/callback"], client_name: `invalid-${index}`, ...metadata }),
      });
      assert.equal(response.status, 400, metadata.name);
      assert.equal((await response.json()).error, "invalid_client_metadata", metadata.name);
    }
    const tooLarge = await fetch(`${baseUrl}/api/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.99" },
      body: JSON.stringify({ redirect_uris: ["https://client.example/callback"], client_name: "x".repeat(17 * 1024) }),
    });
    assert.equal(tooLarge.status, 400);
    assert.equal((await tooLarge.json()).error, "invalid_client_metadata");
    assert.equal(Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM oauth_provider_clients WHERE registration_source = 'dynamic'`))[0].count), beforeInvalid);

    const rateIp = "198.51.100.121";
    const rateBefore = Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM oauth_provider_clients WHERE registration_source = 'dynamic'`))[0].count);
    for (let index = 0; index < 10; index += 1) {
      const created = await registerDynamic({ name: `same-ip-${index}-${runId}`, redirectUri: `https://same-ip.example/${index}`, ip: rateIp });
      assert.equal(created.response.status, 201, `same IP registration ${index + 1}`);
    }
    const eleventh = await registerDynamic({ name: `same-ip-11-${runId}`, redirectUri: "https://same-ip.example/11", ip: rateIp });
    assert.equal(eleventh.response.status, 429);
    assert.equal(eleventh.body.error, "rate_limit_exceeded");
    assert.equal(Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM oauth_provider_clients WHERE registration_source = 'dynamic'`))[0].count), rateBefore + 10);

    const illegalClientId = `invalid-dynamic-sql-${runId}`;
    const illegalSql = `INSERT INTO oauth_provider_clients (client_id, owner_email, name, description, website_url, client_type, client_secret_hash, allowed_scopes, status, review_status, write_access_approved, registration_source) VALUES (${quoteSql(illegalClientId)}, NULL, 'bad', '', '', 'public', NULL, 'fruit:pay', 'active', 'verified', 1, 'dynamic')`;
    const insertFailure = await executeLocalD1(illegalSql, false);
    assert.match(insertFailure, /CHECK constraint failed|Constraint failed|constraint/);
    assert.deepEqual(await queryLocalD1(`SELECT client_id FROM oauth_provider_clients WHERE client_id = ${quoteSql(illegalClientId)}`), []);

    const eligibleBeforeSeed = Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM oauth_provider_clients c WHERE c.registration_source = 'dynamic' AND c.created_at >= datetime('now', '-7 days') AND NOT EXISTS (SELECT 1 FROM oauth_provider_consents x WHERE x.client_id = c.client_id) AND NOT EXISTS (SELECT 1 FROM oauth_provider_access_tokens x WHERE x.client_id = c.client_id) AND NOT EXISTS (SELECT 1 FROM oauth_provider_refresh_tokens x WHERE x.client_id = c.client_id)`))[0].count);
    const capacityToSeed = Math.max(0, 2000 - eligibleBeforeSeed);
    if (capacityToSeed > 0) {
      const recursiveSeed = `WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < ${capacityToSeed}) INSERT INTO oauth_provider_clients (client_id, owner_email, name, description, website_url, client_type, client_secret_hash, allowed_scopes, status, review_status, write_access_approved, registration_source, allowed_grants) SELECT 'capacity-${runId}-' || x, NULL, 'capacity fixture', '', '', 'public', NULL, 'mcp:projects', 'active', 'unverified', 0, 'dynamic', 'authorization_code refresh_token' FROM n`;
      await executeLocalD1(recursiveSeed);
    }
    const capacityBefore = Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM oauth_provider_clients WHERE registration_source = 'dynamic'`))[0].count);
    const full = await registerDynamic({ name: `capacity check ${runId}`, redirectUri: "https://capacity.example/callback", ip: "198.51.100.122" });
    assert.equal(full.response.status, 429);
    assert.equal(full.body.error, "registration_capacity_exceeded");
    assert.equal(Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM oauth_provider_clients WHERE registration_source = 'dynamic'`))[0].count), capacityBefore);
    await executeLocalD1(`DELETE FROM oauth_provider_clients WHERE client_id LIKE ${quoteSql(`capacity-${runId}-%`)}`);
  });

  test("mcp oauth: dynamic clients default to mcp:projects when the authorization request omits scope", async () => {
    const email = `mcp-oauth-noscope-${runId}@example.com`;
    const cookie = await login(email);
    const redirectUri = `http://127.0.0.1:43131/noscope/${runId}`;
    const registered = await registerDynamic({ name: `No scope ${runId}`, redirectUri, ip: "198.51.100.34" });
    assert.equal(registered.response.status, 201, JSON.stringify(registered.body));
    const pending = await consent({ cookie, clientId: registered.body.client_id, redirectUri, scope: null });
    assert.equal(pending.page.status, 200);
    assert.ok(pending.requestToken, pending.html.slice(0, 500));
    assert.deepEqual(
      await queryLocalD1(`SELECT scope, resource FROM oauth_provider_authorization_requests WHERE client_id = ${quoteSql(registered.body.client_id)}`),
      [{ scope: "mcp:projects", resource: `${baseUrl}/api/mcp` }],
    );

    // 开发者手动注册的客户端不享受该默认:不带 scope 仍被拒绝,且不落授权请求行(行为不变)。
    const devRedirect = `https://noscope-${runId}.example/callback`;
    const developer = await createDeveloperClient(email, cookie, { redirectUri: devRedirect });
    const devPending = await consent({ cookie, clientId: developer.clientId, redirectUri: devRedirect, scope: null, resource: null });
    assert.equal(devPending.requestToken, undefined);
    assert.deepEqual(await queryLocalD1(`SELECT request_hash FROM oauth_provider_authorization_requests WHERE client_id = ${quoteSql(developer.clientId)}`), []);
  });

  test("mcp oauth: browser consent returns resource-bound project access and write audit", async () => {
    const email = `mcp-oauth-main-${runId}@example.com`;
    const redirectUri = `http://127.0.0.1:45219/oauth/callback/${runId}`;
    const cookie = await login(email);
    const registered = await registerDynamic({ name: "Claude Code", redirectUri, ip: "198.51.100.131" });
    assert.equal(registered.response.status, 201);
    const anonymous = await fetch(registered.body.redirect_uris.length
      ? authorizeUrl({ clientId: registered.body.client_id, redirectUri, state: `anon-state-${runId}`, challenge: (await pkce()).challenge })
      : `${baseUrl}/oauth/authorize`);
    assert.equal(anonymous.status, 200);
    const anonymousHtml = await anonymous.text();
    assert.match(anonymousHtml, /\/signin\?return_to=%2Foauth%2Fauthorize%3F/);
    assert.match(anonymousHtml, new RegExp(encodeURIComponent(registered.body.client_id)));

    const pending = await consent({ cookie, clientId: registered.body.client_id, redirectUri, resource: null, state: `main-state-${runId}` });
    assert.equal(pending.page.status, 200);
    assert.match(pending.html, /未经验证的 AI 客户端（自动注册）/);
    assert.match(pending.html, /自称：/);
    assert.match(pending.html, /127\.0\.0\.1:45219/);
    assert.match(pending.html, new RegExp(redirectUri.replaceAll(".", "\\.")));
    assert.match(pending.html, /如果你此刻没有在用 AI 客户端连接造场/);
    assert.match(pending.html, /通过 AI 助手查看、提交、修改你的项目并上传封面/);
    assert.match(pending.html, /提交与修改都会重新审核/);
    assert.match(pending.html, /不能动果子、不能读邮箱/);
    const allowed = await approve({ cookie, requestToken: pending.requestToken });
    const callback = await consentCallback(allowed);
    assert.equal(callback.origin, new URL(redirectUri).origin);
    assert.equal(callback.searchParams.get("state"), pending.state);
    const wrongResourceTokenResponse = await exchangeCode({
      clientId: registered.body.client_id,
      code: callback.searchParams.get("code"),
      redirectUri,
      verifier: pending.verifier,
      resource: "https://attacker.example/api/mcp",
    });
    assert.equal(wrongResourceTokenResponse.status, 400);
    assert.equal((await wrongResourceTokenResponse.json()).error, "invalid_target");
    const tokenResponse = await exchangeCode({
      clientId: registered.body.client_id,
      code: callback.searchParams.get("code"),
      redirectUri,
      verifier: pending.verifier,
      resource: null,
    });
    assert.equal(tokenResponse.status, 200);
    const tokens = await tokenResponse.json();
    assert.equal(Object.hasOwn(tokens, "id_token"), false, "no openid scope means no ID token");
    assert.equal(tokens.scope, "mcp:projects");
    const tokenRow = await queryLocalD1(`SELECT resource FROM oauth_provider_access_tokens WHERE token_hash = ${quoteSql(sha256(tokens.access_token))}`);
    assert.deepEqual(tokenRow, [{ resource: `${baseUrl}/api/mcp` }]);

    const tools = await mcp(tokens.access_token, "tools/list");
    assert.equal(tools.status, 200);
    assert.deepEqual((await tools.json()).result.tools.map((tool) => tool.name), ["list_my_products", "get_product", "create_product", "update_product", "upload_cover"]);
    const before = Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM products WHERE owner_email = ${quoteSql(email)}`))[0].count);
    const created = await mcp(tokens.access_token, "tools/call", {
      name: "create_product",
      arguments: { title: "OAuth project", description: "A project created through the browser-authorized MCP flow.", category: "开发工具" },
    });
    assert.equal(created.status, 200);
    const createdResult = (await created.json()).result;
    assert.equal(createdResult.isError, undefined);
    const productId = createdResult.structuredContent.product.id;
    const product = await queryLocalD1(`SELECT owner_email, review_status FROM products WHERE id = ${Number(productId)}`);
    assert.deepEqual(product, [{ owner_email: email, review_status: "pending_review" }]);
    const ownList = await mcp(tokens.access_token, "tools/call", { name: "list_my_products" });
    const ownProducts = (await ownList.json()).result.structuredContent.products;
    assert.equal(ownProducts.some((item) => item.id === productId), true);
    const ownGet = await mcp(tokens.access_token, "tools/call", { name: "get_product", arguments: { id: productId } });
    assert.equal((await ownGet.json()).result.structuredContent.product.id, productId);
    const otherEmail = `mcp-oauth-foreign-${runId}@example.com`;
    const otherCookie = await login(otherEmail);
    const otherCreated = await fetch(`${baseUrl}/api/products`, {
      method: "POST",
      headers: { cookie: otherCookie, origin: baseUrl, "content-type": "application/json" },
      body: JSON.stringify({ title: "Another member project", description: "This project belongs to a different member account.", category: "开发工具" }),
    });
    assert.equal(otherCreated.status, 201);
    const foreignProductId = (await otherCreated.json()).product.id;
    const ownListAfterForeign = await mcp(tokens.access_token, "tools/call", { name: "list_my_products" });
    assert.equal((await ownListAfterForeign.json()).result.structuredContent.products.some((item) => item.id === foreignProductId), false);
    const foreignGet = await mcp(tokens.access_token, "tools/call", { name: "get_product", arguments: { id: foreignProductId } });
    assert.equal((await foreignGet.json()).result.structuredContent.error, "not_owned");
    const audits = await queryLocalD1(`SELECT member_email, credential_kind, credential_id, tool_name, product_id, result FROM mcp_write_audit WHERE member_email = ${quoteSql(email)}`);
    assert.deepEqual(audits, [{ member_email: email, credential_kind: "oauth", credential_id: registered.body.client_id, tool_name: "create_product", product_id: Number(productId), result: "ok" }]);
    assert.equal(Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM products WHERE owner_email = ${quoteSql(email)}`))[0].count), before + 1);

    const updated = await mcp(tokens.access_token, "tools/call", { name: "update_product", arguments: { id: productId, title: "OAuth updated project" } });
    assert.equal((await updated.json()).result.isError, undefined);
    const uploaded = await mcp(tokens.access_token, "tools/call", { name: "upload_cover", arguments: { filename: "oauth-cover.png", mime_type: "image/png", data_base64: onePixelPng.toString("base64") } });
    assert.equal((await uploaded.json()).result.isError, undefined);
    const writeRows = await queryLocalD1(`SELECT credential_kind, credential_id, tool_name, result FROM mcp_write_audit WHERE member_email = ${quoteSql(email)} ORDER BY created_at, rowid`);
    assert.deepEqual(writeRows.map((row) => [row.credential_kind, row.credential_id, row.tool_name, row.result]), [
      ["oauth", registered.body.client_id, "create_product", "ok"],
      ["oauth", registered.body.client_id, "update_product", "ok"],
      ["oauth", registered.body.client_id, "upload_cover", "ok"],
    ]);

    const userinfo = await fetch(`${baseUrl}/api/oauth/userinfo`, { headers: { authorization: `Bearer ${tokens.access_token}` } });
    assert.equal(userinfo.status, 401);
    assert.equal((await userinfo.json()).error, "invalid_token");
  });

  test("mcp oauth: audit insert failure blocks writes; audit update failure leaves explicit incomplete evidence after write", async () => {
    const email = `mcp-oauth-audit-failure-${runId}@example.com`;
    const flow = await oauthFlow({ email, ip: "198.51.100.139" });
    const suffix = runId.replace(/[^a-zA-Z0-9]/g, "");
    const insertTrigger = `mcp_audit_insert_fail_${suffix}`;
    const updateTrigger = `mcp_audit_update_fail_${suffix}`;
    const productCount = async () => Number((await queryLocalD1(
      `SELECT COUNT(*) AS count FROM products WHERE owner_email = ${quoteSql(email)}`,
    ))[0].count);
    const before = await productCount();

    await executeLocalD1(`CREATE TRIGGER "${insertTrigger}" BEFORE INSERT ON mcp_write_audit
      WHEN NEW.member_email = ${quoteSql(email)}
      BEGIN SELECT RAISE(ABORT, 'test_audit_insert_failure'); END`);
    try {
      const blocked = await mcp(flow.tokens.access_token, "tools/call", {
        name: "create_product",
        arguments: { title: `Audit insert blocked ${runId}`, description: "Audit failure before write.", category: "开发工具" },
      });
      const result = (await blocked.json()).result;
      assert.equal(result.isError, true);
      assert.equal(result.structuredContent.error, "audit_unavailable");
      assert.equal(await productCount(), before, "audit insert failure must stop before product mutation");
      assert.deepEqual(await queryLocalD1(`SELECT id FROM mcp_write_audit WHERE member_email = ${quoteSql(email)}`), []);
    } finally {
      await executeLocalD1(`DROP TRIGGER IF EXISTS "${insertTrigger}"`);
    }

    await executeLocalD1(`CREATE TRIGGER "${updateTrigger}" BEFORE UPDATE ON mcp_write_audit
      WHEN OLD.member_email = ${quoteSql(email)}
      BEGIN SELECT RAISE(ABORT, 'test_audit_update_failure'); END`);
    try {
      const writtenTitle = `Audit late ${runId}`;
      const uncertain = await mcp(flow.tokens.access_token, "tools/call", {
        name: "create_product",
        arguments: { title: writtenTitle, description: "The product write may precede audit result update.", category: "开发工具" },
      });
      const result = (await uncertain.json()).result;
      assert.equal(result.isError, true);
      assert.equal(result.structuredContent.error, "audit_unavailable");
      assert.equal(await productCount(), before + 1, "audit update failure occurs after the product write takes effect");
      assert.deepEqual(await queryLocalD1(`SELECT title, owner_email, review_status FROM products WHERE title = ${quoteSql(writtenTitle)}`), [
        { title: writtenTitle, owner_email: email, review_status: "pending_review" },
      ]);
      assert.deepEqual(await queryLocalD1(`SELECT result, product_id FROM mcp_write_audit WHERE member_email = ${quoteSql(email)}`), [
        { result: "audit_incomplete", product_id: null },
      ]);
    } finally {
      await executeLocalD1(`DROP TRIGGER IF EXISTS "${updateTrigger}"`);
    }
  });

  test("mcp oauth: resource mismatch and ordinary developer OIDC tokens cannot operate project tools", async () => {
    const email = `mcp-oauth-audience-${runId}@example.com`;
    const cookie = await login(email);
    const dynamic = await registerDynamic({ name: `audience ${runId}`, redirectUri: `http://localhost:45881/callback/${runId}`, ip: "198.51.100.141" });
    assert.equal(dynamic.response.status, 201);
    const wrongTarget = await consent({ cookie, clientId: dynamic.body.client_id, redirectUri: dynamic.body.redirect_uris[0], resource: "https://attacker.example/api/mcp" });
    assert.match(wrongTarget.html, /invalid_target/);
    assert.deepEqual(await queryLocalD1(`SELECT request_hash FROM oauth_provider_authorization_requests WHERE client_id = ${quoteSql(dynamic.body.client_id)}`), []);

    const redirectUri = `https://oidc-${runId}.example/callback`;
    const developer = await createDeveloperClient(email, cookie, { redirectUri });
    const oidcTokens = await authorizeDeveloperClient({ client: developer, cookie, redirectUri, email });
    const before = Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM products WHERE owner_email = ${quoteSql(email)}`))[0].count);
    const invalidAudience = await mcp(oidcTokens.access_token, "tools/call", {
      name: "create_product",
      arguments: { title: "Must not exist", description: "An ordinary OIDC token has no MCP audience and cannot write.", category: "开发工具" },
    });
    assert.equal(invalidAudience.status, 401);
    assert.equal((await invalidAudience.json()).error, "invalid_token");
    assert.match(invalidAudience.headers.get("www-authenticate") ?? "", /error="invalid_token"/);
    assert.equal(Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM products WHERE owner_email = ${quoteSql(email)}`))[0].count), before);

    const underScoped = `zca_${"u".repeat(43)}`;
    await executeLocalD1(`INSERT INTO oauth_provider_access_tokens (token_hash, client_id, user_email, scope, resource, expires_at) VALUES (${quoteSql(sha256(underScoped))}, ${quoteSql(dynamic.body.client_id)}, ${quoteSql(email)}, 'openid', ${quoteSql(`${baseUrl}/api/mcp`)}, datetime('now', '+1 hour'))`);
    const insufficient = await mcp(underScoped, "tools/list");
    assert.equal(insufficient.status, 403);
    assert.equal((await insufficient.json()).error, "insufficient_scope");
    assert.match(insufficient.headers.get("www-authenticate") ?? "", /error="insufficient_scope", scope="mcp:projects"/);
    assert.match(insufficient.headers.get("www-authenticate") ?? "", new RegExp(`resource_metadata="${baseUrl.replaceAll(".", "\\.")}\\/.well-known/oauth-protected-resource/api/mcp"`));
  });

  test("mcp oauth: refresh rotation inherits resource and replay revokes the whole token family", async () => {
    const flow = await oauthFlow({ email: `mcp-oauth-refresh-${runId}@example.com`, ip: "198.51.100.151" });
    const rotatedResponse = await fetch(`${baseUrl}/api/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: flow.registered.client_id, refresh_token: flow.tokens.refresh_token, resource: `${baseUrl}/api/mcp` }),
    });
    assert.equal(rotatedResponse.status, 200);
    const rotated = await rotatedResponse.json();
    assert.equal((await mcp(rotated.access_token, "tools/list")).status, 200);
    assert.deepEqual(await queryLocalD1(`SELECT resource FROM oauth_provider_access_tokens WHERE token_hash = ${quoteSql(sha256(rotated.access_token))}`), [{ resource: `${baseUrl}/api/mcp` }]);
    assert.deepEqual(await queryLocalD1(`SELECT resource FROM oauth_provider_refresh_tokens WHERE token_hash = ${quoteSql(sha256(rotated.refresh_token))}`), [{ resource: `${baseUrl}/api/mcp` }]);

    const replay = await fetch(`${baseUrl}/api/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: flow.registered.client_id, refresh_token: flow.tokens.refresh_token }),
    });
    assert.equal(replay.status, 400);
    assert.equal((await replay.json()).error, "invalid_grant");
    const oldHash = sha256(flow.tokens.refresh_token);
    const newHash = sha256(rotated.refresh_token);
    const familyRows = await queryLocalD1(`SELECT revoked_at FROM oauth_provider_refresh_tokens WHERE token_hash IN (${quoteSql(oldHash)}, ${quoteSql(newHash)})`);
    assert.equal(familyRows.length, 2);
    assert.equal(familyRows.every((row) => row.revoked_at !== null), true);
    const accessRows = await queryLocalD1(`SELECT revoked_at FROM oauth_provider_access_tokens WHERE token_hash IN (${quoteSql(sha256(flow.tokens.access_token))}, ${quoteSql(sha256(rotated.access_token))})`);
    assert.equal(accessRows.length, 2);
    assert.equal(accessRows.every((row) => row.revoked_at !== null), true);
  });

  test("mcp oauth: consent revoke and expiration make access tokens fail with invalid_token challenge", async () => {
    const flow = await oauthFlow({ email: `mcp-oauth-revoke-${runId}@example.com`, ip: "198.51.100.161" });
    const revoked = await fetch(`${baseUrl}/api/oauth/consents`, {
      method: "DELETE",
      headers: { cookie: flow.cookie, origin: baseUrl, "content-type": "application/json" },
      body: JSON.stringify({ clientId: flow.registered.client_id }),
    });
    assert.equal(revoked.status, 200);
    assert.notEqual((await queryLocalD1(`SELECT revoked_at FROM oauth_provider_access_tokens WHERE token_hash = ${quoteSql(sha256(flow.tokens.access_token))}`))[0].revoked_at, null);
    const afterRevoke = await mcp(flow.tokens.access_token, "tools/list");
    assert.equal(afterRevoke.status, 401);
    assert.match(afterRevoke.headers.get("www-authenticate") ?? "", /error="invalid_token"/);

    const expiredFlow = await oauthFlow({ email: `mcp-oauth-expired-${runId}@example.com`, ip: "198.51.100.162" });
    await executeLocalD1(`UPDATE oauth_provider_access_tokens SET expires_at = '2000-01-01 00:00:00' WHERE token_hash = ${quoteSql(sha256(expiredFlow.tokens.access_token))}`);
    const expired = await mcp(expiredFlow.tokens.access_token, "tools/list");
    assert.equal(expired.status, 401);
    assert.equal((await expired.json()).error, "invalid_token");
  });

  test("mcp oauth: ten active consents cap, active renewal exemption, and revoked-client reauthorization", async () => {
    const email = `mcp-oauth-consent-cap-${runId}@example.com`;
    const cookie = await login(email);
    const clients = [];
    for (let index = 0; index < 11; index += 1) {
      const redirectUri = `http://127.0.0.1:${46000 + index}/callback/${runId}`;
      const registered = await registerDynamic({ name: `cap ${index} ${runId}`, redirectUri, ip: `198.51.100.${170 + index}` });
      assert.equal(registered.response.status, 201);
      clients.push({ clientId: registered.body.client_id, redirectUri });
    }
    for (let index = 0; index < 10; index += 1) {
      const pending = await consent({ cookie, ...clients[index], state: `cap-state-${index}-${runId}` });
      assert.equal(pending.page.status, 200);
      const allowed = await approve({ cookie, requestToken: pending.requestToken });
      await consentCallback(allowed);
    }
    const eleventh = await consent({ cookie, ...clients[10], state: `cap-state-11-${runId}` });
    const denied = await approve({ cookie, requestToken: eleventh.requestToken });
    assert.equal(denied.status, 403);
    const deniedBody = await denied.json();
    assert.equal(deniedBody.error, "dynamic_authorization_limit");
    assert.match(deniedBody.error_description, /已授权应用/);
    assert.deepEqual(await queryLocalD1(`SELECT client_id FROM oauth_provider_consents WHERE user_email = ${quoteSql(email)} AND revoked_at IS NULL AND client_id = ${quoteSql(clients[10].clientId)}`), []);
    assert.equal(Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM oauth_provider_consents WHERE user_email = ${quoteSql(email)} AND revoked_at IS NULL AND client_id IN (${clients.slice(0, 10).map((item) => quoteSql(item.clientId)).join(",")})`))[0].count), 10);

    const sameClient = await consent({ cookie, ...clients[0], state: `cap-renew-${runId}` });
    const renewed = await approve({ cookie, requestToken: sameClient.requestToken });
    await consentCallback(renewed);
    assert.equal(Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM oauth_provider_consents WHERE user_email = ${quoteSql(email)} AND revoked_at IS NULL AND client_id IN (${clients.slice(0, 10).map((item) => quoteSql(item.clientId)).join(",")})`))[0].count), 10);

    await executeLocalD1(`UPDATE oauth_provider_consents SET revoked_at = CURRENT_TIMESTAMP WHERE user_email = ${quoteSql(email)} AND client_id = ${quoteSql(clients[0].clientId)}`);
    const replacement = await consent({ cookie, ...clients[10], state: `cap-replacement-${runId}` });
    const replacementAllowed = await approve({ cookie, requestToken: replacement.requestToken });
    await consentCallback(replacementAllowed);
    const revokedReauth = await consent({ cookie, ...clients[0], state: `cap-revoked-reauth-${runId}` });
    const revokedReauthDenied = await approve({ cookie, requestToken: revokedReauth.requestToken });
    assert.equal(revokedReauthDenied.status, 403);
    assert.equal((await revokedReauthDenied.json()).error, "dynamic_authorization_limit");
    assert.deepEqual(await queryLocalD1(`SELECT client_id FROM oauth_provider_consents WHERE user_email = ${quoteSql(email)} AND client_id = ${quoteSql(clients[0].clientId)} AND revoked_at IS NULL`), []);
    assert.equal(Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM oauth_provider_consents WHERE user_email = ${quoteSql(email)} AND revoked_at IS NULL`))[0].count), 10);
  });

  test("mcp oauth: per-credential and per-member rate limits deny before writes or audit", async () => {
    const email = `mcp-oauth-rate-${runId}@example.com`;
    const flow = await oauthFlow({ email, ip: "198.51.100.191" });
    const key = await createApiKey(flow.cookie, email);
    const createBody = jsonRpc("tools/call", { name: "create_product", arguments: { title: "Rate block", description: "A blocked write must have no side effects.", category: "开发工具" } });
    const productsBefore = Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM products WHERE owner_email = ${quoteSql(email)}`))[0].count);
    const auditsBefore = Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM mcp_write_audit WHERE member_email = ${quoteSql(email)}`))[0].count);
    const currentWindow = Math.floor(Math.floor(Date.now() / 1000) / 60) * 60;
    const memberBucket = `mcp-member:${sha256(`mcp-member:${email}`)}`;
    await executeLocalD1(`INSERT INTO api_rate_limits (bucket, window_start, request_count) VALUES (${quoteSql(memberBucket)}, ${currentWindow}, 120) ON CONFLICT(bucket, window_start) DO UPDATE SET request_count = 120`);

    const apiDenied = await fetch(`${baseUrl}/api/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${key.token}`, origin: baseUrl, "content-type": "application/json" },
      body: JSON.stringify(createBody),
    });
    assert.equal(apiDenied.status, 429);
    assert.equal((await apiDenied.json()).error, "rate_limit_exceeded");
    const oauthDenied = await fetch(`${baseUrl}/api/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${flow.tokens.access_token}`, origin: baseUrl, "content-type": "application/json" },
      body: JSON.stringify(createBody),
    });
    assert.equal(oauthDenied.status, 429);
    assert.equal((await oauthDenied.json()).error, "rate_limit_exceeded");
    assert.equal(Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM products WHERE owner_email = ${quoteSql(email)}`))[0].count), productsBefore);
    assert.equal(Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM mcp_write_audit WHERE member_email = ${quoteSql(email)}`))[0].count), auditsBefore);

    const pairBucket = `mcp-oauth:${sha256(`mcp-oauth:${flow.registered.client_id}:${email}`)}`;
    await executeLocalD1(`DELETE FROM api_rate_limits WHERE bucket = ${quoteSql(memberBucket)} AND window_start = ${currentWindow}`);
    const credentialWindow = Math.floor(Math.floor(Date.now() / 1000) / 60) * 60;
    await executeLocalD1(`INSERT INTO api_rate_limits (bucket, window_start, request_count) VALUES (${quoteSql(pairBucket)}, ${credentialWindow}, 60) ON CONFLICT(bucket, window_start) DO UPDATE SET request_count = 60`);
    const oauthCredentialDenied = await mcp(flow.tokens.access_token, "tools/call", { name: "create_product", arguments: { title: "Pair block", description: "The OAuth client and member bucket is limited.", category: "开发工具" } });
    assert.equal(oauthCredentialDenied.status, 429);
    assert.equal((await oauthCredentialDenied.json()).error, "rate_limit_exceeded");
  });

  test("mcp oauth: OAuth uses the existing per-member daily submission and hourly upload buckets", async () => {
    const email = `mcp-oauth-shared-limits-${runId}@example.com`;
    const flow = await oauthFlow({ email, ip: "198.51.100.201" });
    const dayWindow = Math.floor(Math.floor(Date.now() / 1000) / (24 * 60 * 60)) * (24 * 60 * 60);
    const hourWindow = Math.floor(Math.floor(Date.now() / 1000) / 3600) * 3600;
    const publishBucket = `publish-product:${sha256(`publish-product:${email}`)}`;
    const uploadBucket = `upload:${sha256(`upload:${email}`)}`;
    await executeLocalD1(`INSERT INTO api_rate_limits (bucket, window_start, request_count) VALUES (${quoteSql(publishBucket)}, ${dayWindow}, 10) ON CONFLICT(bucket, window_start) DO UPDATE SET request_count = 10`);
    const productsBefore = Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM products WHERE owner_email = ${quoteSql(email)}`))[0].count);
    const dailyDenied = await mcp(flow.tokens.access_token, "tools/call", { name: "create_product", arguments: { title: "Daily limit", description: "Daily project submit limit is shared with the web route.", category: "开发工具" } });
    assert.equal((await dailyDenied.json()).result.structuredContent.error, "rate_limit_exceeded");
    assert.equal(Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM products WHERE owner_email = ${quoteSql(email)}`))[0].count), productsBefore);

    await executeLocalD1(`INSERT INTO api_rate_limits (bucket, window_start, request_count) VALUES (${quoteSql(uploadBucket)}, ${hourWindow}, 30) ON CONFLICT(bucket, window_start) DO UPDATE SET request_count = 30`);
    const scannerBefore = uploadScannerRequestCount;
    const filesBefore = Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM uploaded_files WHERE owner_email = ${quoteSql(email)}`))[0].count);
    const uploadDenied = await mcp(flow.tokens.access_token, "tools/call", { name: "upload_cover", arguments: { filename: "blocked.png", mime_type: "image/png", data_base64: onePixelPng.toString("base64") } });
    assert.equal((await uploadDenied.json()).result.structuredContent.error, "rate_limit_exceeded");
    assert.equal(uploadScannerRequestCount, scannerBefore);
    assert.equal(Number((await queryLocalD1(`SELECT COUNT(*) AS count FROM uploaded_files WHERE owner_email = ${quoteSql(email)}`))[0].count), filesBefore);
    const auditedErrors = await queryLocalD1(`SELECT tool_name, result FROM mcp_write_audit WHERE member_email = ${quoteSql(email)} ORDER BY created_at, rowid`);
    assert.deepEqual(auditedErrors.map((row) => [row.tool_name, row.result]), [["create_product", "rate_limit_exceeded"], ["upload_cover", "rate_limit_exceeded"]]);
  });

  test("mcp oauth: dynamic clients stay out of developer-owned and admin moderation client lists", async () => {
    const email = `mcp-oauth-queue-${runId}@example.com`;
    const cookie = await login(email);
    const created = await registerDynamic({ name: `queue ${runId}`, redirectUri: `https://queue-${runId}.example/callback`, ip: "198.51.100.211" });
    assert.equal(created.response.status, 201);
    assert.deepEqual(await queryLocalD1(`SELECT owner_email FROM oauth_provider_clients WHERE client_id = ${quoteSql(created.body.client_id)}`), [{ owner_email: null }]);
    const developerList = await fetch(`${baseUrl}/api/developer/clients`, { headers: { cookie } });
    assert.equal(developerList.status, 200);
    assert.equal(JSON.stringify(await developerList.json()).includes(created.body.client_id), false);
    const adminCookie = await login(adminEmail);
    const moderation = await fetch(`${baseUrl}/api/admin/moderation`, { headers: { cookie: adminCookie } });
    assert.equal(moderation.status, 200);
    const body = await moderation.json();
    assert.equal(body.clients.some((client) => client.clientId === created.body.client_id), false);
  });

  test("mcp oauth: purge removes stale unconsented dynamic clients and retained API key/audit rows", async () => {
    const email = `mcp-oauth-purge-${runId}@example.com`;
    const cookie = await login(email);
    const abandonedId = `purge-dynamic-${runId}`;
    const authorizedId = `purge-authorized-${runId}`;
    const oldRequestHash = `purge-request-${runId}`;
    const oldRedirect = `http://localhost:47517/purge/${runId}`;
    await executeLocalD1(`INSERT INTO oauth_provider_clients (client_id, owner_email, name, description, website_url, client_type, client_secret_hash, allowed_scopes, status, review_status, write_access_approved, registration_source, created_at) VALUES (${quoteSql(abandonedId)}, NULL, 'abandoned', '', '', 'public', NULL, 'mcp:projects', 'active', 'unverified', 0, 'dynamic', datetime('now', '-8 days')), (${quoteSql(authorizedId)}, NULL, 'authorized', '', '', 'public', NULL, 'mcp:projects', 'active', 'unverified', 0, 'dynamic', datetime('now', '-8 days'))`);
    await executeLocalD1(`INSERT INTO oauth_provider_redirect_uris (client_id, redirect_uri) VALUES (${quoteSql(abandonedId)}, ${quoteSql(oldRedirect)})`);
    await executeLocalD1(`INSERT INTO oauth_provider_authorization_requests (request_hash, client_id, user_email, redirect_uri, scope, state, code_challenge, expires_at) VALUES (${quoteSql(oldRequestHash)}, ${quoteSql(abandonedId)}, ${quoteSql(email)}, ${quoteSql(oldRedirect)}, 'mcp:projects', 'purge-state', 'purge-challenge', datetime('now', '-7 days'))`);
    await executeLocalD1(`INSERT INTO oauth_provider_consents (client_id, user_email, scope) VALUES (${quoteSql(authorizedId)}, ${quoteSql(email)}, 'mcp:projects')`);
    const purgeDynamicSql = `DELETE FROM oauth_provider_clients WHERE registration_source = 'dynamic' AND created_at <= datetime('now', '-7 days') AND NOT EXISTS (SELECT 1 FROM oauth_provider_consents x WHERE x.client_id = oauth_provider_clients.client_id) AND NOT EXISTS (SELECT 1 FROM oauth_provider_access_tokens x WHERE x.client_id = oauth_provider_clients.client_id) AND NOT EXISTS (SELECT 1 FROM oauth_provider_refresh_tokens x WHERE x.client_id = oauth_provider_clients.client_id)`;
    await executeLocalD1(purgeDynamicSql);
    assert.deepEqual(await queryLocalD1(`SELECT client_id FROM oauth_provider_clients WHERE client_id = ${quoteSql(abandonedId)}`), []);
    assert.deepEqual(await queryLocalD1(`SELECT redirect_uri FROM oauth_provider_redirect_uris WHERE client_id = ${quoteSql(abandonedId)}`), []);
    assert.deepEqual(await queryLocalD1(`SELECT request_hash FROM oauth_provider_authorization_requests WHERE request_hash = ${quoteSql(oldRequestHash)}`), []);
    assert.equal((await queryLocalD1(`SELECT client_id FROM oauth_provider_clients WHERE client_id = ${quoteSql(authorizedId)}`))[0].client_id, authorizedId);

    const keys = await createApiKey(cookie, email);
    const expiredKeyId = `key-expired-${runId}`;
    const activeKeyId = `key-active-${runId}`;
    const revokedKeyId = `key-revoked-${runId}`;
    await executeLocalD1(`INSERT INTO api_keys (id, member_email, name, prefix, token_hash, expires_at) VALUES (${quoteSql(expiredKeyId)}, ${quoteSql(email)}, 'old', 'zc_old', ${quoteSql(sha256(`expired-${runId}`))}, datetime('now', '-91 days')), (${quoteSql(activeKeyId)}, ${quoteSql(email)}, 'active', 'zc_live', ${quoteSql(sha256(`active-${runId}`))}, datetime('now', '+30 days')), (${quoteSql(revokedKeyId)}, ${quoteSql(email)}, 'revoked', 'zc_revoked', ${quoteSql(sha256(`revoked-${runId}`))}, datetime('now', '+30 days'))`);
    await executeLocalD1(`UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = ${quoteSql(revokedKeyId)}`);
    const oldAuditId = `audit-old-${runId}`;
    const currentAuditId = `audit-current-${runId}`;
    await executeLocalD1(`INSERT INTO mcp_write_audit (id, member_email, credential_kind, credential_id, tool_name, result, created_at) VALUES (${quoteSql(oldAuditId)}, ${quoteSql(email)}, 'api_key', ${quoteSql(keys.key.id)}, 'create_product', 'server_error', datetime('now', '-91 days')), (${quoteSql(currentAuditId)}, ${quoteSql(email)}, 'api_key', ${quoteSql(keys.key.id)}, 'create_product', 'ok', CURRENT_TIMESTAMP)`);
    await executeLocalD1(`DELETE FROM mcp_write_audit WHERE created_at <= datetime('now', '-90 days')`);
    await executeLocalD1(`DELETE FROM api_keys WHERE revoked_at IS NOT NULL OR expires_at <= datetime('now', '-90 days')`);
    assert.deepEqual(await queryLocalD1(`SELECT id FROM api_keys WHERE id = ${quoteSql(expiredKeyId)}`), []);
    assert.deepEqual(await queryLocalD1(`SELECT id FROM api_keys WHERE id = ${quoteSql(revokedKeyId)}`), []);
    assert.equal((await queryLocalD1(`SELECT id FROM api_keys WHERE id = ${quoteSql(activeKeyId)}`))[0].id, activeKeyId);
    assert.deepEqual(await queryLocalD1(`SELECT id FROM mcp_write_audit WHERE id = ${quoteSql(oldAuditId)}`), []);
    assert.equal((await queryLocalD1(`SELECT id FROM mcp_write_audit WHERE id = ${quoteSql(currentAuditId)}`))[0].id, currentAuditId);
  });

  test("mcp oauth: real cookie admins keep role access while API-key and OAuth bearer identities do not", async () => {
    const cookie = await login(adminEmail);
    const adminRoute = `${baseUrl}/api/admin/moderation`;
    const cookieAdmin = await fetch(adminRoute, { headers: { cookie } });
    assert.equal(cookieAdmin.status, 200);
    const body = await cookieAdmin.json();
    assert.equal(Array.isArray(body.clients), true);
    assert.equal(Array.isArray(body.products), true);

    const key = await createApiKey(cookie, adminEmail);
    const keyDenied = await fetch(adminRoute, { headers: { authorization: `Bearer ${key.token}` } });
    assert.equal(keyDenied.status, 403);
    assert.equal((await keyDenied.json()).error, "user_api_key_scope_forbidden");

    const dynamic = await registerDynamic({ name: `role test ${runId}`, redirectUri: `http://localhost:48811/admin/${runId}`, ip: "198.51.100.221" });
    assert.equal(dynamic.response.status, 201);
    const pending = await consent({ cookie, clientId: dynamic.body.client_id, redirectUri: dynamic.body.redirect_uris[0], state: `admin-role-${runId}` });
    const allowed = await approve({ cookie, requestToken: pending.requestToken });
    const callback = await consentCallback(allowed);
    const tokenResponse = await exchangeCode({ clientId: dynamic.body.client_id, code: callback.searchParams.get("code"), redirectUri: dynamic.body.redirect_uris[0], verifier: pending.verifier });
    assert.equal(tokenResponse.status, 200);
    const oauthToken = (await tokenResponse.json()).access_token;
    const oauthDenied = await fetch(adminRoute, { headers: { authorization: `Bearer ${oauthToken}` } });
    assert.equal([401, 403].includes(oauthDenied.status), true);
    const oauthBody = await oauthDenied.json();
    assert.equal(typeof oauthBody.error, "string");
    assert.equal(oauthBody.error, "auth_required");
  });
}
