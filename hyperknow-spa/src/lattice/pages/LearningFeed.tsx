import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  MoreVertical,
  Inbox,
  List,
  Info,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Check,
  X,
  Plus,
  GraduationCap,
  MessageCircle,
} from 'lucide-react';
import type { PageProps } from '../types';
import { useI18n } from '../i18n';
import { L } from '../i18n/content';
import { toast } from '../toast';
import { fetchConversations, fetchMarketCourses, type ConvRow, type MarketCourse } from '../backend';
import { courseJoinKey, isCourseJoined } from '../courseJoinMemory';
import './LearningFeed.css';

interface DayCell {
  date: Date;
  out?: boolean;
}

/** 学习计划任务:localStorage 按账户持久化(与课程加入记忆同一套纪律)。 */
interface PlanTask {
  id: string;
  title: string;
  /** 本地日期键 YYYY-MM-DD */
  dateKey: string;
  done: boolean;
  createdAt: number;
  completedAt: number | null;
  /** 课程类任务的目标课程(点击跳到我的课程) */
  courseUuid?: string | null;
}

const PLAN_PREFIX = 'hk_learn_plan_v1:';

function loadPlan(scope: string): PlanTask[] {
  try {
    const raw = localStorage.getItem(PLAN_PREFIX + scope);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
      .map((t) => ({
        id: String(t.id ?? ''),
        title: String(t.title ?? '').slice(0, 120),
        dateKey: String(t.dateKey ?? ''),
        done: t.done === true,
        createdAt: Number(t.createdAt) || 0,
        completedAt: typeof t.completedAt === 'number' ? t.completedAt : null,
        courseUuid: typeof t.courseUuid === 'string' ? t.courseUuid : null,
      }))
      .filter((t) => t.id && t.title && /^\d{4}-\d{2}-\d{2}$/.test(t.dateKey));
  } catch {
    return [];
  }
}

