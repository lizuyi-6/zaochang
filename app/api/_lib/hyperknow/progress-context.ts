import { courseHasExactLecture } from "./mastery";
import { getCourse, type StoredWhiteboardSession } from "./store";

export type SessionCourseContext = {
  courseUuid: string | null;
  unitId: string | null;
  lectureId: string | null;
};

/** 只把会话里登记且能在会员课程树中精确定位的讲次绑定到作答记录。 */
export async function validatedSessionCourseContext(
  session: Pick<StoredWhiteboardSession, "courseUuid" | "unitId" | "lectureId">,
  memberEmail: string,
): Promise<SessionCourseContext> {
  const empty: SessionCourseContext = { courseUuid: null, unitId: null, lectureId: null };
  if (!session.courseUuid || !session.unitId || !session.lectureId) return empty;

  const course = await getCourse(session.courseUuid, memberEmail);
  if (!course || !courseHasExactLecture(course.course, session.unitId, session.lectureId)) return empty;
  return {
    courseUuid: session.courseUuid,
    unitId: session.unitId,
    lectureId: session.lectureId,
  };
}
