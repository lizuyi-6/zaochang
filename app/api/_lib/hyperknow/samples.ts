// 课程市场的官方示例课(替代原 routes/courses.js 里两条硬编码英文样例)。
// 样例是官方门户的展示位:不落 D1、全员可见,但必须是"完整课程"——
// 卡片节数由结构现算,详情页直接返回这棵树,点进去不再 404。
// 中文内容为主(用户面以中文为主),结构形状与 CourseStructure 完全一致。

export type SampleSession = {
  sessionId: string;
  sessionIndex: number;
  title: string;
  sessionTime: number;
  depthTags: string[];
};

export type SampleLecture = {
  lectureId: string;
  title: string;
  sessions: SampleSession[];
};

export type SampleUnit = {
  unitId: string;
  title: string;
  lectures: SampleLecture[];
};

export type SampleCourse = {
  marketplaceId: string;
  courseTitle: string;
  courseDescription: string;
  targetLearner: string;
  tags: string[];
  ticketVariant: number;
  subject: string;
  difficulty: string;
  joinCount: number;
  units: SampleUnit[];
};

/* 紧凑型 authoring 助手:草稿不带 id/序号,materialize 统一编号 */
type DraftSession = Omit<SampleSession, "sessionId" | "sessionIndex">;
type DraftLecture = Omit<SampleLecture, "lectureId" | "sessions"> & { sessions: DraftSession[] };
type DraftUnit = Omit<SampleUnit, "unitId" | "lectures"> & { lectures: DraftLecture[] };
type DraftCourse = Omit<SampleCourse, "units"> & { units: DraftUnit[] };

const s = (title: string, sessionTime: number, depthTags: string[]): DraftSession => ({
  title,
  sessionTime,
  depthTags,
});
const lec = (title: string, sessions: DraftSession[]): DraftLecture => ({ title, sessions });
const proj = (title: string, steps: [string, string]): DraftLecture => ({
  title,
  sessions: [s(steps[0], 15, ["application"]), s(steps[1], 30, ["application"])],
});
const quiz = (title: string, sessionTitle: string, minutes = 20): DraftLecture => ({
  title,
  sessions: [s(sessionTitle, minutes, ["definition", "application"])],
});
const unit = (title: string, lectures: DraftLecture[]): DraftUnit => ({ title, lectures });

function materialize(course: DraftCourse): SampleCourse {
  return {
    ...course,
    units: course.units.map((u, ui) => ({
      unitId: `unit-${ui + 1}`,
      title: u.title,
      lectures: u.lectures.map((l, li) => ({
        lectureId: `lec-${ui + 1}-${li + 1}`,
        title: l.title,
        sessions: l.sessions.map((sess, si) => ({
          sessionId: `sess-${ui + 1}-${li + 1}-${si + 1}`,
          sessionIndex: si + 1,
          ...sess,
        })),
      })),
    })),
  };
}

