import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createLocalJWKSet, jwtVerify } from "jose";
import { GALAXIES, PLANETS, PLANETS_BY_GALAXY } from "../app/galaxy/cosmic-atlas.ts";
import { GALAXY_BUSINESS, GALAXY_PRODUCTS, PRODUCT_BY_PLANET } from "../app/galaxy/product-galaxy.ts";
import { resolvePublicAppOrigin } from "../app/lib/public-origin.ts";

const port = 4179;
const baseUrl = `http://127.0.0.1:${port}`;
const runId = `${process.pid}-${Date.now()}`;
const adminEmail = `release-admin-${runId}@example.com`;
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

async function executeD1Sql(sql, expectSuccess = true) {
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
  return `${result.stdout}\n${result.stderr}`;
}

async function executeLocalD1(sql, expectSuccess = true) {
  const result = await executeD1Sql(sql, expectSuccess);
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
  return result;
}

async function creditTestFruit(email, amount = 20, label = crypto.randomUUID()) {
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

async function reviewProduct(productId, decision = "approve_product", note = "平台预审确认产品说明与体验入口符合发布要求。") {
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
  for (const migrationFile of ["0000_silky_karen_page.sql", "0001_oauth_accounts.sql", "0002_community_interactions.sql", "0003_strange_sandman.sql", "0004_lush_gambit.sql", "0005_flimsy_magus.sql", "0006_release_readiness.sql", "0007_product_like_counters.sql", "0008_noisy_jazinda.sql", "0009_moderation_remediation.sql"]) {
    if (migrationFile === "0008_noisy_jazinda.sql") {
      await executeD1Sql(`
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
    if (migrationFile === "0008_noisy_jazinda.sql") {
      const bypassFailure = await executeD1Sql(
        `UPDATE products
         SET status = 'published', review_status = 'approved', approved_version = review_version,
             reviewed_by = owner_email, reviewed_at = CURRENT_TIMESTAMP, review_note = '绕过审核决定'
         WHERE owner_email = 'legacy-review-migration@example.com'`,
        false,
      );
      assert.match(bypassFailure, /product_review_state_invalid/);
      await executeD1Sql(`
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
      const mutableDecision = await executeD1Sql(`
        UPDATE product_review_decisions SET note = '篡改审核意见' WHERE id = 'legacy-review-decision'
      `, false);
      assert.match(mutableDecision, /product_review_decision_immutable/);
      const deletableDecision = await executeD1Sql(`
        DELETE FROM product_review_decisions WHERE id = 'legacy-review-decision'
      `, false);
      assert.match(deletableDecision, /product_review_decision_immutable/);
      await executeD1Sql(`
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
      const guardedOrder = await executeD1Sql(`
        INSERT INTO product_orders
          (id, buyer_email, product_id, seller_email, pricing_model, amount,
           idempotency_key, purchase_operation_id, available_at)
          SELECT 'review-guard-order', 'legacy-review-buyer@example.com', id, owner_email,
                 pricing_model, price, 'review-guard-order', 'legacy-review-purchase', datetime('now', '+24 hours')
          FROM products WHERE owner_email = 'legacy-review-migration@example.com'
      `, false);
      assert.match(guardedOrder, /product_order_product_not_approved/);
      const guardedLike = await executeD1Sql(`
        INSERT INTO product_likes (product_id, user_email)
          SELECT id, owner_email FROM products WHERE owner_email = 'legacy-review-migration@example.com'
      `, false);
      assert.match(guardedLike, /product_like_product_not_approved/);
      const guardedComment = await executeD1Sql(`
        INSERT INTO comments (user_email, owner_name, target_type, target_ref, content)
          SELECT owner_email, owner_name, 'product', CAST(id AS TEXT), '待审产品评论'
          FROM products WHERE owner_email = 'legacy-review-migration@example.com'
      `, false);
      assert.match(guardedComment, /product_comment_product_not_approved/);
      const guardedTip = await executeD1Sql(`
        INSERT INTO fruit_operations
          (id, kind, idempotency_key, actor_email, target_email, amount, reference_type, reference_id, description)
          SELECT 'review-guard-tip', 'tip', 'review-guard-tip', 'legacy-review-buyer@example.com',
                 owner_email, 5, 'product', CAST(id AS TEXT), '待审产品打赏'
          FROM products WHERE owner_email = 'legacy-review-migration@example.com'
      `, false);
      assert.match(guardedTip, /product_tip_product_not_approved/);
      await executeD1Sql(`
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

  const executable = process.execPath;
  const args = [
    join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js"),
    "dev",
    "--config", "dist/server/wrangler.json",
    "--port", String(port),
    "--persist-to", stateDir,
    "--var", "APP_ENV:test",
    "--var", `ZAOCHANG_ADMIN_EMAILS:${adminEmail}`,
  ];
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
  const waitForExit = (timeoutMs) => {
    if (!server || server.exitCode !== null) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      server.once("exit", () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  };

  let stopped = true;
  if (server?.pid && server.exitCode === null) {
    if (process.platform === "win32") server.kill("SIGTERM");
    else process.kill(-server.pid, "SIGTERM");
    stopped = await waitForExit(5000);
  }
  if (!stopped && server?.pid && process.platform === "win32") {
    const forced = spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 10000,
    });
    assert.notEqual(forced.error?.code, "ETIMEDOUT", `taskkill timed out for preview server ${server.pid}`);
    assert.equal(forced.status, 0, forced.stderr || forced.stdout);
    stopped = await waitForExit(2000);
  } else if (!stopped && server?.pid) {
    process.kill(-server.pid, "SIGKILL");
    stopped = await waitForExit(2000);
  }
  assert.equal(stopped, true, `preview server ${server?.pid ?? "unknown"} did not exit`);
  await rm(stateDir, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 120,
  });
  await rm(logPath, { force: true, maxRetries: 4, retryDelay: 80 });
});

describe("造场社区集成流程", { concurrency: false }, () => {
test("keeps static preview traffic off Workerd without weakening product app headers", () => {
  const rateLimit = readFileSync(join(projectRoot, "deploy", "server", "nginx-rate-limit.conf"), "utf8");
  const nginx = readFileSync(join(projectRoot, "deploy", "server", "zaochang-preview.nginx.conf"), "utf8");
  const assets = nginx.match(/location \^~ \/assets\/ \{([\s\S]*?)\n    \}/)?.[1] ?? "";
  const productApps = nginx.match(/location \^~ \/product-apps\/ \{([\s\S]*?)\n    \}/)?.[1] ?? "";
  const favicon = nginx.match(/location = \/favicon\.svg \{([\s\S]*?)\n    \}/)?.[1] ?? "";

  assert.match(rateLimit, /zone=zaochang_preview_static_per_ip:10m rate=64r\/s/);
  assert.match(nginx, /map \$uri \$zaochang_product_permissions_policy/);
  assert.match(nginx, /~\^\/product-apps\/wander\/ "camera=\(\), microphone=\(\), payment=\(\), geolocation=\(self\)"/);

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
  assert.match(probe.stdout, /credential_base64 \| node zaochang-capacity-probe\.mjs/);
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

test("production public origin is explicit, HTTPS-only, and fail-closed", () => {
  assert.throws(
    () => resolvePublicAppOrigin("http://127.0.0.1:3001", "production", undefined),
    /public_app_origin_required/,
  );
  assert.throws(
    () => resolvePublicAppOrigin("http://127.0.0.1:3001", "production", "http://aetherstudio.top"),
    /invalid_public_app_origin/,
  );
  assert.equal(
    resolvePublicAppOrigin("http://127.0.0.1:3001", "production", "https://aetherstudio.top"),
    "https://aetherstudio.top",
  );
});

test("keeps sign-in outside the community shell", async () => {
  const response = await fetch(`${baseUrl}/signin`, { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /class="auth-page"/);
  assert.match(html, /class="auth-brand"/);
  assert.doesNotMatch(html, /deep-topbar|deep-sidebar|deep-mobile-nav|deep-account/);
});

test("logout deletes the server session so a copied cookie cannot be replayed", async () => {
  const email = `logout-session-${runId}@example.com`;
  await fetch(`${baseUrl}/api/community`, { headers: authHeaders("退出登录用户", email) });
  const rawToken = `session_${runId}`.replaceAll("-", "_");
  const tokenHash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken))).toString("hex");
  await executeLocalD1(`INSERT INTO auth_sessions (token_hash, user_email, provider, expires_at) VALUES ('${tokenHash}', '${email}', 'github', datetime('now', '+1 day'))`);
  const cookie = `zaochang_session=${rawToken}`;
  const authenticated = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "x" }),
  });
  assert.equal(authenticated.status, 400);
  assert.deepEqual(await authenticated.json(), { error: "invalid_product" });

  const logout = await fetch(`${baseUrl}/api/auth/logout?return_to=%2Fsignin`, { headers: { cookie }, redirect: "manual" });
  assert.equal(logout.status, 307);
  assert.match(logout.headers.get("set-cookie") ?? "", /zaochang_session=;.*Max-Age=0/i);
  const replay = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "x" }),
  });
  assert.equal(replay.status, 401);
  assert.deepEqual(await replay.json(), { error: "auth_required" });
});

