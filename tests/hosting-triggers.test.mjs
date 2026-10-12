// 静态托管数据库不变量：只通过 SQLite 和生产迁移验证，不启动 Worker 或 Wrangler。
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const migrationsDir = new URL("../drizzle/", import.meta.url);
let nextProductKey = 0;
let nextUploadKey = 0;
let nextDecisionKey = 0;
let nextTokenKey = 0;

function migrationFiles() {
  return readdirSync(fileURLToPath(migrationsDir))
    .filter((name) => name.endsWith(".sql") && !name.startsWith("_"))
    .sort();
}

function applyMigration(db, name) {
  const source = readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
  for (const [index, statement] of source.split(/--> statement-breakpoint/g).entries()) {
    const sql = statement.trim();
    if (!sql) continue;
    try {
      db.exec(sql);
    } catch (error) {
      throw new Error(`${name} statement ${index + 1}: ${error.message}`, { cause: error });
    }
  }
}

function applyMigrations(db, stopBefore) {
  for (const name of migrationFiles()) {
    if (stopBefore && name >= stopBefore) break;
    applyMigration(db, name);
  }
}

function createDb({ stopBefore } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  applyMigrations(db, stopBefore);
  db.exec("PRAGMA foreign_keys=ON");
  return db;
}

function withDb(run, options) {
  const db = createDb(options);
  try {
    run(db);
  } finally {
    db.close();
  }
}

function addMember(db, email) {
  db.prepare("INSERT INTO members (email, display_name) VALUES (?, ?)").run(email, email.split("@")[0]);
}

function addGrant(db, email = "owner@example.com", maxSites = 20, revokedAt = null) {
  db.prepare(`INSERT INTO hosting_grants (member_email, max_sites, granted_by, note, revoked_at)
    VALUES (?, ?, 'reviewer@example.com', 'hosting test grant', ?)`)
    .run(email, maxSites, revokedAt);
}

function seedMembers(db, { grantOwner = "owner@example.com", maxSites = 20 } = {}) {
  addMember(db, "owner@example.com");
  addMember(db, "other@example.com");
  addMember(db, "reviewer@example.com");
  if (grantOwner) addGrant(db, grantOwner, maxSites);
}

function addProduct(db, { ownerEmail = "owner@example.com", demoUrl = null, title } = {}) {
  const next = ++nextProductKey;
  const result = db.prepare(`INSERT INTO products
    (owner_email, owner_name, title, description, category, demo_url)
    VALUES (?, ?, ?, 'hosting fixture', 'tool', ?)`)
    .run(ownerEmail, ownerEmail.split("@")[0], title ?? `Hosting fixture ${next}`, demoUrl);
  return Number(result.lastInsertRowid);
}

function prepareHostingSubmission(db, productId) {
  db.prepare("UPDATE products SET hosting_revision = hosting_revision + 1 WHERE id = ?").run(productId);
  return plain(db.prepare("SELECT hosting_revision, review_version FROM products WHERE id = ?").get(productId));
}

function addUpload(db, {
  ownerEmail = "owner@example.com",
  mediaType = "application/zip",
  purpose = "hosting_bundle",
  visibility = "private",
  scanStatus = "clean",
  sha256 = "a".repeat(64),
  hyperknowImage = 0,
  cleanupToken = null,
  cleanupExpiresAt = null,
} = {}) {
  const key = `hosting-${++nextUploadKey}.zip`;
  db.prepare(`INSERT INTO uploaded_files
    (key, owner_email, original_name, media_type, byte_size, visibility, purpose, sha256,
     scan_status, hyperknow_image, hyperknow_image_cleanup_token, hyperknow_image_cleanup_expires_at)
    VALUES (?, ?, ?, ?, 128, ?, ?, ?, 'pending', ?, ?, ?)`)
    .run(key, ownerEmail, key, mediaType, visibility, purpose, sha256, hyperknowImage, cleanupToken, cleanupExpiresAt);
  if (scanStatus !== "pending") {
    db.prepare(`UPDATE uploaded_files SET scan_status = ?, scan_engine = 'test-clamav',
      scan_signature = 'test-signature', scanned_at = '2026-10-11T00:00:00Z' WHERE key = ?`)
      .run(scanStatus, key);
  }
  return key;
}

function addHosting(db, {
  productId,
  ownerEmail = "owner@example.com",
  bundleKey,
  bundleSha256 = "a".repeat(64),
  reviewVersion,
  hostingRevision,
} = {}) {
  const product = db.prepare("SELECT review_version, hosting_revision FROM products WHERE id = ?").get(productId);
  const result = db.prepare(`INSERT INTO product_hostings
    (product_id, owner_email, bundle_key, bundle_sha256, bundle_zip_bytes,
     bundle_file_count, bundle_uncompressed_bytes, review_version, hosting_revision)
    VALUES (?, ?, ?, ?, 128, 2, 256, ?, ?)`)
    .run(productId, ownerEmail, bundleKey, bundleSha256,
      reviewVersion ?? product.review_version, hostingRevision ?? product.hosting_revision);
  return Number(result.lastInsertRowid);
}

function addDecision(db, productId, decision = "approved", reviewVersion) {
  const id = `hosting-decision-${++nextDecisionKey}`;
  const currentReviewVersion = reviewVersion ?? db.prepare("SELECT review_version FROM products WHERE id = ?").get(productId).review_version;
  db.prepare(`INSERT INTO product_review_decisions
    (id, product_id, review_version, reviewer_email, decision, note)
    VALUES (?, ?, ?, 'reviewer@example.com', ?, 'reviewed bundle')`)
    .run(id, productId, currentReviewVersion, decision);
  return id;
}

function addUploadToken(db, {
  memberEmail = "owner@example.com",
  productId,
  expiresAt = "2099-01-01T00:00:00Z",
  usedAt = null,
  tokenHash,
} = {}) {
  const hash = tokenHash ?? (++nextTokenKey).toString(16).padStart(64, "0");
  db.prepare(`INSERT INTO hosting_upload_tokens
    (token_hash, member_email, product_id, expires_at, used_at)
    VALUES (?, ?, ?, ?, ?)`)
    .run(hash, memberEmail, productId, expiresAt, usedAt);
  return hash;
}

