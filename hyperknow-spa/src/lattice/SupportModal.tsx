import { useRef, useState } from 'react';
import { X, Send, Copy, Mail } from 'lucide-react';
import { Modal } from './ui';
import { useI18n } from './i18n';
import { L } from './i18n/content';
import { copyText, openFeedbackMail, SUPPORT_EMAIL } from './actions';
import { toast } from './toast';

type SupportContext = {
  screen: string;
  sessionId?: string;
  courseUuid?: string;
};

type FeedbackSuccess = { id: string; notified: boolean };

/** 见界反馈先提交到服务端留存;邮件客户端只作为用户主动选择的备用方式。 */
export const SupportModal: React.FC<{
  onClose: () => void;
  title?: string;
  context: SupportContext;
  userEmail?: string;
}> = ({ onClose, title, context, userEmail }) => {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<FeedbackSuccess | null>(null);
  const submittingRef = useRef(false);
  const heading = title ?? t('chatResponse.haveAnIssue');
  const replyTo = userEmail || L('your sign-in email', '你的登录邮箱');

  const submit = async () => {
    if (submittingRef.current || !text.trim()) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/hyperknow/feedback', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: {
            ...context,
            userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent.slice(0, 180),
          },
        }),
      });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; id?: string; notified?: boolean };
      if (response.ok && result.ok === true && typeof result.id === 'string') {
        setSuccess({ id: result.id, notified: result.notified === true });
      } else if (response.status === 401) {
        setError(L('Please sign in before sending feedback.', '请先登录后再提交反馈。'));
      } else if (response.status === 429) {
        setError(L('Too many reports. Please try again later.', '提交太频繁，请稍后再试。'));
      } else {
        setError(L('We could not confirm that your report was saved. Please retry or use email.', '无法确认反馈是否已保存，请重试或使用邮件客户端发送。'));
      }
    } catch {
      setError(L('We could not confirm that your report was saved. Please retry or use email.', '无法确认反馈是否已保存，请重试或使用邮件客户端发送。'));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

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
            'Tell us what happened. Your feedback will be sent to the Lattice team and we will reply to your sign-in email.',
            '描述一下你遇到的问题，内容会发送给见界团队，我们会通过你的登录邮箱回复。',
          )}
        </p>

        {success ? (
          <div className="hk-support-success" role="status">
            <strong>{L(`We received your feedback (#${success.id}).`, `已收到你的反馈（编号 #${success.id}）。`)}</strong>
            <span>{L(`We will reply to ${replyTo}.`, `我们会通过 ${replyTo} 回复你。`)}</span>
            {!success.notified && (
              <span>{L('Your feedback is saved, but the team email notification could not be confirmed.', '反馈已保存，但暂时无法确认团队邮件通知状态。')}</span>
            )}
          </div>
        ) : (
          <>
            <textarea
              className="hk-support-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={L('Type your message…', '输入你的消息…')}
              rows={6}
              maxLength={4000}
              disabled={submitting}
            />
            <p className="hk-support-context-note">
              {L(
                'Included to help us investigate: current page, session or course ID when available, and brief browser information.',
                '为便于排查，将附带当前页面、会话或课程编号（如有）及简要浏览器信息。',
              )}
            </p>
            {error && <p className="hk-support-error" role="alert">{error}</p>}
            <div className="hk-support-foot">
              <div className="hk-support-fallbacks">
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
                  className="hk-support-mail-fallback"
                  type="button"
                  disabled={submitting}
                  onClick={() => openFeedbackMail(text, heading)}
                >
                  {L('Use email app', '用邮件客户端发送')}
                </button>
              </div>
              <button
                className="hk-support-send"
                type="button"
                disabled={!text.trim() || submitting}
                onClick={() => void submit()}
              >
                {submitting
                  ? L('Sending…', '正在提交…')
                  : error
                    ? L('Retry', '重试')
                    : t('chatResponse.submitReport')}
                <Send size={13} />
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
