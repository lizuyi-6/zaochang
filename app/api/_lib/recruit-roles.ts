// 选拔邮件"自动填充"的唯一事实来源:岗位角色段落、评委反馈句库、人才库回执。
// 内容逐字来自结果邮件原型(index.html 里的 ROLES / FEEDBACK / TALENT):
// 选拔台的占位符不再靠手敲——选好候选人(岗位已知)后,这些段落自动带出,
// 运营仍可在界面上改写(自动填充只是预填,不是锁死)。
// 纯数据 + 纯函数,无 D1/Worker 依赖,Node 测试直接断言。

export type RecruitRoleKey = "captain" | "research" | "copy" | "ppt" | "tech";

export type RecruitRole = {
  name: string;
  focus: string;      // 群面关注点
  duty: string;       // 录取后职责
  wait: string;       // 候补等待期建议(E2 用,可以提递补进群面)
  reviewWait: string; // 评审中等待期建议(E8 用,不提群面、不引导改作业——所有人同岗位同一版)
  grow: string;       // 未通过后的建议
};

// E8 的等待期建议:结果未出、每个岗位只用一版,同学之间会对比邮件,
// 所以不提群面、也不让同学回头改作业(2026-10 模板文档的硬约束)。
export const RECRUIT_ROLES: Record<RecruitRoleKey, RecruitRole> = {
  captain: {
    name: "队长 / 项目负责人",
    focus: "群面中，评委会特别留意你怎么带动小组在 2 小时内拿出方案：怎么分工、怎么收拢分歧、怎么控制时间，以及最后路演的表达。",
    duty: "你的主要职责是统筹团队进度和分工，对接见界团队和指导老师，并担任答辩主讲。第一周，请和见界团队一起定下校赛前的时间线，并组织第一次全员会。",
    wait: "如果递补进入群面，你会和 4–5 位同学用 2 小时拿出一个方案。可以先想好：开场 10 分钟怎么分工、什么时间点必须定下方向、意见分歧时怎么收拢。找两三位同学模拟一次 20 分钟的快速讨论，会很有帮助。",
    reviewWait: "可以拿身边一个小项目或课程作业，练习写一页“谁、在什么时间、交什么”的计划表；再想想，组里意见不一致时，你会怎么把大家拉回到同一个方向。这些只是建议，不需要提交，也不计入评分。",
    grow: "下次带团队做项目，开第一次会之前，先写一页“谁、在什么时间、交什么”的计划表；写风险时具体到“哪件事、什么时候、谁来兜底”。答辩开场先讲清“凭什么我们能做成”，再讲功能。",
  },
  research: {
    name: "调研",
    focus: "群面中，评委会特别留意你能不能把乡村老师的真实处境带进讨论，用事实和原话支撑观点，而不是凭感觉下判断。",
    duty: "你的主要职责是做用户调研：持续访谈乡村老师，整理需求证据，支撑计划书和答辩。第一周，请和队长一起列出首批访谈对象，完成第一版访谈提纲。",
    wait: "群面任务围绕乡村老师备课展开。可以读一两篇关于乡村教师工作状况的公开研究或报道，记下让你意外的事实和出处；再想想，如果能和一位乡村老师聊 10 分钟，你最想问的三个问题是什么。",
    reviewWait: "可以读一两篇关于乡村教师工作状况的公开研究或报道，记下让你意外的事实和出处；再想想，如果能和一位乡村老师聊 10 分钟，你最想问哪三个问题。这些只是建议，不需要提交，也不计入评分。",
    grow: "访谈前先把自己的假设写下来，访谈时专门留意能推翻它的证据；每条结论都配一句受访者原话；引用公开数据时，亲自打开原文核对数字和出处。",
  },
  copy: {
    name: "商业计划书 / 文案",
    focus: "群面中，评委会特别留意你能不能在讨论中及时归纳要点，把零散的想法整理成清楚、站得住的表述。",
    duty: "你的主要职责是负责商业计划书、项目简介和各类参赛文案，并管理所有数据和引用的出处。第一周，请整理赛事报名需要的文字材料清单，起草项目简介初稿。",
    wait: "群面里需要在讨论中随时归纳要点。可以练习把一篇长文压缩成 100 字以内、不带套话的一段话；再练习把“见界现在能做什么”和“我们打算让它做什么”分开说清楚。",
    reviewWait: "可以挑一篇你喜欢的文章，练习把它压缩成 100 字以内、不带套话的一段话；再练习引用数据时亲自打开原文核对，把“现在能做的”和“打算做的”分开写。这些只是建议，不需要提交，也不计入评分。",
    grow: "每个数字和说法都配一个能直接点开的具体出处，引用前亲自打开核对；把产品“现在能做的”和“设想”分开写；写完再读一遍，删掉去掉也不影响意思的词。",
  },
  ppt: {
    name: "PPT / 视觉",
    focus: "群面中，评委会特别留意你能不能把小组的方案很快变成评委一眼看懂的页面，以及取舍信息的能力。",
    duty: "你的主要职责是负责路演 PPT、海报等参赛视觉物料，并维护统一的视觉规范。第一周，请基于品牌素材搭一套参赛 PPT 模板。",
    wait: "群面现场节奏很快，速度和取舍比精修更重要。可以给自己 15 分钟，把一段方案文字做成一页评委一眼能看懂的幻灯片，多练几次，并熟悉品牌素材里的配色和字体。",
    reviewWait: "可以找一份你觉得做得好的路演 PPT，只看每页标题，看能不能串成完整的故事；再给自己 15 分钟，把一段文字做成一页一眼就能看懂的幻灯片。这些只是建议，不需要提交，也不计入评分。",
    grow: "动手做页面之前，先把每页标题写出来，确认只看标题就能串成完整的故事；页面上的每个数据都在页脚标出处；投影用的正文字号尽量不小于 18 号。",
  },
  tech: {
    name: "技术 / 产品",
    focus: "群面中，评委会特别留意你能不能判断方案在技术上做不做得出来，并把复杂的事讲给非技术的同学听懂。",
    duty: "你的主要职责是负责产品方案和原型，评估技术可行性，对接见界技术团队，必要时做演示 demo。第一周，请熟悉见界现有能力，并和调研同学一起确定第一个要做的备课场景。",
    wait: "群面里需要判断方案做不做得出来。可以先熟悉素材包里见界现有的能力，再想想乡村学校网络差、设备旧的时候，一个备课工具最少几步能用起来；也练习用不带术语的话，把技术方案讲给文科同学听。",
    reviewWait: "可以找一个你常用的 App，把完成一件事的每一步画出来，再想想哪几步可以删掉；也练习用不带术语的话，把一个技术方案讲给文科同学听。这些只是建议，不需要提交，也不计入评分。",
    grow: "做方案前先画出用户从打开到完成的每一步，再试着删掉一半；写清哪些用见界现有能力、哪些要新做、新做的部分大概需要多久。",
  },
};