test("production rejects forged workspace identity headers unless explicitly trusted", async () => {
  const productionPort = port + 1;
  const productionStateDir = join(tmpdir(), `zaochang-production-auth-${runId}`);
  let productionOutput = "";
  const executable = process.platform === "win32" ? process.env.ComSpec : "npx";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", `npx wrangler dev --config dist/server/wrangler.json --port ${productionPort} --persist-to ${productionStateDir} --var APP_ENV:production --var PUBLIC_APP_ORIGIN:https://production.example`]
    : ["wrangler", "dev", "--config", "dist/server/wrangler.json", "--port", String(productionPort), "--persist-to", productionStateDir, "--var", "APP_ENV:production", "--var", "PUBLIC_APP_ORIGIN:https://production.example"];
  const productionServer = spawn(executable, args, {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  productionServer.stdout.on("data", (chunk) => { productionOutput += chunk.toString(); });
  productionServer.stderr.on("data", (chunk) => { productionOutput += chunk.toString(); });
  try {
    const deadline = Date.now() + 15000;
    let response;
    while (Date.now() < deadline) {
      if (productionServer.exitCode !== null) throw new Error(`Production auth preview exited early:\n${productionOutput}`);
      try {
        response = await fetch(`http://127.0.0.1:${productionPort}/api/products`, {
          method: "POST",
          headers: authHeaders("伪造身份", "forged@example.com"),
          body: JSON.stringify({ title: "x" }),
        });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    assert.equal(response?.status, 401, productionOutput);
    assert.deepEqual(await response.json(), { error: "auth_required" });
    const discovery = await fetch(`http://127.0.0.1:${productionPort}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(5000) });
    assert.equal(discovery.status, 200);
    assert.equal((await discovery.json()).issuer, "https://production.example");
    assert.match(discovery.headers.get("strict-transport-security") ?? "", /max-age=31536000/);
  } finally {
    if (productionServer.pid && process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(productionServer.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else if (productionServer.pid) {
      process.kill(-productionServer.pid, "SIGTERM");
    }
    await rm(productionStateDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 120 });
  }
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

test("all submitted products require platform review before public access or fruit actions", async () => {
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
    assert.equal(state.wallet.balance, 0);
    publish = await sendPublish();
    publishBody = await publish.text();
  }
  assert.equal(publish.status, 201, `${publishBody}\n${output}`);
  const published = JSON.parse(publishBody);
  assert.equal(published.product.title, title);
  assert.equal(published.product.pricingModel, "one_time");
  assert.equal(published.product.price, 5);
  assert.equal(published.product.status, "pending_review");
  assert.equal(published.product.reviewStatus, "pending_review");
  assert.equal(published.product.reviewVersion, 1);
  assert.equal(published.reward, 0);
  const productId = published.product.id;

  const community = await fetch(`${baseUrl}/api/community`, { headers });
  assert.equal(community.status, 200);
  const data = await community.json();
  assert.equal(data.wallet.balance, 0);
  assert.equal(data.wallet.balance, data.wallet.ledgerBalance);
  assert.equal(data.products.some((product) => product.title === title), false);
  const ownedPending = data.ownedProducts.find((product) => product.id === productId);
  assert.equal(ownedPending.status, "pending_review");
  assert.equal(ownedPending.reviewStatus, "pending_review");
  assert.equal(ownedPending.reviewVersion, 1);
  assert.equal(ownedPending.approvedVersion, 0);

  const visitorHeaders = authHeaders("预审边界访客", `review-visitor-${runId}@example.com`);
  await fetch(`${baseUrl}/api/community`, { headers: visitorHeaders });
  const [pendingPage, pendingPayment, pendingExperience, pendingLike, pendingTip, pendingComments, pendingComment] = await Promise.all([
    fetch(`${baseUrl}/product/${productId}`, { headers: { accept: "text/html" } }),
    fetch(`${baseUrl}/api/payments?productId=${productId}`, { headers: visitorHeaders }),
    fetch(`${baseUrl}/api/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "experience", productId }) }),
    fetch(`${baseUrl}/api/actions`, { method: "POST", headers: visitorHeaders, body: JSON.stringify({ action: "like", productId }) }),
    fetch(`${baseUrl}/api/actions`, { method: "POST", headers: visitorHeaders, body: JSON.stringify({ action: "tip", productId, amount: 5, idempotencyKey: `pending_tip_${runId}` }) }),
    fetch(`${baseUrl}/api/comments?targetType=product&targetRef=${productId}`),
    fetch(`${baseUrl}/api/comments`, { method: "POST", headers: visitorHeaders, body: JSON.stringify({ targetType: "product", targetRef: String(productId), content: "待审商品不应允许评论。" }) }),
  ]);
  assert.equal(pendingPage.status, 404);
  await pendingPage.arrayBuffer();
  for (const response of [pendingPayment, pendingExperience, pendingLike, pendingTip, pendingComments, pendingComment]) {
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "product_not_found" });
  }
  const visitorPendingState = await (await fetch(`${baseUrl}/api/community`, { headers: visitorHeaders })).json();
  assert.equal(visitorPendingState.wallet.balance, 0);
  assert.equal(visitorPendingState.wallet.balance, visitorPendingState.wallet.ledgerBalance);
  assert.equal(visitorPendingState.wallet.pendingBalance, 0);
  assert.equal(visitorPendingState.wallet.pendingBalance, visitorPendingState.wallet.ledgerPendingBalance);

  const deniedReview = await fetch(`${baseUrl}/api/admin/moderation`, {
    method: "PATCH",
    headers: visitorHeaders,
    body: JSON.stringify({ action: "approve_product", targetRef: String(productId), note: "无权限用户尝试批准。" }),
  });
  assert.equal(deniedReview.status, 403);
  assert.deepEqual(await deniedReview.json(), { error: "admin_forbidden" });

  await reviewProduct(productId, "approve_product", "产品说明、体验入口与访问方式均通过平台预审。");
  const duplicateDecision = await fetch(`${baseUrl}/api/admin/moderation`, {
    method: "PATCH",
    headers: authHeaders("发布审核管理员", adminEmail),
    body: JSON.stringify({ action: "reject_product", targetRef: String(productId), note: "并发后的第二个决定必须被拒绝。" }),
  });
  assert.equal(duplicateDecision.status, 409);
  assert.deepEqual(await duplicateDecision.json(), { error: "product_review_already_decided" });

  const approvedState = await (await fetch(`${baseUrl}/api/community`, { headers })).json();
  assert.equal(approvedState.products.some((product) => product.id === productId), true);
  const ownedApproved = approvedState.ownedProducts.find((product) => product.id === productId);
  assert.equal(ownedApproved.status, "published");
  assert.equal(ownedApproved.reviewStatus, "approved");
  assert.equal(ownedApproved.approvedVersion, ownedApproved.reviewVersion);
  const approvedPage = await fetch(`${baseUrl}/product/${productId}`);
  assert.equal(approvedPage.status, 200);
  await approvedPage.arrayBuffer();
  assert.equal((await fetch(`${baseUrl}/api/payments?productId=${productId}`, { headers: visitorHeaders })).status, 200);

  const visitorEmail = `review-visitor-${runId}@example.com`;
  await executeLocalD1(`UPDATE members SET joined_at = datetime('now', '-48 hours') WHERE email = '${visitorEmail}'`);
  await creditTestFruit(visitorEmail, 10, `review_replay_${runId}`);
  const idempotencyKey = `review_checkout_${runId}`;
  const checkout = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: visitorHeaders,
    body: JSON.stringify({ action: "checkout", productId, idempotencyKey }),
  });
  assert.equal(checkout.status, 200);
  const checkoutBody = await checkout.json();
  assert.equal(checkoutBody.access, true);
  assert.equal(checkoutBody.charged, true);
  await executeLocalD1(`UPDATE products SET description = description || ' 进入复审。' WHERE id = ${productId}`);
  const replayAfterReviewInvalidation = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: visitorHeaders,
    body: JSON.stringify({ action: "checkout", productId, idempotencyKey }),
  });
  assert.equal(replayAfterReviewInvalidation.status, 404);
  assert.deepEqual(await replayAfterReviewInvalidation.json(), { error: "product_not_found" });
  const visitorAfterReplay = await (await fetch(`${baseUrl}/api/community`, { headers: visitorHeaders })).json();
  assert.equal(visitorAfterReplay.wallet.balance, 5);
  assert.equal(visitorAfterReplay.wallet.balance, visitorAfterReplay.wallet.ledgerBalance);
});

