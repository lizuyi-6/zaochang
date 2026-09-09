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
import { buildGeneratedCourse, type GeneratedCourse } from './replica/generate';
import { fetchConversations, fetchMarketCourses, fetchMe } from './replica/backend';
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
      /* ?topic= — 从集市/课程页点开的伪生成课程深链(同一话题重建同一份课程) */
      const genPreview = q.has('topic') ? buildGeneratedCourse(decodeURIComponent(q.get('topic') ?? '')) : null;
      const coverKeys = ['sociology', 'bio', 'ml', 'ai', 'history', 'prompt', 'psych', 'sat', 'philo', 'stats'];
      const coverParam = q.get('cover');
      return {
        screen: 'coursePreview',
        ...(genPreview
          ? { generated: { ...genPreview, ...(coverParam && coverKeys.includes(coverParam) ? { cover: coverParam as GeneratedCourse['cover'] } : {}) } }
          : {}),
        ...extras,
      };
    }
    case '/course/journey':
      return {
        screen: 'courseJourney',
        courseJoined: true,
        ...(q.has('done') ? { lectureDone: true } : {}),
        /* ?prompt=1 = lecture-complete practice modal (ref 61) */
        ...(q.has('prompt') ? { lectureDone: true, lectureCompletePrompt: true } : {}),
        /* ?topic= — 伪生成课程深链(同一话题重建同一份课程);cover 让封面风格一并还原 */
        ...(q.has('topic')
          ? {
              generated: (() => {
                const g = buildGeneratedCourse(decodeURIComponent(q.get('topic') ?? ''));
                const coverKeys = ['sociology', 'bio', 'ml', 'ai', 'history', 'prompt', 'psych', 'sat', 'philo', 'stats'];
                const coverParam = q.get('cover');
                return coverParam && coverKeys.includes(coverParam) ? { ...g, cover: coverParam as GeneratedCourse['cover'] } : g;
              })(),
            }
          : {}),
        ...extras,
      };
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
    case 'coursePreview':
      return s.generated
        ? `#/course/preview?topic=${encodeURIComponent(s.generated.topic)}${s.generated.cover ? `&cover=${s.generated.cover}` : ''}`
        : '#/course/preview';
    case 'courseJourney':
      return s.generated
        ? `#/course/journey?topic=${encodeURIComponent(s.generated.topic)}${s.generated.cover ? `&cover=${s.generated.cover}` : ''}`
        : '#/course/journey';
    case 'whiteboard':
      return s.whiteboardMode === 'practice' ? '#/whiteboard?practice=1' : '#/whiteboard';
    default:
      return `#/${s.screen}`;
  }
}

/* ---------------- App ---------------- */

type Veil = 'idle' | 'cover' | 'fade';

export const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => ({ ...initialAppState, ...(stateFromHash() ?? {}) }));
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
      if (alive) set({ identity, conversations, bootReady: true, ...(marketCourses ? { marketCourses, marketStale: false } : {}) });
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

  const s = state.screen;
  const shell = s !== 'signin' && s !== 'onboarding' && s !== 'whiteboard';

  return (
    <I18nProvider>
      <div className={`hk-root${state.sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
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