export const RECRUIT_ROLE_KEYS = Object.keys(RECRUIT_ROLES) as RecruitRoleKey[];

// 评委反馈句库:点一句追加一句(先肯定、再改进),按岗位分;
// 群面/终面类邮件(E4/E5/E7)用 group 通用句库。
export type FeedbackLibrary = { pos: readonly string[]; neg: readonly string[] };

export const RECRUIT_FEEDBACK: Record<RecruitRoleKey | "group", FeedbackLibrary> = {
  captain: {
    pos: ["推进计划的时间节点清楚，分工落到了人。", "3 分钟答辩开场讲清了问题、方案和价值。", "追问回答直接，不回避难题。"],
    neg: ["风险写得偏泛，可以具体到“哪件事、什么时候、谁来兜底”。", "答辩开场以介绍功能为主，“凭什么我们能做成”讲得不够。", "追问回答有喊口号的倾向，多用具体例子和数字会更有说服力。"],
  },
  research: {
    pos: ["访谈对象贴近目标用户。", "提纲问题开放，能追问到具体场景。", "每条洞察都有受访者原话做证据。"],
    neg: ["洞察停留在复述抱怨，可以再追问一层“为什么”。", "提纲里有带诱导性的问题，容易让对方顺着你的预设回答。", "对见界的启示偏泛，可以写到“下一步具体做什么”。"],
  },
  copy: {
    pos: ["竞品信息都有来源，可以核实。", "对比维度清楚，结论是从对比里推出来的。", "简介精炼好懂，没有空话。"],
    neg: ["部分竞品信息已经过时或不准，需要逐条核实。", "把素材包里没有的功能写成了见界现有能力。", "差异化定位偏自夸，可以从对比中找出见界真正能赢的一点。", "漏掉了最直接的竞品，比如已经在做 AI 备课的工具。"],
  },
  ppt: {
    pos: ["一页一个观点，只看标题就能串起故事线。", "配色、字体、间距统一，看起来专业。", "善于把文字转成图表和图示。"],
    neg: ["单页信息太多，可以删到只剩一个核心观点。", "配色和字体不够统一，没有用好品牌素材。", "设计说明讲了“用了什么”，没讲“为什么这样选”。"],
  },
  tech: {
    pos: ["场景具体，考虑到了乡村老师的设备和网络条件。", "流程步骤少、路径清楚。", "技术方案复用了见界已有能力，新做的部分切实可行。"],
    neg: ["场景停留在一般描述，可以具体到哪位老师、在什么时候备课。", "原型的信息层级不清楚，关键操作不够突出。", "技术方案没有考虑弱网和离线。"],
  },
  group: {
    pos: ["主动提出分工，推动小组按时拿出方案。", "认真听别人的想法，能把不同意见整合起来。", "时间紧时依然冷静，路演表达清楚。"],
    neg: ["讨论中发言较少，自己的想法没有说出来。", "比较坚持自己的方案，对别人的意见回应不够。", "路演超时，重点不够突出。"],
  },
};

