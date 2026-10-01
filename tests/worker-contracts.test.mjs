// Worker 纯模块契约测试:请求体上闸、匿名边缘缓存、安全头。
// 这些是 Request/Response 级纯函数,不启动 Wrangler preview、不依赖 D1;
// cron purge registry 的 fake-D1 契约在 purge 模块抽离后单独覆盖。
// 注意:Node 的类型剥离只覆盖 .ts/.mts,本文件(.mjs)必须是纯 JavaScript。
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { MAX_REQUEST_BYTES, prepareRequestBody } from "../worker/request-body.ts";
import { withSecurityHeaders } from "../app/lib/security-policy.ts";
import { createDocDataCache } from "../app/api/_lib/doc-data-cache.ts";

const ORIGIN = "https://aetherstudio.top";
const LIMIT = MAX_REQUEST_BYTES;

function bufferOf(size) {
  return new Uint8Array(size).fill(65);
}

function htmlResponse(body = "<html><body>ok</body></html>", headers = {}) {
  return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
}

// ---- prepareRequestBody ----

test("request-body: GET 与无体请求原样透传", async () => {
  const get = new Request(`${ORIGIN}/api/community`);
  assert.equal(await prepareRequestBody(get), get);
  const head = new Request(`${ORIGIN}/`, { method: "HEAD" });
  assert.equal(await prepareRequestBody(head), head);
});

test("request-body: content-length 快路径超限直接 413,不读取 body", async () => {
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(bufferOf(16)); controller.close(); },
  });
  const request = new Request(`${ORIGIN}/api/uploads`, {
    method: "POST",
    headers: { "content-length": String(LIMIT + 1) },
    body: stream,
    duplex: "half",
  });
  const result = await prepareRequestBody(request);
  assert.ok(result instanceof Response);
  assert.equal(result.status, 413);
  assert.deepEqual(await result.json(), { error: "request_too_large" });
  assert.equal(request.body.locked, false);
});

test("request-body: 边界内(LIMIT-1 与 LIMIT)缓冲后重建,内容逐字节一致", async () => {
  for (const size of [LIMIT - 1, LIMIT]) {
    const payload = bufferOf(size);
    const request = new Request(`${ORIGIN}/api/uploads`, { method: "POST", body: payload });
    const result = await prepareRequestBody(request);
    assert.ok(result instanceof Request);
    const rebuilt = await result.arrayBuffer();
    assert.equal(rebuilt.byteLength, size);
    assert.equal(new Uint8Array(rebuilt)[0], 65);
  }
});

test("request-body: 声明长度可信但实际字节超限同样 413", async () => {
  const payload = bufferOf(LIMIT + 1);
  const request = new Request(`${ORIGIN}/api/uploads`, { method: "POST", body: payload });
  request.headers.set("content-length", "16");
  const result = await prepareRequestBody(request);
  assert.ok(result instanceof Response);
  assert.equal(result.status, 413);
});

test("request-body: DELETE 同样受上限约束", async () => {
  const request = new Request(`${ORIGIN}/api/docs`, {
    method: "DELETE",
    body: bufferOf(LIMIT + 1),
  });
  const result = await prepareRequestBody(request);
  assert.ok(result instanceof Response);
  assert.equal(result.status, 413);
});

test("request-body: 无 content-length 的流式 body 超限即 413 且取消 reader", async () => {
  let canceled = false;
  let pulls = 0;
  const stream = new ReadableStream({
    pull(controller) {
      pulls += 1;
      controller.enqueue(bufferOf(1024 * 1024));
    },
    cancel() { canceled = true; },
  });
  const request = new Request(`${ORIGIN}/api/uploads`, {
    method: "POST",
    body: stream,
    duplex: "half",
  });
  const result = await prepareRequestBody(request);
  assert.ok(result instanceof Response);
  assert.equal(result.status, 413);
  assert.equal(pulls, 12); // 11 块在内,第 12 块触顶即停
  assert.equal(canceled, true);
});

test("request-body: 无 content-length 的小流正常重建", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("hello "));
      controller.enqueue(new TextEncoder().encode("world"));
      controller.close();
    },
  });
  const request = new Request(`${ORIGIN}/api/comments`, {
    method: "POST",
    body: stream,
    duplex: "half",
  });
  const result = await prepareRequestBody(request);
  assert.ok(result instanceof Request);
  assert.equal(await result.text(), "hello world");
});

// ---- anon-cache ----

// anon-cache 模块加载时读取 CF 专属 caches.default;在任何 import 之前安装一次
// Map-backed fake,之后所有用例共享同一 store(每个用例使用独占 URL 避免串扰)。
const edgeStore = new Map();
const fakeEdgeCache = {
  async match(request) {
    const entry = edgeStore.get(request.url);
    if (!entry) return undefined;
    return new Response(entry.body, { status: entry.status, headers: entry.headers });
  },
  async put(request, response) {
    edgeStore.set(request.url, {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.arrayBuffer(),
    });
  },
};
globalThis.caches = { default: fakeEdgeCache };