const sociology = materialize({
  marketplaceId: "091d5945-4f34-4bfc-9d3b-c34b76d62ee5",
  courseTitle: "社会学导论",
  courseDescription: "全面探索社会学的基本概念、经典理论与研究方法，学会用社会学的想象力观察身边的世界。",
  targetLearner: "对社会运行方式好奇的初学者与通识学习者。",
  tags: ["社会学", "通识", "研究方法"],
  ticketVariant: 3,
  subject: "socialScience",
  difficulty: "beginner",
  joinCount: 1205,
  units: [
    unit("社会学导览", [
      lec("什么是社会学", [
        s("社会学的想象力", 25, ["intuition"]),
        s("微观与宏观视角", 20, ["definition"]),
        s("社会学与其他学科", 15, ["definition"]),
      ]),
      lec("经典理论与思想家", [
        s("涂尔干与社会事实", 25, ["definition"]),
        s("韦伯与理解社会学", 25, ["definition"]),
        s("马克思与冲突视角", 20, ["definition"]),
      ]),
      lec("研究方法入门", [
        s("定量与定性", 20, ["definition"]),
        s("田野调查与访谈", 25, ["application"]),
        s("研究伦理", 15, ["definition"]),
      ]),
      proj("项目：观察身边的社会现象", ["选题与观察计划", "观察记录与小结"]),
      quiz("测验：第 1 单元测验", "限时测验"),
    ]),
    unit("文化与社会化", [
      lec("文化的构成", [
        s("符号、语言与价值观", 25, ["definition"]),
        s("规范与习俗", 20, ["definition"]),
        s("亚文化与反文化", 20, ["intuition"]),
      ]),
      lec("社会化过程", [
        s("家庭与学校", 20, ["intuition"]),
        s("同辈与媒体", 20, ["intuition"]),
        s("终身社会化", 15, ["definition"]),
      ]),
      lec("身份与角色", [
        s("角色扮演与角色冲突", 25, ["definition"]),
        s("标签理论", 20, ["definition"]),
        s("自我的形成", 20, ["intuition"]),
      ]),
      proj("项目：我的社会化地图", ["绘制影响因素图", "分享与互评"]),
      quiz("测验：第 2 单元测验", "限时测验"),
    ]),
    unit("社会结构与群体", [
      lec("社会分层", [
        s("阶级、地位与权力", 25, ["definition"]),
        s("流动的通道", 20, ["intuition"]),
        s("贫困与不平等", 25, ["definition"]),
      ]),
      lec("群体与组织", [
        s("初级群体与次级群体", 20, ["definition"]),
        s("科层制", 20, ["definition"]),
        s("群体动力学", 25, ["application"]),
      ]),
      lec("制度与秩序", [
        s("家庭制度", 20, ["definition"]),
        s("教育与宗教", 20, ["definition"]),
        s("社会控制", 20, ["definition"]),
      ]),
      proj("项目：社区结构素描", ["田野走访", "结构图与报告"]),
      quiz("测验：第 3 单元测验", "限时测验"),
    ]),
    unit("变迁与问题", [
      lec("城市化", [
        s("城市的兴起", 20, ["definition"]),
        s("城市生活方式", 20, ["intuition"]),
        s("城乡关系", 20, ["definition"]),
      ]),
      lec("人口与家庭变迁", [
        s("人口转型", 20, ["definition"]),
        s("家庭结构变化", 20, ["intuition"]),
        s("老龄化社会", 25, ["application"]),
      ]),
      lec("社会问题分析", [
        s("问题的建构", 20, ["definition"]),
        s("数据解读", 25, ["derivation"]),
        s("政策回应", 20, ["application"]),
      ]),
      proj("项目：一个社会问题的档案", ["资料收集", "分析报告"]),
      quiz("测验：第 4 单元测验", "限时测验"),
    ]),
    unit("全球化与未来", [
      lec("全球化进程", [
        s("经济全球化", 20, ["definition"]),
        s("文化全球化", 20, ["intuition"]),
        s("反全球化声音", 15, ["definition"]),
      ]),
      lec("数字社会", [
        s("平台与算法", 25, ["application"]),
        s("网络社群", 20, ["intuition"]),
        s("数字鸿沟", 20, ["definition"]),
      ]),
      lec("社会学与未来", [
        s("趋势研判方法", 25, ["derivation"]),
        s("可能的未来", 20, ["advanced"]),
        s("终身学习路径", 15, ["application"]),
      ]),
      proj("项目：未来社会情景推演", ["情景框架搭建", "推演报告与展示"]),
      quiz("测验：结课综合测验", "结课限时测验", 30),
    ]),
  ],
});

