import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState } from './lattice/types';
import { initialAppState } from './lattice/types';
import { LatticeSidebar } from './lattice/Sidebar';
import { LatticeHeader } from './lattice/Header';
import SettingsModal from './lattice/SettingsModal';
import { SignIn } from './lattice/pages/SignIn';
import { Onboarding } from './lattice/pages/Onboarding';
import { Home } from './lattice/pages/Home';
import { I18nProvider } from './lattice/i18n';
import { ToastHost } from './lattice/toast';
import { courseFromBackend } from './lattice/generate';
import { fetchConversations, fetchCourseDetail, fetchMarketCourses, fetchMe } from './lattice/backend';
import { toast } from './lattice/toast';
import { L } from './lattice/i18n/content';
import { ProLaunchModal, markProLaunchSeen, proLaunchSeen } from './lattice/ProLaunchModal';
import './lattice/shell.css';

/* 次级页面按需加载:登录/引导/首页保持同步(首屏体验),重页面(白板/聊天/课程等)
 * 拆成独立 chunk,首包不再背负全量代码。命名导出需映射为 default。 */
const HistoryPage = React.lazy(() => import('./lattice/pages/HistoryPage').then(m => ({ default: m.HistoryPage })));
const LearningFeed = React.lazy(() => import('./lattice/pages/LearningFeed').then(m => ({ default: m.LearningFeed })));
const CoursesPage = React.lazy(() => import('./lattice/pages/CoursesPage'));
const CourseJourney = React.lazy(() => import('./lattice/pages/CourseJourney'));
const MarketplacePage = React.lazy(() => import('./lattice/pages/MarketplacePage'));
const PlansPage = React.lazy(() => import('./lattice/pages/PlansPage').then(m => ({ default: m.PlansPage })));
const ChatPage = React.lazy(() => import('./lattice/pages/ChatPage').then(m => ({ default: m.ChatPage })));
const CreatePage = React.lazy(() => import('./lattice/pages/CreatePage').then(m => ({ default: m.CreatePage })));
const WhiteboardPage = React.lazy(() => import('./lattice/whiteboard/WhiteboardPage').then(m => ({ default: m.WhiteboardPage })));

/* ---------------- hash routing ---------------- */

