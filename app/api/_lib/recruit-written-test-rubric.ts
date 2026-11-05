// 见界创赛选拔笔试的评分口径:服务端唯一事实源。
//
// 纪律:
// 1) 题目、分值、评分点、参考答案全部写死在这里,前端与模型都只能读,不能改——
//    模型收到的评分点必须来自服务端,否则等于让考生自己定标准。
// 2) 分值合计必须恒等于 100(有测试守着),多一分少一分都会让「总分」失去意义。
// 3) kind 决定这题怎么判:
//    hard       —— 标准答案已知,代码硬判,零误判(1.4 情景单选)。
//    llm        —— 文本作答,模型按 rubric 初评,人工定稿。
//    attachment —— 附件(PDF/Word)作答,先抽文本再初评;字节拿不到时退化为人工。
//    manual     —— 人工判(手绘草图是图片,v1 不做多模态)。
//    info       —— 不计分(身份信息、用时),只做合规筛查。
export type WrittenTestItemKind = "hard" | "llm" | "attachment" | "manual" | "info";

export type WrittenTestSection = "基本信息" | "第一部分" | "第二部分" | "第三部分" | "第四部分";

export type WrittenTestItemSpec = {
  /** 稳定键:落库与前端都用它,不随题面文案变化。 */
  key: string;
  /** 题号 + 标题,阅卷台与统计里显示。 */
  label: string;
  /** 飞书表单里的字段标题(收件与同步脚本靠它对上号)。 */
  sourceField: string;
  section: WrittenTestSection;
  maxScore: number;
  kind: WrittenTestItemKind;
  /** 给模型的作答要求(服务端固定,模型只读)。 */
  prompt: string;
  /** 评分点:命中与否决定得分,不命中给理由。 */
  rubric: string[];
  /** 参考答案/素材摘录(仅供模型对照,不是标准答案全文)。 */
  reference?: string;
  /** hard 题的标准选项(单选的正确项)。 */
  correctOption?: string;
  /** 字数上限等硬约束(用于标记待复核,不直接扣分)。 */
  maxChars?: number;
};

export const WRITTEN_TEST_TOTAL_SCORE = 100;

// 情景单选的四道标准答案(出题人自己定的,代码只照抄不改)。
export const WRITTEN_TEST_SINGLE_CHOICE = [
  { key: "t1_4_1", correctOption: "B" },
  { key: "t1_4_2", correctOption: "C" },
  { key: "t1_4_3", correctOption: "B" },
  { key: "t1_4_4", correctOption: "B" },
] as const;

