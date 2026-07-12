import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
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

before(async () => {
  for (const migrationFile of ["0000_silky_karen_page.sql", "0001_oauth_accounts.sql", "0002_community_interactions.sql"]) {
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
  ["/wallet", "果子在作品之间流动"],
  ["/circles", "围绕做东西，形成关系"],
  ["/challenges", "给创作一个共同起点"],
  ["/collections", "想再回来玩的作品"],
  ["/profile", "登录后查看你的创作者主页"],
  ["/notifications", "与你有关的信号"],
  ["/guide", "让作品被认真对待"],
  ["/product/mori", "开始体验"],
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
