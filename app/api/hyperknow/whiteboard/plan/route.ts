import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";
import { assertSameOrigin } from "../../../_lib/request-origin";
import { enforceRateLimit, rateLimitKey } from "../../../_lib/rate-limit";
import { planLecture } from "../../../_lib/hyperknow/agents";
import { HyperknowNotConfiguredError, HyperknowUpstreamError } from "../../../_lib/hyperknow/llm";
import { getCourse, saveWhiteboardSession } from "../../../_lib/hyperknow/store";
import { getSampleCourse } from "../../../_lib/hyperknow/samples";
import { resolveEffectiveLanguage } from "../../../_lib/hyperknow/protocol";

export const dynamic = "force-dynamic";

// 白板讲座规划端点(原 ws/whiteboardWs.js 的无状态化改造,见 HYPERKNOW.md)。
// 严格校验课程归属与权限，锁定 courseUuid/unitId/lectureId/sessionId 上下文，绝不默认第一讲。

const DEFAULT_TOPIC = "Introduction to Learning Concepts";

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const input = (await request.json().catch(() => ({}))) as {
      topic?: unknown;
      courseUuid?: unknown;
      unitId?: unknown;
      lectureId?: unknown;
      sessionId?: unknown;
      language?: unknown;
    };
    const rawTopic = typeof input.topic === "string" ? input.topic.trim().slice(0, 300) : "";
    const courseUuid = typeof input.courseUuid === "string" && input.courseUuid.trim() ? input.courseUuid.trim() : null;
    const unitId = input.unitId ? String(input.unitId).trim() : null;
    const lectureId = input.lectureId ? String(input.lectureId).trim() : null;
    const sessionRefId = input.sessionId ? String(input.sessionId).trim() : null;
    const requestLanguage = typeof input.language === "string" && input.language.trim() ? input.language.trim() : null;

    let resolvedTopic = rawTopic || DEFAULT_TOPIC;
    let courseSavedLanguage: string | null = null;

    // 服务端权限解析与目标小节锁定
    if (courseUuid) {
      const stored = await getCourse(courseUuid, member.email);
      const sample = !stored ? getSampleCourse(courseUuid) : null;
      if (!stored && !sample) {
        return Response.json({ error: "course_not_found_or_forbidden" }, { status: 404 });
      }

      const courseData = (stored ? stored.course : sample) as Record<string, unknown>;
      // 从已保存课程中读取 language 或 brief.language
      const courseBrief = (courseData.brief ?? (courseData as { courseBrief?: unknown }).courseBrief) as { language?: string } | undefined;
      courseSavedLanguage = (typeof courseData.language === "string" ? courseData.language : null) ||
        (courseBrief && typeof courseBrief.language === "string" ? courseBrief.language : null);

      if (Array.isArray(courseData.units)) {
        let foundTopic = "";
        for (const u of courseData.units as Array<{
          unitId?: string;
          id?: string | number;
          lectures?: Array<{
            lectureId?: string;
            id?: string;
            title?: string;
            sessions?: Array<{ sessionId?: string; id?: string; title?: string }>;
          }>;
        }>) {
          if (unitId && String(u.unitId ?? u.id) !== unitId) continue;
          if (Array.isArray(u.lectures)) {
            for (const lec of u.lectures) {
              const matchesLec = !lectureId || lec.lectureId === lectureId || lec.id === lectureId;
              if (matchesLec) {
                if (sessionRefId && Array.isArray(lec.sessions)) {
                  const s = lec.sessions.find((sess) => sess.sessionId === sessionRefId || sess.id === sessionRefId);
                  if (s && s.title) {
                    foundTopic = s.title;
                    break;
                  }
                }
                if (!foundTopic && lec.title) {
                  foundTopic = lec.title;
                }
                if (foundTopic && lectureId) break;
              }
            }
          }
          if (foundTopic && unitId) break;
        }
        if (foundTopic) {
          resolvedTopic = foundTopic;
        }
      }
    }

    await enforceRateLimit(await rateLimitKey("hyperknow-whiteboard", member.email), 20, 60 * 60);

    // 语言优先级: course saved language -> request language -> zh-CN 兜底
    const effectiveLanguage = resolveEffectiveLanguage(courseSavedLanguage, requestLanguage);

    const signal = AbortSignal.timeout(60_000);
    let plan;
    try {
      plan = await planLecture(resolvedTopic, signal, member.displayName, effectiveLanguage);
    } catch (error) {
      if (error instanceof HyperknowNotConfiguredError) {
        return Response.json({ error: error.code }, { status: error.status });
      }
      if (error instanceof HyperknowUpstreamError) {
        return Response.json({ error: error.code }, { status: error.status });
      }
      throw error;
    }

    const sessionId = crypto.randomUUID();
    await saveWhiteboardSession({
      id: sessionId,
      userEmail: member.email,
      topic: resolvedTopic,
      plan,
      language: effectiveLanguage,
    });

    return Response.json({
      session_id: sessionId,
      topic: resolvedTopic,
      course_uuid: courseUuid,
      unit_id: unitId,
      lecture_id: lectureId,
      session_id_ref: sessionRefId,
      language: effectiveLanguage,
      resumed: false,
      status: "active",
      degraded: plan.degraded === true,
      steps: plan.steps,
    });
  } catch (error) {
    return jsonError(error);
  }
}