function expectAbort(run, code) {
  let caught;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `expected SQLite ABORT ${code}`);
  assert.equal(caught.message, code);
}

function plain(row) {
  return row === undefined ? row : { ...row };
}

function makePendingHosting(db, options = {}) {
  const productId = addProduct(db, options);
  const submission = prepareHostingSubmission(db, productId);
  const bundleKey = addUpload(db, options.upload);
  const hostingId = addHosting(db, {
    productId,
    bundleKey,
    ownerEmail: options.hostingOwner ?? options.ownerEmail ?? "owner@example.com",
    bundleSha256: options.bundleSha256,
    reviewVersion: options.reviewVersion ?? submission.review_version,
    hostingRevision: options.hostingRevision ?? submission.hosting_revision,
  });
  return { productId, bundleKey, hostingId };
}

function setState(db, hostingId, state, liveUrl) {
  if (liveUrl === undefined) {
    db.prepare("UPDATE product_hostings SET state = ? WHERE id = ?").run(state, hostingId);
  } else {
    db.prepare("UPDATE product_hostings SET state = ?, live_url = ? WHERE id = ?").run(state, liveUrl, hostingId);
  }
}

function stage(db, hostingId) {
  setState(db, hostingId, "deploying");
  setState(db, hostingId, "staged");
}

function approveAndLive(db, options = {}) {
  const row = makePendingHosting(db, options);
  stage(db, row.hostingId);
  addDecision(db, row.productId);
  setState(db, row.hostingId, "promoting");
  setState(db, row.hostingId, "live", options.liveUrl ?? `https://site-${row.productId}.page.stepcloud.com`);
  return row;
}

function prepareAtState(db, state) {
  const row = makePendingHosting(db);
  if (["deploying", "staged", "promoting", "live", "removing"].includes(state)) {
    setState(db, row.hostingId, "deploying");
  }
  if (["staged", "promoting", "live", "removing"].includes(state)) {
    setState(db, row.hostingId, "staged");
  }
  if (state === "promoting" || state === "live") {
    addDecision(db, row.productId);
    setState(db, row.hostingId, "promoting");
  }
  if (state === "live") {
    setState(db, row.hostingId, "live", `https://site-${row.productId}.page.stepcloud.com`);
  } else if (state === "removing") {
    setState(db, row.hostingId, "removing");
  } else if (state === "failed" || state === "removed") {
    setState(db, row.hostingId, state);
  }
  return row;
}

test("0032 重建保留旧上传行、四个索引和 0026 cleanup 扫描字段", () => {
  withDb((db) => {
    addMember(db, "owner@example.com");
    const key = addUpload(db, {
      mediaType: "image/png",
      purpose: "general",
      hyperknowImage: 1,
      cleanupToken: "cleanup-claim-hash",
      cleanupExpiresAt: "2999-01-01T00:00:00Z",
    });
    const before = db.prepare("SELECT * FROM uploaded_files WHERE key = ?").get(key);
    applyMigration(db, "0032_page_hosting.sql");
    db.exec("PRAGMA foreign_keys=ON");
    const after = db.prepare("SELECT * FROM uploaded_files WHERE key = ?").get(key);
    assert.deepEqual(after, before);

    const indexNames = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'uploaded_files' ORDER BY name")
      .all().map((row) => row.name);
    assert.deepEqual(indexNames, [
      "sqlite_autoindex_uploaded_files_1",
      "uploaded_files_hyperknow_cleanup_idx",
      "uploaded_files_owner_idx",
      "uploaded_files_scan_status_idx",
    ]);

    assert.deepEqual(plain(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'hosting_upload_tokens'").get()), {
      name: "hosting_upload_tokens",
    });
    const tokenIndexNames = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'hosting_upload_tokens' ORDER BY name")
      .all().map((row) => row.name);
    assert.ok(tokenIndexNames.includes("hosting_upload_tokens_member_active_idx"));
    assert.ok(tokenIndexNames.includes("hosting_upload_tokens_expires_idx"));
  }, { stopBefore: "0032_page_hosting.sql" });
});

test("uploaded_files 仍强制 ZIP/private/purpose、pending 起步与不可篡改摘要", () => {
  withDb((db) => {
    seedMembers(db);
    const badRows = [
      { key: "zip-general.zip", media: "application/zip", purpose: "general", visibility: "private" },
      { key: "image-hosting.png", media: "image/png", purpose: "hosting_bundle", visibility: "private" },
      { key: "public-hosting.zip", media: "application/zip", purpose: "hosting_bundle", visibility: "public" },
    ];
    for (const row of badRows) {
      expectAbort(() => db.prepare(`INSERT INTO uploaded_files
        (key, owner_email, original_name, media_type, byte_size, visibility, purpose, sha256)
        VALUES (?, 'owner@example.com', ?, ?, 128, ?, ?, ?)`)
        .run(row.key, row.key, row.media, row.visibility, row.purpose, "b".repeat(64)),
      "uploaded_file_hosting_bundle_invalid");
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM uploaded_files WHERE key = ?").get(row.key).count, 0);
    }

    expectAbort(() => db.prepare(`INSERT INTO uploaded_files
      (key, owner_email, original_name, media_type, byte_size, visibility, purpose, sha256, scan_status)
      VALUES ('not-pending.zip', 'owner@example.com', 'not-pending.zip', 'application/zip', 128,
        'private', 'hosting_bundle', ?, 'clean')`).run("c".repeat(64)),
    "uploaded_file_must_start_pending");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM uploaded_files WHERE key = 'not-pending.zip'").get().count, 0);

    const key = addUpload(db, { scanStatus: "pending" });
    const before = db.prepare("SELECT sha256, scan_status FROM uploaded_files WHERE key = ?").get(key);
    expectAbort(() => db.prepare("UPDATE uploaded_files SET sha256 = ? WHERE key = ?").run("d".repeat(64), key),
      "uploaded_file_scan_state_immutable");
    assert.deepEqual(db.prepare("SELECT sha256, scan_status FROM uploaded_files WHERE key = ?").get(key), before);
  });
});

