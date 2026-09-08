import React from 'react';
import { BadgeCheck, CheckCircle2 } from 'lucide-react';
import type { PageProps } from '../types';
import { Logo, MintMark } from '../illustrations';
import { useI18n, TRich } from '../i18n';
import { L } from '../i18n/content';
import { LanguageSwitcher } from '../i18n/LanguageSwitcher';
import './SignIn.css';

/**
 * 登录屏:版式 1:1 复刻,但认证不做伪造——登录统一交给造场账户
 * (站内 /signin 的 lattice 变体:仅邮箱验证码,无第三方 OAuth)。
 * 点击后整页跳转到造场登录,成功后经 return_to 回到 /lattice/。
 */
export const SignIn: React.FC<PageProps> = () => {
  const { t } = useI18n();

  return (
    <div className="si-root">
      {/* ---------------- Left panel: form ---------------- */}
      <div className="si-left">
        <div className="si-logo">
          <Logo size={26} />
        </div>
        <span className="si-lang">
          <LanguageSwitcher />
        </span>

        <div className="si-form">
          <h1 className="si-title">{t('auth.welcomeToHyperknow')}</h1>
          <p className="si-sub">{t('auth.signInSubtitle')}</p>

          <a className="si-google si-zc" href="/signin?via=lattice&return_to=%2Flattice%2F">
            <BadgeCheck size={18} />
            <span>{L('Sign in with Zaochang account', '使用造场账户登录')}</span>
          </a>

          <p className="si-hint">
            {L(
              'Sign-in is handled by your Zaochang account: enter your account email and we send you a verification code. GitHub-registered accounts can sign in with their registration email.',
              '登录由造场账户统一提供：输入账户邮箱接收验证码即可；GitHub 注册过的账号使用注册邮箱登录同一账户。',
            )}
          </p>

          <p className="si-fine">{t('auth.termsAndPolicy')}</p>
        </div>
      </div>

      {/* ---------------- Right panel: testimonial ---------------- */}
      <div className="si-right">
        <div className="si-stack">
          <div className="si-card-back" />
          <div className="si-card">
            <p className="si-quote">
              <TRich
                text={t('auth.testimonials.sophieBody')}
                renderers={{ '1': (inner) => <MintMark>{inner}</MintMark> }}
              />
            </p>
            <div className="si-attrib">
              <div className="si-name">Sophie Zhang</div>
              <div className="si-role">{t('auth.testimonials.sophieDesignation')}</div>
            </div>
          </div>
        </div>

        <div className="si-status">
          <CheckCircle2 size={16} className="si-status-icon" />
          <span>{L('All services are online', '所有服务均在线')}</span>
        </div>
      </div>
    </div>
  );
};
