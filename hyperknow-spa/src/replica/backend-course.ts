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
  const units: BackendCourseUnit[] = [];
  for (const unit of value.units) {
    if (!isRecord(unit) || typeof unit.title !== 'string') return null;
    if (unit.lectures != null && !Array.isArray(unit.lectures)) return null;
    const lectures: BackendCourseLecture[] = [];
    for (const lecture of unit.lectures ?? []) {
      if (!isRecord(lecture) || typeof lecture.title !== 'string') return null;
      if (lecture.sessions != null && !Array.isArray(lecture.sessions)) return null;
      const sessions: BackendCourseSession[] = [];
      for (const session of lecture.sessions ?? []) {
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