test("状态机允许契约列出的迁移并保持 promoting→live 的 I3 条件", () => {
  withDb((db) => {
    seedMembers(db);
    const transitions = [
      ["queued", "deploying"], ["queued", "removed"], ["queued", "failed"],
      ["deploying", "staged"], ["deploying", "failed"],
      ["staged", "promoting"], ["staged", "removing"],
      ["promoting", "live"], ["promoting", "staged"], ["promoting", "removing"],
      ["live", "removing"],
      ["removing", "removing"], ["removing", "removed"],
      ["failed", "removing"], ["failed", "removed"],
    ];
    for (const [from, to] of transitions) {
      const row = prepareAtState(db, from);
      if (from === "promoting" && to === "live") {
        setState(db, row.hostingId, to, `https://site-${row.productId}.page.stepcloud.com`);
      } else {
        setState(db, row.hostingId, to);
      }
      assert.equal(db.prepare("SELECT state FROM product_hostings WHERE id = ?").get(row.hostingId).state, to,
        `${from} → ${to}`);
    }
  });
});

test("非法状态迁移 ABORT hosting_invalid_transition 且原行状态不变", () => {
  withDb((db) => {
    seedMembers(db);
    const attempts = [
      { from: "queued", to: "live" },
      { from: "deploying", to: "live" },
      { from: "live", to: "staged" },
      { from: "removed", to: "deploying" },
    ];
    for (const { from, to } of attempts) {
      const row = prepareAtState(db, from);
      const before = db.prepare("SELECT state FROM product_hostings WHERE id = ?").get(row.hostingId).state;
      expectAbort(() => setState(db, row.hostingId, to), "hosting_invalid_transition");
      assert.equal(db.prepare("SELECT state FROM product_hostings WHERE id = ?").get(row.hostingId).state, before,
        `${from} must remain unchanged after attempted ${to}`);
    }
  });
});

test("I1 视图只暴露匹配批准版本的 live URL，并拒绝主机名污染", () => {
  withDb((db) => {
    seedMembers(db);
    const cases = [
      { name: "good", liveUrl: "https://safe-site.page.stepcloud.com" },
      { name: "state-not-live", liveUrl: "https://state-site.page.stepcloud.com" },
      { name: "product-unpublished", liveUrl: "https://status-site.page.stepcloud.com" },
      { name: "product-unapproved", liveUrl: "https://review-site.page.stepcloud.com" },
      { name: "product-version-mismatch", liveUrl: "https://version-site.page.stepcloud.com" },
      { name: "hosting-approved-mismatch", liveUrl: "https://approved-site.page.stepcloud.com" },
      { name: "hosting-revision-mismatch", liveUrl: "https://revision-version-site.page.stepcloud.com" },
      { name: "desired-removed", liveUrl: "https://removal-site.page.stepcloud.com" },
      { name: "empty-url", liveUrl: "" },
      { name: "http-url", liveUrl: "http://safe-site.page.stepcloud.com" },
      { name: "evil-path-prefix", liveUrl: "https://evil.com/.page.stepcloud.com" },
      { name: "evil-suffix", liveUrl: "https://a.b.page.stepcloud.com.evil.com" },
      { name: "userinfo-fragment", liveUrl: "https://x@evil.com#.page.stepcloud.com" },
      { name: "extra-path", liveUrl: "https://safe-site.page.stepcloud.com/path" },
      { name: "query", liveUrl: "https://safe-site.page.stepcloud.com?x=1" },
    ];
    const rows = new Map();
    for (const item of cases) {
      rows.set(item.name, approveAndLive(db, { liveUrl: item.liveUrl }));
    }
    const viewRow = (productId) => db.prepare("SELECT product_id, live_url FROM product_hosted_urls WHERE product_id = ?").get(productId);
    assert.deepEqual(plain(viewRow(rows.get("good").productId)), {
      product_id: rows.get("good").productId,
      live_url: "https://safe-site.page.stepcloud.com",
    });

    setState(db, rows.get("state-not-live").hostingId, "removing");
    // 移除请求一发出(desired=removed)链接必须立刻对外消失,即使远端站点尚未删除、state 仍是 live。
    db.prepare("UPDATE product_hostings SET desired = 'removed' WHERE id = ?").run(rows.get("desired-removed").hostingId);
    db.exec("DROP TRIGGER products_review_state_update_guard");
    db.prepare("UPDATE products SET status = 'pending_review' WHERE id = ?").run(rows.get("product-unpublished").productId);
    db.prepare("UPDATE products SET review_status = 'pending_review' WHERE id = ?").run(rows.get("product-unapproved").productId);
    db.prepare("UPDATE products SET approved_version = 0 WHERE id = ?").run(rows.get("product-version-mismatch").productId);
    db.prepare("UPDATE product_hostings SET approved_version = 0 WHERE id = ?").run(rows.get("hosting-approved-mismatch").hostingId);
    db.exec("DROP TRIGGER product_hostings_bound_columns_immutable");
    db.prepare("UPDATE product_hostings SET hosting_revision = hosting_revision + 1 WHERE id = ?")
      .run(rows.get("hosting-revision-mismatch").hostingId);
    for (const item of cases.filter((entry) => entry.name !== "good")) {
      if (["state-not-live", "product-unpublished", "product-unapproved", "product-version-mismatch",
        "hosting-approved-mismatch", "hosting-revision-mismatch", "desired-removed"].includes(item.name)) {
        assert.equal(viewRow(rows.get(item.name).productId), undefined, `${item.name} must not be exposed`);
      } else {
        db.prepare("UPDATE product_hostings SET live_url = ? WHERE id = ?")
          .run(item.liveUrl, rows.get(item.name).hostingId);
        assert.equal(viewRow(rows.get(item.name).productId), undefined, `${item.name} must not be exposed`);
      }
    }
  });
});

