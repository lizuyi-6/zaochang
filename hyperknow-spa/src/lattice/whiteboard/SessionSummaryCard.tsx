import { ArrowRight, Check, CircleHelp, Minus, X } from 'lucide-react';
import { L } from '../i18n/content';
import type { SessionSummaryResponse } from './sessionSummary';

const RESULT_LABELS = {
  correct: () => L('Correct', '正确'),
  partial: () => L('Partly correct', '部分正确'),
  incorrect: () => L('Incorrect', '错误'),
  unanswered: () => L('Not answered', '未作答'),
};

const MASTERY_LABELS = {
  notStarted: () => L('Not started', '未开始'),
  attempted: () => L('Attempted', '已尝试'),
  familiar: () => L('Familiar', '熟悉'),
  proficient: () => L('Proficient', '熟练'),
  mastered: () => L('Mastered', '已掌握'),
};

function scoreText(score: number): string {
  return String(Number(score.toFixed(1)));
}

export function SessionSummary({
  summary,
  masteryLoading,
  onNext,
  onBack,
  backLabel,
}: {
  summary: SessionSummaryResponse;
  masteryLoading?: boolean;
  onNext?: () => void;
  onBack: () => void;
  backLabel?: string;
}) {
  return (
    <div className="wb-summary-overlay">
      <section className="wb-summary-card" role="dialog" aria-modal="true" aria-labelledby="wb-summary-title">
        <div className="wb-summary-heading">
          <div>
            <span className="wb-summary-eyebrow">{L('LESSON COMPLETE', '讲次结束')}</span>
            <h2 id="wb-summary-title">{L('Lesson summary', '本讲小结')}</h2>
          </div>
          <div className="wb-summary-score" aria-label={L('First-try score', '首答得分')}>
            <strong>{scoreText(summary.firstTryScore)} / {summary.maxScore}</strong>
            <span>{L('First-try score', '首答得分')}</span>
          </div>
        </div>

        <div className="wb-summary-meta">
          <span>{L('Answered', '已答')} <strong>{summary.answeredCount}/{summary.questionCount}</strong></span>
          {summary.course ? (
            <span>
              {L('Mastery', '掌握度')} <strong>{MASTERY_LABELS[summary.course.masteryLevel]()}</strong>
            </span>
          ) : masteryLoading ? (
            <span>{L('Loading mastery…', '正在读取掌握度…')}</span>
          ) : null}
        </div>

        {summary.questions.length ? (
          <ol className="wb-summary-questions">
            {summary.questions.map((question, index) => (
              <li className="wb-summary-question" key={`${question.stepId}-${index}`}>
                <div className="wb-summary-question-top">
                  <span className="wb-summary-question-number">{index + 1}</span>
                  <span className={`wb-summary-result is-${question.result}`}>
                    {question.result === 'correct'
                      ? <Check size={14} />
                      : question.result === 'partial'
                        ? <Minus size={14} />
                        : question.result === 'unanswered'
                          ? <CircleHelp size={14} />
                          : <X size={14} />}
                    {RESULT_LABELS[question.result]()}
                  </span>
                </div>
                <p className="wb-summary-question-text">{question.question}</p>
                <p className="wb-summary-answer">
                  <span>{L('Correct answer', '正确答案')}</span>
                  <strong>{question.correctAnswer || L('Unavailable', '暂无')}</strong>
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="wb-summary-empty">{L('There were no check questions in this lesson.', '本讲没有随堂检查题。')}</p>
        )}

        <div className="wb-summary-actions">
          {onNext && (
            <button type="button" className="wb-summary-next" onClick={onNext}>
              {L('Next lesson', '下一讲')} <ArrowRight size={16} />
            </button>
          )}
          <button type="button" className="wb-summary-back" onClick={onBack}>
            {backLabel ?? L('Back to course', '回到课程')}
          </button>
        </div>
      </section>
    </div>
  );
}
