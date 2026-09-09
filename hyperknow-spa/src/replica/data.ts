/**
 * Demo content for the Hyperknow 1:1 replica (strings verbatim from reference screenshots).
 * Text goes through L() so demo content follows the app language (en authored verbatim,
 * zh authored; other locales fall back to en). Exported as functions so values are
 * computed at call time and follow runtime language switches.
 */
import { L } from './i18n/content';

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
    lessons: 60,
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
    lessons: 75,
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
    lessons: 60,
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
    lessons: 30,
    rating: 4.4,
    cover: 'ai',
  },
  {
    id: 'ap-bio',
    title: L('AP Biology', 'AP 生物学'),
    description: L('An inquiry-based study of cells, genetics, …', '以探究为导向，研究细胞、遗传…'),
    difficulty: 'Intermediate',
    lessons: 75,
    rating: 4.6,
    cover: 'bio',
  },
  {
    id: 'ap-world',
    title: L('AP World History: Modern', 'AP 世界史：现代'),
    description: L('A comprehensive global history course …', '一门全面的全球史课程…'),
    difficulty: 'Beginner',
    lessons: 73,
    rating: 4.5,
    cover: 'history',
  },
  {
    id: 'prompt',
    title: L('Prompt Engineering for Real Work', '实战提示词工程'),
    description: L('Prompt engineering…', '提示词工程…'),
    difficulty: 'Intermediate',
    lessons: 36,
    rating: 4.4,
    cover: 'prompt',
  },
  {
    id: 'ap-psych',
    title: L('AP Psychology', 'AP 心理学'),
    description: L('Psychology…', '心理学…'),
    difficulty: 'Beginner',
    lessons: 77,
    rating: 4.5,
    cover: 'psych',
  },
  {
    id: 'sat',
    title: L('Official Digital SAT Preparation', 'Digital SAT 官方备考'),
    description: L('SAT…', 'SAT…'),
    difficulty: 'Beginner',
    lessons: 90,
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

/** Public Speaking course structure (Unit 1 = Foundations of Speaking). */
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

export const publicSpeaking = (): Unit[] => [
  {
    id: 1,
    title: L('Foundations of Speaking', '演讲基础'),
    lectures: [
      {
        id: 'l1',
        title: L('Lecture 1: The Speaking Situation', '第 1 讲：演讲情境'),
        description: L(
          'This lecture introduces the fundamental components of any speech event, establishing the relationship between the speaker, the message, and the audience within a specific context.',
          '本讲介绍任何演讲活动的基本组成部分，在特定语境下确立演讲者、信息与听众之间的关系。',
        ),
        sessions: [
          { title: L('Speaker, Message, and Audience', '演讲者、信息与听众'), upNext: true },
          { title: L('Context and Occasion', '语境与场合') },
          { title: L('Ethics in Speaking', '演讲伦理') },
          { title: L('Credibility', '可信度') },
        ],
      },
      {
        id: 'l2',
        title: L('Lecture 2: Speech Anxiety', '第 2 讲：演讲焦虑'),
        description: L(
          'This lecture addresses the psychological and physiological aspects of stage fright, providing evidence-based techniques to transform nervous energy into focused performance.',
          '本讲探讨怯场的心理与生理机制，提供有证据支撑的技巧，把紧张的能量转化为专注的表现。',
        ),
        sessions: [],
      },
      {
        id: 'p1',
        kind: 'project',
        title: L('Project: The Professional Keynote Portfolio', '项目：职业主题演讲作品集'),
        description: L(
          'Identify a high-stakes speaking scenario (e.g., a board meeting or a public lecture) and define your core message. Create a personalized practice routine to address specific nervous triggers.',
          '找一个高风险的演讲场景（如董事会会议或公开讲座），确定你的核心信息，并制定个性化的练习计划来应对特定的紧张触发点。',
        ),
        sessions: [],
      },
      {
        id: 'l3',
        title: L('Lecture 3: Listening', '第 3 讲：倾听'),
        description: L(
          'This lecture emphasizes that public speaking is a two-way street, focusing on the skills required to be an effective audience member and a reflective speaker.',
          '本讲强调公开演讲是双向的交流，重点培养成为高效听众与善于反思的演讲者所需的技能。',
        ),
        sessions: [],
      },
      {
        id: 'e1',
        kind: 'exam',
        title: L('Foundations of Speaking Comprehensive Exam', '演讲基础综合测验'),
        description: '',
        sessions: [],
      },
    ],
  },
  { id: 2, title: L('Planning the Speech', '规划演讲'), lectures: [] },
  { id: 3, title: L('Crafting the Message', '打磨信息'), lectures: [] },
  { id: 4, title: L('Delivery', '现场表达'), lectures: [] },
  { id: 5, title: L('Speaking in Context', '情境中的演讲'), lectures: [] },
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
