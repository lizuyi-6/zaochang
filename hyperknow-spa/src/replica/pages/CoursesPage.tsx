import React, { useMemo, useState } from 'react';
import { Search, ChevronLeft, ChevronRight, ArrowUpRight, Star } from 'lucide-react';
import type { PageProps } from '../types';
import { CourseCover } from '../illustrations';
import { coverForTitle } from '../data';
import { KandinskyCover, KnotMark } from './CourseJourney';
import { useI18n } from '../i18n';
import { L } from '../i18n/content';
import './CoursesPage.css';

/* ------------------------------------------------------------------ */
/* Local illustration: person beside an empty bookcase (ink + green)   */
/* ------------------------------------------------------------------ */
const EmptyShelf: React.FC<{ size?: number }> = ({ size = 200 }) => (
  <svg width={size} height={size * 0.8} viewBox="0 0 200 160" fill="none" aria-hidden="true">
    <circle cx="105" cy="77" r="66" fill="#E6EBDD" />
    <path d="M23 146h162M155 23v-9M151 18h8" stroke="#164E46" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M78 35h77v107H78Z" fill="#F7F4EC" stroke="#164E46" strokeWidth="2" />
    <path d="M85 43h63v29H85zM85 80h63v27H85zM85 115h63v19H85z" fill="#E6EBDD" />
    <path d="M78 75h77M78 110h77M84 142v4M149 142v4" stroke="#164E46" strokeWidth="2" />
    <path d="M101 61h18M110 52v18" stroke="#164E46" strokeOpacity=".35" strokeWidth="1.5" />
    <circle cx="47" cy="64" r="10" fill="#D9A441" stroke="#164E46" strokeWidth="1.5" />
    <path d="M37 63c-3-19 22-18 23-4l-11-4-12 8Z" fill="#164E46" />
    <path d="M36 80q11-9 22 0l9 31H31Z" fill="#B7C9B6" stroke="#164E46" strokeWidth="1.8" />
    <path d="m39 111-4 30h9l8-29 6 29h9l-5-30" fill="#164E46" />
    <path d="m51 83 14 15 18-5" stroke="#164E46" strokeWidth="2" strokeLinecap="round" />
    <path d="m70 86 15-4 6 20-15 4Z" fill="#D9A441" stroke="#164E46" strokeWidth="1.5" />
    <path d="m74 88 10-3M77 98l9-3M32 143h13M57 143h12" stroke="#164E46" strokeWidth="2" strokeLinecap="round" />
    <path d="M166 128h17l-3 16h-11Z" fill="#D9A441" stroke="#164E46" strokeWidth="1.5" />
    <path d="M175 128v-21m0 12c-11 0-14-8-13-13 9 0 13 6 13 13Zm0-5c0-10 5-15 12-15 0 8-4 14-12 15Z" fill="#B7C9B6" stroke="#164E46" strokeWidth="1.5" />
    <path d="M100 30h28M100 25h18" stroke="#164E46" strokeWidth="1.5" />
  </svg>
);

