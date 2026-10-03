import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";
import { assertSameOrigin } from "../../../_lib/request-origin";
import { generateLectureImage } from "../../../_lib/hyperknow/image-gen";
import { getCourse } from "../../../_lib/hyperknow/store";
import { getSampleCourse } from "../../../_lib/hyperknow/samples";

export const dynamic = "force-dynamic";

// 白板课堂按需生图端点:
// 严守单节最多 1 图限制、每日配额、ClamAV 扫描 fail-closed、权限校验
export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const originError = assertSameOrigin(request);
    if (originError) return originError;

    const input = (await request.json().catch(() => ({}))) as {
      prompt?: unknown;
      caption?: unknown;
      courseUuid?: unknown;
      unitId?: unknown;
      lectureId?: unknown;
      sessionId?: unknown;
    };

    const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
    if (!prompt) {
      return Response.json({ error: "prompt_required" }, { status: 400 });
    }

    const caption = typeof input.caption === "string" ? input.caption.trim().slice(0, 512) : undefined;
    const courseUuid = typeof input.courseUuid === "string" && input.courseUuid.trim() ? input.courseUuid.trim() : undefined;
    const unitId = typeof input.unitId === "string" && input.unitId.trim() ? input.unitId.trim() : undefined;
    const lectureId = typeof input.lectureId === "string" && input.lectureId.trim() ? input.lectureId.trim() : undefined;
    const sessionId = typeof input.sessionId === "string" && input.sessionId.trim() ? input.sessionId.trim() : undefined;

    // 服务端权限解析
    let scopeKey: string;
    if (courseUuid) {
      const stored = await getCourse(courseUuid, member.email);
      const sample = !stored ? getSampleCourse(courseUuid) : null;
      if (!stored && !sample) {
        return Response.json({ error: "course_not_found_or_forbidden" }, { status: 404 });
      }
      if (!unitId || !lectureId || !sessionId) {
        return Response.json({ error: "course_session_context_required" }, { status: 400 });
      }
      const course = (stored ? stored.course : sample) as Record<string, unknown>;
      const units = Array.isArray(course.units) ? course.units : [];
      const unit = units.find((value) => {
        const item = value as { unitId?: unknown; id?: unknown };
        return String(item.unitId ?? item.id ?? "") === unitId;
      }) as { lectures?: unknown } | undefined;
      const lectures = Array.isArray(unit?.lectures) ? unit.lectures : [];
      const lecture = lectures.find((value) => {
        const item = value as { lectureId?: unknown; id?: unknown };
        return String(item.lectureId ?? item.id ?? "") === lectureId;
      }) as { sessions?: unknown } | undefined;
      const sessions = Array.isArray(lecture?.sessions) ? lecture.sessions : [];
      const session = sessions.find((value) => {
        const item = value as { sessionId?: unknown; id?: unknown };
        return String(item.sessionId ?? item.id ?? "") === sessionId;
      });
      if (!session) {
        return Response.json({ error: "course_session_not_found" }, { status: 404 });
      }
      scopeKey = JSON.stringify(["course", courseUuid, unitId, lectureId, sessionId]);
    } else if (sessionId) {
      scopeKey = JSON.stringify(["legacy-session", sessionId]);
    } else {
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(prompt.slice(0, 512))));
      scopeKey = JSON.stringify(["legacy-prompt", Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")]);
    }

    const result = await generateLectureImage({
      prompt,
      caption,
      userEmail: member.email,
      scopeKey,
      signal: request.signal,
    });

    return Response.json({
      success: true,
      url: result.url,
      caption: result.caption,
      width: result.width,
      height: result.height,
      cached: result.cached,
    });
  } catch (error) {
    console.error("[hyperknow-wb-img-error]", error);
    return jsonError(error);
  }
}
