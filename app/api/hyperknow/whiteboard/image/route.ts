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

    const caption = typeof input.caption === "string" ? input.caption.trim() : undefined;
    const courseUuid = typeof input.courseUuid === "string" && input.courseUuid.trim() ? input.courseUuid.trim() : undefined;
    const sessionId = typeof input.sessionId === "string" && input.sessionId.trim() ? input.sessionId.trim() : undefined;

    // 服务端权限解析
    if (courseUuid) {
      const stored = await getCourse(courseUuid, member.email);
      const sample = !stored ? getSampleCourse(courseUuid) : null;
      if (!stored && !sample) {
        return Response.json({ error: "course_not_found_or_forbidden" }, { status: 404 });
      }
    }

    const result = await generateLectureImage({
      prompt,
      caption,
      userEmail: member.email,
      sessionId,
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
