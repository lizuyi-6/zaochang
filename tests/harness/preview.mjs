import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before } from "node:test";
import { fileURLToPath } from "node:url";

export const port = 4179;
export const baseUrl = `http://127.0.0.1:${port}`;
export const runId = `${process.pid}-${Date.now()}`;
export const adminEmail = `release-admin-${runId}@example.com`;
export const operationsAdminEmail = `operations-admin-${runId}@example.com`;
export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
export const stateDir = join(tmpdir(), `zaochang-test-state-${runId}`);
export const logPath = join(tmpdir(), `zaochang-wrangler-${runId}.log`);
export let server;
export let scannerServer;
export let scannerPort;
export let output = "";
export const scannerToken = `test-upload-scanner-${runId}-token`;

// 假 OpenAI 兼容上游(仿 startFakeUploadScanner 模式):校验 Bearer,把收到的
// chat/completions 请求体存入 lastChatCompletion / aiUpstreamCount 供字段级断言;
// body 含 AI-UPSTREAM-FAIL-TEST → 500(测 pre-stream 失败映射);
// 否则回确定性 SSE:4 个 delta + [DONE],首帧 JSON 内塞 echo 字段证解析器容忍未知字段。
export let aiServer;
export let aiPort;
export let lastChatCompletion = null;
export let aiUpstreamCount = 0;
export let lastTtsRequest = null;
export let ttsUpstreamCount = 0;

export function resetAiUpstream() {
  lastChatCompletion = null;
  aiUpstreamCount = 0;
  lastTtsRequest = null;
  ttsUpstreamCount = 0;
}

