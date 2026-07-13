import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createLocalJWKSet, jwtVerify } from "jose";
import { GALAXIES, PLANETS, PLANETS_BY_GALAXY } from "../app/galaxy/cosmic-atlas.ts";
import { GALAXY_BUSINESS, GALAXY_PRODUCTS, PRODUCT_BY_PLANET } from "../app/galaxy/product-galaxy.ts";

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

async function executeLocalD1(sql, expectSuccess = true) {
  const sqlPath = join(tmpdir(), `zaochang-test-sql-${crypto.randomUUID()}.sql`);
  writeFileSync(sqlPath, `${sql};\n`, "utf8");
  const result = spawnSync(process.execPath, [
    join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js"),
    "d1", "execute", "site-creator-d1", "--local",
    "--config", "dist/server/wrangler.json", "--file", sqlPath,
    "--persist-to", stateDir,
  ], { cwd: projectRoot, encoding: "utf8", windowsHide: true });
  await rm(sqlPath, { force: true });
  if (expectSuccess) assert.equal(result.status, 0, result.stderr || result.stdout);
  else assert.notEqual(result.status, 0, "expected local D1 command to fail");
  const deadline = Date.now() + 8000;
  let healthy = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) { healthy = true; break; }
    } catch {
      // Wrangler reloads after external local D1 maintenance.
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  assert.equal(healthy, true, "preview server did not recover after local D1 maintenance");
  return `${result.stdout}\n${result.stderr}`;
}

