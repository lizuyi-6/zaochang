import { ASSET_BASE } from '../services/baseUrl';
import React, { useState } from 'react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  conversations: any[];
  onSelectConversation?: (conv: any) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  conversations,
  onSelectConversation
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isActivitiesCollapsed, setIsActivitiesCollapsed] = useState(false);

  const toggleSidebar = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <>
      {!isExpanded && (
        <div
          className="sidebar-floating-button"
          onClick={toggleSidebar}
          title="Open Sidebar"
        >
          <img src={`${ASSET_BASE}components/sidebar/sidebar-expand.svg`} alt="Expand Sidebar" />
        </div>
      )}

      <div className={`sidebar ${isExpanded ? 'expanded' : 'compact'}`}>
        <div className="sidebar-content-wrapper">
          {/* Logo Header */}
          <div className="sidebar-logo-header">
            <img
              src={isExpanded ? `${ASSET_BASE}hyperknow-logo-w-text.svg` : `${ASSET_BASE}hyperknow_logo.svg`}
              alt="HyperKnow"
              className="sidebar-logo"
            />
            <div className="collapse-icon expanded" onClick={toggleSidebar} title={isExpanded ? "Collapse" : "Expand"}>
              <img
                src={isExpanded ? `${ASSET_BASE}components/sidebar/sidebar-collapse.svg` : `${ASSET_BASE}components/sidebar/sidebar-expand.svg`}
                alt={isExpanded ? "Collapse" : "Expand"}
                style={{ width: '18px', height: '20px' }}
              />
            </div>
          </div>

          {/* Sidebar Body */}
          <div className="sidebar-body">
            <div className="nav-icons-group">
              <div
                className={`nav-item ${isExpanded ? 'expanded' : ''} ${currentTab === 'home' ? 'active' : ''}`}
                onClick={() => onSelectTab('home')}
                title={!isExpanded ? "Home" : undefined}
              >
                <img src={`${ASSET_BASE}components/sidebar/home.svg?v=2`} alt="Home" />
                <span className="button-label">Home</span>
              </div>

              <div
                className={`nav-item ${isExpanded ? 'expanded' : ''} ${currentTab === 'courses' ? 'active' : ''}`}
                onClick={() => onSelectTab('courses')}
                title={!isExpanded ? "Courses" : undefined}
              >
                <img src={`${ASSET_BASE}components/sidebar/courses.svg?v=1`} alt="Courses" />
                <span className="button-label">Courses</span>
              </div>

              <div
                className={`nav-item ${isExpanded ? 'expanded' : ''} ${currentTab === 'feed' ? 'active' : ''}`}
                onClick={() => onSelectTab('feed')}
                title={!isExpanded ? "Learning Feed" : undefined}
              >
                <img src={`${ASSET_BASE}components/sidebar/learning-feed.svg?v=2`} alt="Learning Feed" />
                <span className="button-label">Learning Feed</span>
              </div>

              <div
                className={`nav-item ${isExpanded ? 'expanded' : ''} ${currentTab === 'history' ? 'active' : ''}`}
                onClick={() => onSelectTab('history')}
                title={!isExpanded ? "Study History" : undefined}
              >
                <img src={`${ASSET_BASE}components/sidebar/history.svg?v=2`} alt="Study History" />
                <span className="button-label">History</span>
              </div>

              <div
                className={`nav-item ${isExpanded ? 'expanded' : ''} ${currentTab === 'marketplace' ? 'active' : ''}`}
                onClick={() => onSelectTab('marketplace')}
                title={!isExpanded ? "Marketplace" : undefined}
              >
                <img src={`${ASSET_BASE}pages/mainPages/home/craft-courses-tab/market-place.svg`} alt="Marketplace" />
                <span className="button-label">Marketplace</span>
              </div>
            </div>

            {/* Activities Section */}
            <div className="activities-section">
              <div className="sidebar-history-header">
                <h3>Recent Activities</h3>
                <img
                  src={`${ASSET_BASE}components/sidebar/chevron-down.svg`}
                  alt="Toggle Activities"
                  className={`chevron-icon ${isActivitiesCollapsed ? 'collapsed' : 'expanded'}`}
                  onClick={() => setIsActivitiesCollapsed(!isActivitiesCollapsed)}
                  style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
                />
              </div>

              {!isActivitiesCollapsed && (
                <div className="conversation-list">
                  {conversations.length === 0 ? (
                    <div className="no-activities" style={{ padding: '8px 12px', fontSize: '12px', color: '#878787' }}>
                      No activity yet
                    </div>
                  ) : (
                    conversations.map((c, i) => (
                      <div
                        key={c.conversation_id || i}
                        className="conversation-item activity-item"
                        onClick={() => onSelectConversation && onSelectConversation(c)}
                      >
                        <div className="activity-title-row" style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                          <img
                            src={`${ASSET_BASE}components/sidebar/activity-conversation.svg`}
                            alt=""
                            style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.7 }}
                          />
                          <span style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.title || 'Conversation'}
                          </span>
                        </div>
                        <div className="conversation-menu-button">
                          <img src={`${ASSET_BASE}components/sidebar/star.svg`} alt="Star" style={{ width: 13, height: 13, opacity: 0.5 }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Version Footer */}
            <div className="sidebar-version-footer">
              <button
                className="version-tag"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: 'none',
                  background: 'none',
                  fontSize: '12px',
                  color: '#878787',
                  cursor: 'pointer'
                }}
              >
                <img src={`${ASSET_BASE}components/versionUpdateLog/log.svg`} alt="" style={{ width: 14, height: 14 }} />
                <span>What's new · v1.3.13</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
