import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";
import { database } from "../../../_lib/community";
import { assertSameOrigin } from "../../../_lib/request-origin";
import { enforceRateLimit, rateLimitKey } from "../../../_lib/rate-limit";
import { gradeRecallAnswer } from "../../../_lib/hyperknow/agents";
import { validatedSessionCourseContext } from "../../../_lib/hyperknow/progress-context";
import { normalizeRecallCheckAction } from "../../../_lib/hyperknow/prompts";
import { getWhiteboardSession, type StoredWhiteboardSession } from "../../../_lib/hyperknow/store";

export const dynamic = "force-dynamic";

async function recordRecallAttempt(input: {
  memberEmail: string;
  session: StoredWhiteboardSession;
  stepId: string;
  verdict: "correct" | "partial" | "incorrect";
}): Promise<void> {
  try {
    const { courseUuid, unitId, lectureId } = await validatedSessionCourseContext(input.session, input.memberEmail);
    await database().prepare(`
      INSERT INTO hk_check_attempts (
        id, member_email, session_id, course_uuid, unit_id, lecture_id, step_id, kind, correct, verdict
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'recall', ?, ?)
    `).bind(
      crypto.randomUUID(),
      input.memberEmail,
      input.session.id,
      courseUuid,
      unitId,
      lectureId,
      input.stepId,
      input.verdict === "correct" ? 1 : 0,
      input.verdict,
    ).run();
  } catch (error) {
    // 批改反馈优先返回;进度记录失败只留日志,不把用户结果改成请求失败。
    console.error("[hyperknow] recall progress write failed", {
      sessionId: input.session.id,
      stepId: input.stepId,
      error,
    });
  }
}

// 回忆题批改只使用会员本人讲稿里保存的参考答案与评分要点,请求体不接受评分标准。
export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const originError = assertSameOrigin(request);
    if (originError) return originError;

    const raw = await request.json().catch(() => null);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    const input = raw as Record<string, unknown>;
    const allowedKeys = new Set(["sessionId", "stepId", "answer", "language"]);
    if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
    const stepId = typeof input.stepId === "string" ? input.stepId.trim() : "";
    const answer = typeof input.answer === "string" ? input.answer.trim() : "";
    const answerLength = Array.from(answer).length;
    const language = input.language === undefined
      ? undefined
      : typeof input.language === "string"
        && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(input.language.trim())
        ? input.language.trim()
        : null;
    if (
      !sessionId || sessionId.length > 128
      || !stepId || stepId.length > 80
      || answerLength < 1 || answerLength > 1000
      || language === null
    ) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    await enforceRateLimit(await rateLimitKey("hyperknow-grade", member.email), 60, 60 * 60);

    // 越权与不存在的 session 统一 404,且在调用模型前结束。
    const session = await getWhiteboardSession(sessionId, member.email);
    if (!session) return Response.json({ error: "target_not_found" }, { status: 404 });

    const step = session.plan.steps.find((candidate) => candidate.step_id === stepId);
    const action = normalizeRecallCheckAction(step?.board_action, session.plan.language ?? "");
    if (action.type !== "recall_check") {
      return Response.json({ error: "recall_check_required" }, { status: 400 });
    }

    const referenceAnswer = action.reference_answer?.trim() ?? "";
    const rubric = action.rubric ?? [];
    const languageForGrade = language || session.plan.language || "zh-CN";
    const grade = await gradeRecallAnswer(
      {
        question: action.question ?? "",
        referenceAnswer,
        rubric,
        answer,
        language: languageForGrade,
      },
      AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]),
    );

    if (!grade) {
      return Response.json({
        graded: false,
        reason: "grader_unavailable",
        reference_answer: referenceAnswer,
        rubric,
      });
    }
    await recordRecallAttempt({ memberEmail: member.email, session, stepId, verdict: grade.verdict });
    return Response.json({ graded: true, ...grade });
  } catch (error) {
    return jsonError(error);
  }
}
