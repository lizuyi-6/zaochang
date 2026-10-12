import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { test } from "node:test";
import { buildZip, entry } from "../helpers/zip-builder.mjs";
import {
  adminEmail,
  baseUrl,
  onePixelPng,
  queryLocalD1,
  runId,
  executeLocalD1,
  uploadScannerRequestCount,
} from "../harness/preview.mjs";

const hostingRules = JSON.parse(readFileSync(new URL("../../app/api/_lib/hosting-rules.json", import.meta.url), "utf8"));

// 声明超限 content-length 但只发送一小段请求体,读到响应即断开。worker 入口按 content-length
// 直接回 413(worker/request-body.ts 快路径,不读请求体);若真的写完 11 MiB,服务端回 413 后
// 断开连接与客户端仍在写入之间存在竞态,偶发 write ECONNRESET(部署工作流 run 38192095578 实测)。
// 独立 socket(agent:false),不污染 fetch 连接池。
function postDeclaringOversizedBody(url, headers, declaredBytes) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const req = httpRequest(url, {
      method: "POST",
      agent: false,
      headers: { ...headers, "content-length": declaredBytes },
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        settled = true;
        clearTimeout(timer);
        resolve({ status: res.statusCode, body: data });
        req.destroy();
      });
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      req.destroy();
      reject(new Error("no response to an oversized declared body within 15s"));
    }, 15000);
    req.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    req.flushHeaders();
    req.write(Buffer.alloc(64 * 1024, 0x78));
  });
}

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
  assert.equal(response.status, 307, "test login must issue a cookie session");
  const cookie = sessionCookie(response);
  assert.ok(cookie, "dev-login must issue zaochang_session");
  return cookie;
}

async function createKey(cookie, name, expiresInDays = 90) {
  return fetch(`${baseUrl}/api/api-keys`, {
    method: "POST",
    headers: { cookie, origin: baseUrl, "content-type": "application/json" },
    body: JSON.stringify({ name, expires_in_days: expiresInDays }),
  });
}

