import { ASSET_BASE } from '../services/baseUrl';
import React from 'react';
import type { UserInfo } from '../services/api';

interface HeaderProps {
  user: UserInfo | null;
  onOpenVoiceSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, onOpenVoiceSettings }) => {
  const credits = user?.subscription?.remaining_credits ?? 20;

  return (
    <div className="avatar-container">
      {/* 积分徽章 */}
      <div className="credits-badge">
        <span className="credits-badge-tier">FREE</span>
        <span className="credits-badge-credits" title="Credits renew every 12 hours">
          <span className="credits-badge-amount">{credits}</span>
          <span style={{ marginLeft: 4 }}>credits left</span>
        </span>
      </div>

      {/* 语言切换 */}
      <button
        type="button"
        className="language-selector-button"
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          border: '1px solid #E5E5E5',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer'
        }}
        title="Switch language"
      >
        <img src={`${ASSET_BASE}translate.svg`} alt="Language" style={{ width: 16, height: 16 }} />
      </button>

      {/* 创始人沟通按钮 */}
      <button
        type="button"
        className="talk-to-founders-button"
        onClick={onOpenVoiceSettings}
        title="Voice and Settings"
      >
        <img src={`${ASSET_BASE}pages/mainPages/home/feedback.svg`} alt="Settings" className="talk-to-founders-icon" />
        <span>Settings & Voice</span>
      </button>

      {/* 标志性彩虹环头像 */}
      <div className="avatar-frame" onClick={onOpenVoiceSettings} title="User Account">
        <img src={`${ASSET_BASE}avatar/1.svg`} className="avatar-image" alt="Avatar" />
      </div>
    </div>
  );
};