function stateFromHash(): Partial<AppState> | null {
  const raw = window.location.hash.replace(/^#/, '');
  const [path, query] = raw.split('?');
  const q = new URLSearchParams(query ?? '');
  /* ?done=1 = post-lecture state (Continue Learning in sidebar, ⚡15, Revisit pills) */
  const done = q.has('done') ? { courseJoined: true, lectureDone: true } : {};
  /* overlay states for deep-link verification shots */
  const extras: Partial<AppState> = {
    ...(q.has('menu') ? { avatarMenuOpen: true } : {}),
    ...(q.has('more') ? { moreOpen: true } : {}),
    ...(q.has('settings')
      ? { settingsOpen: true, settingsTab: q.get('settings') === 'memory' ? ('memory' as const) : ('general' as const) }
      : {}),
  };
  switch (path) {
    case '/signin':
      return { screen: 'signin' };
    case '/home':
      return { screen: 'home', ...done, ...(q.has('nowelcome') ? { welcomeBack: false } : {}), ...extras };
    case '/history':
      return { screen: 'history', ...done, ...extras };
    case '/feed':
      return { screen: 'feed', ...done, ...extras };
    case '/courses':
      return { screen: 'courses', ...done, ...extras };
    case '/course/preview': {
      const uuid = q.get('uuid') || q.get('id');
      return {
        screen: 'coursePreview',
        activeCourseUuid: uuid || undefined,
        courseLoading: !!uuid,
        courseError: null,
        courseJoined: false,
        ...extras,
      };
    }
    case '/course/journey': {
      const uuid = q.get('uuid') || q.get('id');
      return {
        screen: 'courseJourney',
        activeCourseUuid: uuid || undefined,
        courseJoined: true,
        courseLoading: !!uuid,
        courseError: null,
        ...(q.has('done') ? { lectureDone: true } : {}),
        ...(q.has('prompt') ? { lectureDone: true, lectureCompletePrompt: true } : {}),
        ...extras,
      };
    }
    case '/marketplace':
      return { screen: 'marketplace', ...done, ...extras };
    case '/plans':
      return { screen: 'plans', ...done, ...extras };
    case '/chat':
      return { screen: 'chat', ...done, ...extras };
    case '/create':
      return { screen: 'create', ...done, ...extras };
    case '/whiteboard': {
      /* 自由讲座深链:?topic= 直接命题,进白板即 AI 实时备课(无课程上下文时
       * 不再静默播录课演示)。长度上限与服务端 plan 路由一致(300)。 */
      const topic = (q.get('topic') || '').trim().slice(0, 300);
      return {
        screen: 'whiteboard',
        whiteboardMode: q.has('practice') ? 'practice' : 'lecture',
        ...(topic ? { activeTopic: topic } : {}),
      };
    }
    default: {
      const ob = path.match(/^\/onboarding\/(\d+)/);
      if (ob) return { screen: 'onboarding', onboardingStep: Math.min(10, Math.max(1, parseInt(ob[1], 10))) };
      return null;
    }
  }
}

function hashFor(s: AppState): string {
  switch (s.screen) {
    case 'onboarding':
      return `#/onboarding/${s.onboardingStep}`;
    case 'coursePreview': {
      const uuid = s.activeCourseUuid || (s.generated as { courseUuid?: string })?.courseUuid;
      return uuid ? `#/course/preview?uuid=${encodeURIComponent(uuid)}` : '#/course/preview';
    }
    case 'courseJourney': {
      const uuid = s.activeCourseUuid || (s.generated as { courseUuid?: string })?.courseUuid;
      return uuid ? `#/course/journey?uuid=${encodeURIComponent(uuid)}` : '#/course/journey';
    }
    case 'whiteboard': {
      if (s.whiteboardMode === 'practice') return '#/whiteboard?practice=1';
      /* 自由讲座话题回写 hash:刷新/分享不丢命题(课程讲次不带——身份由课程上下文锁定) */
      const free = !s.activeCourseUuid && s.activeTopic ? `?topic=${encodeURIComponent(s.activeTopic)}` : '';
      return `#/whiteboard${free}`;
    }
    default:
      return `#/${s.screen}`;
  }
}

/* ---------------- App ---------------- */

type Veil = 'idle' | 'cover' | 'fade';

export const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => ({ ...initialAppState, ...stateFromHash() }));
  const [veil, setVeil] = useState<Veil>('idle');
  /* 见界 Pro 上线宣布:每账户一次性(电子邮箱 key),首页身份落定后延迟出现,
   * 避开欢迎回来接管层与首屏渲染。任何关闭路径都记「已看过」。 */
  const [proLaunchOpen, setProLaunchOpen] = useState(false);
  const proLaunchTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!state.bootReady || state.screen !== 'home' || !state.identity?.email) return;
    const email = state.identity.email;
    if (proLaunchSeen(email)) return;
    if (proLaunchTimerRef.current !== null) return;
    proLaunchTimerRef.current = window.setTimeout(() => {
      proLaunchTimerRef.current = null;
      if (proLaunchSeen(email)) return;
      setProLaunchOpen(true);
    }, 1400);
    return () => {
      if (proLaunchTimerRef.current !== null) {
        window.clearTimeout(proLaunchTimerRef.current);
        proLaunchTimerRef.current = null;
      }
    };
  }, [state.bootReady, state.screen, state.identity?.email]);
  const closeProLaunch = () => {
    if (state.identity?.email) markProLaunchSeen(state.identity.email);
    setProLaunchOpen(false);
  };
  const stateRef = useRef(state);
  stateRef.current = state;

  const set = useCallback((patch: Partial<AppState>) => {
    const prev = stateRef.current;
    const next = { ...prev, ...patch };
    const crossingBoard =
      !!patch.screen && patch.screen !== prev.screen && (patch.screen === 'whiteboard' || prev.screen === 'whiteboard');
    const apply = () => {
      stateRef.current = next;
      setState(next);
      const h = hashFor(next);
      if (window.location.hash !== h) history.pushState(null, '', h);
    };
    if (crossingBoard) {
      // white wipe when entering or leaving the classroom
      setVeil('cover');
      window.setTimeout(() => {
        apply();
        requestAnimationFrame(() => requestAnimationFrame(() => setVeil('fade')));
      }, 280);
    } else {
      apply();
    }
  }, []);

  /* veil 兜底:fade 动画的 animationend 在标签页隐藏/动画被系统禁用时可能丢失,
   * 绝不能因此白屏常驻——800ms 后强制收场 */
  useEffect(() => {
    if (veil !== 'fade') return;
    const t = window.setTimeout(() => setVeil('idle'), 800);
    return () => window.clearTimeout(t);
  }, [veil]);

  /* back/forward + manual hash edits */
  useEffect(() => {
    const onHash = () => {
      const p = stateFromHash();
      if (p) set(p);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [set]);

  /* 启动即同步造场账户:身份(get_user_info)+ 历史会话(list_past_conversations)
   * + 课程市场(marketplace/courses,本人 D1 课程 + 官方样例)。
   * 后端按会话成员隔离;纯静态托管下 fetch 失败 → null,UI 回退复刻演示数据。 */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [identity, conversations, marketCourses] = await Promise.all([
        fetchMe(),
        fetchConversations(),
        fetchMarketCourses(),
      ]);
      if (alive) set({
        identity,
        plan: (identity?.tier as AppState['plan']) || 'FREE',
        conversations,
        bootReady: true,
        ...(marketCourses ? { marketCourses, marketStale: false } : {}),
      });
    })();
    return () => {
      alive = false;
    };
  }, [set]);

  /* 进集市/我的课程页时按需重拉市场列表(新生成过课 → marketStale) */
  useEffect(() => {
    const screen = state.screen;
    if (screen !== 'marketplace' && screen !== 'courses') return;
    if (!state.marketStale && state.marketCourses !== null) return;
    let alive = true;
    void (async () => {
      const marketCourses = await fetchMarketCourses();
      if (alive && marketCourses) set({ marketCourses, marketStale: false });
    })();
    return () => {
      alive = false;
    };
  }, [state.screen, state.marketStale, state.marketCourses, set]);

  /* 历史会话按身份重拉:启动装载只跑一次,浏览器会话在页面存活期间被换掉时
   * (多账户切换/验收通道写 cookie)不重拉就会把上一账户的会话留在 state 里
   * 展示——"聊天记录串号"的观感来源。身份邮箱一变即重拉,并回填真实账户列表。 */
  const convLoadedEmailRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const email = state.identity?.email ?? null;
    if (convLoadedEmailRef.current === email) return;
    convLoadedEmailRef.current = email;
    let alive = true;
    void fetchConversations().then((rows) => {
      if (alive) set({ conversations: rows });
    });
    return () => {
      alive = false;
    };
  }, [state.identity?.email, set]);

  /* 进入历史/聊天页时静默刷新一次列表:其他标签页新建的会话、会话期间
   * cookie 被替换等场景下,内存列表可能落后于服务端真值。 */
  useEffect(() => {
    if (state.screen !== 'history' && state.screen !== 'chat') return;
    let alive = true;
    void fetchConversations().then((rows) => {
      if (alive && rows) set({ conversations: rows });
    });
    return () => {
      alive = false;
    };
  }, [state.screen, set]);

  /* 真实课程 UUID 深链与详情加载，带 loading / error 状态保护，彻底废除伪造课程 */
  useEffect(() => {
    const isCourseScreen = state.screen === 'coursePreview' || state.screen === 'courseJourney';
    const uuid = state.activeCourseUuid;
    if (!isCourseScreen || !uuid) return;
    // 如果已有对应的真实课程树则无需重复拉取
    if (state.generated && (state.generated as { courseUuid?: string }).courseUuid === uuid) return;

    let alive = true;
    const ctrl = new AbortController();
    void (async () => {
      try {
        set({ courseLoading: true, courseError: null });
        const detail = await fetchCourseDetail(uuid, ctrl.signal);
        if (!alive) return;
        if (detail) {
          const prevCover = (state.generated as { cover?: (ReturnType<typeof courseFromBackend>)['cover'] } | null)?.cover;
          const generated = {
            ...courseFromBackend(detail, detail.courseTitle),
            ...(prevCover ? { cover: prevCover } : {}),
            courseUuid: uuid,
          };
          set({
            generated,
            courseLoading: false,
            courseError: null,
          });
        } else {
          // 404 或未授权安全报错,回退 courses 屏避免白屏或伪造
          toast(L('This course is unavailable or no longer exists', '课程不存在或无权访问'));
          set({
            courseLoading: false,
            courseError: 'course_not_found',
            screen: 'courses',
          });
        }
      } catch {
        if (!alive) return;
        toast(L('Network issue — the course could not be loaded', '网络异常，课程加载失败'));
        set({
          courseLoading: false,
          courseError: 'network_error',
          screen: 'courses',
        });
      }
    })();

    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [state.screen, state.activeCourseUuid, state.generated, set]);

  const s = state.screen;
  const shell = s !== 'signin' && s !== 'onboarding' && s !== 'whiteboard';

  return (
    <I18nProvider>
      <div className={`hk-root${shell ? ' hk-shell' : ''}${state.sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
        <div className="hk-dotfield" />

        {shell && <LatticeSidebar state={state} set={set} />}
        {shell && <LatticeHeader state={state} set={set} />}

        {proLaunchOpen && (
          <ProLaunchModal
            onClose={closeProLaunch}
            onTryPro={() => {
              if (state.identity?.email) markProLaunchSeen(state.identity.email);
              setProLaunchOpen(false);
              set({ chatModel: 'pro', screen: 'chat' });
              toast(L('LATTICE Pro on — applies to new replies', '见界 Pro 已启用——下一条回复生效'));
            }}
          />
        )}

        {s === 'signin' && <SignIn state={state} set={set} />}
        {s === 'onboarding' && <Onboarding state={state} set={set} />}
        {s === 'home' && <Home state={state} set={set} />}
        <React.Suspense fallback={<div className="hk-page-loading" aria-busy="true"><span className="hk-skel-bar" /></div>}>
          {s === 'history' && <HistoryPage state={state} set={set} />}
          {s === 'feed' && <LearningFeed state={state} set={set} />}
          {s === 'courses' && <CoursesPage state={state} set={set} />}
          {(s === 'coursePreview' || s === 'courseJourney') && <CourseJourney state={state} set={set} />}
          {s === 'marketplace' && <MarketplacePage state={state} set={set} />}
          {s === 'plans' && <PlansPage state={state} set={set} />}
          {s === 'chat' && <ChatPage state={state} set={set} />}
          {s === 'create' && <CreatePage state={state} set={set} />}
          {s === 'whiteboard' && (
            /* key 强制换课/换模式时整体重挂载:旧课的音频、字幕、相机、测验绝不污染新课 */
            <WhiteboardPage
              key={`${state.activeCourseUuid ?? 'demo'}|${state.activeLectureId ?? ''}|${state.activeSessionId ?? ''}|${state.whiteboardMode}`}
              state={state}
              set={set}
            />
          )}
        </React.Suspense>

        {state.settingsOpen && <SettingsModal state={state} set={set} />}

        {veil !== 'idle' && (
          <div className={`app-veil${veil === 'fade' ? ' fade' : ''}`} onAnimationEnd={() => veil === 'fade' && setVeil('idle')} />
        )}
        <ToastHost />
      </div>
    </I18nProvider>
  );
};

export default App;