const machineLearning = materialize({
  marketplaceId: "c18a2301-3f42-4bfc-9d3b-c34b76d62ea1",
  courseTitle: "机器学习基础",
  courseDescription: "从直觉与数学到真实代码：在动手练习中掌握机器学习的核心方法与主动回忆技巧。",
  targetLearner: "计算机专业学生与希望系统入门机器学习的实践者。",
  tags: ["机器学习", "人工智能", "实战"],
  ticketVariant: 1,
  subject: "computerScience",
  difficulty: "intermediate",
  joinCount: 3410,
  units: [
    unit("机器学习直觉", [
      lec("什么是机器学习", [
        s("从规则到学习", 25, ["intuition"]),
        s("训练与预测", 20, ["definition"]),
        s("误差与泛化", 25, ["intuition", "definition"]),
      ]),
      lec("监督学习", [
        s("回归问题", 25, ["definition", "derivation"]),
        s("分类问题", 25, ["definition"]),
        s("训练集与测试集", 20, ["application"]),
      ]),
      proj("项目：第一个分类器", ["环境与数据准备", "动手训练一个分类器"]),
      quiz("测验：第 1 单元测验", "限时测验"),
    ]),
    unit("模型与优化", [
      lec("线性模型与损失函数", [
        s("最小二乘直觉", 25, ["intuition"]),
        s("损失函数", 25, ["definition", "derivation"]),
        s("梯度下降", 30, ["derivation"]),
      ]),
      lec("过拟合与正则化", [
        s("偏差与方差", 25, ["definition"]),
        s("正则化手段", 25, ["derivation"]),
        s("交叉验证", 20, ["application"]),
      ]),
      proj("项目：调参实战", ["基线模型搭建", "把模型调到不过拟合"]),
      quiz("测验：第 2 单元测验", "限时测验"),
    ]),
    unit("神经网络", [
      lec("神经元与网络结构", [
        s("感知机", 25, ["definition"]),
        s("激活函数", 20, ["definition", "derivation"]),
        s("前向传播", 25, ["derivation"]),
      ]),
      lec("训练神经网络", [
        s("反向传播直觉", 30, ["intuition", "derivation"]),
        s("优化器与学习率", 25, ["application"]),
        s("常见坑", 20, ["advanced"]),
      ]),
      proj("项目：手写数字识别", ["数据与网络搭建", "训练一个小型网络"]),
      quiz("测验：第 3 单元测验", "限时测验"),
    ]),
    unit("应用与前沿", [
      lec("无监督学习与表征", [
        s("聚类", 25, ["intuition", "application"]),
        s("降维", 25, ["derivation"]),
        s("嵌入", 20, ["application"]),
      ]),
      lec("从深度学习到大模型", [
        s("卷积与注意力", 30, ["definition", "derivation"]),
        s("预训练与微调", 25, ["application"]),
        s("负责任的 AI", 15, ["advanced"]),
      ]),
      proj("项目：端到端小作品", ["选题与数据管线", "从数据到演示"]),
      quiz("测验：结课综合测验", "结课限时测验", 30),
    ]),
  ],
});

export const SAMPLE_COURSES: SampleCourse[] = [sociology, machineLearning];

export function getSampleCourse(uuid: string): SampleCourse | undefined {
  return SAMPLE_COURSES.find((c) => c.marketplaceId === uuid);
}

/** 市场列表行:节数/单元数由结构现算,卡片与详情页永远一致。 */
export function sampleMarketRow(course: SampleCourse): Record<string, unknown> {
  const unitCount = course.units.length;
  const sessionCount = course.units.reduce(
    (n, u) => n + u.lectures.reduce((m, l) => m + l.sessions.length, 0),
    0,
  );
  return {
    marketplaceId: course.marketplaceId,
    /* 详情路由以 marketplaceId 兜底解析样例;带上 courseUuid 让前端按真课程拉详情 */
    courseUuid: course.marketplaceId,
    courseTitle: course.courseTitle,
    courseDescription: course.courseDescription,
    targetLearner: course.targetLearner,
    tags: course.tags,
    ticketVariant: course.ticketVariant,
    unitCount,
    sessionCount,
    subject: course.subject,
    difficulty: course.difficulty,
    joinCount: course.joinCount,
  };
}
