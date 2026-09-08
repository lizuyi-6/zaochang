import React, { useMemo, useState } from 'react';
import { Search, ChevronLeft, ChevronRight, ArrowUpRight, Star } from 'lucide-react';
import type { PageProps } from '../types';
import { CourseCover } from '../illustrations';
import { KandinskyCover, KnotMark } from './CourseJourney';
import { useI18n } from '../i18n';
import { L } from '../i18n/content';
import './CoursesPage.css';

/* ------------------------------------------------------------------ */
/* Local illustration: person beside an empty bookcase (ink + green)   */
/* ------------------------------------------------------------------ */
const EmptyShelf: React.FC<{ size?: number }> = ({ size = 200 }) => (
  <svg width={size} height={size * 0.8} viewBox="0 0 200 160" fill="none">
    {/* motion ticks near head */}
    <path d="M38 40 l-6 -4 M42 32 l-3 -7" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
    {/* person: head + curly hair */}
    <circle cx="60" cy="52" r="10" fill="#fff" stroke="#1A1A1A" strokeWidth="2.2" />
    <path d="M50 48 q-3 -10 7 -13 q2 -6 9 -5 q7 -3 11 3 q6 2 4 9 q-13 -8 -27 0 z" fill="#1A1A1A" />
    <circle cx="64" cy="52" r="1.3" fill="#1A1A1A" />
    {/* hand on chin */}
    <path d="M68 62 q4 0 6 -6" stroke="#1A1A1A" strokeWidth="2" fill="none" strokeLinecap="round" />
    {/* cream sweater */}
    <path d="M52 64 q10 -6 18 0 l3 26 q-12 6 -24 0 z" fill="#FDFCF7" stroke="#1A1A1A" strokeWidth="2.2" />
    {/* arm holding box under left arm */}
    <path d="M54 70 q-9 4 -11 12" stroke="#1A1A1A" strokeWidth="2" fill="none" strokeLinecap="round" />
    <rect x="32" y="74" width="17" height="14" rx="1.5" fill="#DCE9C8" stroke="#1A1A1A" strokeWidth="1.8" transform="rotate(-6 40 81)" />
    {/* baggy black pants, walking */}
    <path d="M54 90 q-2 16 -10 26 q6 5 12 2 l6 -18 q4 12 12 18 q7 0 9 -6 q-10 -8 -12 -22" fill="#1F2937" stroke="#1A1A1A" strokeWidth="2" />
    <path d="M40 118 q7 4 14 0 M72 116 q7 4 14 0" stroke="#1A1A1A" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    {/* empty 4-shelf bookcase */}
    <path d="M98 30 h70 v118 h-70 z" fill="#fff" stroke="#1A1A1A" strokeWidth="2.4" />
    <path d="M98 60 h70 M98 89 h70 M98 118 h70" stroke="#1A1A1A" strokeWidth="2" />
    <path d="M102 148 h62" stroke="#1A1A1A" strokeWidth="2.4" strokeLinecap="round" />
    {/* potted sprout on top */}
    <path d="M122 22 h15 l-2.5 8 h-10 z" fill="#fff" stroke="#1A1A1A" strokeWidth="1.8" />
    <path d="M129 22 q-7 -8 -3 -15 q7 3 3 15 z" fill="#A9CB8E" stroke="#1A1A1A" strokeWidth="1.2" />
    <path d="M131 22 q3 -10 11 -11 q1 9 -11 11 z" fill="#A9CB8E" stroke="#1A1A1A" strokeWidth="1.2" />
    {/* snake plant at base right */}
    <path d="M174 130 q-3 -16 2 -24 q5 10 2 24 z" fill="#A9CB8E" stroke="#1A1A1A" strokeWidth="1.3" />
    <path d="M181 130 q0 -22 5 -28 q4 12 1 28 z" fill="#8FBF72" stroke="#1A1A1A" strokeWidth="1.3" />
    <path d="M188 130 q4 -14 11 -17 q0 12 -6 17 z" fill="#A9CB8E" stroke="#1A1A1A" strokeWidth="1.3" />
    <path d="M172 130 h24 l-3 16 h-18 z" fill="#fff" stroke="#1A1A1A" strokeWidth="2" />
    {/* dotted ground strokes */}
    <path d="M28 152 h9 M64 154 h11 M104 153 h12 M140 154 h9 M196 152 h6" stroke="#1A1A1A" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
  </svg>
);

const WEEK_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const MARKET_ROWS = [
  { title: 'Public Speaking', rating: '4.6', cover: 'kandinsky' as const },
  { title: 'Introduction to Sociology', rating: '4.4', cover: 'sociology' as const },
  { title: 'AP Psychology', rating: '4.3', cover: 'psych' as const },
];

const CoursesPage: React.FC<PageProps> = ({ state, set }) => {
  const { t, lng } = useI18n();
  const [tab, setTab] = useState<'all' | 'progress' | 'completed'>('all');
  const [query, setQuery] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const previewTarget = state.courseJoined ? ('courseJourney' as const) : ('coursePreview' as const);

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
    (!q || L('Public Speaking', '公开演讲').toLowerCase().includes(q));
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

            {showJoinedCourse ? (
              <div className="cs-course-grid">
                <div className="cs-course-card">
                  <div className="cs-course-cover">
                    <KandinskyCover size={268} radius={12} />
                  </div>
                  <div className="cs-course-body">
                    <div className="cs-course-titlerow">
                      <span className="cs-course-title">{L('Public Speaking', '公开演讲')}</span>
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
                      <span>Hyperknow Official</span>
                    </div>
                    <div className="cs-rating">
                      <Star size={12} fill="#F5C518" color="#F5C518" />
                      <span>4.6</span>
                    </div>
                  </div>
                </div>
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
                        <span>Hyperknow Official</span>
                      </div>
                      <div className="cs-rating">
                        <Star size={12} fill="#F5C518" color="#F5C518" />
                        <span>{row.rating}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="cs-preview"
                      onClick={() => set({ screen: previewTarget })}
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
