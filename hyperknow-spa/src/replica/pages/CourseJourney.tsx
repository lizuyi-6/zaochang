import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Play,
  PenLine,
  Check,
  ClipboardCheck,
  Award,
  Presentation,
  Compass,
  ChevronRight,
  CornerUpRight,
  CalendarPlus,
  List,
  FileText,
  MoreHorizontal,
  ExternalLink,
  Trash2,
  Loader2,
  Plus,
} from 'lucide-react';
import type { PageProps } from '../types';
import { Modal } from '../ui';
import { SkaterKid, CourseCover } from '../illustrations';
import { publicSpeaking, psCourse } from '../data';
import { useI18n, TRich } from '../i18n';
import { L } from '../i18n/content';
import { downloadIcs, shareLink } from '../actions';
import { toast } from '../toast';
import { formatSize, loadMaterials, removeMaterial, uploadMaterial, type CourseMaterial } from '../materials';
import './CourseJourney.css';

/* ------------------------------------------------------------------ */
/* Local illustration: Lattice open book and knowledge node            */
/* ------------------------------------------------------------------ */
export const KnotMark: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = '#164E46' }) => (
  <svg width={size} height={size * 0.9} viewBox="0 0 32 32" fill="none" aria-hidden="true" style={{ display: 'block' }}>
    <path d="M16 10C12 7 7 7 3 8v17c5-1 9 0 13 3 4-3 8-4 13-3V8c-4-1-9-1-13 2Z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    <path d="M16 10v18M16 6v4" stroke={color} strokeWidth="2" />
    <circle cx="16" cy="4" r="2" fill="#D9A441" />
  </svg>
);

