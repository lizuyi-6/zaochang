import React, { useEffect, useRef, useState } from 'react';
import {
  Home, GraduationCap, CalendarDays, History, Store, Ellipsis, ChevronsLeft, ChevronsRight,
  ChevronDown, Sparkles, Library,
} from 'lucide-react';
import { Logo } from './illustrations';
import { recentActivities } from './data';
import { useI18n } from './i18n';
import { L } from './i18n/content';
import { WhatsNewModal } from './WhatsNewModal';
import { toast } from './toast';
import type { AppState, AppAction } from './types';

const NAV = [
  { id: 'home', key: 'sidebar.home', icon: Home },
  { id: 'courses', key: 'sidebar.courses', icon: GraduationCap },
  { id: 'feed', key: 'sidebar.learningFeed', icon: CalendarDays },
  { id: 'history', key: 'sidebar.history', icon: History },
  { id: 'marketplace', key: 'sidebar.marketplace', icon: Store },
] as const;

export const ReplicaSidebar: React.FC<{ state: AppState; set: AppAction }> = ({ state, set }) => {
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = useState(state.moreOpen);
  const [activitiesOpen, setActivitiesOpen] = useState(true);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const showContinue = state.lectureDone;
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeMobile = () => { setMobileOpen(false); setMoreOpen(false); };
  const navigate: AppAction = (patch) => { closeMobile(); set(patch); };

  useEffect(() => {
    const query = window.matchMedia('(max-width: 768px)');
    const change = () => { setMobile(query.matches); setMobileOpen(false); setMoreOpen(false); };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [state.screen, state.activeConversationId]);

  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;
    drawer.inert = mobile ? !mobileOpen : state.sidebarCollapsed;
  }, [mobile, mobileOpen, state.sidebarCollapsed]);

  useEffect(() => {
    const drawer = drawerRef.current;
    if (!mobile || !mobileOpen || !drawer) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : triggerRef.current;
    const inertElements = new Map<HTMLElement, boolean>();
    // Inert siblings up to body, including header, pages, overlays and portals.
    const inertBackground = () => {
      let branch: HTMLElement = drawer;
      while (branch.parentElement) {
        for (const sibling of Array.from(branch.parentElement.children)) {
          if (sibling instanceof HTMLElement && sibling !== branch && !sibling.classList.contains('hk-mobile-backdrop')) {
            if (!inertElements.has(sibling)) inertElements.set(sibling, sibling.inert);
            sibling.inert = true;
          }
        }
        branch = branch.parentElement;
        if (branch === document.body) break;
      }
    };
    inertBackground();
    const observer = new MutationObserver(inertBackground);
    observer.observe(document.body, { childList: true, subtree: true });
    const focusable = () => Array.from(drawer.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'))
      .filter((element) => element.getClientRects().length > 0 && !element.closest('[inert]'));
    (focusable()[0] ?? drawer).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setMobileOpen(false);
        setMoreOpen(false);
      }
      if (event.key === 'Tab') {
        const items = focusable();
        const first = items[0] ?? drawer;
        const last = items[items.length - 1] ?? drawer;
        if (!items.length || !drawer.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    };
    const focusin = (event: FocusEvent) => {
      if (!drawer.contains(event.target as Node)) (focusable()[0] ?? drawer).focus();
    };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', focusin);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', focusin);
      inertElements.forEach((wasInert, element) => { element.inert = wasInert; });
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected && previousFocus.getClientRects().length) previousFocus.focus();
    };
  }, [mobile, mobileOpen]);

  return (
    <>
      {mobile && (
        <button
          ref={triggerRef}
          className="hk-sidebar-expand hk-mobile-trigger"
          type="button"
          aria-label={t('courseSession.expandSidebar')}
          aria-expanded={mobileOpen}
          aria-controls="hk-primary-sidebar"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <ChevronsRight size={16} />
        </button>
      )}
      {!mobile && state.sidebarCollapsed && (
        <button
          className="hk-sidebar-expand"
          type="button"
          aria-label={t('courseSession.expandSidebar')}
          onClick={() => set({ sidebarCollapsed: false })}
        >
          <ChevronsRight size={16} />
        </button>
      )}
      {mobile && mobileOpen && (
        <div
          className="hk-mobile-backdrop"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}
      <div
        id="hk-primary-sidebar"
        ref={drawerRef}
        className={`hk-sidebar${mobile ? ' hk-sidebar-drawer' : ''}${mobile && mobileOpen ? ' open' : ''}`}
        tabIndex={-1}
      >
        <div className="hk-sidebar-logo-row">
          <button
            type="button"
            className="hk-sidebar-brand-btn"
            onClick={() => navigate({ screen: 'home' })}
            style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
          >
            <Logo size={22} />
          </button>
          <button
            type="button"
            className="hk-sidebar-collapse"
            aria-label={t('courseSession.collapseSidebar')}
            onClick={() => (mobile ? closeMobile() : set({ sidebarCollapsed: true }))}
          >
            <ChevronsLeft size={16} />
          </button>
        </div>

        <div className="hk-nav">
          {NAV.map((n) => (
            <button
              type="button"
              key={n.id}
              className={`hk-nav-item ${state.screen === n.id ? 'active' : ''}`}
              onClick={() => navigate({ screen: n.id as AppState['screen'] })}
            >
              <n.icon size={18} strokeWidth={1.8} />
              <span>{t(n.key)}</span>
            </button>
          ))}
          <button
            type="button"
            className={`hk-nav-item more ${moreOpen ? 'open' : ''}`}
            onClick={() => setMoreOpen(!moreOpen)}
          >
            <Ellipsis size={18} strokeWidth={1.8} />
            <span>{t('sidebar.more')}</span>
          </button>
        </div>

        {showContinue && (
          <div className="hk-side-section">
            <div className="hk-side-section-label">{t('sidebar.continueLearning')}</div>
            <button
              type="button"
              className="hk-continue-card"
              onClick={() => navigate({ screen: 'courseJourney' })}
            >
              <div className="hk-continue-top">
                <span className="hk-chip-lecture">{t('chatResponse.courseGeneration.lectureTag')}</span>
                <span className="hk-continue-title">{L('Context and Occasion', '语境与场合')}</span>
              </div>
              <span className="hk-continue-sub">{L('Public Speaking', '公开演讲')}</span>
            </button>
          </div>
        )}

        <div className="hk-side-section" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <button
            type="button"
            className="hk-side-section-label"
            style={{ cursor: 'pointer', width: '100%', border: 'none', background: 'none' }}
            onClick={() => setActivitiesOpen(!activitiesOpen)}
          >
            <span>{t('sidebar.recentActivities')}</span>
            <ChevronDown
              size={14}
              style={{ transform: activitiesOpen ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s', color: '#9CA3AF' }}
            />
          </button>
          {activitiesOpen && (
            <div className="hk-activities" style={{ overflowY: 'auto' }}>
              {/* 真实历史(按造场账户隔离);null 且 bootReady=false = 首次拉取在途,
               * 渲染加载骨架,不再先展示演示数据又被真实结果替换(生产环境闪现);
               * null 且 bootReady = 拉取失败/纯静态托管,回退复刻演示列表;
               * [] = 真实为空,展示空态而非假数据。 */}
              {state.conversations === null
                ? !state.bootReady
                  ? [0, 1, 2, 3].map((i) => (
                      <div key={i} className="hk-activity-row hk-skel-row" aria-hidden="true">
                        <span className="hk-skel-bar" style={{ width: `${52 + (i % 3) * 12}%` }} />
                      </div>
                    ))
                  : recentActivities().map((a, i) => (
                      <button
                        type="button"
                        key={i}
                        className={`hk-activity-row ${state.screen === 'chat' && i === 1 ? 'active' : ''}`}
                        onClick={() => navigate({ screen: 'chat' })}
                        title={a.replace('…', '')}
                      >
                        <span>{a}</span>
                      </button>
                    ))
                : state.conversations.map((a) => (
                    <button
                      type="button"
                      key={a.id}
                      className={`hk-activity-row ${state.activeConversationId === a.id ? 'active' : ''}`}
                      onClick={() => navigate({ screen: 'chat', activeConversationId: a.id })}
                    >
                      <span>{a.title}</span>
                    </button>
                  ))}
              {state.conversations !== null && state.conversations.length === 0 && (
                <div className="hk-activity-row" style={{ color: '#9CA3AF' }}>
                  <span>{L('No conversations yet', '暂无会话')}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          className="hk-sidebar-footer"
          onClick={() => { closeMobile(); setWhatsNewOpen(true); }}
        >
          <Sparkles size={12} />
          <span>{t('whatsNew.triggerLabel', { version: '1.3.13' })}</span>
        </button>
      </div>

      {moreOpen && (
        <div
          className="hk-more-flyout"
          onClick={() => {
            setMoreOpen(false);
            toast(L('Knowledge Base is not available in this build yet', '知识库功能尚未接入'));
          }}
        >
          <Library size={16} />
          <span>{t('sidebar.drive')}</span>
          <span className="hk-soon">{L('SOON', '即将上线')}</span>
        </div>
      )}

      {whatsNewOpen && <WhatsNewModal onClose={() => setWhatsNewOpen(false)} />}
    </>
  );
};
