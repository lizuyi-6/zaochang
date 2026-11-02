import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";
import { database } from "../../../_lib/community";
import { assertSameOrigin } from "../../../_lib/request-origin";
import { enforceRateLimit, rateLimitKey } from "../../../_lib/rate-limit";
import { validatedSessionCourseContext } from "../../../_lib/hyperknow/progress-context";
import { getWhiteboardSession } from "../../../_lib/hyperknow/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const originError = assertSameOrigin(request);
    if (originError) return originError;

    const input = await request.json().catch(() => ({})) as Record<string, unknown>;
    const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
    const stepId = typeof input.stepId === "string" ? input.stepId.trim() : "";
    const choice = input.choice;
    if (
      !sessionId || sessionId.length > 200 || !stepId || stepId.length > 200 ||
      typeof choice !== "number" || !Number.isInteger(choice) || choice < 0
    ) {
      return Response.json({ error: "check_input_invalid" }, { status: 400 });
    }

    await enforceRateLimit(await rateLimitKey("hyperknow-progress-check", member.email), 240, 60 * 60);

    const session = await getWhiteboardSession(sessionId, member.email);
    if (!session) return Response.json({ error: "target_not_found" }, { status: 404 });

    const step = session.plan.steps.find((candidate) => candidate.step_id === stepId);
    const action = step?.board_action;
    if (!action || action.type !== "quick_check") {
      return Response.json({ error: "quick_check_not_found" }, { status: 400 });
    }
    const options = action.options;
    const answer = action.answer;
    if (
      !Array.isArray(options) || options.length < 2 || choice >= options.length ||
      typeof answer !== "number" || !Number.isInteger(answer) || answer < 0 || answer >= options.length
    ) {
      return Response.json({ error: "quick_check_invalid" }, { status: 400 });
    }

    // 讲稿计划是判分唯一来源；客户端只提交所选索引，不接收客户端声称的正误。
    const correct = choice === answer ? 1 : 0;
    const { courseUuid, unitId, lectureId } = await validatedSessionCourseContext(session, member.email);

    await database().prepare(`
      INSERT INTO hk_check_attempts (
        id, member_email, session_id, course_uuid, unit_id, lecture_id, step_id, kind, correct, verdict
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'choice', ?, NULL)
    `).bind(
      crypto.randomUUID(),
      member.email,
      session.id,
      courseUuid,
      unitId,
      lectureId,
      stepId,
      correct,
    ).run();

    return Response.json({ recorded: true });
  } catch (error) {
    return jsonError(error);
  }
}
