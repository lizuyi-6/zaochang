import React, { useState } from 'react';
import { Headset, Sparkles, CreditCard, Gift, Smile, SlidersHorizontal, Podcast, LogOut, Flag, Upload } from 'lucide-react';
import { AvatarCat } from './illustrations';
import { LanguageSwitcher } from './i18n/LanguageSwitcher';
import { useI18n } from './i18n';
import { L } from './i18n/content';
import { SupportModal } from './SupportModal';
import { WhatsNewModal } from './WhatsNewModal';
import { copyText, shareLink } from './actions';
import { toast } from './toast';
import type { AppState, AppAction } from './types';

export const ReplicaHeader: React.FC<{ state: AppState; set: AppAction }> = ({ state, set }) => {
  const { t } = useI18n();
  const [supportTitle, setSupportTitle] = useState<string | null>(null);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  /* Header cluster varies per screen (reference: 17/22/23/26/20; feed/history/marketplace have none). */
  const s = state.screen;
  if (s === 'marketplace' || s === 'history' || s === 'feed') return null;

  const energy = state.identity ? state.identity.credits : state.lectureDone ? 15 : 20;
  const showPlan = s !== 'chat';
  /* 邀请:复制造场链接(邀请码体系在主站注册侧,这里给的是可直接打开的入口) */
  const copyInvite = async () => {
    const ok = await copyText(`${window.location.origin}/?utm_source=hyperknow&utm_medium=invite`);
    toast(
      ok
        ? L('Invite link copied — share it with a friend', '邀请链接已复制——发给朋友吧')
        : L('Could not copy the link', '复制链接失败'),
    );
  };
  const cta =
    s === 'home' ? (
      <button className="hk-founders-btn" type="button" onClick={() => setSupportTitle(t('home.talkToFounders'))}>
        <Headset size={18} />
        <span>{t('home.talkToFounders')}</span>
      </button>
    ) : s === 'courses' ? (
      <button className="hk-founders-btn" type="button" onClick={() => void copyInvite()}>
        <Gift size={16} />
        <span>{t('home.inviteAndEarn')}</span>
      </button>
    ) : s === 'courseJourney' || s === 'chat' ? (
      <button className="hk-founders-btn" type="button" onClick={() => setSupportTitle(t('chatResponse.haveAnIssue'))}>
        <Flag size={15} />
        <span>{t('chatResponse.haveAnIssue')}</span>
      </button>
    ) : null;

  return (
    <>
      <div className="hk-header">
        {showPlan && (
          <>
            <span className="hk-free-badge">{state.identity?.tier ?? 'FREE'}</span>
            <span className="hk-energy" title={L('Energy', '能量')}>
              <Sparkles size={16} />
              <span>{energy}</span>
            </span>
          </>
        )}
        <LanguageSwitcher />
        {s === 'chat' && (
          <button
            className="hk-icon-btn"
            title={t('chatResponse.share')}
            onClick={() => void shareLink(window.location.href, L('Hyperknow conversation', 'Hyperknow 对话'))}
          >
            <Upload size={16} />
          </button>
        )}
        {cta}
        <span
          style={{ cursor: 'pointer', display: 'inline-flex' }}
          onClick={(e) => {
            e.stopPropagation();
            set({ avatarMenuOpen: !state.avatarMenuOpen });
          }}
        >
          <AvatarCat size={36} ring={state.avatarMenuOpen} />
        </span>
      </div>

      {state.avatarMenuOpen && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 55 }}
            onClick={() => set({ avatarMenuOpen: false })}
          />
          <div className="hk-avatar-menu">
            {[
              { label: t('accountDropdown.subscription'), icon: CreditCard, action: () => set({ screen: 'plans', avatarMenuOpen: false }) },
              { label: t('home.inviteAndEarn'), icon: Gift, action: () => { set({ avatarMenuOpen: false }); void copyInvite(); } },
              {
                label: t('home.earnAsAffiliate'),
                icon: Smile,
                action: () => {
                  set({ avatarMenuOpen: false });
                  setSupportTitle(t('home.earnAsAffiliate'));
                },
              },
              { label: t('accountDropdown.settings'), icon: SlidersHorizontal, action: () => set({ settingsOpen: true, settingsTab: 'general', avatarMenuOpen: false }) },
              {
                label: t('accountDropdown.stayConnected'),
                icon: Podcast,
                action: () => {
                  set({ avatarMenuOpen: false });
                  setWhatsNewOpen(true);
                },
              },
              { label: t('accountDropdown.signOut'), icon: LogOut, action: () => window.location.assign('/signout') },
            ].map((item) => (
              <button
                key={item.label}
                className="hk-avatar-menu-item"
                onClick={() => (item.action ? item.action() : set({ avatarMenuOpen: false }))}
              >
                <item.icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {supportTitle && <SupportModal title={supportTitle} onClose={() => setSupportTitle(null)} />}
      {whatsNewOpen && <WhatsNewModal onClose={() => setWhatsNewOpen(false)} />}
    </>
  );
};
