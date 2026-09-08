import { useState } from 'react';
import { X, Send, Copy, Mail } from 'lucide-react';
import { Modal } from './ui';
import { useI18n } from './i18n';
import { L } from './i18n/content';
import { copyText, openFeedbackMail, SUPPORT_EMAIL } from './actions';
import { toast } from './toast';

/**
 * 反馈/联系弹窗:正文经系统邮件客户端发出(唯一真实可达的通道),
 * 同时提供"复制邮箱"以免用户机器没有配置邮件客户端。
 */
export const SupportModal: React.FC<{ onClose: () => void; title?: string }> = ({ onClose, title }) => {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const heading = title ?? t('chatResponse.haveAnIssue');

  return (
    <Modal onClose={onClose} scrim="dark-blur" width={520}>
      <div className="hk-support">
        <div className="hk-support-head">
          <span className="hk-support-title">
            <Mail size={16} />
            {heading}
          </span>
          <button className="hk-support-x" type="button" onClick={onClose} aria-label={L('Close', '关闭')}>
            <X size={16} />
          </button>
        </div>
        <p className="hk-support-sub">
          {L(
            `Tell us what happened and we'll get back to you. Your message opens in your email app and goes to ${SUPPORT_EMAIL}.`,
            `描述一下你遇到的问题，我们会尽快回复。内容会通过你的邮件客户端发送至 ${SUPPORT_EMAIL}。`,
          )}
        </p>
        <textarea
          className="hk-support-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={L('Type your message…', '输入你的消息…')}
          rows={6}
        />
        <div className="hk-support-foot">
          <button
            className="hk-support-copy"
            type="button"
            onClick={async () => {
              const ok = await copyText(SUPPORT_EMAIL);
              toast(ok ? L('Email address copied', '邮箱地址已复制') : L('Could not copy', '复制失败'));
            }}
          >
            <Copy size={13} />
            {SUPPORT_EMAIL}
          </button>
          <button
            className="hk-support-send"
            type="button"
            disabled={!text.trim()}
            onClick={() => {
              if (openFeedbackMail(text, heading)) onClose();
            }}
          >
            {t('chatResponse.submitReport')}
            <Send size={13} />
          </button>
        </div>
      </div>
    </Modal>
  );
};
