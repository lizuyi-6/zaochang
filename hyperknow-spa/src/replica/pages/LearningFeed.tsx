import React, { useMemo, useState } from 'react';
import {
  Calendar,
  MoreVertical,
  Inbox,
  List,
  Info,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from 'lucide-react';
import type { PageProps } from '../types';
import { useI18n } from '../i18n';
import { L } from '../i18n/content';
import { toast } from '../toast';
import './LearningFeed.css';

interface DayCell {
  date: Date;
  out?: boolean;
}

const startOfWeek = (d: Date): Date => {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); // 周一为每周第一天
  return s;
};

const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** Learning Feed screen — left summary cards + calendar (month/week 可切换、可翻页)。 */
export const LearningFeed: React.FC<PageProps> = () => {
  const { t, lng } = useI18n();
  const weekdayFmt = new Intl.DateTimeFormat(lng, { weekday: 'short', month: 'short', day: 'numeric' });
  const monthFmt = new Intl.DateTimeFormat(lng, { month: 'long', year: 'numeric' });
  const wdFmt = new Intl.DateTimeFormat(lng, { weekday: 'short' });

  const [view, setView] = useState<'month' | 'week'>('month');
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const today = useMemo(() => new Date(), []);
  const todayKey = today.toDateString();

  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => wdFmt.format(addDays(startOfWeek(today), i)).toUpperCase()),
    [wdFmt, today],
  );

  const monthCells = useMemo<DayCell[]>(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => {
      const date = addDays(start, i);
      return { date, out: date.getMonth() !== cursor.getMonth() };
    });
  }, [cursor]);

  const weekCells = useMemo<DayCell[]>(
    () => Array.from({ length: 7 }, (_, i) => ({ date: addDays(startOfWeek(cursor), i) })),
    [cursor],
  );

  const cells = view === 'month' ? monthCells : weekCells;
  const title =
    view === 'month'
      ? monthFmt.format(cursor)
      : `${weekdayFmt.format(weekCells[0].date)} – ${weekdayFmt.format(weekCells[6].date)}`;

  const step = (dir: -1 | 1) => {
    if (view === 'month') {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
    } else {
      setCursor(addDays(cursor, dir * 7));
    }
  };

  return (
  <div className="hk-page with-sidebar lf-page">
    <div className="lf-layout">
      {/* left column */}
      <div className="lf-left">
        <div className="lf-card">
          <div className="lf-card-head">
            <span className="lf-card-title">
              <Calendar size={16} />
              {t('proactive.calendar')}
            </span>
            <span
              className="lf-today-pill"
              style={{ cursor: 'pointer' }}
              onClick={() => {
                setCursor(new Date());
                setView('month');
              }}
            >
              {t('proactive.today')}
            </span>
          </div>
          <div className="lf-big-date">{today.getDate()}</div>
          <div className="lf-date-sub">{weekdayFmt.format(today)}</div>
          <div className="lf-mini-pills">
            <span className="lf-mini-pill">{t('proactive.duesCount', { count: 0 })}</span>
            <span className="lf-mini-pill">{t('proactive.tasksCount', { count: 0 })}</span>
          </div>
        </div>

        <div className="lf-card lf-todos">
          <div className="lf-card-head">
            <span className="lf-card-title">{t('proactive.todaysTodos')}</span>
            <MoreVertical size={14} className="lf-dots" />
          </div>
          <div className="lf-empty">{t('proactive.noTasksToday')}</div>
        </div>

        <div className="lf-card lf-completed">
          <div className="lf-card-head">
            <span className="lf-card-title">{t('proactive.completed')}</span>
          </div>
          <div className="lf-empty">{t('proactive.noCompletedToday')}</div>
        </div>
      </div>

      {/* right column — calendar */}
      <div className="lf-cal-card">
        <div className="lf-toolbar">
          <div className="lf-toolbar-left">
            <span className="lf-pill-filled">{t('proactive.confirmedTasks')}</span>
            <span className="lf-pill-outline">
              <Inbox size={13} />
              {t('proactive.pendingTasks')}
            </span>
            <span className="lf-quota">
              <List size={13} />
              {t('proactive.proQuotaButton')}
              <Info size={13} />
            </span>
          </div>
          <div className="lf-toolbar-right">
            <button type="button" className="lf-nav-arrow" aria-label={L('Previous', '上一页')} onClick={() => step(-1)}>
              <ChevronLeft size={16} />
            </button>
            <span className="lf-month">{title}</span>
            <button type="button" className="lf-nav-arrow" aria-label={L('Next', '下一页')} onClick={() => step(1)}>
              <ChevronRight size={16} />
            </button>
            <span className={`lf-view-text${view === 'week' ? ' active' : ''}`} onClick={() => setView('week')}>
              {t('proactive.week')}
            </span>
            <span className={`lf-view-active${view === 'month' ? ' active' : ''}`} onClick={() => setView('month')}>
              {t('proactive.month')}
            </span>
            <span
              className="lf-cal-btn"
              title={L('Jump to today', '回到今天')}
              onClick={() => {
                setCursor(new Date());
                setView('month');
                toast(L('Back to today', '已回到今天'));
              }}
            >
              <CalendarDays size={13} />
            </span>
          </div>
        </div>

        <div className="lf-weekdays">
          {weekdays.map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>

        <div className="lf-grid">
          {cells.map((cell, i) => {
            const isToday = cell.date.toDateString() === todayKey;
            return (
              <div key={i} className={`lf-cell${cell.out ? ' out' : ''}`}>
                {isToday ? (
                  <>
                    <span className="lf-today-outline" />
                    <span className="lf-today-circle">{cell.date.getDate()}</span>
                  </>
                ) : (
                  <span className="lf-daynum">{cell.date.getDate()}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  </div>
  );
};
