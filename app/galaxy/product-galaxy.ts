import type { GalaxyId, PlanetId } from "./cosmic-atlas";

export type ProductStatus = "正式上线" | "公测阶段" | "内测阶段" | "开发中" | "概念验证" | "即将发布" | "暂停维护" | "已归档";

export type GalaxyBusiness = {
  id: GalaxyId;
  worldName: string;
  businessName: string;
  englishName: string;
  positioning: string;
  state: string;
};

export type GalaxyProduct = {
  planetId: PlanetId;
  name: string;
  codeName: string;
  tagline: string;
  description: string;
  status: ProductStatus;
  version: string;
  launchedAt: string;
  audience: string;
  capabilities: string[];
  scenarios: string[];
  actionLabel: string;
  actionHref: string;
  nextMilestone: string;
  satellites: string[];
};

export const STATUS_ORDER: ProductStatus[] = [
  "正式上线",
  "公测阶段",
  "内测阶段",
  "开发中",
  "概念验证",
  "即将发布",
  "暂停维护",
  "已归档",
];

export const GALAXY_BUSINESS: Record<GalaxyId, GalaxyBusiness> = {
  origo: {
    id: "origo",
    worldName: "ORIGO 起源星系",
    businessName: "AI 原生应用与智能服务",
    englishName: "AI NATIVE PRODUCTS",
    positioning: "让模型从回答问题，走向参与真实工作与创造。",
    state: "核心业务",
  },
  mnemora: {
    id: "mnemora",
    worldName: "MNEMORA 忆潮星系",
    businessName: "智能硬件与空间交互",
    englishName: "INTELLIGENT ENVIRONMENTS",
    positioning: "连接空间、感知与人的行为，让计算自然进入现场。",
    state: "成长业务",
  },
  miralume: {
    id: "miralume",
    worldName: "MIRALUME 镜梦星系",
    businessName: "开发者工具与数字基础设施",
    englishName: "DEVELOPER INFRASTRUCTURE",
    positioning: "为独立开发者和小团队提供更短的产品实现路径。",
    state: "开放生态",
  },
  antevera: {
    id: "antevera",
    worldName: "ANTEVERA 未至星系",
    businessName: "社区生态与实验创新",
    englishName: "COMMUNITY & VENTURES",
    positioning: "让尚未成熟的想法获得用户、伙伴与成长轨道。",
    state: "孵化前沿",
  },
};

