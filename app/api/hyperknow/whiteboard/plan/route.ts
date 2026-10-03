import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";
import { assertSameOrigin } from "../../../_lib/request-origin";
import { enforceRateLimit, rateLimitKey } from "../../../_lib/rate-limit";
import { planLecture, type LectureCourseContext } from "../../../_lib/hyperknow/agents";
import { getCourse, getCourseTask, saveWhiteboardSession } from "../../../_lib/hyperknow/store";
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
    // 讲课上下文:课程 meta + intake brief + 单元目标 + 讲次在课程中的位置。
    // 讲师不再"看题讲课"——深度按学员档位校准、例子贴背景、开场承接上一讲。
    let lectureContext: LectureCourseContext | undefined;

    // 服务端权限解析与目标小节锁定
    if (courseUuid) {
      const stored = await getCourse(courseUuid, member.email);
      const sample = !stored ? getSampleCourse(courseUuid) : null;
      if (!stored && !sample) {
        return Response.json({ error: "course_not_found_or_forbidden" }, { status: 404 });
      }

      const courseData = (stored ? stored.course : sample) as Record<string, unknown>;
      // 从已保存课程中读取 language 或 brief.language
      let courseBrief = (courseData.brief ?? (courseData as { courseBrief?: unknown }).courseBrief) as
        | Record<string, unknown>
        | undefined;
      courseSavedLanguage = (typeof courseData.language === "string" ? courseData.language : null) ||
        (courseBrief && typeof courseBrief.language === "string" ? courseBrief.language : null);

      if (Array.isArray(courseData.units)) {
        interface FlatLecture {
          unitTitle: string;
          unitObjectives: string[];
          lectureId?: string;
          lectureTitle: string;
          sessions: Array<{ id?: string; title: string }>;
        }
        const flat: FlatLecture[] = [];
        for (const u of courseData.units as Array<Record<string, unknown>>) {
          const unitTitle = typeof u.title === "string" ? u.title : "";
          const unitObjectives = Array.isArray(u.objectives)
            ? u.objectives.filter((o): o is string => typeof o === "string")
            : [];
          for (const lec of (Array.isArray(u.lectures) ? u.lectures : []) as Array<Record<string, unknown>>) {
            flat.push({
              unitTitle,
              unitObjectives,
              lectureId: typeof lec.lectureId === "string" ? lec.lectureId : typeof lec.id === "string" ? lec.id : undefined,
              lectureTitle: typeof lec.title === "string" ? lec.title : "",
              sessions: (Array.isArray(lec.sessions) ? lec.sessions : []).flatMap((s) => {
                const sess = (s ?? {}) as Record<string, unknown>;
                return typeof sess.title === "string"
                  ? [{
                      id: typeof sess.sessionId === "string" ? sess.sessionId : typeof sess.id === "string" ? sess.id : undefined,
                      title: sess.title,
                    }]
                  : [];
              }),
            });
          }
        }

        // 目标讲次定位:session 精确 > lecture;定位到才注入上下文(自由命题课保持原语义)
        let matched = -1;
        let matchedSession: { id?: string; title: string } | undefined;
        if (sessionRefId) {
          for (let i = 0; i < flat.length; i++) {
            const s = flat[i].sessions.find((sess) => sess.id === sessionRefId);
            if (s) {
              matched = i;
              matchedSession = s;
              break;
            }
          }
        }
        if (matched < 0 && lectureId) {
          matched = flat.findIndex((l) => l.lectureId === lectureId);
        }
        if (matched >= 0) {
          const cur = flat[matched];
          resolvedTopic = matchedSession?.title || cur.lectureTitle || resolvedTopic;
          // 老课的 brief 不在课程 JSON 里:从生成任务的 brief_json 兜底
          if (!courseBrief) {
            const task = await getCourseTask(courseUuid, member.email).catch(() => null);
            if (task?.briefJson) {
              try {
                courseBrief = JSON.parse(task.briefJson) as Record<string, unknown>;
              } catch {}
            }
          }
          lectureContext = {
            courseTitle: typeof courseData.courseTitle === "string" ? courseData.courseTitle : undefined,
            courseDescription: typeof courseData.courseDescription === "string" ? courseData.courseDescription : undefined,
            targetLearner: typeof courseData.targetLearner === "string" ? courseData.targetLearner : undefined,
            brief: courseBrief && typeof courseBrief === "object" ? (courseBrief as LectureCourseContext["brief"]) : undefined,
            unitTitle: cur.unitTitle || undefined,
            unitObjectives: cur.unitObjectives.length ? cur.unitObjectives : undefined,
            lectureTitle: cur.lectureTitle || undefined,
            sessionTitles: cur.sessions.map((sess) => sess.title).filter(Boolean),
            prevLectureTitle: matched > 0 ? flat[matched - 1].lectureTitle || undefined : undefined,
            nextLectureTitle: matched < flat.length - 1 ? flat[matched + 1].lectureTitle || undefined : undefined,
            lecturePosition: `${matched + 1}/${flat.length}`,
          };
        } else if (rawTopic) {
          resolvedTopic = rawTopic;
        }
      }
    }

    await enforceRateLimit(await rateLimitKey("hyperknow-whiteboard", member.email), 20, 60 * 60);

    // 语言优先级: course saved language -> request language -> zh-CN 兜底
    const effectiveLanguage = resolveEffectiveLanguage(courseSavedLanguage, requestLanguage);

    // 循证教学 v4 提示词的推理链更长,冷实例实测 92-100s:放宽到 130s,
    // 绝不让路由超时把一次成功的计划掐死在半路(掐死=学员拿到模板降级课)。
    // 注:planLecture 内部对上游/配置故障一律兜底为降级计划,不在路由层再分流
    // (此前的 upstream-error 分支因内部全捕获而永不可达,已删)。
    const signal = AbortSignal.timeout(130_000);
    const plan = await planLecture(resolvedTopic, signal, member.displayName, effectiveLanguage, lectureContext);

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
