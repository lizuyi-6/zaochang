import React, { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { L } from './i18n/content';

/**
 * 见界 Pro 上线宣布:一次性动画弹窗。
 * 每账户只弹一次(localStorage hk_pro_launch_seen:<email>),首页落定后延迟出现,
 * 不与欢迎回来接管层打架。CTA 直切见界 Pro 并进聊天页;任何关闭路径都记「已看过」。
 */
export const PRO_LAUNCH_KEY_PREFIX = 'hk_pro_launch_seen:';

export function proLaunchSeen(email: string): boolean {
  try {
    return localStorage.getItem(PRO_LAUNCH_KEY_PREFIX + email) === '1';
  } catch {
    return true; // 存储不可用 → 不弹(宁缺勿扰)
  }
}

export function markProLaunchSeen(email: string): void {
  try {
    localStorage.setItem(PRO_LAUNCH_KEY_PREFIX + email, '1');
  } catch {
    /* 忽略 */
  }
}

export const ProLaunchModal: React.FC<{
  onClose: () => void;
  onTryPro: () => void;
}> = ({ onClose, onTryPro }) => {
  /* 进场动画期间禁止立即关:350ms 内误触会把"一次性"耗在最难看的帧上 */
  const readyRef = useRef(false);
  useEffect(() => {
    const t = window.setTimeout(() => {
      readyRef.current = true;
    }, 350);
    return () => window.clearTimeout(t);
  }, []);
  const guard = (fn: () => void) => () => {
    if (!readyRef.current) return;
    fn();
  };

  return (
    <div
      className="pl-scrim"
      onClick={guard(onClose)}
      role="dialog"
      aria-modal="true"
      aria-label={L('Introducing LATTICE Pro', '见界 Pro 上线')}
    >
      <div className="pl-card" onClick={(e) => e.stopPropagation()}>
        <span className="pl-spark s1" aria-hidden="true">✦</span>
        <span className="pl-spark s2" aria-hidden="true">✦</span>
        <span className="pl-spark s3" aria-hidden="true">✦</span>

        <button className="pl-x" type="button" aria-label={L('Close', '关闭')} onClick={guard(onClose)}>
          ×
        </button>

        <span className="pl-badge">
          <Sparkles size={12} />
          {L('NEW', '新上线')}
        </span>

        <div className="pl-crest" aria-hidden="true">✦</div>

        <h2 className="pl-title">
          <span className="pl-title-shine">{L('LATTICE Pro is here', '见界 Pro 正式上线')}</span>
        </h2>

        <p className="pl-desc">
          {L(
            'Deeper reasoning, more thorough explanations. Thinking takes longer — answers feel calmer and more complete.',
            '更深推理，更透彻的讲解。思考时间会更长，回答更从容、更完整。',
          )}
        </p>

        <p className="pl-offer">
          {L('Launch offer', '新上线限时')}：<del>5</del>
          <b> {L('2 credits', '2 积分')}</b>
          <span className="pl-offer-note"> {L('same cost as Flash', '消耗对齐见界 Flash')}</span>
        </p>

        <button className="pl-cta" type="button" onClick={guard(onTryPro)}>
          {L('Try LATTICE Pro', '立即体验见界 Pro')}
        </button>
        <button className="pl-later" type="button" onClick={guard(onClose)}>
          {L('Maybe later', '先逛逛')}
        </button>
      </div>
    </div>
  );
};
