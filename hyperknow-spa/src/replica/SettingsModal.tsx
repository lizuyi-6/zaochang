import { useState, type ReactNode } from 'react';
import { SlidersHorizontal, Brain, X, LogOut, Pencil, Trash2, Check, Mail } from 'lucide-react';
import type { PageProps } from './types';
import { Modal, Toggle } from './ui';
import { AvatarCat } from './illustrations';
import { memoryEntries } from './data';
import { useI18n } from './i18n';
import { L } from './i18n/content';
import { openFeedbackMail } from './actions';
import { toast } from './toast';
import './SettingsModal.css';

/** Canvas logo: red ring of dots (~#E72429). */
function CanvasLogo() {
  const dots = Array.from({ length: 10 });
  return (
    <svg width={22} height={22} viewBox="0 0 24 24">
      {dots.map((_, i) => {
        const a = (i / dots.length) * Math.PI * 2 - Math.PI / 2;
        return (
          <circle
            key={i}
            cx={12 + 8.4 * Math.cos(a)}
            cy={12 + 8.4 * Math.sin(a)}
            r={1.9}
            fill="#E72429"
          />
        );
      })}
    </svg>
  );
}

/** Google Calendar mini icon with "31". */
function GoogleCalLogo() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24">
      <rect x="2.5" y="3" width="19" height="18" rx="3.5" fill="#fff" stroke="#DADCE0" strokeWidth="1" />
      <path d="M2.5 6.5 a3.5 3.5 0 0 1 3.5-3.5 h12 a3.5 3.5 0 0 1 3.5 3.5 v2 h-19 z" fill="#1A73E8" />
      <rect x="6.5" y="1.6" width="1.8" height="3.4" rx="0.9" fill="#EA4335" />
      <rect x="15.7" y="1.6" width="1.8" height="3.4" rx="0.9" fill="#EA4335" />
      <text x="12" y="18" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#1A73E8">
        31
      </text>
    </svg>
  );
}

/* ---------------- 记忆:按账户持久化(localStorage),增删改都真实生效 ---------------- */

interface MemEntry {
  id: string;
  text: string;
  date: string;
}

const memKey = (email: string) => `hk_memory:${email}`;

function loadMemory(email: string): MemEntry[] {
  try {
    const raw = localStorage.getItem(memKey(email));
    if (raw) {
      const parsed = JSON.parse(raw) as MemEntry[];
      if (Array.isArray(parsed)) return parsed.filter((m) => m && typeof m.text === 'string');
    }
  } catch {
    /* 存储不可用 → 回退演示条目 */
  }
  return memoryEntries().map((m, i) => ({ id: `seed-${i}`, text: m.text, date: m.date }));
}