export const GALAXY_PRODUCTS: GalaxyProduct[] = [
  {
    planetId: "aurelia",
    name: "造境 AI Studio",
    codeName: "AURELIA",
    tagline: "把一个模糊想法，推进到可以被体验的产品原型。",
    description: "面向产品团队与独立创作者的 AI 原生产品工作台，从需求澄清、体验结构到可交互原型形成连续工作流。",
    status: "概念验证",
    version: "Concept 0.2",
    launchedAt: "待验证",
    audience: "产品经理、创始人与独立开发者",
    capabilities: ["需求澄清", "交互原型", "产品评审"],
    scenarios: ["新产品验证", "内部创新", "客户方案演示"],
    actionLabel: "申请共创",
    actionHref: "/galaxy/apply?product=aurelia",
    nextMilestone: "团队实时共创",
    satellites: ["需求罗盘", "原型工坊", "评审记录"],
  },
  {
    planetId: "nyx",
    name: "共识 Agent",
    codeName: "NYX",
    tagline: "让分散的信息、判断与争议，形成可执行的团队共识。",
    description: "以会议、文档与项目上下文为输入，持续整理决策依据、未决问题和责任边界。",
    status: "概念验证",
    version: "v0.9 Beta",
    launchedAt: "2026.06",
    audience: "跨职能产品团队",
    capabilities: ["决策追踪", "分歧聚类", "行动提取"],
    scenarios: ["产品评审", "项目复盘", "远程协作"],
    actionLabel: "申请测试",
    actionHref: "/galaxy/apply?product=nyx",
    nextMilestone: "开放 300 个测试席位",
    satellites: ["会议监听", "决策账本", "异议雷达"],
  },
  {
    planetId: "caelum",
    name: "远见模拟器",
    codeName: "CAELUM",
    tagline: "在投入开发之前，先看见不同产品选择可能带来的后果。",
    description: "将用户、市场与运营假设组织成可调整的产品情景，帮助团队比较路线，而不是预测唯一未来。",
    status: "概念验证",
    version: "v0.6 Alpha",
    launchedAt: "2026.08",
    audience: "战略、产品与增长负责人",
    capabilities: ["情景建模", "假设对比", "风险提示"],
    scenarios: ["路线规划", "定价实验", "增长策略"],
    actionLabel: "加入候补",
    actionHref: "/galaxy/apply?product=caelum",
    nextMilestone: "首轮行业模型校准",
    satellites: ["变量舱", "分支时间线", "证据库"],
  },
  {
    planetId: "solenne",
    name: "光域交互屏",
    codeName: "SOLENNE",
    tagline: "让空间中的信息不再是一块屏幕，而是一种回应。",
    description: "结合低功耗显示、空间感知和内容编排，为展陈、零售与公共空间提供克制的智能界面。",
    status: "概念验证",
    version: "Pilot 03",
    launchedAt: "2026.05",
    audience: "展陈、零售与空间运营团队",
    capabilities: ["空间感知", "内容编排", "低功耗显示"],
    scenarios: ["展览导览", "品牌空间", "公共信息"],
    actionLabel: "预约演示",
    actionHref: "/galaxy/apply?product=solenne",
    nextMilestone: "杭州三处示范空间",
    satellites: ["光感模块", "内容中枢", "场域分析"],
  },
  {
    planetId: "talaman",
    name: "场域感知节点",
    codeName: "TALAMAN",
    tagline: "用更少的数据，理解一个真实空间正在发生什么。",
    description: "面向园区和小型工业现场的边缘感知设备，在本地完成事件识别与隐私脱敏。",
    status: "开发中",
    version: "EVT-2",
    launchedAt: "2026 Q4",
    audience: "园区、制造与设施团队",
    capabilities: ["边缘识别", "隐私脱敏", "事件联动"],
    scenarios: ["设备巡检", "空间利用", "异常提醒"],
    actionLabel: "商务合作",
    actionHref: "/galaxy/apply?product=talaman",
    nextMilestone: "完成 1000 小时现场测试",
    satellites: ["感知核", "边缘网关", "事件协议"],
  },
  {
    planetId: "merivel",
    name: "环境叙事音箱",
    codeName: "MERIVEL",
    tagline: "声音不打断空间，只让空间被更细致地感受。",
    description: "根据时间、天气和人的停留方式生成连续声景，为居住、疗愈与文化空间提供环境叙事。",
    status: "概念验证",
    version: "POC-1",
    launchedAt: "待定",
    audience: "文化空间、酒店与个人用户",
    capabilities: ["生成声景", "环境响应", "空间校音"],
    scenarios: ["沉浸展览", "疗愈空间", "居住环境"],
    actionLabel: "关注进展",
    actionHref: "/feed",
    nextMilestone: "完成首台工程样机",
    satellites: ["天气采样", "声景引擎", "空间校准"],
  },
  {
    planetId: "eidora",
    name: "界面镜像实验室",
    codeName: "EIDORA",
    tagline: "在写下实现之前，先把复杂交互变成可以讨论的界面。",
    description: "连接设计系统、真实数据和前端代码的界面实验环境，面向高复杂度工具与工作流产品。",
    status: "概念验证",
    version: "Concept 0.1",
    launchedAt: "待验证",
    audience: "设计师与前端工程团队",
    capabilities: ["设计系统同步", "数据态预演", "代码导出"],
    scenarios: ["复杂后台", "AI 工作台", "设计评审"],
    actionLabel: "申请共创",
    actionHref: "/galaxy/apply?product=eidora",
    nextMilestone: "开放插件协议",
    satellites: ["Token 桥", "状态剧场", "组件探针"],
  },
  {
    planetId: "neravia",
    name: "潮汐数据流",
    codeName: "NERAVIA",
    tagline: "把产品中的实时事件，变成团队可以理解和使用的信号。",
    description: "轻量事件采集与流式规则引擎，服务实时体验、实验分析和产品内自动化。",
    status: "开发中",
    version: "v0.7",
    launchedAt: "2026.09",
    audience: "开发者与数据产品团队",
    capabilities: ["事件采集", "流式规则", "实时看板"],
    scenarios: ["产品分析", "体验触发", "实时运营"],
    actionLabel: "查看文档",
    actionHref: "/galaxy/apply?product=neravia",
    nextMilestone: "SDK 覆盖 Web 与小程序",
    satellites: ["采集 SDK", "规则河道", "信号台"],
  },
  {
    planetId: "arbor-null",
    name: "空枝组件森林",
    codeName: "ARBOR NULL",
    tagline: "把团队真正用过的基础能力，开放成可以继续生长的公共组件。",
    description: "一套面向 AI 产品的开源交互组件、无障碍模式与工程模板，由社区共同维护。",
    status: "概念验证",
    version: "Concept 0.1",
    launchedAt: "待验证",
    audience: "开源开发者与产品工程团队",
    capabilities: ["AI 交互组件", "无障碍模式", "工程模板"],
    scenarios: ["快速启动", "设计统一", "开源共建"],
    actionLabel: "申请共建",
    actionHref: "/galaxy/apply?product=arbor-null",
    nextMilestone: "发布多模态交互套件",
    satellites: ["组件苗圃", "模式标本", "贡献者站"],
  },
  {
    planetId: "novaia",
    name: "造场社区",
    codeName: "NOVAIA",
    tagline: "让每个小想法，从一个可以被试玩的版本开始。",
    description: "连接创作者、体验者和支持者的产品社区，作品可以被体验、讨论、支持并持续更新。",
    status: "正式上线",
    version: "v1.7",
    launchedAt: "2026.01",
    audience: "独立创作者与早期体验者",
    capabilities: ["作品发布", "真实反馈", "创作支持"],
    scenarios: ["早期验证", "用户共创", "作品成长"],
    actionLabel: "进入社区",
    actionHref: "/",
    nextMilestone: "创作者成长计划",
    satellites: ["试玩场", "果子钱包", "共创圈"],
  },
  {
    planetId: "peregris",
    name: "共创实验室",
    codeName: "PEREGRIS",
    tagline: "为跨团队、跨学科的产品实验，建立一段共同航程。",
    description: "围绕真实命题组织短周期共创，让技术、设计、内容与业务伙伴形成可交付的联合原型。",
    status: "即将发布",
    version: "Preview",
    launchedAt: "2026 Q3",
    audience: "创业团队、企业创新与研究者",
    capabilities: ["命题招募", "团队匹配", "联合原型"],
    scenarios: ["企业创新", "联合研发", "公共议题"],
    actionLabel: "加入候补",
    actionHref: "/galaxy/apply?product=peregris",
    nextMilestone: "首期命题开放报名",
    satellites: ["命题台", "伙伴信标", "共创舱"],
  },
  {
    planetId: "chronara",
    name: "产品孵化器",
    codeName: "CHRONARA",
    tagline: "让一个尚未形成的项目，获得清晰的下一步和持续成长轨道。",
    description: "面向开发者、创业团队和创新项目的分阶段孵化系统，连接产品定位、原型、开发、测试与发布。",
    status: "公测阶段",
    version: "Pilot 02",
    launchedAt: "2026.07",
    audience: "开发者、创业团队与创新项目",
    capabilities: ["阶段管理", "任务协同", "资料与反馈"],
    scenarios: ["项目孵化", "产品共建", "上线准备"],
    actionLabel: "申请加入",
    actionHref: "/galaxy/apply",
    nextMilestone: "开放首批 30 个项目",
    satellites: ["阶段轨道", "任务信标", "资料站"],
  },
];

export const PRODUCT_BY_PLANET = Object.fromEntries(
  GALAXY_PRODUCTS.map((product) => [product.planetId, product]),
) as Record<PlanetId, GalaxyProduct>;

export const STATUS_SUMMARY = STATUS_ORDER.map((status) => ({
  status,
  count: GALAXY_PRODUCTS.filter((product) => product.status === status).length,
})).filter((item) => item.count > 0);

export const COMPANY_CORE = {
  name: "杭州视界奇点科技有限公司",
  shortName: "造场",
  mission: "让值得存在的产品，更早获得形状、用户与成长的机会。",
  direction: "AI 原生应用、智能空间、开发者基础设施、开放创新生态",
  phase: "产品生态扩张期",
  productCount: GALAXY_PRODUCTS.length,
  galaxyCount: Object.keys(GALAXY_BUSINESS).length,
  incubatingCount: GALAXY_PRODUCTS.filter((product) => ["内测阶段", "开发中", "概念验证", "即将发布"].includes(product.status)).length,
};