export async function startFakeAiUpstream() {
  const sseChunks = ["这是", "假定的", "模型增量", "输出。"];
  // content 可能是 string(纯文本)或数组(多模态);抽出文本部分供 fail 标记与既有断言,
  // 原始 content 另存 userContent 供多模态形态断言。
  const userText = (content) => {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.filter((block) => block && block.type === "text").map((block) => String(block.text ?? "")).join("\n");
    }
    return "";
  };
  aiServer = createServer(async (request, response) => {
    // 三种传输:/v1/chat/completions(OpenAI 风格)、/v1/messages(Anthropic 风格,
    // 专家模型与 Hyperknow Agent 共用)、/v1/audio/speech(Hyperknow TTS)。
    const isMessages = request.url === "/v1/messages";
    const isTts = request.url === "/v1/audio/speech";
    if (request.method !== "POST" || (!isMessages && !isTts && request.url !== "/v1/chat/completions")) {
      response.writeHead(404).end();
      return;
    }
    if (request.headers.authorization !== "Bearer test-ai-key") {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (isTts) {
      // 假 StepFun TTS:记录请求体供字段级断言(model/input/voice/speed),
      // 回确定性"音频"字节(内容里带 voice 标记,可证缓存 key 隔离)。
      lastTtsRequest = body;
      ttsUpstreamCount += 1;
      response.writeHead(200, { "content-type": "audio/mpeg" });
      response.end(Buffer.from(`fake-mp3-for-${body.voice}-${Buffer.byteLength(String(body.input ?? ""))}b`));
      return;
    }
    const rawContent = isMessages ? body.messages?.[0]?.content : body.messages?.[1]?.content;
    lastChatCompletion = {
      model: body.model,
      max_tokens: body.max_tokens,
      temperature: body.temperature,
      stream: body.stream,
      system: isMessages ? (body.system ?? "") : (body.messages?.[0]?.content ?? ""),
      user: userText(rawContent),
      userContent: rawContent ?? "",
      messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
      transport: isMessages ? "messages" : "chat",
    };
    aiUpstreamCount += 1;
    if ((lastChatCompletion.user ?? "").includes("AI-UPSTREAM-FAIL-TEST")) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "boom" }));
      return;
    }
    response.writeHead(200, { "content-type": "text/event-stream" });
    if (isMessages) {
      // Anthropic Messages 流:先 thinking 块再 text 块。thinking_delta 里故意夹带与正文
      // 相同的文字——若解析器把思维链当正文,客户端拼接会翻倍、断言即失败(可证伪)。
      response.write(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg_fake", model: body.model } })}\n\n`);
      response.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } })}\n\n`);
      for (const piece of sseChunks) {
        response.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: piece } })}\n\n`);
      }
      response.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 1, content_block: { type: "text", text: "" } })}\n\n`);
      for (const piece of sseChunks) {
        response.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: piece } })}\n\n`);
      }
      response.write(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
      response.end();
      return;
    }
    for (let i = 0; i < sseChunks.length; i += 1) {
      // 首帧夹带未知字段 echo:证明服务端/客户端解析器只取 delta.content、忽略其余。
      const payload = i === 0 ? { t: sseChunks[i], echo: lastChatCompletion } : { t: sseChunks[i] };
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: sseChunks[i] } }], echoPayload: payload })}\n\n`);
    }
    response.end("data: [DONE]\n\n");
  });
  await new Promise((resolve, reject) => {
    aiServer.once("error", reject);
    aiServer.listen(0, "127.0.0.1", resolve);
  });
  aiPort = aiServer.address().port;
}

// 假 CF Email Service 上游(仿 startFakeAiUpstream 模式):校验 Bearer,记录每次
// send 调用的完整 body 到 sentEmails 供字段级断言;收件人含 fail-email-test(路由
// 会把邮箱统一转小写,标记用小写)→ 500(测发送失败时验证码行必须删除、邀请码
// 不得被幻影消耗)。测试永不触达真实外发。
export let emailServer;
export let emailPort;
export let sentEmails = [];

export async function startFakeEmailUpstream() {
  emailServer = createServer(async (request, response) => {
    const match = request.url?.match(/^\/accounts\/([^/]+)\/email\/sending\/send$/);
    if (request.method !== "POST" || !match) {
      response.writeHead(404).end();
      return;
    }
    if (request.headers.authorization !== "Bearer test-email-key") {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    sentEmails.push({ account: decodeURIComponent(match[1]), ...body });
    if (String(body.to?.[0] ?? "").includes("fail-email-test")) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "boom" }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ success: true, result: { message_id: `<fake-${sentEmails.length}@test>` } }));
  });
  await new Promise((resolve, reject) => {
    emailServer.once("error", reject);
    emailServer.listen(0, "127.0.0.1", resolve);
  });
  emailPort = emailServer.address().port;
}

// 从发往指定邮箱的最近一封邮件正文提取六位验证码。
export function latestEmailCode(email) {
  const sent = sentEmails.filter((entry) => entry.to?.[0] === email).at(-1);
  return sent?.text?.match(/(\d{6})/)?.[1] ?? null;
}

export const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

export async function startFakeUploadScanner() {
  scannerServer = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/scan") {
      response.writeHead(404).end();
      return;
    }
    if (request.headers.authorization !== `Bearer ${scannerToken}`) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    const sha256 = createHash("sha256").update(body).digest("hex");
    if (request.headers["x-content-sha256"] !== sha256) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "sha256_mismatch" }));
      return;
    }
    if (body.includes(Buffer.from("SCANNER-UNAVAILABLE-TEST"))) {
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "scanner_unavailable" }));
      return;
    }
    const infected = body.includes(Buffer.from("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      engine: "integration-scanner/1",
      sha256,
      signature: infected ? "Eicar-Test-Signature" : null,
      verdict: infected ? "infected" : "clean",
    }));
  });
  await new Promise((resolve, reject) => {
    scannerServer.once("error", reject);
    scannerServer.listen(0, "127.0.0.1", resolve);
  });
  scannerPort = scannerServer.address().port;
}

export function authHeaders(name, email) {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "oai-authenticated-user-email": email,
    "oai-authenticated-user-full-name": encodeURIComponent(name),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  };
}

// 身份头但不带 content-type:用于 multipart/form-data 上传(fetch 需自行生成带 boundary 的 content-type)。
export function identityHeaders(name, email) {
  return {
    "oai-authenticated-user-email": email,
    "oai-authenticated-user-full-name": encodeURIComponent(name),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  };
}

export async function executeD1Sql(sql, expectSuccess = true) {
  const sqlPath = join(tmpdir(), `zaochang-test-sql-${crypto.randomUUID()}.sql`);
  const normalizedSql = sql.trim();
  writeFileSync(sqlPath, `${normalizedSql}${normalizedSql.endsWith(";") ? "" : ";"}\n`, "utf8");
  const result = spawnSync(process.execPath, [
    join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js"),
    "d1", "execute", "site-creator-d1", "--local",
    "--config", "dist/server/wrangler.json", "--file", sqlPath,
    "--persist-to", stateDir,
  ], { cwd: projectRoot, encoding: "utf8", windowsHide: true });
  await rm(sqlPath, { force: true });
  if (expectSuccess) assert.equal(result.status, 0, result.stderr || result.stdout);
  else assert.notEqual(result.status, 0, "expected local D1 command to fail");
  return `${result.stdout}\n${result.stderr}`;
}

export function previewServerArgs() {
  return [
    join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js"),
    "dev",
    "--config", "dist/server/wrangler.json",
    "--port", String(port),
    "--persist-to", stateDir,
    "--var", "APP_ENV:test",
    "--var", "LOCAL_DEV_LOGIN:1",
    "--var", `ZAOCHANG_ADMIN_EMAILS:${adminEmail},${operationsAdminEmail}`,
    "--var", `ZAOCHANG_FOUNDER_EMAIL:${adminEmail}`,
    "--var", `UPLOAD_SCANNER_URL:http://127.0.0.1:${scannerPort}/scan`,
    "--var", `UPLOAD_SCANNER_TOKEN:${scannerToken}`,
    "--var", "ZAOCHANG_AGENT_TOKEN:test-agent-key",
    "--var", `AI_CHAT_BASE_URL:http://127.0.0.1:${aiPort}/v1`,
    "--var", "AI_CHAT_API_KEY:test-ai-key",
    "--var", "AI_CHAT_MODEL:test-model-1",
    "--var", "AI_CHAT_MODEL_EXPERT:test-model-expert",
    "--var", "AI_CHAT_EXPERT_TRANSPORT:messages",
    "--var", "AI_CHAT_VISION:1",
    "--var", `HYPERKNOW_TTS_BASE_URL:http://127.0.0.1:${aiPort}/v1`,
    "--var", `EMAIL_SEND_BASE_URL:http://127.0.0.1:${emailPort}`,
    "--var", "EMAIL_SEND_ACCOUNT_ID:test-email-account",
    "--var", "EMAIL_SEND_API_TOKEN:test-email-key",
  ];
}