before(async () => {
  for (const migrationFile of ["0000_silky_karen_page.sql", "0001_oauth_accounts.sql", "0002_community_interactions.sql", "0003_strange_sandman.sql", "0004_lush_gambit.sql", "0005_flimsy_magus.sql"]) {
    const migrationCommand =
      `npx wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --file drizzle/${migrationFile} --persist-to ${stateDir}`;
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
    assert.equal(migration.status, 0, `${migrationFile}\n${migration.stderr || migration.stdout}`);
  }

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
  assert.match(html, /今天，大家/);
  assert.match(html, /都在造什么/);
  assert.match(html, /发布作品/);
  assert.match(html, /果子钱包/);
  assert.match(html, /href="\/galaxy"/);
  assert.match(html, /产品银河/);
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

for (const [pathname, marker] of [
  ["/discover", "从一个能玩的版本开始"],
  ["/feed", "作品之外，正在发生"],
  ["/studio", "你的作品，正在怎样生长"],
  ["/studio/new", "发布一件新作品"],
  ["/wallet", "果子只从真实贡献中生长"],
  ["/circles", "围绕做东西，形成关系"],
  ["/challenges", "给创作一个共同起点"],
  ["/collections", "想再回来玩的作品"],
  ["/profile", "登录后查看你的创作者主页"],
  ["/notifications", "与你有关的信号"],
  ["/guide", "让作品被认真对待"],
  ["/product/mori", "MORI 专注森林"],
  ["/galaxy", "探索造场产品宇宙"],
  ["/galaxy/products", "用真实业务分类和明确状态快速找到产品"],
  ["/galaxy/apply", "发射产品信号"],
  ["/galaxy/incubator", "阶段轨道"],
  ["/signin", "进入造场"],
]) {
  test(`renders distinct route ${pathname}`, async () => {
    const response = await fetch(`${baseUrl}${pathname}`, {
      headers: { accept: "text/html" },
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), new RegExp(marker));
  });
}

for (const slug of ["mori", "wander", "typewave", "loops", "sprout", "minute"]) {
  test(`embeds the completed ${slug} app in its existing product route`, async () => {
    const response = await fetch(`${baseUrl}/product/${slug}`, { headers: { accept: "text/html" } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, new RegExp(`data-product-app="${slug}"`));
    assert.match(html, new RegExp(`/product-apps/${slug}/index\\.html\\?embed=1(?:&amp;|&)lang=zh-CN`));
  });

  test(`serves the complete static bundle for ${slug}`, async () => {
    const entryResponse = await fetch(`${baseUrl}/product-apps/${slug}/index.html`);
    assert.equal(entryResponse.status, 200);
    const entryHtml = await entryResponse.text();
    const scriptPath = entryHtml.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
    const stylePath = entryHtml.match(/<link[^>]+href="([^"]+\.css)"/)?.[1];
    assert.equal(typeof scriptPath, "string");
    assert.equal(typeof stylePath, "string");
    const [scriptResponse, styleResponse] = await Promise.all([
      fetch(new URL(scriptPath, `${baseUrl}/product-apps/${slug}/index.html`)),
      fetch(new URL(stylePath, `${baseUrl}/product-apps/${slug}/index.html`)),
    ]);
    assert.equal(scriptResponse.status, 200);
    assert.equal(styleResponse.status, 200);
    assert.match(scriptResponse.headers.get("content-type") ?? "", /javascript/);
    assert.match(styleResponse.headers.get("content-type") ?? "", /text\/css/);
  });
}

test("keeps official identity scoped to the existing official product", async () => {
  const [officialResponse, communityResponse] = await Promise.all([
    fetch(`${baseUrl}/product/typewave`, { headers: { accept: "text/html" } }),
    fetch(`${baseUrl}/product/mori`, { headers: { accept: "text/html" } }),
  ]);
  const officialHtml = await officialResponse.text();
  const communityHtml = await communityResponse.text();
  assert.match(officialHtml, /product-apps\/typewave\/index\.html\?embed=1(?:&amp;|&)lang=zh-CN(?:&amp;|&)official=1/);
  assert.doesNotMatch(communityHtml, /product-apps\/mori\/index\.html[^"']*official=1/);
});

test("renders the signed-in profile editor", async () => {
  const response = await fetch(`${baseUrl}/profile/edit`, { headers: authHeaders("资料编辑用户", `profile-${runId}@example.com`) });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /编辑个人资料/);
  assert.match(html, /资料编辑用户/);
});

test("renders the signed-in profile from account data", async () => {
  const response = await fetch(`${baseUrl}/profile`, { headers: authHeaders("真实主页用户", `profile-page-${runId}@example.com`) });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /真实主页用户/);
  assert.match(html, /发布的作品/);
  assert.doesNotMatch(html, /登录后查看你的创作者主页/);
});

test("keeps OAuth providers explicit until runtime credentials are configured", async () => {
  const signin = await fetch(`${baseUrl}/signin?return_to=%2Fwallet`, { headers: { accept: "text/html" } });
  assert.equal(signin.status, 200);
  const html = await signin.text();
  assert.match(html, /使用 Google 登录/);
  assert.match(html, /使用 GitHub 登录/);
  assert.match(html, /待配置/);
  for (const provider of ["google", "github"]) {
    const response = await fetch(`${baseUrl}/api/auth/${provider}/start?return_to=%2Fwallet`, { redirect: "manual" });
    assert.equal(response.status, 307);
    assert.match(response.headers.get("location") ?? "", /\/signin\?error=not_configured&provider=/);
  }
});

test("keeps sign-in outside the community shell", async () => {
  const response = await fetch(`${baseUrl}/signin`, { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /class="auth-page"/);
  assert.match(html, /class="auth-brand"/);
  assert.doesNotMatch(html, /deep-topbar|deep-sidebar|deep-mobile-nav|deep-account/);
});

test("uses the galaxy palette only for official product pages", async () => {
  const [officialResponse, communityResponse] = await Promise.all([
    fetch(`${baseUrl}/product/typewave`, { headers: { accept: "text/html" } }),
    fetch(`${baseUrl}/product/mori`, { headers: { accept: "text/html" } }),
  ]);
  assert.equal(officialResponse.status, 200);
  assert.equal(communityResponse.status, 200);
  const officialHtml = await officialResponse.text();
  const communityHtml = await communityResponse.text();
  assert.match(officialHtml, /class="product-detail-page official-product-page"/);
  assert.match(officialHtml, /class="deep-shell official-product-shell"/);
  assert.match(officialHtml, /class="official-entry-transition"/);
  assert.match(officialHtml, /造场官方项目/);
  assert.match(officialHtml, /PRODUCT GALAXY \/ OFFICIAL/);
  assert.doesNotMatch(communityHtml, /official-product-page/);
  assert.doesNotMatch(communityHtml, /official-product-shell|official-entry-transition|造场官方项目|PRODUCT GALAXY \/ OFFICIAL/);
});

test("renders the singularity atlas and its original planetary archive", async () => {
  const response = await fetch(`${baseUrl}/galaxy`, {
    headers: { accept: "text/html" },
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /我们在奇点之外，为尚未诞生的世界命名/);
  assert.match(html, /BEYOND THE HORIZON/);
  assert.match(html, /所有光都曾独自出发/);
  assert.match(html, /第一位见证者没有名字/);
  assert.match(html, /源光/);
  assert.match(html, /忆潮/);
  assert.match(html, /镜梦/);
  assert.match(html, /未至/);
  assert.match(html, /12 颗可观测行星/);
});

test("cosmic atlas keeps four galaxies with three unique stories each", () => {
  assert.equal(GALAXIES.length, 4);
  assert.equal(PLANETS.length, 12);
  for (const galaxy of GALAXIES) assert.equal(PLANETS_BY_GALAXY[galaxy.id].length, 3);
  assert.equal(new Set(PLANETS.map((planet) => planet.id)).size, 12);
  assert.equal(new Set(PLANETS.map((planet) => planet.title)).size, 12);
  assert.equal(new Set(PLANETS.map((planet) => planet.archiveTitle)).size, 12);
  assert.equal(PLANETS.every((planet) => planet.archive.length === 2 && planet.archive.every((paragraph) => paragraph.length >= 45)), true);
});

test("product galaxy maps every planet to a real product and business sector", () => {
  assert.equal(Object.keys(GALAXY_BUSINESS).length, 4);
  assert.equal(GALAXY_PRODUCTS.length, 12);
  assert.equal(new Set(GALAXY_PRODUCTS.map((product) => product.name)).size, 12);
  assert.equal(GALAXY_PRODUCTS.every((product) => PRODUCT_BY_PLANET[product.planetId] === product), true);
  assert.equal(GALAXY_PRODUCTS.every((product) => product.status.length > 0 && product.capabilities.length === 3), true);
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

test("publishing persists the creator-selected pricing model without minting fruit", async () => {
  const email = `creator-${runId}@example.com`;
  const headers = authHeaders("测试创作者", email);
  const title = `边界天气台 ${runId}`;
  const productPayload = JSON.stringify({
    title,
    description: "把窗外天气转换成一段可操作的声音与颜色体验。",
    category: "互动体验",
    coverTheme: "blue",
    pricingModel: "one_time",
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
    assert.equal(state.wallet.balance, 20);
    publish = await sendPublish();
    publishBody = await publish.text();
  }
  assert.equal(publish.status, 201, `${publishBody}\n${output}`);
  const published = JSON.parse(publishBody);
  assert.equal(published.product.title, title);
  assert.equal(published.product.pricingModel, "one_time");
  assert.equal(published.product.price, 5);
  assert.equal(published.reward, 0);

  const community = await fetch(`${baseUrl}/api/community`, { headers });
  assert.equal(community.status, 200);
  const data = await community.json();
  assert.equal(data.wallet.balance, 20);
  assert.equal(data.wallet.balance, data.wallet.ledgerBalance);
  assert.equal(data.products.some((product) => product.title === title), true);
});

test("wallet balance constraint rejects a tip without changing either final balance", async () => {
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
  assert.equal((await initial.json()).wallet.balance, 20);
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = 'supporter-${runId}@example.com'`);

  for (let index = 0; index < 4; index += 1) {
    const tip = await fetch(`${baseUrl}/api/actions`, {
      method: "POST",
      headers: supporterHeaders,
      body: JSON.stringify({ action: "tip", productId, amount: 5, idempotencyKey: `tip_ok_${runId}_${index}` }),
    });
    assert.equal(tip.status, 200);
  }

  const rejected = await fetch(`${baseUrl}/api/actions`, {
    method: "POST",
    headers: supporterHeaders,
    body: JSON.stringify({ action: "tip", productId, amount: 5, idempotencyKey: `tip_reject_${runId}` }),
  });
  assert.equal(rejected.status, 409);
  assert.deepEqual(await rejected.json(), { error: "insufficient_balance" });

  const after = await fetch(`${baseUrl}/api/community`, { headers: supporterHeaders });
  assert.equal(after.status, 200);
  const afterBody = await after.json();
  assert.equal(afterBody.wallet.balance, 0);
  assert.equal(afterBody.wallet.balance, afterBody.wallet.ledgerBalance);
  const ownerAfter = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const ownerAfterBody = await ownerAfter.json();
  assert.equal(ownerAfterBody.wallet.balance, 40);
  assert.equal(ownerAfterBody.wallet.balance, ownerAfterBody.wallet.ledgerBalance);
});

test("one-time checkout is idempotent and refund restores both wallets and entitlement", async () => {
  const ownerHeaders = authHeaders("一次解锁作者", `one-time-owner-${runId}@example.com`);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `一次解锁作品 ${runId}`, description: "验证一次解锁、重复请求和退款都由同一份账本约束。", category: "互动体验", coverTheme: "coral", pricingModel: "one_time", price: 7 }),
  });
  assert.equal(created.status, 201);
  const productId = (await created.json()).product.id;
  const buyerHeaders = authHeaders("一次解锁买家", `one-time-buyer-${runId}@example.com`);

  const before = await fetch(`${baseUrl}/api/payments?productId=${productId}`, { headers: buyerHeaders });
  const beforeBody = await before.json();
  assert.equal(beforeBody.access.allowed, false);
  assert.equal(beforeBody.wallet.balance, 20);
  const blockedYoungCheckout = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey: `checkout_young_${runId}` }) });
  assert.equal(blockedYoungCheckout.status, 403);
  assert.deepEqual(await blockedYoungCheckout.json(), { error: "account_too_new_for_transfer" });
  const ownerBeforeEligible = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  assert.equal(ownerBeforeEligible.wallet.pendingBalance, 0);
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = 'one-time-buyer-${runId}@example.com'`);

  const idempotencyKey = `checkout_one_${runId}`;
  const concurrent = await Promise.all([
    fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey }) }),
    fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey }) }),
  ]);
  assert.equal(concurrent.every((response) => response.status === 200), true);
  const concurrentBodies = await Promise.all(concurrent.map((response) => response.json()));
  assert.deepEqual(concurrentBodies.map((body) => body.charged).sort(), [false, true]);
  assert.equal(new Set(concurrentBodies.map((body) => body.order.id)).size, 1);
  assert.equal(concurrentBodies.every((body) => body.wallet.balance === 13), true);
  const checkoutBody = concurrentBodies.find((body) => body.charged === true);
  assert.equal(checkoutBody.access, true);
  assert.equal(checkoutBody.wallet.balance, 13);
  assert.equal(checkoutBody.order.status, "paid");

  const replay = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey }) });
  const replayBody = await replay.json();
  assert.equal(replayBody.replayed, true);
  assert.equal(replayBody.charged, false);
  assert.equal(replayBody.wallet.balance, 13);

  const entitled = await fetch(`${baseUrl}/api/payments?productId=${productId}`, { headers: buyerHeaders });
  assert.equal((await entitled.json()).access.reason, "entitled");
  const ownerPending = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const ownerPendingBody = await ownerPending.json();
  assert.equal(ownerPendingBody.wallet.pendingBalance, 7);
  assert.equal(ownerPendingBody.wallet.pendingBalance, ownerPendingBody.wallet.ledgerPendingBalance);

  const refundKey = `refund_one_${runId}`;
  const refund = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "refund", orderId: checkoutBody.order.id, idempotencyKey: refundKey }) });
  assert.equal(refund.status, 200);
  const refundBody = await refund.json();
  assert.equal(refundBody.refunded, true);
  assert.equal(refundBody.wallet.balance, 20);

  const refundReplay = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "refund", orderId: checkoutBody.order.id, idempotencyKey: refundKey }) });
  assert.equal((await refundReplay.json()).replayed, true);
  const checkoutAfterRefund = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey }) });
  const checkoutAfterRefundBody = await checkoutAfterRefund.json();
  assert.equal(checkoutAfterRefundBody.access, false);
  assert.equal(checkoutAfterRefundBody.order.status, "refunded");
  const afterRefund = await fetch(`${baseUrl}/api/payments?productId=${productId}`, { headers: buyerHeaders });
  assert.equal((await afterRefund.json()).access.allowed, false);
  const ownerAfter = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const ownerAfterBody = await ownerAfter.json();
  assert.equal(ownerAfterBody.wallet.pendingBalance, 0);
  assert.equal(ownerAfterBody.wallet.pendingBalance, ownerAfterBody.wallet.ledgerPendingBalance);
});