test("external demo URLs cannot cross the immutable review boundary", async () => {
  const ownerEmail = `external-demo-owner-${runId}@example.com`;
  const ownerHeaders = authHeaders("外链作品作者", ownerEmail);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      title: `可变外链作品 ${runId}`,
      description: "用于验证审核通过后仍可替换内容的外部链接不会进入正式产品区。",
      category: "互动体验",
      coverTheme: "blue",
      pricingModel: "free",
      price: 0,
      demoUrl: "https://example.com/mutable-demo",
    }),
  });
  assert.equal(created.status, 201);
  const productId = (await created.json()).product.id;
  const adminHeaders = authHeaders("发布审核管理员", adminEmail);
  const approval = await fetch(`${baseUrl}/api/admin/moderation`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ action: "approve_product", targetRef: String(productId), note: "外链页面当前检查无异常。" }),
  });
  assert.equal(approval.status, 409);
  assert.deepEqual(await approval.json(), { error: "external_demo_requires_immutable_package" });

  const directApproval = await executeLocalD1(`
    INSERT INTO product_review_decisions
      (id, product_id, review_version, reviewer_email, decision, note)
    VALUES ('external-demo-bypass-${runId}', ${productId}, 1, '${adminEmail}', 'approved', '尝试绕过 API 批准外链。')
  `, false);
  assert.match(directApproval, /external_demo_requires_immutable_package/);
  const state = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  const product = state.ownedProducts.find((item) => item.id === productId);
  assert.equal(product.status, "pending_review");
  assert.equal(product.reviewStatus, "pending_review");
  assert.equal(product.approvedVersion, 0);
  assert.equal(state.products.some((item) => item.id === productId), false);

  await reviewProduct(productId, "reject_product", "外部链接可被原地替换，请改为站内不可变原型后重新提交。");
});

