import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateSessionSummary, nextLectureInCourse } from "../app/api/_lib/hyperknow/session-summary.ts";
import { mergeSessionSummary } from "../hyperknow-spa/src/lattice/whiteboard/sessionSummary.ts";

const steps = [
  { step_id: "choice-1", board_action: { type: "quick_check", question: "Pick A", options: ["A", "B"], answer: 0 } },
  { step_id: "recall-1", board_action: { type: "recall_check", question: "Explain B", reference_answer: "B links the two parts." } },
  { step_id: "choice-2", board_action: { type: "quick_check", question: "Pick C", options: ["C", "D"], answer: 1 } },
];

const attempt = (step_id, kind, values = {}) => ({ step_id, kind, attempt_order: 1, ...values });

test("session summary: all first answers correct", () => {
  const result = aggregateSessionSummary(steps, [
    attempt("choice-1", "choice", { correct: 1 }),
    attempt("recall-1", "recall", { verdict: "correct" }),
    attempt("choice-2", "choice", { correct: 1 }),
  ]);
  assert.deepEqual(result.questions.map((item) => item.result), ["correct", "correct", "correct"]);
  assert.deepEqual(result.questions.map((item) => item.correctAnswer), ["A", "B links the two parts.", "D"]);
  assert.equal(result.questionCount, 3);
  assert.equal(result.answeredCount, 3);
  assert.equal(result.firstTryScore, 3);
  assert.equal(result.maxScore, 3);
});

test("session summary: mixed first answers keep question order and score", () => {
  const result = aggregateSessionSummary(steps, [
    attempt("choice-1", "choice", { correct: 0 }),
    attempt("recall-1", "recall", { verdict: "incorrect" }),
    attempt("choice-2", "choice", { correct: 1 }),
  ]);
  assert.deepEqual(result.questions.map((item) => item.result), ["incorrect", "incorrect", "correct"]);
  assert.equal(result.answeredCount, 3);
  assert.equal(result.firstTryScore, 1);
});

test("session summary: recall partial earns half a point", () => {
  const result = aggregateSessionSummary(steps, [attempt("recall-1", "recall", { verdict: "partial" })]);
  assert.equal(result.questions[1].result, "partial");
  assert.equal(result.answeredCount, 1);
  assert.equal(result.firstTryScore, 0.5);
});

test("session summary: missing attempts are unanswered and score zero", () => {
  const result = aggregateSessionSummary(steps, []);
  assert.deepEqual(result.questions.map((item) => item.result), ["unanswered", "unanswered", "unanswered"]);
  assert.equal(result.answeredCount, 0);
  assert.equal(result.firstTryScore, 0);
});

test("session summary: repeated answers use the smallest insertion rowid", () => {
  const result = aggregateSessionSummary(steps, [
    attempt("choice-1", "choice", { correct: 1, attempt_order: 8 }),
    attempt("choice-1", "choice", { correct: 0, attempt_order: 3 }),
    attempt("recall-1", "recall", { verdict: "correct", attempt_order: 11 }),
    attempt("recall-1", "recall", { verdict: "partial", attempt_order: 2 }),
  ]);
  assert.equal(result.questions[0].result, "incorrect");
  assert.equal(result.questions[1].result, "partial");
  assert.equal(result.firstTryScore, 0.5);
});

test("session summary: a lecture without check questions has an empty score", () => {
  const result = aggregateSessionSummary([
    { step_id: "card-1", board_action: { type: "card", title: "Reading" } },
  ], []);
  assert.deepEqual(result, {
    questions: [],
    questionCount: 0,
    answeredCount: 0,
    firstTryScore: 0,
    maxScore: 0,
  });
});

test("session summary: flatten course order and stop after the last lecture", () => {
  const course = { units: [
    { unitId: "u1", lectures: [{ lectureId: "l1", title: "One" }, { lectureId: "l2", title: "Two" }] },
    { unitId: "u2", lectures: [{ lectureId: "l3", title: "Three" }] },
  ] };
  assert.deepEqual(nextLectureInCourse(course, "u1", "l2"), { unitId: "u2", lectureId: "l3", title: "Three" });
  assert.equal(nextLectureInCourse(course, "u2", "l3"), null);
});

test("session summary merge: local results fill missing persistence and server first try wins conflicts", () => {
  const clientQuestions = [
    { stepId: "choice-1", type: "quick_check", question: "Pick A", correctAnswer: "A" },
    { stepId: "recall-1", type: "recall_check", question: "Explain B", correctAnswer: "B" },
  ];
  const merged = mergeSessionSummary(clientQuestions, { "choice-1": "correct", "recall-1": "partial" }, {
    sessionId: "session-1",
    questions: [
      { ...clientQuestions[0], result: "incorrect" },
      { ...clientQuestions[1], result: "unanswered" },
    ],
    questionCount: 2,
    answeredCount: 1,
    firstTryScore: 0,
    maxScore: 2,
  });
  assert.deepEqual(merged.questions.map((item) => item.result), ["incorrect", "partial"]);
  assert.equal(merged.answeredCount, 2);
  assert.equal(merged.firstTryScore, 0.5);
});

test("session summary merge: client-only lessons use only locally known results", () => {
  const result = mergeSessionSummary([
    { stepId: "choice-1", type: "quick_check", question: "Pick A", correctAnswer: "A" },
    { stepId: "choice-2", type: "quick_check", question: "Pick B", correctAnswer: "B" },
  ], { "choice-1": "correct" });
  assert.deepEqual(result.questions.map((item) => item.result), ["correct", "unanswered"]);
  assert.equal(result.firstTryScore, 1);
  assert.equal(result.maxScore, 2);
});
