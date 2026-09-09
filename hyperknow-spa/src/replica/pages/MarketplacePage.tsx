import { useMemo, useState } from 'react';
import { Search, BadgeCheck, Users, Star } from 'lucide-react';
import type { PageProps } from '../types';
import type { CourseCard } from '../data';
import { marketplaceFeatured, marketplaceCategories, homeCourses, coverForTitle } from '../data';
import { buildGeneratedCourse, courseFromBackend } from '../generate';
import { fetchCourseDetail, type MarketCourse } from '../backend';
import { CourseCover, HighlightSwash, Logo } from '../illustrations';
import { useI18n, TRich } from '../i18n';
import { L } from '../i18n/content';
import './MarketplacePage.css';

/** 课程 → 分类映射(数据里没有分类字段;按课程主题人工归入原站分类)。 */
const COURSE_CATEGORY: Record<string, string> = {
  ai: 'aiDataScience',
  ml: 'aiDataScience',
  prompt: 'computerScience',
  'ap-bio': 'science',
  'ap-world': 'socialScience',
  sociology: 'socialScience',
  'ap-psych': 'psychology',
  sat: 'examPrep',
};

/** Plausible enrolled counts for featured courses (not present in data). */
const ENROLLED_FALLBACK: Record<string, string> = {
  ai: '9K',
  'ap-bio': '8.2K',
  'ap-world': '6.5K',
  prompt: '3.1K',
  'ap-psych': '5.4K',
  sat: '7.8K',
};

const enrolledOf = (c: CourseCard) => c.onboarded ?? ENROLLED_FALLBACK[c.id] ?? '2.4K';

function FeaturedCard({
  course,
  size,
  onClick,
}: {
  course: CourseCard;
  size: 'large' | 'top' | 'small';
  onClick: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className={`mp-feat-card ${size}`} onClick={onClick}>
      <div className="mp-cover-fill">
        <CourseCover kind={course.cover} />
      </div>
      <div className="mp-feat-scrim" />
      <div className="mp-feat-overlay">
        <div className="mp-feat-chips">
          <span className="mp-feat-chip">{course.difficulty}</span>
          <span className="mp-feat-chip">{course.lessons} {t('home.courseTicket.lessonsLabel').toLowerCase()}</span>
        </div>
        <div className="mp-feat-title">{course.title}</div>
        {size === 'large' && <div className="mp-feat-sub">{course.description}</div>}
      </div>
    </div>
  );
}

function ListCard({ course, onClick }: { course: CourseCard; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mp-card" onClick={onClick}>
      <div className="mp-card-cover">
        <CourseCover kind={course.cover} flat />
      </div>
      <div className="mp-card-body">
        <div className="mp-provider">
          <span className="mp-logo-mark">
            <Logo size={14} />
          </span>
          <span>{L('Lattice Learning Lab', '见界学习研究室')}</span>
          <BadgeCheck size={14} color="#3B82F6" />
        </div>
        <div className="mp-card-title">{course.title}</div>
        <div className="mp-card-desc">{course.description}</div>
        <div className="mp-card-chips">
          <span className="mp-card-chip">{course.difficulty}</span>
          <span className="mp-card-chip">{course.lessons} {t('home.courseTicket.lessonsLabel').toLowerCase()}</span>
        </div>
        <div className="mp-card-meta">
          <span className="mp-meta-left">
            <Users size={13} />
            {enrolledOf(course)} enrolled
          </span>
          <span className="mp-rating">
            <Star size={13} fill="#FACC15" color="#FACC15" />
            {course.rating}
          </span>
        </div>
      </div>
    </div>
  );
}

/** D1 课程 → 卡片:封面按标题稳定哈希挑一种风格(课程数据本身无封面字段)。 */
const DIFFICULTIES: CourseCard['difficulty'][] = ['Beginner', 'Intermediate', 'Advanced'];
const cardFromMarket = (mc: MarketCourse): CourseCard => ({
  id: mc.marketId,
  title: mc.title,
  description: mc.description,
  difficulty: DIFFICULTIES[mc.marketId.length % DIFFICULTIES.length],
  lessons: mc.sessionCount ?? 8,
  ...(mc.joinCount != null ? { onboarded: `${(mc.joinCount / 1000).toFixed(1)}K` } : {}),
  rating: 4.5,
  cover: coverForTitle(mc.title),
});

