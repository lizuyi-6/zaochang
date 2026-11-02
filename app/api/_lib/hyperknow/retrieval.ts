import { listCourseLectures } from "./mastery.ts";

export type CourseReviewItem = {
  question: string;
  answer: string;
  lectureTitle?: string;
};

export type CourseReviewAttemptRow = {
  attempt_rowid: number;
  session_id: string;
  unit_id: string | null;
  lecture_id: string | null;
  step_id: string;
  kind: "choice" | "recall";
  correct: number;
  verdict: string | null;
  created_at: string;
  plan_json: string;
};

export type CourseReviewQuery = { sql: string; bindings: string[] };

// 只选本人、本人课程中且位于当前讲次之前的会话首答。答案正文不在
// hk_check_attempts 中，这里仅联读讲稿计划以恢复题干和标准答案。
const COURSE_REVIEW_ATTEMPTS_SQL = `
  SELECT attempt.rowid AS attempt_rowid,
         attempt.session_id, attempt.unit_id, attempt.lecture_id,
         attempt.step_id, attempt.kind, attempt.correct, attempt.verdict,
         attempt.created_at, session.plan_json
  FROM hk_check_attempts AS attempt
  INNER JOIN hk_whiteboard_sessions AS session
    ON session.id = attempt.session_id
   AND session.user_email = attempt.member_email
   AND session.course_uuid = attempt.course_uuid
   AND session.unit_id = attempt.unit_id
   AND session.lecture_id = attempt.lecture_id
  WHERE attempt.member_email = ?
    AND attempt.course_uuid = ?
    AND attempt.session_id IS NOT NULL
    AND attempt.unit_id IS NOT NULL
    AND attempt.lecture_id IS NOT NULL
    AND (__PRIOR_LECTURES__)
    AND attempt.rowid = (
      SELECT MIN(first.rowid)
      FROM hk_check_attempts AS first
      WHERE first.member_email = attempt.member_email
        AND first.session_id = attempt.session_id
        AND first.step_id = attempt.step_id
        AND first.kind = attempt.kind
    )
    AND (
      (attempt.kind = 'choice' AND attempt.correct = 0)
      OR (attempt.kind = 'recall' AND attempt.verdict IN ('incorrect', 'partial'))
    )
  ORDER BY attempt.created_at DESC, attempt.rowid DESC
`;

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function text(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim().slice(0, limit);
  return result || null;
}

function key(unitId: string, lectureId: string): string {
  return JSON.stringify([unitId, lectureId]);
}

/** 构造只触及当前讲次之前课程节点的查询；首讲、重复 ID 或不存在的讲次不查询。 */
export function buildCourseReviewQuery(
  course: unknown,
  current: { unitId: string; lectureId: string },
  memberEmail: string,
  courseUuid: string,
): CourseReviewQuery | null {
  const lectures = listCourseLectures(course);
  const currentKey = key(current.unitId, current.lectureId);
  const currentIndexes = lectures.flatMap((lecture, index) =>
    key(lecture.unitId, lecture.lectureId) === currentKey ? [index] : [],
  );
  if (currentIndexes.length !== 1 || currentIndexes[0] === 0) return null;
  const prior = lectures.slice(0, currentIndexes[0]);
  const predicate = prior.map(() => "(attempt.unit_id = ? AND attempt.lecture_id = ?)").join(" OR ");
  return {
    sql: COURSE_REVIEW_ATTEMPTS_SQL.replace("__PRIOR_LECTURES__", predicate),
    bindings: [memberEmail, courseUuid, ...prior.flatMap((lecture) => [lecture.unitId, lecture.lectureId])],
  };
}

function titleByLecture(course: unknown): Map<string, string> {
  const result = new Map<string, string>();
  const units = record(course)?.units;
  if (!Array.isArray(units)) return result;
  for (const rawUnit of units) {
    const unit = record(rawUnit);
    const unitId = text(unit?.unitId, 200) ?? text(unit?.id, 200);
    if (!unitId || !Array.isArray(unit?.lectures)) continue;
    for (const rawLecture of unit.lectures) {
      const lecture = record(rawLecture);
      const lectureId = text(lecture?.lectureId, 200) ?? text(lecture?.id, 200);
      const title = text(lecture?.title, 200);
      if (lectureId && title && !result.has(key(unitId, lectureId))) {
        result.set(key(unitId, lectureId), title);
      }
    }
  }
  return result;
}

function reviewAnswer(row: CourseReviewAttemptRow): { question: string; answer: string } | null {
  let plan: RecordValue | null;
  try {
    plan = record(JSON.parse(row.plan_json));
  } catch {
    return null;
  }
  if (!Array.isArray(plan?.steps)) return null;
  const matching = plan.steps.filter((step) => record(step)?.step_id === row.step_id);
  if (matching.length !== 1) return null;
  const action = record(record(matching[0])?.board_action);
  if (!action) return null;
  const question = text(action.question, 800);
  if (!question) return null;

  if (row.kind === "choice") {
    if (row.correct !== 0 || !Array.isArray(action.options)) return null;
    const answerIndex = action.answer;
    if (typeof answerIndex !== "number" || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= action.options.length) {
      return null;
    }
    const answer = text(action.options[answerIndex], 1200);
    return answer ? { question, answer } : null;
  }

  if (row.kind === "recall" && (row.verdict === "incorrect" || row.verdict === "partial")) {
    const answer = text(action.reference_answer, 1200);
    return answer ? { question, answer } : null;
  }
  return null;
}

/** 按课程树顺序筛出当前讲次之前的错题，再按作答时间倒序去重并限制为三题。 */
export function buildCourseReviewItems(
  rows: readonly CourseReviewAttemptRow[],
  course: unknown,
  current: { unitId: string; lectureId: string },
): CourseReviewItem[] {
  const lectures = listCourseLectures(course);
  const currentKey = key(current.unitId, current.lectureId);
  const currentIndexes = lectures.flatMap((lecture, index) =>
    key(lecture.unitId, lecture.lectureId) === currentKey ? [index] : [],
  );
  if (currentIndexes.length !== 1 || currentIndexes[0] === 0) return [];

  const prior = new Set(lectures.slice(0, currentIndexes[0]).map((lecture) => key(lecture.unitId, lecture.lectureId)));
  const titles = titleByLecture(course);
  const orderedRows = [...rows].sort((a, b) =>
    b.created_at.localeCompare(a.created_at) || b.attempt_rowid - a.attempt_rowid,
  );
  const seenQuestions = new Set<string>();
  const result: CourseReviewItem[] = [];
  for (const row of orderedRows) {
    if (!row.unit_id || !row.lecture_id || !prior.has(key(row.unit_id, row.lecture_id))) continue;
    const resolved = reviewAnswer(row);
    if (!resolved) continue;
    const normalizedQuestion = resolved.question.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
    if (!normalizedQuestion || seenQuestions.has(normalizedQuestion)) continue;
    seenQuestions.add(normalizedQuestion);
    result.push({
      ...resolved,
      ...(titles.get(key(row.unit_id, row.lecture_id)) ? { lectureTitle: titles.get(key(row.unit_id, row.lecture_id)) } : {}),
    });
    if (result.length === 3) break;
  }
  return result;
}
