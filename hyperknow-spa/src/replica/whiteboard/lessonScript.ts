/**
 * Scripted 1v1 lesson — "Speaker, Message, and Audience" (Public Speaking, Unit 1 · Lecture 1).
 * English text verbatim from the reference recording; zh authored (original generated lesson
 * content server-side from ui_language). Board geometry in virtual board px (board is ~1900px
 * wide; the view pans left by PAN_X when the Audience section begins).
 *
 * Text-bearing exports are functions so the script follows the current app language.
 */
import { L, isZh } from '../i18n/content';

export const PAN_X = 665;

/** Inline rich text segment. b=bold, i=italic, hl=yellow highlight, red=brick-red italic accent. */
export interface Seg {
  t: string;
  b?: boolean;
  i?: boolean;
  hl?: boolean;
  red?: boolean;
  violet?: boolean;
}
export type Rich = Seg[];

/** A single positioned board element. */
export interface BoardItem {
  id: string;
  step: number; // script step at which it is written
  x: number;
  y: number;
  w?: number; // wrap width (px)
  size: number; // font size px (Caveat)
  weight?: 400 | 600 | 700;
  color?: string;
  align?: 'left' | 'center';
  lines: Rich[]; // pre-wrapped lines
  mono?: boolean; // mermaid code block
  /** mermaid flowchart 源码:可渲染时以手绘图呈现,lines 作为不可渲染时的回退文本 */
  diagram?: string;
}