test("concurrent one-time orders and refunds preserve one charge and one reversal", async () => {
  const ownerHeaders = authHeaders("并发解锁作者", `concurrent-owner-${runId}@example.com`);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `并发解锁作品 ${runId}`, description: "用不同请求号并发购买与退款，验证数据库约束只允许一组余额变动。", category: "开发工具", coverTheme: "mint", pricingModel: "one_time", price: 6 }),
  });
  const productId = (await created.json()).product.id;
  const buyerHeaders = authHeaders("并发解锁买家", `concurrent-buyer-${runId}@example.com`);
  await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = 'concurrent-buyer-${runId}@example.com'`);
  const checkoutKeys = [`checkout_race_a_${runId}`, `checkout_race_b_${runId}`];
  const checkoutResponses = await Promise.all(checkoutKeys.map((idempotencyKey) => fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: buyerHeaders,
    body: JSON.stringify({ action: "checkout", productId, idempotencyKey }),
  })));
  assert.equal(checkoutResponses.every((response) => response.status === 200), true);
  const checkoutBodies = await Promise.all(checkoutResponses.map((response) => response.json()));
  assert.deepEqual(checkoutBodies.map((body) => body.charged).sort(), [false, true]);
  assert.equal(checkoutBodies.filter((body) => body.reason === "already_owned").length, 1);
  const chargedIndex = checkoutBodies.findIndex((body) => body.charged === true);
  const chargedOrder = checkoutBodies[chargedIndex].order;
  const chargedKey = checkoutKeys[chargedIndex];

  const buyerAfterCharge = await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  const buyerAfterChargeBody = await buyerAfterCharge.json();
  assert.equal(buyerAfterChargeBody.wallet.balance, 14);
  assert.equal(buyerAfterChargeBody.wallet.balance, buyerAfterChargeBody.wallet.ledgerBalance);
  assert.equal(buyerAfterChargeBody.orders.length, 1);
  const ownerAfterCharge = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const ownerAfterChargeBody = await ownerAfterCharge.json();
  assert.equal(ownerAfterChargeBody.wallet.pendingBalance, 6);
  assert.equal(ownerAfterChargeBody.wallet.pendingBalance, ownerAfterChargeBody.wallet.ledgerPendingBalance);

  const secondProduct = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `请求号冲突作品 ${runId}`, description: "同一请求号不能被挪用到另一件作品。", category: "开发工具", coverTheme: "ink", pricingModel: "per_use", price: 1 }),
  });
  const secondProductId = (await secondProduct.json()).product.id;
  const conflict = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId: secondProductId, idempotencyKey: chargedKey }) });
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: "idempotency_conflict" });

  const refundResponses = await Promise.all(["a", "b"].map((suffix) => fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: buyerHeaders,
    body: JSON.stringify({ action: "refund", orderId: chargedOrder.id, idempotencyKey: `refund_race_${suffix}_${runId}` }),
  })));
  assert.equal(refundResponses.every((response) => response.status === 200), true);
  const refundBodies = await Promise.all(refundResponses.map((response) => response.json()));
  assert.deepEqual(refundBodies.map((body) => body.replayed).sort(), [false, true]);
  assert.equal(refundBodies.every((body) => body.wallet.balance === 20), true);

  const buyerAfterRefund = await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  const buyerAfterRefundBody = await buyerAfterRefund.json();
  assert.equal(buyerAfterRefundBody.wallet.balance, 20);
  assert.equal(buyerAfterRefundBody.wallet.balance, buyerAfterRefundBody.wallet.ledgerBalance);
  const ownerAfterRefund = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const ownerAfterRefundBody = await ownerAfterRefund.json();
  assert.equal(ownerAfterRefundBody.wallet.pendingBalance, 0);
  assert.equal(ownerAfterRefundBody.wallet.pendingBalance, ownerAfterRefundBody.wallet.ledgerPendingBalance);
});

test("per-use checkout charges each distinct entry, replays safely, and rejects refund", async () => {
  const ownerHeaders = authHeaders("按次作者", `per-use-owner-${runId}@example.com`);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `按次体验作品 ${runId}`, description: "验证每次体验分别结算，同时网络重放不会重复扣款。", category: "声音影像", coverTheme: "blue", pricingModel: "per_use", price: 4 }),
  });
  const productId = (await created.json()).product.id;
  const buyerHeaders = authHeaders("按次买家", `per-use-buyer-${runId}@example.com`);
  await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = 'per-use-buyer-${runId}@example.com'`);
  const firstKey = `checkout_use_a_${runId}`;
  const first = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey: firstKey }) });
  const firstBody = await first.json();
  assert.equal(firstBody.wallet.balance, 16);
  const firstReplay = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey: firstKey }) });
  assert.equal((await firstReplay.json()).wallet.balance, 16);
  const second = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey: `checkout_use_b_${runId}` }) });
  const secondBody = await second.json();
  assert.equal(secondBody.wallet.balance, 12);

  const refreshed = await fetch(`${baseUrl}/api/payments?productId=${productId}`, { headers: buyerHeaders });
  assert.deepEqual((await refreshed.json()).access, { allowed: false, reason: "payment_required" });
  const refund = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "refund", orderId: firstBody.order.id, idempotencyKey: `refund_use_${runId}` }) });
  assert.equal(refund.status, 409);
  assert.deepEqual(await refund.json(), { error: "per_use_not_refundable" });

  const buyerState = await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  const buyerStateBody = await buyerState.json();
  assert.equal(buyerStateBody.wallet.balance, 12);
  assert.equal(buyerStateBody.wallet.balance, buyerStateBody.wallet.ledgerBalance);
  const ownerState = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const ownerStateBody = await ownerState.json();
  assert.equal(ownerStateBody.wallet.pendingBalance, 8);
  assert.equal(ownerStateBody.wallet.pendingBalance, ownerStateBody.wallet.ledgerPendingBalance);
  await executeLocalD1(`UPDATE product_orders SET available_at = '2020-01-01 00:00:00' WHERE seller_email = 'per-use-owner-${runId}@example.com' AND status = 'paid'`);
  const settled = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const settledBody = await settled.json();
  assert.equal(settledBody.wallet.pendingBalance, 0);
  assert.equal(settledBody.wallet.balance, 28);
  assert.equal(settledBody.wallet.balance, settledBody.wallet.ledgerBalance);
  assert.equal(settledBody.wallet.pendingBalance, settledBody.wallet.ledgerPendingBalance);
});