function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

export async function stopPreviewServer() {
  const currentServer = server;
  if (!currentServer || currentServer.exitCode !== null) {
    server = undefined;
    return;
  }

  let stopped = false;
  if (process.platform === "win32") {
    const forced = spawnSync("taskkill", ["/pid", String(currentServer.pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 10000,
    });
    assert.notEqual(forced.error?.code, "ETIMEDOUT", `taskkill timed out for preview server ${currentServer.pid}`);
    assert.equal(forced.status, 0, forced.stderr || forced.stdout);
    stopped = await waitForChildExit(currentServer, 2000);
  } else {
    process.kill(-currentServer.pid, "SIGTERM");
    stopped = await waitForChildExit(currentServer, 5000);
    if (!stopped) {
      process.kill(-currentServer.pid, "SIGKILL");
      stopped = await waitForChildExit(currentServer, 2000);
    }
  }
  assert.equal(stopped, true, `preview server ${currentServer.pid} did not exit`);

  const closeDeadline = Date.now() + 5000;
  let portClosed = false;
  while (Date.now() < closeDeadline) {
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(300) });
      await response.body?.cancel();
    } catch {
      portClosed = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(portClosed, true, `preview port ${port} remained reachable after stopping process ${currentServer.pid}`);
  server = undefined;
}

