import React, { useState } from 'react';
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

  return (
    <>
      {state.sidebarCollapsed && (
        <button
          className="hk-sidebar-expand"
          type="button"
          title={t('courseSession.expandSidebar')}
          onClick={() => set({ sidebarCollapsed: false })}
        >
          <ChevronsRight size={16} />
        </button>
      )}
      <div className="hk-sidebar">
        <div className="hk-sidebar-logo-row">
          <span style={{ cursor: 'pointer' }} onClick={() => set({ screen: 'home' })}>
            <Logo size={22} />
          </span>
          <span
            className="hk-sidebar-collapse"
            title={t('courseSession.collapseSidebar')}
            onClick={() => set({ sidebarCollapsed: true })}
          >
            <ChevronsLeft size={16} />
          </span>
        </div>

        <div className="hk-nav">
          {NAV.map((n) => (
            <div
              key={n.id}
              className={`hk-nav-item ${state.screen === n.id ? 'active' : ''}`}
              onClick={() => set({ screen: n.id as AppState['screen'] })}
            >
              <n.icon size={18} strokeWidth={1.8} />
              <span>{t(n.key)}</span>
            </div>
          ))}
          <div
            className={`hk-nav-item more ${moreOpen ? 'open' : ''}`}
            onClick={() => setMoreOpen(!moreOpen)}
          >
            <Ellipsis size={18} strokeWidth={1.8} />
            <span>{t('sidebar.more')}</span>
          </div>
        </div>

        {showContinue && (
          <div className="hk-side-section">
            <div className="hk-side-section-label">{t('sidebar.continueLearning')}</div>
            <div
              className="hk-continue-card"
              onClick={() => set({ screen: 'courseJourney' })}
            >
              <div className="hk-continue-top">
                <span className="hk-chip-lecture">{t('chatResponse.courseGeneration.lectureTag')}</span>
                <span className="hk-continue-title">{L('Context and Occasion', '语境与场合')}</span>
              </div>
              <span className="hk-continue-sub">{L('Public Speaking', '公开演讲')}</span>
            </div>
          </div>
        )}

        <div className="hk-side-section" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="hk-side-section-label" style={{ cursor: 'pointer' }} onClick={() => setActivitiesOpen(!activitiesOpen)}>
            <span>{t('sidebar.recentActivities')}</span>
            <ChevronDown
              size={14}
              style={{ transform: activitiesOpen ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s', color: '#9CA3AF' }}
            />
          </div>
          {activitiesOpen && (
            <div className="hk-activities" style={{ overflowY: 'auto' }}>
              {/* 真实历史(按造场账户隔离);conversations 为 null = 拉取失败/纯静态
               * 托管,回退复刻演示列表;[] = 真实为空,展示空态而非假数据。 */}
              {state.conversations === null
                ? recentActivities().map((a, i) => (
                    <div
                      key={i}
                      className={`hk-activity-row ${state.screen === 'chat' && i === 1 ? 'active' : ''}`}
                      onClick={() => set({ screen: 'chat' })}
                      title={a.replace('…', '')}
                    >
                      <span>{a}</span>
                    </div>
                  ))
                : state.conversations.map((a) => (
                    <div
                      key={a.id}
                      className={`hk-activity-row ${state.screen === 'chat' && state.activeConversationId === a.id ? 'active' : ''}`}
                      onClick={() => set({ screen: 'chat', activeConversationId: a.id })}
                      title={a.title}
                    >
                      <span>{a.title}</span>
                    </div>
                  ))}
              {state.conversations !== null && state.conversations.length === 0 && (
                <div className="hk-activity-row" style={{ color: '#9CA3AF' }}>
                  <span>{L('No conversations yet', '暂无会话')}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="hk-sidebar-footer" onClick={() => setWhatsNewOpen(true)}>
          <Sparkles size={12} />
          <span>{t('whatsNew.triggerLabel', { version: '1.3.13' })}</span>
        </div>
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
