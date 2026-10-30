import React, { useCallback, useEffect, useState } from 'react';
import { History, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { L } from './i18n/content';
import { Modal } from './ui';
import './CreditHistoryModal.css';

type CreditHistoryEvent = {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
};

type CreditHistoryData = {
  remaining: number;
  max: number;
  tier: string;
  resets_at: string;
  events: CreditHistoryEvent[];
  next_cursor: string | null;
};

function actionName(reason: string): string {
  switch (reason) {
    case 'chat': return L('AI chat', 'AI 对话');
    case 'translate': return L('Translation', '翻译');
    case 'course': return L('Course generation', '生成课程');
    case 'refund': return L('Failure refund', '失败退款');
    case 'daily_reset': return L('Daily reset', '每日重置');
    case 'plan_change': return L('Plan quota update', '套餐额度更新');
    default: return L('Credit change', '积分变动');
  }
}

function formatEventTime(value: string): string {
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function formatBeijingTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export const CreditHistoryModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [summary, setSummary] = useState<CreditHistoryData | null>(null);
  const [events, setEvents] = useState<CreditHistoryEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [moreError, setMoreError] = useState(false);

  const loadPage = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    setError(false);
    setMoreError(false);
    try {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const response = await fetch(`/api/hyperknow/credits/history${query}`, {
        signal: AbortSignal.timeout(15_000),
      });
      const body = await response.json() as { success?: boolean; error?: string; data?: CreditHistoryData };
      if (!response.ok || !body.success || !body.data) throw new Error(body.error || 'credits_history_failed');
      setSummary(body.data);
      setEvents((current) => cursor ? [...current, ...body.data!.events] : body.data!.events);
      setNextCursor(body.data.next_cursor);
    } catch {
      if (cursor) setMoreError(true);
      else setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { void loadPage(); }, [loadPage]);

  return (
    <Modal onClose={onClose} scrim="dark-blur" width={560}>
      <section className="hk-credit-history" aria-labelledby="hk-credit-history-title" aria-modal="true" role="dialog">
        <header className="hk-credit-history-head">
          <div>
            <h2 id="hk-credit-history-title"><History size={18} />{L('Credit history', '积分记录')}</h2>
            <p>{L('Today’s balance and changes since credit history started.', '今日余额与流水启用后的变动。')}</p>
          </div>
          <button className="hk-credit-history-close" type="button" onClick={onClose} aria-label={L('Close', '关闭')}>
            <X size={17} />
          </button>
        </header>

        <div className="hk-credit-history-summary">
          <div className="hk-credit-history-stat hk-credit-history-balance">
            <span>{L("Today's balance", '今日余额')}</span>
            <strong>{summary ? summary.remaining : '—'}</strong>
            <small>{summary
              ? L('Daily quota: {{n}}', '每日额度：{{n}}').replace('{{n}}', String(summary.max))
              : L('Daily quota: —', '每日额度：—')}</small>
          </div>
          <div className="hk-credit-history-stat">
            <span>{L('Plan', '档位')}</span>
            <strong>{summary?.tier ?? '—'}</strong>
          </div>
          <div className="hk-credit-history-stat">
            <span>{L('Resets at Beijing midnight', '北京时间零点重置')}</span>
            <strong className="hk-credit-history-reset">{summary ? formatBeijingTime(summary.resets_at) : '—'}</strong>
          </div>
        </div>

        <div className="hk-credit-history-list" aria-label={L('Credit changes', '积分变动记录')}>
          {loading ? (
            <div className="hk-credit-history-state" role="status"><LoaderCircle size={18} className="hk-credit-history-spin" />{L('Loading credit history…', '正在加载积分记录…')}</div>
          ) : error ? (
            <div className="hk-credit-history-state is-error" role="alert">
              <span>{L('Could not load credit history.', '积分记录加载失败。')}</span>
              <button type="button" onClick={() => void loadPage()}><RefreshCw size={14} />{L('Retry', '重试')}</button>
            </div>
          ) : events.length === 0 ? (
            <div className="hk-credit-history-state">{L('No credit changes yet.', '暂时还没有积分变动记录。')}</div>
          ) : (
            <>
              <ul>
                {events.map((event) => (
                  <li key={event.id}>
                    <div className="hk-credit-history-event-main">
                      <strong>{actionName(event.reason)}</strong>
                      <time dateTime={`${event.createdAt.replace(' ', 'T')}Z`}>{formatEventTime(event.createdAt)}</time>
                    </div>
                    <div className="hk-credit-history-event-balance">
                      <span>{L('Balance after', '变动后余额')} {event.balanceAfter}</span>
                      <strong className={event.delta > 0 ? 'is-positive' : event.delta < 0 ? 'is-negative' : ''}>
                        {event.delta > 0 ? '+' : ''}{event.delta}
                      </strong>
                    </div>
                  </li>
                ))}
              </ul>
              {moreError && (
                <div className="hk-credit-history-more-error" role="alert">
                  {L('Could not load more records.', '更多记录加载失败。')}
                  {nextCursor && (
                    <button type="button" className="hk-credit-history-more" onClick={() => void loadPage(nextCursor)}>
                      <RefreshCw size={14} />{L('Retry', '重试')}
                    </button>
                  )}
                </div>
              )}
              {nextCursor && (
                <button
                  type="button"
                  className="hk-credit-history-more"
                  disabled={loadingMore}
                  onClick={() => void loadPage(nextCursor)}
                >
                  {loadingMore && <LoaderCircle size={15} className="hk-credit-history-spin" />}
                  {loadingMore ? L('Loading…', '正在加载…') : L('Load more', '加载更多')}
                </button>
              )}
            </>
          )}
        </div>
      </section>
    </Modal>
  );
};
