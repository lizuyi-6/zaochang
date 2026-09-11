import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState } from './replica/types';
import { initialAppState } from './replica/types';
import { ReplicaSidebar } from './replica/Sidebar';
import { ReplicaHeader } from './replica/Header';
import SettingsModal from './replica/SettingsModal';
import { SignIn } from './replica/pages/SignIn';
import { Onboarding } from './replica/pages/Onboarding';
import { Home } from './replica/pages/Home';
import { HistoryPage } from './replica/pages/HistoryPage';
import { LearningFeed } from './replica/pages/LearningFeed';
import CoursesPage from './replica/pages/CoursesPage';
import CourseJourney from './replica/pages/CourseJourney';
import MarketplacePage from './replica/pages/MarketplacePage';
import { PlansPage } from './replica/pages/PlansPage';
import { ChatPage } from './replica/pages/ChatPage';
import { WhiteboardPage } from './replica/whiteboard/WhiteboardPage';
import { I18nProvider } from './replica/i18n';
import { GenerationOverlay } from './replica/GenerationOverlay';
import { ToastHost } from './replica/toast';
import { courseFromBackend } from './replica/generate';
import { fetchConversations, fetchCourseDetail, fetchMarketCourses, fetchMe } from './replica/backend';
import './replica/replica.css';

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
      // 路由层严禁 buildGeneratedCourse 伪造课程。必须依赖真实 UUID，旧 topic 安全回退课程列表
      const uuid = q.get('uuid') || q.get('id');
      if (uuid) {
        return {
          screen: 'coursePreview',
          activeCourseUuid: uuid,
          courseLoading: true,
          courseError: null,
          courseJoined: false,
          ...extras,
        };
      }
      return { screen: 'courses', courseLoading: false, courseError: null, ...extras };
    }
    case '/course/journey': {
      const uuid = q.get('uuid') || q.get('id');
      if (uuid) {
        return {
          screen: 'courseJourney',
          activeCourseUuid: uuid,
          courseJoined: true,
          courseLoading: true,
          courseError: null,
          ...(q.has('done') ? { lectureDone: true } : {}),
          ...(q.has('prompt') ? { lectureDone: true, lectureCompletePrompt: true } : {}),
          ...extras,
        };
      }
      return { screen: 'courses', courseLoading: false, courseError: null, ...extras };
    }
    case '/marketplace':
      return { screen: 'marketplace', ...done, ...extras };
    case '/plans':
      return { screen: 'plans', ...done, ...extras };
    case '/chat':
      return { screen: 'chat', ...done, ...extras };
    case '/whiteboard':
      return { screen: 'whiteboard', whiteboardMode: q.has('practice') ? 'practice' : 'lecture' };
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
      return uuid ? `#/course/preview?uuid=${encodeURIComponent(uuid)}` : '#/courses';
    }
    case 'courseJourney': {
      const uuid = s.activeCourseUuid || (s.generated as { courseUuid?: string })?.courseUuid;
      return uuid ? `#/course/journey?uuid=${encodeURIComponent(uuid)}` : '#/courses';
    }
    case 'whiteboard':
      return s.whiteboardMode === 'practice' ? '#/whiteboard?practice=1' : '#/whiteboard';
    default:
      return `#/${s.screen}`;
  }
}

/* ---------------- App ---------------- */

type Veil = 'idle' | 'cover' | 'fade';

export const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => ({ ...initialAppState, ...stateFromHash() }));
  const [veil, setVeil] = useState<Veil>('idle');
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
          const generated = {
            ...courseFromBackend(detail, detail.courseTitle),
            courseUuid: uuid,
          };
          set({
            generated,
            courseLoading: false,
            courseError: null,
          });
        } else {
          // 404 或未授权安全报错，回退 courses 屏避免白屏或伪造
          set({
            courseLoading: false,
            courseError: 'course_not_found',
            screen: 'courses',
          });
        }
      } catch {
        if (!alive) return;
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

        {shell && <ReplicaSidebar state={state} set={set} />}
        {shell && <ReplicaHeader state={state} set={set} />}

        {s === 'signin' && <SignIn state={state} set={set} />}
        {s === 'onboarding' && <Onboarding state={state} set={set} />}
        {s === 'home' && <Home state={state} set={set} />}
        {s === 'history' && <HistoryPage state={state} set={set} />}
        {s === 'feed' && <LearningFeed state={state} set={set} />}
        {s === 'courses' && <CoursesPage state={state} set={set} />}
        {(s === 'coursePreview' || s === 'courseJourney') && <CourseJourney state={state} set={set} />}
        {s === 'marketplace' && <MarketplacePage state={state} set={set} />}
        {s === 'plans' && <PlansPage state={state} set={set} />}
        {s === 'chat' && <ChatPage state={state} set={set} />}
        {s === 'whiteboard' && <WhiteboardPage state={state} set={set} />}

        {state.settingsOpen && <SettingsModal state={state} set={set} />}
        {state.generating && <GenerationOverlay state={state} set={set} />}

        {veil !== 'idle' && (
          <div className={`app-veil${veil === 'fade' ? ' fade' : ''}`} onAnimationEnd={() => veil === 'fade' && setVeil('idle')} />
        )}
        <ToastHost />
      </div>
    </I18nProvider>
  );
};

export default App;
