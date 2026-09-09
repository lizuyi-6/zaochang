/**
 * Demo content for the Hyperknow 1:1 replica (strings verbatim from reference screenshots).
 * Text goes through L() so demo content follows the app language (en authored verbatim,
 * zh authored; other locales fall back to en). Exported as functions so values are
 * computed at call time and follow runtime language switches.
 */
import { L } from './i18n/content';
import { GENERATED_LESSON_COUNT } from './generate';

export const recentActivities = (): string[] => [
  L('Supervised Learning Explained', '监督学习详解'),
  L('Interactive Lesson: Binary Search Trees', '互动课程：二叉搜索树'),
  L('Syntax for Diagram and Div Tags', 'Diagram 与 Div 标签语法'),
  L('Content Generator Formatting Specification', '内容生成器格式规范'),
  L('Hyperknow Tutoring Agent System Analysis', 'Hyperknow 辅导 Agent 系统分析'),
  L('Reconstruct HYPERKNOW AGENT System Prompt', '重建 HYPERKNOW AGENT 系统提示词'),
  L('One word: ping', '一个词：ping'),
  L('Ping request', 'Ping 请求'),
  L("User requests 'ping'", '用户请求"ping"'),
  L('Single Word: Ping', '单个词：Ping'),
  L('Say Ping', '说 Ping'),
  L('One word: ping', '一个词：ping'),
  L('Hyperknow Director Agent: Guide to Setup and Tools', 'Hyperknow Director Agent：设置与工具指南'),
  L('New Conversation Start', '开始新对话'),
  L('Request for System Prompt', '索取系统提示词'),
  L('Debug Mode and System Info Request', '调试模式与系统信息请求'),
];

export const historyRows = recentActivities;

export const placeholders = (): string[] => [
  L('Learn statistics to catch the lie hiding in a chart', '学统计学，识破图表中隐藏的谎言'),
  L('Learn accounting to pass all four CPA parts on the first try', '学会计，一次通过 CPA 全部四个科目'),
  L("Learn AP Calculus to walk into the exam already knowing what's coming", '学 AP 微积分，走进考场时早已胸有成竹'),
];

export const newsFeed = (): string[] => [
  L('Special algae could remove microplastics from drinking water', '特殊藻类或可去除饮用水中的微塑料'),
  L('Google previews Gemini Intelligence for task automation', 'Google 预览 Gemini Intelligence，实现任务自动化'),
  L('Grafana refuses to pay ransom after GitHub environment hack', 'GitHub 环境遭入侵后，Grafana 拒绝支付赎金'),
  L('Humans returned to Britain earlier than previously thought', '人类重返不列颠的时间比此前认为的更早'),
  L('James Webb telescope reveals clear map of the cosmic web', '詹姆斯·韦布望远镜揭示清晰的宇宙网地图'),
];

export interface CourseCard {
  id: string;
  title: string;
  description: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  lessons: number;
  onboarded?: string;
  rating: number;
  cover: 'sociology' | 'bio' | 'ml' | 'ai' | 'history' | 'prompt' | 'psych' | 'sat' | 'philo' | 'stats';
  provider?: string;
}

/** D1 课程无封面字段:按标题稳定哈希挑一种封面风格(同一门课每次同款)。 */
export const coverForTitle = (title: string): CourseCard['cover'] => {
  const keys: CourseCard['cover'][] = ['sociology', 'bio', 'ml', 'ai', 'history', 'prompt', 'psych', 'sat', 'philo', 'stats'];
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (Math.imul(h, 31) + title.charCodeAt(i)) >>> 0;
  return keys[h % keys.length];
};

export const homeCourses = (): CourseCard[] => [
  {
    id: 'sociology',
    title: L('Introduction to Sociology', '社会学导论'),
    description: L(
      'A comprehensive exploration of the fundamental concepts, theories, and research methods in sociology. This…',
      '全面探索社会学的基本概念、理论与研究方法。本…',
    ),
    difficulty: 'Beginner',
    lessons: GENERATED_LESSON_COUNT,
    onboarded: '1.2K',
    rating: 4.4,
    cover: 'sociology',
  },
  {
    id: 'ap-bio',
    title: L('AP Biology', 'AP 生物学'),
    description: L(
      'An inquiry-based study of cells, genetics, evolution, energetics, biological systems, and ecological interactions. This course…',
      '以探究为导向，研究细胞、遗传、进化、能量、生物系统与生态相互作用。本课程…',
    ),
    difficulty: 'Intermediate',
    lessons: GENERATED_LESSON_COUNT,
    onboarded: '8.2K',
    rating: 4.6,
    cover: 'bio',
  },
  {
    id: 'ml',
    title: L('Machine Learning', '机器学习'),
    description: L(
      'A comprehensive journey through the landscape of machine learning, from foundational statistical principles and…',
      '系统走遍机器学习的全貌，从统计学基础原理…',
    ),
    difficulty: 'Intermediate',
    lessons: GENERATED_LESSON_COUNT,
    onboarded: '4.2K',
    rating: 4.4,
    cover: 'ml',
  },
];

