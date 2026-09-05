import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";
import { getCourse } from "../../../_lib/hyperknow/store";

export const dynamic = "force-dynamic";

// 课程详情与大纲(原 routes/courses.js course/:uuid 的 1:1 响应形状)。
// 原版无归属校验(store.json 全局可读);这里补上本人归属——越权与不存在
// 统一 404,不泄露存在性。
export async function GET(_request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  try {
    const member = await requireMember();
    const { uuid } = await params;
    const stored = await getCourse(uuid, member.email);
    if (!stored) {
      return Response.json({ success: false, message: "Course not found" }, { status: 404 });
    }
    return Response.json({ success: true, data: { ...stored.course, courseUuid: stored.courseUuid } });
  } catch (error) {
    return jsonError(error);
  }
}
