import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  courseHasExactLecture,
  FIRST_TRY_SUMMARY_SQL,
  masteryLevelFor,
} from "../app/api/_lib/hyperknow/mastery.ts";
import { hyperknowLearningProgressPurgeStatements } from "../app/api/_lib/purge/hyperknow-learning-progress.ts";
import { purgeRegistry } from "../app/api/_lib/purge/index.ts";

const migrationsDir = new URL("../drizzle/", import.meta.url);

function migratedDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const name of readdirSync(fileURLToPath(migrationsDir)).filter((file) => file.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(name, migrationsDir), "utf8");
    for (const [index, statement] of source.split(/--> statement-breakpoint/g).entries()) {
      if (!statement.trim()) continue;
      try {
        db.exec(statement);
      } catch (error) {
        throw new Error(`${name} statement ${index + 1}: ${error.message}`, { cause: error });
      }
    }
  }
  return db;
}

test("mastery levels use the documented first-try boundaries", () => {
  assert.equal(masteryLevelFor({ status: "notStarted", attempts: 0, correct: 0 }), "notStarted");
  assert.equal(masteryLevelFor({ status: "started", attempts: 0, correct: 0 }), "attempted");
  assert.equal(masteryLevelFor({ status: "completed", attempts: 0, correct: 0 }), "attempted");
  assert.equal(masteryLevelFor({ status: "completed", attempts: 100, correct: 59 }), "familiar");
  assert.equal(masteryLevelFor({ status: "completed", attempts: 100, correct: 60 }), "proficient");
  assert.equal(masteryLevelFor({ status: "completed", attempts: 100, correct: 89 }), "proficient");
  assert.equal(masteryLevelFor({ status: "completed", attempts: 100, correct: 90 }), "mastered");
  assert.equal(masteryLevelFor({ status: "completed", attempts: 2, correct: 2 }), "mastered");
  assert.equal(masteryLevelFor({ status: "completed", attempts: 1, correct: 1 }), "proficient");
  assert.equal(masteryLevelFor({ status: "completed", attempts: 2, correct: 1.19 }), "familiar");
  assert.equal(masteryLevelFor({ status: "completed", attempts: 2, correct: 1.2 }), "proficient");
  assert.equal(masteryLevelFor({ status: "completed", attempts: 2, correct: 1.79 }), "proficient");
  assert.equal(masteryLevelFor({ status: "completed", attempts: 2, correct: 1.8 }), "mastered");
});

test("course lecture IDs must resolve to exactly one node in the stored tree", () => {
  const course = { units: [{ unitId: "unit-1", lectures: [{ lectureId: "lecture-1" }] }] };
  assert.equal(courseHasExactLecture(course, "unit-1", "lecture-1"), true);
  assert.equal(courseHasExactLecture(course, "unit-2", "lecture-1"), false);
  assert.equal(courseHasExactLecture({ units: [
    { unitId: "unit-1", lectures: [{ lectureId: "lecture-1" }] },
    { unitId: "unit-1", lectures: [{ lectureId: "lecture-1" }] },
  ] }, "unit-1", "lecture-1"), false);
});

test("first-try summary scores recall partial as 0.5 and aggregates only the earliest row per session step and kind", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE hk_check_attempts (
      member_email TEXT, session_id TEXT, course_uuid TEXT, unit_id TEXT, lecture_id TEXT,
      step_id TEXT, kind TEXT, correct INTEGER, verdict TEXT
    )`);
    const insert = db.prepare(`INSERT INTO hk_check_attempts
      (member_email, session_id, course_uuid, unit_id, lecture_id, step_id, kind, correct, verdict)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insert.run("member@example.com", "session-1", "course-1", "unit-1", "lecture-1", "q1", "choice", 0, null);
    insert.run("member@example.com", "session-1", "course-1", "unit-1", "lecture-1", "q1", "choice", 1, null);
    insert.run("member@example.com", "session-1", "course-1", "unit-1", "lecture-1", "q2", "choice", 1, null);
    insert.run("member@example.com", "session-1", "course-1", "unit-1", "lecture-1", "recall-partial", "recall", 0, "partial");
    insert.run("member@example.com", "session-1", "course-1", "unit-1", "lecture-1", "recall-partial", "recall", 1, "correct");
    insert.run("member@example.com", "session-1", "course-1", "unit-1", "lecture-1", "recall-incorrect", "recall", 0, "incorrect");
    const total = db.prepare("SELECT COUNT(*) AS count FROM hk_check_attempts").get().count;
    const summary = db.prepare(FIRST_TRY_SUMMARY_SQL).all("member@example.com", "course-1");
    assert.equal(total, 6, "重答继续保留在底表");
    assert.deepEqual(summary.map((row) => ({ unit_id: row.unit_id, lecture_id: row.lecture_id, attempts: row.attempt_count, score: row.score_count })), [
      { unit_id: "unit-1", lecture_id: "lecture-1", attempts: 4, score: 1.5 },
    ]);
  } finally {
    db.close();
  }
});