export const WRITTEN_TEST_ITEMS: WrittenTestItemSpec[] = [
  {
    key: "name",
    label: "姓名",
    sourceField: "姓名",
    section: "基本信息",
    maxScore: 0,
    kind: "info",
    prompt: "考生姓名,用于对卷,不参与评分。",
    rubric: [],
  },
  {
    key: "school",
    label: "学校、专业、年级",
    sourceField: "学校、专业、年级",
    section: "基本信息",
    maxScore: 0,
    kind: "info",
    prompt: "学校 / 专业 / 年级,用于面试安排,不参与评分。",
    rubric: [],
  },
  {
    key: "contact",
    label: "手机或微信",
    sourceField: "手机或微信",
    section: "基本信息",
    maxScore: 0,
    kind: "info",
    prompt: "联系方式,用于面试通知,不参与评分。",
    rubric: [],
  },
  {
    key: "position",
    label: "意向岗位",
    sourceField: "意向岗位",
    section: "基本信息",
    maxScore: 0,
    kind: "info",
    prompt: "意向岗位(多选),用于分组,不参与评分。",
    rubric: [],
  },
  {
    key: "competition",
    label: "做过的比赛或项目",
    sourceField: "做过的比赛或项目",
    section: "基本信息",
    maxScore: 0,
    kind: "info",
    prompt: "过往比赛或项目,选填,不参与评分。",
    rubric: [],
  },
  {
    key: "t1_1",
    label: "1.1 任务卡",
    sourceField: "1.1 任务卡",
    section: "第一部分",
    maxScore: 8,
    kind: "llm",
    prompt:
      "把队长要你做的事整理成一张任务卡,不超过 6 行。任务卡要能覆盖:交什么、给谁看、什么时候交、篇幅多少、必须遵守的要求(至少 3 条)。" +
      "按要素是否写到给分,漏一个要素扣相应分;写到的要素要具体(例如截止时间要写周四晚上,不能只写「尽快」)。",
    rubric: [
      "写清交什么:一份一页纸的《见界项目简介》",
      "写清给谁看:校赛评委为主,合作乡村学校的老师顺带",
      "写清截止时间:周四晚上(队长改口后的版本)",
      "写清篇幅:一页以内",
      "列出至少 3 条必须遵守的要求(不写技术词 / 现在能做什么与打算做什么分开写 / 只用素材包事实不编数据 / 语气别太官方让老师看得懂 等,写三条即可)",
    ],
  },
  {
    key: "t1_2",
    label: "1.2 改口",
    sourceField: "1.2 改口",
    section: "第一部分",
    maxScore: 3,
    kind: "llm",
    prompt:
      "队长中途改了一次口。回答两件事:改的是什么、你按哪个版本执行。50 字以内。" +
      "标准事实:截止时间从周五晚上改为周四晚上,按周四晚上执行。",
    rubric: [
      "指出改的是截止时间这件事",
      "指出从「周五晚上」改成「周四晚上」(方向对:提前了)",
      "说明自己按哪个版本执行(周四晚上)",
    ],
  },
  {
    key: "t1_3",
    label: "1.3 两类读者",
    sourceField: "1.3 两类读者",
    section: "第一部分",
    maxScore: 5,
    kind: "llm",
    prompt:
      "这份简介有两类读者。回答:他们分别是谁、各自最关心什么、两者有冲突时你打算怎么写。100 字以内。",
    rubric: [
      "点明读者一是校赛评委",
      "点明读者二是合作乡村学校的老师",
      "分别说出各自最关心什么(评委看项目在做什么与是否可信,老师看能不能用、看不看得懂)",
      "给出冲突时的取舍办法(优先保证乡村老师看得懂,评委视角靠结构与事实支撑)",
    ],
  },
  {
    key: "t1_4_1",
    label: "1.4-1 情景单选",
    sourceField: "1.4-1 情景单选",
    section: "第一部分",
    maxScore: 1,
    kind: "hard",
    prompt: "队长看了你的 PPT 说「这页太满了」。你最先做什么?",
    rubric: ["选中正确选项即满分"],
    correctOption: "B",
  },
  {
    key: "t1_4_2",
    label: "1.4-2 情景单选",
    sourceField: "1.4-2 情景单选",
    section: "第一部分",
    maxScore: 1,
    kind: "hard",
    prompt: "素材包写着「方向定在让见界帮乡村老师备课,切入点还没定」。下面哪句写进简介最准确?",
    rubric: ["选中正确选项即满分"],
    correctOption: "C",
  },
  {
    key: "t1_4_3",
    label: "1.4-3 情景单选",
    sourceField: "1.4-3 情景单选",
    section: "第一部分",
    maxScore: 1,
    kind: "hard",
    prompt: "队长要「一页以内」,你写完是一页半,而且觉得每段都重要。你怎么办?",
    rubric: ["选中正确选项即满分"],
    correctOption: "B",
  },
  {
    key: "t1_4_4",
    label: "1.4-4 情景单选",
    sourceField: "1.4-4 情景单选",
    section: "第一部分",
    maxScore: 1,
    kind: "hard",
    prompt: "指导老师说「第三段语气太硬了,改一下」。你应该:",
    rubric: ["选中正确选项即满分"],
    correctOption: "B",
  },
  {
    key: "t2_1",
    label: "2.1 简介全文",
    sourceField: "2.1 简介全文",
    section: "第二部分",
    maxScore: 20,
    kind: "attachment",
    prompt:
      "这是一份要交给校赛评委(主要)和乡村学校老师(顺带)的《见界项目简介》。请按以下硬性要求逐条核对正文:" +
      "① 分开写「见界现在能做什么」与「我们打算让它做什么」;" +
      "② 篇幅一页以内;" +
      "③ 不出现技术词(SSE、TTS、ASR、DAG、rubric、Agent、API、模型名、平台名等);" +
      "④ 事实只来自见界素材包,没有的数据要写【待补:…】而不是编;" +
      "⑤ 语气能让乡村老师看懂;" +
      "⑥ 有标题与清晰结构。" +
      "按命中条数与完成质量给分。",
    rubric: [
      "「现在能做什么」与「打算做什么」分开成两段(没分开是硬伤,最多给一半分)",
      "篇幅在一页以内,没有明显超长",
      "全文没有出现 SSE/TTS/ASR/DAG/rubric/Agent/API 等技术词",
      "事实与素材包一致,没有编造用户数、覆盖学校数、效果数据",
      "语气让非技术读者(乡村老师)看得懂,不是纯官方腔",
      "有标题与结构,评委 10 秒内能看出项目在做什么",
    ],
  },
  {
    key: "t2_2",
    label: "2.2 一句话版本",
    sourceField: "2.2 一句话版本",
    section: "第二部分",
    maxScore: 5,
    kind: "llm",
    prompt:
      "评委只给你 10 秒,用一句话介绍这个项目(60 字以内)。要求说清:见界是什么、帮谁解决什么问题、往哪个方向做。" +
      "不写技术词、不编数字、不用素材包里没有的事实。",
    rubric: [
      "说清见界是什么(一个帮乡村老师备课的 AI 学习助手/造场平台里的学习 Agent)",
      "说清帮谁解决什么问题(帮乡村老师备课)",
      "说清往哪个方向做(带见界参加校赛、方向是下乡教育帮老师备课)",
      "没有技术词、没有编造的数字",
    ],
    maxChars: 60,
  },
  {
    key: "t2_3",
    label: "2.3 你删掉了什么",
    sourceField: "2.3 你删掉了什么",
    section: "第二部分",
    maxScore: 10,
    kind: "llm",
    prompt:
      "素材包里很多信息你没有写进简介。回答要挑出你删掉的 3 条,并分别说明为什么删(每条 50 字以内)。" +
      "评分看:是否恰好挑了 3 条、是否逐条给了理由、理由是否站得住(与读者无关、与篇幅冲突、评委不关心、属于「打算做」不该混进「现在能做」等)。",
    rubric: [
      "恰好挑出 3 条要删的信息",
      "每条都说明了为什么删",
      "删的理由站得住(例如后端架构与评委无关、积分价格与乡村老师无关、属于「打算做」不能写成「已经能做」)",
    ],
  },
  {
    key: "t3_1",
    label: "3.1 手绘草图",
    sourceField: "3.1 手绘草图",
    section: "第三部分",
    maxScore: 5,
    kind: "manual",
    prompt:
      "手绘草图(拍照上传):看是否画了每一页的大致布局(方框 + 标题),页数与最终 PPT 是否对得上,是否体现了每页一个观点的思路。v1 人工判。",
    rubric: [
      "每页都有大致布局(方框 + 标题),不是随手涂鸦",
      "页数与最终 PPT 一致,标题能看出每页要讲的观点",
    ],
  },
  {
    key: "t3_2",
    label: "3.2 PPT 成品",
    sourceField: "3.2 PPT 成品",
    section: "第三部分",
    maxScore: 15,
    kind: "attachment",
    prompt:
      "这是校赛路演开头的 3–5 页 PPT。按以下要求核对:" +
      "① 3–5 页,16:9;" +
      "② 每页标题是一句完整的话、说观点,不是「项目背景」「产品介绍」这类栏目名;" +
      "③ 每页只讲一个观点;" +
      "④ 讲清三件事:乡村老师备课难在哪、见界现在能做什么、我们打算怎么帮老师;" +
      "⑤ 最后一页说下一步;" +
      "⑥ 引用公开资料处标了出处链接(否则该处算未达标);" +
      "⑦ 见界的能力没有超出素材包。" +
      "按命中条数与完成质量给分。",
    rubric: [
      "3–5 页,结构完整",
      "每页标题都是完整观点句,连起来能读成一个故事",
      "每页只讲一个观点,信息密度不失控",
      "讲清了乡村老师备课难在哪",
      "讲清了见界现在能做什么与打算怎么帮老师(两者分开)",
      "最后一页说了下一步",
      "引用出处标了链接(缺链接扣分),能力描述没有超出素材包",
    ],
  },
  {
    key: "t3_3",
    label: "3.3 设计说明",
    sourceField: "3.3 设计说明",
    section: "第三部分",
    maxScore: 5,
    kind: "llm",
    prompt:
      "每页写一句「为什么这样设计」:讲你为什么这样取舍和排布,不讲用了什么颜色、字体。评分看:是否每页都有说明、是否讲的是取舍与排布的理由、是否与草图和成品对得上。",
    rubric: [
      "每页都有一句说明",
      "讲的是取舍与排布的理由(为什么这页放这个、为什么先讲这件事)",
      "没有把颜色字体当成设计说明",
    ],
  },
  {
    key: "t4_1",
    label: "4.1 修改后全文",
    sourceField: "4.1 修改后全文",
    section: "第四部分",
    maxScore: 10,
    kind: "llm",
    prompt:
      "这是按队长 4 条修改意见改过的简介全文。逐条核对是否改到位:" +
      "① 标题改成一句话、直接说清在做什么;" +
      "② 第二段把「打算做的」改回「计划/将要做的」;" +
      "③ 去掉 SSE、TTS、DAG 等词,换成大白话;" +
      "④ 第一段和第三段按队长要求没有改动(如果动了反而扣分)。",
    rubric: [
      "标题改成一句话,直说在做什么",
      "第二段的夸大表述改回了「打算做 / 计划做」",
      "SSE、TTS、DAG 等技术词换成了大白话",
      "第一段和第三段保持原样(未擅自改动)",
    ],
  },
  {
    key: "t4_2",
    label: "4.2 修改清单",
    sourceField: "4.2 修改清单",
    section: "第四部分",
    maxScore: 6,
    kind: "llm",
    prompt:
      "逐条写出每条意见你改了哪一句:原句 → 新句。评分看:是否覆盖全部 4 条意见、每条是否都给出了原句和新句、引用的原句是否与初稿一致。",
    rubric: [
      "覆盖了全部 4 条意见",
      "每条都给出「原句 → 新句」",
      "引用的原句与初稿原文一致(不是复述)",
      "改动与 4.1 的正文一致,不是两套说法",
    ],
  },
  {
    key: "t4_3",
    label: "4.3 其他问题",
    sourceField: "4.3 其他问题",
    section: "第四部分",
    maxScore: 4,
    kind: "llm",
    prompt:
      "除了这 4 条意见,你还发现别的问题了吗?如果有,写出来,并说明你改了没有、为什么。100 字以内;没发现就写「无」。" +
      "评分看:是否发现了初稿里真实存在的其他问题(如第一段说「服务超过 1000 名乡村教师」属于素材包里没有的数字)、是否说明了改与不改、是否给了理由。",
    rubric: [
      "发现了至少一个初稿里真实存在的其他问题(例如编造的用户数等素材包没有的数据)",
      "说明了改还是不改",
      "给了理由",
    ],
  },
  {
    key: "timing",
    label: "四部分实际用时",
    sourceField: "",
    section: "基本信息",
    maxScore: 0,
    kind: "info",
    prompt: "四个部分各自的实际用时(分钟),只用于校准题量,不计分。",
    rubric: [],
  },
  {
    key: "integrity",
    label: "诚信确认",
    sourceField: "诚信确认",
    section: "基本信息",
    maxScore: 0,
    kind: "info",
    prompt: "考生确认本次作答没有使用 AI 工具,并同意面试时当面讲解与现场修改。没确认的提交会被标记为待复核。",
    rubric: [],
  },
];