const anonCache = await import("../worker/anon-cache.ts");
const { handleWithAnonCache, ANON_PAGE_CACHE_TTL_SECONDS, ANON_SERVE_STALE_WINDOW_SECONDS } = anonCache;

function fakeCtx() {
  const pending = [];
  return {
    pending,
    waitUntil(promise) { pending.push(promise); },
    async settle() { await Promise.allSettled(pending.splice(0)); },
  };
}

function secondsAgo(offset) {
  return String(Math.floor(Date.now() / 1000) - offset);
}

function fakeHandler(body = "<html><body>page</body></html>", headers = {}) {
  const calls = [];
  return {
    calls,
    async fetch(request) {
      calls.push(request);
      return htmlResponse(body, headers);
    },
  };
}

const identityHeaders = (_request, response) => {
  const headers = new Headers(response.headers);
  headers.set("x-security-marker", "1");
  return new Response(response.body, { status: response.status, headers });
};

const PROD = { APP_ENV: "production" };

test("anon-cache: 非 production 一律 bypass", async () => {
  const handler = fakeHandler();
  const request = new Request(`${ORIGIN}/cache-test/off`);
  const result = await handleWithAnonCache(request, new URL(request.url), handler, { APP_ENV: "test" }, fakeCtx(), ORIGIN, identityHeaders);
  assert.equal(result, null);
  assert.equal(handler.calls.length, 0);
});

test("anon-cache: cookie / authorization / no-cache / 排除路径全部 bypass", async () => {
  const cases = [
    ["cookie", new Request(`${ORIGIN}/cache-test/cookie`, { headers: { cookie: "zaochang_session=x" } })],
    ["authorization", new Request(`${ORIGIN}/cache-test/auth`, { headers: { authorization: "Bearer x" } })],
    ["no-cache", new Request(`${ORIGIN}/cache-test/nocache`, { headers: { "cache-control": "no-cache" } })],
    ["api", new Request(`${ORIGIN}/api/community`)],
    ["oauth", new Request(`${ORIGIN}/oauth/authorize`)],
    ["admin", new Request(`${ORIGIN}/admin`)],
    ["well-known", new Request(`${ORIGIN}/.well-known/openid-configuration`)],
    ["product-apps", new Request(`${ORIGIN}/product-apps/mori/index.html`)],
    ["post", new Request(`${ORIGIN}/cache-test/post`, { method: "POST" })],
  ];
  for (const [label, request] of cases) {
    const handler = fakeHandler();
    const result = await handleWithAnonCache(request, new URL(request.url), handler, PROD, fakeCtx(), ORIGIN, identityHeaders);
    assert.equal(result, null, label);
    assert.equal(handler.calls.length, 0, label);
  }
});

test("anon-cache: miss 写入边缘,后续 TTL 内 hit 且 cache-control 钳回设计值", async () => {
  const handler = fakeHandler();
  const ctx = fakeCtx();
  const url = new URL(`${ORIGIN}/cache-test/hit`);

  const first = await handleWithAnonCache(new Request(url), url, handler, PROD, ctx, ORIGIN, identityHeaders);
  assert.ok(first);
  assert.equal(first.headers.get("x-zc-anon-cache"), "miss");
  assert.equal(first.headers.get("x-security-marker"), "1");
  await ctx.settle();
  assert.equal(handler.calls.length, 1);
  assert.equal(edgeStore.has(url.href), true);

  const second = await handleWithAnonCache(new Request(url), url, handler, PROD, fakeCtx(), ORIGIN, identityHeaders);
  assert.ok(second);
  assert.equal(second.headers.get("x-zc-anon-cache"), "hit");
  assert.equal(second.headers.get("cache-control"), "public, max-age=0, s-maxage=60");
  assert.equal(second.headers.get("x-security-marker"), "1");
  assert.equal(await second.text(), "<html><body>page</body></html>");
  assert.equal(handler.calls.length, 1);
});

