import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";
import { database } from "../../../_lib/community";
import { assertSameOrigin } from "../../../_lib/request-origin";
import { enforceRateLimit, rateLimitKey } from "../../../_lib/rate-limit";
import { courseHasExactLecture } from "../../../_lib/hyperknow/mastery";
import { getCourse, getWhiteboardSession } from "../../../_lib/hyperknow/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const originError = assertSameOrigin(request);
    if (originError) return originError;

    const input = await request.json().catch(() => ({})) as Record<string, unknown>;
    const courseUuid = typeof input.courseUuid === "string" ? input.courseUuid.trim() : "";
    const unitId = typeof input.unitId === "string" ? input.unitId.trim() : "";
    const lectureId = typeof input.lectureId === "string" ? input.lectureId.trim() : "";
    const sessionId = input.sessionId === undefined || input.sessionId === null
      ? null
      : typeof input.sessionId === "string" ? input.sessionId.trim() : "";
    const event = input.event;
    if (
      !courseUuid || courseUuid.length > 200 || !unitId || unitId.length > 200 ||
      !lectureId || lectureId.length > 200 ||
      (sessionId !== null && (!sessionId || sessionId.length > 200)) ||
      (event !== "started" && event !== "completed")
    ) {
      return Response.json({ error: "progress_input_invalid" }, { status: 400 });
    }

    await enforceRateLimit(await rateLimitKey("hyperknow-progress-lecture", member.email), 120, 60 * 60);

    const stored = await getCourse(courseUuid, member.email);
    if (!stored || !courseHasExactLecture(stored.course, unitId, lectureId)) {
      return Response.json({ error: "target_not_found" }, { status: 404 });
    }
    if (sessionId) {
      const session = await getWhiteboardSession(sessionId, member.email);
      if (!session || (
        session.courseUuid &&
        (session.courseUuid !== courseUuid || session.unitId !== unitId || session.lectureId !== lectureId)
      )) {
        return Response.json({ error: "target_not_found" }, { status: 404 });
      }
    }

    const status = event;
    await database().prepare(`
      INSERT INTO hk_lecture_progress (
        member_email, course_uuid, unit_id, lecture_id, session_id, status, started_at, completed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP,
        CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END, CURRENT_TIMESTAMP)
      ON CONFLICT(member_email, course_uuid, unit_id, lecture_id) DO UPDATE SET
        session_id = COALESCE(excluded.session_id, hk_lecture_progress.session_id),
        status = CASE
          WHEN hk_lecture_progress.status = 'completed' OR excluded.status = 'completed' THEN 'completed'
          ELSE 'started'
        END,
        completed_at = CASE
          WHEN hk_lecture_progress.completed_at IS NOT NULL THEN hk_lecture_progress.completed_at
          WHEN excluded.status = 'completed' THEN CURRENT_TIMESTAMP
          ELSE NULL
        END,
        updated_at = CURRENT_TIMESTAMP
    `).bind(member.email, courseUuid, unitId, lectureId, sessionId, status, status).run();

    return Response.json({ courseUuid, unitId, lectureId, status: event });
  } catch (error) {
    return jsonError(error);
  }
}