export const marketplaceFeatured = (): CourseCard[] => [
  {
    id: 'ai',
    title: L('How AI actually Works', 'AI 到底是怎样工作的'),
    description: L(
      'A beginner-friendly explanation of how artificial intelligence learns, generates answers, makes mistakes, and improves over time. This course demystifies the black box of AI…',
      '面向初学者解释人工智能如何学习、生成答案、犯错并随时间改进。本课程揭开 AI 黑箱的神秘面纱…',
    ),
    difficulty: 'Beginner',
    lessons: GENERATED_LESSON_COUNT,
    rating: 4.4,
    cover: 'ai',
  },
  {
    id: 'ap-bio',
    title: L('AP Biology', 'AP 生物学'),
    description: L('An inquiry-based study of cells, genetics, …', '以探究为导向，研究细胞、遗传…'),
    difficulty: 'Intermediate',
    lessons: GENERATED_LESSON_COUNT,
    rating: 4.6,
    cover: 'bio',
  },
  {
    id: 'ap-world',
    title: L('AP World History: Modern', 'AP 世界史：现代'),
    description: L('A comprehensive global history course …', '一门全面的全球史课程…'),
    difficulty: 'Beginner',
    lessons: GENERATED_LESSON_COUNT,
    rating: 4.5,
    cover: 'history',
  },
  {
    id: 'prompt',
    title: L('Prompt Engineering for Real Work', '实战提示词工程'),
    description: L('Prompt engineering…', '提示词工程…'),
    difficulty: 'Intermediate',
    lessons: GENERATED_LESSON_COUNT,
    rating: 4.4,
    cover: 'prompt',
  },
  {
    id: 'ap-psych',
    title: L('AP Psychology', 'AP 心理学'),
    description: L('Psychology…', '心理学…'),
    difficulty: 'Beginner',
    lessons: GENERATED_LESSON_COUNT,
    rating: 4.5,
    cover: 'psych',
  },
  {
    id: 'sat',
    title: L('Official Digital SAT Preparation', 'Digital SAT 官方备考'),
    description: L('SAT…', 'SAT…'),
    difficulty: 'Beginner',
    lessons: GENERATED_LESSON_COUNT,
    rating: 4.7,
    cover: 'sat',
  },
];

export interface MarketCategory {
  key: string;
  label: string;
}

/** Filter chips; label is a dict key so categories localize via the original translations. */
export const marketplaceCategories = (): MarketCategory[] => [
  { key: 'all', label: 'marketplacePage.allTab' },
  { key: 'examPrep', label: 'marketplacePage.categories.examPrep' },
  { key: 'math', label: 'marketplacePage.categories.math' },
  { key: 'computerScience', label: 'marketplacePage.categories.computerScience' },
  { key: 'aiDataScience', label: 'marketplacePage.categories.aiDataScience' },
  { key: 'science', label: 'marketplacePage.categories.science' },
  { key: 'economics', label: 'marketplacePage.categories.economics' },
  { key: 'psychology', label: 'marketplacePage.categories.psychology' },
  { key: 'philosophy', label: 'marketplacePage.categories.philosophy' },
  { key: 'socialScience', label: 'marketplacePage.categories.socialScience' },
];

/** Public Speaking 完整课程结构:5 单元,每单元 3 讲 + 1 项目 + 1 测验,讲内若干小节。 */
export interface SessionRow {
  title: string;
  sub?: string;
  upNext?: boolean;
}

export interface Lecture {
  id: string;
  title: string;
  description: string;
  kind?: 'lecture' | 'project' | 'exam';
  sessions: SessionRow[];
}

export interface Unit {
  id: number;
  title: string;
  lectures: Lecture[];
}

