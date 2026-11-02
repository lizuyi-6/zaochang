export type LectureProgressStatus = "notStarted" | "started" | "completed";
export type MasteryLevel = "notStarted" | "attempted" | "familiar" | "proficient" | "mastered";

export type CourseLectureRef = { unitId: string; lectureId: string };

// 使用 SQLite rowid 表示真正的插入先后；choice/recall 重答都会留档,掌握度只取每题首答。
export const FIRST_TRY_SUMMARY_SQL = `
  SELECT first.unit_id, first.lecture_id,
         COUNT(*) AS attempt_count,
         SUM(CASE
           WHEN first.kind = 'choice' AND first.correct = 1 THEN 1
           WHEN first.kind = 'recall' AND first.verdict = 'correct' THEN 1
           WHEN first.kind = 'recall' AND first.verdict = 'partial' THEN 0.5
           ELSE 0
         END) AS score_count
  FROM hk_check_attempts AS first
  WHERE first.member_email = ? AND first.course_uuid = ? AND first.kind IN ('choice', 'recall')
    AND first.session_id IS NOT NULL
    AND first.rowid = (
      SELECT MIN(candidate.rowid)
      FROM hk_check_attempts AS candidate
      WHERE candidate.member_email = first.member_email
        AND candidate.session_id = first.session_id
        AND candidate.step_id = first.step_id
        AND candidate.kind = first.kind
    )
  GROUP BY first.unit_id, first.lecture_id
`;

/** FIRST_TRY_SUMMARY_SQL 的结果行;调用方必须用此类型,列名变更才会被 tsc 拦下。 */
export type FirstTrySummaryRow = {
  unit_id: string;
  lecture_id: string;
  attempt_count: number;
  /** 首答得分和:choice 对=1,recall correct=1、partial=0.5,可为小数 */
  score_count: number;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function idOf(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** 从存储课程树中抽取稳定的服务端单元/讲次 ID，不用 SPA 的展示索引。 */
export function listCourseLectures(course: unknown): CourseLectureRef[] {
  const root = record(course);
  if (!root || !Array.isArray(root.units)) return [];
  const result: CourseLectureRef[] = [];
  for (const rawUnit of root.units) {
    const unit = record(rawUnit);
    const unitId = idOf(unit?.unitId) ?? idOf(unit?.id);
    if (!unit || !unitId || !Array.isArray(unit.lectures)) continue;
    for (const rawLecture of unit.lectures) {
      const lecture = record(rawLecture);
      const lectureId = idOf(lecture?.lectureId) ?? idOf(lecture?.id);
      if (lecture && lectureId) result.push({ unitId, lectureId });
    }
  }
  return result;
}

/** 重复 ID 的坏课程树按无法精确定位处理，避免把进度写到不确定的讲次。 */
export function courseHasExactLecture(course: unknown, unitId: string, lectureId: string): boolean {
  let matches = 0;
  for (const item of listCourseLectures(course)) {
    if (item.unitId === unitId && item.lectureId === lectureId) matches += 1;
  }
  return matches === 1;
}

/**
 * 已开始未结课只记“尝试过”；结课后首答正确率 <60% 为熟悉、60–<90% 为熟练，
 * ≥90% 且至少答过两题才算掌握。结课但没有保留中的答题记录仍为“尝试过”。
 */
export function masteryLevelFor(input: {
  status: LectureProgressStatus;
  attempts: number;
  correct: number;
}): MasteryLevel {
  if (input.status === "notStarted") return "notStarted";
  if (input.status === "started") return "attempted";
  if (!Number.isFinite(input.attempts) || input.attempts <= 0) return "attempted";
  const correct = Number.isFinite(input.correct) ? Math.max(0, Math.min(input.correct, input.attempts)) : 0;
  const accuracy = correct / input.attempts;
  if (accuracy < 0.6) return "familiar";
  if (accuracy < 0.9 || input.attempts < 2) return "proficient";
  return "mastered";
}