function savePlan(scope: string, tasks: PlanTask[]): void {
  try {
    localStorage.setItem(PLAN_PREFIX + scope, JSON.stringify(tasks));
  } catch {
    /* 存储不可用 → 计划仅本会话内有效 */
  }
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
const dateKeyOf = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

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

/** Learning Feed — 真数据的今日待办 + 学习计划日历:
 * 待办/完成卡片读写本账户计划(localStorage),日历回放真实会话活动
 * (fetchConversations 按日聚合),待处理任务页签给出已加入课程的继续学习建议。 */
export const LearningFeed: React.FC<PageProps> = ({ state, set }) => {
  const { t, lng } = useI18n();
  const weekdayFmt = new Intl.DateTimeFormat(lng, { weekday: 'short', month: 'short', day: 'numeric' });
  const monthFmt = new Intl.DateTimeFormat(lng, { month: 'long', year: 'numeric' });
  const wdFmt = new Intl.DateTimeFormat(lng, { weekday: 'short' });
  const dayTitleFmt = new Intl.DateTimeFormat(lng, { month: 'short', day: 'numeric' });

  const [view, setView] = useState<'month' | 'week'>('month');
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const today = useMemo(() => new Date(), []);
  const todayKey = today.toDateString();
  const todayDateKey = dateKeyOf(today);

  const scope = state.identity?.email || 'demo';
  const [tasks, setTasks] = useState<PlanTask[]>(() => loadPlan(scope));
  const [selectedKey, setSelectedKey] = useState<string>(todayDateKey);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState('');
  const [todosMenu, setTodosMenu] = useState(false);
  const [activity, setActivity] = useState<Record<string, string[]>>({});
  const [market, setMarket] = useState<MarketCourse[] | null>(null);

  /* scope 归属迁移:身份是异步落定的——落定前('demo'期)的增删属于当前用户,
   * 并入真账户计划(按 id 去重);账户间正常切换时改动各归其位。 */
  const scopeRef = useRef(scope);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  useEffect(() => {
    const prev = scopeRef.current;
    if (prev === scope) return;
    scopeRef.current = scope;
    const carried = tasksRef.current;
    if (prev === 'demo' && carried.length > 0) {
      const existing = loadPlan(scope);
      const ids = new Set(existing.map((t) => t.id));
      const merged = [...existing, ...carried.filter((t) => !ids.has(t.id))];
      savePlan(scope, merged);
      setTasks(merged);
    } else {
      savePlan(prev, carried);
      setTasks(loadPlan(scope));
    }
    setSelectedKey(dateKeyOf(new Date()));
  }, [scope]);

  useEffect(() => {
    savePlan(scopeRef.current, tasks);
  }, [tasks]);

  /* 真实学习活动:会话按日聚合(标题供"那天学了什么"展示) */
  useEffect(() => {
    let alive = true;
    void fetchConversations().then((rows: ConvRow[] | null) => {
      if (!alive || !rows) return;
      const byDay: Record<string, string[]> = {};
      for (const row of rows) {
        const d = new Date(row.updatedAt);
        if (Number.isNaN(d.getTime())) continue;
        const key = dateKeyOf(d);
        (byDay[key] ??= []).push(row.title || L('Untitled conversation', '未命名会话'));
      }
      setActivity(byDay);
    });
    return () => {
      alive = false;
    };
  }, [scope]);

  /* 我的课程(已加入课程 → 继续学习建议) */
  useEffect(() => {
    let alive = true;
    void fetchMarketCourses().then((rows: MarketCourse[] | null) => {
      if (alive) setMarket(rows);
    });
    return () => {
      alive = false;
    };
  }, [scope]);

  const joinedCourses = useMemo(() => {
    const rows = market ?? [];
    return rows.filter((m) => isCourseJoined(scope, courseJoinKey(m.uuid)));
  }, [market, scope]);

  /** 待处理建议:已加入且当前计划里没有对应未完成任务 */
  const suggestions = useMemo(() => {
    const openCourseKeys = new Set(
      tasks.filter((t) => !t.done && t.courseUuid).map((t) => courseJoinKey(t.courseUuid)),
    );
    return joinedCourses
      .map((m) => {
        const key = courseJoinKey(m.uuid);
        return {
          id: `course:${key}`,
          key,
          uuid: m.uuid,
          title: m.title || L('Public Speaking (demo)', '公开演讲(演示)'),
        };
      })
      .filter((s) => !openCourseKeys.has(s.key) && !dismissed.has(s.id));
  }, [joinedCourses, tasks, dismissed]);

  const mutate = (fn: (prev: PlanTask[]) => PlanTask[]) => setTasks((prev) => fn(prev));

  const addTask = (title: string, courseUuid: string | null = null) => {
    const clean = title.trim().slice(0, 120);
    if (!clean) return;
    mutate((prev) => [
      ...prev,
      {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        title: clean,
        dateKey: selectedKey,
        done: false,
        createdAt: Date.now(),
        completedAt: null,
        courseUuid,
      },
    ]);
  };

  const submitDraft = () => {
    if (!draft.trim()) return;
    addTask(draft);
    setDraft('');
  };

  const toggleTask = (id: string) =>
    mutate((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, done: !t.done, completedAt: !t.done ? Date.now() : null } : t,
      ),
    );

  const removeTask = (id: string) => mutate((prev) => prev.filter((t) => t.id !== id));

  const clearDone = () => {
    const n = tasks.filter((t) => t.dateKey === selectedKey && t.done).length;
    if (!n) return;
    mutate((prev) => prev.filter((t) => !(t.dateKey === selectedKey && t.done)));
    toast(L(`Cleared ${n} completed`, `已清除 ${n} 条完成记录`));
  };

  const confirmSuggestion = (s: { id: string; uuid: string | null; title: string }) => {
    setDismissed((prev) => new Set(prev).add(s.id));
    setSelectedKey(todayDateKey);
    mutate((prev) => [
      ...prev,
      {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        title: L(`Continue “${s.title}”`, `继续学习《${s.title}》`),
        dateKey: todayDateKey,
        done: false,
        createdAt: Date.now(),
        completedAt: null,
        courseUuid: s.uuid,
      },
    ]);
    toast(L('Added to today’s plan', '已加入今日计划'));
    setPendingOpen(false);
  };

  /* 日期 → 计划任务索引 */
  const tasksByDay = useMemo(() => {
    const map: Record<string, PlanTask[]> = {};
    for (const t of tasks) (map[t.dateKey] ??= []).push(t);
    return map;
  }, [tasks]);

  const dayTasks = tasksByDay[selectedKey] ?? [];
  const pendingDay = dayTasks.filter((t) => !t.done);
  const doneDay = dayTasks.filter((t) => t.done);
  const todayDue = (tasksByDay[todayDateKey] ?? []).filter((t) => !t.done).length;
  const todayTotal = (tasksByDay[todayDateKey] ?? []).length;

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

  const pickDay = (cell: DayCell) => {
    setSelectedKey(dateKeyOf(cell.date));
    if (cell.out) setCursor(new Date(cell.date.getFullYear(), cell.date.getMonth(), 1));
  };

  const quota = state.identity?.credits;
  const quotaLabel = quota === null || quota === undefined
    ? t('proactive.proQuotaButton')
    : L(`${quota} credits left`, `剩余积分 ${quota}`);

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
                setSelectedKey(todayDateKey);
              }}
            >
              {t('proactive.today')}
            </span>
          </div>
          <div className="lf-big-date">{today.getDate()}</div>
          <div className="lf-date-sub">{weekdayFmt.format(today)}</div>
          <div className="lf-mini-pills">
            <span className="lf-mini-pill">{t('proactive.duesCount', { count: todayDue })}</span>
            <span className="lf-mini-pill">{t('proactive.tasksCount', { count: todayTotal })}</span>
          </div>
        </div>

        <div className="lf-card lf-todos">
          <div className="lf-card-head">
            <span className="lf-card-title">
              {selectedKey === todayDateKey ? t('proactive.todaysTodos') : dayTitleFmt.format(new Date(`${selectedKey}T00:00:00`))}
            </span>
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <MoreVertical
                size={14}
                className="lf-dots"
                style={{ cursor: 'pointer' }}
                onClick={() => setTodosMenu((v) => !v)}
              />
              {todosMenu && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 30 }}
                    onClick={() => setTodosMenu(false)}
                  />
                  <button
                    type="button"
                    className="lf-menu-item"
                    style={{ position: 'absolute', right: 0, top: 18, zIndex: 31 }}
                    onClick={() => {
                      setTodosMenu(false);
                      clearDone();
                    }}
                  >
                    {L('Clear completed', '清除已完成')}
                  </button>
                </>
              )}
            </span>
          </div>
          {pendingDay.length === 0 ? (
            <div className="lf-empty">{t('proactive.noTasksToday')}</div>
          ) : (
            <div className="lf-task-list">
              {pendingDay.map((task) => (
                <div className="lf-task" key={task.id}>
                  <button
                    type="button"
                    className="lf-task-check"
                    aria-label={L('Mark done', '标记完成')}
                    onClick={() => toggleTask(task.id)}
                  >
                    <Check size={12} opacity={0} />
                  </button>
                  <span
                    className="lf-task-title"
                    onClick={task.courseUuid ? () => set({ screen: 'courses' }) : undefined}
                    style={task.courseUuid ? { cursor: 'pointer' } : undefined}
                    title={task.courseUuid ? L('Open my courses', '打开我的课程') : undefined}
                  >
                    {task.courseUuid ? <GraduationCap size={12} /> : null}
                    {task.title}
                  </span>
                  <button type="button" className="lf-task-x" aria-label={L('Delete', '删除')} onClick={() => removeTask(task.id)}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="lf-add-row">
            <input
              className="lf-add-input"
              value={draft}
              placeholder={L('Add a task for this day…', '给这一天加个任务…')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitDraft()}
            />
            <button type="button" className="lf-add-btn" aria-label={L('Add task', '添加任务')} onClick={submitDraft} disabled={!draft.trim()}>
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div className="lf-card lf-completed">
          <div className="lf-card-head">
            <span className="lf-card-title">{t('proactive.completed')}</span>
          </div>
          {doneDay.length === 0 ? (
            <div className="lf-empty">{t('proactive.noCompletedToday')}</div>
          ) : (
            <div className="lf-task-list">
              {doneDay.map((task) => (
                <div className="lf-task done" key={task.id}>
                  <button
                    type="button"
                    className="lf-task-check checked"
                    aria-label={L('Mark undone', '标记未完成')}
                    onClick={() => toggleTask(task.id)}
                  >
                    <Check size={12} />
                  </button>
                  <span className="lf-task-title">{task.title}</span>
                  <button type="button" className="lf-task-x" aria-label={L('Delete', '删除')} onClick={() => removeTask(task.id)}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* right column — calendar */}
      <div className="lf-cal-card">
        <div className="lf-toolbar">
          <div className="lf-toolbar-left">
            <button
              type="button"
              className={pendingOpen ? 'lf-pill-outline' : 'lf-pill-filled'}
              onClick={() => setPendingOpen(false)}
            >
              {t('proactive.confirmedTasks')}
            </button>
            <button
              type="button"
              className={pendingOpen ? 'lf-pill-filled' : 'lf-pill-outline'}
              onClick={() => setPendingOpen((v) => !v)}
            >
              <Inbox size={13} />
              {t('proactive.pendingTasks')}
              {suggestions.length > 0 && <span className="lf-badge">{suggestions.length}</span>}
            </button>
            <span
              className="lf-quota"
              title={
                state.identity?.tier && state.identity.tier !== 'FREE'
                  ? L(`${state.identity.tier} plan — resets daily`, `${state.identity.tier} 套餐——每日重置`)
                  : L('Free plan: 20 credits a day (2 per chat, 10 per course), reset at midnight Beijing time.', '免费档：每日 20 积分（对话 2/次、课程 10/次），北京时间零点重置。')
              }
            >
              <List size={13} />
              {quotaLabel}
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
                setSelectedKey(todayDateKey);
                toast(L('Back to today', '已回到今天'));
              }}
            >
              <CalendarDays size={13} />
            </span>
          </div>
        </div>

        {pendingOpen && (
          <div className="lf-suggest-panel">
            <div className="lf-suggest-head">
              <Inbox size={13} />
              {L('Suggestions from joined courses', '已加入课程的继续学习建议')}
            </div>
            {suggestions.length === 0 ? (
              <div className="lf-empty">{L('Nothing pending — join a course to get suggestions.', '暂无待处理——加入课程后会有继续学习建议。')}</div>
            ) : (
              suggestions.map((s) => (
                <div className="lf-suggest-row" key={s.id}>
                  <GraduationCap size={14} />
                  <span className="lf-suggest-title">{s.title}</span>
                  <button type="button" className="lf-suggest-confirm" onClick={() => confirmSuggestion(s)}>
                    {L('Add to today', '加入今日')}
                  </button>
                  <button
                    type="button"
                    className="lf-task-x"
                    aria-label={L('Dismiss', '忽略')}
                    onClick={() => setDismissed((prev) => new Set(prev).add(s.id))}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        <div className="lf-weekdays">
          {weekdays.map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>

        <div className="lf-grid">
          {cells.map((cell, i) => {
            const isToday = cell.date.toDateString() === todayKey;
            const key = dateKeyOf(cell.date);
            const dayTaskList = tasksByDay[key] ?? [];
            const dayPending = dayTaskList.filter((t) => !t.done).length;
            const dayDone = dayTaskList.length - dayPending;
            const acts = activity[key]?.length ?? 0;
            const selected = key === selectedKey;
            return (
              <div
                key={i}
                className={`lf-cell${cell.out ? ' out' : ''}${selected ? ' selected' : ''}`}
                onClick={() => pickDay(cell)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && pickDay(cell)}
              >
                {isToday ? (
                  <>
                    <span className="lf-today-outline" />
                    <span className="lf-today-circle">{cell.date.getDate()}</span>
                  </>
                ) : (
                  <span className="lf-daynum">{cell.date.getDate()}</span>
                )}
                {(dayTaskList.length > 0 || acts > 0) && (
                  <span className="lf-cell-marks">
                    {dayPending > 0 && <span className="lf-mark task" title={L(`${dayPending} planned`, `${dayPending} 项计划`)} />}
                    {dayDone > 0 && <span className="lf-mark done" title={L(`${dayDone} completed`, `${dayDone} 项已完成`)} />}
                    {acts > 0 && (
                      <span className="lf-mark act" title={`${acts} ${L('sessions studied', '次学习会话')}`}>
                        <MessageCircle size={9} />
                      </span>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="lf-day-detail">
          <div className="lf-day-detail-head">
            {selectedKey === todayDateKey ? t('proactive.todaysTodos') : dayTitleFmt.format(new Date(`${selectedKey}T00:00:00`))}
            <span className="lf-day-detail-sub">
              {pendingDay.length > 0
                ? L(`${pendingDay.length} open · ${doneDay.length} done`, `${pendingDay.length} 项待办 · ${doneDay.length} 项完成`)
                : actsOf(activity, selectedKey) > 0
                  ? L('Studied this day', '这一天有学习记录')
                  : L('Nothing planned', '暂无安排')}
            </span>
          </div>
          {(activity[selectedKey] ?? []).slice(0, 3).map((title, i) => (
            <div className="lf-act-row" key={i}>
              <MessageCircle size={12} />
              <span>{title}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
  );
};

function actsOf(activity: Record<string, string[]>, key: string): number {
  return activity[key]?.length ?? 0;
}
