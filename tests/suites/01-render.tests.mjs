// 站点渲染与身份呈现:自 tests/rendered-html.test.mjs 保序拆分(测试体逐字未改)。
// 执行顺序由 tests/rendered-html.test.mjs 的注册顺序保证。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { FOUNDER_DISPLAY_NAME, products as showcaseProducts } from "../../app/lib/community-data.ts";
import {
  baseUrl,
  runId,
  adminEmail,
  operationsAdminEmail,
  projectRoot,
  authHeaders,
  fetchIdempotentWithRetry,
  executeLocalD1,
} from "../harness/preview.mjs";

export function register() {
test("idempotent retry helper rejects write requests before replay", async () => {
  await assert.rejects(
    fetchIdempotentWithRetry(`${baseUrl}/api/products`, { method: "POST" }),
    /retry helper only supports idempotent GET or HEAD requests/,
  );
});

test("keeps static preview traffic off Workerd without weakening product app headers", () => {
  const rateLimit = readFileSync(join(projectRoot, "deploy", "server", "nginx-rate-limit.conf"), "utf8");
  const nginx = readFileSync(join(projectRoot, "deploy", "server", "zaochang-preview.nginx.conf"), "utf8");
  const assets = nginx.match(/location \^~ \/assets\/ \{([\s\S]*?)\n    \}/)?.[1] ?? "";
  const productApps = nginx.match(/location \^~ \/product-apps\/ \{([\s\S]*?)\n    \}/)?.[1] ?? "";
  const favicon = nginx.match(/location = \/favicon\.svg \{([\s\S]*?)\n    \}/)?.[1] ?? "";

  assert.match(rateLimit, /zone=zaochang_preview_static_per_ip:10m rate=64r\/s/);
  assert.match(nginx, /map \$uri \$zaochang_product_permissions_policy/);
  assert.match(nginx, /~\^\/product-apps\/wander\/ "camera=\(\), microphone=\(\), payment=\(\), geolocation=\(self\)"/);
  assert.doesNotMatch(nginx, /auth_basic/);
  assert.match(nginx, /proxy_redirect http:\/\/aetherstudio\.top\/ https:\/\/aetherstudio\.top\//);
  assert.match(nginx, /proxy_redirect http:\/\/www\.aetherstudio\.top\/ https:\/\/www\.aetherstudio\.top\//);

  for (const block of [assets, productApps, favicon]) {
    assert.match(block, /limit_req zone=zaochang_preview_static_per_ip burst=160 nodelay/);
    assert.match(block, /limit_conn zaochang_preview_connections 128/);
    assert.match(block, /root \/opt\/zaochang\/current\/dist\/client/);
    assert.doesNotMatch(block, /proxy_pass/);
  }

  assert.match(assets, /Cache-Control "public, max-age=31536000, immutable";/);
  assert.doesNotMatch(assets, /Cache-Control "public, max-age=31536000, immutable" always/);
  assert.match(productApps, /X-Content-Type-Options "nosniff" always/);
  assert.match(productApps, /X-Frame-Options "SAMEORIGIN" always/);
  assert.match(productApps, /Permissions-Policy \$zaochang_product_permissions_policy always/);
  assert.match(productApps, /Content-Security-Policy "default-src 'self';[^"]+frame-ancestors 'self';[^"]+" always/);

  const probe = spawnSync(process.execPath, [join(projectRoot, "deploy", "server", "zaochang-capacity-probe.mjs"), "--help"], {
    cwd: projectRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(probe.status, 0, probe.stderr);
  assert.match(probe.stdout, /--auth none/);
  assert.match(probe.stdout, /credential_base64 \| node zaochang-capacity-probe\.mjs --auth basic/);

  const scannerSyntax = spawnSync(process.execPath, ["--check", join(projectRoot, "deploy", "server", "zaochang-upload-scanner.mjs")], {
    cwd: projectRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(scannerSyntax.status, 0, scannerSyntax.stderr);
  const scannerService = readFileSync(join(projectRoot, "deploy", "server", "zaochang-upload-scanner.service"), "utf8");
  assert.match(scannerService, /NoNewPrivileges=true/);
  assert.match(scannerService, /ProtectSystem=strict/);
  assert.match(scannerService, /MemoryHigh=1000M/);
  assert.match(scannerService, /MemoryMax=1150M/);
  assert.match(readFileSync(join(projectRoot, "deploy", "server", "zaochang-clamav-update.service"), "utf8"), /flock -w 300 -E 75 \/run\/lock\/zaochang-clamav\.lock/);
  assert.match(readFileSync(join(projectRoot, "deploy", "server", "zaochang-clamav-update.timer"), "utf8"), /OnCalendar=\*-\*-\* 03:20:00/);
});

test("server-renders the creator community", async () => {
  const response = await fetch(baseUrl, { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  const html = await response.text();
  assert.match(html, /<title>造场 \| 创作者的试玩社区<\/title>/);
  assert.match(html, /今天，大家/);
  assert.match(html, /都在造什么/);
  assert.match(html, /发布作品/);
  assert.match(html, /果子钱包/);
  assert.match(html, /href="\/galaxy"/);
  assert.match(html, /产品银河/);
  assert.match(html, /1 位社区成员/);
  assert.doesNotMatch(html, /284 位创作者|今日新增作品|正在被体验|当前在线|\+42%|4 天后截止|果奖金池/);
  assert.doesNotMatch(html, /\.vinext\/fonts|file:\/\/|\.woff2/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("public community aggregates match the persisted records", async () => {
  const response = await fetch(`${baseUrl}/api/community`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.platformStats, { members: 1, products: 0, posts: 0, productPlays: 0, todayFruitMovement: 0 });
  assert.deepEqual(body.products, []);
  assert.deepEqual(body.posts, []);
  assert.equal(body.signedIn, false);
});

test("only product app documents can be embedded by the same origin", async () => {
  const response = await fetch(`${baseUrl}/product-apps/mori/index.html`, { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'self'/);
  assert.doesNotMatch(response.headers.get("content-security-policy") ?? "", /frame-ancestors \*/);
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
  ["/galaxy/incubator", "项目孵化控制台"],
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

test("founder identity owns the built-in portfolio and exposes founder management without widening access", async () => {
  const founderProducts = showcaseProducts.filter((product) => product.founderOwned);
  assert.equal(founderProducts.length, 6);
  assert.equal(founderProducts.every((product) => product.ownerName === FOUNDER_DISPLAY_NAME), true);

  const founderHeaders = authHeaders(FOUNDER_DISPLAY_NAME, adminEmail);
  await fetch(`${baseUrl}/api/community`, { headers: founderHeaders });
  const otherEmail = `other-owner-${runId}@example.com`;
  await fetch(`${baseUrl}/api/community`, { headers: authHeaders("其他创作者", otherEmail) });
  await executeLocalD1(`
    INSERT INTO products
      (owner_email, owner_name, title, description, category, status, review_status, approved_version)
    VALUES
      ('${adminEmail}', '${FOUNDER_DISPLAY_NAME}', '创始人数据库产品', '只应出现在创始人资产中', '效率工具', 'pending_review', 'pending_review', 0),
      ('${otherEmail}', '其他创作者', '其他用户数据库产品', '不得划入创始人资产', '互动体验', 'pending_review', 'pending_review', 0)
  `);

  const [profileResponse, founderResponse, adminResponse, operationsAdminResponse, operationsFounderResponse, regularFounderResponse, regularAdminResponse] = await Promise.all([
    fetch(`${baseUrl}/profile`, { headers: founderHeaders }),
    fetch(`${baseUrl}/founder`, { headers: founderHeaders }),
    fetch(`${baseUrl}/admin`, { headers: founderHeaders }),
    fetch(`${baseUrl}/admin`, { headers: authHeaders("运营管理员", operationsAdminEmail) }),
    fetch(`${baseUrl}/founder`, { headers: authHeaders("运营管理员", operationsAdminEmail) }),
    fetch(`${baseUrl}/founder`, { headers: authHeaders("普通成员", `regular-founder-${runId}@example.com`) }),
    fetch(`${baseUrl}/admin`, { headers: authHeaders("普通成员", `regular-admin-${runId}@example.com`) }),
  ]);
  assert.equal(profileResponse.status, 200);
  assert.equal(founderResponse.status, 200);
  assert.equal(adminResponse.status, 200);
  assert.equal(operationsAdminResponse.status, 200);
  assert.equal(operationsFounderResponse.status, 404);
  assert.equal(regularFounderResponse.status, 404);
  assert.equal(regularAdminResponse.status, 404);

  const profileHtml = await profileResponse.text();
  assert.match(profileHtml, /造场创始人/);
  assert.match(profileHtml, /href="\/founder"/);
  assert.match(profileHtml, /href="\/admin"/);
  for (const product of founderProducts) assert.match(profileHtml, new RegExp(product.title));
  const founderHtml = await founderResponse.text();
  assert.match(founderHtml, /<h1>创始人中心<\/h1>/);
  assert.match(founderHtml, /造场预置产品<\/span><strong>6<\/strong>/);
  assert.match(founderHtml, /创始人数据库产品/);
  assert.doesNotMatch(founderHtml, /其他用户数据库产品/);
  assert.match(founderHtml, /进入平台管理/);
  const adminHtml = await adminResponse.text();
  assert.match(adminHtml, /<h1>造场管理中心<\/h1>/);
  assert.match(adminHtml, /aria-label="管理事项总览"/);
  assert.match(adminHtml, /href="#product-review"/);

  const regularHome = await fetch(baseUrl, { headers: authHeaders("普通成员", `regular-shell-${runId}@example.com`) });
  assert.equal(regularHome.status, 200);
  const regularHtml = await regularHome.text();
  assert.doesNotMatch(regularHtml, /href="\/founder"/);
  assert.doesNotMatch(regularHtml, /href="\/admin"/);
  assert.doesNotMatch(regularHtml, /class="founder-role"/);
  await executeLocalD1(`DELETE FROM products WHERE title IN ('创始人数据库产品', '其他用户数据库产品')`);
});
}