test("I2 批准当前 hosting_revision 的 staged 包、驳回清理，且无托管行保持旧行为", () => {
  withDb((db) => {
    seedMembers(db);
    const good = makePendingHosting(db);
    stage(db, good.hostingId);
    addDecision(db, good.productId);
    assert.deepEqual(plain(db.prepare(`SELECT approved_version, desired, state FROM product_hostings WHERE id = ?`)
      .get(good.hostingId)), { approved_version: 2, desired: "live", state: "staged" });
    const goodProduct = plain(db.prepare("SELECT status, review_status, approved_version, review_version FROM products WHERE id = ?")
      .get(good.productId));
    assert.deepEqual(goodProduct, {
      status: "published", review_status: "approved", approved_version: 2, review_version: 2,
    });

    const rejected = makePendingHosting(db);
    stage(db, rejected.hostingId);
    addDecision(db, rejected.productId, "rejected");
    assert.equal(db.prepare("SELECT desired FROM product_hostings WHERE id = ?").get(rejected.hostingId).desired, "removed");
    assert.equal(db.prepare("SELECT review_status FROM products WHERE id = ?").get(rejected.productId).review_status, "rejected");

    const noHostingProduct = addProduct(db);
    addDecision(db, noHostingProduct);
    assert.deepEqual(plain(db.prepare("SELECT status, review_status, approved_version FROM products WHERE id = ?")
      .get(noHostingProduct)), { status: "published", review_status: "approved", approved_version: 1 });
  });
});

test("I2 queued/deploying/promoting/failed/removing 行不能通过批准且状态保留", () => {
  withDb((db) => {
    seedMembers(db);
    const attempts = ["queued", "deploying", "failed", "promoting", "removing"];
    for (const state of attempts) {
      const row = makePendingHosting(db);
      if (state === "deploying") setState(db, row.hostingId, "deploying");
      if (state === "failed") setState(db, row.hostingId, "failed");
      if (state === "promoting" || state === "removing") {
        stage(db, row.hostingId);
        if (state === "promoting") setState(db, row.hostingId, "promoting");
        if (state === "removing") setState(db, row.hostingId, "removing");
      }
      const before = db.prepare("SELECT status, review_status, review_version FROM products WHERE id = ?").get(row.productId);
      const hostingBefore = db.prepare("SELECT state, desired, approved_version FROM product_hostings WHERE id = ?").get(row.hostingId);
      expectAbort(() => addDecision(db, row.productId), "hosting_not_staged");
      assert.deepEqual(db.prepare("SELECT status, review_status, review_version FROM products WHERE id = ?").get(row.productId), before);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_review_decisions WHERE product_id = ?").get(row.productId).count, 0);
      assert.deepEqual(db.prepare("SELECT state, desired, approved_version FROM product_hostings WHERE id = ?").get(row.hostingId), hostingBefore);
    }
  });
});

test("包已 staged 后编辑标题仍可批准当前包，不需要重新上传", () => {
  withDb((db) => {
    seedMembers(db);
    const row = makePendingHosting(db);
    stage(db, row.hostingId);
    db.prepare("UPDATE products SET title = title || ' revised' WHERE id = ?").run(row.productId);
    assert.deepEqual(plain(db.prepare("SELECT status, review_status, review_version, hosting_revision FROM products WHERE id = ?")
      .get(row.productId)), {
      status: "pending_review", review_status: "pending_review", review_version: 3, hosting_revision: 1,
    });
    assert.deepEqual(plain(db.prepare("SELECT state, review_version, hosting_revision, approved_version, desired FROM product_hostings WHERE id = ?")
      .get(row.hostingId)), {
      state: "staged", review_version: 2, hosting_revision: 1, approved_version: 0, desired: "staged",
    });

    addDecision(db, row.productId);
    assert.deepEqual(plain(db.prepare("SELECT state, review_version, hosting_revision, approved_version, desired FROM product_hostings WHERE id = ?")
      .get(row.hostingId)), {
      state: "staged", review_version: 2, hosting_revision: 1, approved_version: 3, desired: "live",
    });
    assert.deepEqual(plain(db.prepare("SELECT status, review_status, approved_version, review_version FROM products WHERE id = ?")
      .get(row.productId)), {
      status: "published", review_status: "approved", approved_version: 3, review_version: 3,
    });
  });
});

test("live 托管行标题重审后重新出现在视图，hosting_revision 过期的旧 live 行被拒批", () => {
  withDb((db) => {
    seedMembers(db);
    const reapproved = approveAndLive(db);
    db.prepare("UPDATE products SET title = title || ' revised' WHERE id = ?").run(reapproved.productId);
    assert.equal(db.prepare("SELECT product_id FROM product_hosted_urls WHERE product_id = ?").get(reapproved.productId), undefined);
    assert.deepEqual(plain(db.prepare("SELECT state, hosting_revision, approved_version, desired FROM product_hostings WHERE id = ?")
      .get(reapproved.hostingId)), {
      state: "live", hosting_revision: 1, approved_version: 2, desired: "live",
    });
    addDecision(db, reapproved.productId);
    assert.deepEqual(plain(db.prepare("SELECT state, hosting_revision, approved_version, desired FROM product_hostings WHERE id = ?")
      .get(reapproved.hostingId)), {
      state: "live", hosting_revision: 1, approved_version: 3, desired: "live",
    });
    assert.deepEqual(plain(db.prepare("SELECT product_id, live_url FROM product_hosted_urls WHERE product_id = ?")
      .get(reapproved.productId)), {
      product_id: reapproved.productId,
      live_url: `https://site-${reapproved.productId}.page.stepcloud.com`,
    });

    const staleLive = approveAndLive(db);
    db.prepare("UPDATE products SET hosting_revision = hosting_revision + 1 WHERE id = ?").run(staleLive.productId);
    db.prepare("UPDATE product_hostings SET desired = 'removed' WHERE id = ?").run(staleLive.hostingId);
    assert.equal(db.prepare("SELECT product_id FROM product_hosted_urls WHERE product_id = ?").get(staleLive.productId), undefined);
    const productBefore = db.prepare("SELECT status, review_status, review_version, approved_version, hosting_revision FROM products WHERE id = ?")
      .get(staleLive.productId);
    const hostingBefore = db.prepare("SELECT state, desired, hosting_revision, approved_version FROM product_hostings WHERE id = ?")
      .get(staleLive.hostingId);
    expectAbort(() => addDecision(db, staleLive.productId), "hosting_not_staged");
    assert.deepEqual(db.prepare("SELECT status, review_status, review_version, approved_version, hosting_revision FROM products WHERE id = ?")
      .get(staleLive.productId), productBefore);
    assert.deepEqual(db.prepare("SELECT state, desired, hosting_revision, approved_version FROM product_hostings WHERE id = ?")
      .get(staleLive.hostingId), hostingBefore);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_review_decisions WHERE product_id = ?").get(staleLive.productId).count, 1);
  });
});

