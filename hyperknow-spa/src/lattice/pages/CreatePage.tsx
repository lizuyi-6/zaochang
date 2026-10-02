import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Sparkle,
  Check,
  ArrowLeft,
  ArrowUp,
  SquarePen,
  GraduationCap,
} from 'lucide-react';
import type { PageProps } from '../types';
import { fetchCourseInquiry, normalizeDepth, type InquiryQuestion, type CourseBriefParams } from '../backend';
import { buildDefaultInquiryQuestions } from '../courseInquiry';
import { useI18n } from '../i18n';
import { L } from '../i18n/content';
import { AvatarCat } from '../illustrations';
import { DarkPill } from '../ui';
import { SupportModal } from '../SupportModal';
import { placeholders } from '../data';
import { toast } from '../toast';
import './CreatePage.css';

/**
 * 课程创建页(cr-) — 「打造课程」的独立对话式工作台(与即时协助同构:进入单独页,不再弹窗)。
 * 会话结构:用户命题气泡 → 每轮问询一张导师卡(选项 chips + 自定义输入) → 底部操作栏
 * (跳过定制 / 智能追问澄清(≤2轮) / 推荐继续)。首轮与追问轮的问询都由 AI 针对主题
 * 实时出题(等待期思考气泡),表单不预置答案——未作答字段在点「推荐继续」时才采用
 * AI 推荐值。推荐继续后仍由全屏 GenerationOverlay 接管真实生成;取消生成即回到本页
 * 对话,可继续调整再确认。
 */

/** 一轮问询(首轮与追问轮都来自 AI 实时出题;模板仅上游故障兜底) */
type InquiryRound = { questions: InquiryQuestion[]; viaAI: boolean };

/** 问询字段的中文名(自定义输入占位用,不再露出 goal/depth 等原始键) */
const FIELD_LABELS: Record<string, [string, string]> = {
  goal: ['learning goal', '学习目标'],
  background: ['background', '知识基础'],
  duration: ['time budget', '学习周期'],
  depth: ['depth', '知识深度'],
  preference: ['teaching style', '授课偏好'],
  visual: ['visual style', '板书风格'],
  language: ['language', '授课语言'],
};