test("rejected products remain private and return the reviewer note to their owner", async () => {
  const ownerHeaders = authHeaders("预审驳回作者", `review-rejected-owner-${runId}@example.com`);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `预审驳回作品 ${runId}`, description: "用于验证驳回决定不会把商品暴露给公开访问或果子支付。", category: "互动体验", coverTheme: "coral", pricingModel: "one_time", price: 3 }),
  });
  assert.equal(created.status, 201);
  const productId = (await created.json()).product.id;
  const reviewQueue = await (await fetch(`${baseUrl}/api/admin/moderation`, { headers: authHeaders("发布审核管理员", adminEmail) })).json();
  const queuedProduct = reviewQueue.products.find((product) => product.id === productId);
  assert.equal(queuedProduct.reviewStatus, "pending_review");
  assert.equal(queuedProduct.reviewVersion, 1);
  const note = "体验地址缺少可核验内容，请补充完整演示后重新提交。";
  await reviewProduct(productId, "reject_product", note);

  const ownerState = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  const product = ownerState.ownedProducts.find((item) => item.id === productId);
  assert.equal(product.status, "rejected");
  assert.equal(product.reviewStatus, "rejected");
  assert.equal(product.approvedVersion, 0);
  assert.equal(product.reviewNote, note);
  assert.equal(ownerState.products.some((item) => item.id === productId), false);
  assert.equal((await fetch(`${baseUrl}/product/${productId}`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/payments?productId=${productId}`, { headers: ownerHeaders })).status, 404);
});

test("review invalidation during checkout rolls back the entire financial batch", async () => {
  const ownerEmail = `review-race-seller-${runId}@example.com`;
  const buyerEmail = `review-race-buyer-${runId}@example.com`;
  const ownerHeaders = authHeaders("复审竞态卖家", ownerEmail);
  const buyerHeaders = authHeaders("复审竞态买家", buyerEmail);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `复审竞态作品 ${runId}`, description: "在支付批次中途切换审核状态，验证所有财务写入整体回滚。", category: "开发工具", coverTheme: "ink", pricingModel: "one_time", price: 5 }),
  });
  const productId = (await created.json()).product.id;
  await reviewProduct(productId);
  await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  await executeLocalD1(`UPDATE members SET joined_at = datetime('now', '-48 hours') WHERE email = '${buyerEmail}'`);
  await creditTestFruit(buyerEmail, 10, `review_race_${runId}`);
  await executeLocalD1(`
    CREATE TRIGGER test_review_invalidation_before_purchase
    BEFORE INSERT ON fruit_operations
    WHEN NEW.kind = 'purchase' AND NEW.reference_type = 'product' AND NEW.reference_id = '${productId}'
    BEGIN
      UPDATE products SET status = 'pending_review', review_status = 'pending_review',
        review_version = review_version + 1, reviewed_by = NULL, reviewed_at = NULL,
        review_note = '', submitted_at = CURRENT_TIMESTAMP
      WHERE id = ${productId};
    END
  `);
  const checkout = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: buyerHeaders,
    body: JSON.stringify({ action: "checkout", productId, idempotencyKey: `review_race_checkout_${runId}` }),
  });
  assert.equal(checkout.status, 404);
  assert.deepEqual(await checkout.json(), { error: "product_not_found" });
  await executeLocalD1(`DROP TRIGGER test_review_invalidation_before_purchase`);
  await executeLocalD1(`
    CREATE TABLE review_race_assertion (id integer);
    CREATE TRIGGER review_race_assertion_guard BEFORE INSERT ON review_race_assertion
    WHEN NOT EXISTS (
      SELECT 1 FROM products
      WHERE id = ${productId} AND status = 'published' AND review_status = 'approved'
        AND review_version = 1 AND approved_version = 1
    ) OR NOT EXISTS (
      SELECT 1 FROM wallets
      WHERE user_email = '${buyerEmail}' AND balance = 10 AND pending_balance = 0
    ) OR NOT EXISTS (
      SELECT 1 FROM wallets
      WHERE user_email = '${ownerEmail}' AND balance = 0 AND pending_balance = 0
    ) OR EXISTS (
      SELECT 1 FROM product_orders WHERE product_id = ${productId}
    ) OR EXISTS (
      SELECT 1 FROM fruit_operations
      WHERE kind = 'purchase' AND reference_type = 'product' AND reference_id = '${productId}'
    )
    BEGIN SELECT RAISE(ABORT, 'review_race_financial_batch_not_rolled_back'); END;
    INSERT INTO review_race_assertion (id) VALUES (1);
    DROP TRIGGER review_race_assertion_guard;
    DROP TABLE review_race_assertion
  `);
  const buyerState = await (await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders })).json();
  const ownerState = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  assert.equal(buyerState.wallet.balance, buyerState.wallet.ledgerBalance);
  assert.equal(ownerState.wallet.pendingBalance, ownerState.wallet.ledgerPendingBalance);
});

test("concurrent product review decisions produce one terminal decision", async () => {
  const ownerHeaders = authHeaders("并发预审作者", `review-race-owner-${runId}@example.com`);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `并发预审作品 ${runId}`, description: "两个审核决定同时到达时，只允许一个终态和一份版本决定。", category: "开发工具", coverTheme: "ink", pricingModel: "free", price: 0 }),
  });
  const productId = (await created.json()).product.id;
  const adminHeaders = authHeaders("发布审核管理员", adminEmail);
  await fetch(`${baseUrl}/api/admin/moderation`, { headers: adminHeaders });
  const decisions = await Promise.all([
    fetch(`${baseUrl}/api/admin/moderation`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ action: "approve_product", targetRef: String(productId), note: "并发审核中的批准决定。" }) }),
    fetch(`${baseUrl}/api/admin/moderation`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ action: "reject_product", targetRef: String(productId), note: "并发审核中的驳回决定。" }) }),
  ]);
  assert.deepEqual(decisions.map((response) => response.status).sort(), [200, 409]);
  const winningResponse = decisions.find((response) => response.status === 200);
  const losingResponse = decisions.find((response) => response.status === 409);
  const winner = await winningResponse.json();
  assert.deepEqual(await losingResponse.json(), { error: "product_review_already_decided" });

  const ownerState = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  const product = ownerState.ownedProducts.find((item) => item.id === productId);
  assert.equal(product.reviewStatus, winner.reviewStatus);
  assert.equal(product.status, winner.reviewStatus === "approved" ? "published" : "rejected");
  assert.equal(product.approvedVersion, winner.reviewStatus === "approved" ? product.reviewVersion : 0);
  assert.equal(ownerState.products.some((item) => item.id === productId), winner.reviewStatus === "approved");
});

test("concurrent identical product review decisions replay the same terminal decision", async () => {
  const ownerHeaders = authHeaders("幂等预审作者", `review-idempotent-owner-${runId}@example.com`);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `幂等预审作品 ${runId}`, description: "相同管理员决定并发到达时返回同一审核终态。", category: "开发工具", coverTheme: "ink", pricingModel: "free", price: 0 }),
  });
  const productId = (await created.json()).product.id;
  const adminHeaders = authHeaders("发布审核管理员", adminEmail);
  const payload = JSON.stringify({ action: "approve_product", targetRef: String(productId), note: "并发相同批准决定应当幂等重放。" });
  const responses = await Promise.all([
    fetch(`${baseUrl}/api/admin/moderation`, { method: "PATCH", headers: adminHeaders, body: payload }),
    fetch(`${baseUrl}/api/admin/moderation`, { method: "PATCH", headers: adminHeaders, body: payload }),
  ]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  const bodies = await Promise.all(responses.map((response) => response.json()));
  assert.equal(bodies.every((body) => body.reviewStatus === "approved"), true);
  assert.equal(bodies.filter((body) => body.replayed === true).length, 1);
  const state = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  const product = state.ownedProducts.find((item) => item.id === productId);
  assert.equal(product.status, "published");
  assert.equal(product.reviewStatus, "approved");
  assert.equal(product.approvedVersion, product.reviewVersion);
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
  await reviewProduct(productId);
  const supporterHeaders = authHeaders("支持者", `supporter-${runId}@example.com`);

  const initial = await fetch(`${baseUrl}/api/community`, { headers: supporterHeaders });
  assert.equal(initial.status, 200);
  assert.equal((await initial.json()).wallet.balance, 0);
  await creditTestFruit(`supporter-${runId}@example.com`, 20, "tip-supporter");
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
  assert.equal(ownerAfterBody.wallet.balance, 20);
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
  await reviewProduct(productId);
  const buyerHeaders = authHeaders("一次解锁买家", `one-time-buyer-${runId}@example.com`);

  const before = await fetch(`${baseUrl}/api/payments?productId=${productId}`, { headers: buyerHeaders });
  const beforeBody = await before.json();
  assert.equal(beforeBody.access.allowed, false);
  assert.equal(beforeBody.wallet.balance, 0);
  const blockedYoungCheckout = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey: `checkout_young_${runId}` }) });
  assert.equal(blockedYoungCheckout.status, 403);
  assert.deepEqual(await blockedYoungCheckout.json(), { error: "account_too_new_for_transfer" });
  const ownerBeforeEligible = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  assert.equal(ownerBeforeEligible.wallet.pendingBalance, 0);
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = 'one-time-buyer-${runId}@example.com'`);
  await creditTestFruit(`one-time-buyer-${runId}@example.com`, 20, "one-time-buyer");

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

  await executeLocalD1(`UPDATE wallets SET status = 'frozen' WHERE user_email = 'one-time-owner-${runId}@example.com'`);
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
  assert.equal(ownerAfterBody.wallet.status, "frozen");
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
  await reviewProduct(productId);
  const buyerHeaders = authHeaders("并发解锁买家", `concurrent-buyer-${runId}@example.com`);
  await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = 'concurrent-buyer-${runId}@example.com'`);
  await creditTestFruit(`concurrent-buyer-${runId}@example.com`, 20, "concurrent-buyer");
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
  await reviewProduct(secondProductId);
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
  await reviewProduct(productId);
  const buyerHeaders = authHeaders("按次买家", `per-use-buyer-${runId}@example.com`);
  await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = 'per-use-buyer-${runId}@example.com'`);
  await creditTestFruit(`per-use-buyer-${runId}@example.com`, 20, "per-use-buyer");
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
  assert.equal(settledBody.wallet.balance, 8);
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
  await reviewProduct(productId);
  const buyerHeaders = authHeaders("余额不足买家", `poor-buyer-${runId}@example.com`);
  await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = 'poor-buyer-${runId}@example.com'`);
  const rejected = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey: `checkout_poor_${runId}` }) });
  assert.equal(rejected.status, 409);
  assert.deepEqual(await rejected.json(), { error: "insufficient_balance" });
  const buyer = await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  const buyerBody = await buyer.json();
  assert.equal(buyerBody.wallet.balance, 0);
  assert.equal(buyerBody.orders.length, 0);
  assert.equal(buyerBody.wallet.balance, buyerBody.wallet.ledgerBalance);
  const owner = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const ownerBody = await owner.json();
  assert.equal(ownerBody.wallet.pendingBalance, 0);
  assert.equal(ownerBody.wallet.pendingBalance, ownerBody.wallet.ledgerPendingBalance);
});

test("wallet ledger drift blocks purchase and places the wallet under review", async () => {
  const ownerHeaders = authHeaders("账本漂移作品主人", `drift-owner-${runId}@example.com`);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `账本漂移守门作品 ${runId}`, description: "物化余额与不可变账本不一致时，交易必须在扣果前被阻止。", category: "开发工具", coverTheme: "ink", pricingModel: "one_time", price: 5 }),
  });
  assert.equal(created.status, 201);
  const productId = (await created.json()).product.id;
  await reviewProduct(productId);
  const buyerEmail = `drift-buyer-${runId}@example.com`;
  const buyerHeaders = authHeaders("账本漂移买家", buyerEmail);
  await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  await creditTestFruit(buyerEmail, 20, "drift-buyer");
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = '${buyerEmail}'`);
  await executeLocalD1(`UPDATE wallets SET balance = 19 WHERE user_email = '${buyerEmail}'`);

  const rejected = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: buyerHeaders,
    body: JSON.stringify({ action: "checkout", productId, idempotencyKey: `checkout_drift_${runId}` }),
  });
  assert.equal(rejected.status, 423);
  assert.deepEqual(await rejected.json(), { error: "wallet_ledger_mismatch" });

  const buyerState = await (await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders })).json();
  assert.equal(buyerState.wallet.status, "review");
  assert.equal(buyerState.wallet.balance, 19);
  assert.equal(buyerState.wallet.ledgerBalance, 20);
  assert.equal(buyerState.orders.length, 0);
  const ownerState = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  assert.equal(ownerState.wallet.pendingBalance, 0);
  assert.equal(ownerState.wallet.pendingBalance, ownerState.wallet.ledgerPendingBalance);
});

