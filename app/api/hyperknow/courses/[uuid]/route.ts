import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";
import { getCourse } from "../../../_lib/hyperknow/store";
import { getSampleCourse } from "../../../_lib/hyperknow/samples";

export const dynamic = "force-dynamic";

// 课程详情与大纲(原 routes/courses.js course/:uuid 的 1:1 响应形状)。
// 本人课程查 D1,归属校验不泄露存在性(越权与不存在同形);D1 未命中时按官方
// 示例课兜底——样例全员可见(不落库),点市场卡片进详情不再 404。
export async function GET(_request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  try {
    const member = await requireMember();
    const { uuid } = await params;
    const stored = await getCourse(uuid, member.email);
    if (stored) {
      return Response.json({ success: true, data: { ...stored.course, courseUuid: stored.courseUuid } });
    }
    const sample = getSampleCourse(uuid);
    if (sample) {
      return Response.json({ success: true, data: { ...sample, courseUuid: sample.marketplaceId } });
    }
    return Response.json({ success: false, message: "Course not found" }, { status: 404 });
  } catch (error) {
    return jsonError(error);
  }
}