test("insufficient checkout leaves buyer, seller, order, and ledger unchanged", async () => {
  const ownerHeaders = authHeaders("高价作品作者", `expensive-owner-${runId}@example.com`);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `高价边界作品 ${runId}`, description: "验证余额不足时交易整体回滚，不会给卖家产生待结算收入。", category: "开发工具", coverTheme: "ink", pricingModel: "one_time", price: 21 }),
  });
  const productId = (await created.json()).product.id;
  const buyerHeaders = authHeaders("余额不足买家", `poor-buyer-${runId}@example.com`);
  await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = 'poor-buyer-${runId}@example.com'`);
  const rejected = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey: `checkout_poor_${runId}` }) });
  assert.equal(rejected.status, 409);
  assert.deepEqual(await rejected.json(), { error: "insufficient_balance" });
  const buyer = await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  const buyerBody = await buyer.json();
  assert.equal(buyerBody.wallet.balance, 20);
  assert.equal(buyerBody.orders.length, 0);
  assert.equal(buyerBody.wallet.balance, buyerBody.wallet.ledgerBalance);
  const owner = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const ownerBody = await owner.json();
  assert.equal(ownerBody.wallet.pendingBalance, 0);
  assert.equal(ownerBody.wallet.pendingBalance, ownerBody.wallet.ledgerPendingBalance);
});

test("fruit cannot be claimed or topped up through the legacy action", async () => {
  const headers = authHeaders("无充值用户", `no-topup-${runId}@example.com`);
  const before = await fetch(`${baseUrl}/api/community`, { headers });
  assert.equal((await before.json()).wallet.balance, 20);
  const claim = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers, body: JSON.stringify({ action: "check_in" }) });
  assert.equal(claim.status, 410);
  assert.deepEqual(await claim.json(), { error: "daily_claim_removed", earningPath: "qualified_product_likes" });
  const topup = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers, body: JSON.stringify({ action: "topup", amount: 999, idempotencyKey: `topup_${runId}` }) });
  assert.equal(topup.status, 400);
  assert.deepEqual(await topup.json(), { error: "invalid_payment_action" });
  const after = await fetch(`${baseUrl}/api/community`, { headers });
  const afterBody = await after.json();
  assert.equal(afterBody.wallet.balance, 20);
  assert.equal(afterBody.wallet.balance, afterBody.wallet.ledgerBalance);
});

test("qualified likes mint once while new, self, repeated, and rapid likes are suppressed", async () => {
  const ownerEmail = `reward-owner-${runId}@example.com`;
  const ownerHeaders = authHeaders("点赞奖励作者", ownerEmail);
  const createdIds = [];
  for (let index = 0; index < 7; index += 1) {
    const created = await fetch(`${baseUrl}/api/products`, { method: "POST", headers: ownerHeaders, body: JSON.stringify({ title: `点赞奖励作品 ${index} ${runId}`, description: "用于验证唯一点赞奖励、账号年龄和快速连赞抑制规则。", category: "互动体验", coverTheme: "yellow", pricingModel: "free", price: 0 }) });
    createdIds.push((await created.json()).product.id);
  }

  const newHeaders = authHeaders("新账号点赞者", `new-liker-${runId}@example.com`);
  const newLike = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: newHeaders, body: JSON.stringify({ action: "like", productId: createdIds[0] }) });
  assert.equal((await newLike.json()).reward.reason, "account_too_new");

  const likerEmail = `mature-liker-${runId}@example.com`;
  const likerHeaders = authHeaders("成熟点赞者", likerEmail);
  await fetch(`${baseUrl}/api/community`, { headers: likerHeaders });
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = '${likerEmail}'`);

  const likeResponses = await Promise.all(createdIds.map((productId) => fetch(`${baseUrl}/api/actions`, { method: "POST", headers: likerHeaders, body: JSON.stringify({ action: "like", productId }) })));
  const rewards = await Promise.all(likeResponses.map(async (response) => (await response.json()).reward));
  assert.equal(rewards.filter((reward) => reward.granted === true && reward.amount === 1).length, 6);
  assert.equal(rewards.filter((reward) => reward.reason === "velocity_limit").length, 1);

  const unlike = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: likerHeaders, body: JSON.stringify({ action: "like", productId: createdIds[0] }) });
  assert.equal((await unlike.json()).liked, false);
  const relike = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: likerHeaders, body: JSON.stringify({ action: "like", productId: createdIds[0] }) });
  assert.equal((await relike.json()).reward.reason, "already_processed");
  const selfLike = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: ownerHeaders, body: JSON.stringify({ action: "like", productId: createdIds[0] }) });
  assert.equal((await selfLike.json()).reward.reason, "self_like");

  const ownerState = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const ownerBody = await ownerState.json();
  assert.equal(ownerBody.wallet.balance, 26);
  assert.equal(ownerBody.wallet.balance, ownerBody.wallet.ledgerBalance);
});