/* Original editorial public-speaking plate; legacy export retained. */
export const KandinskyCover: React.FC<{ size?: number; radius?: number }> = ({ size = 248, radius = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 248 248" aria-hidden="true" style={{ display: 'block', borderRadius: radius, flexShrink: 0 }}>
    <rect width="248" height="248" fill="#F7F4EC" />
    <path d="M20 20h208v208H20zM20 64h208M64 20v208M184 20v208M20 184h208" fill="none" stroke="#164E46" strokeOpacity=".12" />
    <circle cx="159" cy="86" r="57" fill="#D9A441" />
    <path d="M110 160V95a42 42 0 0 1 84 0v65" fill="#B7C9B6" />
    <path d="M190 78q23 16 0 32M201 66q37 28 0 56" fill="none" stroke="#164E46" strokeWidth="2" strokeLinecap="round" />
    <path d="M112 82c0-20 28-20 28 0v21c0 20-28 20-28 0Z" fill="#164E46" />
    <path d="M105 99v6a21 21 0 0 0 42 0v-6M126 126v31M111 158h30" fill="none" stroke="#164E46" strokeWidth="3" strokeLinecap="round" />
    <path d="M49 174h122l-11 49H60Z" fill="#164E46" />
    <path d="M47 165h128v10H47z" fill="#D9A441" />
    <path d="M69 154v-19l22 7 22-7v19l-22 7Z" fill="#F7F4EC" stroke="#164E46" strokeWidth="2" />
    <path d="M91 142v19" stroke="#164E46" strokeWidth="2" />
    <circle cx="35" cy="35" r="4" fill="#164E46" />
    <path d="M45 35h35M205 209h23M217 197v24" stroke="#164E46" strokeWidth="1.5" />
    <path d="M74 194h66M74 201h45" stroke="#F7F4EC" strokeOpacity=".55" />
  </svg>
);

/* ------------------------------------------------------------------ */
/* Progress ring (hollow when pct = 0)                                 */
/* ------------------------------------------------------------------ */
const Ring: React.FC<{ size?: number; pct?: number; color?: string; track?: string }> = ({
  size = 20,
  pct = 0,
  color = '#7896C5',
  track,
}) => {
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={track ?? (pct > 0 ? '#E5E7ED' : '#D8DCE3')}
        strokeWidth={2.2}
      />
      {pct > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeDasharray={`${(c * pct) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  );
};

/* Fanned DOC / XLS / PDF file icons for the "Add materials" card. */
const FileFan: React.FC = () => (
  <svg width="58" height="38" viewBox="0 0 58 38" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
    <g transform="rotate(-15 18 23)">
      <path d="M7 8h15l5 5v21H7Z" fill="#B7C9B6" stroke="#164E46" />
      <path d="M12 17h10M12 21h10M12 25h6" stroke="#164E46" />
    </g>
    <g transform="rotate(3 29 20)">
      <path d="M19 4h15l5 5v24H19Z" fill="#F7F4EC" stroke="#164E46" />
      <path d="M34 4v6h5M24 15h10M24 20h10M24 25h7" fill="none" stroke="#164E46" />
    </g>
    <g transform="rotate(17 42 24)">
      <path d="M32 10h15l5 5v21H32Z" fill="#D9A441" stroke="#164E46" />
      <path d="m37 28 4-9 5 9M38 25h7" fill="none" stroke="#164E46" strokeWidth="1.4" />
    </g>
  </svg>
);

const CourseJourney: React.FC<PageProps> = ({ state, set }) => {
  const { t } = useI18n();
  /* 伪生成课程存在时整页切换数据源;默认仍是参考截图的公开演讲课 */
  const PS = state.generated ?? psCourse();
  const UNITS = state.generated ? state.generated.units : publicSpeaking();
  const joined = state.courseJoined;
  const done = state.lectureDone;
  const [dialog, setDialog] = useState<'none' | 'join' | 'joined'>('none');
  const [lang, setLang] = useState<'en' | 'zh'>('en');
  const closeDialogs = () => setDialog('none');

  /* ---------------- 交互状态:简介展开 / 面板标签 / 当前单元 / 材料 ---------------- */
  const [expanded, setExpanded] = useState(false);
  const [panelTab, setPanelTab] = useState<'units' | 'materials' | 'practices'>('units');
  const [activeUnit, setActiveUnit] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  /* 材料清单按"账户 + 课程"隔离;未登录(纯静态演示)退化为 demo 域 */
  const scope = `${state.identity?.email ?? 'demo'}:${PS.title}`;
  const [materials, setMaterials] = useState<CourseMaterial[]>(() => loadMaterials(scope));
  useEffect(() => setMaterials(loadMaterials(scope)), [scope]);

  const unit = UNITS.find((u) => u.id === activeUnit) ?? UNITS[0];
  const unitChip =
    activeUnit === 1
      ? PS.unit1Chip
      : L(`UNIT ${activeUnit} OF ${UNITS.length}`, `第 ${activeUnit} 单元，共 ${UNITS.length} 单元`);
  const unitTitle =
    activeUnit === 1 ? PS.unit1Title : L(`Unit ${activeUnit}: ${unit.title}`, `第 ${activeUnit} 单元：${unit.title}`);
  const unitDesc =
    activeUnit === 1
      ? PS.unit1Description
      : L(
          'Lectures, practices, and a project for this part of the course.',
          '本单元包含讲座、练习与一个项目。',
        );
  /* 未加入 → 先弹加入确认;已加入 → 进白板课堂(lecture 从头讲 / practice 直通随堂练习) */
  const openLesson = (mode: 'lecture' | 'practice') => {
    if (!joined) {
      setDialog('join');
      return;
    }
    set({ screen: 'whiteboard', whiteboardMode: mode });
  };
  /* "练习"标签列出当前单元的练习项(取自各讲的 session) */
  const practiceRows = unit.lectures.flatMap((lec) => lec.sessions.map((s) => s.title));
  const onShareCourse = () => void shareLink(window.location.href, `${PS.title} · ${L('Lattice', '见界')}`);
  const onAddToCalendar = () => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(19, 0, 0, 0);
    downloadIcs({
      title: `${PS.title} — ${unitTitle}`,
      description: unitDesc,
      start,
      minutes: 60,
    });
  };
  const onPickMaterial = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const material = await uploadMaterial(scope, file);
    setUploading(false);
    if (!material) {
      toast(L('Upload failed — please try again', '上传失败，请重试'));
      return;
    }
    setMaterials(loadMaterials(scope));
    setPanelTab('materials');
    toast(L(`Added “${material.name}” to this course`, `已把《${material.name}》加入本课程`));
  };

  return (
    <div className="hk-page with-sidebar cj-page">
      <div className="hk-page-inner">
        <div className="cj-layout">
          {/* ---------------- Left column ---------------- */}
          <div className="cj-left">
            <button
              className="cj-back"
              type="button"
              onClick={() => set({ screen: joined ? 'courses' : 'marketplace' })}
            >
              <X size={15} />
              <span>{joined ? t('courseSession.exitCourse') : t('home.marketplace.backToMarketplace')}</span>
            </button>

            <div className="cj-cover">
              {state.generated?.cover ? (
                <div style={{ width: 248, height: 248 }}>
                  <CourseCover kind={state.generated.cover} />
                </div>
              ) : (
                <KandinskyCover size={248} />
              )}
              {joined && (
                <div className="cj-cover-actions">
                  <button className="cj-cover-btn" type="button" title={L('Share', '分享')} onClick={onShareCourse}>
                    <CornerUpRight size={16} />
                  </button>
                  <button
                    className="cj-cover-btn"
                    type="button"
                    title={L('Add to calendar', '添加到日历')}
                    onClick={onAddToCalendar}
                  >
                    <CalendarPlus size={16} />
                  </button>
                </div>
              )}
            </div>

            <div className="cj-curated">
              <span className="cj-curated-icon">
                <KnotMark size={14} />
              </span>
              <span className="cj-curated-text">
                <span className="cj-curated-by">{t('courseJourney.curatedByPrefix')}</span>
                <span className="cj-curated-name">{L('Lattice Official', '见界官方')}</span>
              </span>
            </div>

            <h1 className="cj-course-title">{PS.title}</h1>
            <p className={`cj-desc${expanded ? ' expanded' : ''}`}>{PS.description}</p>
            <button className="cj-showmore" type="button" onClick={() => setExpanded(!expanded)}>
              {expanded
                ? L('Show less', '收起')
                : t('courseJourney.showMoreButton')}
            </button>

            <div className="cj-tags">
              {PS.tags.map((t) => (
                <span key={t} className="cj-tag">
                  {t}
                </span>
              ))}
            </div>

            {(!joined || dialog === 'joined') && (
              <button
                className="cj-join"
                type="button"
                onClick={() => {
                  if (!joined) setDialog('join');
                }}
              >
                {joined ? t('home.marketplace.successStartLearning') : t('courseJourney.joinCourseButton')}
              </button>
            )}

            <div className="cj-panel">
              <div className="cj-panel-label">{t('courseJourney.panelSectionTitle')}</div>
              <div className="cj-panel-tabs">
                <button
                  className={`cj-ptab${panelTab === 'units' ? ' active' : ''}`}
                  type="button"
                  onClick={() => setPanelTab('units')}
                >
                  <List size={14} />
                  <span>{t('courseJourney.tabs.units')}</span>
                </button>
                <button
                  className={`cj-ptab${panelTab === 'materials' ? ' active' : ''}`}
                  type="button"
                  onClick={() => setPanelTab('materials')}
                >
                  <FileText size={14} />
                  <span>{t('courseJourney.tabs.materials')}</span>
                </button>
                <button
                  className={`cj-ptab${panelTab === 'practices' ? ' active' : ''}`}
                  type="button"
                  onClick={() => setPanelTab('practices')}
                >
                  <PenLine size={14} />
                  <span>{t('courseJourney.tabs.practices')}</span>
                </button>
              </div>

              <input
                ref={fileRef}
                type="file"
                hidden
                accept=".pdf,.doc,.docx,.txt,.md,.ppt,.pptx,.xls,.xlsx,image/*"
                onChange={(e) => {
                  void onPickMaterial(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />

              {panelTab === 'units' && (
                <div className="cj-units">
                  {UNITS.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className={`cj-unit${u.id === activeUnit ? ' active' : ''}`}
                      onClick={() => setActiveUnit(u.id)}
                    >
                      <span className="cj-unit-badge">{u.id}</span>
                      <span className="cj-unit-title">{u.title}</span>
                    </button>
                  ))}
                </div>
              )}

              {panelTab === 'materials' && (
                <div className="cj-mats">
                  <button
                    className="cj-mat-add"
                    type="button"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? <Loader2 size={14} className="cj-spin" /> : <Plus size={14} />}
                    <span>{uploading ? L('Uploading…', '上传中…') : L('Add material', '添加材料')}</span>
                  </button>
                  {materials.length === 0 ? (
                    <div className="cj-mat-empty">
                      {L(
                        'No materials yet — add a PDF, slide deck, or notes to extend this course.',
                        '还没有材料——上传 PDF、幻灯片或笔记来扩展这门课程。',
                      )}
                    </div>
                  ) : (
                    materials.map((m) => (
                      <div key={m.id} className="cj-mat-row">
                        <FileText size={14} />
                        <span className="cj-mat-name" title={m.name}>
                          {m.name}
                        </span>
                        <span className="cj-mat-size">{formatSize(m.size)}</span>
                        {m.url && (
                          <a className="cj-mat-open" href={m.url} target="_blank" rel="noreferrer" title={L('Open', '打开')}>
                            <ExternalLink size={13} />
                          </a>
                        )}
                        <button
                          className="cj-mat-del"
                          type="button"
                          title={L('Remove', '移除')}
                          onClick={() => setMaterials(removeMaterial(scope, m.id))}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {panelTab === 'practices' && (
                <div className="cj-pracs">
                  {practiceRows.length === 0 ? (
                    <div className="cj-mat-empty">{L('No practices in this unit yet.', '本单元还没有练习。')}</div>
                  ) : (
                    practiceRows.map((p) => (
                      <div key={p} className="cj-prac-row">
                        <span className="cj-prac-name">{p}</span>
                        <button className="cj-pill practice" type="button" onClick={() => openLesson('practice')}>
                          <PenLine size={12} />
                          <span>{t('courseJourney.practiceAction')}</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ---------------- Right column ---------------- */}
          <div className="cj-right">
            <span className="cj-unit-chip">{unitChip}</span>
            <h2 className="cj-unit-heading">{unitTitle}</h2>
            <p className="cj-unit-desc">{unitDesc}</p>

            <button className="cj-addmat" type="button" onClick={() => fileRef.current?.click()}>
              <FileFan />
              <div>
                <div className="cj-addmat-title">{t('courseExtend.entryTitle')}</div>
                <div className="cj-addmat-sub">{t('courseExtend.entrySubtitle')}</div>
              </div>
            </button>

            <div className="cj-legend">
              <span className="cj-lg-item">
                <span className="cj-lg-mastered">
                  <Check size={11} strokeWidth={3.2} />
                </span>
                {t('courseJourney.progressLegend.mastered')}
              </span>
              <span className="cj-lg-item">
                <Ring size={20} pct={75} color="#445F91" track="#EDF0F5" />
                {t('courseJourney.progressLegend.proficient')}
              </span>
              <span className="cj-lg-item">
                <Ring size={20} pct={45} color="#7896C5" track="#EDF0F5" />
                {t('courseJourney.progressLegend.familiar')}
              </span>
              <span className="cj-lg-item">
                <Ring size={20} pct={15} color="#C9CED6" track="#F1F2F6" />
                {t('courseJourney.progressLegend.attempted')}
              </span>
              <span className="cj-lg-item">
                <Ring size={20} />
                {t('courseJourney.progressLegend.notStarted')}
              </span>
              <span className="cj-lg-item">
                <span className="cj-lg-square">
                  <ClipboardCheck size={13} />
                </span>
                {t('courseJourney.kindLabel.project')}
              </span>
              <span className="cj-lg-item">
                <span className="cj-lg-square">
                  <Award size={13} />
                </span>
                {t('courseJourney.kindLabel.exam')}
              </span>
            </div>

            <div className="cj-strip">
              <div className="cj-strip-nodes">
                {/* 指示器按当前单元真实结构渲染:每小节一个圆点,项目/测验讲次一个方点 */}
                {unit.lectures.flatMap((lec) => {
                  if (lec.kind === 'project') {
                    return [
                      <span key={lec.id} className="cj-node sq">
                        <ClipboardCheck size={11} />
                      </span>,
                    ];
                  }
                  if (lec.kind === 'exam') {
                    return [
                      <span key={lec.id} className="cj-node sq">
                        <Award size={11} />
                      </span>,
                    ];
                  }
                  return lec.sessions.map((_, si) => {
                    const isFirst = lec.id === 'l1' && si === 0;
                    return isFirst && done ? (
                      <span key={`${lec.id}-${si}`} className="cj-node ringed">
                        <Ring size={22} pct={35} />
                      </span>
                    ) : (
                      <span key={`${lec.id}-${si}`} className="cj-node" />
                    );
                  });
                })}
              </div>
              <button className="cj-strip-pill" type="button" onClick={() => openLesson('lecture')}>
                <span className="cj-strip-ico">
                  {done ? <PenLine size={11} /> : <Play size={10} fill="currentColor" />}
                </span>
                <span className="cj-strip-text">
                  {done
                    ? L('Next: Unit 1 • Speaker, Message…', '接下来：第 1 单元 · 演讲者、信息…')
                    : L("It's the new course, please start…", '这是新课程，请开始…')}
                </span>
                <ChevronRight size={14} />
              </button>
            </div>

            <div className="cj-timeline">
              {unit.lectures.length === 0 && (
                <div className="cj-tl-empty">
                  {L('This unit unlocks as you progress through the course.', '本单元内容将随课程进度解锁。')}
                </div>
              )}
              {unit.lectures.map((lec) => (
                <div key={lec.id} className="cj-tl-item">
                  <span className="cj-tl-node">
                    {lec.kind === 'project' ? (
                      <ClipboardCheck size={13} />
                    ) : lec.kind === 'exam' ? (
                      <Award size={13} />
                    ) : (
                      <Presentation size={13} />
                    )}
                  </span>
                  <div className="cj-card">
                    <div className="cj-card-title">{lec.title}</div>
                    {lec.description && <div className="cj-card-desc">{lec.description}</div>}
                    {lec.sessions.length > 0 && (
                      <div className="cj-sessions">
                        {lec.sessions.map((s, si) => {
                          const isFirst = lec.id === 'l1' && si === 0;
                          return (
                            <div key={s.title} className="cj-session">
                              <span className="cj-session-name">
                                {s.title}
                                <Compass size={13} className="cj-compass" />
                              </span>
                              <span className="cj-session-actions">
                                {isFirst && done ? (
                                  <>
                                    <button className="cj-pill revisit" type="button" onClick={() => openLesson('lecture')}>
                                      <Play size={11} fill="currentColor" />
                                      <span>{t('courseJourney.revisitAction')}</span>
                                    </button>
                                    <MoreHorizontal size={18} className="cj-more" />
                                    <button
                                      className="cj-pill practice-filled"
                                      type="button"
                                      onClick={() => openLesson('practice')}
                                    >
                                      <PenLine size={12} />
                                      <span>{t('courseJourney.practiceAction')}</span>
                                    </button>
                                  </>
                                ) : isFirst && joined ? (
                                  <>
                                    <button
                                      className="cj-pill learn-filled"
                                      type="button"
                                      onClick={() => openLesson('lecture')}
                                    >
                                      <Play size={11} fill="currentColor" />
                                      <span>{t('courseJourney.learnAction')}</span>
                                    </button>
                                    <button
                                      className="cj-pill practice"
                                      type="button"
                                      onClick={() => openLesson('practice')}
                                    >
                                      <PenLine size={12} />
                                      <span>{t('courseJourney.practiceAction')}</span>
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button className="cj-pill learn" type="button" onClick={() => openLesson('lecture')}>
                                      <Play size={11} fill="currentColor" />
                                      <span>{t('courseJourney.learnAction')}</span>
                                    </button>
                                    <button
                                      className="cj-pill practice"
                                      type="button"
                                      onClick={() => openLesson('practice')}
                                    >
                                      <PenLine size={12} />
                                      <span>{t('courseJourney.practiceAction')}</span>
                                    </button>
                                  </>
                                )}
                                <span className="cj-session-ring">
                                  <Ring size={24} pct={isFirst && done ? 35 : 0} />
                                </span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- Dialog 24: Join this course? ---------------- */}
      {dialog === 'join' && (
        <div
          className="hk-overlay dark"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDialogs();
          }}
        >
          <div className="hk-modal cj-dialog">
            <button className="cj-dialog-x" type="button" onClick={closeDialogs}>
              <X size={17} />
            </button>
            <div className="cj-dialog-title">{t('home.marketplace.confirmTitle')}</div>
            <div className="cj-dialog-course">{t('home.marketplace.confirmCourseName', { title: PS.title })}</div>
            <p className="cj-dialog-body">
              {t('home.marketplace.confirmDesc')}
            </p>
            <div className="cj-dialog-label">{t('home.marketplace.confirmLanguageLabel')}</div>
            <div className="cj-seg">
              <button
                type="button"
                className={`cj-seg-opt${lang === 'en' ? ' active' : ''}`}
                onClick={() => setLang('en')}
              >
                {t('home.marketplace.confirmLanguageEn')}
              </button>
              <button
                type="button"
                className={`cj-seg-opt${lang === 'zh' ? ' active' : ''}`}
                onClick={() => setLang('zh')}
              >
                {t('home.marketplace.confirmLanguageZh')}
              </button>
            </div>
            <p className="cj-dialog-note">
              {t('home.marketplace.confirmLanguageHint')}
            </p>
            <div className="cj-dialog-btns">
              <button className="cj-btn-think" type="button" onClick={closeDialogs}>
                {t('home.marketplace.confirmCancel')}
              </button>
              <button
                className="cj-btn-confirm"
                type="button"
                onClick={() => {
                  set({ courseJoined: true });
                  setDialog('joined');
                }}
              >
                {t('home.marketplace.confirmJoin')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Dialog 25: You're in ---------------- */}
      {dialog === 'joined' && (
        <div
          className="hk-overlay dark"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDialogs();
          }}
        >
          <div className="hk-modal cj-dialog cj-dialog-in">
            <div className="cj-dialog-title">{t('home.marketplace.successTitle')}</div>
            <p className="cj-dialog-body">
              {t('home.marketplace.successDesc')}
            </p>
            <div className="cj-dialog-btns2">
              <button
                className="cj-btn-big ghost"
                type="button"
                onClick={() => {
                  closeDialogs();
                  set({ screen: 'marketplace' });
                }}
              >
                {t('home.marketplace.backToMarketplace')}
              </button>
              <button className="cj-btn-big filled" type="button" onClick={closeDialogs}>
                {t('home.marketplace.successStartLearning')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Modal 61: LECTURE COMPLETE ---------------- */}
      {state.lectureCompletePrompt && (
        <Modal onClose={() => set({ lectureCompletePrompt: false })} scrim="dark-blur" width={480}>
          <div className="cj-lc">
            <div className="cj-lc-art">
              <SkaterKid size={112} />
            </div>
            <div className="cj-lc-body">
              <div className="cj-lc-kicker">{t('practiceReminder.eyebrow')}</div>
              <div className="cj-lc-title">{t('practiceReminder.title')}</div>
              <p className="cj-lc-text">
                <TRich
                  text={t('practiceReminder.description', {
                    target: L('Unit 1 • Speaker, Message, and Audience', '第 1 单元 · 演讲者、信息与听众'),
                  })}
                />
              </p>
              <div className="cj-lc-btns">
                <button
                  className="cj-lc-later"
                  type="button"
                  onClick={() => set({ lectureCompletePrompt: false })}
                >
                  {t('practiceReminder.later')}
                </button>
                <button
                  className="cj-lc-now"
                  type="button"
                  onClick={() => set({ lectureCompletePrompt: false })}
                >
                  {t('practiceReminder.startNow')}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default CourseJourney;
export { CourseJourney };
