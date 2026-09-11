import { L } from './i18n/content';
import { coverForTitle, type Lecture, type SessionRow, type Unit } from './data';
import type { BackendCourse } from './backend';

/**
 * 伪生成引擎：复刻版没有 LLM,课程内容是预生成(author)骨架;但用户的自由输入
 * 决定课程的话题、命名与结构展示——输入不落空,自由不被限制。
 * 后端可达时 courseFromBackend 把真 LLM 生成的课程树映射为同一形态。
 */

export interface GeneratedCourse {
  /** 用户原始输入清洗后的话题,也用于深链 ?topic= */
  topic: string;
  /** 与 psCourse() 同构,便于 CourseJourney 直接切换数据源 */
  title: string;
  curator: string;
  description: string;
  tags: string[];
  unit1Chip: string;
  unit1Title: string;
  unit1Description: string;
  units: Unit[];
  /** 由话题哈希决定的稳定展示细节 */
  enrolled: string;
  /** 市场卡片带入的封面风格;缺省回退公开演讲课的 Kandinsky 封面 */
  cover?: 'sociology' | 'bio' | 'ml' | 'ai' | 'history' | 'prompt' | 'psych' | 'sat' | 'philo' | 'stats';
}

/* ---------------- 话题提取:剥掉中英口令式包装,剩下的就是话题 ---------------- */