test("换包推进 hosting_revision 后旧 live 行隐藏，批准只绑定新 staged 行", () => {
  withDb((db) => {
    seedMembers(db);
    const old = approveAndLive(db);
    db.prepare("UPDATE products SET hosting_revision = hosting_revision + 1 WHERE id = ?").run(old.productId);
    db.prepare("UPDATE product_hostings SET desired = 'removed' WHERE id = ?").run(old.hostingId);
    assert.deepEqual(plain(db.prepare("SELECT state, desired, hosting_revision FROM product_hostings WHERE id = ?")
      .get(old.hostingId)), { state: "live", desired: "removed", hosting_revision: 1 });
    assert.equal(db.prepare("SELECT product_id FROM product_hosted_urls WHERE product_id = ?").get(old.productId), undefined);

    const product = plain(db.prepare("SELECT review_version, hosting_revision FROM products WHERE id = ?").get(old.productId));
    const newBundle = addUpload(db);
    const newHostingId = addHosting(db, {
      productId: old.productId,
      bundleKey: newBundle,
      reviewVersion: product.review_version,
      hostingRevision: product.hosting_revision,
    });
    stage(db, newHostingId);
    addDecision(db, old.productId);
    assert.deepEqual(plain(db.prepare("SELECT state, review_version, hosting_revision, approved_version, desired FROM product_hostings WHERE id = ?")
      .get(newHostingId)), {
      state: "staged", review_version: 3, hosting_revision: 2, approved_version: 3, desired: "live",
    });
    assert.deepEqual(plain(db.prepare("SELECT state, desired, hosting_revision FROM product_hostings WHERE id = ?")
      .get(old.hostingId)), { state: "live", desired: "removed", hosting_revision: 1 });
  });
});

test("I3 promoting→live 必须由当前批准、desired=live 且版本一致支持", () => {
  withDb((db) => {
    seedMembers(db);
    const noApproval = makePendingHosting(db);
    stage(db, noApproval.hostingId);
    setState(db, noApproval.hostingId, "promoting");
    expectAbort(() => setState(db, noApproval.hostingId, "live", "https://no-approval.page.stepcloud.com"),
      "hosting_live_requires_approval");
    assert.deepEqual(plain(db.prepare("SELECT state, live_url FROM product_hostings WHERE id = ?").get(noApproval.hostingId)),
      { state: "promoting", live_url: null });

    const productNotApproved = makePendingHosting(db);
    stage(db, productNotApproved.hostingId);
    setState(db, productNotApproved.hostingId, "promoting");
    db.exec("DROP TRIGGER product_hostings_desired_transition_guard");
    db.prepare("UPDATE product_hostings SET approved_version = review_version, desired = 'live' WHERE id = ?")
      .run(productNotApproved.hostingId);
    expectAbort(() => setState(db, productNotApproved.hostingId, "live", "https://pending-product.page.stepcloud.com"),
      "hosting_live_requires_approval");
    assert.equal(db.prepare("SELECT state FROM product_hostings WHERE id = ?").get(productNotApproved.hostingId).state, "promoting");
    assert.deepEqual(plain(db.prepare("SELECT status, review_status, approved_version, review_version FROM products WHERE id = ?")
      .get(productNotApproved.productId)), {
      status: "pending_review", review_status: "pending_review", approved_version: 0, review_version: 2,
    });
    assert.equal(db.prepare("SELECT desired FROM product_hostings WHERE id = ?").get(productNotApproved.hostingId).desired, "live");

    const hostingVersionMismatch = makePendingHosting(db);
    stage(db, hostingVersionMismatch.hostingId);
    addDecision(db, hostingVersionMismatch.productId);
    setState(db, hostingVersionMismatch.hostingId, "promoting");
    db.prepare("UPDATE product_hostings SET approved_version = 0 WHERE id = ?").run(hostingVersionMismatch.hostingId);
    expectAbort(() => setState(db, hostingVersionMismatch.hostingId, "live", "https://wrong-host-version.page.stepcloud.com"),
      "hosting_live_requires_approval");
    assert.equal(db.prepare("SELECT state FROM product_hostings WHERE id = ?").get(hostingVersionMismatch.hostingId).state, "promoting");

    const productVersionMismatch = makePendingHosting(db);
    stage(db, productVersionMismatch.hostingId);
    addDecision(db, productVersionMismatch.productId);
    setState(db, productVersionMismatch.hostingId, "promoting");
    db.exec("DROP TRIGGER products_review_state_update_guard");
    db.prepare("UPDATE products SET review_version = review_version + 1 WHERE id = ?").run(productVersionMismatch.productId);
    expectAbort(() => setState(db, productVersionMismatch.hostingId, "live", "https://wrong-product-version.page.stepcloud.com"),
      "hosting_live_requires_approval");
    assert.equal(db.prepare("SELECT state FROM product_hostings WHERE id = ?").get(productVersionMismatch.hostingId).state, "promoting");

    const hostingRevisionMismatch = makePendingHosting(db);
    stage(db, hostingRevisionMismatch.hostingId);
    addDecision(db, hostingRevisionMismatch.productId);
    setState(db, hostingRevisionMismatch.hostingId, "promoting");
    db.exec("DROP TRIGGER product_hostings_bound_columns_immutable");
    db.prepare("UPDATE product_hostings SET hosting_revision = hosting_revision + 1 WHERE id = ?")
      .run(hostingRevisionMismatch.hostingId);
    expectAbort(() => setState(db, hostingRevisionMismatch.hostingId, "live", "https://wrong-hosting-revision.page.stepcloud.com"),
      "hosting_live_requires_approval");
    assert.deepEqual(plain(db.prepare("SELECT state, live_url, hosting_revision FROM product_hostings WHERE id = ?")
      .get(hostingRevisionMismatch.hostingId)), {
      state: "promoting", live_url: null, hosting_revision: 2,
    });
  });
});