export async function startPreviewServer({ warmDatabase = false } = {}) {
  assert.equal(server === undefined || server.exitCode !== null, true, "preview server is already running");
  const outputOffset = output.length;
  const nextServer = spawn(process.execPath, previewServerArgs(), {
    cwd: projectRoot,
    env: { ...process.env, WRANGLER_LOG_PATH: logPath },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  server = nextServer;
  nextServer.stdout.on("data", (chunk) => { output += chunk.toString(); });
  nextServer.stderr.on("data", (chunk) => { output += chunk.toString(); });

  const deadline = Date.now() + 30000;
  let consecutiveHealthyReads = 0;
  let healthReads = 0;
  while (Date.now() < deadline) {
    healthReads += 1;
    if (nextServer.exitCode !== null) {
      throw new Error(`Preview server exited early:\n${output.slice(outputOffset)}`);
    }
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1500) });
      const responseOk = response.ok;
      await response.body?.cancel();
      consecutiveHealthyReads = responseOk ? consecutiveHealthyReads + 1 : 0;
      if (consecutiveHealthyReads >= 3) break;
    } catch {
      consecutiveHealthyReads = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  assert.equal(
    consecutiveHealthyReads >= 3,
    true,
    `preview server did not become stable: reads=${healthReads}\n${output.slice(outputOffset)}`,
  );

  if (!warmDatabase) return;
  const warmHeaders = authHeaders("预热用户", `warm-${runId}@example.com`);
  const databaseDeadline = Date.now() + 5000;
  let databaseReady = false;
  while (Date.now() < databaseDeadline) {
    const response = await fetch(`${baseUrl}/api/community`, { headers: warmHeaders });
    databaseReady = response.ok;
    await response.body?.cancel();
    if (databaseReady) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.equal(databaseReady, true, `Community database read path did not become ready:\n${output.slice(outputOffset)}`);

  const writeDeadline = Date.now() + 5000;
  while (Date.now() < writeDeadline) {
    const response = await fetch(`${baseUrl}/api/products`, {
      method: "POST",
      headers: warmHeaders,
      body: JSON.stringify({ title: "x" }),
    });
    if (response.status === 400) {
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 700));
      const stable = await fetch(`${baseUrl}/api/community`, { headers: warmHeaders });
      const stableOk = stable.ok;
      await stable.body?.cancel();
      if (stableOk) return;
    } else {
      await response.body?.cancel();
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Community database write path did not become ready:\n${output.slice(outputOffset)}`);
}

export async function fetchIdempotentWithRetry(input, init = {}, { deadlineMs = 12000, attemptTimeoutMs = 1500 } = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  assert.equal(["GET", "HEAD"].includes(method), true, "retry helper only supports idempotent GET or HEAD requests");
  assert.equal(init.body, undefined, "retry helper must not replay a request body");

  const deadline = Date.now() + deadlineMs;
  let attempts = 0;
  let lastFailure;
  while (Date.now() < deadline) {
    attempts += 1;
    try {
      const response = await fetch(input, {
        ...init,
        method,
        signal: AbortSignal.timeout(Math.min(attemptTimeoutMs, Math.max(1, deadline - Date.now()))),
      });
      if (response.status !== 502 && response.status !== 503) return response;
      lastFailure = new Error(`idempotent read returned transient status ${response.status}`);
      await response.body?.cancel();
    } catch (error) {
      lastFailure = error;
    }
    if (Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`idempotent read did not recover after ${attempts} attempts`, { cause: lastFailure });
}

export async function executeLocalD1(sql, expectSuccess = true) {
  const databaseDirectory = join(stateDir, "v3", "d1", "miniflare-D1DatabaseObject");
  const databaseFiles = readdirSync(databaseDirectory)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite");
  assert.equal(databaseFiles.length, 1, `expected one local D1 database, found ${databaseFiles.join(", ")}`);
  const localDatabase = new DatabaseSync(join(databaseDirectory, databaseFiles[0]));
  let sqlError;
  try {
    localDatabase.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    localDatabase.exec("BEGIN IMMEDIATE;");
    try {
      localDatabase.exec(sql.trim());
      localDatabase.exec("COMMIT;");
    } catch (error) {
      sqlError = error;
      try {
        localDatabase.exec("ROLLBACK;");
      } catch {
        // Preserve the original SQL failure as the assertion subject.
      }
    }
  } catch (error) {
    sqlError ??= error;
  } finally {
    localDatabase.close();
  }
  if (expectSuccess) {
    if (sqlError) throw sqlError;
    return "";
  }
  assert.notEqual(sqlError, undefined, "expected local D1 SQL to fail");
  return sqlError instanceof Error ? `${sqlError.name}: ${sqlError.message}\n${sqlError.stack ?? ""}` : String(sqlError);
}

// 只读取值用的单行查询(executeLocalD1 用 exec,不返回行)。
export async function queryLocalD1(sql) {
  const databaseDirectory = join(stateDir, "v3", "d1", "miniflare-D1DatabaseObject");
  const databaseFiles = readdirSync(databaseDirectory)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite");
  assert.equal(databaseFiles.length, 1, `expected one local D1 database, found ${databaseFiles.join(", ")}`);
  const localDatabase = new DatabaseSync(join(databaseDirectory, databaseFiles[0]));
  try {
    localDatabase.exec("PRAGMA busy_timeout = 5000;");
    return localDatabase.prepare(sql.trim()).all();
  } finally {
    localDatabase.close();
  }
}

export async function creditTestFruit(email, amount = 20, label = crypto.randomUUID()) {
  assert.match(email, /^[a-z0-9@._+-]+$/i);
  assert.equal(Number.isInteger(amount) && amount > 0, true);
  assert.match(label, /^[a-z0-9_-]+$/i);
  const operationId = `test-credit:${runId}:${label}`;
  await executeLocalD1(`
    INSERT INTO fruit_operations
      (id, kind, idempotency_key, target_email, amount, reference_type, reference_id, description)
    VALUES ('${operationId}', 'test_credit', '${operationId}', '${email}', ${amount}, 'test_fixture', '${label}', 'integration test ledger credit');
    UPDATE wallets
      SET balance = balance + ${amount}, lifetime_earned = lifetime_earned + ${amount}, updated_at = CURRENT_TIMESTAMP
      WHERE user_email = '${email}';
    INSERT INTO fruit_entries (operation_id, user_email, bucket, delta)
      VALUES ('${operationId}', '${email}', 'available', ${amount})
  `);
  return operationId;
}

export async function reviewProduct(productId, decision = "approve_product", note = "平台预审确认产品说明与体验入口符合发布要求。") {
  assert.equal(Number.isInteger(productId), true);
  let response;
  let responseText = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(`${baseUrl}/api/admin/moderation`, {
      method: "PATCH",
      headers: authHeaders("发布审核管理员", adminEmail),
      body: JSON.stringify({ action: decision, targetRef: String(productId), note }),
    });
    responseText = await response.text();
    if (response.status !== 503 || !responseText.includes("worker restarted mid-request")) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(response.status, 200, responseText);
  const body = JSON.parse(responseText);
  assert.equal(body.productId, productId);
  assert.equal(body.reviewStatus, decision === "approve_product" ? "approved" : "rejected");
  return body;
}

before(async () => {
  await startFakeUploadScanner();
  await startFakeAiUpstream();
  await startFakeEmailUpstream();
  const migrationFiles = ["0000_silky_karen_page.sql", "0001_oauth_accounts.sql", "0002_community_interactions.sql", "0003_strange_sandman.sql", "0004_lush_gambit.sql", "0005_flimsy_magus.sql", "0006_release_readiness.sql", "0007_product_like_counters.sql", "0008_noisy_jazinda.sql", "0009_moderation_remediation.sql", "0010_invite_upload_security.sql", "0011_redundant_phalanx.sql", "0012_eminent_satana.sql", "0013_lovely_lord_hawal.sql", "0014_furry_vapor.sql", "0015_complex_eddie_brock.sql", "0016_wise_synch.sql", "0017_workable_wraith.sql", "0018_stale_speed_demon.sql", "0019_community_counter_triggers.sql", "0020_exotic_the_renegades.sql"];
  const bootstrapSql = migrationFiles
    .slice(0, 8)
    .map((migrationFile) => readFileSync(join(projectRoot, "drizzle", migrationFile), "utf8"))
    .join("\n");
  await executeD1Sql(bootstrapSql);

  for (const migrationFile of migrationFiles.slice(8)) {
    if (migrationFile === "0008_noisy_jazinda.sql") {
      await executeLocalD1(`
        INSERT INTO members (email, display_name) VALUES ('legacy-review-migration@example.com', '迁移前作者');
        INSERT INTO members (email, display_name, joined_at)
          VALUES ('legacy-review-buyer@example.com', '迁移前买家', datetime('now', '-48 hours'));
        INSERT INTO wallets (user_email, balance, lifetime_earned, lifetime_spent) VALUES ('legacy-review-migration@example.com', 0, 0, 0);
        INSERT INTO wallets (user_email, balance, lifetime_earned, lifetime_spent) VALUES ('legacy-review-buyer@example.com', 0, 0, 0);
        INSERT INTO products (owner_email, owner_name, title, description, category)
          VALUES ('legacy-review-migration@example.com', '迁移前作者', '迁移前公开产品', '用于验证历史产品升级后必须重新进入平台预审。', '开发工具');
        INSERT INTO fruit_operations
          (id, kind, idempotency_key, actor_email, target_email, amount, reference_type, reference_id, description)
          SELECT 'legacy-review-purchase', 'purchase', 'legacy-review-purchase',
                 'legacy-review-buyer@example.com', owner_email, 1, 'product', CAST(id AS TEXT), '迁移前订单'
          FROM products WHERE owner_email = 'legacy-review-migration@example.com';
        INSERT INTO product_orders
          (id, buyer_email, product_id, seller_email, pricing_model, amount,
           idempotency_key, purchase_operation_id, available_at)
          SELECT 'legacy-review-order', 'legacy-review-buyer@example.com', id, owner_email,
                 'one_time', 1, 'legacy-review-order', 'legacy-review-purchase', datetime('now', '+24 hours')
          FROM products WHERE owner_email = 'legacy-review-migration@example.com';
        INSERT INTO product_likes (product_id, user_email)
          SELECT id, 'legacy-review-buyer@example.com'
          FROM products WHERE owner_email = 'legacy-review-migration@example.com'
      `);
    }
    await executeLocalD1(readFileSync(join(projectRoot, "drizzle", migrationFile), "utf8"));
    if (migrationFile === "0008_noisy_jazinda.sql") {
      const bypassFailure = await executeLocalD1(
        `UPDATE products
         SET status = 'published', review_status = 'approved', approved_version = review_version,
             reviewed_by = owner_email, reviewed_at = CURRENT_TIMESTAMP, review_note = '绕过审核决定'
         WHERE owner_email = 'legacy-review-migration@example.com'`,
        false,
      );
      assert.match(bypassFailure, /product_review_state_invalid/);
      await executeLocalD1(`
        CREATE TABLE migration_review_assertion (id integer);
        CREATE TRIGGER migration_review_assertion_guard BEFORE INSERT ON migration_review_assertion
        WHEN NOT EXISTS (
          SELECT 1 FROM products
          WHERE owner_email = 'legacy-review-migration@example.com'
            AND status = 'pending_review' AND review_status = 'pending_review'
            AND review_version = 1 AND approved_version = 0
            AND EXISTS (SELECT 1 FROM product_orders WHERE id = 'legacy-review-order' AND product_id = products.id)
            AND EXISTS (SELECT 1 FROM product_likes WHERE product_id = products.id AND user_email = 'legacy-review-buyer@example.com')
        ) BEGIN SELECT RAISE(ABORT, 'legacy_product_not_pending_review'); END;
        INSERT INTO migration_review_assertion (id) VALUES (1);
        DROP TRIGGER migration_review_assertion_guard;
        DROP TABLE migration_review_assertion;
        INSERT INTO product_review_decisions (id, product_id, review_version, reviewer_email, decision, note)
          SELECT 'legacy-review-decision', id, review_version, owner_email, 'approved', '迁移测试批准当前版本。'
          FROM products WHERE owner_email = 'legacy-review-migration@example.com'
      `);
      const mutableDecision = await executeLocalD1(`
        UPDATE product_review_decisions SET note = '篡改审核意见' WHERE id = 'legacy-review-decision'
      `, false);
      assert.match(mutableDecision, /product_review_decision_immutable/);
      const deletableDecision = await executeLocalD1(`
        DELETE FROM product_review_decisions WHERE id = 'legacy-review-decision'
      `, false);
      assert.match(deletableDecision, /product_review_decision_immutable/);
      await executeLocalD1(`
        UPDATE products SET price = 1 WHERE owner_email = 'legacy-review-migration@example.com';
        CREATE TABLE material_review_assertion (id integer);
        CREATE TRIGGER material_review_assertion_guard BEFORE INSERT ON material_review_assertion
        WHEN NOT EXISTS (
          SELECT 1 FROM products
          WHERE owner_email = 'legacy-review-migration@example.com'
            AND status = 'pending_review' AND review_status = 'pending_review'
            AND review_version = 2 AND approved_version = 1
        ) BEGIN SELECT RAISE(ABORT, 'material_change_did_not_require_review'); END;
        INSERT INTO material_review_assertion (id) VALUES (1);
        DROP TRIGGER material_review_assertion_guard;
        DROP TABLE material_review_assertion
      `);
      const guardedOrder = await executeLocalD1(`
        INSERT INTO product_orders
          (id, buyer_email, product_id, seller_email, pricing_model, amount,
           idempotency_key, purchase_operation_id, available_at)
          SELECT 'review-guard-order', 'legacy-review-buyer@example.com', id, owner_email,
                 pricing_model, price, 'review-guard-order', 'legacy-review-purchase', datetime('now', '+24 hours')
          FROM products WHERE owner_email = 'legacy-review-migration@example.com'
      `, false);
      assert.match(guardedOrder, /product_order_product_not_approved/);
      const guardedLike = await executeLocalD1(`
        INSERT INTO product_likes (product_id, user_email)
          SELECT id, owner_email FROM products WHERE owner_email = 'legacy-review-migration@example.com'
      `, false);
      assert.match(guardedLike, /product_like_product_not_approved/);
      const guardedComment = await executeLocalD1(`
        INSERT INTO comments (user_email, owner_name, target_type, target_ref, content)
          SELECT owner_email, owner_name, 'product', CAST(id AS TEXT), '待审产品评论'
          FROM products WHERE owner_email = 'legacy-review-migration@example.com'
      `, false);
      assert.match(guardedComment, /product_comment_product_not_approved/);
      const guardedTip = await executeLocalD1(`
        INSERT INTO fruit_operations
          (id, kind, idempotency_key, actor_email, target_email, amount, reference_type, reference_id, description)
          SELECT 'review-guard-tip', 'tip', 'review-guard-tip', 'legacy-review-buyer@example.com',
                 owner_email, 5, 'product', CAST(id AS TEXT), '待审产品打赏'
          FROM products WHERE owner_email = 'legacy-review-migration@example.com'
      `, false);
      assert.match(guardedTip, /product_tip_product_not_approved/);
      await executeLocalD1(`
        INSERT INTO product_review_decisions (id, product_id, review_version, reviewer_email, decision, note)
          SELECT 'legacy-review-decision-v2', id, review_version,
                 'legacy-review-migration@example.com', 'approved', '迁移测试批准第二版本。'
          FROM products WHERE owner_email = 'legacy-review-migration@example.com';
        UPDATE products
          SET owner_email = 'legacy-review-buyer@example.com', owner_name = '迁移前买家'
          WHERE owner_email = 'legacy-review-migration@example.com';
        CREATE TABLE owner_review_assertion (id integer);
        CREATE TRIGGER owner_review_assertion_guard BEFORE INSERT ON owner_review_assertion
        WHEN NOT EXISTS (
          SELECT 1 FROM products
          WHERE title = '迁移前公开产品'
            AND owner_email = 'legacy-review-buyer@example.com'
            AND status = 'pending_review' AND review_status = 'pending_review'
            AND review_version = 3 AND approved_version = 2
        ) BEGIN SELECT RAISE(ABORT, 'owner_change_did_not_require_review'); END;
        INSERT INTO owner_review_assertion (id) VALUES (1);
        DROP TRIGGER owner_review_assertion_guard;
        DROP TABLE owner_review_assertion;
        DELETE FROM product_likes WHERE user_email = 'legacy-review-buyer@example.com';
        DELETE FROM product_orders WHERE id = 'legacy-review-order';
        DROP TRIGGER product_review_decisions_no_delete;
        DELETE FROM product_review_decisions
          WHERE product_id = (SELECT id FROM products WHERE title = '迁移前公开产品');
        CREATE TRIGGER product_review_decisions_no_delete
          BEFORE DELETE ON product_review_decisions
          BEGIN SELECT RAISE(ABORT, 'product_review_decision_immutable'); END;
        DELETE FROM products WHERE title = '迁移前公开产品';
        DROP TRIGGER fruit_operations_no_delete;
        DELETE FROM fruit_operations WHERE id = 'legacy-review-purchase';
        CREATE TRIGGER fruit_operations_no_delete
          BEFORE DELETE ON fruit_operations
          BEGIN SELECT RAISE(ABORT, 'fruit_operations_immutable'); END;
        DELETE FROM wallets WHERE user_email = 'legacy-review-buyer@example.com';
        DELETE FROM wallets WHERE user_email = 'legacy-review-migration@example.com';
        DELETE FROM members WHERE email = 'legacy-review-buyer@example.com';
        DELETE FROM members WHERE email = 'legacy-review-migration@example.com'
      `);
    }
  }

  await startPreviewServer({ warmDatabase: true });
});

after(async () => {
  await stopPreviewServer();
  await rm(stateDir, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 120,
  });
  await rm(logPath, { force: true, maxRetries: 4, retryDelay: 80 });
  if (scannerServer?.listening) {
    await new Promise((resolve, reject) => scannerServer.close((error) => error ? reject(error) : resolve()));
  }
  if (aiServer?.listening) {
    await new Promise((resolve, reject) => aiServer.close((error) => error ? reject(error) : resolve()));
  }
  if (emailServer?.listening) {
    await new Promise((resolve, reject) => emailServer.close((error) => error ? reject(error) : resolve()));
  }
});

// 最小 SSE 帧解析(原 describe 体内共享助手):把 Response 读成 {text, done}。
export async function readSse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let done = null;
  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });
    let frameEnd = buffer.indexOf("\n\n");
    while (frameEnd >= 0) {
      const frame = buffer.slice(0, frameEnd);
      buffer = buffer.slice(frameEnd + 2);
      frameEnd = buffer.indexOf("\n\n");
      const eventLine = frame.split("\n").find((line) => line.startsWith("event:"));
      const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
      if (!eventLine || !dataLine) continue;
      const event = eventLine.slice(6).trim();
      const data = JSON.parse(dataLine.slice(5).trim());
      if (event === "delta") text += data.t;
      else if (event === "done") done = data;
    }
  }
  return { text, done };
}
