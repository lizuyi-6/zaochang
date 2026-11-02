import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";
import { database } from "../../../_lib/community";
import {
  FIRST_TRY_SUMMARY_SQL,
  type FirstTrySummaryRow,
  courseHasExactLecture,
  masteryLevelFor,
  type LectureProgressStatus,
} from "../../../_lib/hyperknow/mastery";
import { aggregateSessionSummary, nextLectureInCourse } from "../../../_lib/hyperknow/session-summary";
import { getCourse, getWhiteboardSession } from "../../../_lib/hyperknow/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const member = await requireMember();
    const sessionId = new URL(request.url).searchParams.get("sessionId")?.trim() ?? "";
    if (!sessionId || sessionId.length > 200) {
      return Response.json({ error: "session_required" }, { status: 400 });
    }

    // 所有权条件在查询中执行；他人会话与不存在的会话统一为 404。
    const session = await getWhiteboardSession(sessionId, member.email);
    if (!session) return Response.json({ error: "target_not_found" }, { status: 404 });

    const attemptRows = await database().prepare(`
      SELECT step_id, kind, correct, verdict, rowid AS attempt_order
      FROM hk_check_attempts
      WHERE member_email = ? AND session_id = ?
      ORDER BY rowid ASC
    `).bind(member.email, session.id).all<{
      step_id: string;
      kind: string;
      correct: number;
      verdict: string | null;
      attempt_order: number;
    }>();
    const summary = aggregateSessionSummary(session.plan.steps, attemptRows.results ?? []);

    let courseSummary: {
      status: LectureProgressStatus;
      masteryLevel: ReturnType<typeof masteryLevelFor>;
      nextLecture: ReturnType<typeof nextLectureInCourse>;
    } | undefined;
    if (session.courseUuid && session.unitId && session.lectureId) {
      const course = await getCourse(session.courseUuid, member.email);
      if (course && courseHasExactLecture(course.course, session.unitId, session.lectureId)) {
        const [progress, firstTryRows] = await Promise.all([
          database().prepare(`
            SELECT status FROM hk_lecture_progress
            WHERE member_email = ? AND course_uuid = ? AND unit_id = ? AND lecture_id = ?
          `).bind(member.email, session.courseUuid, session.unitId, session.lectureId)
            .first<{ status: "started" | "completed" }>(),
          database().prepare(FIRST_TRY_SUMMARY_SQL).bind(member.email, session.courseUuid).all<FirstTrySummaryRow>(),
        ]);
        const firstTry = (firstTryRows.results ?? []).find(
          (row) => row.unit_id === session.unitId && row.lecture_id === session.lectureId,
        );
        const attemptCount = Number(firstTry?.attempt_count ?? 0);
        // 首答得分和(recall partial 计 0.5),与课程进度 GET 同口径。
        const correctCount = Number(firstTry?.score_count ?? 0);
        const status: LectureProgressStatus = progress?.status ?? (
          attemptCount > 0 || summary.answeredCount > 0 ? "started" : "notStarted"
        );
        courseSummary = {
          status,
          masteryLevel: masteryLevelFor({ status, attempts: attemptCount, correct: correctCount }),
          nextLecture: nextLectureInCourse(course.course, session.unitId, session.lectureId),
        };
      }
    }

    return Response.json({ sessionId: session.id, ...summary, ...(courseSummary ? { course: courseSummary } : {}) });
  } catch (error) {
    return jsonError(error);
  }
}