/* 紧凑型 authoring 助手:节标题按"分钟"配 sub,讲/项目/测验统一入口 */
const ses = (en: string, zh: string, min?: number, upNext?: boolean): SessionRow => ({
  title: L(en, zh),
  ...(min ? { sub: L(`${min} min`, `${min} 分钟`) } : {}),
  ...(upNext ? { upNext: true } : {}),
});
const lec = (
  id: string,
  kind: Lecture['kind'],
  enTitle: string,
  zhTitle: string,
  enDesc: string,
  zhDesc: string,
  sessions: SessionRow[],
): Lecture => ({ id, kind, title: L(enTitle, zhTitle), description: L(enDesc, zhDesc), sessions });
const psUnit = (id: number, enTitle: string, zhTitle: string, lectures: Lecture[]): Unit => ({
  id,
  title: L(enTitle, zhTitle),
  lectures,
});

export const publicSpeaking = (): Unit[] => [
  psUnit(1, 'Foundations of Speaking', '演讲基础', [
    lec(
      'l1',
      'lecture',
      'Lecture 1: The Speaking Situation',
      '第 1 讲：演讲情境',
      'This lecture introduces the fundamental components of any speech event, establishing the relationship between the speaker, the message, and the audience within a specific context.',
      '本讲介绍任何演讲活动的基本组成部分，在特定语境下确立演讲者、信息与听众之间的关系。',
      [
        ses('Speaker, Message, and Audience', '演讲者、信息与听众', 25, true),
        ses('Context and Occasion', '语境与场合', 20),
        ses('Ethics in Speaking', '演讲伦理', 20),
        ses('Credibility', '可信度', 15),
      ],
    ),
    lec(
      'l2',
      'lecture',
      'Lecture 2: Speech Anxiety',
      '第 2 讲：演讲焦虑',
      'This lecture addresses the psychological and physiological aspects of stage fright, providing evidence-based techniques to transform nervous energy into focused performance.',
      '本讲探讨怯场的心理与生理机制，提供有证据支撑的技巧，把紧张的能量转化为专注的表现。',
      [
        ses('Why We Get Nervous', '我们为什么会紧张', 20),
        ses('Reframing Nervous Energy', '重新定义紧张能量', 20),
        ses('Breathing and Grounding Drills', '呼吸与稳定练习', 15),
      ],
    ),
    lec(
      'p1',
      'project',
      'Project: The Professional Keynote Portfolio',
      '项目：职业主题演讲作品集',
      'Identify a high-stakes speaking scenario (e.g., a board meeting or a public lecture) and define your core message. Create a personalized practice routine to address specific nervous triggers.',
      '找一个高风险的演讲场景（如董事会会议或公开讲座），确定你的核心信息，并制定个性化的练习计划来应对特定的紧张触发点。',
      [
        ses('Scenario and Core Message Brief', '场景与核心信息简报', 15),
        ses('Personal Practice Routine', '个人练习计划', 30),
      ],
    ),
    lec(
      'l3',
      'lecture',
      'Lecture 3: Listening',
      '第 3 讲：倾听',
      'This lecture emphasizes that public speaking is a two-way street, focusing on the skills required to be an effective audience member and a reflective speaker.',
      '本讲强调公开演讲是双向的交流，重点培养成为高效听众与善于反思的演讲者所需的技能。',
      [
        ses('Active Listening', '主动倾听', 20),
        ses('Giving Useful Feedback', '给出有用的反馈', 20),
        ses('Reading Audience Signals', '读懂听众的信号', 15),
      ],
    ),
    lec(
      'e1',
      'exam',
      'Foundations of Speaking Comprehensive Exam',
      '演讲基础综合测验',
      'A timed check on the speaker-audience dynamic, anxiety management, and listening skills covered in this unit.',
      '针对本单元演讲者与听众互动、焦虑管理与倾听技巧的限时检验。',
      [ses('Unit 1 Timed Quiz', '第 1 单元限时测验', 20)],
    ),
  ]),
  psUnit(2, 'Planning the Speech', '规划演讲', [
    lec(
      'l4',
      'lecture',
      'Lecture 4: Purpose and Audience',
      '第 4 讲：明确目的与听众',
      'Every strong talk starts with a sharp purpose and a clear picture of who is in the room. This lecture builds both.',
      '每一场出色的演讲都始于清晰的目的和对在场听众的准确画像。本讲同时解决这两件事。',
      [
        ses('Three Purposes of a Speech', '演讲的三种目的', 20),
        ses('Audience Profiling', '听众画像与分析', 25),
        ses('Managing Expectations of the Occasion', '场合与期待管理', 15),
      ],
    ),
    lec(
      'l5',
      'lecture',
      'Lecture 5: Research and Evidence',
      '第 5 讲：资料调研与证据',
      'Claims land when they are backed by solid material. Learn to find, judge, and weave evidence into a talk.',
      '观点要有坚实的材料支撑才能立住。学会寻找、甄别证据，并把它织进演讲里。',
      [
        ses('Sources and Credibility', '信息来源与可信度', 20),
        ses('Data, Cases, and Quotes', '数据、案例与引语', 25),
        ses('Citing Evidence Naturally', '自然地引用证据', 15),
      ],
    ),
    lec(
      'l6',
      'lecture',
      'Lecture 6: Structuring the Talk',
      '第 6 讲：搭建演讲结构',
      'Structure is what lets an audience follow you without effort. This lecture covers openings, bodies, closings, and the transitions between them.',
      '结构让听众毫不费力地跟上你。本讲涵盖开场、主体、结尾，以及把它们串起来的过渡。',
      [
        ses('Openings, Bodies, and Closings', '开场、主体与结尾', 25),
        ses('Classic Structure Templates', '经典结构模板', 20),
        ses('Transitions and Signposts', '过渡与路标语句', 15),
      ],
    ),
    lec(
      'p2',
      'project',
      'Project: Speech Outline Blueprint',
      '项目：演讲大纲蓝图',
      'Pick a real occasion from your work or life and produce a complete speaking outline: purpose statement, audience notes, structure, and evidence slots.',
      '从你的工作或生活中挑一个真实场合，产出一份完整的演讲大纲：目的陈述、听众笔记、结构骨架与证据位。',
      [
        ses('Topic and Purpose Statement', '选题与目的陈述', 15),
        ses('Outline Draft and Peer Review', '大纲撰写与互评', 30),
      ],
    ),
    lec(
      'e2',
      'exam',
      'Planning the Speech Unit Quiz',
      '规划演讲单元测验',
      'A timed check on purpose setting, audience analysis, evidence, and structure.',
      '针对目的设定、听众分析、证据运用与结构搭建的限时检验。',
      [ses('Unit 2 Timed Quiz', '第 2 单元限时测验', 20)],
    ),
  ]),
  psUnit(3, 'Crafting the Message', '打磨信息', [
    lec(
      'l7',
      'lecture',
      'Lecture 7: Core Message and Storytelling',
      '第 7 讲：核心信息与故事',
      'Audiences remember stories, not bullet points. Learn to distill one core message and wrap it in narrative.',
      '听众记住的是故事，不是要点清单。学会提炼一条核心信息，并用叙事把它包起来。',
      [
        ses('The One-Sentence Core Message', '一句话核心信息', 20),
        ses('Story Structure and Tension', '故事的结构与张力', 25),
        ses('Using Personal Experience', '个人经历的使用', 15),
      ],
    ),
    lec(
      'l8',
      'lecture',
      'Lecture 8: Language and Rhetoric',
      '第 8 讲：语言与修辞',
      'Spoken language follows different rules than written prose. This lecture tunes your wording for the ear.',
      '口头语言与书面文字遵循不同的规则。本讲把你的措辞调成"为耳朵而写"。',
      [
        ses('Writing for the Ear', '口语化表达', 20),
        ses('Rhetorical Devices: Triads, Contrast, Questions', '修辞手法：排比、对比与提问', 25),
        ses('Cutting for Clarity', '为清晰而删减', 15),
      ],
    ),
    lec(
      'l9',
      'lecture',
      'Lecture 9: Designing Visual Aids',
      '第 9 讲：视觉辅助设计',
      'Slides should carry what words cannot. Learn when to use visuals and how to keep them out of the way of your message.',
      '幻灯片应该承载文字无法承载的东西。学会何时用视觉辅助，以及如何让它不挡信息的道。',
      [
        ses('Principles for Using Slides', '幻灯片的取舍原则', 20),
        ses('Layout and Information Hierarchy', '版式与信息层级', 20),
        ses('Letting Charts Speak', '让图表说话', 15),
      ],
    ),
    lec(
      'p3',
      'project',
      'Project: The Three-Minute Talk Script',
      '项目：三分钟演讲稿',
      'Turn your Unit 2 outline into a full three-minute script, then refine it through read-aloud passes until it sounds like you at your best.',
      '把第 2 单元的大纲扩展成一份完整的三分钟演讲稿，再通过朗读迭代打磨，直到它听起来就是最佳状态的你。',
      [
        ses('Writing the First Draft', '撰写初稿', 30),
        ses('Read-Aloud Revision', '朗读修改打磨', 20),
      ],
    ),
    lec(
      'e3',
      'exam',
      'Crafting the Message Unit Quiz',
      '打磨信息单元测验',
      'A timed check on core messages, storytelling, rhetoric, and visual aids.',
      '针对核心信息、故事、修辞与视觉辅助的限时检验。',
      [ses('Unit 3 Timed Quiz', '第 3 单元限时测验', 20)],
    ),
  ]),
  psUnit(4, 'Delivery', '现场表达', [
    lec(
      'l10',
      'lecture',
      'Lecture 10: Voice and Pace',
      '第 10 讲：声音与语速',
      'Your voice is an instrument with volume, pitch, and tempo. This lecture teaches you to play it deliberately.',
      '声音是一件有音量、音高和节奏的乐器。本讲学会有意识地演奏它。',
      [
        ses('Volume, Pitch, and Timbre', '音量、音高与音色', 20),
        ses('The Power of the Pause', '停顿的力量', 15),
        ses('Tempo and Rhythm', '语速与节奏', 20),
      ],
    ),
    lec(
      'l11',
      'lecture',
      'Lecture 11: Body Language',
      '第 11 讲：肢体语言',
      'The audience reads your body before it hears your words. Align posture, gesture, and eye contact with your message.',
      '听众在听到你的话之前就先读到你的身体。让站姿、手势与眼神和信息保持一致。',
      [
        ses('Stance and Movement', '站姿与移动', 20),
        ses('Gesture and Expression', '手势与表情', 20),
        ses('Eye Contact', '眼神交流', 15),
      ],
    ),
    lec(
      'l12',
      'lecture',
      'Lecture 12: Rehearsal and Stage Presence',
      '第 12 讲：排练与临场',
      'Great delivery looks effortless because it was rehearsed deliberately. Build a rehearsal loop and a plan for when things go wrong.',
      '出色的现场看起来毫不费力，因为背后是刻意的排练。建立排练闭环，并为突发状况准备预案。',
      [
        ses('Deliberate Rehearsal Methods', '高效排练法', 25),
        ses('Handling the Unexpected', '应对突发状况', 20),
        ses('Pre-Stage Rituals', '上场前的仪式感', 10),
      ],
    ),
    lec(
      'p4',
      'project',
      'Project: Recorded Rehearsal Review',
      '项目：录像回放复盘',
      'Record a full rehearsal of your three-minute talk, review it with a structured checklist, and ship an improved second take.',
      '完整录制一遍你的三分钟演讲试讲，用结构化清单复盘，并交出改进后的第二版。',
      [
        ses('Recording the Rehearsal', '录制试讲视频', 30),
        ses('Review Checklist and Improvement Plan', '复盘清单与改进计划', 20),
      ],
    ),
    lec(
      'e4',
      'exam',
      'Delivery Unit Quiz',
      '现场表达单元测验',
      'A timed check on voice, body language, and rehearsal technique.',
      '针对声音、肢体语言与排练方法的限时检验。',
      [ses('Unit 4 Timed Quiz', '第 4 单元限时测验', 20)],
    ),
  ]),
  psUnit(5, 'Speaking in Context', '情境中的演讲', [
    lec(
      'l13',
      'lecture',
      'Lecture 13: Impromptu Speaking',
      '第 13 讲：即兴演讲',
      'Most real-world speaking is unscripted. Learn frameworks that make thinking on your feet look easy.',
      '真实世界里的演讲大多没有稿子。学会几个框架，让临场发挥看起来游刃有余。',
      [
        ses('All-Purpose Impromptu Frameworks', '即兴发言的通用框架', 20),
        ses('Buying Time to Think', '争取思考时间', 15),
        ses('High-Frequency Scenario Drills', '高频场景演练', 20),
      ],
    ),
    lec(
      'l14',
      'lecture',
      'Lecture 14: Handling Q&A',
      '第 14 讲：问答环节',
      'Q&A is where credibility is won or lost. Prepare for the questions, structure the answers, and defuse the hostile ones.',
      '问答环节是可信度得失的关键。预测问题、结构化回答，并化解刁钻提问。',
      [
        ses('Anticipating Questions', '预测与准备问题', 20),
        ses('Structuring an Answer', '回答的结构', 20),
        ses('Handling Hostile Questions', '棘手问题的应对', 15),
      ],
    ),
    lec(
      'l15',
      'lecture',
      'Lecture 15: Virtual and Hybrid Talks',
      '第 15 讲：线上与混合场景',
      'Camera, latency, and split audiences change the rules. Adapt your delivery for rooms that are not rooms.',
      '镜头、延迟与分散的听众改变了规则。让你的表达适应"不是房间的场地"。',
      [
        ses('Speaking to the Camera', '镜头前的表达', 20),
        ses('Online Interaction Tools', '线上互动工具', 15),
        ses('Serving Mixed Audiences', '兼顾线上线下的混合场地', 20),
      ],
    ),
    lec(
      'p5',
      'project',
      'Project: The Capstone Talk',
      '项目：毕业主题演讲',
      'Deliver a complete five-minute talk that applies everything in the course, live or recorded, and collect structured peer feedback.',
      '综合运用课程全部内容，交付一场完整的五分钟演讲（现场或录制），并收集结构化的同伴反馈。',
      [
        ses('Delivering the Full Talk', '完整演讲交付', 40),
        ses('Peer Feedback and Reflection', '同伴反馈与反思', 20),
      ],
    ),
    lec(
      'e5',
      'exam',
      'Public Speaking Final Exam',
      '公开演讲结课综合测验',
      'The comprehensive final: planning, message craft, delivery, and in-context speaking, all in one timed check.',
      '结课综合大考：规划、信息打磨、现场表达与情境演讲，一次限时检验全覆盖。',
      [ses('Final Timed Quiz', '结课限时测验', 30)],
    ),
  ]),
];

