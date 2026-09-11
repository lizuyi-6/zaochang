import React from 'react';
import type { GeneratedCourse } from './generate';
import type { ConvRow, MarketCourse, MeInfo } from './backend';

/** Top-level screens of the Hyperknow 1:1 replica. */
export type Screen =
  | 'signin'
  | 'onboarding'
  | 'home'
  | 'history'
  | 'feed'
  | 'courses'
  | 'coursePreview'
  | 'courseJourney'
  | 'marketplace'
  | 'chat'
  | 'whiteboard'
  | 'plans';

export interface AppState {
  screen: Screen;
  /** onboarding step 1..9 */
  onboardingStep: number;
  homeTab: 'craft' | 'instant';
  historyTab: 'conversations' | 'sessions';
  /** welcome-back overlay on first home entry */
  welcomeBack: boolean;
  courseJoined: boolean;
  lectureDone: boolean;
  /** lecture-complete practice prompt after leaving a finished session */
  lectureCompletePrompt: boolean;
  energy: number;
  settingsOpen: boolean;
  settingsTab: 'general' | 'memory';
  avatarMenuOpen: boolean;
  sidebarCollapsed: boolean;
  /** sidebar "More options" flyout */
  moreOpen: boolean;
  /** 伪生成中(全屏进度浮层);话题来自用户自由输入 */
  generating: boolean;
  /** 本次生成用户输入的原始 query(在线 SSE 与伪生成兜底共用) */
  genQuery: string;
  /** 课程前置问询 CourseBrief(版本化: 目标、基础、时间、深度、偏好、语言、视觉) */
  courseBrief?: {
    version?: number;
    goal?: string;
    background?: string;
    duration?: string;
    depth?: 'overview' | 'systematic' | 'deep' | string;
    preference?: string;
    language?: string;
    visual?: string;
  };
  /** 课程深链或详情加载状态 */
  courseLoading?: boolean;
  courseError?: string | null;
  /** 已生成的课程(非空时课程页/白板壳层按其渲染) */
  generated: GeneratedCourse | null;
  /** 即时协助:用户实际输入的问题(空则回退演示消息) */
  chatNote: string;
  /** 造场账户身份(启动时 get_user_info 拉取;null = 拉取失败/纯静态演示) */
  identity: MeInfo | null;
  /** true = 启动身份拉取已结算(无论成败);演示课开播前等它,旁白称呼绑定本次登录名 */
  bootReady: boolean;
  /** 订阅档位(展示态;backend 目前统一 FREE,兑换码/付款尚未接通) */
  plan: 'FREE' | 'PRO' | 'MAX';
  /** 当前成员历史会话(null = 拉取失败,回退复刻演示列表;[] = 真实为空) */
  conversations: ConvRow[] | null;
  /** 课程市场(D1 本人课程 + 官方样例;null = 未拉到/不可用,集市与我的课程回退演示卡) */
  marketCourses: MarketCourse[] | null;
  /** true = 列表已过期(新生成了一门课),进集市/我的课程页时重拉 */
  marketStale: boolean;
  /** 从历史打开的会话 ID(空 = 新对话) */
  activeConversationId: string | null;
  /** 朗读音色与语速(TTS);聊天/首页的语音与速度菜单共用 */
  voice: string;
  speed: number;
  /** 回复模式(standard/fast):随聊天请求透传后端,与首页速度菜单共用 */
  replyMode: 'standard' | 'fast';
  /** 新回复自动朗读 */
  autoSpeak: boolean;
  /** 白板进入方式:lecture = 从头讲;practice = 直接跳到随堂练习(课程页"练习"按钮) */
  whiteboardMode: 'lecture' | 'practice';
  /** 白板上下文:精准定位小节，杜绝默认跳第一讲 */
  activeCourseUuid?: string;
  activeUnitId?: string | number;
  activeLectureId?: string;
  activeSessionId?: string;
  activeTopic?: string;
}

/** 订阅档位定义(前端常量;与 backend HK_DAILY_CREDITS=20 的 FREE 档对应)。 */
export const PLANS: Array<{
  id: AppState['plan'];
  price: number;
  creditsPerDay: number;
}> = [
  { id: 'FREE', price: 0, creditsPerDay: 20 },
  { id: 'PRO', price: 12, creditsPerDay: 100 },
  { id: 'MAX', price: 29, creditsPerDay: 300 },
];

export const initialAppState: AppState = {
  /* 真实部署下 /lattice/* 已由主站 Worker 门禁保护——能进来的必然已登录,
   * 落地屏必须是应用本体(Home);#/signin 仅作复刻深链保留。
   * 曾默认 'signin':已登录用户进门即见登录屏,点"造场账户登录"被 Worker 302
   * 弹回 /lattice/,再见登录屏——正是用户报告的"反复跳回登录页"回环。 */
  screen: 'home',
  onboardingStep: 1,
  homeTab: 'craft',
  historyTab: 'conversations',
  welcomeBack: true,
  courseJoined: false,
  lectureDone: false,
  lectureCompletePrompt: false,
  energy: 15,
  settingsOpen: false,
  settingsTab: 'general',
  avatarMenuOpen: false,
  sidebarCollapsed: false,
  moreOpen: false,
  generating: false,
  genQuery: '',
  generated: null,
  chatNote: '',
  identity: null,
  bootReady: false,
  plan: 'FREE',
  conversations: null,
  marketCourses: null,
  marketStale: false,
  activeConversationId: null,
  voice: 'warm',
  speed: 1,
  replyMode: 'standard',
  autoSpeak: false,
  whiteboardMode: 'lecture',
};

export type AppAction = (patch: Partial<AppState>) => void;

export interface PageProps {
  state: AppState;
  set: AppAction;
}

/** Shared overlay modal. */
export interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
  /** translucent white scrim used by e.g. "Still there?" */
  scrim?: 'none' | 'white' | 'dark-blur';
  width?: number;
}