// 附件题(简介 / PPT)判分时要对照的事实基线:见界素材包的技术同学原话摘要。
// 「事实只来自素材包」是这份试卷的硬要求,所以模型必须拿到同一份基线,否则它会拿
// 自己对产品的印象来判「是不是编造」。
export const WRITTEN_TEST_MATERIAL_SUMMARY = `见界（英文名 Lattice）是造场平台内置的学习 Agent,网页端入口 /lattice/;后端跑在 Cloudflare Workers(SSE/REST + D1 + R2),前端是 React SPA;大模型走 StepFun Messages 协议,TTS 用 stepaudio,ASR 用 stepaudio-asr;目前的用户是自学的学生和学习者。

已经能用的功能:
1) 流式学习对话:回答逐字流式输出(SSE),可附带最多 3 份资料(txt/md/docx/pdf),扫描版 PDF 读不出来不做 OCR;每次对话扣 2 积分。
2) 课程蓝图全自动生成:输入主题 → 前置问询 3–5 项 → 必要时最多追问 2 轮 → 联网研学 → 生成按单元组织的课程大纲(每个单元有目标、先修、完成标准、项目和测验,先修关系做 DAG 无环检测);生成一门课扣 10 积分。
3) 白板授课:AI 讲师先备课(生成讲稿)再边讲边写;板书有卡片、公式(KaTeX)、流程图(Mermaid)、配图(按需生图,每天最多 10 张)和随堂选择题;每一步配 TTS 朗读与字幕,6 种预置音色;讲到哪里板上就在哪里做聚光标注。
4) 举手插话:上课随时打断提问(打字或 ASR),按当前步骤上下文答疑,答完 5 秒回到主线。
5) 随堂检测:每讲 3 次小测,其中 1–2 次是简答或填空回忆题,AI 按 rubric 批改给出正确/部分正确/错误并指出漏了哪些要点;批改质量还没有用真实模型大量验证过。
6) 学习进度与掌握度:按每讲第一次作答的得分算掌握度,分 5 档(未开始/学过/熟悉/熟练/掌握);后续讲次开讲前捞出之前首答做错的题(最多 3 道)做热身复习。
7) 其他:白板可导出 JPG / PDF;白板、TTS、ASR 不扣积分;免费用户每天 20 积分。

已知问题:白板讲稿生成偶尔失败(界面提示「备课失败」让用户重新生成,或退回「简版提纲」并如实标注);必须联网才能用;手机端部分交互还没在真机上完整测过;整个产品是为「学生自学」设计的,没有专门给老师用的功能(比如帮老师写教案、管理班级)。

团队方向:要带见界参加学校的创新创业比赛(校赛);方向定在「下乡教育」——让见界帮乡村老师备课;切入点还没定,正在调研。`;

