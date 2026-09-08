import React from 'react';
import { Check, Sparkles, Zap, RotateCcw, MessageCircle } from 'lucide-react';
import type { PageProps } from '../types';
import { PLANS } from '../types';
import { useI18n } from '../i18n';
import { L } from '../i18n/content';
import './PlansPage.css';

const PLAN_NS = ['freePlan', 'proPlan', 'maxPlan'] as const;

/** 订阅页 — 三档(免费/Pro/Max)。文案 1:1 走 locales.json 的原版 subscription 词条;
 * 数值(每日积分/对话/课程)来自 PLANS(types.ts),与后端 hk_credits 的真实
 * 档位对应(FREE=20/日)。付费档目前为展示态,兑换码/付款通道未接通。 */
export const PlansPage: React.FC<PageProps> = ({ state, set }) => {
  const { t } = useI18n();
  const current = state.plan;

  return (
    <div className="hk-page with-sidebar pp-page">
      <div className="pp-inner">
        <div className="pp-head">
          <h1 className="pp-title">{t('subscription.title')}</h1>
          <p className="pp-sub">{t(`subscription.${PLAN_NS[1]}.description`)}</p>
          <div className="pp-credits-line">
            <Sparkles size={14} />
            <span>{L('2 credits per chat · 10 per course · reset daily at midnight (Beijing)', '对话 2 积分/次 · 课程 10 积分/次 · 每日零点重置(北京时间)')}</span>
          </div>
        </div>

        <div className="pp-cards">
          {PLANS.map((plan, i) => {
            const isCurrent = plan.id === current;
            const isPro = plan.id === 'PRO';
            const isMax = plan.id === 'MAX';
            const ns = PLAN_NS[i];
            const chats = plan.creditsPerDay / 2;
            const courses = plan.creditsPerDay / 10;
            /* 原版功能文案只取前几条,额度行的真实数字在本产品更实。 */
            const featureKeys = ns === 'maxPlan' ? ['everythingInPro', 'feature2', 'feature4'] : ['feature1', 'feature2', 'feature3'];
            return (
              <div key={plan.id} className={`pp-card${isPro ? ' featured' : ''}${isCurrent ? ' current' : ''}`}>
                {isPro && <div className="pp-popular">{t('subscription.tagMostPopular')}</div>}
                {isMax && <div className="pp-popular alt">{t('subscription.tagBestValue')}</div>}

                <div className="pp-card-head">
                  <div className="pp-name">{plan.id}</div>
                  <div className="pp-price">
                    {plan.price === 0 ? (
                      <span className="pp-amount free">{t('subscription.freePrice')}</span>
                    ) : (
                      <>
                        <span className="pp-currency">$</span>
                        <span className="pp-amount">{plan.price}</span>
                        <span className="pp-per">/{t('subscription.perMonth')}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="pp-credits">
                  <Zap size={14} />
                  <span>
                    {L('{{n}} credits / day', '{{n}} 积分/天').replace('{{n}}', String(plan.creditsPerDay))}
                  </span>
                </div>

                <ul className="pp-features">
                  <li>
                    <MessageCircle size={13} />
                    <span>
                      {L('{{n}} chats / day', '每天 {{n}} 次对话').replace('{{n}}', String(chats))}
                      {' · '}
                      {L('{{n}} courses / day', '{{n}} 门课程').replace('{{n}}', String(courses))}
                    </span>
                  </li>
                  <li>
                    <RotateCcw size={13} />
                    <span>{L('Resets daily at midnight (Beijing)', '每日零点重置(北京时间)')}</span>
                  </li>
                  {featureKeys.map((k) => (
                    <li key={k}>
                      <Check size={13} />
                      <span>{t(`subscription.${ns}.${k}`)}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className={`pp-cta${isCurrent ? ' current' : ''}`}
                  disabled={isCurrent}
                  onClick={() => set({ plan: plan.id })}
                >
                  {isCurrent
                    ? t('subscription.currentPlan')
                    : plan.id === 'FREE'
                      ? t('subscription.downgradeTo', { plan: 'FREE' })
                      : t('subscription.upgradeTo', { plan: plan.id })}
                </button>
              </div>
            );
          })}
        </div>

        <div className="pp-note">
          <p>{L('Have a coupon code? Redeem it in Settings → Coupon.', '有兑换码?到 设置 → 兑换码 输入。')}</p>
          <p className="pp-note-sub">{L('Payments are coming soon — selecting a paid plan is preview-only for now.', '付款通道即将上线——目前选择付费档仅为预览。')}</p>
        </div>
      </div>
    </div>
  );
};