test("I4 授权、撤销、配额、属主、demo_url、审核版本与 bundle 绑定各自拒绝", () => {
  withDb((db) => {
    seedMembers(db, { grantOwner: null });

    const noGrantProduct = addProduct(db, { ownerEmail: "other@example.com" });
    prepareHostingSubmission(db, noGrantProduct);
    const noGrantBundle = addUpload(db, { ownerEmail: "other@example.com" });
    expectAbort(() => addHosting(db, {
      productId: noGrantProduct, ownerEmail: "other@example.com", bundleKey: noGrantBundle,
    }), "hosting_not_granted");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_hostings WHERE product_id = ?").get(noGrantProduct).count, 0);

    addGrant(db, "other@example.com", 20, "2026-10-01T00:00:00Z");
    const revokedProduct = addProduct(db, { ownerEmail: "other@example.com" });
    prepareHostingSubmission(db, revokedProduct);
    const revokedBundle = addUpload(db, { ownerEmail: "other@example.com" });
    expectAbort(() => addHosting(db, {
      productId: revokedProduct, ownerEmail: "other@example.com", bundleKey: revokedBundle,
    }), "hosting_not_granted");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_hostings WHERE product_id = ?").get(revokedProduct).count, 0);

    addGrant(db, "owner@example.com", 1);
    const quotaFirst = makePendingHosting(db);
    const quotaSecondProduct = addProduct(db);
    prepareHostingSubmission(db, quotaSecondProduct);
    const quotaSecondBundle = addUpload(db);
    expectAbort(() => addHosting(db, { productId: quotaSecondProduct, bundleKey: quotaSecondBundle }), "hosting_quota_exceeded");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_hostings WHERE product_id = ?").get(quotaSecondProduct).count, 0);
    db.prepare("UPDATE product_hostings SET desired = 'removed' WHERE id = ?").run(quotaFirst.hostingId);
    const afterRemoval = addHosting(db, { productId: quotaSecondProduct, bundleKey: quotaSecondBundle });
    assert.equal(db.prepare("SELECT desired FROM product_hostings WHERE id = ?").get(afterRemoval).desired, "staged");
    db.prepare("UPDATE hosting_grants SET max_sites = 20 WHERE member_email = 'owner@example.com'").run();

    db.prepare("UPDATE hosting_grants SET max_sites = 20, revoked_at = NULL WHERE member_email = 'other@example.com'").run();
    const ownerMismatchProduct = addProduct(db);
    prepareHostingSubmission(db, ownerMismatchProduct);
    const otherOwnedBundle = addUpload(db, { ownerEmail: "other@example.com" });
    expectAbort(() => addHosting(db, {
      productId: ownerMismatchProduct, ownerEmail: "other@example.com", bundleKey: otherOwnedBundle,
    }), "hosting_owner_mismatch");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_hostings WHERE product_id = ?").get(ownerMismatchProduct).count, 0);

    const demoProduct = addProduct(db, { demoUrl: "https://demo.example.com" });
    prepareHostingSubmission(db, demoProduct);
    const demoBundle = addUpload(db);
    expectAbort(() => addHosting(db, { productId: demoProduct, bundleKey: demoBundle }), "hosting_demo_url_conflict");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_hostings WHERE product_id = ?").get(demoProduct).count, 0);

    const unscannedProduct = addProduct(db);
    prepareHostingSubmission(db, unscannedProduct);
    const unscannedBundle = addUpload(db, { scanStatus: "pending" });
    expectAbort(() => addHosting(db, { productId: unscannedProduct, bundleKey: unscannedBundle }), "hosting_bundle_invalid");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_hostings WHERE product_id = ?").get(unscannedProduct).count, 0);

    const wrongPurposeProduct = addProduct(db);
    prepareHostingSubmission(db, wrongPurposeProduct);
    const wrongPurposeBundle = addUpload(db, { mediaType: "application/octet-stream", purpose: "general" });
    expectAbort(() => addHosting(db, { productId: wrongPurposeProduct, bundleKey: wrongPurposeBundle }), "hosting_bundle_invalid");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_hostings WHERE product_id = ?").get(wrongPurposeProduct).count, 0);

    const wrongBundleOwnerProduct = addProduct(db);
    prepareHostingSubmission(db, wrongBundleOwnerProduct);
    const wrongOwnerBundle = addUpload(db, { ownerEmail: "other@example.com" });
    expectAbort(() => addHosting(db, { productId: wrongBundleOwnerProduct, bundleKey: wrongOwnerBundle }), "hosting_bundle_invalid");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_hostings WHERE product_id = ?").get(wrongBundleOwnerProduct).count, 0);

    const wrongShaProduct = addProduct(db);
    prepareHostingSubmission(db, wrongShaProduct);
    const correctShaBundle = addUpload(db);
    expectAbort(() => addHosting(db, {
      productId: wrongShaProduct, bundleKey: correctShaBundle, bundleSha256: "f".repeat(64),
    }), "hosting_bundle_invalid");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_hostings WHERE product_id = ?").get(wrongShaProduct).count, 0);

    const wrongReviewProduct = addProduct(db);
    prepareHostingSubmission(db, wrongReviewProduct);
    const wrongReviewBundle = addUpload(db);
    expectAbort(() => addHosting(db, { productId: wrongReviewProduct, bundleKey: wrongReviewBundle, reviewVersion: 3 }),
      "hosting_review_version_mismatch");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_hostings WHERE product_id = ?").get(wrongReviewProduct).count, 0);

    const wrongRevisionProduct = addProduct(db);
    prepareHostingSubmission(db, wrongRevisionProduct);
    const wrongRevisionBundle = addUpload(db);
    expectAbort(() => addHosting(db, {
      productId: wrongRevisionProduct, bundleKey: wrongRevisionBundle, hostingRevision: 2,
    }), "hosting_revision_mismatch");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_hostings WHERE product_id = ?").get(wrongRevisionProduct).count, 0);

    const approvedProduct = addProduct(db);
    prepareHostingSubmission(db, approvedProduct);
    addDecision(db, approvedProduct);
    const approvedBundle = addUpload(db);
    expectAbort(() => addHosting(db, { productId: approvedProduct, bundleKey: approvedBundle }), "hosting_product_not_pending");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_hostings WHERE product_id = ?").get(approvedProduct).count, 0);
  });
});