async function rpc(token, method, params = {}, headers = {}) {
  return fetch(`${baseUrl}/api/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      origin: baseUrl,
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

async function tool(token, name, args = {}, headers = {}) {
  const response = await rpc(token, "tools/call", { name, arguments: args }, headers);
  const body = await response.json();
  assert.equal(response.status, 200, `tools/call ${name} must return an MCP result`);
  assert.equal(body.jsonrpc, "2.0");
  return body.result;
}

async function makeKeyFor(email, name = "integration key") {
  const cookie = await login(email);
  const response = await createKey(cookie, name);
  assert.equal(response.status, 201, "cookie session creates an API key");
  const created = await response.json();
  assert.match(created.token, /^zc_[A-Za-z0-9_-]{43}$/);
  return { cookie, ...created };
}

async function grantHosting(email) {
  const adminCookie = await login(adminEmail);
  const response = await fetch(`${baseUrl}/api/admin/hosting-grants`, {
    method: "POST",
    headers: { cookie: adminCookie, origin: baseUrl, "content-type": "application/json" },
    body: JSON.stringify({ email, maxSites: 3, note: "MCP hosting integration grant" }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.grant.memberEmail, email);
  assert.equal(body.grant.maxSites, 3);
}

function cleanHostingZip() {
  return buildZip([entry("index.html", { data: "<!doctype html><title>Hosted</title>" })]);
}

const quoteSql = (value) => `'${String(value).replaceAll("'", "''")}'`;

export function register() {
  test("agent connect: API-key writes reject foreign Origin without changing key rows", async () => {
    const email = `agent-key-csrf-${runId}@example.com`;
    const cookie = await login(email);
    const beforeCreate = await queryLocalD1(
      `SELECT COUNT(*) AS count FROM api_keys WHERE member_email = ${quoteSql(email)}`,
    );
    const crossSiteCreate = await fetch(`${baseUrl}/api/api-keys`, {
      method: "POST",
      headers: { cookie, origin: "https://attacker.example", "content-type": "application/json" },
      body: JSON.stringify({ name: "cross-site create", expires_in_days: 30 }),
    });
    assert.equal(crossSiteCreate.status, 403);
    assert.equal((await crossSiteCreate.json()).error, "invalid_origin");
    const afterCreate = await queryLocalD1(
      `SELECT COUNT(*) AS count FROM api_keys WHERE member_email = ${quoteSql(email)}`,
    );
    assert.equal(afterCreate[0].count, beforeCreate[0].count);

    const created = await createKey(cookie, "cross-site revoke target", 30);
    assert.equal(created.status, 201);
    const { key } = await created.json();
    const beforeRevoke = await queryLocalD1(
      `SELECT revoked_at FROM api_keys WHERE id = ${quoteSql(key.id)}`,
    );
    assert.equal(beforeRevoke.length, 1);
    assert.equal(beforeRevoke[0].revoked_at, null);
    const crossSiteRevoke = await fetch(`${baseUrl}/api/api-keys`, {
      method: "DELETE",
      headers: { cookie, origin: "https://attacker.example", "content-type": "application/json" },
      body: JSON.stringify({ id: key.id }),
    });
    assert.equal(crossSiteRevoke.status, 403);
    assert.equal((await crossSiteRevoke.json()).error, "invalid_origin");
    const afterRevoke = await queryLocalD1(
      `SELECT revoked_at FROM api_keys WHERE id = ${quoteSql(key.id)}`,
    );
    assert.equal(afterRevoke[0].revoked_at, null);
  });

  test("agent connect: key lifecycle stores only hash, exact expiry choices, and caps active keys at five", async () => {
    const email = `agent-key-lifecycle-${runId}@example.com`;
    const cookie = await login(email);
    const made = [];
    for (const [index, days] of [30, 90, 365].entries()) {
      const response = await createKey(cookie, `valid-${days}-${index}`, days);
      assert.equal(response.status, 201);
      const created = await response.json();
      assert.match(created.token, /^zc_[A-Za-z0-9_-]{43}$/);
      assert.equal(created.key.status, "active");
      assert.ok(created.key.id && created.key.prefix.startsWith("zc_"));
      const expiry = await queryLocalD1(
        `SELECT CAST(ROUND(julianday(expires_at) - julianday(created_at)) AS INTEGER) AS days
         FROM api_keys WHERE id = ${quoteSql(created.key.id)}`,
      );
      assert.equal(expiry[0].days, days);
      made.push(created);
    }

    const invalid = await createKey(cookie, "invalid expiry", 31);
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error, "invalid_api_key_expiry");
    for (let index = 0; index < 2; index += 1) {
      const response = await createKey(cookie, `cap-${index}`, 30);
      assert.equal(response.status, 201);
      made.push(await response.json());
    }
    const sixth = await createKey(cookie, "sixth", 30);
    assert.equal(sixth.status, 409);
    assert.equal((await sixth.json()).error, "api_key_limit_reached");

    const listResponse = await fetch(`${baseUrl}/api/api-keys`, { headers: { cookie } });
    assert.equal(listResponse.status, 200);
    const listBody = await listResponse.text();
    assert.equal(listBody.includes(made[0].token), false, "list response never returns key plaintext");
    assert.equal(listBody.includes("token_hash"), false, "list response never returns the stored hash field");
    const listed = JSON.parse(listBody);
    assert.equal(listed.keys.length, 5);
    assert.equal(listed.keys.filter((key) => key.status === "active").length, 5);
    const stored = await queryLocalD1(
      `SELECT token_hash, prefix FROM api_keys WHERE id = ${quoteSql(made[0].key.id)}`,
    );
    assert.equal(stored[0].token_hash, await import("node:crypto").then(({ createHash }) => createHash("sha256").update(made[0].token).digest("hex")));
    assert.equal(stored[0].prefix, made[0].token.slice(0, 11));
  });

  test("agent connect: key creation is rate-limited independently of the active-key cap", async () => {
    const cookie = await login(`agent-key-create-rate-${runId}@example.com`);
    for (let index = 0; index < 10; index += 1) {
      const created = await createKey(cookie, `short-lived-${index}`, 30);
      assert.equal(created.status, 201);
      const { key } = await created.json();
      const revoked = await fetch(`${baseUrl}/api/api-keys`, {
        method: "DELETE",
        headers: { cookie, origin: baseUrl, "content-type": "application/json" },
        body: JSON.stringify({ id: key.id }),
      });
      assert.equal(revoked.status, 200);
    }
    const eleventh = await createKey(cookie, "rate-limited", 30);
    assert.equal(eleventh.status, 429);
    assert.equal((await eleventh.json()).error, "rate_limit_exceeded");
  });

  test("agent connect: MCP negotiation, tools/list, and create_product persist the key owner's pending project", async () => {
    const email = `agent-key-create-${runId}@example.com`;
    const { token, key } = await makeKeyFor(email, "creator");

    const initialize = await rpc(token, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "contract-test", version: "1" } });
    assert.equal(initialize.status, 200);
    const initialized = await initialize.json();
    assert.equal(initialized.result.protocolVersion, "2025-03-26");
    assert.equal(initialized.result.capabilities.tools.constructor, Object);
    assert.equal(initialized.result.serverInfo.name, "zaochang");
    const newest = await rpc(token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "contract-test", version: "1" } });
    assert.equal((await newest.json()).result.protocolVersion, "2025-06-18");
    // 更新的客户端请求未知版本时,服务端回落到自己支持的最新版本而不是报错(Claude Code 2.1.296 实测曾被 -32602 拒绝)。
    const future = await rpc(token, "initialize", { protocolVersion: "2099-01-01", capabilities: {}, clientInfo: { name: "contract-test", version: "1" } });
    assert.equal(future.status, 200);
    const futureBody = await future.json();
    assert.equal(futureBody.error, undefined);
    assert.equal(futureBody.result.protocolVersion, "2025-06-18");
    const missingVersion = await (await rpc(token, "initialize", { capabilities: {} })).json();
    assert.equal(missingVersion.error.code, -32602);
    const badHeader = await rpc(token, "tools/list", {}, { "mcp-protocol-version": "1999-01-01" });
    assert.equal(badHeader.status, 400);
    assert.equal((await badHeader.json()).error.message, "Unsupported MCP-Protocol-Version");
    const goodHeader = await rpc(token, "tools/list", {}, { "mcp-protocol-version": "2025-06-18" });
    assert.equal(goodHeader.status, 200);
    assert.ok((await goodHeader.json()).result.tools.some((entry) => entry.name === "create_product"));

    const notification = await fetch(`${baseUrl}/api/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, origin: baseUrl, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    assert.equal(notification.status, 202);
    assert.equal(await notification.text(), "");

    const ping = await rpc(token, "ping");
    assert.deepEqual((await ping.json()).result, {});
    const listed = await rpc(token, "tools/list");
    assert.equal(listed.status, 200);
    const listedTools = (await listed.json()).result.tools;
    const toolNames = listedTools.map((entry) => entry.name);
    assert.deepEqual(toolNames, [
      "list_my_products", "get_product", "create_product", "update_product", "upload_cover",
      "begin_hosting_upload", "get_hosting_status", "remove_hosting",
    ]);
    const categoryEnum = listedTools.find((entry) => entry.name === "create_product").inputSchema.properties.category.enum;
    assert.deepEqual(categoryEnum, ["效率工具", "互动体验", "声音影像", "生活方式", "开发工具"]);
    assert.match(listedTools.find((entry) => entry.name === "create_product").inputSchema.properties.demo_url.description, /cannot currently pass platform review/);
    assert.match(listedTools.find((entry) => entry.name === "update_product").inputSchema.properties.demo_url.description, /cannot currently pass platform review/);
    const beginHosting = listedTools.find((entry) => entry.name === "begin_hosting_upload");
    assert.equal(beginHosting.inputSchema.properties.product_id.type, "integer");
    assert.equal(beginHosting.inputSchema.properties.product_id.minimum, 1);
    assert.equal(beginHosting.inputSchema.required.includes("product_id"), true);
    assert.equal(beginHosting.inputSchema.additionalProperties, false);
    const limitsDescription = beginHosting.description;
    assert.equal(limitsDescription.includes(`${hostingRules.bundle.maxZipBytes / (1024 * 1024)} MiB`), true);
    assert.equal(limitsDescription.includes(`${hostingRules.bundle.maxEntries} archive entries maximum (directory entries count)`), true);
    assert.equal(limitsDescription.includes(hostingRules.bundle.rootFile), true);
    for (const extension of hostingRules.extensions.allowed) {
      assert.equal(limitsDescription.includes(`.${extension}`), true, `description includes .${extension} from hosting-rules.json`);
    }
    assert.match(limitsDescription, /dotfiles/);
    assert.match(limitsDescription, /\.env/);
    assert.match(limitsDescription, /private keys/);
    assert.match(limitsDescription, /node_modules/);
    assert.match(limitsDescription, /invitation grant/);
    assert.match(limitsDescription, /demo_url must be empty/);
    assert.match(limitsDescription, /public only after platform review approval/);
    for (const name of ["get_hosting_status", "remove_hosting"]) {
      const definition = listedTools.find((entry) => entry.name === name);
      assert.equal(definition.inputSchema.properties.product_id.type, "integer");
      assert.equal(definition.inputSchema.properties.product_id.minimum, 1);
      assert.equal(definition.inputSchema.required.includes("product_id"), true);
      assert.equal(definition.inputSchema.additionalProperties, false);
    }
    const methodNotAllowed = await fetch(`${baseUrl}/api/mcp`, { method: "GET" });
    assert.equal(methodNotAllowed.status, 405);
    assert.equal((await methodNotAllowed.json()).error, "method_not_allowed");

    const created = await tool(token, "create_product", {
      title: "MCP agent sample",
      description: "An integration product submitted through an authenticated personal agent key.",
      category: "开发工具",
      pricing_model: "free",
    });
    assert.equal(created.isError, undefined);
    assert.equal(created.structuredContent.product.pricingModel, "free");
    assert.deepEqual(created.structuredContent.warnings, [], "a product without demo_url has no review warning");
    const productId = created.structuredContent.product.id;
    const rows = await queryLocalD1(
      `SELECT id, owner_email, review_status, status FROM products WHERE id = ${Number(productId)}`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].owner_email, email);
    assert.equal(rows[0].review_status, "pending_review");
    assert.equal(rows[0].status, "pending_review");

    const ownList = await tool(token, "list_my_products");
    const listedProduct = ownList.structuredContent.products.find((product) => product.id === productId);
    assert.ok(listedProduct);
    assert.equal(listedProduct.status, "pending_review");
    assert.equal(listedProduct.review_status, "pending_review");
    assert.equal(listedProduct.review_version, 1);
    assert.equal(listedProduct.approved_version, 0);
    const ownGet = await tool(token, "get_product", { id: productId });
    assert.equal(ownGet.structuredContent.product.id, productId);
    const usage = await queryLocalD1(`SELECT last_used_at FROM api_keys WHERE id = ${quoteSql(key.id)}`);
    assert.equal(typeof usage[0].last_used_at, "string", "valid MCP requests update last_used_at");

    const externalDemo = "https://demo.example/mcp-project";
    const demoCreated = await tool(token, "create_product", {
      title: "External demo warning",
      description: "This project deliberately supplies an external demo link for the review warning test.",
      category: "开发工具",
      demo_url: `  ${externalDemo}  `,
    });
    assert.equal(demoCreated.isError, undefined);
    assert.equal(demoCreated.structuredContent.warnings.length, 1);
    assert.match(demoCreated.structuredContent.warnings[0], /^demo_url_cannot_be_approved: /);
    const demoId = demoCreated.structuredContent.product.id;
    const demoState = await queryLocalD1(
      `SELECT demo_url, review_status FROM products WHERE id = ${Number(demoId)} AND owner_email = ${quoteSql(email)}`,
    );
    assert.deepEqual({ ...demoState[0] }, { demo_url: externalDemo, review_status: "pending_review" });

    const demoUpdated = await tool(token, "update_product", {
      id: demoId,
      demo_url: "https://demo.example/updated-project",
    });
    assert.equal(demoUpdated.isError, undefined);
    assert.equal(demoUpdated.structuredContent.warnings.length, 1);
    assert.match(demoUpdated.structuredContent.warnings[0], /^demo_url_cannot_be_approved: /);
  });

  test("agent connect: MCP rejects request bodies above 11 MiB", async () => {
    const { token } = await makeKeyFor(`agent-key-body-limit-${runId}@example.com`, "body limit");
    const response = await postDeclaringOversizedBody(`${baseUrl}/api/mcp`, {
      authorization: `Bearer ${token}`,
      origin: baseUrl,
      "content-type": "application/json",
    }, 11 * 1024 * 1024 + 1);
    assert.equal(response.status, 413);
    // worker 入口的 11 MiB 闸(worker/request-body.ts)先于 MCP 路由生效。
    assert.equal(JSON.parse(response.body).error, "request_too_large");
  });

  test("agent connect: REST and MCP submissions share the existing per-member daily limit", async () => {
    const email = `agent-key-shared-limit-${runId}@example.com`;
    const cookie = await login(email);
    const { token } = await makeKeyFor(email, "shared limit");
    for (let index = 0; index < 9; index += 1) {
      const response = await fetch(`${baseUrl}/api/products`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          title: `REST project ${index}`,
          description: "A valid REST project used to verify the shared daily submission limit.",
          category: "互动体验",
        }),
      });
      assert.equal(response.status, 201);
    }
    const tenth = await tool(token, "create_product", {
      title: "MCP tenth project",
      description: "The last project submission allowed through the shared daily limit.",
      category: "效率工具",
    });
    assert.equal(tenth.isError, undefined);
    const eleventh = await tool(token, "create_product", {
      title: "MCP blocked project",
      description: "This project must be refused by the shared daily submission limit.",
      category: "效率工具",
    });
    assert.equal(eleventh.isError, true);
    assert.equal(eleventh.structuredContent.error, "rate_limit_exceeded");
    const total = await queryLocalD1(`SELECT COUNT(*) AS count FROM products WHERE owner_email = ${quoteSql(email)}`);
    assert.equal(total[0].count, 10);
  });

  test("agent connect: REST product creation ignores snake_case image_url", async () => {
    const email = `agent-key-rest-image-${runId}@example.com`;
    const cookie = await login(email);
    const response = await fetch(`${baseUrl}/api/products`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        title: "REST image alias regression",
        description: "A snake_case cover field must remain ignored by the REST product API.",
        category: "开发工具",
        image_url: "https://example.com/x.png",
      }),
    });
    assert.equal(response.status, 201);
    const created = await response.json();
    const rows = await queryLocalD1(
      `SELECT image_url FROM products WHERE id = ${Number(created.product.id)} AND owner_email = ${quoteSql(email)}`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].image_url, null);
  });

  test("agent connect: Worker denies every user-key method/path outside its exact capability, including admin GET", async () => {
    const regular = await makeKeyFor(`agent-key-scope-${runId}@example.com`, "scope");
    const privateRead = await fetch(`${baseUrl}/api/reading-progress`, {
      headers: { authorization: `Bearer ${regular.token}` },
    });
    assert.equal(privateRead.status, 403);
    assert.equal((await privateRead.json()).error, "user_api_key_scope_forbidden");
    const getMcp = await fetch(`${baseUrl}/api/mcp`, {
      headers: { authorization: `Bearer ${regular.token}` },
    });
    assert.equal(getMcp.status, 403, "the worker capability gate takes precedence for a key on GET /api/mcp");
    assert.equal((await getMcp.json()).error, "user_api_key_scope_forbidden");
    const keyManagement = await fetch(`${baseUrl}/api/api-keys`, {
      headers: { authorization: `Bearer ${regular.token}` },
    });
    assert.equal(keyManagement.status, 403);
    assert.equal((await keyManagement.json()).error, "user_api_key_scope_forbidden");
    const agentCannotManageKeys = await fetch(`${baseUrl}/api/api-keys`, {
      headers: { authorization: "Bearer test-agent-key" },
    });
    assert.equal(agentCannotManageKeys.status, 403);
    assert.equal((await agentCannotManageKeys.json()).error, "cookie_session_required");

    const admin = await makeKeyFor(adminEmail, "administrator whitelist key");
    const adminRead = await fetch(`${baseUrl}/api/admin/moderation`, {
      headers: { authorization: `Bearer ${admin.token}` },
    });
    assert.equal(adminRead.status, 403);
    assert.equal((await adminRead.json()).error, "user_api_key_scope_forbidden");
  });

  test("agent connect: revoked, expired, and invalid zc_ credentials return 401 without cookie fallback", async () => {
    const email = `agent-key-invalid-${runId}@example.com`;
    const cookie = await login(email);
    const revokedCreated = await (await createKey(cookie, "revoked key", 30)).json();
    const revoke = await fetch(`${baseUrl}/api/api-keys`, {
      method: "DELETE",
      headers: { cookie, origin: baseUrl, "content-type": "application/json" },
      body: JSON.stringify({ id: revokedCreated.key.id }),
    });
    assert.equal(revoke.status, 200);
    const revoked = await rpc(revokedCreated.token, "tools/list");
    assert.equal(revoked.status, 401);
    assert.match(revoked.headers.get("www-authenticate") ?? "", /error="invalid_token"/);
    assert.match(revoked.headers.get("www-authenticate") ?? "", /resource_metadata="http:\/\/127\.0\.0\.1:4179\/\.well-known\/oauth-protected-resource\/api\/mcp"/);

    const expiredCreated = await (await createKey(cookie, "expired key", 30)).json();
    await executeLocalD1(
      `UPDATE api_keys SET expires_at = '2000-01-01 00:00:00' WHERE id = ${quoteSql(expiredCreated.key.id)}`,
    );
    const expired = await rpc(expiredCreated.token, "tools/list");
    assert.equal(expired.status, 401);
    assert.match(expired.headers.get("www-authenticate") ?? "", /error="invalid_token"/);
    assert.match(expired.headers.get("www-authenticate") ?? "", /resource_metadata=/);

    const fallback = await fetch(`${baseUrl}/api/mcp`, {
      method: "POST",
      headers: { cookie, authorization: "Bearer zc_invalid", origin: baseUrl, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    assert.equal(fallback.status, 401);
    assert.match(fallback.headers.get("www-authenticate") ?? "", /error="invalid_token"/);
    assert.match(fallback.headers.get("www-authenticate") ?? "", /resource_metadata=/);
    assert.equal((await fallback.json()).error, "invalid_api_key");
  });

  test("agent connect: MCP rejects cookie-only authentication and foreign Origin", async () => {
    const { cookie, token } = await makeKeyFor(`agent-key-origin-${runId}@example.com`, "origin");
    const cookieOnly = await fetch(`${baseUrl}/api/mcp`, {
      method: "POST",
      headers: { cookie, origin: baseUrl, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    assert.equal(cookieOnly.status, 401);
    assert.match(cookieOnly.headers.get("www-authenticate") ?? "", /resource_metadata=/);

    const foreign = await rpc(token, "tools/list", {}, { origin: "https://attacker.example" });
    assert.equal(foreign.status, 403);
    assert.equal((await foreign.json()).error, "origin_not_allowed");
  });

  test("agent connect: get/update cannot access another owner's product; editing an approved product returns it to review", async () => {
    const ownerEmail = `agent-key-update-owner-${runId}@example.com`;
    const strangerEmail = `agent-key-update-stranger-${runId}@example.com`;
    const { token: ownerToken } = await makeKeyFor(ownerEmail, "owner");
    const { token: strangerToken } = await makeKeyFor(strangerEmail, "stranger");
    const created = await tool(strangerToken, "create_product", {
      title: "Stranger product",
      description: "This project's fields must stay unchanged for a different key owner.",
      category: "生活方式",
    });
    const strangerId = created.structuredContent.product.id;
    const before = await queryLocalD1(
      `SELECT title, description, category, review_status, review_version FROM products WHERE id = ${Number(strangerId)}`,
    );
    const deniedGet = await tool(ownerToken, "get_product", { id: strangerId });
    assert.equal(deniedGet.isError, true);
    assert.equal(deniedGet.structuredContent.error, "not_owned");
    const deniedUpdate = await tool(ownerToken, "update_product", { id: strangerId, title: "Unauthorized edit" });
    assert.equal(deniedUpdate.isError, true);
    assert.equal(deniedUpdate.structuredContent.error, "not_owned");
    const after = await queryLocalD1(
      `SELECT title, description, category, review_status, review_version FROM products WHERE id = ${Number(strangerId)}`,
    );
    assert.deepEqual(after, before, "not_owned update must leave every selected DB field unchanged");

    await executeLocalD1(
      `INSERT INTO members (email, display_name) VALUES (${quoteSql(adminEmail)}, 'Review admin')
       ON CONFLICT(email) DO NOTHING`,
    );
    const ownCreated = await tool(ownerToken, "create_product", {
      title: "Approved then edited",
      description: "A sufficiently long description before the moderator approves this product.",
      category: "效率工具",
    });
    const ownId = ownCreated.structuredContent.product.id;
    await executeLocalD1(
      `INSERT INTO product_review_decisions (id, product_id, review_version, reviewer_email, decision, note)
       VALUES (${quoteSql(`agent-connect-review-${runId}`)}, ${Number(ownId)}, 1, ${quoteSql(adminEmail)}, 'approved', 'Agent connect integration approval')`,
    );
    const publicBefore = await (await fetch(`${baseUrl}/api/community`)).json();
    assert.equal(publicBefore.products.some((product) => product.id === ownId), true);

    const edited = await tool(ownerToken, "update_product", { id: ownId, title: "Edited after approval" });
    assert.equal(edited.isError, undefined);
    const reviewed = await queryLocalD1(
      `SELECT title, status, review_status, review_version, approved_version FROM products WHERE id = ${Number(ownId)}`,
    );
    assert.deepEqual({ ...reviewed[0] }, {
      title: "Edited after approval",
      status: "pending_review",
      review_status: "pending_review",
      review_version: 2,
      approved_version: 1,
    });
    const publicAfter = await (await fetch(`${baseUrl}/api/community`)).json();
    assert.equal(publicAfter.products.some((product) => product.id === ownId), false);
  });

  test("agent connect: upload_cover shares the member upload limit before scanner invocation", async () => {
    const email = `agent-key-upload-limit-${runId}@example.com`;
    const { token } = await makeKeyFor(email, "upload limit");
    const bucket = `upload:${createHash("sha256").update(`upload:${email}`).digest("hex")}`;
    const globalBucket = `upload-global:${createHash("sha256").update("upload-global:all").digest("hex")}`;
    const windowStart = Math.floor(Math.floor(Date.now() / 1000) / 3600) * 3600;
    const globalBefore = await queryLocalD1(
      `SELECT request_count FROM api_rate_limits WHERE bucket = ${quoteSql(globalBucket)} AND window_start = ${windowStart}`,
    );
    await executeLocalD1(
      `INSERT INTO api_rate_limits (bucket, window_start, request_count, updated_at)
       VALUES (${quoteSql(bucket)}, ${windowStart}, 30, CURRENT_TIMESTAMP)
       ON CONFLICT(bucket, window_start) DO UPDATE SET request_count = 30, updated_at = CURRENT_TIMESTAMP`,
    );
    const beforeUploads = await queryLocalD1(
      `SELECT COUNT(*) AS count FROM uploaded_files WHERE owner_email = ${quoteSql(email)}`,
    );
    const scannerCallsBefore = uploadScannerRequestCount;
    const blocked = await tool(token, "upload_cover", {
      filename: "rate-limited-cover.png",
      mime_type: "image/png",
      data_base64: Buffer.concat([onePixelPng, Buffer.from("SCANNER-UNAVAILABLE-TEST")]).toString("base64"),
    });
    assert.equal(blocked.isError, true);
    assert.equal(blocked.structuredContent.error, "rate_limit_exceeded");
    const afterUploads = await queryLocalD1(
      `SELECT COUNT(*) AS count FROM uploaded_files WHERE owner_email = ${quoteSql(email)}`,
    );
    assert.equal(afterUploads[0].count, beforeUploads[0].count);
    assert.equal(uploadScannerRequestCount, scannerCallsBefore);
    const globalAfter = await queryLocalD1(
      `SELECT request_count FROM api_rate_limits WHERE bucket = ${quoteSql(globalBucket)} AND window_start = ${windowStart}`,
    );
    assert.equal(globalAfter[0]?.request_count ?? 0, globalBefore[0]?.request_count ?? 0,
      "a rejected member upload does not consume the global upload bucket");
    const limitCounter = await queryLocalD1(
      `SELECT request_count FROM api_rate_limits WHERE bucket = ${quoteSql(bucket)} AND window_start = ${windowStart}`,
    );
    assert.equal(limitCounter[0].request_count, 31);
  });

  test("agent connect: upload_cover uses private clean scan records and scanner failure yields no usable key", async () => {
    const email = `agent-key-upload-${runId}@example.com`;
    const { token } = await makeKeyFor(email, "upload");
    const beforeBypass = await queryLocalD1(`SELECT COUNT(*) AS count FROM products WHERE owner_email = ${quoteSql(email)}`);
    const bypassCreate = await tool(token, "create_product", {
      title: "Unscanned cover attempt",
      description: "An arbitrary image_url must be rejected unless it came from upload_cover.",
      category: "开发工具",
      image_url: "https://attacker.example/cover.png",
    });
    assert.equal(bypassCreate.isError, true);
    assert.equal(bypassCreate.structuredContent.error, "invalid_arguments");
    const afterBypass = await queryLocalD1(`SELECT COUNT(*) AS count FROM products WHERE owner_email = ${quoteSql(email)}`);
    assert.equal(afterBypass[0].count, beforeBypass[0].count, "unscanned image_url does not create a product");

    const cleanUpload = await tool(token, "upload_cover", {
      filename: "cover.png",
      mime_type: "image/png",
      data_base64: onePixelPng.toString("base64"),
    });
    assert.equal(cleanUpload.isError, undefined);
    const key = cleanUpload.structuredContent.cover_upload_key;
    assert.match(key, /^[a-f0-9-]+\.png$/);
    const cleanRows = await queryLocalD1(
      `SELECT owner_email, visibility, purpose, scan_status FROM uploaded_files WHERE key = ${quoteSql(key)}`,
    );
    assert.deepEqual({ ...cleanRows[0] }, {
      owner_email: email,
      visibility: "private",
      purpose: "product_cover",
      scan_status: "clean",
    });

    const used = await tool(token, "create_product", {
      title: "Scanned cover sample",
      description: "This product uses a cover image after the scanner marked the object clean.",
      category: "声音影像",
      cover_upload_key: key,
    });
    assert.equal(used.isError, undefined);
    assert.equal(used.structuredContent.product.imageUrl, `/api/uploads/${key}`);
    const beforeUpdateBypass = await queryLocalD1(
      `SELECT title, image_url FROM products WHERE id = ${Number(used.structuredContent.product.id)}`,
    );
    const bypassUpdate = await tool(token, "update_product", {
      id: used.structuredContent.product.id,
      imageUrl: "https://attacker.example/cover.png",
    });
    assert.equal(bypassUpdate.isError, true);
    assert.equal(bypassUpdate.structuredContent.error, "invalid_arguments");
    const afterUpdateBypass = await queryLocalD1(
      `SELECT title, image_url FROM products WHERE id = ${Number(used.structuredContent.product.id)}`,
    );
    assert.deepEqual(afterUpdateBypass, beforeUpdateBypass, "unscanned imageUrl does not mutate the product");

    const failingBytes = Buffer.concat([onePixelPng, Buffer.from("SCANNER-UNAVAILABLE-TEST")]);
    const failedUpload = await tool(token, "upload_cover", {
      filename: "scanner-fails.png",
      mime_type: "image/png",
      data_base64: failingBytes.toString("base64"),
    });
    assert.equal(failedUpload.isError, true);
    assert.equal(failedUpload.structuredContent.error, "upload_scanner_unavailable");
    assert.equal(Object.hasOwn(failedUpload.structuredContent, "cover_upload_key"), false);
    const failedRows = await queryLocalD1(
      `SELECT visibility, purpose, scan_status, quarantine_key FROM uploaded_files
       WHERE owner_email = ${quoteSql(email)} AND original_name = 'scanner-fails.png'`,
    );
    assert.equal(failedRows.length, 1);
    assert.equal(failedRows[0].visibility, "private");
    assert.equal(failedRows[0].purpose, "product_cover");
    assert.equal(failedRows[0].scan_status, "error");
    assert.equal(failedRows[0].quarantine_key, null);
  });

  test("agent connect: ungranted begin_hosting_upload is audited and creates no token or hosting row", async () => {
    const email = `agent-hosting-ungranted-${runId}@example.com`;
    const { token, key } = await makeKeyFor(email, "hosting ungranted");
    const product = await tool(token, "create_product", {
      title: "Uninvited hosting product",
      description: "This product has no hosting grant and must not receive an upload token.",
      category: "开发工具",
    });
    assert.equal(product.isError, undefined);
    const productId = Number(product.structuredContent.product.id);

    const denied = await tool(token, "begin_hosting_upload", { product_id: productId });
    assert.equal(denied.isError, true);
    assert.equal(denied.structuredContent.error, "hosting_not_granted");
    const audit = await queryLocalD1(
      `SELECT credential_kind, credential_id, tool_name, product_id, result FROM mcp_write_audit
       WHERE member_email = ${quoteSql(email)} AND tool_name = 'begin_hosting_upload'`,
    );
    assert.equal(audit.length, 1);
    assert.equal(audit[0].credential_kind, "api_key");
    assert.equal(audit[0].credential_id, key.id);
    assert.equal(audit[0].tool_name, "begin_hosting_upload");
    assert.equal(Number(audit[0].product_id), productId);
    assert.equal(audit[0].result, "hosting_not_granted");
    const tokens = await queryLocalD1(
      `SELECT COUNT(*) AS count FROM hosting_upload_tokens WHERE member_email = ${quoteSql(email)} AND product_id = ${productId}`,
    );
    const hostings = await queryLocalD1(`SELECT COUNT(*) AS count FROM product_hostings WHERE product_id = ${productId}`);
    assert.equal(Number(tokens[0].count), 0);
    assert.equal(Number(hostings[0].count), 0);
  });

  test("agent connect: authorized MCP hosting uploads once, exposes queued status, and audits removal without token leakage", async () => {
    const email = `agent-hosting-flow-${runId}@example.com`;
    const { token, key } = await makeKeyFor(email, "hosting flow");
    await grantHosting(email);
    const product = await tool(token, "create_product", {
      title: "MCP hosted product",
      description: "A static site submitted using the one-time upload URL.",
      category: "开发工具",
    });
    assert.equal(product.isError, undefined);
    const productId = Number(product.structuredContent.product.id);

    const begun = await tool(token, "begin_hosting_upload", { product_id: productId });
    assert.equal(begun.isError, undefined);
    const issued = begun.structuredContent;
    const uploadUrl = new URL(issued.upload_url);
    assert.equal(uploadUrl.origin, new URL(baseUrl).origin);
    assert.equal(/^\/api\/hosting\/bundles\/[A-Za-z0-9_-]{43}$/.test(uploadUrl.pathname), true);
    assert.equal(uploadUrl.search, "");
    assert.equal(issued.method, "PUT");
    assert.equal(issued.content_type, "application/zip");
    assert.equal(issued.max_bytes, hostingRules.bundle.maxZipBytes);
    const expiresAt = Date.parse(issued.expires_at);
    assert.equal(Number.isNaN(expiresAt), false);
    assert.equal(expiresAt > Date.now(), true);
    assert.equal(expiresAt - Date.now() <= 15 * 60 * 1000, true);
    const issuedToken = uploadUrl.pathname.split("/").at(-1);
    assert.equal(/^[A-Za-z0-9_-]{43}$/.test(issuedToken), true);
    assert.equal(issued.instructions.startsWith("curl --fail --show-error -sS -X PUT -H \"content-type: application/zip\" --data-binary @bundle.zip \""), true);
    assert.equal(issued.instructions.includes(issued.upload_url), true);
    assert.equal(issued.instructions.endsWith("\" # One-time URL; valid for 15 minutes; do not share."), true);

    const zip = cleanHostingZip();
    const firstUpload = await fetch(issued.upload_url, {
      method: "PUT",
      headers: { "content-type": "application/zip" },
      body: zip,
    });
    const firstUploadBody = await firstUpload.json();
    assert.equal(firstUpload.status, 201, JSON.stringify(firstUploadBody));
    assert.equal(firstUploadBody.hosting.state, "queued");

    const status = await tool(token, "get_hosting_status", { product_id: productId });
    assert.equal(status.isError, undefined);
    assert.equal(Number.isSafeInteger(status.structuredContent.reviewVersion), true);
    assert.equal(Number.isSafeInteger(status.structuredContent.approvedVersion), true);
    assert.equal(status.structuredContent.hosting.state, "queued");
    assert.equal(status.structuredContent.hosting.desired, "staged");
    assert.equal(typeof status.structuredContent.next_step, "string");
    assert.match(status.structuredContent.next_step, /wait and poll/);
    const statusAudit = await queryLocalD1(
      `SELECT COUNT(*) AS count FROM mcp_write_audit WHERE member_email = ${quoteSql(email)} AND tool_name = 'get_hosting_status'`,
    );
    assert.equal(Number(statusAudit[0].count), 0);

    const filesBeforeReplay = await queryLocalD1(
      `SELECT COUNT(*) AS count FROM uploaded_files WHERE owner_email = ${quoteSql(email)} AND purpose = 'hosting_bundle'`,
    );
    const hostingBeforeReplay = await queryLocalD1(`SELECT COUNT(*) AS count FROM product_hostings WHERE product_id = ${productId}`);
    const replay = await fetch(issued.upload_url, {
      method: "PUT",
      headers: { "content-type": "application/zip" },
      body: zip,
    });
    const replayBody = await replay.json();
    assert.equal(replay.status, 401);
    assert.equal(replayBody.error, "invalid_upload_token");
    const filesAfterReplay = await queryLocalD1(
      `SELECT COUNT(*) AS count FROM uploaded_files WHERE owner_email = ${quoteSql(email)} AND purpose = 'hosting_bundle'`,
    );
    const hostingAfterReplay = await queryLocalD1(`SELECT COUNT(*) AS count FROM product_hostings WHERE product_id = ${productId}`);
    assert.equal(Number(filesAfterReplay[0].count), Number(filesBeforeReplay[0].count));
    assert.equal(Number(hostingAfterReplay[0].count), Number(hostingBeforeReplay[0].count));

    const removed = await tool(token, "remove_hosting", { product_id: productId });
    assert.equal(removed.isError, undefined);
    assert.equal(removed.structuredContent.product_id, productId);
    assert.equal(removed.structuredContent.requested, true);
    const hosting = await queryLocalD1(`SELECT state, desired, site_id FROM product_hostings WHERE product_id = ${productId}`);
    assert.equal(hosting.length, 1);
    assert.equal(hosting[0].state, "removed");
    assert.equal(hosting[0].desired, "removed");
    assert.equal(hosting[0].site_id, null);
    const statusAfterRemoval = await tool(token, "get_hosting_status", { product_id: productId });
    assert.equal(statusAfterRemoval.isError, undefined);
    assert.equal(statusAfterRemoval.structuredContent.hosting, null);
    assert.equal(statusAfterRemoval.structuredContent.next_step.includes("does not expose removed rows or confirm remote cleanup"), true);
    const beginAudit = await queryLocalD1(
      `SELECT credential_kind, credential_id, tool_name, product_id, result FROM mcp_write_audit
       WHERE member_email = ${quoteSql(email)} AND tool_name = 'begin_hosting_upload'`,
    );
    const removeAudit = await queryLocalD1(
      `SELECT credential_kind, credential_id, tool_name, product_id, result FROM mcp_write_audit
       WHERE member_email = ${quoteSql(email)} AND tool_name = 'remove_hosting'`,
    );
    assert.equal(beginAudit.length, 1);
    assert.equal(beginAudit[0].credential_kind, "api_key");
    assert.equal(beginAudit[0].credential_id, key.id);
    assert.equal(beginAudit[0].tool_name, "begin_hosting_upload");
    assert.equal(Number(beginAudit[0].product_id), productId);
    assert.equal(beginAudit[0].result, "ok");
    assert.equal(removeAudit.length, 1);
    assert.equal(removeAudit[0].credential_kind, "api_key");
    assert.equal(removeAudit[0].credential_id, key.id);
    assert.equal(removeAudit[0].tool_name, "remove_hosting");
    assert.equal(Number(removeAudit[0].product_id), productId);
    assert.equal(removeAudit[0].result, "ok");

    const allAuditText = await queryLocalD1("SELECT * FROM mcp_write_audit");
    for (const row of allAuditText) {
      for (const column of Object.keys(row)) {
        if (typeof row[column] === "string") assert.equal(row[column].includes(issuedToken), false, `audit ${column} must not contain the upload token`);
      }
    }
  });

  test("agent connect: hosting begin masks non-owner products and rejects demo_url without creating tokens", async () => {
    const email = `agent-hosting-ownership-${runId}@example.com`;
    const { token } = await makeKeyFor(email, "hosting ownership");
    await grantHosting(email);
    const demoProduct = await tool(token, "create_product", {
      title: "External demo conflict",
      description: "A hosted project must not retain an external demo URL.",
      category: "开发工具",
      demo_url: "https://demo.example/hosted-conflict",
    });
    assert.equal(demoProduct.isError, undefined);
    const demoProductId = Number(demoProduct.structuredContent.product.id);

    const otherEmail = `agent-hosting-owner-${runId}@example.com`;
    const other = await makeKeyFor(otherEmail, "other hosting owner");
    const foreignProduct = await tool(other.token, "create_product", {
      title: "Another member's product",
      description: "This product belongs to a different member.",
      category: "开发工具",
    });
    assert.equal(foreignProduct.isError, undefined);
    const foreignProductId = Number(foreignProduct.structuredContent.product.id);

    const demoDenied = await tool(token, "begin_hosting_upload", { product_id: demoProductId });
    assert.equal(demoDenied.isError, true);
    assert.equal(demoDenied.structuredContent.error, "hosting_demo_url_conflict");
    const foreignDenied = await tool(token, "begin_hosting_upload", { product_id: foreignProductId });
    const missingDenied = await tool(token, "begin_hosting_upload", { product_id: 2147483000 });
    assert.equal(foreignDenied.isError, true);
    assert.equal(missingDenied.isError, true);
    assert.equal(foreignDenied.structuredContent.error, "product_not_found");
    assert.equal(missingDenied.structuredContent.error, "product_not_found");
    assert.equal(foreignDenied.structuredContent.error, missingDenied.structuredContent.error);

    const audits = await queryLocalD1(
      `SELECT tool_name, product_id, result FROM mcp_write_audit
       WHERE member_email = ${quoteSql(email)} AND tool_name = 'begin_hosting_upload' ORDER BY rowid`,
    );
    assert.equal(audits.length, 3);
    assert.equal(audits[0].tool_name, "begin_hosting_upload");
    assert.equal(Number(audits[0].product_id), demoProductId);
    assert.equal(audits[0].result, "hosting_demo_url_conflict");
    assert.equal(Number(audits[1].product_id), foreignProductId);
    assert.equal(audits[1].result, "product_not_found");
    assert.equal(Number(audits[2].product_id), 2147483000);
    assert.equal(audits[2].result, "product_not_found");
    const tokens = await queryLocalD1(`SELECT COUNT(*) AS count FROM hosting_upload_tokens WHERE member_email = ${quoteSql(email)}`);
    const hostings = await queryLocalD1(
      `SELECT COUNT(*) AS count FROM product_hostings WHERE product_id IN (${demoProductId}, ${foreignProductId}, 2147483000)`,
    );
    assert.equal(Number(tokens[0].count), 0);
    assert.equal(Number(hostings[0].count), 0);
  });

  test("agent connect: hosting upload token creation is capped at ten attempts per member per hour", async () => {
    const email = `agent-hosting-rate-${runId}@example.com`;
    const { token } = await makeKeyFor(email, "hosting token rate");
    await grantHosting(email);
    const product = await tool(token, "create_product", {
      title: "Hosting token rate limit",
      description: "This product exercises the separate member token-creation bucket.",
      category: "开发工具",
    });
    assert.equal(product.isError, undefined);
    const productId = Number(product.structuredContent.product.id);

    for (let index = 0; index < 10; index += 1) {
      const issued = await tool(token, "begin_hosting_upload", { product_id: productId });
      assert.equal(issued.isError, undefined, `token attempt ${index + 1} is within the hourly cap`);
      assert.equal(/^https?:\/\//.test(issued.structuredContent.upload_url), true);
      await executeLocalD1(
        `UPDATE hosting_upload_tokens SET used_at = CURRENT_TIMESTAMP
         WHERE member_email = ${quoteSql(email)} AND used_at IS NULL`,
      );
    }
    const beforeEleventh = await queryLocalD1(
      `SELECT COUNT(*) AS count FROM hosting_upload_tokens WHERE member_email = ${quoteSql(email)}`,
    );
    assert.equal(Number(beforeEleventh[0].count), 10);

    const denied = await tool(token, "begin_hosting_upload", { product_id: productId });
    assert.equal(denied.isError, true);
    assert.equal(denied.structuredContent.error, "rate_limit_exceeded");
    const afterEleventh = await queryLocalD1(
      `SELECT COUNT(*) AS count FROM hosting_upload_tokens WHERE member_email = ${quoteSql(email)}`,
    );
    assert.equal(Number(afterEleventh[0].count), Number(beforeEleventh[0].count));
    const rateBucket = `hosting-token:${createHash("sha256").update(`hosting-token:${email}`).digest("hex")}`;
    const windowStart = Math.floor(Math.floor(Date.now() / 1000) / 3600) * 3600;
    const rateCounter = await queryLocalD1(
      `SELECT request_count FROM api_rate_limits WHERE bucket = ${quoteSql(rateBucket)} AND window_start = ${windowStart}`,
    );
    assert.equal(rateCounter.length, 1);
    assert.equal(Number(rateCounter[0].request_count), 11);
    const audits = await queryLocalD1(
      `SELECT product_id, result FROM mcp_write_audit
       WHERE member_email = ${quoteSql(email)} AND tool_name = 'begin_hosting_upload' ORDER BY rowid`,
    );
    assert.equal(audits.length, 11);
    assert.equal(Number(audits[10].product_id), productId);
    assert.equal(audits[10].result, "rate_limit_exceeded");
  });
}
