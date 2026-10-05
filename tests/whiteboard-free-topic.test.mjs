import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* 自由讲座(直进 #/whiteboard 无课程上下文)契约:
 * 旧行为是静默播放录课的公开演讲演示课——教学提示词怎么改白板都不变,
 * 学员看到的就是这条路径。现在直进白板必须走"学员命题 → AI 实时备课"链路,
 * 与课程讲次同一个 planLectureLive 端点。以下锁死这条链路的结构性事实,
 * 防将来任何重构悄悄把演示课塞回默认路径。 */

const app = readFileSync(new URL("../hyperknow-spa/src/App.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../hyperknow-spa/src/lattice/whiteboard/WhiteboardPage.tsx", import.meta.url), "utf8");
const popups = readFileSync(new URL("../hyperknow-spa/src/lattice/whiteboard/Popups.tsx", import.meta.url), "utf8");

test("深链:#/whiteboard?topic= 注入 activeTopic,进页即 AI 备课", () => {
  assert.match(app, /case '\/whiteboard'[\s\S]*?q\.get\('topic'\)/, "whiteboard 路由必须解析 ?topic=");
  assert.match(app, /activeTopic:\s*topic/, "?topic= 必须落入 activeTopic");
});

test("深链回写:自由讲座话题写进 hash,刷新/分享不丢命题", () => {
  assert.match(app, /encodeURIComponent\(s\.activeTopic\)/, "hashFor 必须回写自由话题");
  // 课程讲次不得带 topic 参数(身份由课程上下文锁定)
  assert.match(app, /!s\.activeCourseUuid && s\.activeTopic/, "只有无课程上下文才回写 topic");
});

test("命题采集:无课程上下文时 IntroOverlay 收话题,不再静默播演示课", () => {
  assert.match(page, /freeTopicMode = !GEN && !state\.activeCourseUuid/, "自由讲座判定必须是无课程树且无课程 UUID");
  assert.match(page, /freeTopic=\{/, "WhiteboardPage 必须向 IntroOverlay 传自由命题 props");
  assert.match(popups, /wb-topic-input/, "IntroOverlay 必须渲染话题输入框");
  assert.match(popups, /freeTopic\.onCommit/, "命题必须经 onCommit 提交进备课链路");
});

test("失败诚实:备课失败显式重试,绝不拿话题对不上的演示课冒充", () => {
  /* 失败判定不得依赖 !aborted:135s 客户端超时掐死时 aborted=true,若跳过置失败,
   * 简介页会放出"开始学习"并播话题对不上的演示课(2026-10-03 代码审查修)。 */
  assert.match(page, /if \(!plan && freeTopicMode\) setPlanFailed\(true\)/,
    "自由讲座计划落空必须置失败态,含超时路径(课程模式维持静默演示双轨)");
  assert.match(popups, /freeTopic\?\.failed/, "IntroOverlay 必须区分失败态");
  assert.match(popups, /onRetry/, "失败态必须给出重试出口");
});

test("降级再挣:模板降级计划(老套路观感来源)在自由讲座里必须重取一次真实生成", () => {
  assert.match(page, /plan\?\.degraded && freeTopicMode[\s\S]*?requestWithBudget/,
    "degraded 计划在自由讲座里必须再调一次 planLectureLive");
});

test("演示课不消灭:只作明确选择的兜底出口(匿名体验/备课屡败)", () => {
  assert.match(popups, /freeTopic\.onDemo/, "intro 必须保留显式'看演示课'出口");
  assert.match(popups, /onSignIn/, "匿名学员必须给登录引导(plan 端点要会员)");
});

const agents = readFileSync(new URL("../app/api/_lib/hyperknow/agents.ts", import.meta.url), "utf8");

test("幻影承接:无课程上下文时讲师提示显式声明独立讲次(没有上一讲)", () => {
  assert.match(agents, /STANDALONE lecture/, "自由讲座必须有 STANDALONE 上下文声明");
  assert.match(agents, /NO previous lecture and NO next lecture/, "必须明令禁止引用前后讲次");
});

test("备课页文案:介绍正文跟话题走,不落回演示课修辞三角文案", () => {
  assert.match(page, /genIntroBody = targetTopic\s*\?/, "genIntroBody 必须以 targetTopic 为条件(覆盖自由命题)");
});
