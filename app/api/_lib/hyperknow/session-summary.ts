export type SessionCheckType = "quick_check" | "recall_check";
export type SessionCheckResult = "correct" | "partial" | "incorrect" | "unanswered";

export type SessionSummaryQuestion = {
  stepId: string;
  type: SessionCheckType;
  question: string;
  result: SessionCheckResult;
  correctAnswer: string;
};

export type SessionSummaryAggregate = {
  questions: SessionSummaryQuestion[];
  questionCount: number;
  answeredCount: number;
  firstTryScore: number;
  maxScore: number;
};

type CheckAttempt = {
  step_id?: unknown;
  kind?: unknown;
  correct?: unknown;
  verdict?: unknown;
  attempt_order?: unknown;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstAttemptByStep(attempts: readonly CheckAttempt[]): Map<string, CheckAttempt> {
  const first = new Map<string, { attempt: CheckAttempt; order: number }>();
  attempts.forEach((attempt, index) => {
    const stepId = typeof attempt.step_id === "string" ? attempt.step_id : "";
    const kind = attempt.kind;
    if (!stepId || (kind !== "choice" && kind !== "recall")) return;
    const order = typeof attempt.attempt_order === "number" && Number.isFinite(attempt.attempt_order)
      ? attempt.attempt_order
      : index;
    const key = JSON.stringify([stepId, kind]);
    const previous = first.get(key);
    if (!previous || order < previous.order) first.set(key, { attempt, order });
  });
  return new Map([...first].map(([key, value]) => [key, value.attempt]));
}

function resultFor(attempt: CheckAttempt | undefined, type: SessionCheckType): SessionCheckResult {
  if (!attempt) return "unanswered";
  if (type === "quick_check") {
    if (attempt.kind !== "choice") return "unanswered";
    if (attempt.correct === 1) return "correct";
    if (attempt.correct === 0) return "incorrect";
    return "unanswered";
  }
  if (attempt.kind !== "recall") return "unanswered";
  if (attempt.verdict === "correct" || attempt.verdict === "partial" || attempt.verdict === "incorrect") {
    return attempt.verdict;
  }
  return "unanswered";
}

/** 从讲稿与作答行生成结课摘要；同一题型的首答按 SQLite rowid 判定。 */
export function aggregateSessionSummary(
  steps: readonly unknown[],
  attempts: readonly CheckAttempt[],
): SessionSummaryAggregate {
  const firstAttempts = firstAttemptByStep(attempts);
  const questions: SessionSummaryQuestion[] = [];

  for (const rawStep of steps) {
    const step = record(rawStep);
    const stepId = typeof step?.step_id === "string" ? step.step_id : "";
    const action = record(step?.board_action);
    const question = typeof action?.question === "string" ? action.question.trim() : "";
    if (!stepId || !action || !question) continue;

    if (action.type === "quick_check") {
      const options = Array.isArray(action.options) ? action.options : [];
      const answer = action.answer;
      if (
        options.length < 2 || options.some((option) => typeof option !== "string") ||
        typeof answer !== "number" || !Number.isInteger(answer) || answer < 0 || answer >= options.length
      ) continue;
      const attempt = firstAttempts.get(JSON.stringify([stepId, "choice"]));
      questions.push({
        stepId,
        type: "quick_check",
        question,
        result: resultFor(attempt, "quick_check"),
        correctAnswer: options[answer] as string,
      });
    } else if (action.type === "recall_check" && typeof action.reference_answer === "string") {
      const attempt = firstAttempts.get(JSON.stringify([stepId, "recall"]));
      questions.push({
        stepId,
        type: "recall_check",
        question,
        result: resultFor(attempt, "recall_check"),
        correctAnswer: action.reference_answer,
      });
    }
  }

  const answeredCount = questions.filter((item) => item.result !== "unanswered").length;
  const firstTryScore = questions.reduce((score, item) => {
    if (item.result === "correct") return score + 1;
    if (item.result === "partial") return score + 0.5;
    return score;
  }, 0);

  return {
    questions,
    questionCount: questions.length,
    answeredCount,
    firstTryScore,
    maxScore: questions.length,
  };
}

function idOf(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export type NextCourseLecture = { unitId: string; lectureId: string; title: string };

/** 按存储课程树的单元/讲次顺序取下一讲，课程尾讲返回 null。 */
export function nextLectureInCourse(
  course: unknown,
  unitId: string,
  lectureId: string,
): NextCourseLecture | null {
  const root = record(course);
  if (!root || !Array.isArray(root.units)) return null;
  const lectures: NextCourseLecture[] = [];
  for (const rawUnit of root.units) {
    const unit = record(rawUnit);
    const currentUnitId = idOf(unit?.unitId) ?? idOf(unit?.id);
    if (!unit || !currentUnitId || !Array.isArray(unit.lectures)) continue;
    for (const rawLecture of unit.lectures) {
      const lecture = record(rawLecture);
      const currentLectureId = idOf(lecture?.lectureId) ?? idOf(lecture?.id);
      if (!lecture || !currentLectureId) continue;
      lectures.push({
        unitId: currentUnitId,
        lectureId: currentLectureId,
        title: typeof lecture.title === "string" ? lecture.title : currentLectureId,
      });
    }
  }
  const matches = lectures.flatMap((item, index) =>
    item.unitId === unitId && item.lectureId === lectureId ? [index] : [],
  );
  if (matches.length !== 1) return null;
  return lectures[matches[0] + 1] ?? null;
}