export const CreatePage: React.FC<PageProps> = ({ state, set }) => {
  const { t, lng } = useI18n();
  const isZh = lng ? !lng.toLowerCase().startsWith('en') : true;

  const [topic, setTopic] = useState('');
  const [rounds, setRounds] = useState<InquiryRound[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [round, setRound] = useState(0);
  const [followUpAllowed, setFollowUpAllowed] = useState(true);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [supportOpen, setSupportOpen] = useState(false);

  const seededRef = useRef(false);
  /** 会话代号:重开课程/换命题使在途的 AI 出题响应作废,迟到的响应绝不写进新会话 */
  const runRef = useRef(0);
  const colEndRef = useRef<HTMLDivElement | null>(null);
  const columnRef = useRef<HTMLDivElement | null>(null);
  const followRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);

  /* 自动跟随门控(与聊天页同策略):用户上翻阅读时不被新卡片拽回底部 */
  useEffect(() => {
    const el = columnRef.current;
    if (!el) return;
    const onScroll = () => {
      followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (followRef.current) colEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [rounds, loading, topic]);

  /** 以一条命题开启问询对话:命题先成用户气泡,问询由 AI 针对主题实时生成
   *  (等待期显示思考气泡)。AI 不可达才回退本地标准问询,绝不阻塞开课。 */
  const startWithTopic = (prompt: string) => {
    const run = ++runRef.current;
    setTopic(prompt);
    setRounds([]);
    setAnswers({});
    setRound(0);
    setFollowUpAllowed(true);
    followRef.current = true;
    setLoading(true);
    void (async () => {
      const res = await fetchCourseInquiry({
        topic: prompt,
        brief: { version: 0, language: isZh ? 'zh-CN' : 'en-US' },
        followUpRound: 0,
        model: state.chatModel,
        timeoutMs: 20000,
      });
      if (runRef.current !== run) return; // 会话已被重开,响应作废
      if (res && res.questions && res.questions.length > 0) {
        setRounds([{ questions: res.questions, viaAI: res.source !== 'template' }]);
        setFollowUpAllowed(res.followUpAllowed);
      } else {
        setRounds([{ questions: buildDefaultInquiryQuestions(prompt, isZh), viaAI: false }]);
        toast(L('AI intake is unavailable right now — using the standard questionnaire.', 'AI 实时出题暂时不可用，已改用标准问询。'));
      }
      setLoading(false);
    })();
  };

  /* 首页「打造课程」带进来的命题:进场即播种,随后清空传输字段(刷新/重进不再复读旧命题) */
  useEffect(() => {
    if (seededRef.current) return;
    const seed = state.createPrompt.trim();
    if (!seed) return;
    seededRef.current = true;
    set({ createPrompt: '' });
    startWithTopic(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 确认定制 → 交棒全屏课程工坊(真实生成)。未作答的字段此刻才采用 AI 推荐值
   *  (表单本身不预置,用户作答过的字段永远以用户为准)。 */
  const confirmGeneration = () => {
    if (!topic.trim()) return;
    const merged: Record<string, string> = { ...answers };
    for (const r of rounds) for (const q of r.questions) {
      if (!merged[q.field] || !merged[q.field].trim()) merged[q.field] = q.recommended;
    }
    const finalBrief: CourseBriefParams = {
      version: round + 1,
      goal: merged.goal,
      background: merged.background,
      duration: merged.duration,
      depth: normalizeDepth(merged.depth),
      preference: merged.preference,
      language: merged.language || (isZh ? 'zh-CN' : 'en-US'),
      visual: merged.visual || 'Hand-drawn whiteboard diagrams & cards',
    };
    set({ generating: true, genQuery: topic, courseBrief: finalBrief, generated: null });
  };

  /** 智能追问澄清(≤2 轮):AI 基于已答内容实时出 1-2 个新问题,追加为新的一张导师卡 */
  const handleSmartFollowUp = async () => {
    if (round >= 2 || !followUpAllowed || loading) return;
    const run = runRef.current;
    setLoading(true);
    try {
      const res = await fetchCourseInquiry({
        topic,
        brief: { version: round + 1, ...answers },
        answers,
        followUpRound: round + 1,
        model: state.chatModel,
        timeoutMs: 20000,
      });
      if (runRef.current !== run) return;
      if (res && res.questions && res.questions.length > 0) {
        setRounds((r) => [...r, { questions: res.questions, viaAI: res.source !== 'template' }]);
        setFollowUpAllowed(res.followUpAllowed);
        setRound((v) => v + 1);
      } else {
        setFollowUpAllowed(false);
        toast(L('Current recommendations are fully calibrated.', '当前问询已对齐最佳配置'));
      }
    } catch {
      if (runRef.current !== run) return;
      setFollowUpAllowed(false);
    } finally {
      setLoading(false);
    }
  };

  /** 页内重新开始:清空对话回到命题输入(换一门课,不回首页);作废在途 AI 出题 */
  const restart = () => {
    runRef.current += 1;
    setTopic('');
    setRounds([]);
    setAnswers({});
    setRound(0);
    setFollowUpAllowed(true);
    setLoading(false);
    setInput('');
    seededRef.current = false;
    followRef.current = true;
  };

  /* 跨轮连续编号:第 2 轮的问题从上一轮末尾继续,而不是每张卡重新从 1 数 */
  let questionCounter = 0;

  return (
    <div className="hk-page cr-page">
      {/* floating top-right utility cluster(与聊天页同构) */}
      <div className="cr-utility">
        <button
          className="cr-util-btn"
          type="button"
          title={L('Back to home', '返回首页')}
          onClick={() => set({ screen: 'home', homeTab: 'craft' })}
        >
          <ArrowLeft size={15} />
        </button>
        <button
          className="cr-util-btn"
          type="button"
          title={L('Start a new course', '新开课程')}
          onClick={restart}
        >
          <SquarePen size={15} />
        </button>
        <button className="cr-issue" type="button" onClick={() => setSupportOpen(true)}>
          {t('chatResponse.haveAnIssue')}
        </button>
        <AvatarCat size={34} />
      </div>

      {/* conversation column */}
      <div className="cr-column" ref={columnRef}>
        {!topic ? (
          /* 空态:命题输入引导(深链 #/create 直达也落地于此,绝不空白) */
          <div className="cr-welcome">
            <GraduationCap size={44} strokeWidth={1.4} />
            <h2 className="cr-welcome-title">{L('Craft your next course', '打造你的下一门课')}</h2>
            <p className="cr-welcome-sub">
              {L(
                'Type what you want to learn below. Lattice will ask a few questions to tailor the course, then build it on your whiteboard.',
                '在下方输入你想学的内容。见界会先问几个问题为你定制，然后在白板上为你开课。',
              )}
            </p>
            <div className="cr-welcome-chips">
              {placeholders().slice(0, 4).map((p) => (
                <button
                  key={p}
                  type="button"
                  className="cr-welcome-chip"
                  onClick={() => {
                    setInput(p);
                    inputRef.current?.focus();
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* 用户命题气泡 */}
            <div className="cr-bubble-row user">
              <div className="cr-bubble user">{topic}</div>
            </div>

            {/* 每轮问询一张导师卡 */}
            {rounds.map((r, ri) => (
              <div className="cr-card" key={ri}>
                <div className="cr-card-head">
                  <Sparkles size={15} />
                  <span>{L('Curriculum Customization Brief', '定制课程前置问询')}</span>
                  <span className="cr-round-tag">
                    {ri === 0
                      ? L('3-5 Inquiries', '3-5 项推荐')
                      : L(`Follow-up ${ri}/2`, `智能追问 ${ri}/2`)}
                  </span>
                  {r.viaAI && (
                    <span className="cr-round-ai">
                      <Sparkle size={11} />
                      AI
                    </span>
                  )}
                </div>
                <div className="cr-card-sub">
                  {L(
                    'Confirm your learning goal, background, and visual preference. You can proceed directly with recommendations.',
                    '定制你的目标、基础、时间与板书偏好。可一键采用推荐继续，亦可自由修改。',
                  )}
                </div>
                <div className="cr-card-body">
                  {r.questions.map((q, qi) => {
                    questionCounter += 1;
                    const num = questionCounter;
                    const currentVal = answers[q.field] ?? q.recommended;
                    return (
                      <div className="cr-q" key={q.id || qi} style={{ '--q-idx': qi } as React.CSSProperties}>
                        <div className="cr-q-prompt">
                          <span className="cr-q-num">{num}</span>
                          <span>{q.prompt}</span>
                        </div>
                        <div className="cr-options">
                          {q.options.map((opt) => (
                            <button
                              type="button"
                              key={opt}
                              className={`cr-opt-chip${currentVal === opt ? ' selected' : ''}`}
                              onClick={() => setAnswers((prev) => ({ ...prev, [q.field]: opt }))}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          className="cr-q-input"
                          placeholder={L(
                            `Custom ${FIELD_LABELS[q.field]?.[0] ?? String(q.field)} (or pick above)`,
                            `自定义${FIELD_LABELS[q.field]?.[1] ?? String(q.field)}（或点击上方选项）`,
                          )}
                          value={answers[q.field] ?? ''}
                          onChange={(e) => setAnswers((prev) => ({ ...prev, [q.field]: e.target.value }))}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* 追问/首轮出题中的思考气泡:等待可见,不再是死按钮 */}
            {loading && (
              <div className="cr-bubble-row">
                <div className="cr-bubble">
                  <span className="cr-typing" role="status" aria-label={L('Tailoring follow-up questions…', '正在生成追问…')}>
                    <span className="cr-typing-dot" />
                    <span className="cr-typing-dot" />
                    <span className="cr-typing-dot" />
                    <span className="cr-typing-label">
                      {rounds.length === 0
                        ? L('Tailoring questions to your topic…', '正在针对你的主题实时出题…')
                        : L('Tailoring follow-up questions…', '正在生成追问…')}
                    </span>
                  </span>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={colEndRef} className="cr-col-end" />
      </div>

      {/* bottom dock:空态=命题输入;对话态=定制操作栏 */}
      <div className="cr-dock">
        {!topic ? (
          <div className="cr-composer">
            <input
              ref={inputRef}
              className="cr-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && input.trim()) startWithTopic(input.trim());
              }}
              placeholder={L('What do you want to learn? e.g. “Dead Sea Scrolls”', '你想学什么？例如「死海文书」')}
            />
            <button
              className="cr-send"
              type="button"
              title={L('Start', '开始定制')}
              disabled={!input.trim()}
              onClick={() => input.trim() && startWithTopic(input.trim())}
            >
              <ArrowUp size={14} />
            </button>
          </div>
        ) : (
          <div className="cr-dock-bar">
            <div className="cr-dock-left">
              <button type="button" className="cr-ghost-btn" onClick={confirmGeneration}>
                {L('Skip (Use Defaults)', '跳过定制 (直接生成)')}
              </button>
              {rounds.length > 0 && followUpAllowed && round < 2 && (
                <button
                  type="button"
                  className="cr-followup-btn"
                  onClick={() => void handleSmartFollowUp()}
                  disabled={loading}
                >
                  <Sparkles size={13} />
                  {L('Smart Clarification', '智能追问澄清')}
                </button>
              )}
            </div>
            <div className="cr-dock-right">
              <span className="cr-cost" title={L('A course costs 10 credits', '生成一门课程需要 10 积分')}>
                <Sparkles size={14} />
                10
              </span>
              {rounds.length > 0 && (
                <DarkPill style={{ height: 38, padding: '0 18px', fontWeight: 600 }} onClick={confirmGeneration}>
                  <Check size={14} style={{ marginRight: 6 }} />
                  {L('Continue with Recommended', '推荐继续')}
                </DarkPill>
              )}
            </div>
          </div>
        )}
      </div>

      {supportOpen && (
        <SupportModal onClose={() => setSupportOpen(false)} title={t('chatResponse.haveAnIssue')} />
      )}
    </div>
  );
};
