import React, { useMemo, useState } from 'react';
import { Search, Plus, ListFilter, Check } from 'lucide-react';
import type { PageProps } from '../types';
import { historyRows } from '../data';
import { useI18n } from '../i18n';
import { L } from '../i18n/content';
import './HistoryPage.css';

/** sqlite UTC "YYYY-MM-DD HH:MM:SS" → 本地相对时间(今天/昨天/日期)。 */
function relativeTime(s: string): string {
  const d = s ? new Date(s.replace(' ', 'T') + 'Z') : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const dayOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((dayOf(new Date()) - dayOf(d)) / 86400000);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diffDays <= 0) return `${L('Today', '今天')} ${hm}`;
  if (diffDays === 1) return `${L('Yesterday', '昨天')} ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

type Sort = 'recent' | 'oldest' | 'title';

/** History screen — Conversations list / Deep learn sessions empty state. */
export const HistoryPage: React.FC<PageProps> = ({ state, set }) => {
  const { t } = useI18n();
  const tab = state.historyTab;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [filterOpen, setFilterOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const demoRows = historyRows().filter((title) => !q || title.toLowerCase().includes(q));
  const realRows = useMemo(() => {
    const rows = (state.conversations ?? []).filter(
      (c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.text.toLowerCase().includes(q)),
    );
    const sorted = [...rows];
    if (sort === 'recent') sorted.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    else if (sort === 'oldest') sorted.sort((a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''));
    else sorted.sort((a, b) => a.title.localeCompare(b.title));
    return sorted;
  }, [state.conversations, q, sort]);

  const sortOptions: Array<{ id: Sort; label: string }> = [
    { id: 'recent', label: L('Newest first', '最新在前') },
    { id: 'oldest', label: L('Oldest first', '最早在前') },
    { id: 'title', label: L('Title A–Z', '按标题排序') },
  ];

  return (
    <div className="hk-page with-sidebar hs-page">
      <div className="hs-inner">
        <div className="hs-header">
          <h1 className="hs-title">{t('studyHistory.title')}</h1>
          <div className="hs-header-right">
            <div className="hs-search">
              <Search size={14} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tab === 'conversations' ? t('studyHistory.searchConversations') : t('studyHistory.searchSessions')}
              />
            </div>
            <button
              className="hs-new-btn"
              type="button"
              onClick={() => set({ screen: 'chat', activeConversationId: null })}
            >
              <Plus size={14} />
              <span>{t('studyHistory.newConversationButton')}</span>
            </button>
          </div>
        </div>

        <div className="hs-tabs">
          <button
            type="button"
            className={`hs-tab${tab === 'conversations' ? ' active' : ''}`}
            onClick={() => set({ historyTab: 'conversations' })}
          >
            {t('studyHistory.tabConversations')}
          </button>
          <button
            type="button"
            className={`hs-tab${tab === 'sessions' ? ' active' : ''}`}
            onClick={() => set({ historyTab: 'sessions' })}
          >
            {t('studyHistory.tabSessions')}
          </button>
          <span className="hs-filter" title={L('Sort', '排序')} onClick={() => setFilterOpen(!filterOpen)}>
            <ListFilter size={16} />
          </span>
          {filterOpen && (
            <>
              <div className="hs-filter-veil" onClick={() => setFilterOpen(false)} />
              <div className="hk-menu hs-sort-menu">
                <div className="hk-menu-label">{L('Sort conversations', '会话排序')}</div>
                {sortOptions.map((o) => (
                  <button
                    key={o.id}
                    className={`hk-menu-item${sort === o.id ? ' active' : ''}`}
                    onClick={() => {
                      setSort(o.id);
                      setFilterOpen(false);
                    }}
                  >
                    {sort === o.id && <Check size={13} />}
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {tab === 'conversations' ? (
          <>
            <div className="hs-group-label">{t('studyHistory.groupThisWeek')}</div>
            <div className="hs-card">
              {/* 真实历史(按造场账户隔离);null = 拉取失败/纯静态托管 → 复刻演示行。 */}
              {state.conversations === null
                ? demoRows.map((title, i) => (
                    <div key={i} className="hs-row" onClick={() => set({ screen: 'chat', activeConversationId: null })}>
                      <span className="hs-row-title">{title}</span>
                      <span className="hs-row-time">{t('studyHistory.relativeYesterday')}</span>
                    </div>
                  ))
                : realRows.map((conv) => (
                    <div
                      key={conv.id}
                      className="hs-row"
                      onClick={() => set({ screen: 'chat', activeConversationId: conv.id })}
                    >
                      <span className="hs-row-title">{conv.title}</span>
                      <span className="hs-row-time">{relativeTime(conv.updatedAt)}</span>
                    </div>
                  ))}
              {((state.conversations !== null && realRows.length === 0) || (state.conversations === null && demoRows.length === 0)) && (
                <div className="hs-row" style={{ color: '#9CA3AF' }}>
                  <span className="hs-row-title">
                    {q ? L('No conversations match your search', '没有匹配的会话') : L('No conversations yet', '暂无会话')}
                  </span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="hs-card hs-empty">{t('studyHistory.emptySessions')}</div>
        )}
      </div>
    </div>
  );
};