test("anon-cache: stale 窗口内回旧副本并后台重验证一次(并发去重)", async () => {
  const url = new URL(`${ORIGIN}/cache-test/stale`);
  edgeStore.set(url.href, {
    status: 200,
    headers: {
      "content-type": "text/html",
      "x-zc-anon-cached-at": secondsAgo(ANON_PAGE_CACHE_TTL_SECONDS + 10),
      "x-security-marker": "1",
    },
    body: new TextEncoder().encode("<html>old</html>").buffer,
  });

  const handler = fakeHandler("<html>fresh</html>");
  const ctx1 = fakeCtx();
  const first = await handleWithAnonCache(new Request(url), url, handler, PROD, ctx1, ORIGIN, identityHeaders);
  assert.ok(first);
  assert.equal(first.headers.get("x-zc-anon-cache"), "stale");
  assert.equal(first.headers.get("cache-control"), "public, max-age=0, s-maxage=60");
  assert.equal(await first.text(), "<html>old</html>");
  assert.equal(ctx1.pending.length, 1);

  // 重验证仍在途时再来一个 stale 请求:命中旧副本,但不发起第二次后台重渲。
  const ctx2 = fakeCtx();
  const second = await handleWithAnonCache(new Request(url), url, handler, PROD, ctx2, ORIGIN, identityHeaders);
  assert.equal(second?.headers.get("x-zc-anon-cache"), "stale");
  assert.equal(ctx2.pending.length, 1);

  await ctx1.settle();
  await ctx2.settle();
  assert.equal(handler.calls.length, 1);
  const refreshed = edgeStore.get(url.href);
  assert.ok(refreshed);
  assert.equal(new TextDecoder().decode(refreshed.body), "<html>fresh</html>");
});

test("anon-cache: 超出 stale 窗口按未命中回源", async () => {
  const url = new URL(`${ORIGIN}/cache-test/expired`);
  edgeStore.set(url.href, {
    status: 200,
    headers: { "content-type": "text/html", "x-zc-anon-cached-at": secondsAgo(ANON_PAGE_CACHE_TTL_SECONDS + ANON_SERVE_STALE_WINDOW_SECONDS + 5) },
    body: new TextEncoder().encode("<html>ancient</html>").buffer,
  });
  const handler = fakeHandler("<html>origin</html>");
  const ctx = fakeCtx();
  const result = await handleWithAnonCache(new Request(url), url, handler, PROD, ctx, ORIGIN, identityHeaders);
  assert.ok(result);
  assert.equal(result.headers.get("x-zc-anon-cache"), "miss");
  assert.equal(await result.text(), "<html>origin</html>");
  assert.equal(handler.calls.length, 1);
});

test("anon-cache: set-cookie、非 200、非 HTML 响应均不入缓存", async () => {
  const url = new URL(`${ORIGIN}/cache-test/not-stored`);
  const ctx = fakeCtx();

  const withCookie = await handleWithAnonCache(new Request(url), url,
    { async fetch() { return htmlResponse("<html>a</html>", { "set-cookie": "x=1" }); } },
    PROD, ctx, ORIGIN, identityHeaders);
  assert.equal(withCookie?.headers.get("x-zc-anon-cache"), null);

  const notFound = await handleWithAnonCache(new Request(url), url,
    { async fetch() { return new Response("<html>404</html>", { status: 404, headers: { "content-type": "text/html" } }); } },
    PROD, ctx, ORIGIN, identityHeaders);
  assert.equal(notFound?.headers.get("x-zc-anon-cache"), null);

  const json = await handleWithAnonCache(new Request(url), url,
    { async fetch() { return new Response("{}", { status: 200, headers: { "content-type": "application/json" } }); } },
    PROD, ctx, ORIGIN, identityHeaders);
  assert.equal(json?.headers.get("x-zc-anon-cache"), null);

  await ctx.settle();
  assert.equal(edgeStore.has(url.href), false);
});

test("anon-cache: .rsc 负载按路径可缓存", async () => {
  const url = new URL(`${ORIGIN}/cache-test/page.rsc`);
  const handler = { async fetch() { return new Response("rsc-payload", { status: 200, headers: { "content-type": "text/x-component" } }); } };
  const ctx = fakeCtx();
  const first = await handleWithAnonCache(new Request(url), url, handler, PROD, ctx, ORIGIN, identityHeaders);
  assert.equal(first?.headers.get("x-zc-anon-cache"), "miss");
  await ctx.settle();
  const second = await handleWithAnonCache(new Request(url), url, handler, PROD, fakeCtx(), ORIGIN, identityHeaders);
  assert.equal(second?.headers.get("x-zc-anon-cache"), "hit");
});

// ---- security-policy ----

