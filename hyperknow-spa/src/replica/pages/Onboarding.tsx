import React, { useEffect, useState } from 'react';
import {
  Check, Menu, Sparkles, Headphones, Gift, Plus, FileText, ArrowUp, Info, Store,
  ArrowUpRight, GraduationCap, Star, X, Flag, Share2, LayoutGrid, ClipboardList,
  Award, Play, Pencil, Circle, CheckCircle2, Highlighter, Image as ImageIcon,
  Pause, Volume2, SlidersHorizontal, ChevronDown, BookOpen, AudioLines,
} from 'lucide-react';
import type { PageProps } from '../types';
import {
  Logo, Ufo, UfoBadge, RocketGirl, Astronaut, DeskWriter, CatPerson, TrophyPerson,
  PlanetDoodle, AvatarCat, CourseCover,
} from '../illustrations';
import type { CoverKind } from '../illustrations';
import { DarkPill } from '../ui';
import { useI18n, LANGUAGES, TRich } from '../i18n';
import { L } from '../i18n/content';
import './Onboarding.css';

/* ================= shared bits ================= */

/** Compact open-book/node mark beside course providers. */
const MiniCube: React.FC = () => (
  <svg width="10" height="10" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M16 10C12 7 7 7 3 8v17c5-1 9 0 13 3 4-3 8-4 13-3V8c-4-1-9-1-13 2Z" stroke="#164E46" strokeWidth="2" strokeLinejoin="round" />
    <path d="M16 10v18M16 6v4" stroke="#164E46" strokeWidth="2" />
    <circle cx="16" cy="4" r="2" fill="#D9A441" />
  </svg>
);

const VoiceBars: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 12 12">
    <path d="M2 4.5 v3 M4.5 2.5 v7 M7 4.2 v3.6 M9.5 3 v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

/** Showcase laptop frame (~1044×590 at 1600×900) with blurred backdrop slivers. */
const Laptop: React.FC<{ tone: 'green' | 'gray' | 'tan'; children: React.ReactNode }> = ({ tone, children }) => (
  <div className="ob-laptop-zone">
    <div className={`ob-backdrop ${tone}`} />
    <div className="ob-laptop">
      <div className="ob-screen">
        {children}
        <div className="ob-veil" />
      </div>
    </div>
  </div>
);

/** In-mockup top-right cluster: PRO / 100 / EN / Talk to Founders / gift / avatar. */
const TopCluster: React.FC = () => {
  const { t } = useI18n();
  return (
  <div className="ob-sc-cluster">
    <span className="ob-pill-pro">PRO</span>
    <span className="ob-energy">
      <Sparkles size={11} className="ob-energy-ico" />
      100
    </span>
    <span className="ob-pill-en">EN</span>
    <span className="ob-pill-founders">
      <Headphones size={11} />
      {t('home.talkToFounders')}
    </span>
    <Gift size={14} className="ob-sc-gift" />
    <AvatarCat size={24} />
  </div>
  );
};

const ContinueLabel: React.FC = () => {
  const { t } = useI18n();
  return <>{t('onboarding.continue')}</>;
};
const BackLabel: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { t } = useI18n();
  return (
    <button className="hk-btn-text" onClick={onBack}>
      {t('onboarding.back')}
    </button>
  );
};

/* ================= steps 1 / 5: conversational ================= */

const StepTalk: React.FC<{ lines: string[]; cta?: () => void; shiftUp?: boolean }> = ({ lines, cta, shiftUp }) => (
  <div className={`ob-center${shiftUp ? ' ob-center-up' : ''}`}>
    <div className="ob-ufo-float">
      <UfoBadge size={96} />
    </div>
    <div className="ob-talk">
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
    {cta && (
      <div className="ob-cta">
        <DarkPill onClick={cta}><ContinueLabel /></DarkPill>
      </div>
    )}
  </div>
);

/* ================= step 2: language ================= */

const GREETS: Array<{ t: string; dx: number; dy: number; r: number; s: number }> = [
  { t: 'Hi!', dx: -115, dy: -95, r: -4, s: 17 },
  { t: '你好!', dx: 105, dy: -77, r: 3, s: 16 },
  { t: '¡Hola!', dx: -120, dy: 45, r: -3, s: 15 },
  { t: '안녕!', dx: 120, dy: 10, r: 2, s: 16 },
  { t: 'Hello!', dx: -85, dy: 100, r: -2, s: 15 },
  { t: '你好呀', dx: 95, dy: 85, r: 3, s: 16 },
];

