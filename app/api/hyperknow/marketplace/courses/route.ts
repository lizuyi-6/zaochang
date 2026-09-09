import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";
import { listCourses } from "../../../_lib/hyperknow/store";
import { SAMPLE_COURSES, sampleMarketRow } from "../../../_lib/hyperknow/samples";

export const dynamic = "force-dynamic";

// 课程市场列表(原 routes/courses.js marketplace/courses 的 1:1 响应形状):
// 本人生成的课程树在前,官方示例课在后。样例是官方门户的展示位,不是用户数据;
// 内容是完整中文课程树(见 samples.ts),节数由结构现算,详情路由可按 id 兜底解析。
// 原版把全体用户课程都列出来(store.json 无归属过滤),这里按登录成员隔离——
// 样例照旧全员可见,生成课程只进本人的市场。
export async function GET() {
  try {
    const member = await requireMember();
    const courses = await listCourses(member.email);
    return Response.json({
      success: true,
      courses: [
        ...courses.map((stored) => ({ ...stored.course, courseUuid: stored.courseUuid })),
        ...SAMPLE_COURSES.map(sampleMarketRow),
      ],
    });
  } catch (error) {
    return jsonError(error);
  }
}
