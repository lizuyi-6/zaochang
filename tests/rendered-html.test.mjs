import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const port = 4179;
const baseUrl = `http://127.0.0.1:${port}`;
const runId = `${process.pid}-${Date.now()}`;
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const stateDir = join(tmpdir(), `zaochang-test-state-${runId}`);
const logPath = join(tmpdir(), `zaochang-wrangler-${runId}.log`);
let server;
let output = "";

function authHeaders(name, email) {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "oai-authenticated-user-email": email,
    "oai-authenticated-user-full-name": encodeURIComponent(name),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  };
}

before(async () => {
  const migrationCommand =
    `npx wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --file drizzle/0000_silky_karen_page.sql --persist-to ${stateDir}`;
  const migration =
    process.platform === "win32"
      ? spawnSync(process.env.ComSpec, ["/d", "/s", "/c", migrationCommand], {
          cwd: projectRoot,
          encoding: "utf8",
          windowsHide: true,
        })
      : spawnSync("npx", migrationCommand.slice(4).split(" "), {
          cwd: projectRoot,
          encoding: "utf8",
        });
  assert.equal(migration.status, 0, migration.stderr || migration.stdout);

  const executable = process.platform === "win32" ? process.env.ComSpec : "npx";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", `npx wrangler dev --config dist/server/wrangler.json --port ${port} --persist-to ${stateDir}`]
      : ["wrangler", "dev", "--config", "dist/server/wrangler.json", "--port", String(port), "--persist-to", stateDir];
  server = spawn(
    executable,
    args,
    {
      cwd: projectRoot,
      env: { ...process.env, WRANGLER_LOG_PATH: logPath },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    },
  );
  server.stdout.on("data", (chunk) => { output += chunk.toString(); });
  server.stderr.on("data", (chunk) => { output += chunk.toString(); });

  const deadline = Date.now() + 15000;
  let pageReady = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Preview server exited early:\n${output}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        pageReady = true;
        break;
      }
    } catch {
      // The process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (!pageReady) throw new Error(`Preview server did not become ready:\n${output}`);

  const databaseDeadline = Date.now() + 5000;
  const warmHeaders = authHeaders("预热用户", `warm-${runId}@example.com`);
  while (Date.now() < databaseDeadline) {
    const response = await fetch(`${baseUrl}/api/community`, { headers: warmHeaders });
    if (response.ok) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const writeDeadline = Date.now() + 5000;
  while (Date.now() < writeDeadline) {
    const response = await fetch(`${baseUrl}/api/products`, {
      method: "POST",
      headers: warmHeaders,
      body: JSON.stringify({ title: "x" }),
    });
    if (response.status === 400) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      const stable = await fetch(`${baseUrl}/api/community`, { headers: warmHeaders });
      if (stable.ok) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Community database write path did not become ready:\n${output}`);
});

after(async () => {
  if (server?.pid && process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else if (server?.pid) {
    process.kill(-server.pid, "SIGTERM");
  }
  await rm(stateDir, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 120,
  });
  await rm(logPath, { force: true, maxRetries: 4, retryDelay: 80 });
});

describe("造场社区集成流程", { concurrency: false }, () => {
test("server-renders the creator community", async () => {
  const response = await fetch(baseUrl, { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>造场 \| 创作者的试玩社区<\/title>/);
  assert.match(html, /今天，大家都在造什么/);
  assert.match(html, /发布作品/);
  assert.match(html, /果子钱包/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("renders authenticated member state from forwarded identity", async () => {
  const response = await fetch(baseUrl, {
    headers: {
      accept: "text/html",
      "oai-authenticated-user-email": "maker@example.com",
      "oai-authenticated-user-full-name": encodeURIComponent("林一"),
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
    },
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /林一/);
  assert.doesNotMatch(html, />登录<\/a>/);
});

test("rejects anonymous product publishing", async () => {
  const response = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "匿名作品" }),
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "auth_required" });
});

test("publishing persists the product and credits the creator wallet", async () => {
  const email = `creator-${runId}@example.com`;
  const headers = authHeaders("测试创作者", email);
  const title = `边界天气台 ${runId}`;
  const productPayload = JSON.stringify({
    title,
    description: "把窗外天气转换成一段可操作的声音与颜色体验。",
    category: "互动体验",
    coverTheme: "blue",
    price: 5,
  });
  const sendPublish = () => fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers,
    body: productPayload,
  });
  let publish = await sendPublish();
  let publishBody = await publish.text();
  if (publish.status === 503 && publishBody.includes("worker restarted mid-request")) {
    const probe = await fetch(`${baseUrl}/api/community`, { headers });
    assert.equal(probe.status, 200);
    const state = await probe.json();
    assert.equal(state.products.some((product) => product.title === title), false);
    assert.equal(state.wallet.balance, 120);
    publish = await sendPublish();
    publishBody = await publish.text();
  }
  assert.equal(publish.status, 201, `${publishBody}\n${output}`);
  const published = JSON.parse(publishBody);
  assert.equal(published.product.title, title);
  assert.equal(published.reward, 20);

  const community = await fetch(`${baseUrl}/api/community`, { headers });
  assert.equal(community.status, 200);
  const data = await community.json();
  assert.equal(data.wallet.balance, 140);
  assert.equal(data.products.some((product) => product.title === title), true);
});

test("wallet balance constraint rejects a tip that would make balance negative", async () => {
  const ownerEmail = `owner-${runId}@example.com`;
  const ownerHeaders = authHeaders("作品主人", ownerEmail);
  const publish = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      title: `余额守门测试 ${runId}`,
      description: "用于验证站内支持不会把任何用户的余额扣成负数。",
      category: "开发工具",
      coverTheme: "ink",
      price: 0,
    }),
  });
  assert.equal(publish.status, 201);
  const productId = (await publish.json()).product.id;
  const supporterHeaders = authHeaders("支持者", `supporter-${runId}@example.com`);

  const initial = await fetch(`${baseUrl}/api/community`, { headers: supporterHeaders });
  assert.equal(initial.status, 200);
  assert.equal((await initial.json()).wallet.balance, 120);

  for (let index = 0; index < 4; index += 1) {
    const tip = await fetch(`${baseUrl}/api/actions`, {
      method: "POST",
      headers: supporterHeaders,
      body: JSON.stringify({ action: "tip", productId, amount: 25 }),
    });
    assert.equal(tip.status, 200);
  }

  const rejected = await fetch(`${baseUrl}/api/actions`, {
    method: "POST",
    headers: supporterHeaders,
    body: JSON.stringify({ action: "tip", productId, amount: 25 }),
  });
  assert.equal(rejected.status, 409);
  assert.deepEqual(await rejected.json(), { error: "insufficient_balance" });

  const after = await fetch(`${baseUrl}/api/community`, { headers: supporterHeaders });
  assert.equal(after.status, 200);
  assert.equal((await after.json()).wallet.balance, 20);
});
});