test("0044 migration applies with constrained progress and answer tables and chained snapshot metadata", () => {
  const db = migratedDb();
  try {
    db.prepare("INSERT INTO members (email, display_name) VALUES (?, ?)").run("progress@example.com", "进度用户");
    const insertProgress = db.prepare(`INSERT INTO hk_lecture_progress
      (member_email, course_uuid, unit_id, lecture_id) VALUES (?, ?, ?, ?)`);
    insertProgress.run("progress@example.com", "course-1", "unit-1", "lecture-1");
    assert.equal(db.prepare("SELECT status FROM hk_lecture_progress").get().status, "started");
    assert.throws(() => insertProgress.run("progress@example.com", "course-1", "unit-1", "lecture-1"), /UNIQUE constraint failed/);
    assert.throws(() => db.prepare(`INSERT INTO hk_lecture_progress
      (member_email, course_uuid, unit_id, lecture_id, status) VALUES (?, ?, ?, ?, ?)`)
      .run("progress@example.com", "course-1", "unit-1", "lecture-2", "finished"), /CHECK constraint failed/);

    const insertAttempt = db.prepare(`INSERT INTO hk_check_attempts
      (id, member_email, session_id, course_uuid, unit_id, lecture_id, step_id, kind, correct, verdict)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertAttempt.run("attempt-1", "progress@example.com", "session-1", "course-1", "unit-1", "lecture-1", "q1", "choice", 0, null);
    insertAttempt.run("attempt-recall", "progress@example.com", "session-1", "course-1", "unit-1", "lecture-1", "q-recall", "recall", 0, "partial");
    assert.throws(() => insertAttempt.run("attempt-2", "progress@example.com", "session-1", "course-1", "unit-1", "lecture-1", "q2", "essay", 0, null), /CHECK constraint failed/);
    assert.throws(() => insertAttempt.run("attempt-3", "progress@example.com", "session-1", "course-1", "unit-1", "lecture-1", "q2", "choice", 2, null), /CHECK constraint failed/);
    assert.throws(() => insertAttempt.run("attempt-4", "progress@example.com", "session-1", "course-1", "unit-1", "lecture-1", "q2", "recall", 0, "unknown"), /CHECK constraint failed/);
    assert.throws(() => insertAttempt.run("attempt-5", "missing@example.com", "session-1", "course-1", "unit-1", "lecture-1", "q2", "choice", 0, null), /FOREIGN KEY constraint failed/);
  } finally {
    db.close();
  }

  const migration = readFileSync(new URL("../drizzle/0044_hk_learning_progress.sql", import.meta.url), "utf8");
  assert.equal(migration.includes("\r"), false, "0044 SQL must use LF line endings");
  const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  const previous = JSON.parse(readFileSync(new URL("../drizzle/meta/0043_snapshot.json", import.meta.url), "utf8"));
  const current = JSON.parse(readFileSync(new URL("../drizzle/meta/0044_snapshot.json", import.meta.url), "utf8"));
  const index = journal.entries.findIndex((entry) => entry.tag === "0044_hk_learning_progress");
  assert.ok(index > 0);
  assert.equal(journal.entries[index - 1].tag, "0043_member_onboarding");
  assert.ok(journal.entries[index].when > journal.entries[index - 1].when);
  assert.equal(current.prevId, previous.id);
  assert.deepEqual(Object.keys(current.tables.hk_whiteboard_sessions.columns), [
    "id", "user_email", "topic", "plan_json", "course_uuid", "unit_id", "lecture_id", "created_at",
  ]);
  assert.deepEqual(Object.keys(current.tables.hk_lecture_progress.columns), [
    "member_email", "course_uuid", "unit_id", "lecture_id", "session_id", "status", "started_at", "completed_at", "updated_at",
  ]);
});

test("check-attempt purge removes rows at 365 days and retains newer answers", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE hk_check_attempts (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      INSERT INTO hk_check_attempts VALUES ('old', datetime('now', '-366 days'));
      INSERT INTO hk_check_attempts VALUES ('recent', datetime('now', '-364 days'));`);
    const purge = hyperknowLearningProgressPurgeStatements({
      prepare(sql) {
        const statement = db.prepare(sql);
        return { run: () => statement.run() };
      },
    })[0];
    assert.equal(purge.label, "hyperknow.check-attempts");
    assert.equal(purge.statement.run().changes, 1);
    assert.deepEqual(db.prepare("SELECT id FROM hk_check_attempts ORDER BY id").all().map((row) => row.id), ["recent"]);
  } finally {
    db.close();
  }
});

test("retention purge registry includes 365-day check-attempt cleanup", () => {
  const entries = purgeRegistry({ prepare: (sql) => ({ sql }) });
  const attempts = entries.find((entry) => entry.label === "hyperknow.check-attempts");
  assert.ok(attempts);
  assert.match(attempts.statement.sql, /DELETE FROM hk_check_attempts WHERE created_at <= datetime\('now', '-365 days'\)/);
});
