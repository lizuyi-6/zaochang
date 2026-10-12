import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { hostingPurgeStatements } from "../app/api/_lib/purge/hosting.ts";

function createPurgeDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE product_hostings (
      id INTEGER PRIMARY KEY,
      state TEXT NOT NULL,
      desired TEXT NOT NULL,
      site_id TEXT,
      attempts INTEGER NOT NULL,
      lease_expires_at TEXT,
      failure_code TEXT,
      failure_detail TEXT,
      lease_token_hash TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TRIGGER product_hostings_state_guard
    BEFORE UPDATE OF state ON product_hostings
    WHEN OLD.state IS NOT NEW.state AND NOT (
      (OLD.state = 'queued' AND NEW.state IN ('deploying', 'removed', 'failed')) OR
      (OLD.state = 'deploying' AND NEW.state IN ('staged', 'failed')) OR
      (OLD.state = 'staged' AND NEW.state IN ('promoting', 'removing')) OR
      (OLD.state = 'promoting' AND NEW.state IN ('live', 'staged', 'removing')) OR
      (OLD.state = 'live' AND NEW.state = 'removing') OR
      (OLD.state = 'removing' AND NEW.state IN ('removing', 'removed')) OR
      (OLD.state = 'failed' AND NEW.state IN ('removing', 'removed'))
    )
    BEGIN SELECT RAISE(ABORT, 'hosting_invalid_transition'); END;
    CREATE TABLE hosting_upload_tokens (
      token_hash TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      used_at TEXT,
      expires_at TEXT NOT NULL
    );
  `);
  return db;
}

function runPurge(db) {
  for (const { statement } of hostingPurgeStatements(db)) statement.run();
}

test("hosting purge uses legal transitions and keeps expired deploy uncertainty explicit", () => {
  const db = createPurgeDatabase();
  const insert = db.prepare(`
    INSERT INTO product_hostings (id, state, desired, site_id, attempts, lease_expires_at)
    VALUES (?, ?, ?, ?, 6, datetime('now', '-2 hours'))
  `);
  insert.run(1, "queued", "removed", null);
  insert.run(2, "queued", "staged", null);
  insert.run(3, "deploying", "removed", null);
  insert.run(4, "deploying", "staged", null);
  insert.run(5, "promoting", "removed", "site-5");
  insert.run(6, "promoting", "live", "site-6");

  runPurge(db);

  const row = (id) => db.prepare(`SELECT state, desired, failure_code, failure_detail FROM product_hostings WHERE id = ?`).get(id);
  assert.equal(row(1).state, "queued");
  assert.equal(row(2).state, "failed");
  assert.equal(row(2).failure_code, "internal");
  assert.equal(row(3).state, "failed");
  assert.equal(row(3).failure_code, "ambiguous");
  assert.match(row(3).failure_detail, /remote state requires manual reconciliation/);
  assert.equal(row(4).state, "failed");
  assert.equal(row(4).failure_code, "internal");
  assert.equal(row(5).state, "staged");
  assert.equal(row(5).desired, "removed");
  assert.equal(row(5).failure_code, "internal");
  assert.equal(row(6).state, "staged");
  assert.equal(row(6).failure_code, "internal");
});

test("hosting purge deletes only old used or expired upload tokens", () => {
  const db = createPurgeDatabase();
  const insert = db.prepare(`
    INSERT INTO hosting_upload_tokens (token_hash, created_at, used_at, expires_at)
    VALUES (?, datetime('now', ?), ?, datetime('now', ?))
  `);
  insert.run("old-used", "-8 days", "2026-10-01", "+10 days");
  insert.run("old-expired", "-8 days", null, "-7 days");
  insert.run("old-active", "-8 days", null, "+10 days");
  insert.run("recent-used", "-1 day", "2026-10-11", "+10 days");

  runPurge(db);

  const remaining = db.prepare(`SELECT token_hash FROM hosting_upload_tokens ORDER BY token_hash`).all().map((item) => item.token_hash);
  assert.deepEqual(remaining, ["old-active", "recent-used"]);
});