test("daily like issuance caps both the actor and the receiving creator", async () => {
  const ownerEmail = `cap-owner-${runId}@example.com`;
  const ownerHeaders = authHeaders("奖励上限作者", ownerEmail);
  const productIds = [];
  for (let index = 0; index < 11; index += 1) {
    const created = await fetch(`${baseUrl}/api/products`, { method: "POST", headers: ownerHeaders, body: JSON.stringify({ title: `奖励上限作品 ${index} ${runId}`, description: "用于验证点赞发行的每日硬上限。", category: "互动体验", coverTheme: "yellow", pricingModel: "free", price: 0 }) });
    productIds.push((await created.json()).product.id);
  }

  const actorEmail = `cap-actor-${runId}@example.com`;
  const actorHeaders = authHeaders("每日上限点赞者", actorEmail);
  await fetch(`${baseUrl}/api/community`, { headers: actorHeaders });
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = '${actorEmail}'`);
  for (let index = 0; index < 10; index += 1) {
    const like = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: actorHeaders, body: JSON.stringify({ action: "like", productId: productIds[index] }) });
    assert.equal((await like.json()).reward.granted, true);
    await executeLocalD1(`UPDATE fruit_reward_events SET created_at = datetime('now', '-2 minutes') WHERE actor_email = '${actorEmail}'`);
  }
  const actorLimited = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: actorHeaders, body: JSON.stringify({ action: "like", productId: productIds[10] }) });
  assert.equal((await actorLimited.json()).reward.reason, "actor_daily_limit");

  const recipientActorEmails = Array.from({ length: 11 }, (_, index) => `recipient-cap-${index}-${runId}@example.com`);
  const recipientActorHeaders = recipientActorEmails.map((email, index) => authHeaders(`收款上限点赞者 ${index}`, email));
  await Promise.all(recipientActorHeaders.map((headers) => fetch(`${baseUrl}/api/community`, { headers })));
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email LIKE 'recipient-cap-%-${runId}@example.com'`);
  for (let index = 0; index < 10; index += 1) {
    const like = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: recipientActorHeaders[index], body: JSON.stringify({ action: "like", productId: productIds[0] }) });
    assert.equal((await like.json()).reward.granted, true);
  }
  const recipientLimited = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: recipientActorHeaders[10], body: JSON.stringify({ action: "like", productId: productIds[0] }) });
  assert.equal((await recipientLimited.json()).reward.reason, "recipient_daily_limit");

  const ownerState = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const ownerBody = await ownerState.json();
  assert.equal(ownerBody.wallet.balance, 40);
  assert.equal(ownerBody.wallet.balance, ownerBody.wallet.ledgerBalance);
});

test("fruit ledger rejects mutation instead of rewriting history", async () => {
  const output = await executeLocalD1("UPDATE fruit_entries SET delta = 999 WHERE operation_id LIKE 'onboarding:%'", false);
  assert.match(output, /fruit_entries_immutable/);
});

