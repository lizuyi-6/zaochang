import { X } from 'lucide-react';
import { Modal } from './ui';
import { localeObject, useI18n } from './i18n';
import { L } from './i18n/content';

interface LogEntry {
  date?: string;
  [key: string]: string | undefined;
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
                  <b>v{key.replace(/^v/, '').replace(/(\d)(\d)(\d\d)$/, '$1.$2.$3')}</b>
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