test("fruit cannot be claimed or topped up through the legacy action", async () => {
  const headers = authHeaders("无充值用户", `no-topup-${runId}@example.com`);
  const before = await fetch(`${baseUrl}/api/community`, { headers });
  assert.equal((await before.json()).wallet.balance, 0);
  const claim = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers, body: JSON.stringify({ action: "check_in" }) });
  assert.equal(claim.status, 410);
  assert.deepEqual(await claim.json(), { error: "daily_claim_removed", earningPath: "qualified_product_likes" });
  const topup = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers, body: JSON.stringify({ action: "topup", amount: 999, idempotencyKey: `topup_${runId}` }) });
  assert.equal(topup.status, 400);
  assert.deepEqual(await topup.json(), { error: "invalid_payment_action" });
  const after = await fetch(`${baseUrl}/api/community`, { headers });
  const afterBody = await after.json();
  assert.equal(afterBody.wallet.balance, 0);
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
  for (const productId of createdIds) await reviewProduct(productId);

  const newHeaders = authHeaders("新账号点赞者", `new-liker-${runId}@example.com`);
  const newLike = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: newHeaders, body: JSON.stringify({ action: "like", productId: createdIds[0] }) });
  assert.equal((await newLike.json()).reward.reason, "account_too_new");

  const likerEmail = `mature-liker-${runId}@example.com`;
  const likerHeaders = authHeaders("成熟点赞者", likerEmail);
  await fetch(`${baseUrl}/api/community`, { headers: likerHeaders });
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = '${likerEmail}'`);

  const likeResponses = await Promise.all(createdIds.map((productId) => fetch(`${baseUrl}/api/actions`, { method: "POST", headers: likerHeaders, body: JSON.stringify({ action: "like", productId }) })));
  const likeBodies = await Promise.all(likeResponses.map((response) => response.json()));
  const rewards = likeBodies.map((body) => body.reward);
  assert.equal(rewards.filter((reward) => reward.granted === true && reward.amount === 1).length, 6);
  assert.equal(rewards.filter((reward) => reward.reason === "velocity_limit").length, 1);

  const ownerPendingBeforeUnlike = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  assert.equal(ownerPendingBeforeUnlike.wallet.balance, 0);
  assert.equal(ownerPendingBeforeUnlike.wallet.pendingBalance, 6);
  assert.equal(ownerPendingBeforeUnlike.wallet.pendingBalance, ownerPendingBeforeUnlike.wallet.ledgerPendingBalance);

  const grantedProductId = createdIds[rewards.findIndex((reward) => reward.granted === true)];
  assert.equal(Number.isInteger(grantedProductId), true);
  const unlikeResponses = await Promise.all([0, 1].map(() => fetch(`${baseUrl}/api/actions`, { method: "POST", headers: likerHeaders, body: JSON.stringify({ action: "like", productId: grantedProductId }) })));
  const unlikeBodies = await Promise.all(unlikeResponses.map((response) => response.json()));
  assert.equal(unlikeBodies.some((body) => body.reward?.reversed === true), true);
  const ownerAfterUnlike = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  assert.equal(ownerAfterUnlike.wallet.balance, 0);
  assert.equal(ownerAfterUnlike.wallet.pendingBalance, 5);
  assert.equal(ownerAfterUnlike.wallet.pendingBalance, ownerAfterUnlike.wallet.ledgerPendingBalance);

  let likerState = await (await fetch(`${baseUrl}/api/community`, { headers: likerHeaders })).json();
  let userStillLikes = likerState.productLikes.some((item) => item.productId === grantedProductId);
  let publicProduct = likerState.products.find((item) => item.id === grantedProductId);
  assert.equal(publicProduct.likes, userStillLikes ? 2 : 1);
  if (userStillLikes) {
    await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: likerHeaders, body: JSON.stringify({ action: "like", productId: grantedProductId }) });
  }
  likerState = await (await fetch(`${baseUrl}/api/community`, { headers: likerHeaders })).json();
  userStillLikes = likerState.productLikes.some((item) => item.productId === grantedProductId);
  publicProduct = likerState.products.find((item) => item.id === grantedProductId);
  assert.equal(userStillLikes, false);
  assert.equal(publicProduct.likes, 1);

  const relike = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: likerHeaders, body: JSON.stringify({ action: "like", productId: grantedProductId }) });
  assert.equal((await relike.json()).reward.reason, "already_processed");
  const selfLike = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: ownerHeaders, body: JSON.stringify({ action: "like", productId: createdIds[0] }) });
  assert.equal((await selfLike.json()).reward.reason, "self_like");

  const ownerState = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const ownerBody = await ownerState.json();
  assert.equal(ownerBody.wallet.balance, 0);
  assert.equal(ownerBody.wallet.pendingBalance, 5);
  assert.equal(ownerBody.wallet.balance, ownerBody.wallet.ledgerBalance);
  assert.equal(ownerBody.wallet.pendingBalance, ownerBody.wallet.ledgerPendingBalance);

  await executeLocalD1(`UPDATE fruit_reward_events SET created_at = datetime('now', '-25 hours') WHERE recipient_email = '${ownerEmail}' AND status = 'granted'`);
  const settledOwner = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  assert.equal(settledOwner.wallet.balance, 5);
  assert.equal(settledOwner.wallet.pendingBalance, 0);
  assert.equal(settledOwner.wallet.balance, settledOwner.wallet.ledgerBalance);
  assert.equal(settledOwner.wallet.pendingBalance, settledOwner.wallet.ledgerPendingBalance);
});

test("daily like issuance caps both the actor and the receiving creator", async () => {
  const ownerEmail = `cap-owner-${runId}@example.com`;
  const ownerHeaders = authHeaders("奖励上限作者", ownerEmail);
  const productIds = [];
  for (let index = 0; index < 10; index += 1) {
    const created = await fetch(`${baseUrl}/api/products`, { method: "POST", headers: ownerHeaders, body: JSON.stringify({ title: `奖励上限作品 ${index} ${runId}`, description: "用于验证点赞发行的每日硬上限。", category: "互动体验", coverTheme: "yellow", pricingModel: "free", price: 0 }) });
    assert.equal(created.status, 201);
    productIds.push((await created.json()).product.id);
  }
  const publishRateLimited = await fetch(`${baseUrl}/api/products`, { method: "POST", headers: ownerHeaders, body: JSON.stringify({ title: `超出发布上限作品 ${runId}`, description: "同一账号在固定窗口内的第十一次发布必须被限流。", category: "互动体验", coverTheme: "yellow", pricingModel: "free", price: 0 }) });
  assert.equal(publishRateLimited.status, 429);
  assert.deepEqual(await publishRateLimited.json(), { error: "rate_limit_exceeded" });
  const auxiliaryOwnerHeaders = authHeaders("奖励上限辅助作者", `cap-aux-owner-${runId}@example.com`);
  let auxiliaryProduct;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    auxiliaryProduct = await fetch(`${baseUrl}/api/products`, { method: "POST", headers: auxiliaryOwnerHeaders, body: JSON.stringify({ title: `奖励上限辅助作品 ${runId}`, description: "提供第十一次独立点赞目标，不消耗主要作者的发布限额。", category: "互动体验", coverTheme: "mint", pricingModel: "free", price: 0 }) });
    if (auxiliaryProduct.status !== 503) break;
    await auxiliaryProduct.text();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal(auxiliaryProduct.status, 201);
  productIds.push((await auxiliaryProduct.json()).product.id);
  for (const productId of productIds) await reviewProduct(productId);

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
  assert.equal(ownerBody.wallet.balance, 0);
  assert.equal(ownerBody.wallet.pendingBalance, 20);
  assert.equal(ownerBody.wallet.balance, ownerBody.wallet.ledgerBalance);
  assert.equal(ownerBody.wallet.pendingBalance, ownerBody.wallet.ledgerPendingBalance);
});

test("fruit ledger rejects mutation instead of rewriting history", async () => {
  const email = `ledger-mutation-${runId}@example.com`;
  await fetch(`${baseUrl}/api/community`, { headers: authHeaders("账本防篡改用户", email) });
  const operationId = await creditTestFruit(email, 3, "ledger-mutation");
  const output = await executeLocalD1(`UPDATE fruit_entries SET delta = 999 WHERE operation_id = '${operationId}'`, false);
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
  assert.equal(registered.reviewStatus, "unverified");
  assert.equal(registered.writeAccessApproved, false);

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

  const blockedConsentPage = await fetch(authorizeUrl, { headers: payerHeaders });
  assert.equal(blockedConsentPage.status, 200);
  assert.match(await blockedConsentPage.text(), /果子写权限需要完成应用验证与人工审核/);
  await executeLocalD1(`UPDATE oauth_provider_clients SET review_status = 'verified', write_access_approved = 1 WHERE client_id = '${registered.clientId}'`);
  await creditTestFruit(payerEmail, 20, "oidc-payer");

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

  await executeLocalD1(`UPDATE wallets SET status = 'frozen' WHERE user_email = '${merchantEmail}'`);
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
  assert.equal(merchantAfterRefund.wallet.status, "frozen");
  assert.equal(merchantAfterRefund.wallet.pendingBalance, 0);
  assert.equal(merchantAfterRefund.wallet.pendingBalance, merchantAfterRefund.wallet.ledgerPendingBalance);
  await executeLocalD1(`UPDATE wallets SET status = 'active' WHERE user_email = '${merchantEmail}'`);

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

  const pendingBeforeRejection = await fetch(`${baseUrl}/api/v1/fruit/payments`, {
    method: "POST",
    headers: { ...bearerHeaders, "content-type": "application/json", "idempotency-key": `external_reject_${runId}` },
    body: JSON.stringify({ ...createPaymentPayload, externalReference: `rejected_client_${runId}`, title: "审核撤回前订单", amount: 3 }),
  });
  assert.equal(pendingBeforeRejection.status, 201);
  const rejectedPayment = (await pendingBeforeRejection.json()).payment;
  const rejectedPaymentPage = await fetch(rejectedPayment.approvalUrl, { headers: payerHeaders });
  const rejectedPaymentHtml = await rejectedPaymentPage.text();
  const rejectedPaymentChallenge = rejectedPaymentHtml.match(/name="challenge" value="([^"]+)"/)?.[1];
  assert.equal(typeof rejectedPaymentChallenge, "string");

  const rejectClient = await fetch(`${baseUrl}/api/admin/moderation`, {
    method: "PATCH",
    headers: authHeaders("发布审核管理员", adminEmail),
    body: JSON.stringify({ action: "reject_client", targetRef: registered.clientId }),
  });
  assert.equal(rejectClient.status, 200);
  assert.deepEqual(await rejectClient.json(), { updated: true });
  const rejectedClientList = await (await fetch(`${baseUrl}/api/developer/clients`, { headers: merchantHeaders })).json();
  assert.equal(rejectedClientList.clients.find((client) => client.clientId === registered.clientId).reviewStatus, "rejected");
  const rejectedBearer = await fetch(`${baseUrl}/api/v1/fruit/wallet`, { headers: bearerHeaders });
  assert.equal(rejectedBearer.status, 401);
  assert.equal((await rejectedBearer.json()).error, "invalid_token");
  const cancelledApproval = await fetch(`${baseUrl}/api/v1/fruit/payments/approve`, {
    method: "POST",
    redirect: "manual",
    headers: { ...payerHeaders, origin: baseUrl, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ payment_id: rejectedPayment.id, challenge: rejectedPaymentChallenge, decision: "allow" }),
  });
  assert.equal(cancelledApproval.status, 303);
  assert.equal(new URL(cancelledApproval.headers.get("location")).searchParams.get("payment_status"), "cancelled");
  const payerAfterRejection = await (await fetch(`${baseUrl}/api/community`, { headers: payerHeaders })).json();
  const merchantAfterRejection = await (await fetch(`${baseUrl}/api/community`, { headers: merchantHeaders })).json();
  assert.equal(payerAfterRejection.wallet.balance, 16);
  assert.equal(merchantAfterRejection.wallet.pendingBalance, 4);

  await executeLocalD1(`
    UPDATE oauth_provider_clients SET review_status = 'verified', write_access_approved = 1 WHERE client_id = '${registered.clientId}';
    UPDATE oauth_provider_access_tokens SET revoked_at = NULL WHERE client_id = '${registered.clientId}';
    UPDATE oauth_provider_refresh_tokens SET revoked_at = NULL WHERE client_id = '${registered.clientId}';
    UPDATE oauth_provider_consents SET revoked_at = NULL WHERE client_id = '${registered.clientId}' AND user_email = '${payerEmail}'
  `);

  const pendingBeforeConsentRevocation = await fetch(`${baseUrl}/api/v1/fruit/payments`, {
    method: "POST",
    headers: { ...bearerHeaders, "content-type": "application/json", "idempotency-key": `external_consent_revoke_${runId}` },
    body: JSON.stringify({ ...createPaymentPayload, externalReference: `revoked_consent_${runId}`, title: "用户撤权前订单", amount: 2 }),
  });
  assert.equal(pendingBeforeConsentRevocation.status, 201);
  const consentRevokedPayment = (await pendingBeforeConsentRevocation.json()).payment;
  assert.equal(consentRevokedPayment.status, "pending");
  const consentRevokedPaymentPage = await fetch(consentRevokedPayment.approvalUrl, { headers: payerHeaders });
  const consentRevokedPaymentHtml = await consentRevokedPaymentPage.text();
  const consentRevokedPaymentChallenge = consentRevokedPaymentHtml.match(/name="challenge" value="([^"]+)"/)?.[1];
  assert.equal(typeof consentRevokedPaymentChallenge, "string");

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
  const replacementRefresh = await fetch(`${baseUrl}/api/oauth/token`, {
    method: "POST",
    headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshedTokens.refresh_token, scope: "openid" }),
  });
  assert.equal(replacementRefresh.status, 400);
  assert.equal((await replacementRefresh.json()).error, "invalid_grant");
  const replayRevokedDescendant = await fetch(`${baseUrl}/api/oauth/userinfo`, { headers: { authorization: `Bearer ${refreshedTokens.access_token}` } });
  assert.equal(replayRevokedDescendant.status, 401);
  assert.equal((await replayRevokedDescendant.json()).error, "invalid_token");

  const consents = await fetch(`${baseUrl}/api/oauth/consents`, { headers: payerHeaders });
  assert.equal((await consents.json()).consents.some((consent) => consent.clientId === registered.clientId), true);
  const revokeConsent = await fetch(`${baseUrl}/api/oauth/consents`, { method: "DELETE", headers: payerHeaders, body: JSON.stringify({ clientId: registered.clientId }) });
  assert.equal(revokeConsent.status, 200);
  const revokedToken = await fetch(`${baseUrl}/api/oauth/userinfo`, { headers: { authorization: `Bearer ${tokens.access_token}` } });
  assert.equal(revokedToken.status, 401);
  assert.equal((await revokedToken.json()).error, "invalid_token");
  const consentRevokedApproval = await fetch(`${baseUrl}/api/v1/fruit/payments/approve`, {
    method: "POST",
    redirect: "manual",
    headers: { ...payerHeaders, origin: baseUrl, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ payment_id: consentRevokedPayment.id, challenge: consentRevokedPaymentChallenge, decision: "allow" }),
  });
  assert.equal(consentRevokedApproval.status, 303);
  assert.equal(new URL(consentRevokedApproval.headers.get("location")).searchParams.get("payment_status"), "cancelled");
  const payerAfterConsentRevocation = await (await fetch(`${baseUrl}/api/community`, { headers: payerHeaders })).json();
  const merchantAfterConsentRevocation = await (await fetch(`${baseUrl}/api/community`, { headers: merchantHeaders })).json();
  assert.equal(payerAfterConsentRevocation.wallet.balance, 16);
  assert.equal(payerAfterConsentRevocation.wallet.balance, payerAfterConsentRevocation.wallet.ledgerBalance);
  assert.equal(merchantAfterConsentRevocation.wallet.pendingBalance, 4);
  assert.equal(merchantAfterConsentRevocation.wallet.pendingBalance, merchantAfterConsentRevocation.wallet.ledgerPendingBalance);
});

test("reports require an administrator decision and hidden products leave public queries", async () => {
  const ownerEmail = `moderation-owner-${runId}@example.com`;
  const ownerHeaders = authHeaders("被举报作品作者", ownerEmail);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `审核隐藏作品 ${runId}`, description: "用于验证举报、人工处置和公开查询过滤是一条可复核的链路。", category: "互动体验", coverTheme: "coral", pricingModel: "one_time", price: 5 }),
  });
  assert.equal(created.status, 201);
  const productId = (await created.json()).product.id;
  await reviewProduct(productId);
  const buyerEmail = `moderation-buyer-${runId}@example.com`;
  const buyerHeaders = authHeaders("被隐藏作品买家", buyerEmail);
  await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  await creditTestFruit(buyerEmail, 10, "moderation-buyer");
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = '${buyerEmail}'`);
  const checkout = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey: `moderation_checkout_${runId}` }) });
  assert.equal(checkout.status, 200);
  const checkoutBody = await checkout.json();
  assert.equal(checkoutBody.charged, true);
  assert.equal(checkoutBody.order.status, "paid");
  const ownerBeforeHide = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  assert.equal(ownerBeforeHide.wallet.pendingBalance, 5);
  const settledBuyerEmail = `moderation-settled-buyer-${runId}@example.com`;
  const settledBuyerHeaders = authHeaders("已结算作品买家", settledBuyerEmail);
  await fetch(`${baseUrl}/api/community`, { headers: settledBuyerHeaders });
  await creditTestFruit(settledBuyerEmail, 10, "moderation-settled-buyer");
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = '${settledBuyerEmail}'`);
  const settledCheckout = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: settledBuyerHeaders,
    body: JSON.stringify({ action: "checkout", productId, idempotencyKey: `moderation_settled_checkout_${runId}` }),
  });
  assert.equal(settledCheckout.status, 200);
  const settledCheckoutBody = await settledCheckout.json();
  assert.equal(settledCheckoutBody.order.status, "paid");
  await executeLocalD1(`UPDATE product_orders SET available_at = datetime('now', '-1 hour') WHERE id = '${settledCheckoutBody.order.id}'`);
  const ownerAfterSettlement = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  assert.equal(ownerAfterSettlement.wallet.balance, 5);
  assert.equal(ownerAfterSettlement.wallet.pendingBalance, 5);
  const forgedRemediation = await executeLocalD1(`
    INSERT INTO fruit_operations
      (id, kind, idempotency_key, actor_email, target_email, amount,
       reference_type, reference_id, related_operation_id, description)
    SELECT 'forged-moderation-${runId}', 'moderation_refund', 'forged-moderation-${runId}',
           seller_email, buyer_email, amount, 'order', id, purchase_operation_id, '绕过下架处置'
    FROM product_orders WHERE id = '${checkoutBody.order.id}'
  `, false);
  assert.match(forgedRemediation, /moderation_remediation_not_allowed/);
  const reporterHeaders = authHeaders("内容举报用户", `moderation-reporter-${runId}@example.com`);
  const report = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: reporterHeaders,
    body: JSON.stringify({ targetType: "product", targetRef: String(productId), reason: "fraud", details: "测试举报：请人工核查作品说明。" }),
  });
  assert.equal(report.status, 201);
  assert.deepEqual(await report.json(), { reported: true });

  const deniedQueue = await fetch(`${baseUrl}/api/admin/moderation`, { headers: reporterHeaders });
  assert.equal(deniedQueue.status, 403);
  assert.deepEqual(await deniedQueue.json(), { error: "admin_forbidden" });

  const adminHeaders = authHeaders("发布审核管理员", adminEmail);
  const queue = await fetch(`${baseUrl}/api/admin/moderation`, { headers: adminHeaders });
  assert.equal(queue.status, 200);
  const queueBody = await queue.json();
  const queuedReport = queueBody.reports.find((item) => item.targetType === "product" && item.targetRef === String(productId));
  assert.equal(typeof queuedReport?.id, "string");
  const hide = await fetch(`${baseUrl}/api/admin/moderation`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ action: "hide_reported_content", targetRef: queuedReport.id }),
  });
  assert.equal(hide.status, 200);
  assert.deepEqual(await hide.json(), {
    updated: true,
    remediation: { refundedPending: 1, compensatedSettled: 1, revokedEntitlements: 2 },
  });

  const publicState = await (await fetch(`${baseUrl}/api/community`, { headers: reporterHeaders })).json();
  assert.equal(publicState.products.some((product) => product.id === productId), false);
  const productPage = await fetch(`${baseUrl}/product/${productId}`, { headers: { accept: "text/html" } });
  assert.equal(productPage.status, 404);
  const ownerAfterHide = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  assert.equal(ownerAfterHide.wallet.status, "review");
  assert.equal(ownerAfterHide.wallet.balance, 5);
  assert.equal(ownerAfterHide.wallet.pendingBalance, 0);
  assert.equal(ownerAfterHide.wallet.balance, ownerAfterHide.wallet.ledgerBalance);
  assert.equal(ownerAfterHide.wallet.pendingBalance, ownerAfterHide.wallet.ledgerPendingBalance);
  const pendingBuyerAfterHide = await (await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders })).json();
  const settledBuyerAfterHide = await (await fetch(`${baseUrl}/api/community`, { headers: settledBuyerHeaders })).json();
  assert.equal(pendingBuyerAfterHide.wallet.balance, 10);
  assert.equal(settledBuyerAfterHide.wallet.balance, 10);
  assert.equal(pendingBuyerAfterHide.wallet.balance, pendingBuyerAfterHide.wallet.ledgerBalance);
  assert.equal(settledBuyerAfterHide.wallet.balance, settledBuyerAfterHide.wallet.ledgerBalance);
  assert.equal(pendingBuyerAfterHide.orders.some((order) => order.id === checkoutBody.order.id && order.status === "refunded"), true);
  assert.equal(settledBuyerAfterHide.orders.some((order) => order.id === settledCheckoutBody.order.id && order.status === "refunded"), true);
  await executeLocalD1(`
    CREATE TABLE moderation_remediation_assertion (id integer);
    CREATE TRIGGER moderation_remediation_assertion_guard BEFORE INSERT ON moderation_remediation_assertion
    WHEN (SELECT COUNT(*) FROM fruit_operations WHERE kind = 'moderation_refund' AND reference_id = '${checkoutBody.order.id}') <> 1
      OR (SELECT COUNT(*) FROM fruit_operations WHERE kind = 'moderation_compensation' AND reference_id = '${settledCheckoutBody.order.id}') <> 1
      OR EXISTS (SELECT 1 FROM product_entitlements WHERE product_id = ${productId} AND status = 'active')
      OR NOT EXISTS (SELECT 1 FROM products WHERE id = ${productId} AND moderation_status = 'hidden')
    BEGIN SELECT RAISE(ABORT, 'moderation_remediation_incomplete'); END;
    INSERT INTO moderation_remediation_assertion (id) VALUES (1);
    DROP TRIGGER moderation_remediation_assertion_guard;
    DROP TABLE moderation_remediation_assertion
  `);
  const reviewQueue = await (await fetch(`${baseUrl}/api/admin/moderation`, { headers: adminHeaders })).json();
  assert.equal(reviewQueue.risks.some((risk) => risk.userEmail === ownerEmail && risk.kind === "moderated_paid_product" && risk.status === "open"), true);
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
  assert.equal(refreshedProject.status, "资料审核");
  assert.equal(refreshedProject.currentTask, "等待造场核对新增资料");

  const deniedAdminQueue = await fetch(`${baseUrl}/api/admin/incubation`, { headers });
  assert.equal(deniedAdminQueue.status, 403);
  assert.deepEqual(await deniedAdminQueue.json(), { error: "admin_forbidden" });

  const adminHeaders = authHeaders("发布审核管理员", adminEmail);
  const adminQueue = await fetch(`${baseUrl}/api/admin/incubation`, { headers: adminHeaders });
  assert.equal(adminQueue.status, 200);
  const adminQueueBody = await adminQueue.json();
  assert.equal(adminQueueBody.projects.some((project) => project.id === incubationBody.project.id && project.status === "资料审核"), true);
  const adminUpdate = await fetch(`${baseUrl}/api/admin/incubation`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({
      projectId: incubationBody.project.id,
      status: "项目评估",
      currentTask: "补充目标用户访谈证据",
      assignedOwner: "造场产品组",
      nextAction: "上传三份匿名访谈摘要",
      waitingReason: "评估需要可复核的目标用户证据",
      progressPercent: 35,
      feedback: "请去除受访者身份信息后再上传。",
    }),
  });
  assert.equal(adminUpdate.status, 200);
  assert.deepEqual(await adminUpdate.json(), { updated: true });

  const updatedIncubation = await (await fetch(`${baseUrl}/api/incubation`, { headers })).json();
  assert.equal(updatedIncubation.project.status, "项目评估");
  assert.equal(updatedIncubation.project.currentTask, "补充目标用户访谈证据");
  assert.equal(updatedIncubation.project.progressPercent, 35);
  assert.equal(updatedIncubation.feedback.some((item) => item.content === "请去除受访者身份信息后再上传。"), true);

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
  const adminPrivateDownload = await fetch(`${baseUrl}${privateBody.url}`, { headers: authHeaders("发布审核管理员", adminEmail) });
  assert.equal(adminPrivateDownload.status, 403);

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
  assert.equal(publishWithCover.status, 400);
  assert.deepEqual(await publishWithCover.json(), { error: "invalid_product_cover" });

  const coverForm = new FormData();
  coverForm.set("file", new File(["private product cover"], "review-cover.png", { type: "image/png" }));
  coverForm.set("visibility", "private");
  coverForm.set("purpose", "product_cover");
  const coverUpload = await fetch(`${baseUrl}/api/uploads`, { method: "POST", headers: ownerHeaders, body: coverForm });
  assert.equal(coverUpload.status, 201);
  const coverBody = await coverUpload.json();
  assert.equal(coverBody.visibility, "private");
  assert.equal(coverBody.purpose, "product_cover");
  assert.equal((await fetch(`${baseUrl}${coverBody.url}`)).status, 403);
  assert.equal((await fetch(`${baseUrl}${coverBody.url}`, { headers: authHeaders("发布审核管理员", adminEmail) })).status, 403);

  const stolenCover = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: otherHeaders,
    body: JSON.stringify({ title: `越权封面作品 ${runId}`, description: "其他用户不能把不属于自己的待审封面挂到商品。", category: "互动体验", coverTheme: "blue", imageUrl: coverBody.url, price: 0 }),
  });
  assert.equal(stolenCover.status, 403);
  assert.deepEqual(await stolenCover.json(), { error: "product_cover_not_owned" });

  const pendingCoverProduct = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: { ...ownerHeaders, "content-type": "application/json" },
    body: JSON.stringify({ title: `待审封面作品 ${runId}`, description: "验证商品封面在平台批准前保持私有，批准后才对公众开放。", category: "互动体验", coverTheme: "blue", imageUrl: coverBody.url, price: 0 }),
  });
  assert.equal(pendingCoverProduct.status, 201);
  const pendingCoverProductBody = await pendingCoverProduct.json();
  assert.equal(pendingCoverProductBody.product.imageUrl, coverBody.url);
  assert.equal(pendingCoverProductBody.product.reviewStatus, "pending_review");
  assert.equal((await fetch(`${baseUrl}${coverBody.url}`)).status, 403);
  assert.equal((await fetch(`${baseUrl}${coverBody.url}`, { headers: authHeaders("发布审核管理员", adminEmail) })).status, 200);
  await reviewProduct(pendingCoverProductBody.product.id);
  const approvedCover = await fetch(`${baseUrl}${coverBody.url}`);
  assert.equal(approvedCover.status, 200);
  assert.equal(approvedCover.headers.get("cache-control"), "no-store");
  assert.equal(await approvedCover.text(), "private product cover");
});

test("generates account notifications and persists read state", async () => {
  const ownerHeaders = authHeaders("通知作品主人", `notify-owner-${runId}@example.com`);
  const publish = await fetch(`${baseUrl}/api/products`, { method: "POST", headers: ownerHeaders, body: JSON.stringify({ title: `通知测试作品 ${runId}`, description: "用于验证真实互动可以进入账号通知中心并保存已读状态。", category: "开发工具", coverTheme: "ink", price: 0 }) });
  assert.equal(publish.status, 201);
  const productId = (await publish.json()).product.id;
  await reviewProduct(productId);
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