const StepLanguage: React.FC<{ next: () => void }> = ({ next }) => {
  const { t, lng, setLng } = useI18n();
  const [lang, setLang] = useState(lng);  return (
    <div className="ob-lang-wrap">
      <div className="ob-lang-art">
        <div className="ob-beam" />
        <div className="ob-lang-badge">
          <div className="ob-ufo-float">
            <UfoBadge size={112} />
          </div>
        </div>
        {GREETS.map((g) => (
          <span
            key={g.t}
            className="ob-greet"
            style={{
              left: `calc(50% + ${g.dx}px)`,
              top: `calc(50% + ${g.dy}px)`,
              transform: `translate(-50%, -50%) rotate(${g.r}deg)`,
              fontSize: g.s,
            }}
          >
            {g.t}
          </span>
        ))}
      </div>

      <div className="ob-lang-right">
        <div className="ob-lang-q">{t('onboardingNew.chooseLanguage')}</div>
        <div className="ob-lang-list">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              className={`ob-lang-row${lang === l.code ? ' sel' : ''}`}
              onClick={() => setLang(l.code)}
            >
              <span>{l.nativeLabel}</span>
              <span className="ob-radio">{lang === l.code && <Check size={12} strokeWidth={3} />}</span>
            </button>
          ))}
        </div>
        <div className="ob-lang-confirm">
          <DarkPill
            onClick={() => {
              setLng(lang);
              next();
            }}
            style={{ height: 40, padding: '0 28px' }}
          >
            {t('onboarding.continue')}
          </DarkPill>
        </div>
      </div>
    </div>
  );
};

/* ================= steps 3 / 4: questions ================= */

const SOURCE_KEYS = [
  ['searchEngine', 'instagramOrTiktok', 'linkedinOrX'],
  ['rednote', 'friendReferral'],
  ['onCampus', 'blogPodcastNews'],
  ['other'],
] as const;

const ROLE_KEYS = ['highSchool', 'college', 'graduate', 'selfLearner', 'other'] as const;

const QuestionShell: React.FC<{
  heading: string;
  onBack: () => void;
  onNext: () => void;
  canNext: boolean;
  children: React.ReactNode;
}> = ({ heading, onBack, onNext, canNext, children }) => (
  <div className="ob-center">
    <RocketGirl size={170} />
    <div className="ob-h">{heading}</div>
    {children}
    <div className="ob-actions">
      <BackLabel onBack={onBack} />
      <DarkPill disabled={!canNext} onClick={onNext}><ContinueLabel /></DarkPill>
    </div>
  </div>
);