function saveMemory(email: string, list: MemEntry[]): void {
  try {
    localStorage.setItem(memKey(email), JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function IntegrationRow({ logo, name, onConnect }: { logo: ReactNode; name: string; onConnect: () => void }) {
  const { t } = useI18n();
  return (
    <div className="sm-integration">
      <span className="sm-int-tile">{logo}</span>
      <div className="sm-int-text">
        <div className="sm-int-name">{name}</div>
        <div className="sm-row-sub">{t('settings.notConnected')}</div>
      </div>
      <button className="sm-outline-pill" onClick={onConnect}>
        {t('home.connect')}
      </button>
    </div>
  );
}

function GeneralTab({ state, set }: Pick<PageProps, 'state' | 'set'>) {
  const { t } = useI18n();
  const [memoryOn, setMemoryOn] = useState(true);
  const [coupon, setCoupon] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <div className="sm-section">
        <h3 className="sm-section-title">{t('settings.account')}</h3>
        <div className="sm-panel sm-account">
          {/* 造场账户身份(启动时 get_user_info 拉取);null = 纯静态演示 → 复刻假身份 */}
          {state.identity ? (
            <span className="sm-avatar-initial">{(state.identity.username || state.identity.email)[0].toUpperCase()}</span>
          ) : (
            <AvatarCat size={44} />
          )}
          <div>
            <div className="sm-account-name">{state.identity?.username ?? 'Ryan Taylor'}</div>
            <div className="sm-account-email">{state.identity?.email ?? 'ryanzhu2001@gmail.com'}</div>
          </div>
        </div>
      </div>

      <div className="sm-section">
        <h3 className="sm-section-title">{t('settings.subscription')}</h3>
        <div className="sm-panel sm-row-between">
          <span className="sm-free-chip">{state.plan}</span>
          <div className="sm-sub-actions">
            <button
              className="sm-link"
              onClick={() => set({ settingsOpen: false, screen: 'plans' })}
            >
              {t('settings.upgradePlan')}
            </button>
            <button
              className="sm-outline-pill"
              onClick={() => set({ settingsOpen: false, screen: 'plans' })}
            >
              {t('settings.viewPlans')}
            </button>
          </div>
        </div>
      </div>

      <div className="sm-section">
        <h3 className="sm-section-title">{t('settings.coupon')}</h3>
        <div className="sm-panel sm-coupon">
          <input
            className="sm-input"
            value={coupon}
            onChange={(e) => setCoupon(e.target.value)}
            placeholder={t('settings.couponPlaceholder')}
          />
          <button
            className="sm-redeem"
            disabled
            title={L('Coupon redemption is not live yet', '兑换码通道即将上线')}
          >
            {t('settings.redeem')}
          </button>
        </div>
        <div className="sm-hint">{L('Coupon redemption is not live yet.', '兑换码通道即将上线。')}</div>
      </div>

      <div className="sm-section">
        <h3 className="sm-section-title">{t('settings.preferences')}</h3>
        <div className="sm-pref-row">
          <div>
            <div className="sm-row-title">{t('settings.memory')}</div>
            <div className="sm-row-sub">{t('settings.memoryDescription')}</div>
          </div>
          <Toggle on={memoryOn} onChange={setMemoryOn} />
        </div>
      </div>

      <div className="sm-section">
        <h3 className="sm-section-title">{t('settings.integrations')}</h3>
        <div className="sm-integrations">
          <IntegrationRow
            logo={<CanvasLogo />}
            name="Canvas"
            onConnect={() => toast(L('Canvas integration is not live yet', 'Canvas 集成即将上线'))}
          />
          <IntegrationRow
            logo={<GoogleCalLogo />}
            name="Google Calendar"
            onConnect={() => toast(L('Google Calendar integration is not live yet', 'Google 日历集成即将上线'))}
          />
        </div>
      </div>

      <div className="sm-section">
        <h3 className="sm-section-title">{t('auth.signOut')}</h3>
        <div className="sm-panel sm-row-between">
          <div>
            <div className="sm-row-title">{t('settings.signOutOfThisDevice')}</div>
            <div className="sm-row-sub">
              {t('settings.signOutDescription')}
            </div>
          </div>
          <button
            className="sm-signout-pill"
            /* 真登出:清主站会话(门禁认的就是它),由主站登出页接管跳转 */
            onClick={() => window.location.assign('/signout')}
          >
            <LogOut size={14} />
            {t('auth.signOut')}
          </button>
        </div>
      </div>

      <div className="sm-section">
        <h3 className="sm-section-title">{t('settings.deleteAccount')}</h3>
        <div className="sm-panel sm-danger sm-row-between">
          <div>
            <div className="sm-row-title">{t('settings.deleteAccount')}</div>
            <div className="sm-row-sub">
              {t('settings.deleteAccountDesc')}
            </div>
          </div>
          <button className="sm-delete-pill" onClick={() => setConfirmDelete(true)}>
            {t('settings.deleteAccount')}
          </button>
        </div>
      </div>

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(false)} scrim="dark-blur" width={460}>
          <div className="sm-confirm">
            <div className="sm-confirm-title">{t('settings.deleteAccount')}</div>
            <p className="sm-confirm-body">
              {L(
                'Account deletion is irreversible and is processed by our team so that every record tied to your account is removed together. Send the request from your registered email and we will complete it within 3 business days.',
                '删除账户不可撤销。为确保与你账户相关的全部记录被一并清除，该操作由我们的团队执行：请用注册邮箱发送申请，我们会在 3 个工作日内完成。',
              )}
            </p>
            <div className="sm-confirm-foot">
              <button className="sm-outline-pill" onClick={() => setConfirmDelete(false)}>
                {t('home.marketplace.confirmCancel')}
              </button>
              <button
                className="sm-delete-pill"
                onClick={() => {
                  const ok = openFeedbackMail(
                    L(
                      `Please delete my Hyperknow account (${state.identity?.email ?? 'unknown email'}) and all data tied to it.`,
                      `请删除我的 Hyperknow 账户（${state.identity?.email ?? '未知邮箱'}）及其全部关联数据。`,
                    ),
                    L('Account deletion request', '账户删除申请'),
                  );
                  if (ok) setConfirmDelete(false);
                }}
              >
                <Mail size={13} />
                {L('Send the request', '发送申请')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function MemoryTab({ state }: Pick<PageProps, 'state'>) {
  const { t } = useI18n();
  const email = state.identity?.email ?? 'demo';
  const [entries, setEntries] = useState<MemEntry[]>(() => loadMemory(email));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const commit = (list: MemEntry[]) => {
    setEntries(list);
    saveMemory(email, list);
  };

  const startEdit = (entry: MemEntry) => {
    setAdding(false);
    setEditingId(entry.id);
    setDraft(entry.text);
  };

  const startAdd = () => {
    setEditingId(null);
    setAdding(true);
    setDraft('');
  };

  const saveDraft = () => {
    const text = draft.trim();
    if (!text) return;
    const date = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date());
    if (adding) {
      commit([{ id: `m-${Date.now()}`, text, date }, ...entries]);
      toast(L('Memory added', '已添加记忆'));
    } else if (editingId) {
      commit(entries.map((e) => (e.id === editingId ? { ...e, text, date } : e)));
      toast(L('Memory updated', '记忆已更新'));
    }
    setAdding(false);
    setEditingId(null);
    setDraft('');
  };

  return (
    <>
      <div className="sm-mem-head">
        <div>
          <h3 className="sm-mem-title">{t('settings.memory')}</h3>
          <div className="sm-row-sub">{t('settings.memoryDescription')}</div>
        </div>
        <button className="sm-outline-pill" onClick={startAdd}>
          {t('settings.manageMemory')}
        </button>
      </div>

      <div className="sm-panel sm-describes">
        <div className="sm-describes-q">{t('onboarding.step1Title')}</div>
        <span className="sm-describes-chip">{t('onboarding.roles.college')}</span>
      </div>

      <div className="sm-section">
        <div className="sm-head-row">
          <h3 className="sm-section-title">{t('settings.memory')}</h3>
          <button className="sm-outline-pill" onClick={startAdd}>
            {t('settings.addMemory')}
          </button>
        </div>
        <p className="sm-desc">
          {t('settings.savedMemoriesDescription')}
        </p>

        {(adding || editingId) && (
          <div className="sm-entry-edit">
            <textarea
              className="sm-entry-textarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={L('What should the tutor remember?', '希望导师记住什么？')}
              rows={3}
            />
            <div className="sm-entry-edit-foot">
              <button
                className="sm-outline-pill"
                onClick={() => {
                  setAdding(false);
                  setEditingId(null);
                  setDraft('');
                }}
              >
                {t('home.marketplace.confirmCancel')}
              </button>
              <button className="sm-save-pill" disabled={!draft.trim()} onClick={saveDraft}>
                <Check size={13} />
                {L('Save', '保存')}
              </button>
            </div>
          </div>
        )}

        <div className="sm-entries">
          {entries.length === 0 && (
            <div className="sm-empty-external">{L('Nothing saved yet.', '还没有保存任何记忆。')}</div>
          )}
          {entries.map((e) => (
            <div className="sm-entry" key={e.id}>
              <div>
                <div className="sm-entry-text">{e.text}</div>
                <div className="sm-entry-date">{e.date}</div>
              </div>
              <div className="sm-entry-actions">
                <button className="sm-icon-btn" aria-label={L('Edit memory', '编辑记忆')} onClick={() => startEdit(e)}>
                  <Pencil size={16} />
                </button>
                <button
                  className="sm-icon-btn"
                  aria-label={L('Delete memory', '删除记忆')}
                  onClick={() => {
                    commit(entries.filter((x) => x.id !== e.id));
                    toast(L('Memory deleted', '记忆已删除'));
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sm-section">
        <div className="sm-head-row">
          <h3 className="sm-section-title">{t('settings.externalMemoryTitle')}</h3>
          <button
            className="sm-outline-pill"
            onClick={() => toast(L('External memory sync is not live yet', '外部记忆同步即将上线'))}
          >
            {t('settings.externalMemoryEdit')}
          </button>
        </div>
        <p className="sm-desc">
          {t('settings.externalMemoryDescription')}
        </p>
        <div className="sm-empty-external">{t('settings.externalMemoryEmpty')}</div>
      </div>
    </>
  );
}

export default function SettingsModal({ state, set }: PageProps) {
  const { t } = useI18n();
  if (!state.settingsOpen) return null;

  return (
    <Modal onClose={() => {}} scrim="dark-blur" width={950}>
      <div className="sm-card">
        <div className="sm-rail">
          <h2 className="sm-rail-title">{t('accountDropdown.settings')}</h2>
          <button
            className={`sm-tab${state.settingsTab === 'general' ? ' active' : ''}`}
            onClick={() => set({ settingsTab: 'general' })}
          >
            <SlidersHorizontal size={18} />
            {t('settings.general')}
          </button>
          <button
            className={`sm-tab${state.settingsTab === 'memory' ? ' active' : ''}`}
            onClick={() => set({ settingsTab: 'memory' })}
          >
            <Brain size={18} />
            {t('settings.memory')}
          </button>
        </div>

        <button
          className="sm-close"
          aria-label="Close settings"
          onClick={() => set({ settingsOpen: false })}
        >
          <X size={16} />
        </button>

        <div className="sm-content">
          {state.settingsTab === 'general' ? <GeneralTab state={state} set={set} /> : <MemoryTab state={state} />}
        </div>
      </div>
    </Modal>
  );
}
