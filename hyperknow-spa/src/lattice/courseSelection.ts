import type { AppState } from './types';
import type { CourseCard } from './data';
import { homeCourses, marketplaceFeatured, coverForTitle } from './data';
import { buildGeneratedCourse, type GeneratedCourse } from './generate';

type CourseCardSummary = Pick<CourseCard, 'id' | 'title' | 'description' | 'cover'>;
type CourseRoute = 'coursePreview' | 'courseJourney';

export interface OpenCourseCardOptions {
  courseUuid?: string;
  courseJoined?: boolean;
  requiresGeneration?: boolean;
  cardId?: string | null;
  generated?: GeneratedCourse | null;
}

const staticCourseCards = (): CourseCard[] => [...marketplaceFeatured(), ...homeCourses()];

export function findCourseCardById(id: string): CourseCard | undefined {
  return staticCourseCards().find((card) => card.id === id);
}

/**
 * 课程卡切换的唯一入口:显式覆盖所有当前课程字段,不让旧课 UUID、讲次或完成标记串入新卡。
 * 返回 set() 可直接合并的 patch,不读取存储或产生副作用。
 */
export function openCourseCardState(
  state: AppState,
  card: CourseCardSummary,
  options: OpenCourseCardOptions = {},
): Partial<AppState> {
  const uuid = options.courseUuid || undefined;
  const requiresGeneration = !uuid && (options.requiresGeneration ?? card.id !== 'public-speaking');
  const sameCourse = !!uuid && state.activeCourseUuid === uuid;
  const generated =
    options.generated !== undefined
      ? options.generated
      : card.id === 'public-speaking'
        ? null
        : {
            ...buildGeneratedCourse(card.title),
            topic: card.title,
            title: card.title,
            description: card.description,
            cover: card.cover,
          };

  return {
    screen: 'coursePreview',
    generated,
    activeCourseUuid: uuid,
    activeCourseCardId: uuid ? undefined : options.cardId === undefined ? card.id : options.cardId || undefined,
    activeCourseCardNeedsGeneration: requiresGeneration,
    courseJoined: !requiresGeneration && (options.courseJoined ?? (sameCourse && state.courseJoined)),
    lectureDone: false,
    lectureCompletePrompt: false,
    courseLoading: !!uuid,
    courseError: null,
    activeUnitId: undefined,
    activeLectureId: undefined,
    activeSessionId: undefined,
    activeTopic: undefined,
    whiteboardMode: 'lecture',
  };
}

/** 无 UUID 的演示卡只能先进入现有课程创建流程,不加入本地模板课程或打开白板。 */
export function createCourseFromCardPatch(state: AppState): Partial<AppState> {
  return {
    screen: 'create',
    createPrompt: state.generated?.title ?? '',
    generated: null,
    activeCourseUuid: undefined,
    activeCourseCardId: undefined,
    activeCourseCardNeedsGeneration: undefined,
    courseJoined: false,
    lectureDone: false,
    lectureCompletePrompt: false,
    courseLoading: false,
    courseError: null,
    activeUnitId: undefined,
    activeLectureId: undefined,
    activeSessionId: undefined,
    activeTopic: undefined,
    whiteboardMode: 'lecture',
  };
}

const COURSE_COVERS: CourseCard['cover'][] = [
  'sociology', 'bio', 'ml', 'ai', 'history', 'prompt', 'psych', 'sat', 'philo', 'stats',
];

const validCover = (cover: string | null): CourseCard['cover'] | undefined =>
  COURSE_COVERS.find((candidate) => candidate === cover);

export function courseHashForState(route: CourseRoute, state: AppState): string {
  const path = route === 'coursePreview' ? 'preview' : 'journey';
  const uuid = state.activeCourseUuid || state.generated?.courseUuid;
  if (uuid) return `#/course/${path}?uuid=${encodeURIComponent(uuid)}`;

  if (state.activeCourseCardId && state.generated) {
    const query = new URLSearchParams({
      card: state.activeCourseCardId,
      title: state.generated.title,
      description: state.generated.description,
      generate: state.activeCourseCardNeedsGeneration ? '1' : '0',
    });
    if (state.generated.cover) query.set('cover', state.generated.cover);
    return `#/course/${path}?${query.toString()}`;
  }

  return `#/course/${path}`;
}

/** 从课程 hash 恢复卡片快照;URL 中的卡片字段优先于当前页面残留状态。 */
export function courseCardStateFromQuery(state: AppState, query: URLSearchParams): Partial<AppState> | null {
  const id = query.get('card');
  const known = id ? findCourseCardById(id) : undefined;
  const title = query.get('title') || known?.title;
  if (!title) return null;

  const card: CourseCardSummary = {
    id: id || `hash-${title}`,
    title,
    description: query.has('description') ? query.get('description') || '' : known?.description || '',
    cover: validCover(query.get('cover')) || known?.cover || coverForTitle(title),
  };
  return openCourseCardState(state, card, {
    cardId: id || card.id,
    requiresGeneration: query.get('generate') !== '0',
  });
}

export function clearCourseSelectionPatch(screen: CourseRoute): Partial<AppState> {
  return {
    screen,
    generated: null,
    activeCourseUuid: undefined,
    activeCourseCardId: undefined,
    activeCourseCardNeedsGeneration: undefined,
    courseJoined: false,
    lectureDone: false,
    lectureCompletePrompt: false,
    courseLoading: false,
    courseError: null,
    activeUnitId: undefined,
    activeLectureId: undefined,
    activeSessionId: undefined,
    activeTopic: undefined,
    whiteboardMode: 'lecture',
  };
}