test("上传令牌拒绝无授权、属主不符、demo_url 冲突、第 4 枚未用令牌和非法哈希", () => {
  withDb((db) => {
    seedMembers(db);

    const noGrantProduct = addProduct(db, { ownerEmail: "other@example.com" });
    expectAbort(() => addUploadToken(db, { memberEmail: "other@example.com", productId: noGrantProduct }), "hosting_not_granted");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM hosting_upload_tokens WHERE product_id = ?").get(noGrantProduct).count, 0);

    addGrant(db, "other@example.com");
    const ownerProduct = addProduct(db);
    expectAbort(() => addUploadToken(db, { memberEmail: "other@example.com", productId: ownerProduct }), "hosting_owner_mismatch");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM hosting_upload_tokens WHERE product_id = ?").get(ownerProduct).count, 0);

    const demoProduct = addProduct(db, { demoUrl: "https://demo.example.com" });
    expectAbort(() => addUploadToken(db, { productId: demoProduct }), "hosting_demo_url_conflict");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM hosting_upload_tokens WHERE product_id = ?").get(demoProduct).count, 0);

    const tokenProduct = addProduct(db);
    addUploadToken(db, { productId: tokenProduct, expiresAt: "2000-01-01T00:00:00Z" });
    const activeTokens = [];
    for (let index = 0; index < 3; index += 1) {
      activeTokens.push(addUploadToken(db, { productId: tokenProduct }));
    }
    expectAbort(() => addUploadToken(db, { productId: tokenProduct }), "hosting_token_limit");
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM hosting_upload_tokens
      WHERE member_email = 'owner@example.com' AND used_at IS NULL
        AND julianday(expires_at) > julianday('now')`).get().count, 3);
    db.prepare("UPDATE hosting_upload_tokens SET used_at = '2026-10-11T00:00:00Z' WHERE token_hash = ?")
      .run(activeTokens[0]);
    const replacementToken = addUploadToken(db, { productId: tokenProduct });
    assert.equal(db.prepare("SELECT used_at FROM hosting_upload_tokens WHERE token_hash = ?").get(activeTokens[0]).used_at,
      "2026-10-11T00:00:00Z");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM hosting_upload_tokens WHERE member_email = 'owner@example.com' AND used_at IS NULL AND julianday(expires_at) > julianday('now')").get().count, 3);
    assert.equal(db.prepare("SELECT used_at FROM hosting_upload_tokens WHERE token_hash = ?").get(replacementToken).used_at, null);

    const hashProduct = addProduct(db, { ownerEmail: "other@example.com" });
    expectAbort(() => addUploadToken(db, {
      memberEmail: "other@example.com", productId: hashProduct, tokenHash: "G".repeat(64),
    }),
      "CHECK constraint failed: hosting_upload_tokens_token_hash_valid");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM hosting_upload_tokens WHERE token_hash = ?").get("G".repeat(64)).count, 0);
  });
});

test("上传令牌只允许一次性置 used_at，数据库允许消费过期令牌", () => {
  withDb((db) => {
    seedMembers(db);
    const productId = addProduct(db);
    const otherProduct = addProduct(db);
    const tokenHash = addUploadToken(db, {
      productId,
      expiresAt: "2000-01-01T00:00:00Z",
    });
    const before = plain(db.prepare("SELECT * FROM hosting_upload_tokens WHERE token_hash = ?").get(tokenHash));
    const mutations = [
      ["token_hash", "f".repeat(64)],
      ["member_email", "other@example.com"],
      ["product_id", otherProduct],
      ["expires_at", "2099-01-01T00:00:00Z"],
      ["created_at", "2026-10-11T01:02:03Z"],
      ["used_at", null],
    ];
    for (const [column, value] of mutations) {
      expectAbort(() => db.prepare(`UPDATE hosting_upload_tokens SET ${column} = ? WHERE token_hash = ?`)
        .run(value, tokenHash), "hosting_token_immutable");
      assert.deepEqual(plain(db.prepare("SELECT * FROM hosting_upload_tokens WHERE token_hash = ?").get(tokenHash)), before);
    }

    db.prepare("UPDATE hosting_upload_tokens SET used_at = '2026-10-11T00:00:00Z' WHERE token_hash = ?").run(tokenHash);
    const consumed = plain(db.prepare("SELECT * FROM hosting_upload_tokens WHERE token_hash = ?").get(tokenHash));
    assert.equal(consumed.used_at, "2026-10-11T00:00:00Z");
    expectAbort(() => db.prepare("UPDATE hosting_upload_tokens SET used_at = '2026-10-11T00:00:01Z' WHERE token_hash = ?")
      .run(tokenHash), "hosting_token_immutable");
    expectAbort(() => db.prepare("UPDATE hosting_upload_tokens SET expires_at = '2099-01-01T00:00:00Z' WHERE token_hash = ?")
      .run(tokenHash), "hosting_token_immutable");
    assert.deepEqual(plain(db.prepare("SELECT * FROM hosting_upload_tokens WHERE token_hash = ?").get(tokenHash)), consumed);
  });
});

test("hosting_grants 配额 CHECK、唯一有效托管和 desired 迁移均由数据库限制", () => {
  withDb((db) => {
    seedMembers(db);
    expectAbort(() => db.prepare(`INSERT INTO hosting_grants (member_email, max_sites, granted_by)
      VALUES ('other@example.com', 0, 'reviewer@example.com')`).run(), "CHECK constraint failed: hosting_grants_max_sites_valid");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM hosting_grants WHERE member_email = 'other@example.com'").get().count, 0);

    const first = makePendingHosting(db);
    const secondBundle = addUpload(db);
    expectAbort(() => addHosting(db, { productId: first.productId, bundleKey: secondBundle }),
      "UNIQUE constraint failed: product_hostings.product_id");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_hostings WHERE product_id = ?").get(first.productId).count, 1);
    db.prepare("UPDATE product_hostings SET desired = 'removed' WHERE id = ?").run(first.hostingId);
    assert.equal(db.prepare("SELECT desired FROM product_hostings WHERE id = ?").get(first.hostingId).desired, "removed");
    const secondHosting = addHosting(db, { productId: first.productId, bundleKey: secondBundle });
    assert.equal(db.prepare("SELECT desired FROM product_hostings WHERE id = ?").get(secondHosting).desired, "staged");

    const row = makePendingHosting(db);
    expectAbort(() => db.prepare("UPDATE product_hostings SET desired = 'live' WHERE id = ?").run(row.hostingId),
      "hosting_invalid_transition");
    assert.equal(db.prepare("SELECT desired FROM product_hostings WHERE id = ?").get(row.hostingId).desired, "staged");
    db.prepare("UPDATE product_hostings SET desired = 'removed' WHERE id = ?").run(row.hostingId);
    expectAbort(() => db.prepare("UPDATE product_hostings SET desired = 'staged' WHERE id = ?").run(row.hostingId),
      "hosting_invalid_transition");
    assert.equal(db.prepare("SELECT desired FROM product_hostings WHERE id = ?").get(row.hostingId).desired, "removed");

    const immutable = makePendingHosting(db);
    const before = db.prepare("SELECT product_id, owner_email, bundle_key, bundle_sha256, review_version, hosting_revision, created_at FROM product_hostings WHERE id = ?")
      .get(immutable.hostingId);
    const otherProduct = addProduct(db);
    const otherBundle = addUpload(db, { ownerEmail: "other@example.com" });
    const boundMutations = [
      ["product_id", otherProduct],
      ["owner_email", "other@example.com"],
      ["bundle_key", otherBundle],
      ["bundle_sha256", "e".repeat(64)],
      ["review_version", 3],
      ["hosting_revision", 2],
      ["created_at", "2026-10-11T01:02:03Z"],
    ];
    for (const [column, value] of boundMutations) {
      expectAbort(() => db.prepare(`UPDATE product_hostings SET ${column} = ? WHERE id = ?`)
        .run(value, immutable.hostingId), "hosting_bound_columns_immutable");
      assert.deepEqual(db.prepare("SELECT product_id, owner_email, bundle_key, bundle_sha256, review_version, hosting_revision, created_at FROM product_hostings WHERE id = ?")
        .get(immutable.hostingId), before, `${column} remains bound after rejection`);
    }

    const desiredLive = makePendingHosting(db);
    stage(db, desiredLive.hostingId);
    addDecision(db, desiredLive.productId);
    assert.equal(db.prepare("SELECT desired FROM product_hostings WHERE id = ?").get(desiredLive.hostingId).desired, "live");
    expectAbort(() => db.prepare("UPDATE product_hostings SET desired = 'staged' WHERE id = ?").run(desiredLive.hostingId),
      "hosting_invalid_transition");
    assert.equal(db.prepare("SELECT desired FROM product_hostings WHERE id = ?").get(desiredLive.hostingId).desired, "live");
  });
});

test("hosting_revision 推进审核版本，title 回归不变，likes_count 不触发复审", () => {
  withDb((db) => {
    seedMembers(db);
    const hostedProduct = addProduct(db);
    addDecision(db, hostedProduct);
    db.prepare("UPDATE products SET hosting_revision = hosting_revision + 1 WHERE id = ?").run(hostedProduct);
    assert.deepEqual(plain(db.prepare(`SELECT status, review_status, review_version, approved_version,
      reviewed_by, reviewed_at, review_note, hosting_revision FROM products WHERE id = ?`).get(hostedProduct)), {
      status: "pending_review", review_status: "pending_review", review_version: 2, approved_version: 1,
      reviewed_by: null, reviewed_at: null, review_note: "", hosting_revision: 1,
    });

    const titleProduct = addProduct(db);
    addDecision(db, titleProduct);
    db.prepare("UPDATE products SET title = title || ' revised' WHERE id = ?").run(titleProduct);
    assert.deepEqual(plain(db.prepare("SELECT status, review_status, review_version, reviewed_by FROM products WHERE id = ?")
      .get(titleProduct)), { status: "pending_review", review_status: "pending_review", review_version: 2, reviewed_by: null });

    const likesProduct = addProduct(db);
    addDecision(db, likesProduct);
    db.prepare("UPDATE products SET likes_count = 7 WHERE id = ?").run(likesProduct);
    assert.deepEqual(plain(db.prepare("SELECT status, review_status, review_version, approved_version, likes_count FROM products WHERE id = ?")
      .get(likesProduct)), { status: "published", review_status: "approved", review_version: 1, approved_version: 1, likes_count: 7 });
  });
});

test("I6 外链演示产品批准仍被原守卫拒绝且产品仍 pending_review", () => {
  withDb((db) => {
    seedMembers(db);
    const productId = addProduct(db, { demoUrl: "https://demo.example.com" });
    expectAbort(() => addDecision(db, productId), "external_demo_requires_immutable_package");
    assert.deepEqual(plain(db.prepare("SELECT status, review_status, review_version FROM products WHERE id = ?").get(productId)), {
      status: "pending_review", review_status: "pending_review", review_version: 1,
    });
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_review_decisions WHERE product_id = ?").get(productId).count, 0);
  });
});