// 人才库回执二选一(原型里的 talent 下拉)。
export const RECRUIT_TALENT = {
  A: "我们会把你保留在见界人才库，之后有合适的项目会优先联系你。",
  B: "你的报名信息和作业会在选拔结束后 30 天内删除。",
} as const;

export type RecruitTalentChoice = keyof typeof RECRUIT_TALENT;

export const TALENT_PLACEHOLDER = "人才库段落：同意加入人才库用 A，未同意用 B";

// 岗位段落占位符 → ROLES 字段。模板里出现这些键时按候选人岗位自动带出。
// 注意 E8 的「等待期建议」是 reviewWait(结果未出、不提群面),E2 的
// 「候补等待期建议」才是 wait —— 两者不能混用,否则会提前泄露结果倾向。
export const ROLE_PLACEHOLDER_FIELDS: Record<string, keyof RecruitRole> = {
  "岗位段落：群面关注点": "focus",
  "岗位段落：录取后职责": "duty",
  "岗位段落：候补等待期建议": "wait",
  "等待期建议": "reviewWait",
  "岗位段落：未通过后的建议": "grow",
};

// 群面/终面类邮件的反馈用通用句库(与原型 GROUP_ONLY 一致)。
export const GROUP_FEEDBACK_TEMPLATES: readonly string[] = ["E4", "E5", "E7"];

// 岗位名 → 角色。按名字精确匹配(忽略空白差异);自定义岗位返回 null,
// 此时自动填充不生效,占位符仍由运营手填。
export function roleForPosition(position: string): { key: RecruitRoleKey; role: RecruitRole } | null {
  const normalize = (value: string) => value.replace(/\s+/g, "");
  const target = normalize(position);
  if (!target) return null;
  for (const key of RECRUIT_ROLE_KEYS) {
    if (normalize(RECRUIT_ROLES[key].name) === target) return { key, role: RECRUIT_ROLES[key] };
  }
  return null;
}

// 本次发信应自动带出的占位符值(只返回非空项;调用方与手填值合并时手填优先)。
// 人才库段落只在选了 A/B 时带出;反馈不预填(由句库点选追加)。
export function autoFillValuesForTemplate(input: {
  position: string;
  talent?: RecruitTalentChoice | "";
}): Record<string, string> {
  const values: Record<string, string> = {};
  const matched = roleForPosition(input.position);
  if (matched) {
    for (const [placeholder, field] of Object.entries(ROLE_PLACEHOLDER_FIELDS)) {
      const value = matched.role[field];
      if (value) values[placeholder] = value;
    }
  }
  const talent = input.talent ?? "";
  if (talent === "A" || talent === "B") values[TALENT_PLACEHOLDER] = RECRUIT_TALENT[talent];
  return values;
}

// 反馈句库:群面类邮件用 group,其余按岗位;自定义岗位且非群面 → null(无建议句)。
export function feedbackLibraryFor(position: string, templateId: string): FeedbackLibrary | null {
  if (GROUP_FEEDBACK_TEMPLATES.includes(templateId)) return RECRUIT_FEEDBACK.group;
  const matched = roleForPosition(position);
  return matched ? RECRUIT_FEEDBACK[matched.key] : null;
}
