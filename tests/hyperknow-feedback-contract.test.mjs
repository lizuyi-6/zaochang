import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { isAgentWriteAllowed } from "../app/api/_lib/agent-auth.ts";
import { HYPERKNOW_FEEDBACK_MAX_REQUEST_BYTES } from "../app/api/_lib/feedback-limits.ts";
import { hyperknowFeedbackPurgeStatements } from "../app/api/_lib/purge/hyperknow-feedback.ts";
import { isUserKeyCapabilityAllowed } from "../app/api/_lib/user-api-key.ts";

const supportModal = readFileSync(new URL("../hyperknow-spa/src/lattice/SupportModal.tsx", import.meta.url), "utf8");
const workerEntry = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
const feedbackMigration = readFileSync(new URL("../drizzle/0041_hk_feedback.sql", import.meta.url), "utf8");
const feedbackRoute = readFileSync(new URL("../app/api/hyperknow/feedback/route.ts", import.meta.url), "utf8");

test("support modal submits feedback to the server and keeps mailto behind an explicit fallback", () => {
  assert.match(supportModal, /fetch\('\/api\/hyperknow\/feedback'/);
  assert.match(supportModal, /onClick=\{\(\) => openFeedbackMail\(text, heading\)\}/);
  assert.match(supportModal, /暂时无法确认团队邮件通知状态/);
  assert.doesNotMatch(supportModal, /window\.location\.href\s*=\s*[`'\"]mailto:/);
});

test("feedback payload cap is enforced inside the route; the Worker entry keeps its single global body gate", () => {
  assert.equal(HYPERKNOW_FEEDBACK_MAX_REQUEST_BYTES, 32 * 1024);
  assert.match(feedbackRoute, /byteLength > HYPERKNOW_FEEDBACK_MAX_REQUEST_BYTES\) \{\s*return Response\.json\(\{ error: "feedback_payload_too_large" \}, \{ status: 413 \}\);/);
  // 合并决策(2026-10-30):不在 worker 入口为单个会员路由复刻 vinext 路径归一化——全局 11 MiB 闸不变。
  assert.doesNotMatch(workerEntry, /feedback/i);
});

test("hyperknow feedback purge deletes rows at 180 days and retains newer feedback", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      CREATE TABLE hk_feedback (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      INSERT INTO hk_feedback (id, created_at) VALUES
        ('old', datetime('now', '-181 days')),
        ('recent', datetime('now', '-179 days'));
    `);
    const purge = hyperknowFeedbackPurgeStatements({
      prepare(sql) {
        const statement = sqlite.prepare(sql);
        return { run: () => statement.run() };
      },
    })[0];
    assert.equal(purge.label, "hyperknow.feedback");
    assert.equal(purge.statement.run().changes, 1);
    const remaining = sqlite.prepare("SELECT id FROM hk_feedback ORDER BY id").all().map((row) => row.id);
    assert.deepEqual(remaining, ["recent"]);
  } finally {
    sqlite.close();
  }
});

test("feedback migration creates the constrained table and chains to the previous snapshot", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("PRAGMA foreign_keys = ON; CREATE TABLE members (email TEXT PRIMARY KEY);");
    sqlite.exec(feedbackMigration);
    sqlite.prepare("INSERT INTO members (email) VALUES (?)").run("member@example.com");
    sqlite.prepare("INSERT INTO hk_feedback (id, user_email, message) VALUES (?, ?, ?)").run("fb-1", "member@example.com", "hello");
    assert.equal(sqlite.prepare("SELECT context_json FROM hk_feedback WHERE id = 'fb-1'").get().context_json, "{}");
    assert.throws(
      () => sqlite.prepare("INSERT INTO hk_feedback (id, user_email, message, notify_status) VALUES (?, ?, ?, ?)").run("fb-2", "member@example.com", "hello", "pending"),
      /CHECK constraint failed/,
    );
    assert.throws(
      () => sqlite.prepare("INSERT INTO hk_feedback (id, user_email, message) VALUES (?, ?, ?)").run("fb-3", "missing@example.com", "hello"),
      /FOREIGN KEY constraint failed/,
    );
  } finally {
    sqlite.close();
  }

  const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  const previous = JSON.parse(readFileSync(new URL("../drizzle/meta/0040_snapshot.json", import.meta.url), "utf8"));
  const current = JSON.parse(readFileSync(new URL("../drizzle/meta/0041_snapshot.json", import.meta.url), "utf8"));
  assert.equal(journal.entries.at(-1).tag, "0041_hk_feedback");
  assert.ok(journal.entries.at(-1).when > journal.entries.at(-2).when);
  assert.equal(current.prevId, previous.id);
  assert.deepEqual(Object.keys(current.tables.hk_feedback.columns), ["id", "user_email", "message", "context_json", "notify_status", "notify_code", "created_at"]);
});

test("feedback routes do not add Agent or personal API-key write capabilities", () => {
  const path = "/api/admin/hk-feedback";
  assert.equal(isAgentWriteAllowed("POST", path), false);
  assert.equal(isUserKeyCapabilityAllowed("POST", path), false);
  assert.equal(isUserKeyCapabilityAllowed("GET", path), false);
});