test("security: 普通 HTML 页 DENY + frame-ancestors none + HTTPS HSTS", () => {
  const request = new Request(`${ORIGIN}/galaxy`);
  const secured = withSecurityHeaders(request, htmlResponse(), ORIGIN);
  assert.equal(secured.headers.get("x-frame-options"), "DENY");
  assert.equal(secured.headers.get("x-content-type-options"), "nosniff");
  assert.equal(secured.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(secured.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(secured.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
  const csp = secured.headers.get("content-security-policy") ?? "";
  assert.ok(csp.includes("frame-ancestors 'none'"));
  assert.ok(csp.includes("default-src 'self'"));
  assert.ok(!csp.includes("challenges.cloudflare.com"));
});

test("security: http 源不加 HSTS", () => {
  const secured = withSecurityHeaders(new Request("http://localhost:8788/galaxy"), htmlResponse(), "http://localhost:8788");
  assert.equal(secured.headers.get("strict-transport-security"), null);
});

test("security: /product-apps/* 允许同源 iframe", () => {
  const secured = withSecurityHeaders(new Request(`${ORIGIN}/product-apps/mori/index.html`), htmlResponse(), ORIGIN);
  assert.equal(secured.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.ok((secured.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'self'"));
});

test("security: /api/auth/github/start 使用连接页专用 CSP", () => {
  const secured = withSecurityHeaders(new Request(`${ORIGIN}/api/auth/github/start`), htmlResponse(), ORIGIN);
  assert.equal(secured.headers.get("referrer-policy"), "no-referrer");
  assert.equal(secured.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=(), payment=()");
  const csp = secured.headers.get("content-security-policy") ?? "";
  assert.ok(csp.includes("default-src 'none'"));
  assert.ok(csp.includes("img-src https://github.com"));
  assert.ok(!csp.includes("default-src 'self'"));
});

test("security: /signin 放行 Turnstile 域名,其余页面不放行", () => {
  const signin = withSecurityHeaders(new Request(`${ORIGIN}/signin`), htmlResponse(), ORIGIN);
  const signinCsp = signin.headers.get("content-security-policy") ?? "";
  assert.ok(signinCsp.includes("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com"));
  assert.ok(signinCsp.includes("frame-src 'self' https://challenges.cloudflare.com"));
  const other = withSecurityHeaders(new Request(`${ORIGIN}/galaxy`), htmlResponse(), ORIGIN);
  assert.ok(!(other.headers.get("content-security-policy") ?? "").includes("challenges.cloudflare.com"));
});

test("security: 非 HTML 响应不写 CSP,但保留 nosniff/XFO 与 body", async () => {
  const response = new Response("{\"ok\":true}", { status: 200, headers: { "content-type": "application/json" } });
  const secured = withSecurityHeaders(new Request(`${ORIGIN}/api/community`), response, ORIGIN);
  assert.equal(secured.headers.get("content-security-policy"), null);
  assert.equal(secured.headers.get("x-content-type-options"), "nosniff");
  assert.equal(secured.headers.get("x-frame-options"), "DENY");
  assert.equal(await secured.text(), "{\"ok\":true}");
});

// ---- purge registry(纯 D1 工厂,worker cron 的唯一数据源)----

const { purgeRegistry, runPurgeRegistry } = await import("../app/api/_lib/purge/index.ts");
const { cleanupOrphanedHyperknowImages } = await import("../app/api/_lib/purge/hyperknow-images.ts");
const { finalizeHyperknowImageCache } = await import("../app/api/_lib/hyperknow/image-cache.ts");
const { completeScannedUploadSql, failScannedUploadSql } = await import("../app/api/_lib/hyperknow/image-upload-state.ts");
const { HYPERKNOW_IMAGE_CLEANUP_CRON, RETENTION_PURGE_CRON, scheduledPurgePlan } = await import("../worker/purge-schedule.ts");
const { oidcDiscoveryDocument } = await import("../app/api/_lib/oauth-discovery.ts");

function fakeD1(failLabels = []) {
  const prepared = [];
  return {
    prepared,
    prepare(sql) {
      const statement = {
        sql,
        async run() {
          if (failLabels.some((marker) => sql.includes(marker))) throw new Error("no such table: simulated");
          return { meta: { changes: 3 } };
        },
      };
      prepared.push(statement);
      return statement;
    },
  };
}

test("purge: 四域七条 statement 全部注册,SQL 与标签逐字固定", () => {
  const db = fakeD1();
  const registry = purgeRegistry(db);
  assert.equal(registry.length, 7);
  assert.deepEqual(registry.map((entry) => entry.label), [
    "oauth.authorization_requests",
    "oauth.authorization_codes",
    "oauth.access_tokens",
    "oauth.refresh_tokens",
    "external-fruit.payments",
    "email-codes.login_codes",
    "sessions.auth_sessions",
  ]);
  assert.deepEqual(db.prepared.map((entry) => entry.sql), [
    "DELETE FROM oauth_provider_authorization_requests WHERE expires_at <= CURRENT_TIMESTAMP",
    "DELETE FROM oauth_provider_authorization_codes WHERE expires_at <= CURRENT_TIMESTAMP",
    "DELETE FROM oauth_provider_access_tokens WHERE expires_at <= CURRENT_TIMESTAMP AND revoked_at IS NULL",
    "DELETE FROM oauth_provider_refresh_tokens WHERE expires_at <= CURRENT_TIMESTAMP AND revoked_at IS NULL AND replaced_by_hash IS NULL",
    "DELETE FROM external_fruit_payments WHERE status IN ('expired', 'cancelled') AND expires_at <= datetime('now', '-7 days')",
    "DELETE FROM email_login_codes WHERE expires_at <= datetime('now', '-1 day') OR consumed_at IS NOT NULL",
    "DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP",
  ]);
});

test("purge: 单条失败不阻断后续,日志含 label 且返回计数", async () => {
  const db = fakeD1(["oauth_provider_authorization_codes"]);
  const logs = [];
  const errors = [];
  const logger = { log: (message) => logs.push(message), error: (message) => errors.push(message) };
  const result = await runPurgeRegistry(db, logger);
  assert.deepEqual(result, { ok: 6, failed: 1 });
  assert.equal(errors.length, 1);
  assert.ok(errors[0].startsWith("[cron-purge] failed oauth.authorization_codes:"));
  assert.equal(logs.length, 6);
  assert.ok(logs.every((message) => /^\[cron-purge\] ok [\w.-]+ changes=3$/.test(message)));
  // 最后一条(sessions)在失败之后仍执行——注册表顺序不受影响。
  assert.ok(logs.at(-1).includes("sessions.auth_sessions"));
});

function createHyperknowCleanupFixture({ status = "clean", afterCandidateRead, failRowDelete = false } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  const state = { failRowDelete };
  sqlite.exec(`
    CREATE TABLE uploaded_files (
      key TEXT PRIMARY KEY, owner_email TEXT NOT NULL, original_name TEXT NOT NULL,
      media_type TEXT NOT NULL, byte_size INTEGER NOT NULL, visibility TEXT NOT NULL,
      purpose TEXT NOT NULL, sha256 TEXT NOT NULL, scan_status TEXT NOT NULL,
      scan_engine TEXT, scan_signature TEXT, quarantine_key TEXT,
      hyperknow_image INTEGER NOT NULL, hyperknow_image_cleanup_token TEXT,
      hyperknow_image_cleanup_expires_at TEXT, created_at TEXT NOT NULL, scanned_at TEXT
    );
    CREATE TABLE hk_lecture_images (
      cache_key TEXT PRIMARY KEY, user_email TEXT NOT NULL, status TEXT NOT NULL,
      lease_token TEXT, lease_expires_at TEXT, url TEXT NOT NULL, caption TEXT,
      updated_at TEXT
    );
  `);
  const legacyMigration = readFileSync(new URL("../drizzle/0014_furry_vapor.sql", import.meta.url), "utf8");
  const triggerStart = legacyMigration.indexOf("CREATE TRIGGER `uploaded_files_scan_transition_guard`");
  assert.ok(triggerStart >= 0, "fixture loads the production pre-0026 scan guard");
  sqlite.exec(legacyMigration.slice(triggerStart));
  const cleanupMigration = readFileSync(new URL("../drizzle/0026_far_spyke.sql", import.meta.url), "utf8");
  sqlite.exec(cleanupMigration);
  sqlite.prepare(`INSERT INTO uploaded_files
    (key, owner_email, original_name, media_type, byte_size, visibility, purpose, sha256,
     scan_status, hyperknow_image, created_at)
    VALUES ('image-a.png', 'learner@example.com', 'image.png', 'image/png', 128,
      'private', 'general', 'sha256', ?, 1, datetime('now', '-20 minutes'))`).run(status);
  sqlite.prepare(`INSERT INTO hk_lecture_images
    (cache_key, user_email, status, lease_token, lease_expires_at, url)
    VALUES ('cache-a', 'learner@example.com', 'pending', 'lease-a', '2999-01-01T00:00:00.000Z', '')`).run();

  let afterSelectUsed = false;
  const db = {
    prepare(sql) {
      let values = [];
      return {
        bind(...boundValues) { values = boundValues; return this; },
        async all() {
          const results = sqlite.prepare(sql).all(...values);
          if (!afterSelectUsed && sql.includes("FROM uploaded_files AS f")) {
            afterSelectUsed = true;
            await afterCandidateRead?.();
          }
          return { results };
        },
        async run() {
          if (state.failRowDelete && sql.trimStart().startsWith("DELETE FROM uploaded_files")) {
            throw new Error("simulated D1 delete failure");
          }
          const result = sqlite.prepare(sql).run(...values);
          return { meta: { changes: Number(result.changes) } };
        },
      };
    },
  };
  return {
    db,
    state,
    getUpload() { return sqlite.prepare("SELECT * FROM uploaded_files WHERE key = 'image-a.png'").get(); },
    getCache() { return sqlite.prepare("SELECT * FROM hk_lecture_images WHERE cache_key = 'cache-a'").get(); },
    expireCleanupClaim() {
      sqlite.prepare(`UPDATE uploaded_files SET hyperknow_image_cleanup_expires_at = datetime('now', '-1 minute') WHERE key = 'image-a.png'`).run();
    },
    close() { sqlite.close(); },
  };
}

const finalizeCleanupFixtureCache = (db) => finalizeHyperknowImageCache(db, {
  url: "/api/uploads/image-a.png",
  caption: "caption",
  cacheKey: "cache-a",
  userEmail: "learner@example.com",
  leaseToken: "lease-a",
  now: new Date().toISOString(),
  uploadedKey: "image-a.png",
});

function imageBucket({ objects = ["image-a.png", "quarantine/image-a"], failDelete } = {}) {
  const state = new Set(objects);
  const calls = [];
  return {
    state,
    calls,
    async delete(key) {
      calls.push(key);
      if (await failDelete?.(key, calls.length)) throw new Error(`simulated R2 failure: ${key}`);
      state.delete(key);
    },
  };
}

test("purge hyperknow images: finalizer wins between candidate read and atomic claim", async () => {
  let finalizeResult;
  const fixture = createHyperknowCleanupFixture({
    afterCandidateRead: async () => { finalizeResult = await finalizeCleanupFixtureCache(fixture.db); },
  });
  const bucket = imageBucket();
  try {
    const result = await cleanupOrphanedHyperknowImages(fixture.db, bucket, { log() {}, error: assert.fail });
    assert.equal(finalizeResult.meta.changes, 1, "cache URL is committed before cleaner claims the row");
    assert.deepEqual(result, { deleted: 0, retained: 0, failed: 0 });
    assert.deepEqual(bucket.calls, [], "claim must fail after the cache URL becomes a reference");
    assert.equal(fixture.getCache().url, "/api/uploads/image-a.png");
    assert.equal(fixture.getUpload().hyperknow_image, 1);
    assert.equal(fixture.getUpload().hyperknow_image_cleanup_token, null);
    assert.deepEqual([...bucket.state].sort(), ["image-a.png", "quarantine/image-a"]);
  } finally { fixture.close(); }
});

test("uploaded-files guard: scan state stays one-way while cleanup-only claims are permitted", async () => {
  const fixture = createHyperknowCleanupFixture({ status: "pending" });
  try {
    const transition = await fixture.db.prepare(completeScannedUploadSql).bind("clamav", "image-a.png").run();
    assert.equal(transition.meta.changes, 1, "pending may transition to clean when no cleanup claim exists");
    assert.equal(fixture.getUpload().scan_status, "clean");
    await assert.rejects(
      fixture.db.prepare("UPDATE uploaded_files SET scan_status = 'pending' WHERE key = ?").bind("image-a.png").run(),
      /uploaded_file_scan_state_immutable/,
    );
    await assert.rejects(
      fixture.db.prepare("UPDATE uploaded_files SET scan_engine = 'forged' WHERE key = ?").bind("image-a.png").run(),
      /uploaded_file_scan_state_immutable/,
    );
  } finally { fixture.close(); }
});

test("purge hyperknow images: atomic claim blocks a concurrent cache finalizer", async () => {
  const fixture = createHyperknowCleanupFixture();
  const bucket = imageBucket();
  let finalizeResult;
  bucket.delete = async (key) => {
    bucket.calls.push(key);
    if (bucket.calls.length === 1) finalizeResult = await finalizeCleanupFixtureCache(fixture.db);
    bucket.state.delete(key);
  };
  try {
    const result = await cleanupOrphanedHyperknowImages(fixture.db, bucket, { log() {}, error: assert.fail });
    assert.equal(finalizeResult.meta.changes, 0, "finalizer cannot publish a URL while cleanup owns the claim");
    assert.deepEqual(result, { deleted: 1, retained: 0, failed: 0 });
    assert.equal(fixture.getUpload(), undefined, "claimed row is removed only after both R2 deletes");
    assert.equal(fixture.getCache().url, "");
    assert.equal(fixture.getCache().status, "pending");
    assert.deepEqual([...bucket.state], []);
  } finally { fixture.close(); }
});

test("purge hyperknow images: same-sweep late write keeps a tombstone after upload turns terminal", async () => {
  const fixture = createHyperknowCleanupFixture({ status: "pending" });
  const bucket = imageBucket();
  let injected = false;
  let blockedCompletion;
  bucket.delete = async (key) => {
    bucket.calls.push(key);
    bucket.state.delete(key);
    if (key === "image-a.png" && !injected) {
      injected = true;
      // The upload's R2 put lands after the cleaner deleted the key. Its completion
      // loses to the cleanup token; simulate the compensating R2 delete failing, then
      // the uploader recording its terminal error before this sweep finalizes D1.
      bucket.state.add(key);
      blockedCompletion = await fixture.db.prepare(completeScannedUploadSql).bind("scanner", "image-a.png").run();
      await fixture.db.prepare(failScannedUploadSql).bind("image-a.png").run();
    }
  };
  try {
    const result = await cleanupOrphanedHyperknowImages(fixture.db, bucket, { log() {}, error: assert.fail });
    assert.deepEqual(result, { deleted: 0, retained: 1, failed: 0 });
    assert.deepEqual(bucket.calls, ["image-a.png", "quarantine/image-a"]);
    assert.equal(blockedCompletion.meta.changes, 0, "late scanner completion cannot clear the cleanup claim");
    assert.equal(fixture.getUpload().scan_status, "error", "the upload may become terminal during this sweep");
    assert.ok(fixture.getUpload().hyperknow_image_cleanup_token, "the original pending candidate remains a durable tombstone");
    assert.equal(bucket.state.has("image-a.png"), true, "the failed compensating delete leaves a late object");
    assert.equal((await finalizeCleanupFixtureCache(fixture.db)).meta.changes, 0, "tombstone blocks cache publication");

    // The next sweep observes a terminal candidate and can safely remove its marker.
    fixture.expireCleanupClaim();
    const retry = await cleanupOrphanedHyperknowImages(fixture.db, bucket, { log() {}, error: assert.fail });
    assert.deepEqual(retry, { deleted: 1, retained: 0, failed: 0 });
    assert.equal(fixture.getUpload(), undefined, "terminal failed upload row is removed after the late object is swept");
    assert.deepEqual([...bucket.state], []);
  } finally { fixture.close(); }
});

test("purge hyperknow images: R2 failure before taking effect retains marker and retries", async () => {
  const fixture = createHyperknowCleanupFixture();
  let failOnce = true;
  const bucket = imageBucket({ failDelete: async (key) => {
    if (key === "image-a.png" && failOnce) { failOnce = false; return true; }
    return false;
  } });
  const errors = [];
  try {
    const first = await cleanupOrphanedHyperknowImages(fixture.db, bucket, { log() {}, error: (message) => errors.push(message) });
    assert.deepEqual(first, { deleted: 0, retained: 0, failed: 1 });
    assert.equal(fixture.getUpload().hyperknow_image, 1);
    assert.ok(fixture.getUpload().hyperknow_image_cleanup_token, "failed attempt keeps its expiring claim");
    assert.deepEqual([...bucket.state].sort(), ["image-a.png", "quarantine/image-a"]);
    assert.match(errors[0], /simulated R2 failure: image-a.png/);

    fixture.expireCleanupClaim();
    const retry = await cleanupOrphanedHyperknowImages(fixture.db, bucket, { log() {}, error: assert.fail });
    assert.deepEqual(retry, { deleted: 1, retained: 0, failed: 0 });
    assert.equal(fixture.getUpload(), undefined);
    assert.deepEqual([...bucket.state], []);
  } finally { fixture.close(); }
});

test("purge hyperknow images: quarantine delete failure leaves final object deleted and marker retryable", async () => {
  const fixture = createHyperknowCleanupFixture();
  let failOnce = true;
  const bucket = imageBucket({ failDelete: async (key) => {
    if (key.startsWith("quarantine/") && failOnce) { failOnce = false; return true; }
    return false;
  } });
  try {
    const first = await cleanupOrphanedHyperknowImages(fixture.db, bucket, { log() {}, error() {} });
    assert.deepEqual(first, { deleted: 0, retained: 0, failed: 1 });
    assert.equal(bucket.state.has("image-a.png"), false, "first R2 delete took effect");
    assert.equal(bucket.state.has("quarantine/image-a"), true, "failed quarantine delete did not take effect");
    assert.equal(fixture.getUpload().hyperknow_image, 1);
    assert.ok(fixture.getUpload().hyperknow_image_cleanup_token);

    fixture.expireCleanupClaim();
    const retry = await cleanupOrphanedHyperknowImages(fixture.db, bucket, { log() {}, error: assert.fail });
    assert.deepEqual(retry, { deleted: 1, retained: 0, failed: 0 });
    assert.equal(fixture.getUpload(), undefined);
    assert.deepEqual([...bucket.state], []);
  } finally { fixture.close(); }
});

test("purge hyperknow images: D1 failure after both R2 deletes keeps retry marker", async () => {
  const fixture = createHyperknowCleanupFixture({ failRowDelete: true });
  const bucket = imageBucket();
  const errors = [];
  try {
    const first = await cleanupOrphanedHyperknowImages(fixture.db, bucket, { log() {}, error: (message) => errors.push(message) });
    assert.deepEqual(first, { deleted: 0, retained: 0, failed: 1 });
    assert.deepEqual([...bucket.state], [], "both external deletes took effect before D1 failed");
    assert.equal(fixture.getUpload().hyperknow_image, 1, "durable marker remains after external state changed");
    assert.ok(fixture.getUpload().hyperknow_image_cleanup_token, "failed claim remains as an expiry-delayed retry gate");
    assert.match(errors[0], /simulated D1 delete failure/);

    fixture.state.failRowDelete = false;
    fixture.expireCleanupClaim();
    const retry = await cleanupOrphanedHyperknowImages(fixture.db, bucket, { log() {}, error: assert.fail });
    assert.deepEqual(retry, { deleted: 1, retained: 0, failed: 0 });
    assert.equal(fixture.getUpload(), undefined, "retry removes the marker after idempotent R2 deletes");
    assert.deepEqual([...bucket.state], []);
  } finally { fixture.close(); }
});

test("scheduled purge plan: 15-minute image cleanup and six-hour retention cron match production config", () => {
  const config = readFileSync(new URL("../wrangler.prod.jsonc", import.meta.url), "utf8");
  assert.ok(config.includes(`"${RETENTION_PURGE_CRON}"`));
  assert.ok(config.includes(`"${HYPERKNOW_IMAGE_CLEANUP_CRON}"`));
  assert.deepEqual(scheduledPurgePlan(HYPERKNOW_IMAGE_CLEANUP_CRON), { retention: false, hyperknowImages: true });
  assert.deepEqual(scheduledPurgePlan(RETENTION_PURGE_CRON), { retention: true, hyperknowImages: true });
  assert.deepEqual(scheduledPurgePlan("unexpected cron"), { retention: false, hyperknowImages: false });
});

// ---- OIDC discovery(轻量模块,worker 不再加载完整 provider)----

test("oidc-discovery: 字段集与 endpoint 逐字固定,issuer 随 origin 注入", () => {
  const doc = oidcDiscoveryDocument("https://aetherstudio.top");
  assert.deepEqual(doc, {
    issuer: "https://aetherstudio.top",
    authorization_endpoint: "https://aetherstudio.top/oauth/authorize",
    token_endpoint: "https://aetherstudio.top/api/oauth/token",
    userinfo_endpoint: "https://aetherstudio.top/api/oauth/userinfo",
    jwks_uri: "https://aetherstudio.top/api/oauth/jwks",
    revocation_endpoint: "https://aetherstudio.top/api/oauth/revoke",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    subject_types_supported: ["pairwise"],
    id_token_signing_alg_values_supported: ["ES256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["openid", "profile", "email", "fruit:balance", "fruit:pay", "fruit:refund"],
    claims_supported: ["sub", "name", "email", "email_verified"],
  });
  const staging = oidcDiscoveryDocument("https://zaochang-staging.example.workers.dev");
  assert.equal(staging.issuer, "https://zaochang-staging.example.workers.dev");
  assert.ok(!JSON.stringify(staging).includes("aetherstudio.top"));
});

// ---- doc-data-cache(生产 isolate 级文档缓存的纯核心)----

test("doc-data-cache: miss→set→TTL 内 hit,过期后 miss", () => {
  const cache = createDocDataCache(60_000);
  assert.equal(cache.getMetas(1_000), null);
  cache.setMetas([{ id: "a" }], cache.generation(), 1_000);
  assert.deepEqual(cache.getMetas(1_001), [{ id: "a" }]);
  assert.deepEqual(cache.getMetas(60_999), [{ id: "a" }]);
  assert.equal(cache.getMetas(61_000), null, "TTL 边界(含)即过期");
  assert.equal(cache.getBody("doc:1", 1_000), null);
  cache.setBody("doc:1", "正文", cache.generation(), 2_000);
  assert.equal(cache.getBody("doc:1", 2_001), "正文");
  assert.equal(cache.getBody("doc:2", 2_001), null, "正文按 id 隔离");
});

test("doc-data-cache: invalidate 同时清空元数据与正文", () => {
  const cache = createDocDataCache(60_000);
  cache.setMetas([{ id: "a" }], cache.generation(), 1_000);
  cache.setBody("doc:1", "正文", cache.generation(), 1_000);
  cache.invalidate();
  assert.equal(cache.getMetas(1_001), null);
  assert.equal(cache.getBody("doc:1", 1_001), null);
});

test("doc-data-cache: 失效前发起的旧查询结果不得回填(generation 竞争)", () => {
  const cache = createDocDataCache(60_000);
  // 复现生产竞争:读方记下 generation 后发起 D1 查询;查询期间写方更新并失效;
  // 旧查询返回时若仍写回,写入 isolate 会再陈旧一个完整 TTL。
  const staleGeneration = cache.generation();
  cache.invalidate();
  cache.setMetas([{ id: "old" }], staleGeneration, 5_000);
  cache.setBody("doc:1", "旧正文", staleGeneration, 5_000);
  assert.equal(cache.getMetas(5_001), null, "失效前发起的元数据查询不得回填");
  assert.equal(cache.getBody("doc:1", 5_001), null, "失效前发起的正文查询不得回填");
  // 失效后发起的新查询(新 generation)正常写回。
  cache.setMetas([{ id: "new" }], cache.generation(), 6_000);
  cache.setBody("doc:1", "新正文", cache.generation(), 6_000);
  assert.deepEqual(cache.getMetas(6_001), [{ id: "new" }]);
  assert.equal(cache.getBody("doc:1", 6_001), "新正文");
});