test("OIDC login and delegated fruit API require PKCE, scopes, and per-payment confirmation", async () => {
  const merchantEmail = `oidc-merchant-${runId}@example.com`;
  const merchantHeaders = authHeaders("OIDC 应用所有者", merchantEmail);
  const register = await fetch(`${baseUrl}/api/developer/clients`, {
    method: "POST",
    headers: merchantHeaders,
    body: JSON.stringify({
      name: `星桥外部平台 ${runId}`,
      description: "验证造场登录、令牌轮换和外部果子支付。",
      websiteUrl: "https://client.example/app",
      clientType: "confidential",
      redirectUris: ["https://client.example/oauth/callback", "https://client.example/payment/callback"],
      allowedScopes: "openid profile email fruit:balance fruit:pay fruit:refund",
    }),
  });
  assert.equal(register.status, 201);
  const registered = (await register.json()).client;
  assert.match(registered.clientId, /^zc_/);
  assert.match(registered.clientSecret, /^zcs_/);

  const listed = await fetch(`${baseUrl}/api/developer/clients`, { headers: merchantHeaders });
  const listedBody = await listed.json();
  assert.equal(listedBody.clients.some((client) => client.clientId === registered.clientId), true);
  assert.equal(JSON.stringify(listedBody).includes(registered.clientSecret), false);

  const publicWrite = await fetch(`${baseUrl}/api/developer/clients`, {
    method: "POST",
    headers: merchantHeaders,
    body: JSON.stringify({ name: "不允许写权限的公开客户端", websiteUrl: "https://public.example/app", clientType: "public", redirectUris: ["https://public.example/callback"], allowedScopes: "openid fruit:pay" }),
  });
  assert.equal(publicWrite.status, 400);
  assert.deepEqual(await publicWrite.json(), { error: "public_client_write_scope_forbidden" });

  const discovery = await fetch(`${baseUrl}/.well-known/openid-configuration`);
  assert.equal(discovery.status, 200);
  const discoveryBody = await discovery.json();
  assert.equal(discoveryBody.issuer, baseUrl);
  assert.equal(discoveryBody.code_challenge_methods_supported.includes("S256"), true);
  assert.equal(discoveryBody.scopes_supported.includes("fruit:pay"), true);

  const payerEmail = `oidc-payer-${runId}@example.com`;
  const payerHeaders = authHeaders("外部平台支付用户", payerEmail);
  const verifier = `pkce_${"a".repeat(58)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = Buffer.from(digest).toString("base64url");
  const state = `state_${runId}`.replaceAll("@", "_");
  const nonce = `nonce_${runId}`.replaceAll("@", "_");
  const authorizeUrl = new URL(`${baseUrl}/oauth/authorize`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", registered.clientId);
  authorizeUrl.searchParams.set("redirect_uri", "https://client.example/oauth/callback");
  authorizeUrl.searchParams.set("scope", "openid profile email fruit:balance fruit:pay fruit:refund");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("nonce", nonce);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const consentPage = await fetch(authorizeUrl, { headers: payerHeaders });
  assert.equal(consentPage.status, 200);
  const consentHtml = await consentPage.text();
  assert.match(consentHtml, /每一笔果子支付仍会回到造场/);
  const requestToken = consentHtml.match(/name="request_token" value="([^"]+)"/)?.[1];
  assert.equal(typeof requestToken, "string");

  const approveAuthorization = await fetch(`${baseUrl}/api/oauth/authorize`, {
    method: "POST",
    redirect: "manual",
    headers: { ...payerHeaders, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ request_token: requestToken, decision: "allow" }),
  });
  assert.equal(approveAuthorization.status, 303);
  const authorizationRedirect = new URL(approveAuthorization.headers.get("location"));
  assert.equal(authorizationRedirect.origin, "https://client.example");
  assert.equal(authorizationRedirect.searchParams.get("state"), state);
  const authorizationCode = authorizationRedirect.searchParams.get("code");
  assert.match(authorizationCode, /^zcc_/);

  const basic = `Basic ${Buffer.from(`${registered.clientId}:${registered.clientSecret}`).toString("base64")}`;
  const tokenRequestBody = new URLSearchParams({ grant_type: "authorization_code", code: authorizationCode, redirect_uri: "https://client.example/oauth/callback", code_verifier: verifier });
  const tokenResponse = await fetch(`${baseUrl}/api/oauth/token`, { method: "POST", headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded" }, body: tokenRequestBody });
  assert.equal(tokenResponse.status, 200);
  const tokens = await tokenResponse.json();
  assert.match(tokens.access_token, /^zca_/);
  assert.match(tokens.refresh_token, /^zcr_/);
  assert.equal(tokens.scope, "openid profile email fruit:balance fruit:pay fruit:refund");

  const jwks = await (await fetch(`${baseUrl}/api/oauth/jwks`)).json();
  const verifiedIdToken = await jwtVerify(tokens.id_token, createLocalJWKSet(jwks), { issuer: baseUrl, audience: registered.clientId });
  assert.equal(verifiedIdToken.payload.nonce, nonce);
  assert.equal(verifiedIdToken.payload.email, payerEmail);
  assert.match(verifiedIdToken.payload.sub, /^zcsub_/);

  const codeReplay = await fetch(`${baseUrl}/api/oauth/token`, { method: "POST", headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded" }, body: tokenRequestBody });
  assert.equal(codeReplay.status, 400);
  assert.equal((await codeReplay.json()).error, "invalid_grant");

  const bearerHeaders = { authorization: `Bearer ${tokens.access_token}` };
  const userInfo = await fetch(`${baseUrl}/api/oauth/userinfo`, { headers: bearerHeaders });
  const userInfoBody = await userInfo.json();
  assert.equal(userInfoBody.email, payerEmail);
  assert.equal(userInfoBody.name, "外部平台支付用户");
  assert.equal(userInfoBody.sub, verifiedIdToken.payload.sub);
  const walletBefore = await fetch(`${baseUrl}/api/v1/fruit/wallet`, { headers: bearerHeaders });
  assert.equal(walletBefore.status, 200);
  assert.equal((await walletBefore.json()).wallet.balance, 20);

  const createPaymentPayload = {
    externalReference: `pro_plan_${runId}`,
    title: "专业版一次解锁",
    description: "验证创建意图时不扣果，用户确认后才发生账本变化。",
    pricingModel: "one_time",
    amount: 8,
    returnUri: "https://client.example/payment/callback",
  };
  const paymentHeaders = { ...bearerHeaders, "content-type": "application/json", "idempotency-key": `external_order_${runId}` };
  const blockedNewAccountPayment = await fetch(`${baseUrl}/api/v1/fruit/payments`, { method: "POST", headers: paymentHeaders, body: JSON.stringify(createPaymentPayload) });
  assert.equal(blockedNewAccountPayment.status, 403);
  assert.deepEqual(await blockedNewAccountPayment.json(), { error: "account_too_new_for_transfer" });
  const blockedPayerState = await (await fetch(`${baseUrl}/api/community`, { headers: payerHeaders })).json();
  const blockedMerchantState = await (await fetch(`${baseUrl}/api/community`, { headers: merchantHeaders })).json();
  assert.equal(blockedPayerState.wallet.balance, 20);
  assert.equal(blockedMerchantState.wallet.pendingBalance, 0);
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = '${payerEmail}'`);
  const createPayment = await fetch(`${baseUrl}/api/v1/fruit/payments`, { method: "POST", headers: paymentHeaders, body: JSON.stringify(createPaymentPayload) });
  assert.equal(createPayment.status, 201);
  const payment = (await createPayment.json()).payment;
  assert.equal(payment.status, "pending");
  assert.match(payment.approvalUrl, /\/oauth\/payment\/extpay_/);

  const createPaymentReplay = await fetch(`${baseUrl}/api/v1/fruit/payments`, { method: "POST", headers: paymentHeaders, body: JSON.stringify(createPaymentPayload) });
  assert.equal(createPaymentReplay.status, 200);
  assert.equal((await createPaymentReplay.json()).payment.id, payment.id);
  const payerBeforeApproval = await (await fetch(`${baseUrl}/api/community`, { headers: payerHeaders })).json();
  const merchantBeforeApproval = await (await fetch(`${baseUrl}/api/community`, { headers: merchantHeaders })).json();
  assert.equal(payerBeforeApproval.wallet.balance, 20);
  assert.equal(merchantBeforeApproval.wallet.pendingBalance, 0);

  const paymentPage = await fetch(payment.approvalUrl, { headers: payerHeaders });
  assert.equal(paymentPage.status, 200);
  const paymentHtml = await paymentPage.text();
  assert.match(paymentHtml, /创建意图时不扣果/);
  const paymentChallenge = paymentHtml.match(/name="challenge" value="([^"]+)"/)?.[1];
  assert.equal(typeof paymentChallenge, "string");
  const approvalBody = new URLSearchParams({ payment_id: payment.id, challenge: paymentChallenge, decision: "allow" });
  const approvalResponses = await Promise.all([0, 1].map(() => fetch(`${baseUrl}/api/v1/fruit/payments/approve`, {
    method: "POST",
    redirect: "manual",
    headers: { ...payerHeaders, origin: baseUrl, "content-type": "application/x-www-form-urlencoded" },
    body: approvalBody.toString(),
  })));
  assert.equal(approvalResponses.every((response) => response.status === 303), true);

  const paidQuery = await fetch(`${baseUrl}/api/v1/fruit/payments/${payment.id}`, { headers: bearerHeaders });
  assert.equal((await paidQuery.json()).payment.status, "paid");
  const payerAfterApproval = await (await fetch(`${baseUrl}/api/community`, { headers: payerHeaders })).json();
  const merchantAfterApproval = await (await fetch(`${baseUrl}/api/community`, { headers: merchantHeaders })).json();
  assert.equal(payerAfterApproval.wallet.balance, 12);
  assert.equal(payerAfterApproval.wallet.balance, payerAfterApproval.wallet.ledgerBalance);
  assert.equal(merchantAfterApproval.wallet.pendingBalance, 8);
  assert.equal(merchantAfterApproval.wallet.pendingBalance, merchantAfterApproval.wallet.ledgerPendingBalance);

  const refundResponses = await Promise.all([
    fetch(`${baseUrl}/api/v1/fruit/payments/${payment.id}/refund`, { method: "POST", headers: { ...bearerHeaders, "idempotency-key": `external_refund_api_${runId}` } }),
    fetch(`${baseUrl}/api/payments`, { method: "POST", headers: payerHeaders, body: JSON.stringify({ action: "external_refund", paymentId: payment.id, idempotencyKey: `external_refund_wallet_${runId}` }) }),
  ]);
  assert.equal(refundResponses.every((response) => response.status === 200), true);
  const refundBodies = await Promise.all(refundResponses.map((response) => response.json()));
  assert.deepEqual(refundBodies.map((body) => body.replayed).sort(), [false, true]);
  const payerAfterRefund = await (await fetch(`${baseUrl}/api/community`, { headers: payerHeaders })).json();
  const merchantAfterRefund = await (await fetch(`${baseUrl}/api/community`, { headers: merchantHeaders })).json();
  assert.equal(payerAfterRefund.wallet.balance, 20);
  assert.equal(payerAfterRefund.wallet.balance, payerAfterRefund.wallet.ledgerBalance);
  assert.equal(merchantAfterRefund.wallet.pendingBalance, 0);
  assert.equal(merchantAfterRefund.wallet.pendingBalance, merchantAfterRefund.wallet.ledgerPendingBalance);

  const perUseCreate = await fetch(`${baseUrl}/api/v1/fruit/payments`, {
    method: "POST",
    headers: { ...bearerHeaders, "content-type": "application/json", "idempotency-key": `external_per_use_${runId}` },
    body: JSON.stringify({ ...createPaymentPayload, externalReference: `single_session_${runId}`, title: "单次协作会话", pricingModel: "per_use", amount: 4 }),
  });
  assert.equal(perUseCreate.status, 201);
  const perUsePayment = (await perUseCreate.json()).payment;
  const perUsePage = await fetch(perUsePayment.approvalUrl, { headers: payerHeaders });
  const perUseHtml = await perUsePage.text();
  const perUseChallenge = perUseHtml.match(/name="challenge" value="([^"]+)"/)?.[1];
  const perUseApprove = await fetch(`${baseUrl}/api/v1/fruit/payments/approve`, {
    method: "POST",
    redirect: "manual",
    headers: { ...payerHeaders, origin: baseUrl, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ payment_id: perUsePayment.id, challenge: perUseChallenge, decision: "allow" }),
  });
  assert.equal(perUseApprove.status, 303);
  const perUseRefund = await fetch(`${baseUrl}/api/v1/fruit/payments/${perUsePayment.id}/refund`, { method: "POST", headers: { ...bearerHeaders, "idempotency-key": `external_per_use_refund_${runId}` } });
  assert.equal(perUseRefund.status, 409);
  assert.deepEqual(await perUseRefund.json(), { error: "per_use_not_refundable" });
  const payerAfterPerUse = await (await fetch(`${baseUrl}/api/community`, { headers: payerHeaders })).json();
  const merchantAfterPerUse = await (await fetch(`${baseUrl}/api/community`, { headers: merchantHeaders })).json();
  assert.equal(payerAfterPerUse.wallet.balance, 16);
  assert.equal(payerAfterPerUse.wallet.balance, payerAfterPerUse.wallet.ledgerBalance);
  assert.equal(payerAfterPerUse.orders.some((order) => order.id === perUsePayment.id && order.source === "external" && order.status === "paid"), true);
  assert.equal(merchantAfterPerUse.wallet.pendingBalance, 4);
  assert.equal(merchantAfterPerUse.wallet.pendingBalance, merchantAfterPerUse.wallet.ledgerPendingBalance);

  const refreshBody = new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, scope: "openid" });
  const refresh = await fetch(`${baseUrl}/api/oauth/token`, { method: "POST", headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded" }, body: refreshBody });
  assert.equal(refresh.status, 200);
  const refreshedTokens = await refresh.json();
  assert.match(refreshedTokens.access_token, /^zca_/);
  assert.equal(refreshedTokens.scope, "openid");
  const narrowedWallet = await fetch(`${baseUrl}/api/v1/fruit/wallet`, { headers: { authorization: `Bearer ${refreshedTokens.access_token}` } });
  assert.equal(narrowedWallet.status, 403);
  assert.equal((await narrowedWallet.json()).error, "insufficient_scope");
  const refreshReplay = await fetch(`${baseUrl}/api/oauth/token`, { method: "POST", headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded" }, body: refreshBody });
  assert.equal(refreshReplay.status, 400);
  assert.equal((await refreshReplay.json()).error, "invalid_grant");

  const consents = await fetch(`${baseUrl}/api/oauth/consents`, { headers: payerHeaders });
  assert.equal((await consents.json()).consents.some((consent) => consent.clientId === registered.clientId), true);
  const revokeConsent = await fetch(`${baseUrl}/api/oauth/consents`, { method: "DELETE", headers: payerHeaders, body: JSON.stringify({ clientId: registered.clientId }) });
  assert.equal(revokeConsent.status, 200);
  const revokedToken = await fetch(`${baseUrl}/api/oauth/userinfo`, { headers: { authorization: `Bearer ${refreshedTokens.access_token}` } });
  assert.equal(revokedToken.status, 401);
  assert.equal((await revokedToken.json()).error, "invalid_token");
});

test("persists profile, collections, comments, and incubation state", async () => {
  const email = `member-features-${runId}@example.com`;
  const headers = authHeaders("功能验收用户", email);

  const profile = await fetch(`${baseUrl}/api/actions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "update_profile", bio: "持续发布小而明确的产品实验。", location: "杭州", website: "https://example.com" }),
  });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).profile.bio, "持续发布小而明确的产品实验。");

  const createdCollection = await fetch(`${baseUrl}/api/actions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "create_collection", name: "反复体验", color: "blue" }),
  });
  assert.equal(createdCollection.status, 201);
  const collectionId = (await createdCollection.json()).collection.id;
  assert.equal(Number.isInteger(collectionId), true);

  const saved = await fetch(`${baseUrl}/api/actions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "add_to_collection", collectionId, productRef: "mori" }),
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { saved: true, added: true, collectionId });

  const comment = await fetch(`${baseUrl}/api/comments`, {
    method: "POST",
    headers,
    body: JSON.stringify({ targetType: "product", targetRef: "mori", content: "希望下一版开放环境声分轨控制。" }),
  });
  assert.equal(comment.status, 201);
  assert.equal((await comment.json()).comment.content, "希望下一版开放环境声分轨控制。");

  const comments = await fetch(`${baseUrl}/api/comments?targetType=product&targetRef=mori`, { headers });
  assert.equal(comments.status, 200);
  assert.equal((await comments.json()).comments.some((item) => item.content === "希望下一版开放环境声分轨控制。"), true);

  const incubation = await fetch(`${baseUrl}/api/incubation`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "星桥协作台", projectType: "AI 产品", oneLiner: "让小团队不增加会议也能形成可追踪的产品共识。", problem: "产品决策散落在聊天与会议里，后续很难找到依据。", progress: "已有可演示原型", team: "2-5 人团队", need: "产品定位与用户验证", contact: "hello@example.com" }),
  });
  assert.equal(incubation.status, 201);
  const incubationBody = await incubation.json();
  assert.equal(incubationBody.project.name, "星桥协作台");
  assert.equal(incubationBody.project.status, "资料审核");

  const uploadHeaders = { ...headers };
  delete uploadHeaders["content-type"];
  const materialForm = new FormData();
  materialForm.set("file", new File(["target users"], "personas.txt", { type: "text/plain" }));
  materialForm.set("visibility", "private");
  const materialUpload = await fetch(`${baseUrl}/api/uploads`, { method: "POST", headers: uploadHeaders, body: materialForm });
  assert.equal(materialUpload.status, 201);
  const materialUrl = (await materialUpload.json()).url;
  const material = await fetch(`${baseUrl}/api/incubation`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "add_material", projectId: incubationBody.project.id, name: "目标用户画像.txt", url: materialUrl, kind: "FILE" }),
  });
  assert.equal(material.status, 201);
  const incubationState = await fetch(`${baseUrl}/api/incubation`, { headers });
  assert.equal(incubationState.status, 200);
  const refreshedProject = (await incubationState.json()).project;
  assert.equal(refreshedProject.status, "项目评估");
  assert.equal(refreshedProject.currentTask, "等待产品评估意见");

  const state = await fetch(`${baseUrl}/api/community`, { headers });
  assert.equal(state.status, 200);
  const body = await state.json();
  assert.equal(body.profile.location, "杭州");
  assert.equal(body.collections.some((item) => item.id === collectionId && item.itemCount === 1), true);
  assert.equal(body.collectionItems.some((item) => item.collectionId === collectionId && item.productRef === "mori"), true);
});

test("enforces upload visibility and ownership", async () => {
  const ownerEmail = `upload-owner-${runId}@example.com`;
  const ownerHeaders = authHeaders("上传所有者", ownerEmail);
  delete ownerHeaders["content-type"];

  const privateForm = new FormData();
  privateForm.set("file", new File(["private project material"], "evidence.txt", { type: "text/plain" }));
  privateForm.set("visibility", "private");
  const privateUpload = await fetch(`${baseUrl}/api/uploads`, { method: "POST", headers: ownerHeaders, body: privateForm });
  assert.equal(privateUpload.status, 201);
  const privateBody = await privateUpload.json();
  assert.equal(privateBody.visibility, "private");

  const ownerDownload = await fetch(`${baseUrl}${privateBody.url}`, { headers: ownerHeaders });
  assert.equal(ownerDownload.status, 200);
  assert.equal(await ownerDownload.text(), "private project material");

  const anonymousDownload = await fetch(`${baseUrl}${privateBody.url}`);
  assert.equal(anonymousDownload.status, 403);

  const otherHeaders = authHeaders("其他用户", `upload-other-${runId}@example.com`);
  const otherDownload = await fetch(`${baseUrl}${privateBody.url}`, { headers: otherHeaders });
  assert.equal(otherDownload.status, 403);

  const otherProjectResponse = await fetch(`${baseUrl}/api/incubation`, { method: "POST", headers: otherHeaders, body: JSON.stringify({ name: "越权资料项目", projectType: "开发者项目", oneLiner: "验证其他用户不能把不属于自己的私有文件挂进项目。", problem: "对象链接可能被复制，但所有权不能随链接转移。", progress: "安全验证", team: "个人项目", need: "技术架构与开发", contact: "security@example.com" }) });
  assert.equal(otherProjectResponse.status, 201);
  const otherProjectId = (await otherProjectResponse.json()).project.id;
  const stolenMaterial = await fetch(`${baseUrl}/api/incubation`, { method: "POST", headers: otherHeaders, body: JSON.stringify({ action: "add_material", projectId: otherProjectId, name: "不属于我的资料.txt", url: privateBody.url, kind: "FILE" }) });
  assert.equal(stolenMaterial.status, 403);
  assert.deepEqual(await stolenMaterial.json(), { error: "material_not_owned" });

  const publicForm = new FormData();
  publicForm.set("file", new File(["public cover image"], "cover.txt", { type: "text/plain" }));
  publicForm.set("visibility", "public");
  const publicUpload = await fetch(`${baseUrl}/api/uploads`, { method: "POST", headers: ownerHeaders, body: publicForm });
  assert.equal(publicUpload.status, 201);
  const publicBody = await publicUpload.json();
  assert.equal(publicBody.visibility, "public");
  const publicDownload = await fetch(`${baseUrl}${publicBody.url}`);
  assert.equal(publicDownload.status, 200);
  assert.equal(await publicDownload.text(), "public cover image");

  const missingVisibilityForm = new FormData();
  missingVisibilityForm.set("file", new File(["missing visibility"], "unknown.txt", { type: "text/plain" }));
  const missingVisibility = await fetch(`${baseUrl}/api/uploads`, { method: "POST", headers: ownerHeaders, body: missingVisibilityForm });
  assert.equal(missingVisibility.status, 400);
  assert.deepEqual(await missingVisibility.json(), { error: "invalid_visibility" });

  const publishWithCover = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: { ...ownerHeaders, "content-type": "application/json" },
    body: JSON.stringify({ title: `公开封面作品 ${runId}`, description: "验证上传后的站内封面地址可以直接进入真实发布流程。", category: "互动体验", coverTheme: "blue", imageUrl: publicBody.url, price: 0 }),
  });
  assert.equal(publishWithCover.status, 201);
  assert.equal((await publishWithCover.json()).product.imageUrl, publicBody.url);
});

test("generates account notifications and persists read state", async () => {
  const ownerHeaders = authHeaders("通知作品主人", `notify-owner-${runId}@example.com`);
  const publish = await fetch(`${baseUrl}/api/products`, { method: "POST", headers: ownerHeaders, body: JSON.stringify({ title: `通知测试作品 ${runId}`, description: "用于验证真实互动可以进入账号通知中心并保存已读状态。", category: "开发工具", coverTheme: "ink", price: 0 }) });
  assert.equal(publish.status, 201);
  const productId = (await publish.json()).product.id;
  const visitorHeaders = authHeaders("通知体验者", `notify-visitor-${runId}@example.com`);
  const like = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: visitorHeaders, body: JSON.stringify({ action: "like", productId }) });
  assert.equal(like.status, 200);
  const ownerState = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  assert.equal(ownerState.status, 200);
  const notification = (await ownerState.json()).notifications.find((item) => item.id === `like:${productId}:notify-visitor-${runId}@example.com`);
  assert.equal(notification.type, "互动");
  const mark = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: ownerHeaders, body: JSON.stringify({ action: "mark_notifications_read", targetRefs: [notification.id] }) });
  assert.equal(mark.status, 200);
  assert.deepEqual((await mark.json()).read, [notification.id]);
  const refreshed = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  assert.equal((await refreshed.json()).actions.some((item) => item.kind === "read_notification" && item.targetRef === notification.id), true);
});
});