const ZH_LEADS = [
  /^(请|麻烦你?|劳驾|帮我?们?|帮个忙|我想|我要|想要|希望|能不能|可不可以|给我|来)/,
  /^(制作|做|创建|生成|打造|设计|开|规划|编|讲|教)一?[门个堂份套](关于|有关|围绕|讲|教)?/,
  /^(制作|做|创建|生成|打造|设计|开|规划|编)(一?[门个堂份套])?(关于|有关|围绕)?/,
  /^(学习|学学|学一下|了解|了解一下|学|讲讲|讲一下)/,
];
const ZH_TAILS = [/(的)?(课程|系列课|系列教程|教程|课|入门指南|入门|指南|专题)$/];
const EN_LEADS = [
  /^(please\s+)?(could you\s+)?(help me\s+)?(build|make|create|design|generate|put together|develop)\s+(me\s+)?(a |an )?(multi-?part\s+)?(course|class|curriculum|lesson plan|series)?\s*(on|about|for|covering|around|teaching me)?\s*/i,
  /^(teach me|i want to learn|i'd like to learn|i would like to learn|learn|explain|tell me about)\s+/i,
];
const EN_TAILS = [/\s+(course|class|classes|lessons|series|curriculum|for me)$/i];

export function extractTopic(prompt: string): string {
  let s = prompt.trim().replace(/\s+/g, ' ');
  for (let i = 0; i < 3; i++) {
    for (const re of EN_LEADS) s = s.replace(re, '');
    for (const re of ZH_LEADS) s = s.replace(re, '');
    for (const re of EN_TAILS) s = s.replace(re, '');
    for (const re of ZH_TAILS) s = s.replace(re, '');
  }
  s = s.replace(/^[\s「」"'“”《》,，.。:：;；!！?？~～·—-]+|[\s「」"'“”《》,，.。:：;；!！?？~～·—-]+$/g, '').trim();
  if (s.length > 40) s = `${s.slice(0, 40).trim()}…`;
  return s;
}

/* ---------------- 稳定哈希:同一话题每次生成同一份"个性化"细节 ---------------- */

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

/* ---------------- 预生成骨架:教学法结构固定,话题自由注入 ---------------- */

const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * 伪生成课程的恒定节数:4 单元 ×(3 讲 × 3 节 + 项目 2 节 + 测验 1 节)= 48。
 * 结构不随话题/语言变化,卡片上的节数与点进去看到的实际节数因此永远一致。
 */
export const GENERATED_LESSON_COUNT = 48;

/** 课程树实际节数(session 总数)——卡片"lessons"与课程页可学节点的共同口径。 */
export const countCourseSessions = (units: Unit[]): number =>
  units.reduce((n, u) => n + u.lectures.reduce((m, lec) => m + lec.sessions.length, 0), 0);

export function buildGeneratedCourse(prompt: string): GeneratedCourse {
  const topic = extractTopic(prompt) || L('Untitled course', '无标题课程');
  const h = hash(topic);
  const enrolled = `${((h % 87) / 10 + 1.1).toFixed(1)}K`;
  const T = topic; // shorthand for template composition
  /* zh 文案里中英混排的空隙:话题含 ASCII 时两侧补空格,纯中文话题不加 */
  const zhMix = /[A-Za-z0-9]/.test(T);
  const sp = (s: string) => (zhMix ? ` ${s} ` : s);

  /* 单元标题不带"第 N 单元"前缀——前缀由 CourseJourney 按激活单元统一拼装 */
  const unitTitles = [
    L(`${cap(T)} Foundations`, `${sp(T)}基础`),
    L(`Core Methods of ${cap(T)}`, `${sp(T)}的核心方法`),
    L(`${cap(T)} in Practice`, `${sp(T)}的应用与实践`),
    L(`${cap(T)} Capstone`, `${sp(T)}综合项目`),
  ];

  const descFrame = (n: number): string =>
    [
      L(`A guided, interactive session that builds real intuition for ${T}.`, `一节为${sp(T)}建立真实直觉的引导式互动课。`),
      L(`Work through ${T} step by step with quick checks along the way.`, `一步一步拆解${sp(T)}，路上还有快速检查帮你巩固。`),
      L(`Connect ${T} to situations you will actually meet.`, `把${sp(T)}和你真实会遇到的场景连起来。`),
    ][n % 3];

  /* 每单元 3 讲,标题按单元进度各有分工;讲内 3 节对应"直觉 → 拆解 → 快检" */
  const lectureTitles: string[][] = [
    [L(`What exactly is ${T}?`, `${T} 到底是什么？`), L('The mental model', '建立思维模型'), L('The essential toolkit', '核心工具箱')],
    [
      L('Core methods, one by one', '核心方法，逐个击破'),
      L('Worked examples, step by step', '典型例题，一步一步'),
      L('Common traps and how to dodge them', '常见陷阱与规避方法'),
    ],
    [L('A real-world case study', '真实案例分析'), L('Practice lab', '练习实验室'), L('Advanced moves', '进阶技巧')],
    [L('Tying it all together', '融会贯通'), L('Review sprint', '复习冲刺'), L('Where to go next', '下一步怎么走')],
  ];

  const lectureSessions = (): SessionRow[] => [
    { title: L('Intuition first', '先建立直觉'), sub: L('15 min', '15 分钟') },
    { title: L('Deep dive, step by step', '逐步深入拆解'), sub: L('20 min', '20 分钟') },
    { title: L('Quick check', '随堂快检'), sub: L('10 min', '10 分钟') },
  ];

  const projectTitles = [
    L('Mini project: first try', '小项目：第一次上手'),
    L('Mini project: put it to work', '小项目：用起来'),
    L('Project: real-scenario drill', '项目：真实场景演练'),
    L('Capstone project', '结课综合项目'),
  ];
  const projectSessions = (): SessionRow[] => [
    { title: L('Project brief & setup', '项目说明与准备'), sub: L('10 min', '10 分钟') },
    { title: L('Build, iterate & submit', '动手实现与提交'), sub: L('30 min', '30 分钟') },
  ];

  const lecturesFor = (u: number): Lecture[] => {
    const lectures: Lecture[] = lectureTitles[u].map((title, i) => ({
      /* CourseJourney 以 id==='l1' 判定首讲;全课首讲固定 l1 */
      id: u === 0 && i === 0 ? 'l1' : `u${u + 1}-l${i + 1}`,
      title,
      description: descFrame(i),
      kind: 'lecture',
      sessions: lectureSessions(),
    }));
    lectures.push({
      id: `u${u + 1}-p1`,
      title: projectTitles[u],
      description: L(
        'Apply everything from this unit in one hands-on deliverable.',
        '把本单元学到的东西一次用起来，产出一件完整作品。',
      ),
      kind: 'project',
      sessions: projectSessions(),
    });
    lectures.push({
      id: `u${u + 1}-e1`,
      title:
        u === 3
          ? L('Final exam', '结课综合测验')
          : L(`Unit ${u + 1} quiz`, `第 ${u + 1} 单元测验`),
      description: L(
        'A timed check on everything this unit covered — pass it to lock in your progress.',
        '针对本单元全部内容的限时检验——通过即可锁定学习进度。',
      ),
      kind: 'exam',
      sessions: [{ title: L('Timed quiz', '限时测验'), sub: L('20 min', '20 分钟') }],
    });
    return lectures;
  };

  return {
    topic,
    title: cap(T),
    curator: 'Hyperknow Official',
    description: L(
      `A self-paced course on ${T}. It starts from the core intuition, builds up the essential methods, then puts them to work in realistic scenarios — with interactive whiteboard lessons, quick checks and milestone projects along the way.`,
      `一门关于${sp(T)}的自适应课程。从核心直觉出发，逐步建立关键方法，再放到真实场景里运用——全程配有互动白板课节、随堂快检与阶段性项目。`,
    ),
    tags: [
      `# ${cap(T).slice(0, 24)}`,
      L('# Personalized', '# 个性化'),
      L('# Interactive Whiteboard', '# 互动白板'),
    ],
    unit1Chip: L('UNIT 1 OF 4', '第 1 单元，共 4 单元'),
    unit1Title: L(`Unit 1: ${unitTitles[0]}`, `第 1 单元：${unitTitles[0]}`),
    unit1Description: L(
      `Lay the groundwork for ${T}: what it is, why it matters, and the mental model that makes the rest of the course click. Closes with a first project and a unit quiz so the ideas stick.`,
      `为${sp(T)}打好地基：它是什么、为什么重要，以及让后续内容豁然开朗的思维模型。单元末配有首个项目与单元测验，帮助知识落地。`,
    ),
    units: unitTitles.map((title, u) => ({
      id: u + 1,
      title,
      lectures: lecturesFor(u),
    })),
    enrolled,
  };
}

/* ---------------- 真后端映射:CourseStructure → GeneratedCourse(同一形态) ---------------- */

const hashOf = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

/* 后端课程树没有 kind 字段:按讲次标题推导(架构提示词要求项目/测验冠以"项目:"/"测验:"前缀) */
const kindOfTitle = (title: string): Lecture['kind'] =>
  /项目|project|capstone/i.test(title)
    ? 'project'
    : /测验|考试|考核|quiz|exam|final/i.test(title)
      ? 'exam'
      : 'lecture';

/* LLM 大纲常带"Unit 2:"/"第 2 单元:"前缀;CourseJourney 会按激活单元统一拼装,先剥掉防双前缀 */
const stripUnitPrefix = (title: string): string =>
  title.replace(/^\s*(?:unit\s*\d+|第\s*\d+\s*单元)\s*[:：.\-]?\s*/i, '') || title;

export function courseFromBackend(cs: BackendCourse, fallbackTopic: string): GeneratedCourse {
  const topic = extractTopic(cs.courseTitle || fallbackTopic) || fallbackTopic;
  const n = cs.units.length;
  let li = 0;
  const units: Unit[] = cs.units.map((u, ui) => ({
    id: ui + 1,
    title: stripUnitPrefix(u.title),
    lectures: (u.lectures ?? []).map((l) => {
      li += 1;
      const lec: Lecture = {
        /* CourseJourney 以 id==='l1' 判定首讲;顺序重排保证首讲可学 */
        id: li === 1 ? 'l1' : `lb${li}`,
        title: l.title,
        description: '',
        kind: kindOfTitle(l.title),
        sessions: (l.sessions ?? []).map((s) => ({
          title: s.title,
          ...(s.sessionTime ? { sub: L(`${s.sessionTime} min`, `${s.sessionTime} 分钟`) } : {}),
        })),
      };
      return lec;
    }),
  }));
  const firstUnit = units[0]?.title ?? topic;
  return {
    topic,
    title: cs.courseTitle || fallbackTopic,
    curator: 'Hyperknow Official',
    description: cs.courseDescription || '',
    tags: (cs.tags ?? []).slice(0, 4).map((t) => (t.startsWith('#') ? t : `# ${t}`)),
    unit1Chip: L(`UNIT 1 OF ${n}`, `第 1 单元，共 ${n} 单元`),
    unit1Title: L(`Unit 1: ${firstUnit}`, `第 1 单元：${firstUnit}`),
    unit1Description: cs.courseDescription || '',
    units,
    enrolled: `${((hashOf(topic) % 87) / 10 + 1.1).toFixed(1)}K`,
    cover: coverForTitle(cs.courseTitle || fallbackTopic),
  };
}