export const WRITTEN_TEST_ITEM_KEYS = WRITTEN_TEST_ITEMS.map((item) => item.key);

// 四部分用时在飞书里是四个独立数字字段,诚信确认是一个单选,单独登记。
export const WRITTEN_TEST_TIMING_FIELDS: Array<{ key: string; field: string }> = [
  { key: "time1", field: "第一部分实际用时（分钟）" },
  { key: "time2", field: "第二部分实际用时（分钟）" },
  { key: "time3", field: "第三部分实际用时（分钟）" },
  { key: "time4", field: "第四部分实际用时（分钟）" },
];
export const WRITTEN_TEST_INTEGRITY_FIELD = "诚信确认";

/** 飞书字段标题 → 稳定键(收件归一与本地同步脚本共用这一份对上关系)。 */
export function writtenTestFieldMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of WRITTEN_TEST_ITEMS) {
    if (item.sourceField) map[item.sourceField] = item.key;
  }
  for (const entry of WRITTEN_TEST_TIMING_FIELDS) map[entry.field] = entry.key;
  return map;
}

export function writtenTestItem(key: string): WrittenTestItemSpec | undefined {
  return WRITTEN_TEST_ITEMS.find((item) => item.key === key);
}

export function writtenTestScoredItems(): WrittenTestItemSpec[] {
  return WRITTEN_TEST_ITEMS.filter((item) => item.maxScore > 0);
}

export function writtenTestTotalScore(): number {
  return WRITTEN_TEST_ITEMS.reduce((sum, item) => sum + item.maxScore, 0);
}

/** 阅卷台分项统计用的分组顺序。 */
export const WRITTEN_TEST_SECTIONS: WrittenTestSection[] = [
  "基本信息",
  "第一部分",
  "第二部分",
  "第三部分",
  "第四部分",
];