/** Freehand annotation attached to an item (or free-standing). */
export interface BoardAnnot {
  id: string;
  step: number;
  kind: 'circle' | 'highlight' | 'underline';
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Hand-drawn Audience Type table. */
export interface BoardTable {
  id: string;
  step: number;
  x: number;
  y: number;
  colW: number[];
  rowH: number[];
  cells: { t: string; hl?: boolean; sw?: [string, string] }[][]; // [row][col]; sw = explicit standard-mode line break
}

export const VIOLET = '#6A45D9';
export const INK = '#333330';
export const MONO = '#8A8A8A';

/** Panel conversation entry. */
export interface PanelEntry {
  id: string;
  kind: 'chip' | 'msg' | 'user' | 'system' | 'image';
  chipIcon?: 'pencil' | 'circle' | 'highlight' | 'sparkle' | 'help';
  chipText?: string;
  text?: Rich;
  /** kind==='image':上传后的可访问 URL 与文件名(白板"加图片") */
  url?: string;
  name?: string;
}

export type PopupKind = 'award1' | 'award2' | 'award3' | 'unitComplete';

export interface LessonStep {
  id: number;
  /** 服务端讲座计划里的 step_id(直播课专属;举手插话按它带上下文) */
  sid?: string;
  /** panel entries appended at step start (in order) */
  panel?: PanelEntry[];
  /** caption spoken during this step (serif bar) */
  caption?: Rich;
  /** popup shown during this step (after board writes); waits for dismiss */
  popup?: PopupKind;
  /** pause point: wait for typed answer */
  awaitAnswer?: boolean;
  /** quick-check choice popup on the board */
  awaitChoice?: { question: string; options: string[]; answer: number };
  /** pan the board to PAN_X at step start */
  pan?: boolean;
  /** extra beat (ms) after step content completes */
  beat?: number;
  /** append the red end-of-lesson system line at step end */
  systemEnd?: boolean;
}

/* ------------------------------------------------------------------ */
/* Board content (virtual coordinates; subtract PAN_X when panned)     */
/* ------------------------------------------------------------------ */

/** Pick between the authored en lines and authored zh lines. */
const pick = (enLines: Rich[], zhLines?: Rich[]): Rich[] => (isZh() && zhLines ? zhLines : enLines);

export const getBoardItems = (): BoardItem[] => [
  // ---- Column A: Foundations (step 1) ----
  {
    id: 'a1', step: 1, x: 90, y: 94, size: 27, weight: 700, color: VIOLET,
    lines: pick(
      [[{ t: 'Foundations ' }, { t: 'of Speaking', hl: true }]],
      [[{ t: '演讲的' }, { t: '基础', hl: true }]],
    ),
  },
  {
    id: 'a2', step: 1, x: 40, y: 126, size: 21,
    lines: pick(
      [[{ t: 'Public Speaking: ' }, { t: 'The Foundations', b: true }]],
      [[{ t: '公开演讲：' }, { t: '基础', b: true }]],
    ),
  },
  {
    id: 'a3', step: 1, x: 40, y: 153, size: 23, weight: 700,
    lines: pick([[{ t: 'The Rhetorical Triangle' }]], [[{ t: '修辞三角' }]]),
  },

  // ---- Column B: Shift in Perspective (step 2) + graph (step 3) ----
  {
    id: 'b1', step: 2, x: 470, y: 94, size: 27, weight: 700, color: VIOLET,
    lines: pick(
      [[{ t: 'Shift ' }, { t: 'in Perspective', hl: true }]],
      [[{ t: '视角的' }, { t: '转变', hl: true }]],
    ),
  },
  {
    id: 'b2', step: 2, x: 398, y: 126, size: 21,
    lines: pick(
      [[{ t: 'Traditional View: ', i: true }, { t: 'Performance', b: true }, { t: ' (One-way)' }]],
      [[{ t: '传统观点：', i: true }, { t: '表演', b: true }, { t: '（单向）' }]],
    ),
  },
  {
    id: 'b3', step: 2, x: 398, y: 153, size: 21,
    lines: [[{ t: 'vs.' }]],
  },
  {
    id: 'b4', step: 2, x: 398, y: 179, size: 21,
    lines: pick(
      [[{ t: 'Modern View: ', i: true }, { t: 'Transaction', b: true }, { t: ' (Two-way)' }]],
      [[{ t: '现代观点：', i: true }, { t: '交互', b: true }, { t: '（双向）' }]],
    ),
  },
  {
    id: 'b5', step: 3, x: 398, y: 214, size: 21,
    lines: pick(
      [[{ t: 'Graph: ' }, { t: 'The Rhetorical Triangle', i: true }]],
      [[{ t: '图示：' }, { t: '修辞三角', i: true }]],
    ),
  },
  {
    // 修辞三角:按手绘图渲染(diagram.ts);lines 是渲染不可用时的等宽回退
    id: 'b6', step: 3, x: 402, y: 244, size: 13, mono: true, color: MONO,
    diagram: isZh()
      ? 'graph TD\n  S[演讲者] --- M[信息]\n  M --- A[听众]\n  A --- S'
      : 'graph TD\n  S[Speaker] --- M[Message]\n  M --- A[Audience]\n  A --- S',
    lines: [
      [{ t: 'graph TD' }],
      [{ t: L('  S[Speaker] --- M[Message]', '  S[演讲者] --- M[信息]') }],
      [{ t: L('  M --- A[Audience]', '  M --- A[听众]') }],
      [{ t: '  A --- S' }],
    ],
  },

  // ---- Column C: The Speaker (steps 6/7) ----
  {
    id: 'c1', step: 6, x: 775, y: 94, size: 23, weight: 700,
    lines: pick(
      [[{ t: 'The Speaker (' }, { t: 'Ethos', b: true, hl: true }, { t: ')' }]],
      [[{ t: '演讲者（' }, { t: 'Ethos', b: true, hl: true }, { t: '）' }]],
    ),
  },
  {
    id: 'c2', step: 6, x: 776, y: 130, size: 20,
    lines: pick(
      [[{ t: 'Intent', b: true }, { t: ': What do you want to achieve?' }]],
      [[{ t: '意图', b: true }, { t: '：你想达到什么目标？' }]],
    ),
  },
  {
    id: 'c3', step: 6, x: 776, y: 158, size: 20, w: 300,
    lines: pick(
      [
        [{ t: 'Persona', b: true }, { t: ': Why are you the right person' }],
        [{ t: 'to say this?' }],
      ],
      [
        [{ t: '个人特质', b: true }, { t: '：为什么你是说这' }],
        [{ t: '句话的合适人选？' }],
      ],
    ),
  },
  {
    id: 'c4', step: 9, x: 757, y: 222, size: 20,
    lines: pick(
      [[{ t: 'Misconception', b: true }, { t: ': The "Blank Slate"' }]],
      [[{ t: '误解', b: true }, { t: '：「白板一张」' }]],
    ),
  },
  {
    id: 'c5', step: 9, x: 776, y: 252, size: 20,
    lines: pick(
      [[{ t: 'Myth', b: true, i: true }, { t: ': Be a "perfect professional"' }]],
      [[{ t: '迷思', b: true, i: true }, { t: '：做一个「完美专业人士」' }]],
    ),
  },
  {
    id: 'c6', step: 9, x: 776, y: 282, size: 20,
    lines: pick(
      [[{ t: 'Reality', b: true, i: true }, { t: ': ' }, { t: 'Authenticity builds trust', hl: true }]],
      [[{ t: '现实', b: true, i: true }, { t: '：' }, { t: '真实建立信任', hl: true }]],
    ),
  },
  {
    id: 'c7', step: 9, x: 757, y: 312, size: 20, w: 320,
    lines: pick(
      [
        [{ t: '"People buy into the speaker before they', i: true }],
        [{ t: 'buy into the message."', i: true }],
      ],
      [
        [{ t: '「人们先接受演讲者这个人，', i: true }],
        [{ t: '才会接受他传递的信息。」', i: true }],
      ],
    ),
  },

  // ---- Column D: The Audience (step 9) + table (step 10) + The Message (step 13) ----
  {
    id: 'd1', step: 11, x: 1132, y: 94, size: 23, weight: 700,
    lines: pick([[{ t: 'The Audience' }]], [[{ t: '听众' }]]),
  },
  {
    id: 'd2', step: 11, x: 1133, y: 132, size: 20,
    lines: pick(
      [[{ t: 'Expectations', b: true }, { t: ': What do they need?' }]],
      [[{ t: '期待', b: true }, { t: '：他们需要什么？' }]],
    ),
  },
  {
    id: 'd3', step: 11, x: 1133, y: 160, size: 20, w: 300,
    lines: pick(
      [
        [{ t: 'Knowledge Level', b: true }, { t: ': What do they already' }],
        [{ t: 'know?' }],
      ],
      [
        [{ t: '知识水平', b: true }, { t: '：他们已经' }],
        [{ t: '知道什么？' }],
      ],
    ),
  },
  {
    id: 'd4', step: 11, x: 1115, y: 218, size: 20, w: 310,
    lines: pick(
      [
        [{ t: 'The Audience is the "Co-author" of the', i: true }],
        [{ t: 'speech.', i: true }],
      ],
      [
        [{ t: '听众是演讲的', i: true }],
        [{ t: '「共同创作者」。', i: true }],
      ],
    ),
  },
  {
    id: 'd6', step: 17, x: 1132, y: 498, size: 23, weight: 700,
    lines: pick([[{ t: 'The Message' }]], [[{ t: '信息' }]]),
  },
  {
    id: 'd7', step: 17, x: 1133, y: 534, size: 20,
    lines: pick(
      [[{ t: 'Clarity', b: true }, { t: ': Is it easy to follow?' }]],
      [[{ t: '清晰', b: true }, { t: '：容易听懂吗？' }]],
    ),
  },
  {
    id: 'd8', step: 17, x: 1133, y: 564, size: 20,
    lines: pick(
      [[{ t: 'Structure', b: true }, { t: ': Is there a logical flow?' }]],
      [[{ t: '结构', b: true }, { t: '：逻辑顺畅吗？' }]],
    ),
  },
  {
    id: 'd9', step: 17, x: 1115, y: 594, size: 20,
    lines: pick(
      [[{ t: 'The ', i: true }, { t: 'Bridge', i: true, b: true }, { t: ' between Speaker and Audience', i: true }]],
      [[{ t: '演讲者与听众之间的', i: true }, { t: '桥梁', i: true, b: true }]],
    ),
  },

  // ---- Column E: Practice (step 14) + Strategic Intent (step 17/18) + Scenario (step 20) + Final Review (step 21) ----
  {
    id: 'e1', step: 18, x: 1471, y: 94, size: 21,
    lines: pick(
      [[{ t: 'Practice', b: true }, { t: ': Spot the Break' }]],
      [[{ t: '练习', b: true }, { t: '：找出断裂点' }]],
    ),
  },
  {
    id: 'e2', step: 18, x: 1471, y: 124, size: 19, w: 315,
    lines: pick(
      [
        [{ t: '"Our new software utilizes a proprietary' }],
        [{ t: 'multi-threaded architecture', hl: true }, { t: ' to optimize' }],
        [{ t: 'asynchronous data throughput for' }],
        [{ t: 'maximum efficiency."' }],
      ],
      [
        [{ t: '“我们的新软件利用专有的' }],
        [{ t: '多线程架构', hl: true }, { t: '来优化异步' }],
        [{ t: '数据吞吐量，实现最高效率。”' }],
      ],
    ),
  },
  {
    id: 'e3', step: 21, x: 1471, y: 232, size: 21, weight: 700,
    lines: pick([[{ t: 'Strategic Intent Statement' }]], [[{ t: '战略意图陈述' }]]),
  },
  {
    id: 'e4', step: 22, x: 1471, y: 260, size: 20, w: 330,
    lines: pick(
      [
        [
          { t: 'I (' }, { t: 'Speaker', red: true, i: true, b: true }, { t: ') want to explain ' }, { t: 'X', b: true },
          { t: ' (' }, { t: 'Message', red: true, i: true, b: true }, { t: ')' },
        ],
        [
          { t: 'to ' }, { t: 'Y', b: true }, { t: ' (' }, { t: 'Audience', red: true, i: true, b: true },
          { t: ') so that they can do ' }, { t: 'Z', b: true }, { t: '.' },
        ],
      ],
      [
        [
          { t: '我（' }, { t: '演讲者', red: true, i: true, b: true }, { t: '）想解释 ' }, { t: 'X', b: true },
          { t: '（' }, { t: '信息', red: true, i: true, b: true }, { t: '）' },
        ],
        [
          { t: '给 ' }, { t: 'Y', b: true }, { t: '（' }, { t: '听众', red: true, i: true, b: true },
          { t: '），让他们能够做到 ' }, { t: 'Z', b: true }, { t: '。' },
        ],
      ],
    ),
  },
  {
    id: 'e5', step: 24, x: 1472, y: 314, size: 20,
    lines: pick(
      [[{ t: 'Scenario', b: true }, { t: ': ' }, { t: 'Classroom Presentation' }]],
      [[{ t: '场景', b: true }, { t: '：' }, { t: '课堂展示' }]],
    ),
  },
  {
    id: 'e6', step: 24, x: 1493, y: 344, size: 20,
    lines: pick(
      [[{ t: 'Topic', b: true }, { t: ': ', i: true }, { t: 'The importance of sleep', i: true }]],
      [[{ t: '主题', b: true }, { t: '：', i: true }, { t: '睡眠的重要性', i: true }]],
    ),
  },
  {
    id: 'e7', step: 24, x: 1493, y: 373, size: 20,
    lines: pick(
      [[{ t: 'Audience', b: true }, { t: ': ', i: true }, { t: 'Your classmates', i: true }]],
      [[{ t: '听众', b: true }, { t: '：', i: true }, { t: '你的同学们', i: true }]],
    ),
  },
  {
    id: 'e8', step: 25, x: 1472, y: 414, size: 20,
    lines: pick(
      [[{ t: 'Final Review', b: true }, { t: ': Balanced Triangle' }]],
      [[{ t: '最终回顾', b: true }, { t: '：平衡的三角' }]],
    ),
  },
  {
    id: 'e9', step: 25, x: 1493, y: 441, size: 20,
    lines: pick(
      [[{ t: 'Speaker', b: true }, { t: ': ', i: true }, { t: 'Relatable classmate', i: true }]],
      [[{ t: '演讲者', b: true }, { t: '：', i: true }, { t: '有亲和力的同学', i: true }]],
    ),
  },
  {
    id: 'e10', step: 25, x: 1493, y: 470, size: 20,
    lines: pick(
      [[{ t: 'Message', b: true }, { t: ': ', i: true }, { t: 'Actionable sleep benefits', i: true }]],
      [[{ t: '信息', b: true }, { t: '：', i: true }, { t: '可实践的睡眠益处', i: true }]],
    ),
  },
  {
    id: 'e11', step: 25, x: 1493, y: 499, size: 20,
    lines: pick(
      [[{ t: 'Audience', b: true }, { t: ': ', i: true }, { t: 'Busy students', i: true }]],
      [[{ t: '听众', b: true }, { t: '：', i: true }, { t: '忙碌的学生们', i: true }]],
    ),
  },
  {
    id: 'e12', step: 25, x: 1472, y: 534, size: 19, w: 300,
    lines: pick(
      [
        [{ t: 'Strategic Intent', b: true }, { t: ': I want to explain why', i: true }],
        [{ t: 'sleep is important to my classmates so', i: true }],
        [{ t: 'that they can build a better sleep', i: true }],
        [{ t: 'routine.', i: true }],
      ],
      [
        [{ t: '战略意图', b: true }, { t: '：我想向同学们解释', i: true }],
        [{ t: '睡眠为什么重要，让他们能建立', i: true }],
        [{ t: '更好的睡眠习惯。', i: true }],
      ],
    ),
  },
];

export const getBoardTable = (): BoardTable => ({
  id: 'd5',
  step: 13,
  x: 1113,
  y: 277,
  colW: [106, 91, 127],
  rowH: [50, 52, 52, 52],
  cells: isZh()
    ? [
        [
          { t: 'Audience Type' }, { t: 'Primary Need', hl: true, sw: ['Primary', 'Need'] }, { t: 'Message Focus', sw: ['Message', 'Focus'] },
        ],
        [{ t: 'Peers / Experts' }, { t: 'Accuracy' }, { t: 'Data & Evidence', sw: ['Data &', 'Evidence'] }],
        [{ t: 'Investors' }, { t: 'Opportunity' }, { t: 'Value Proposition', sw: ['Value', 'Proposition'] }],
        [{ t: 'General Public' }, { t: 'Understanding' }, { t: 'Relatability & Story' }],
      ]
    : [
        [{ t: '听众类型' }, { t: '主要需求', hl: true }, { t: '信息重点' }],
        [{ t: '同行 / 专家' }, { t: '准确性' }, { t: '数据与论据' }],
        [{ t: '投资人' }, { t: '机会' }, { t: '价值主张' }],
        [{ t: '普通大众' }, { t: '理解' }, { t: '共鸣与故事' }],
      ],
});

export const BOARD_ANNOTS: BoardAnnot[] = [
  // red ellipse around "The Rhetorical Triangle" in the Graph: line (step 4)
  { id: 'an-graph', step: 4, kind: 'circle', x: 451, y: 213, w: 185, h: 25 },
  // red ellipse around "The Audience" (step 9)
  { id: 'an-audience', step: 11, kind: 'circle', x: 1127, y: 99, w: 108, h: 27 },
  // red ellipse around "The Message" (step 13)
  { id: 'an-message', step: 17, kind: 'circle', x: 1127, y: 496, w: 106, h: 32 },
  // red ellipse around "Strategic Intent Statement" (step 17)
  { id: 'an-sis', step: 21, kind: 'circle', x: 1464, y: 230, w: 186, h: 32 },
];

/* ------------------------------------------------------------------ */
/* Conversation + caption script                                       */
/* ------------------------------------------------------------------ */

const chip = (chipIcon: PanelEntry['chipIcon'], chipText: string): PanelEntry => ({
  id: `chip-${chipIcon}-${chipText.length}-${chipText.slice(0, 6)}`,
  kind: 'chip',
  chipIcon,
  chipText,
});
const msg = (id: string, text: Rich): PanelEntry => ({ id, kind: 'msg', text });

/* 旁白对学员的称呼:演示录课原版是 "Ryan";WhiteboardPage 挂载时用登录用户名
 * 覆盖(邮箱则取 @ 前缀),匿名/离线保底原版称呼。 */
let learnerName = 'Ryan';
export const setLearnerName = (name: string): void => {
  const trimmed = name.trim();
  if (trimmed) learnerName = trimmed;
};

const T1 = (): Rich => [
  {
    t: L(
      `Hi ${learnerName}! Welcome to the course. Today, we're starting at the very root of public speaking. By the end of this session, you'll see speaking not as a 'performance' but as a strategic bridge. This 'Rhetorical Triangle' we're about to draw is the foundation for everything else we'll do—from managing your nerves to designing killer slides.`,
      `你好，${learnerName}！欢迎来到这门课程。今天，我们从公开演讲最根本的地方讲起。在这节课结束时，你会明白演讲不是一场「表演」，而是一座策略性的桥梁。我们即将画出的这个「修辞三角」，是我们后续一切内容的基础——从管理紧张情绪，到设计出色的幻灯片。`,
    ),
  },
];
const T2 = (): Rich => [
  {
    t: L(
      "Most people think public speaking is just a one-way performance—like an actor on a stage. But that's a trap that creates anxiety. Instead, I want you to think of it as a dynamic transaction. It's a three-way connection between you, your ideas, and the people listening.",
      '大多数人以为公开演讲就是一种单向的表演——就像舞台上的演员。但这是个会制造焦虑的陷阱。我更希望你把它看作一场动态的交互：在你、你的想法和听众之间的三方连接。',
    ),
  },
];
const T3 = (): Rich => [
  {
    t: L(
      'Look at the whiteboard. We call this the Rhetorical Triangle. It has three vertices: the Speaker, the Message, and the Audience. If you neglect even one of these sides—say, you have a great message but ignore who is listening—the whole structure of your communication will collapse.',
      '看白板。我们把它称为「修辞三角」。它有三个顶点：演讲者、信息和听众。哪怕你忽略了其中一条边——比如，你有一个很棒的信息，却忽略了谁在听——你整个沟通的结构都会崩塌。',
    ),
  },
];
const T4 = (): Rich => [
  { t: L(`This shift is vital, ${learnerName}. When you focus on the `, `这种转变至关重要，${learnerName}。当你聚焦于这个三角的`) },
  { t: L('mechanics', '机制'), i: true },
  { t: L(' of this triangle, you stop worrying so much about yourself and start focusing on the ', '，你就不再那么担心自己，而是开始关注') },
  { t: L('connection.', '「连接」。'), i: true },
];
const T6 = (): Rich => [
  {
    t: L(
      "Let's look at the first corner: the Speaker. In classical rhetoric, this is called Ethos. It's more than just 'the person talking.' It's about your intent and your persona.",
      '我们来看第一个顶点：演讲者。在古典修辞学中，这叫做 Ethos（信誉）。它不仅仅是「正在说话的那个人」——它关乎你的意图，与你的个人特质。',
    ),
  },
];
const T7 = (): Rich => [
  {
    t: L(
      "There's a common myth that you need to be a 'perfect, blank-slate professional.' Actually, the best speakers are those who understand their specific relationship to the topic—why they care and why they are the right person to deliver this specific message right now.",
      '有一个常见的迷思：你必须成为一个「完美、白纸一样的专业人士」。其实，最好的演讲者，是那些清楚自己与主题之间独特关系的人——为什么他们在乎这个话题，为什么他们此刻正是传递这个信息的合适人选。',
    ),
  },
];
const T8 = (): Rich => [
  {
    t: L(
      `Before we move to the next corner, tell me ${learnerName}: have you ever felt like you had to 'act' like someone else when speaking in public, or do you feel comfortable bringing your own perspective to a topic?`,
      `在进入下一个顶点之前，先问问你，${learnerName}：你有没有过在公开场合讲话时必须「扮演」别人的感觉？还是说，你能自在地在这个话题上带入自己的视角？`,
    ),
  },
];
const T9 = (): Rich => [
  {
    t: L(
      `That's a very common feeling, ${learnerName}. We often put on this 'formal mask' because we think it makes us look more competent. But here's the secret: if you're 'acting,' the audience feels the disconnect.`,
      `这是非常普遍的感受，${learnerName}。我们常常戴上这层「正式的面具」，因为我们觉得它让我们显得更有能力。但秘诀在于：如果你在「演」，听众会感觉到那种割裂。`,
    ),
  },
];
const T10 = (): Rich => [
  { t: L('In terms of Ethos, your authenticity is actually your greatest asset. When you lean into why ', '就 Ethos 而言，你的真实，其实是你最大的资产。当你深入挖掘') },
  { t: L('you', '「你」'), i: true },
  { t: L(' specifically care about the topic, the audience trusts you more. Professionalism is just the wrapper; your unique perspective is the gift inside.', '为什么特别在乎这个话题时，听众会更信任你。专业只是包装；你独特的视角才是里面的礼物。') },
];
const T11 = (): Rich => [
  {
    t: L(
      "Now, let's pivot to the most critical corner of the triangle: the Audience. They aren't just a passive wall of faces; they actually co-author the speech with you.",
      '现在，我们转向三角中最关键的一个顶点：听众。他们不是一堵被动的人墙；他们其实在与你共同创作这场演讲。',
    ),
  },
];
const T12 = (): Rich => [
  {
    t: L(
      "Think about it this way: if you're a scientist explaining a new discovery to fellow researchers, they expect raw data and technical jargon. But if you're explaining that ",
      '你可以这样想：如果你是科学家，向同行研究者解释一项新发现，他们期待原始数据和技术术语。但如果你向一群投资人解释',
    ),
  },
  { t: L('same', '「同一项」'), i: true },
  {
    t: L(
      " discovery to a group of investors, they only care about the value and the 'so what?'",
      '发现，他们只关心价值，以及那句「所以呢？」',
    ),
  },
];
const T13 = (): Rich => [
  {
    t: L(
      'Look at this breakdown on the board. The ',
      '看看白板上的这个拆解。'
    ),
  },
  { t: L('same', '同样'), i: true },
  {
    t: L(
      ' discovery requires a completely different approach depending on who is in the room.',
      '的一项发现，面对在场的不同人群，需要完全不同的处理方式。',
    ),
  },
];
const T14 = (): Rich => [
  {
    t: L(
      "If you don't calibrate your message to the audience's baseline—their expectations and knowledge level—no communication happens. You're just 'information dumping' at a wall.",
      '如果你不根据听众的基线——他们的期待和知识水平——来调整你的信息，沟通就不会发生。你只是对着一堵墙「倾倒信息」。',
    ),
  },
];
const T15 = (): Rich => [
  {
    t: L(
      "Imagine you have to explain how a smartphone works. If you're talking to a 5-year-old versus a software engineer, what's the biggest thing you would change about your explanation?",
      '想象一下你要解释智能手机是怎么工作的。如果听众是一个 5 岁的孩子，或者是一位软件工程师，你的解释最大的不同会是什么？',
    ),
  },
];
const T16 = (): Rich => [
  {
    t: L(
      "Exactly! For the five-year-old, you'd use a simple analogy like a 'magic window,' while for the engineer, you'd talk about circuits and software. That choice brings us to the final vertex: the Message.",
      '完全正确！对 5 岁的孩子，你会用一个简单的比喻，比如「魔法窗户」；而对工程师，你会谈电路和软件。这个选择就把我们带到最后一个顶点：信息。',
    ),
  },
];
const T17 = (): Rich => [
  {
    t: L(
      "The Message isn't just your script; it's the bridge. It's the logical result of your intent as a Speaker meeting the Audience's specific needs. If your audience is skeptical, your message bridge must be built with heavy-duty evidence.",
      '信息不只是你的讲稿；它是桥梁。它是你作为演讲者的意图，与听众具体需求相遇的逻辑结果。如果你的听众持怀疑态度，你的信息之桥就必须用扎实的证据来建造。',
    ),
  },
];
const T18 = (): Rich => [
  {
    t: L(
      "Let's try a quick practice. Look at this sentence from a generic speech. Imagine this is being said to a group of local small business owners who just want to save time.",
      '我们来做一个快速练习。看这句来自普通演讲稿的话。想象它是对一群只想省时间的小企业主说的。',
    ),
  },
];
const T19 = (): Rich => [
  {
    t: L(
      "Where do you think this 'bridge' breaks? Is the speaker being too self-focused, or is the message just too complex for this specific room?",
      '你觉得这座「桥」在哪里断了？是演讲者太以自我为中心，还是这个信息对这群听众来说太复杂了？',
    ),
  },
];
const T20 = (): Rich => [
  {
    t: L(
      "Spot on! Phrases like 'multi-threaded architecture' or 'asynchronous data throughput' are technical jargon. While they might sound impressive to a computer scientist, they mean very little to a small business owner who just wants to know if the software will help them close their shop earlier.",
      '完全正确！像「多线程架构」或「异步数据吞吐量」这样的短语是技术行话。对计算机科学家来说它们也许听起来很厉害，但对于只想知道这套软件能不能帮他们早点关店的小企业主来说，几乎毫无意义。',
    ),
  },
];
const T21 = (): Rich => [
  {
    t: L(
      'To make sure you never fall into this trap, I use a tool called the Strategic Intent Statement. It forces you to synthesize the entire triangle into one sentence before you even start writing your speech.',
      '为了让你永远不掉进这个陷阱，我使用一个叫做「战略意图陈述」的工具。它迫使你在动笔写讲稿之前，就把整个三角浓缩成一句话。',
    ),
  },
];
const T22 = (): Rich => [
  {
    t: L(
      "It looks like this: I, the speaker, want to explain X, the message, to my audience Y, so that they can do Z. This keeps the triangle balanced because it focuses on utility—what the audience gets out of it—rather than just you talking.",
      '它长这样：我，演讲者，想向我的听众 Y 解释信息 X，让他们能够做到 Z。这让三角保持平衡，因为它聚焦于效用——听众能得到什么——而不是你一个人在说。',
    ),
  },
];
const T24 = (): Rich => [
  {
    t: L(
      "Let's finish today by trying this out. Imagine you're giving a short presentation to your classmates about why sleep is important. Using that formula, how would you fill in the blanks?",
      '最后，我们来试一试。想象你要给同学们做一个关于「睡眠为什么重要」的简短展示。用那个公式，你会怎么填空？',
    ),
  },
];
const T25 = (): Rich => [
  {
    t: L(
      "That is a perfect Strategic Intent Statement! You've nailed the balance: you as the relatable peer, a clear message about importance, and a specific goal for your classmates to actually do something differently.",
      '这是一份完美的战略意图陈述！你把握住了平衡：作为有亲和力的同伴的你，一个关于重要性的清晰信息，以及一个让同学们真正做出改变的具体目标。',
    ),
  },
];
const T26 = (): Rich => [
  {
    t: L(
      "Notice how that last part—the Z in our formula—completely changes how you'll write the speech. You won't just list brain facts; you'll focus on tips that actually help a busy student get to bed earlier. You've moved from just 'talking' to truly 'communicating.'",
      '注意最后那部分——我们公式里的 Z——它会彻底改变你写讲稿的方式。你不会只是罗列大脑知识；你会聚焦在真正帮助忙碌的学生早点上床睡觉的技巧上。你已经从「说话」走向了真正的「沟通」。',
    ),
  },
];
const T28 = (): Rich => [
  {
    t: L(
      `You've done great today, ${learnerName}. We've built the foundation. In our next session, we'll start looking at how to take this intent and turn it into a structured, powerful script. See you then!`,
      `你今天做得很棒，${learnerName}。我们已经打好了基础。下一节课，我们会开始研究如何把这份意图变成一份结构化、有力量的讲稿。到时候见！`,
    ),
  },
];

export const getLessonSteps = (): LessonStep[] => [
  {
    id: 1,
    panel: [chip('pencil', L('Foundations of Speaking', '演讲的基础')), msg('m1', T1())],
    caption: T1(),
    beat: 900,
  },
  {
    id: 2,
    panel: [chip('pencil', L('Shift in Perspective', '视角的转变')), msg('m2', T2())],
    caption: T2(),
    beat: 700,
  },
  {
    id: 3,
    panel: [chip('pencil', L('Board note', '板书')), msg('m3', T3())],
    caption: T3(),
    beat: 500,
  },
  {
    id: 4,
    panel: [chip('circle', L('Circle', '圆圈标注')), msg('m4', T4())],
    caption: T4(),
    beat: 400,
  },
  {
    id: 5,
    panel: [chip('sparkle', L('The Rhetorical Triangle', '修辞三角'))],
    popup: 'award1',
  },
  {
    id: 6,
    panel: [chip('pencil', L('Board note', '板书')), msg('m6', T6()), chip('highlight', L('Highlight', '高亮'))],
    caption: T6(),
    beat: 700,
  },
  {
    id: 7,
    panel: [msg('m7', T7())],
    caption: T7(),
    beat: 600,
  },
  {
    id: 8,
    panel: [msg('m8', T8())],
    caption: T8(),
    awaitAnswer: true,
  },
  {
    id: 9,
    panel: [chip('pencil', L('Board note', '板书')), msg('m9', T9())],
    caption: T9(),
    beat: 600,
  },
  {
    id: 10,
    panel: [chip('highlight', L('Highlight', '高亮')), msg('m9b', T10())],
    caption: T10(),
    beat: 600,
  },
  {
    id: 11,
    pan: true,
    panel: [chip('pencil', L('Board note', '板书')), msg('m9c', T11())],
    caption: T11(),
    beat: 700,
  },
  {
    id: 12,
    panel: [chip('circle', L('Circle', '圆圈标注')), msg('m10a', T12())],
    caption: T12(),
    beat: 600,
  },
  {
    id: 13,
    panel: [chip('pencil', L('Board note', '板书')), msg('m10b', T13())],
    caption: T13(),
    beat: 600,
  },
  {
    id: 14,
    panel: [chip('highlight', L('Highlight', '高亮')), msg('m10c', T14())],
    caption: T14(),
    beat: 600,
  },
  {
    id: 15,
    panel: [msg('m11', T15())],
    caption: T15(),
    awaitAnswer: true,
  },
  {
    id: 16,
    panel: [
      chip('pencil', L('Board note', '板书')),
      msg('m12', T16()),
      msg('m12b', [{ t: L('Sorry, I did not catch that.', '抱歉，我没有听清。') }]),
    ],
    caption: T16(),
    beat: 600,
  },
  {
    id: 17,
    panel: [chip('circle', L('Circle', '圆圈标注')), msg('m13', T17())],
    caption: T17(),
    beat: 700,
  },
  {
    id: 18,
    panel: [chip('pencil', L('Board note', '板书')), msg('m14', T18())],
    caption: T18(),
    beat: 500,
  },
  {
    id: 19,
    panel: [msg('m15', T19()), chip('help', L('Quick check', '快速检查'))],
    caption: T19(),
    awaitChoice: {
      question: L('Where does the message bridge break?', '信息的桥梁在哪里断了？'),
      options: [L('Too self-focused', '太以自我为中心'), L('Too complex for audience', '对听众来说太复杂')],
      answer: 1,
    },
  },
  {
    id: 20,
    panel: [chip('highlight', L('Highlight', '高亮')), msg('m16', T20())],
    caption: T20(),
    beat: 1600,
  },
  {
    id: 21,
    panel: [chip('pencil', L('Board note', '板书')), msg('m16b', T21())],
    caption: T21(),
    beat: 600,
  },
  {
    id: 22,
    panel: [chip('circle', L('Circle', '圆圈标注')), msg('m17', T22())],
    caption: T22(),
    beat: 400,
  },
  {
    id: 23,
    panel: [chip('sparkle', L('Strategic Intent', '战略意图'))],
    popup: 'award2',
  },
  {
    id: 24,
    panel: [chip('pencil', L('Board note', '板书')), msg('m19', T24())],
    caption: T24(),
    awaitAnswer: true,
  },
  {
    id: 25,
    panel: [chip('pencil', L('Board note', '板书')), msg('m20', T25())],
    caption: T25(),
    beat: 500,
  },
  {
    id: 26,
    panel: [msg('m21', T26())],
    caption: T26(),
    beat: 400,
  },
  {
    id: 27,
    panel: [chip('sparkle', L('Foundations of Speaking', '演讲的基础'))],
    popup: 'award3',
  },
  {
    id: 28,
    panel: [msg('m23', T28())],
    caption: T28(),
    systemEnd: true,
    beat: 600,
  },
  {
    id: 29,
    popup: 'unitComplete',
  },
];

export const getAwards = (): Record<Exclude<PopupKind, 'unitComplete'>, { name: string; desc: string; art: 'phone' | 'popper' }> => ({
  award1: {
    name: L('The Rhetorical Triangle', '修辞三角'),
    desc: L(
      "You've reframed public speaking from a scary performance into a balanced, three-part system of Speaker, Message, and Audience.",
      '你把公开演讲从一场令人恐惧的表演，重塑成了一个由演讲者、信息和听众组成的、平衡的三部分系统。',
    ),
    art: 'phone',
  },
  award2: {
    name: L('Strategic Intent', '战略意图'),
    desc: L(
      "You've learned how to align your persona, your content, and your listener's needs into a single, focused goal.",
      '你学会了把你的个人特质、你的内容和听众的需求，对齐成一个专注的目标。',
    ),
    art: 'popper',
  },
  award3: {
    name: L('Foundations of Speaking', '演讲的基础'),
    desc: L(
      'You have successfully mastered the Rhetorical Triangle, shifting your focus from internal performance to the external mechanics of connection and purpose.',
      '你已成功掌握修辞三角，把注意力从内在的表演，转向了连接与目标的外在机制。',
    ),
    art: 'popper',
  },
});

/** Canned user answers for the scripted await points. */
export const getUserAnswers = (): Record<number, string> => ({
  8: L(
    'I sometimes feel like I have to act more formal than I really am.',
    '我有时会觉得，我必须表现得比真实的自己更正式。',
  ),
  15: '图画的是我的擦板,上面的上面的那个擦过以后就是我的。 마지막 카드 왔습니다. 카드에서 왔어요. 그게你也要睡觉了。睡觉吧。晚安,明天见。叔儿',
  24: L(
    'I, the speaker, want to explain why sleep is important to my classmates so that they can build a better sleep routine.',
    '我，演讲者，想向我的同学们解释睡眠为什么重要，这样他们就能建立更好的睡眠习惯。',
  ),
});

export const getIntroCopy = () => ({
  eyebrow: L('WHAT YOU WILL LEARN', '你将学到'),
  title: L('Speaker, Message, and Audience', '演讲者、信息与听众'),
  body: L(
    "This session introduces the rhetorical triangle, illustrating how the speaker's intent, the clarity of the message, and the audience's characteristics interact. You will learn to identify these three core elements in any communication scenario, enabling you to build a foundation for strategic speech planning that prioritizes the listener's perspective.",
    '本节课介绍修辞三角，说明演讲者的意图、信息的清晰度与听众的特点如何相互作用。你将学会在任何沟通场景中识别这三个核心要素，从而为以听众为中心的策略性演讲规划打下基础。',
  ),
  cta: L('Start learning', '开始学习'),
});

export const getSystemEndText = (): string =>
  L(
    "You've finished this lesson. You can move on to the next one, or leave this course.",
    '你已完成本节课。你可以继续下一节，或者离开这门课程。',
  );
