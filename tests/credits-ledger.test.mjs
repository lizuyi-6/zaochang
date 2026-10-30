// 纯 Node SQLite 回归：对空库应用全部迁移，直接执行与后端相同的余额 SQL。
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { hyperknowCreditPurgeStatements } from "../app/api/_lib/purge/hyperknow-credits.ts";

const migrationsDir = new URL("../drizzle/", import.meta.url);

function applyMigrations(db) {
  const names = readdirSync(fileURLToPath(migrationsDir))
    .filter((name) => name.endsWith(".sql") && !name.startsWith("_"))
    .sort();
  for (const name of names) {
    const source = readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
    for (const [index, statement] of source.split(/--> statement-breakpoint/g).entries()) {
      if (!statement.trim()) continue;
      try {
        db.exec(statement);
      } catch (error) {
        throw new Error(`${name} statement ${index + 1}: ${error.message}`, { cause: error });
      }
    }
  }
}

function withDb(run) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  try {
    applyMigrations(db);
    run(db);
  } finally {
    db.close();
  }
}

function addCreditMember(db) {
  db.prepare("INSERT INTO members (email, display_name) VALUES (?, ?)").run("credits@example.com", "积分测试");
  db.prepare("INSERT INTO hk_credits (user_email, balance, reset_date) VALUES (?, 20, '2026-10-30')")
    .run("credits@example.com");
}

function events(db) {
  return db.prepare(`SELECT delta, balance_after AS balanceAfter, reason, ref
    FROM hk_credit_events WHERE user_email = ? ORDER BY rowid`)
    .all("credits@example.com").map((row) => ({ ...row }));
}

test("hk credit events: condition updates write one accurate row, failed deduction writes none, and the ledger reconciles", () => {
  withDb((db) => {
    addCreditMember(db);
    const update = db.prepare(`UPDATE hk_credits
      SET balance = balance - ?, change_reason = ?, change_ref = ?
      WHERE user_email = ? AND balance >= ?`);

    assert.equal(update.run(2, "chat", "conversation-1", "credits@example.com", 2).changes, 1);
    assert.deepEqual(events(db)[0], { delta: -2, balanceAfter: 18, reason: "chat", ref: "conversation-1" });

    assert.equal(update.run(2, "translate", null, "credits@example.com", 2).changes, 1);
    assert.deepEqual(events(db)[1], { delta: -2, balanceAfter: 16, reason: "translate", ref: null });

    // 余额不足时 conditional UPDATE changes=0;余额触发器不执行,流水数保持不变。
    assert.equal(update.run(17, "chat", "conversation-failed", "credits@example.com", 17).changes, 0);
    assert.equal(events(db).length, 2);

    // 两个竞争的建课扣费按 SQLite 写入串行化:首个扣 10,第二个条件不再成立。
    assert.equal(update.run(10, "course", "course-charge-1", "credits@example.com", 10).changes, 1);
    assert.equal(update.run(10, "course", "course-charge-2", "credits@example.com", 10).changes, 0);
    assert.deepEqual(events(db)[2], { delta: -10, balanceAfter: 6, reason: "course", ref: "course-charge-1" });
    assert.equal(events(db).length, 3);

    db.prepare(`UPDATE hk_credits
      SET balance = balance + 10, change_reason = 'refund', change_ref = 'course-charge-1'
      WHERE user_email = ? AND reset_date = '2026-10-30'`).run("credits@example.com");
    assert.deepEqual(events(db)[3], { delta: 10, balanceAfter: 16, reason: "refund", ref: "course-charge-1" });

    db.prepare(`UPDATE hk_credits
      SET balance = 20, reset_date = '2026-10-31', change_reason = 'daily_reset', change_ref = NULL
      WHERE user_email = ?`).run("credits@example.com");
    assert.deepEqual(events(db)[4], { delta: 4, balanceAfter: 20, reason: "daily_reset", ref: null });

    // 用户新增基线 20 + 所有 delta 必须等于当前余额 20。
    const deltaTotal = db.prepare("SELECT sum(delta) AS total FROM hk_credit_events WHERE user_email = ?")
      .get("credits@example.com").total;
    const current = db.prepare("SELECT balance FROM hk_credits WHERE user_email = ?")
      .get("credits@example.com").balance;
    assert.equal(20 + deltaTotal, current);

    assert.throws(
      () => db.prepare("UPDATE hk_credits SET balance = balance + 1 WHERE user_email = ?").run("credits@example.com"),
      /hk_credit_change_reason_required/,
      "balance-changing D1 writes must declare this change's reason",
    );
    db.prepare("UPDATE hk_credits SET change_reason = 'chat' WHERE user_email = ?").run("credits@example.com");
    assert.throws(
      () => db.prepare("UPDATE hk_credits SET balance = balance + 1 WHERE user_email = ?").run("credits@example.com"),
      /hk_credit_change_reason_required/,
      "a reason staged in a separate statement must not label a later balance change",
    );
    assert.throws(
      () => db.prepare("UPDATE hk_credit_events SET delta = 0 WHERE reason = 'chat'").run(),
      /hk_credit_event_immutable/,
    );
    assert.throws(
      () => db.prepare("DELETE FROM hk_credit_events WHERE reason = 'daily_reset'").run(),
      /hk_credit_event_not_expired/,
    );
  });
});

test("hk credit events: the six-hour purge removes only entries older than 90 days", () => {
  withDb((db) => {
    addCreditMember(db);
    db.prepare(`INSERT INTO hk_credit_events
      (id, user_email, delta, balance_after, reason, created_at)
      VALUES ('${"a".repeat(32)}', ?, -2, 18, 'chat', '2000-01-01 00:00:00')`)
      .run("credits@example.com");
    db.prepare(`INSERT INTO hk_credit_events
      (id, user_email, delta, balance_after, reason)
      VALUES ('${"b".repeat(32)}', ?, -2, 18, 'chat')`)
      .run("credits@example.com");

    const statements = hyperknowCreditPurgeStatements(db);
    assert.equal(statements.length, 1);
    assert.equal(statements[0].label, "hyperknow.credit_events");
    statements[0].statement.run();
    assert.deepEqual(
      db.prepare("SELECT id FROM hk_credit_events ORDER BY id").all().map((row) => row.id),
      ["b".repeat(32)],
    );
  });
});

test("hk credit events: migration 0040 is forward-linked to 0039 with a newer journal timestamp", () => {
  const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  const previous = JSON.parse(readFileSync(new URL("../drizzle/meta/0039_snapshot.json", import.meta.url), "utf8"));
  const current = JSON.parse(readFileSync(new URL("../drizzle/meta/0040_snapshot.json", import.meta.url), "utf8"));
  const previewHarness = readFileSync(new URL("../tests/harness/preview.mjs", import.meta.url), "utf8");
  // 按 tag 定位:后续迁移(0041 起)追加在其后,0040 不再是最后一条。
  const position = journal.entries.findIndex((entry) => entry.tag === "0040_hk_credit_events");
  const last = journal.entries[position];
  const before = journal.entries[position - 1];

  assert.equal(last.idx, 40);
  assert.equal(last.tag, "0040_hk_credit_events");
  assert.ok(last.when > before.when);
  assert.equal(current.prevId, previous.id);
  assert.ok(current.id !== previous.id);
  assert.ok(current.tables.hk_credit_events);
  assert.ok(current.tables.hk_credits.columns.change_reason);
  assert.ok(current.tables.hk_credits.columns.change_ref);
  assert.match(previewHarness, /"0040_hk_credit_events\.sql"/, "Worker 预览迁移清单必须包含积分流水迁移");
});