const WEEK_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const MARKET_ROWS = [
  { title: 'Public Speaking', rating: '4.6', cover: 'kandinsky' as const },
  { title: 'Introduction to Sociology', rating: '4.4', cover: 'sociology' as const },
  { title: 'AP Psychology', rating: '4.3', cover: 'psych' as const },
];const CoursesPage: React.FC<PageProps> = ({ state, set }) => {
  const { t, lng } = useI18n();
  const [tab, setTab] = useState<'all' | 'progress' | 'completed'>('all');
  const [query, setQuery] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const previewTarget = state.courseJoined ? ('courseJourney' as const) : ('coursePreview' as const);
  /* 已加入的课程就是当前 generated(伪生成/后端课);无 generated 时回退演示公开演讲课 */
  const joinedTitle = state.generated?.title ?? L('Public Speaking', '公开演讲');
  const joinedCover = state.generated?.cover;
  /* 集市行预览:kandinsky 行 = 演示公开演讲课(generated 置空),其余根据市场课程真实 UUID 进入 */
  const openMarketRow = (row: (typeof MARKET_ROWS)[number]) => {
    if (row.cover === 'kandinsky') {
      set({ screen: previewTarget, generated: null, activeCourseUuid: undefined, courseJoined: false, lectureDone: false });
    } else {
      // 匹配市场真实课程
      const matched = state.marketCourses?.find((m) => m.title.toLowerCase().includes(row.title.toLowerCase()));
      if (matched?.uuid) {
        set({
          screen: previewTarget,
          activeCourseUuid: matched.uuid,
          courseJoined: false,
          lectureDone: false,
        });
      } else {
        // 无真实课程时进入课程市场挑选真实课程
        set({ screen: 'marketplace' });
      }
    }
  };

  /* 周条:真实日期按周偏移滚动(学习时长目前无后端记录,数值仍为 0) */
  const days = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekOffset]);
  const dayFmt = useMemo(() => new Intl.DateTimeFormat(lng, { month: 'short', day: 'numeric' }), [lng]);
  const todayIdx = useMemo(
    () => days.findIndex((d) => d.toDateString() === new Date().toDateString()),
    [days],
  );

  /* 搜索:课程卡与右侧集市行都按关键词过滤 */
  const q = query.trim().toLowerCase();
  const showJoinedCourse =
    state.courseJoined &&
    (tab === 'all' || (tab === 'progress' && !state.lectureDone) || (tab === 'completed' && state.lectureDone)) &&
    (!q || joinedTitle.toLowerCase().includes(q));
  /* D1 里的本人课程(刷新不丢): 直接以 activeCourseUuid 驱动加载真课程，彻底杜绝伪生成占位与异步串课 */
  const mineCourses = useMemo(
    () => (state.marketCourses ?? []).filter((m) => m.uuid && m.title !== joinedTitle),
    [state.marketCourses, joinedTitle],
  );
  const openMine = (uuid: string) => {
    set({
      screen: 'courseJourney',
      activeCourseUuid: uuid,
      courseJoined: true,
      lectureDone: false,
    });
  };
  const shelfMine =
    tab !== 'completed'
      ? mineCourses.filter((m) => !q || m.title.toLowerCase().includes(q))
      : [];
  const marketRows = MARKET_ROWS.filter((row) => !q || row.title.toLowerCase().includes(q));

  return (
    <div className="hk-page with-sidebar cs-page">
      <div className="hk-page-inner">
        <div className="cs-layout">
          {/* ---------------- Main column ---------------- */}
          <div className="cs-main">
            <h1 className="cs-title">{t('courses.title')}</h1>

            <div className="cs-toolbar">
              <div className="cs-tabs">
                <button
                  type="button"
                  className={`cs-tab${tab === 'all' ? ' active' : ''}`}
                  onClick={() => setTab('all')}
                >
                  {t('courses.tabs.all')}
                </button>
                <button
                  type="button"
                  className={`cs-tab${tab === 'progress' ? ' active' : ''}`}
                  onClick={() => setTab('progress')}
                >
                  {t('courses.tabs.inProgress')}
                </button>
                <button
                  type="button"
                  className={`cs-tab${tab === 'completed' ? ' active' : ''}`}
                  onClick={() => setTab('completed')}
                >
                  {t('courses.tabs.completed')}
                </button>
              </div>
              <div className="cs-search">
                <Search size={15} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('courses.searchPlaceholder')}
                />
              </div>
            </div>

            {showJoinedCourse || shelfMine.length > 0 ? (
              <div className="cs-course-grid">
                {showJoinedCourse && (
                  <div className="cs-course-card">
                    <div className="cs-course-cover">
                      {joinedCover ? <CourseCover kind={joinedCover} /> : <KandinskyCover size={268} radius={12} />}
                    </div>
                    <div className="cs-course-body">
                      <div className="cs-course-titlerow">
                        <span className="cs-course-title">{joinedTitle}</span>
                        <button
                          type="button"
                          className="cs-preview"
                          onClick={() => set({ screen: 'courseJourney' })}
                        >
                          {t('marketplacePage.previewCta')}
                        </button>
                      </div>
                      <div className="cs-official">
                        <KnotMark size={11} />
                        <span>{L('Lattice Official', '见界官方')}</span>
                      </div>
                      <div className="cs-rating">
                        <Star size={12} fill="#F5C518" color="#F5C518" />
                        <span>4.6</span>
                      </div>
                    </div>
                  </div>
                )}
                {shelfMine.map((m) => (
                  <div className="cs-course-card" key={m.uuid}>
                    <div className="cs-course-cover">
                      <CourseCover kind={coverForTitle(m.title)} />
                    </div>
                    <div className="cs-course-body">
                      <div className="cs-course-titlerow">
                        <span className="cs-course-title">{m.title}</span>
                        <button
                          type="button"
                          className="cs-preview"
                          onClick={() => openMine(m.uuid as string)}
                        >
                          {t('marketplacePage.previewCta')}
                        </button>
                      </div>
                      <div className="cs-official">
                        <KnotMark size={11} />
                        <span>{L('Lattice Official', '见界官方')}</span>
                      </div>
                      <div className="cs-rating">
                        <Star size={12} fill="#F5C518" color="#F5C518" />
                        <span>4.5</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="cs-empty">
                <EmptyShelf size={200} />
                <div className="cs-empty-title">{t('courses.emptyShelfTitle')}</div>
                <div className="cs-empty-sub">
                  {t('courses.emptyShelfText')}
                </div>
              </div>
            )}
          </div>

          {/* ---------------- Right rail ---------------- */}
          <aside className="cs-rail">
            <section className="cs-card cs-week">
              <div className="cs-week-head">
                <span className="cs-caps">{t('courses.motivation.weeklyEyebrow')}</span>
              </div>
              <div className="cs-week-count-row">
                <span className="cs-week-count">{t('courses.motivation.sessionsCount', { count: 0 })}</span>
                <span className="cs-week-nav">
                  <button type="button" aria-label={L('Previous week', '上一周')} onClick={() => setWeekOffset((w) => w - 1)}>
                    <ChevronLeft size={15} />
                  </button>
                  <button type="button" aria-label={L('Next week', '下一周')} onClick={() => setWeekOffset((w) => w + 1)}>
                    <ChevronRight size={15} />
                  </button>
                </span>
              </div>
              <div className="cs-week-sub">
                {dayFmt.format(days[0])} – {dayFmt.format(days[6])}
              </div>
              <div className="cs-week-strip">
                {days.map((d, i) => {
                  const weekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div key={i} className={`cs-day${weekend ? ' dim' : ''}${i === todayIdx ? ' today' : ''}`}>
                      <span className="cs-day-l">{WEEK_DAYS[(d.getDay() + 6) % 7]}</span>
                      <span className="cs-day-v">{weekend ? '\u2013' : '0'}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="cs-caps cs-pickup-label">{t('courses.motivation.pickupEyebrow')}</div>
            <section className="cs-pickup">
              <div className="cs-pickup-title">{t('courses.motivation.pickupEmptyTitle')}</div>
              <div className="cs-pickup-sub">{t('courses.motivation.pickupEmptyMeta')}</div>
            </section>

            <section className="cs-card cs-mkt">
              <div className="cs-mkt-head">
                <span className="cs-mkt-title-h">{t('courses.marketplaceCard.title')}</span>
                <button type="button" className="cs-seemore" onClick={() => set({ screen: 'marketplace' })}>
                  <span>{t('courses.marketplaceCard.seeMore')}</span>
                  <ArrowUpRight size={13} />
                </button>
              </div>
              <div className="cs-mkt-sub-h">{t('home.marketplace.subtitle')}</div>
              <div className="cs-mkt-rows">
                {marketRows.map((row) => (
                  <div key={row.title} className="cs-mkt-row">
                    <div className="cs-mkt-thumb">
                      {row.cover === 'kandinsky' ? (
                        <KandinskyCover size={56} radius={10} />
                      ) : (
                        <CourseCover kind={row.cover} />
                      )}
                    </div>
                    <div className="cs-mkt-info">
                      <div className="cs-mkt-title">{row.title}</div>
                      <div className="cs-official">
                        <KnotMark size={11} />
                        <span>{L('Lattice Official', '见界官方')}</span>
                      </div>
                      <div className="cs-rating">
                        <Star size={12} fill="#F5C518" color="#F5C518" />
                        <span>{row.rating}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="cs-preview"
                      onClick={() => openMarketRow(row)}
                    >
                      {t('marketplacePage.previewCta')}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default CoursesPage;
export { CoursesPage };
