import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";
import { listCourses } from "../../../_lib/hyperknow/store";

export const dynamic = "force-dynamic";

// 课程市场列表(原 routes/courses.js marketplace/courses 的 1:1 响应形状):
// 本人生成的课程树在前,两条官方样例在后(硬编码内容逐字保留——样例是官方
// 门户的展示位,不是用户数据)。原版把全体用户课程都列出来(store.json 无归属
// 过滤),这里按登录成员隔离——样例照旧全员可见,生成课程只进本人的市场。
export async function GET() {
  try {
    const member = await requireMember();
    const courses = await listCourses(member.email);
    const sampleCourses = [
      {
        marketplaceId: "091d5945-4f34-4bfc-9d3b-c34b76d62ee5",
        courseTitle: "Introduction to Sociology",
        courseDescription: "A comprehensive exploration of fundamental concepts, theories, and research methods in sociology.",
        targetLearner: "Aspiring social scientists and curious learners.",
        ticketVariant: 3,
        unitCount: 5,
        sessionCount: 60,
        subject: "socialScience",
        difficulty: "beginner",
        joinCount: 1205,
      },
      {
        marketplaceId: "c18a2301-3f42-4bfc-9d3b-c34b76d62ea1",
        courseTitle: "Machine Learning Foundations",
        courseDescription: "From intuition and math to real-world code: master active recall through deep learning exercises.",
        targetLearner: "Computer science students and practitioners.",
        ticketVariant: 1,
        unitCount: 4,
        sessionCount: 32,
        subject: "computerScience",
        difficulty: "intermediate",
        joinCount: 3410,
      },
    ];
    return Response.json({
      success: true,
      courses: [...courses.map((stored) => ({ ...stored.course, courseUuid: stored.courseUuid })), ...sampleCourses],
    });
  } catch (error) {
    return jsonError(error);
  }
}