export const psCourse = () => ({
  title: L('Public Speaking', '公开演讲'),
  curator: 'Hyperknow Official',
  description: L(
    'A comprehensive journey through the art and science of public speaking. This course provides a structured workflow for planning, writing, and delivering talks that move people — from reading your audience and shaping a single clear message, to managing stage fright, grounding claims in evidence and story, and handling Q&A with composure.',
    '一场关于公开演讲艺术与科学的全面旅程。本课程提供一套结构化的工作流程，用于规划、撰写与呈现能打动人的演讲——从读懂听众、塑造一条清晰的核心信息，到管理怯场、用证据与故事支撑观点，再到从容应对问答环节。',
  ),
  tags: [
    L('# Communication', '# 沟通'),
    L('# Public Speaking', '# 公开演讲'),
    L('# Professional Development', '# 职业发展'),
    L('# Leadership', '# 领导力'),
  ],
  unit1Chip: L('UNIT 1 OF 5', '第 1 单元，共 5 单元'),
  unit1Title: L('Unit 1: Foundations of Speaking', '第 1 单元：演讲基础'),
  unit1Description: L(
    'Establish the psychological, ethical, and relational groundwork of public speaking. This unit focuses on the speaker-audience dynamic, strategies for managing anxiety, and the essential role of active listening and feedback.',
    '建立公开演讲的心理、伦理与关系基础。本单元聚焦演讲者与听众的互动、管理焦虑的策略，以及主动倾听与反馈的关键作用。',
  ),
});

export const chatUserMessage = (): string =>
  L(
    'Please teach me the concept of Binary Search Trees. Create an interactive lesson with: 1) Core explanation, 2) Flashcards for active recall, 3) Multiple choice quiz questions, 4) A Mermaid diagram or animation showing insertion.',
    '请给我讲讲二叉搜索树这个概念。做一个互动课程，包含：1) 核心讲解，2) 用于主动回忆的抽认卡，3) 选择题测验，4) 展示插入过程的 Mermaid 图或动画。',
  );

export const memoryEntries = (): { text: string; date: string }[] => {
  const text = L("The user requested a 'ping' response, which I fulfilled.", '用户请求"ping"回复，我已满足。');
  return [
    { text, date: 'Sep 4, 2026' },
    { text, date: 'Sep 4, 2026' },
  ];
};
