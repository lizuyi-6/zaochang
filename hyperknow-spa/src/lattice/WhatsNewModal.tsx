import { X } from 'lucide-react';
import { Modal } from './ui';
import { localeObject, useI18n } from './i18n';
import { L } from './i18n/content';

interface LogEntry {
  date?: string;
  [key: string]: string | undefined;
}

/** 键名→版本显示:v1313→1.3.13、v2000→2.0.0、v139→1.3.9(末两段数字都按数解析,不裸显键名)。 */
function formatVersion(key: string): string {
  const d = key.replace(/^v/, '');
  if (/^\d{4}$/.test(d)) return `${d[0]}.${d[1]}.${String(Number(d.slice(2)))}`;
  if (/^\d{3}$/.test(d)) return `${d[0]}.${d[1]}.${d[2]}`;
  return d;
}

/**
 * 版本日志弹窗:内容取自原站 i18next 树的 whatsNew.log(7 语言齐备),
 * 侧栏页脚与首页"What's new"都从这里打开。
 */
export const WhatsNewModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useI18n();
  const log = localeObject<Record<string, LogEntry>>('whatsNew.log') ?? {};

  return (
    <Modal onClose={onClose} scrim="dark-blur" width={560}>
      <div className="hk-whatsnew">
        <div className="hk-wn-head">
          <span className="hk-wn-title">{t('whatsNew.modalTitle')}</span>
          <button className="hk-wn-x" type="button" onClick={onClose} aria-label={L('Close', '关闭')}>
            <X size={16} />
          </button>
        </div>
        <div className="hk-wn-list">
          {Object.entries(log).map(([key, entry]) => {
            const items = Object.entries(entry)
              .filter(([k]) => k !== 'date')
              .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
              .map(([, v]) => v)
              .filter((v): v is string => typeof v === 'string' && v.length > 0);
            if (items.length === 0) return null;
            return (
              <div className="hk-wn-item" key={key}>
                <div className="hk-wn-ver">
                  <b>v{formatVersion(key)}</b>
                  {entry.date && <span className="hk-wn-date">{entry.date}</span>}
                </div>
                <ul className="hk-wn-lines">
                  {items.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
};