export default function MarketplacePage({ state, set }: PageProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  /* 双轨:后端市场(本人 D1 课程 + 官方样例)可达时全量替换演示卡;不可达回退演示 */
  const liveMarket = state.marketCourses;
  const liveCards = useMemo(() => (liveMarket ?? []).map(cardFromMarket), [liveMarket]);
  const liveUuids = useMemo(
    () => new Map(liveMarket?.filter((m) => m.uuid).map((m) => [m.marketId, m.uuid as string]) ?? []),
    [liveMarket],
  );
  /* 点哪本书就预览哪本书:伪生成引擎按书名重建课程骨架,并携带封面风格;
   * D1 本人课程先落同名占位预览,详情(courses/[uuid])到达后原位换成真课程树。
   * 切书时重置加入/完课标记——单课模型下,预览新课就是重新开始 */
  const openCourse = (course: CourseCard) => {
    set({
      screen: 'coursePreview',
      generated: { ...buildGeneratedCourse(course.title), cover: course.cover },
      courseJoined: false,
      lectureDone: false,
    });
    const uuid = liveUuids.get(course.id);
    if (uuid) {
      void fetchCourseDetail(uuid).then((cs) => {
        if (cs) set({ generated: { ...courseFromBackend(cs, course.title), cover: course.cover } });
      });
    }
  };
  /* 精选位:后端市场不足 6 张时用演示卡补位(布局固定 1 大 + 2 上 + 3 小) */
  const featured = useMemo(() => {
    const base = liveMarket ? liveCards : marketplaceFeatured();
    return [...base, ...marketplaceFeatured()].slice(0, 6);
  }, [liveMarket, liveCards]);
  const [large, top1, top2, small1, small2, small3] = featured;
  const allCourses = useMemo(() => {
    if (!liveMarket) return [...marketplaceFeatured(), ...homeCourses()];
    /* 后端市场可达:真课程在前,演示卡补位但去掉与真课程同名的重复项 */
    const liveTitles = new Set(liveCards.map((c) => c.title));
    return [...liveCards, ...[...marketplaceFeatured(), ...homeCourses()].filter((c) => !liveTitles.has(c.title))];
  }, [liveMarket, liveCards]);
  /* 分类 + 关键词双重过滤;命中为空时给出空态而不是假装有结果 */
  const listCourses = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allCourses.filter((c) => {
      const inTab = tab === 'all' || COURSE_CATEGORY[c.id] === tab;
      const inQuery = !q || c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
      return inTab && inQuery;
    });
  }, [allCourses, tab, query]);
  const filtering = tab !== 'all' || query.trim().length > 0;

  return (
    <div className="hk-page with-sidebar mp-page">
      <div className="mp-container">
        <div className="mp-hero">
          <h1>
            <TRich
              text={t('marketplacePage.heroTitle')}
              renderers={{ highlight: (children) => <HighlightSwash>{children}</HighlightSwash> }}
            />
          </h1>
          <div className="mp-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('marketplacePage.searchOverlay.placeholder')}
            />
          </div>
        </div>

        {!filtering && (
          <>
            <div className="mp-trending-row">
              <span className="mp-trending-chip">{t('marketplacePage.trending.eyebrow')}</span>
              <h2 className="mp-editors">{t('marketplacePage.carousel.title')}</h2>
            </div>

            <div className="mp-featured">
              <FeaturedCard course={large} size="large" onClick={() => openCourse(large)} />
              <div className="mp-feat-right">
                <FeaturedCard course={top1} size="top" onClick={() => openCourse(top1)} />
                <FeaturedCard course={top2} size="top" onClick={() => openCourse(top2)} />
                <FeaturedCard course={small1} size="small" onClick={() => openCourse(small1)} />
                <FeaturedCard course={small2} size="small" onClick={() => openCourse(small2)} />
                <FeaturedCard course={small3} size="small" onClick={() => openCourse(small3)} />
              </div>
            </div>
          </>
        )}

        <div className="mp-tabs">
          {marketplaceCategories().map((c) => (
            <span
              key={c.key}
              className={`mp-tab${c.key === tab ? ' active' : ''}`}
              onClick={() => setTab(c.key)}
            >
              {t(c.label)}
            </span>
          ))}
        </div>

        <div className="mp-grid">
          {listCourses.map((c, i) => (
            <ListCard key={`${c.id}-${i}`} course={c} onClick={() => openCourse(c)} />
          ))}
        </div>
        {listCourses.length === 0 && (
          <div className="mp-empty">
            {L('No courses match this filter yet — try another category or clear the search.', '没有符合筛选的课程——换个分类或清空搜索试试。')}
          </div>
        )}
      </div>
    </div>
  );
}
