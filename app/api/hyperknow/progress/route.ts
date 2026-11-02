import { requireMember } from "../../_lib/access-control";
import { jsonError } from "../../_lib/errors";
import { database } from "../../_lib/community";
import { getCourse } from "../../_lib/hyperknow/store";
import {
  FIRST_TRY_SUMMARY_SQL,
  type FirstTrySummaryRow,
  listCourseLectures,
  masteryLevelFor,
  type LectureProgressStatus,
} from "../../_lib/hyperknow/mastery";

export const dynamic = "force-dynamic";

function key(unitId: string, lectureId: string): string {
  return JSON.stringify([unitId, lectureId]);
}

export async function GET(request: Request) {
  try {
    const member = await requireMember();
    const courseUuid = new URL(request.url).searchParams.get("courseUuid")?.trim() ?? "";
    if (!courseUuid || courseUuid.length > 200) {
      return Response.json({ error: "course_required" }, { status: 400 });
    }

    const course = await getCourse(courseUuid, member.email);
    if (!course) return Response.json({ error: "target_not_found" }, { status: 404 });

    const [progressRows, attemptRows] = await Promise.all([
      database().prepare(`
        SELECT unit_id, lecture_id, status
        FROM hk_lecture_progress
        WHERE member_email = ? AND course_uuid = ?
      `).bind(member.email, courseUuid).all<{ unit_id: string; lecture_id: string; status: "started" | "completed" }>(),
      database().prepare(FIRST_TRY_SUMMARY_SQL).bind(member.email, courseUuid).all<FirstTrySummaryRow>(),
    ]);

    const progressByLecture = new Map(
      (progressRows.results ?? []).map((row) => [key(row.unit_id, row.lecture_id), row.status]),
    );
    const attemptsByLecture = new Map(
      (attemptRows.results ?? []).map((row) => [key(row.unit_id, row.lecture_id), row]),
    );
    const lectures = listCourseLectures(course.course).map(({ unitId, lectureId }) => {
      const rowKey = key(unitId, lectureId);
      const attempts = attemptsByLecture.get(rowKey);
      const attemptCount = Number(attempts?.attempt_count ?? 0);
      const scoreCount = Number(attempts?.score_count ?? 0);
      // 若 start 事件丢失但服务端已收下快测，至少按 started 展示，不把真实作答显示成未开始。
      const status: LectureProgressStatus = progressByLecture.get(rowKey) ?? (attemptCount > 0 ? "started" : "notStarted");
      return {
        unitId,
        lectureId,
        status,
        masteryLevel: masteryLevelFor({ status, attempts: attemptCount, correct: scoreCount }),
        firstTryAccuracy: attemptCount > 0 ? (scoreCount * 100) / attemptCount : null,
        // 字段名保留兼容;现在表示首答得分和,回忆题 partial 计 0.5,可为小数。
        firstTryCorrect: scoreCount,
        firstTryCount: attemptCount,
      };
    });

    return Response.json({ courseUuid, lectures });
  } catch (error) {
    return jsonError(error);
  }
}