const StepSource: React.FC<{ onBack: () => void; onNext: () => void }> = ({ onBack, onNext }) => {
  const { t } = useI18n();
  const [sel, setSel] = useState<string | null>(null);
  return (
    <QuestionShell heading={t('onboarding.acquisitionTitle')} onBack={onBack} onNext={onNext} canNext={sel !== null}>
      <div className="ob-ref">{t('onboarding.referral.toggle')}</div>
      <div className="ob-chips">
        {SOURCE_KEYS.map((row, i) => (
          <div className="ob-chip-row" key={i}>
            {row.map((k) => {
              const label = t(`onboarding.acquisition.${k}`);
              return (
                <button key={k} className={`ob-chip${sel === label ? ' sel' : ''}`} onClick={() => setSel(label)}>
                  {label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </QuestionShell>
  );
};

const StepRole: React.FC<{ onBack: () => void; onNext: () => void }> = ({ onBack, onNext }) => {
  const { t } = useI18n();
  const [sel, setSel] = useState<string | null>(null);
  return (
    <QuestionShell heading={t('onboarding.step1Title')} onBack={onBack} onNext={onNext} canNext={sel !== null}>
      <div className="ob-cards">
        {ROLE_KEYS.map((k) => {
          const label = t(`onboarding.roles.${k}`);
          return (
            <button
              key={k}
              className={`ob-card-opt${sel === label ? ' sel' : ''}${k === 'other' ? ' last' : ''}`}
              onClick={() => setSel(label)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </QuestionShell>
  );
};

/* ================= step 6: Craft Courses showcase ================= */

const MktCard: React.FC<{
  cover: CoverKind;
  enrolled?: boolean;
  title: string;
  desc: string;
  onboard?: string;
  rating?: string;
}> = ({ cover, enrolled, title, desc, onboard, rating }) => {
  const { t } = useI18n();
  return (
    <div className="ob-mcard">
      <div className="ob-mcover">
        <CourseCover kind={cover} flat />
        {enrolled && <span className="ob-enrolled">{t('home.courseTicket.status.enrolled')}</span>}
      </div>
      <div className="ob-mcard-lab">
        <MiniCube /> {t('home.courseTicket.defaultAuthor', { brand: L('Lattice', '见界') })}
      </div>
      <div className="ob-mcard-title">{title}</div>
      <div className="ob-mcard-desc">{desc}</div>
      <div className="ob-mcard-foot">
        <span className="ob-mcard-onb">
          {onboard && (
            <>
              <GraduationCap size={10} /> {onboard} {t('home.courseTicket.onboardedLabel')}
            </>
          )}
        </span>
        <span className="ob-mcard-rate">
          {rating && (
            <>
              <Star size={10} className="ob-star" /> {rating}
            </>
          )}
        </span>
      </div>
    </div>
  );
};

const StepCraft: React.FC = () => {
  const { t } = useI18n();
  return (
  <div className="ob-show">
    <div className="ob-show-illus">
      <Astronaut size={100} />
    </div>
    <div className="ob-show-cap" />
    <Laptop tone="green">
      <div className="ob-sc-topbar">
        <Menu size={14} className="ob-sc-menu" />
        <TopCluster />
      </div>
      <div className="ob-sc-tabs">
        <span className="ob-sc-tab active">{t('home.modeTabs.craftCourses')}</span>
        <span className="ob-sc-tab">{t('home.modeTabs.instantAssistance')}</span>
      </div>
      <div className="ob-craft-head">
        <TRich text={t('home.craftCoursesTitle')} orbie={<PlanetDoodle size={30} />} />
      </div>
      <div className="ob-craft-sub">{t('home.craftCoursesDescription')}</div>
      <div className="ob-prompt">
        <div className="ob-prompt-text">{L('Help me build a course on AP Calculus', '帮我做一门 AP 微积分课程')}</div>
        <div className="ob-prompt-bar">
          <span className="ob-ico-circle">
            <Plus size={12} />
          </span>
          <span className="ob-chip-self">
            <Sparkles size={10} /> {t('home.courseSourceSelf')}
          </span>
          <span className="ob-chip-self ob-chip-file">
            <FileText size={10} />
          </span>
          <span className="ob-send">
            <ArrowUp size={12} />
          </span>
        </div>
      </div>
      <div className="ob-lms">
        <TRich text={t('home.craftCourseLmsImport')} classes={{ span: 'hm-lms-link' }} />
      </div>
      <div className="ob-info-line">
        <Info size={10} /> {t('home.craftCourseStartHelp')}
      </div>
      <div className="ob-mkt">
        <div className="ob-mkt-head">
          <span className="ob-mkt-title">
            <Store size={13} /> {t('home.marketplace.title')}
          </span>
          <span className="ob-mkt-view">
            {t('home.marketplace.viewAll')} <ArrowUpRight size={10} />
          </span>
        </div>
        <div className="ob-mkt-cards">
          <MktCard
            cover="ai"
            enrolled
            title={L('How AI actually Works', 'AI 到底是怎样工作的')}
            desc={L(
              'A beginner-friendly explanation of how artificial intelligence learns, generates answers, makes mistakes, and improv…',
              '面向初学者解释人工智能如何学习、生成答案、犯错并不断改进…',
            )}
            onboard="9K"
            rating="4.4"
          />
          <MktCard
            cover="philo"
            enrolled
            title={L('Philosophy and Everyday Reasoning', '哲学与日常推理')}
            desc={L(
              'An exploration of logic, knowledge, identity, ethics, freedom, justice, and society. This course bridges ancient…',
              '探索逻辑、知识、身份、伦理、自由、正义与社会。本课程连接古代…',
            )}
          />
          <MktCard
            cover="history"
            title={L('AP World History: Modern', 'AP 世界史：现代')}
            desc={L(
              'A comprehensive global history course examining major political, economic, social, cultural, and technological…',
              '一门全面的全球史课程，考察重大政治、经济、社会、文化与技术变革…',
            )}
            onboard="7.6K"
            rating="4.5"
          />
        </div>
      </div>
    </Laptop>
  </div>
  );
};

/* ================= step 7: course structure showcase ================= */

const SessionRow: React.FC<{ title: string; sub?: string; upNext?: boolean }> = ({ title, sub, upNext }) => {
  const { t } = useI18n();
  return (
    <div className="ob-l7-session">
      <div className="ob-l7-session-main">
        <div className="ob-l7-session-title">
          {title}
          {upNext && <span className="ob-upnext">{t('courseJourney.upNextPill')}</span>}
        </div>
        {sub && <div className="ob-l7-session-sub">{sub}</div>}
      </div>
      <div className="ob-l7-actions">
        <span className="ob-learn">
          <Play size={9} /> {t('courseJourney.learnAction')}
        </span>
        <span className="ob-practice">
          <Pencil size={9} /> {t('courseJourney.practiceAction')}
        </span>
        <span className="ob-circle-check" />
      </div>
    </div>
  );
};

const OB_UNITS = (): string[] => [
  L('Exploring One-Variable Data and Collecting Data', '探索单变量数据与收集数据'),
  L('Probability, Random Variables, and Probability Distributions', '概率、随机变量与概率分布'),
  L('Inference for Categorical Data', '分类数据的推断'),
  L('Inference for Quantitative Data', '数值数据的推断'),
  L('Regression Analysis', '回归分析'),
];

const OB_LECTURES = () => [
  {
    title: L('Lecture 1: Statistical Questions and Variables', '第 1 讲：统计问题与变量'),
    desc: L(
      'Introduces the nature of statistical inquiries, identifying the individuals under study, and classifying the types of variables collected.',
      '介绍统计探究的本质，识别研究对象，并对所收集变量的类型进行分类。',
    ),
    sessions: [
      {
        title: L('Statistical Investigations and Questions', '统计调查与统计问题'),
        upNext: true,
        sub: L(
          'Learn what makes a question statistical by focusing on the concept of variability rather than deterministic answers.',
          '通过聚焦“变异性”而非确定性答案的概念，理解什么样的问题才是统计问题。',
        ),
      },
      { title: L('Individuals, Variables, and Data', '个体、变量与数据') },
      { title: L('Categorical and Quantitative Variables', '分类变量与数值变量') },
    ],
  },
  {
    title: L('Lecture 2: Exploring Categorical Data', '第 2 讲：探索分类数据'),
    desc: L(
      'Explores how to summarize, visualize, and analyze categorical variables using frequency tables and bar charts.',
      '探索如何使用频率表和条形图来汇总、可视化并分析分类变量。',
    ),
    sessions: [
      { title: L('Frequency and Relative Frequency Tables', '频率与相对频率表') },
      { title: L('Bar Charts and Other Categorical Displays', '条形图与其他分类图示') },
      { title: L('Describing and Comparing Categorical Data', '描述与比较分类数据') },
    ],
  },
];

const StepCourse: React.FC = () => {
  const { t } = useI18n();
  const units = OB_UNITS();
  const lectures = OB_LECTURES();
  return (
  <div className="ob-show">
    <div className="ob-show-illus">
      <DeskWriter size={100} />
    </div>
    <div className="ob-show-cap">
      <div className="ob-cap">
        {t('onboarding.brief.courseHeadline1')}
      </div>
    </div>
    <Laptop tone="gray">
      <div className="ob-course-trunc">
        {L(
          '…one-variable data visually, compare measures of center and spread, and design sound observational studies and randomized experiments.',
          '…以可视化的方式呈现单变量数据，比较集中趋势与离散程度的度量，并设计可靠的观察研究与随机实验。',
        )}
      </div>
      <div className="ob-sc-topbar">
        <div className="ob-l7-topleft">
          <Menu size={14} className="ob-sc-menu" />
          <span className="ob-exit">
            <X size={11} /> {t('courseSession.exitCourse')}
          </span>
        </div>
        <div className="ob-sc-cluster">
          <span className="ob-pill-pro">PRO</span>
          <span className="ob-energy">
            <Sparkles size={11} className="ob-energy-ico" />
            100
          </span>
          <span className="ob-issue">
            <Flag size={11} /> {t('chatResponse.haveAnIssue')}
          </span>
        </div>
      </div>
      <div className="ob-course-body">
        {/* left cover column */}
        <div className="ob-course-left">
          <div className="ob-l7-cover">
            <CourseCover kind="stats" flat />
            <span className="ob-l7-coverbtn" style={{ right: 34 }}>
              <Share2 size={10} />
            </span>
            <span className="ob-l7-coverbtn" style={{ right: 8 }}>
              <LayoutGrid size={10} />
            </span>
          </div>
          <div className="ob-l7-curated">
            {t('courseJourney.curatedByPrefix')} <MiniCube /> <b>{L('Lattice Official', '见界官方')}</b>
          </div>
          <div className="ob-l7-name">{L('AP Stats', 'AP 统计')}</div>
          <div className="ob-l7-desc">
            {L(
              'A comprehensive, college-level introductory statistics course designed to build a deep, concept-first understanding of data collection…',
              '一门全面的大学水平的统计学入门课程，旨在建立以概念为先的、对数据收集的深刻理解…',
            )}
          </div>
          <div className="ob-l7-showmore">{t('courseJourney.showMoreButton')}</div>
          <div className="ob-l7-tags">
            <span>{L('# Statistics', '# 统计')}</span>
            <span>{L('# AP Prep', '# AP 备考')}</span>
          </div>
          <div className="ob-l7-tags">
            <span>{L('# Data Analysis', '# 数据分析')}</span>
            <span>{L('# Probability', '# 概率')}</span>
          </div>
          <div className="ob-l7-panel-label">{t('courseJourney.panelSectionTitle')}</div>
          <div className="ob-l7-tabs">
            <span className="ob-l7-tab active">
              <svg width="9" height="9" viewBox="0 0 9 9">
                <path d="M1 2 h7 M1 4.5 h7 M1 7 h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              {t('courseJourney.tabs.units')}
            </span>
            <span className="ob-l7-tab">{t('courseJourney.tabs.materials')}</span>
            <span className="ob-l7-tab">{t('courseJourney.tabs.practices')}</span>
          </div>
          <div className="ob-l7-units">
            {units.map((u, i) => (
              <div key={u} className={`ob-l7-unit${i === 0 ? ' active' : ''}`}>
                <span className="ob-l7-unit-n">{i + 1}</span>
                <span className="ob-l7-unit-t">{u}</span>
              </div>
            ))}
          </div>
        </div>

        {/* main column */}
        <div className="ob-course-main">
          <div className="ob-addmat">
            <span className="ob-addmat-icons">
              <FileText size={13} style={{ color: '#60A5FA' }} />
              <FileText size={13} style={{ color: '#34C98E' }} />
              <FileText size={13} style={{ color: '#F87171' }} />
            </span>
            <span className="ob-addmat-text">
              <b>{t('courseExtend.entryTitle')}</b>
              <em>{t('courseExtend.entrySubtitle')}</em>
            </span>
          </div>

          <div className="ob-legend">
            <span>
              <CheckCircle2 size={11} style={{ color: '#22C55E' }} /> {t('courseJourney.progressLegend.mastered')}
            </span>
            <span>
              <i className="ob-dot" style={{ background: '#60A5FA' }} /> {t('courseJourney.progressLegend.proficient')}
            </span>
            <span>
              <i className="ob-dot" style={{ background: '#A78BFA' }} /> {t('courseJourney.progressLegend.familiar')}
            </span>
            <span>
              <i className="ob-dot" style={{ background: '#9CA3AF' }} /> {t('courseJourney.progressLegend.attempted')}
            </span>
            <span>
              <i className="ob-dot ring" /> {t('courseJourney.progressLegend.notStarted')}
            </span>
            <span>
              <ClipboardList size={11} style={{ color: '#9CA3AF' }} /> {t('courseJourney.kindLabel.project')}
            </span>
            <span>
              <Award size={11} style={{ color: '#9CA3AF' }} /> {t('courseJourney.kindLabel.exam')}
            </span>
          </div>

          <div className="ob-strip">
            {Array.from({ length: 13 }).map((_, i) => (
              <i key={i} className="ob-node" />
            ))}
            <ClipboardList size={10} style={{ color: '#C3C7CD' }} />
            <Award size={10} style={{ color: '#C3C7CD' }} />
            <span className="ob-strip-ghost">
              <Play size={8} /> {L('It’s the new course, please start… ›', '这是新课程，请从这里开始… ›')}
            </span>
          </div>

          {lectures.map((lec, li) => (
            <div className="ob-lec" key={li}>
              <div className="ob-lec-title">{lec.title}</div>
              <div className="ob-lec-desc">{lec.desc}</div>
              {lec.sessions.map((s) => (
                <SessionRow key={s.title} title={s.title} upNext={s.upNext} sub={s.sub} />
              ))}
              {li === 0 && (
                <>
                  <div className="ob-reffiles">
                    <span>{t('courseJourney.referenceFilesTitle')}</span>
                    <span className="ob-addfile">+ {t('courseJourney.addFileButton')}</span>
                  </div>
                  <div className="ob-tooltip">{t('courseSession.sessionIntroHideHint')}</div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </Laptop>
  </div>
  );
};

/* ================= step 8: whiteboard autoplay demo ================= */

/** Hand-drawn parabola chart (y = x²) as inline SVG. */
const Parabola: React.FC = () => (
  <svg viewBox="0 0 220 250" width="100%" className="ob-parabola">
    {/* cream fill inside the bowl */}
    <path d="M34 20 Q110 390 186 20 Z" fill="#F7F0DC" opacity="0.55" />
    {/* sketchy 3-stroke parabola */}
    <path d="M34 20 Q110 390 186 20" fill="none" stroke="#E8B4A0" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M36 21 Q112 388 188 21" fill="none" stroke="#8FA3B8" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
    <path d="M32 19 Q108 392 184 19" fill="none" stroke="#B9B0A4" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
    {/* axes */}
    <path d="M10 205 H206" stroke="#8A9199" strokeWidth="1.6" />
    <path d="M206 205 l-8 -3.2 v6.4 z" fill="#8A9199" />
    <path d="M110 238 V18" stroke="#8A9199" strokeWidth="1.6" />
    <path d="M110 18 l-3.2 8 h6.4 z" fill="#8A9199" />
    {/* x ticks */}
    {[38, 74, 110, 146, 182].map((x) => (
      <path key={x} d={`M${x} 202 v5`} stroke="#8A9199" strokeWidth="1.2" />
    ))}
    {[-2, -1, 0, 1, 2].map((t, i) => (
      <text key={t} x={[38, 74, 110, 146, 182][i]} y="219" textAnchor="middle" className="ob-p-tick">
        {t}
      </text>
    ))}
    {/* y ticks */}
    {[163, 121, 79, 37].map((y) => (
      <path key={y} d={`M106 ${y} h5`} stroke="#8A9199" strokeWidth="1.2" />
    ))}
    {[1, 2, 3, 4].map((t, i) => (
      <text key={t} x="100" y={[166, 124, 82, 40][i]} textAnchor="end" className="ob-p-tick">
        {t}
      </text>
    ))}
    <text x="196" y="224" textAnchor="end" className="ob-p-axis">{L('X-AXIS', '横轴')}</text>
    <text x="120" y="14" className="ob-p-axis">{L('Y-AXIS', '纵轴')}</text>
    {/* axis of symmetry */}
    <path d="M110 30 V205" stroke="#9AA3AD" strokeWidth="1.2" strokeDasharray="4 4" />
    <text x="136" y="30" className="ob-p-axis">{L('AXIS OF', '对称')}</text>
    <text x="136" y="42" className="ob-p-axis">{L('SYMMETRY', '轴')}</text>
    <path d="M134 44 L115 56" stroke="#8A9199" strokeWidth="1" />
    <path d="M115 56 l6 -1.4 -2.4 5.4 z" fill="#8A9199" />
    {/* dotted width segment */}
    <path d="M44 58 H176" stroke="#8A9199" strokeWidth="1.6" strokeDasharray="0.5 5" strokeLinecap="round" />
    <circle cx="44" cy="58" r="2.6" fill="#fff" stroke="#6B7280" strokeWidth="1.2" />
    <circle cx="176" cy="58" r="2.6" fill="#fff" stroke="#6B7280" strokeWidth="1.2" />
    {/* vertex */}
    <circle cx="110" cy="205" r="3" fill="#F7F0DC" stroke="#6B7280" strokeWidth="1.4" />
    <text x="130" y="234" className="ob-p-axis">{L('VERTEX', '顶点')}</text>
    <path d="M126 227 L114 210" stroke="#8A9199" strokeWidth="1" />
    <path d="M114 210 l1.4 6 3.6 -4.4 z" fill="#8A9199" />
  </svg>
);

const ChatMsg: React.FC<{ delay: number; children: React.ReactNode }> = ({ delay, children }) => (
  <div className="ob-chat-msg ob-w" style={{ animationDelay: `${delay}s` }}>
    {children}
  </div>
);

const ChatEvent: React.FC<{ delay: number; icon: React.ReactNode; children: React.ReactNode }> = ({
  delay,
  icon,
  children,
}) => (
  <div className="ob-chat-event ob-w" style={{ animationDelay: `${delay}s` }}>
    {icon}
    <span>{children}</span>
  </div>
);

const StepBoard: React.FC<{ onBack: () => void; onNext: () => void }> = ({ onBack, onNext }) => {
  const { t } = useI18n();
  return (
  <>
    <div className="ob-cap-top">{t('onboarding.brief.boardHeadline')}</div>

    <div className="ob-board">
      {/* quadratic function cluster */}
      <div className="ob-b-quad">
        <div className="ob-b-h1 ob-w" style={{ animationDelay: '0.5s' }}>
          <svg width="15" height="15" viewBox="0 0 16 16" style={{ verticalAlign: '-1px', marginRight: 4 }}>
            <path
              d="M8 1.5 l1.7 4 4.3 .3 -3.3 2.8 1.1 4.2 -3.8 -2.4 -3.8 2.4 1.1 -4.2 -3.3 -2.8 4.3 -.3 z"
              fill="#4F46E5"
            />
          </svg>
          <span className="ob-hl">{t('onboarding.board.card1Title')}</span>
        </div>
        <div className="ob-b-line ob-w" style={{ animationDelay: '1.4s' }}>
          <span className="ob-eq">y = x² + bx + c</span>
          {L(' draws a parabola.', ' 画出一条抛物线。')}
        </div>
        <div className="ob-b-line ob-w" style={{ animationDelay: '2.3s' }}>
          {L('Its turning point is the ', '它的拐点就是')}
          <span className="ob-hl">{t('onboarding.board.card1Highlight')}</span>
          {L('.', '。')}
        </div>
      </div>

      {/* silk road cluster */}
      <div className="ob-b-silk">
        <div className="ob-b-h1 ob-b-ink ob-w" style={{ animationDelay: '8.6s' }}>
          <span className="ob-hl">{t('onboarding.board.card3Title')}</span>
        </div>
        <div className="ob-b-line ob-w" style={{ animationDelay: '9.2s' }}>
          {L('Routes linking China to the', '连接中国与')}
          <br />
          {L('Mediterranean.', '地中海的商路。')}
        </div>
        <div className="ob-b-line ob-w" style={{ animationDelay: '9.8s' }}>
          {L('Silk and spices moved west, and so did', '丝绸和香料向西流动，')}
          <br />
          <span className="ob-hl">{t('onboarding.board.card3Highlight')}</span>
          {L(' and astronomy.', '和天文也随之西传。')}
        </div>
      </div>

      {/* parabola chart */}
      <div className="ob-b-chart ob-ghost" style={{ animationDelay: '6s' }}>
        <Parabola />
      </div>
      <div className="ob-b-chartcap ob-w" style={{ animationDelay: '7.2s' }}>
        {t('onboarding.board.image1Caption')}
      </div>

      {/* floating controls */}
      <div className="ob-board-ctl">
        <span className="ob-ctl-btn">
          <Pause size={15} />
        </span>
        <span className="ob-ctl-btn">
          <Volume2 size={15} />
        </span>
      </div>

      {/* bottom captions (cross-fade) */}
      <div className="ob-board-cap">
        <span className="ob-cap-line c1">{t('onboarding.board.line1')}</span>
        <span className="ob-cap-line c2">{t('onboarding.board.line4')}</span>
        <span className="ob-cap-line c3">{t('onboarding.board.line5')}</span>
      </div>

      {/* chat history panel */}
      <div className="ob-chat">
        <div className="ob-chat-head">
          {t('courseSession.chatHistory')}
          <X size={15} className="ob-chat-x" />
        </div>
        <div className="ob-chat-body">
          <ChatMsg delay={0.3}>{t('onboarding.board.line1')}</ChatMsg>
          <ChatEvent delay={1.0} icon={<Pencil size={12} />}>
            {t('onboarding.board.card1Title')}
          </ChatEvent>
          <ChatEvent delay={2.6} icon={<Highlighter size={12} />}>
            {t('onboarding.board.card1Highlight')}
          </ChatEvent>
          <ChatMsg delay={3.1}>{t('onboarding.board.line2')}</ChatMsg>
          <ChatEvent delay={3.7} icon={<Circle size={12} />}>
            {t('onboarding.board.card1Circle')}
          </ChatEvent>
          <ChatMsg delay={4.3}>{t('onboarding.board.line3')}</ChatMsg>
          <div className="ob-chat-user ob-pop" style={{ animationDelay: '5s' }}>
            {t('onboarding.board.userQuestion')}
          </div>
          <ChatMsg delay={5.6}>{t('onboarding.board.line4')}</ChatMsg>
          <ChatEvent delay={7.0} icon={<ImageIcon size={12} />}>
            {t('onboarding.board.image1Caption')}
          </ChatEvent>
          <ChatMsg delay={7.8}>{t('onboarding.board.line5')}</ChatMsg>
          <ChatEvent delay={9.0} icon={<Pencil size={12} />}>
            {t('onboarding.board.card3Title')}
          </ChatEvent>
          <ChatEvent delay={9.9} icon={<Highlighter size={12} />}>
            {t('onboarding.board.card3Highlight')}
          </ChatEvent>
        </div>
        <div className="ob-chat-input">
          <span className="ob-chat-ph">{t('onboardingNew.guidedIntro')}</span>
          <span className="ob-chat-send">
            <ArrowUp size={14} />
          </span>
        </div>
      </div>
    </div>

    <div className="ob-board-nav">
      <button className="ob-back" onClick={onBack}>
        {t('onboarding.back')}
      </button>
      <DarkPill onClick={onNext} style={{ height: 44, padding: '0 30px' }}>
        {t('onboarding.brief.nextWay')}
      </DarkPill>
    </div>
  </>
  );
};

/* ================= step 9: Instant Assistance showcase ================= */

const StepInstant: React.FC = () => {
  const { t } = useI18n();
  return (
  <div className="ob-show">
    <div className="ob-show-illus">
      <CatPerson size={100} />
    </div>
    <div className="ob-show-cap">
      <div className="ob-cap">
        {t('onboarding.brief.instantHeadline1')}
      </div>
    </div>
    <Laptop tone="tan">
      <div className="ob-screen-ia">
        <div className="ob-ia-tabs-wrap">
          <div className="ob-ia-tabs">
            <span className="ob-ia-tab">{t('home.modeTabs.craftCourses')}</span>
            <span className="ob-ia-tab active">{t('home.modeTabs.instantAssistance')}</span>
          </div>
        </div>
        <div className="ob-ia-hero">
          <Ufo size={72} />
          <span className="ob-ia-h">
            {L('What shall', '我们今天来探索')}
            <span className="ob-ia-more">{L('we explore…?', '什么…？')}</span>
          </span>
        </div>
        <div className="ob-ia-input">
          <div className="ob-ia-text">{t('home.rollingPlaceholderHints.0')}</div>
          <div className="ob-ia-bar">
            <span className="ob-ico-circle">
              <Plus size={13} />
            </span>
            <span className="ob-ico-circle">
              <AudioLines size={12} />
            </span>
            <span className="ob-tools">
              <SlidersHorizontal size={12} /> {t('home.tools')}
            </span>
            <span className="ob-ico-circle">
              <VoiceBars />
            </span>
            <span className="ob-normal">
              <GraduationCap size={13} /> {t('home.speedModeNormal')} <ChevronDown size={12} />
            </span>
            <span className="ob-send">
              <ArrowUp size={13} />
            </span>
          </div>
        </div>
        <div className="ob-ia-chips">
          <span className="ob-ia-chip">
            <Sparkles size={13} className="ob-ia-chip-ico" /> {t('home.actionButtons.conceptExplanation')}
            <span className="ob-upgraded">{t('home.badges.upgraded')}</span>
          </span>
          <span className="ob-ia-chip">
            <BookOpen size={13} /> {t('home.actionButtons.studyMaterials')}
          </span>
          <span className="ob-ia-chip">
            <FileText size={13} /> {t('home.actionButtons.longFiles')}
          </span>
        </div>
        <div className="ob-ia-chips ob-ia-chips2">
          <span className="ob-ia-chip">
            <i className="ob-bar" style={{ width: 90 }} />
          </span>
          <span className="ob-ia-chip">
            <i className="ob-bar" style={{ width: 124 }} />
          </span>
          <span className="ob-ia-chip">
            <i className="ob-bar" style={{ width: 70 }} />
          </span>
        </div>
      </div>
    </Laptop>
  </div>
  );
};

/* ================= step 10: finale ================= */

const StepFinale: React.FC<{ start: () => void }> = ({ start }) => {
  const { t } = useI18n();
  return (
    <div className="ob-center">
      <TrophyPerson size={150} />
      <div className="ob-cap ob-finale-cap">{t('onboarding.finishTitle')}</div>
      <div className="ob-cta">
        <DarkPill onClick={start} style={{ height: 48, padding: '0 34px' }}>
          {t('onboarding.finishCta')}
        </DarkPill>
      </div>
    </div>
  );
};

/* ================= root ================= */

const AUTO_ADVANCE: Record<number, number> = { 5: 1800, 6: 3500, 7: 3500, 9: 3500 };

export const Onboarding: React.FC<PageProps> = ({ state, set }) => {
  const { t } = useI18n();
  const step = Math.min(10, Math.max(1, Math.round(state.onboardingStep || 1)));

  useEffect(() => {
    const delay = AUTO_ADVANCE[step];
    if (!delay) return;
    const t = setTimeout(() => set({ onboardingStep: step + 1 }), delay);
    return () => clearTimeout(t);
  }, [step, set]);

  const go = (n: number) => () => set({ onboardingStep: n });

  return (
    <div className="ob-root">
      <div className="ob-logo">
        <Logo size={27} />
      </div>

      <div className="ob-step" key={step}>
      {step === 1 && (
        <StepTalk
          lines={[
            t('onboarding.welcomeGreeting', { name: t('onboarding.welcomeGuest') }),
            t('onboarding.welcomeIntro'),
          ]}
          cta={go(2)}
        />
      )}
      {step === 2 && <StepLanguage next={go(3)} />}
      {step === 3 && <StepSource onBack={go(2)} onNext={go(4)} />}
      {step === 4 && <StepRole onBack={go(3)} onNext={go(5)} />}
      {step === 5 && (
        <StepTalk shiftUp lines={[t('onboarding.handoverLine1')]} />
      )}
        {step === 6 && <StepCraft />}
        {step === 7 && <StepCourse />}
        {step === 8 && <StepBoard onBack={go(7)} onNext={go(9)} />}
        {step === 9 && <StepInstant />}
        {step === 10 && <StepFinale start={() => set({ screen: 'home', welcomeBack: true })} />}
      </div>
    </div>
  );
};
