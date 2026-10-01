import type { BackendCourse, BackendCourseUnit, BackendCourseLecture, BackendCourseSession } from './backend.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * 生成与详情的同一 unknown 边界。坏结构整棵拒绝,不把残缺课程当成功;
 * 省略的可选子列表归一化为空列表,无效可选元数据丢弃。只复制已知字段。
 */
export function normalizeBackendCourse(value: unknown): BackendCourse | null {
  if (!isRecord(value) || typeof value.courseTitle !== 'string' || !Array.isArray(value.units) || !value.units.length) return null;
  /* 索引签名属性的类型收窄不过语句边界,先用局部别名落定数组类型 */
  const unitList = Array.isArray(value.units) ? value.units : [];
  const units: BackendCourseUnit[] = [];
  for (const unit of unitList) {
    if (!isRecord(unit) || typeof unit.title !== 'string') return null;
    if (unit.lectures != null && !Array.isArray(unit.lectures)) return null;
    const lectureList = Array.isArray(unit.lectures) ? unit.lectures : [];
    const lectures: BackendCourseLecture[] = [];
    for (const lecture of lectureList) {
      if (!isRecord(lecture) || typeof lecture.title !== 'string') return null;
      if (lecture.sessions != null && !Array.isArray(lecture.sessions)) return null;
      const sessionList = Array.isArray(lecture.sessions) ? lecture.sessions : [];
      const sessions: BackendCourseSession[] = [];
      for (const session of sessionList) {
        if (!isRecord(session) || typeof session.title !== 'string') return null;
        sessions.push({
          title: session.title,
          sessionId: optionalString(session.sessionId),
          sessionIndex: optionalNumber(session.sessionIndex),
          sessionTime: optionalNumber(session.sessionTime),
          depthTags: strings(session.depthTags),
        });
      }
      lectures.push({ title: lecture.title, lectureId: optionalString(lecture.lectureId), sessions });
    }
    units.push({ title: unit.title, unitId: optionalString(unit.unitId), lectures });
  }
  return {
    courseTitle: value.courseTitle,
    courseUuid: optionalString(value.courseUuid),
    courseDescription: optionalString(value.courseDescription),
    targetLearner: optionalString(value.targetLearner),
    tags: strings(value.tags),
    units,
  };
}
