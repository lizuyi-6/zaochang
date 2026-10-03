// 2026-10-03 代码审查修复的契约钉(P1 钱两项/路径三项/白板两项 + 关键 P2)。
// 集成套件(suites/11)有活服务才能跑;这里用源码扫描锁住结构性不变量——
// 与 whiteboard-plan-budget/lattice-brand 同一纪律:复发即红。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

test('refund: course-generation failure refunds only the charging request', () => {
  const route = read('app/api/hyperknow/course-generation/route.ts');
  assert.match(route, /if \(charged\) \{\s*await refundCreditCharge\(idempotencyKey \?\? null, member\.email\);/, '失败 catch 必须在实际扣过费(charged)时退费');
  assert.match(route, /from "\.\.\/\.\.\/_lib\/hyperknow\/credits";[\s\S]*?refundCreditCharge/, 'refundCreditCharge 必须被导入并调用');
});

test('refund: credits.ts has refund primitive + refunded-takeover, no dead release, no price-trap ternary', () => {
  const credits = read('app/api/_lib/hyperknow/credits.ts');
  assert.match(credits, /export async function refundCreditCharge\(/, '退费原语必须存在');
  assert.match(credits, /SET status = 'refunded'/, '计费行必须能标记 refunded(同 key 重试免费接管的依据)');
  assert.match(credits, /existing\.status === "refunded"/, '幂等扣费必须处理 refunded 状态的免费接管');
  assert.doesNotMatch(credits, /releaseCreditCharge/, 'releaseCreditCharge(死代码,只删行不退钱)不得回归');
  assert.doesNotMatch(credits, /cost === HK_COURSE_COST \? HK_COURSE_COST : HK_COURSE_COST/, '两分支相同的三元陷阱不得回归');
  assert.doesNotMatch(credits, /@[qq0-9a-zA-Z.]+\.com"\)/, '创始人邮箱不得硬编码在代码里(env 白名单是唯一通道)');
  assert.doesNotMatch(credits, /CREATE TABLE/, '表结构由迁移提供,热路径不得建表');
});

test('refund: translate charges only after upstream first frame (与 /chat 对齐)', () => {
  const route = read('app/api/hyperknow/translate/route.ts');
  const probe = route.indexOf('await generator.next()');
  const charge = route.indexOf('await consumeCredits(');
  assert.ok(probe > 0 && charge > probe, '扣费必须在预取首帧成功之后——否则上游故障白扣 2 分');
  assert.match(route, /void generator\.return\(undefined as never\)/, '402 返回前收掉已启的上游流');
});

test('chat: model history window and storage cap', () => {
  const route = read('app/api/hyperknow/chat/route.ts');
  assert.match(route, /history\.slice\(-40\)/, '发给模型的历史必须有窗口上限');
  assert.match(route, /\.slice\(-200\)/, '落库历史必须有上限');
  assert.match(route, /max: dailyCreditsFor\(member\.email\)/, 'credit 帧的 max 必须按用户套餐而非恒 20');
});

test('llm: empty thinking-only response falls back instead of silent ""', () => {
  const llm = read('app/api/_lib/hyperknow/llm.ts');
  assert.match(llm, /if \(!textOut\.trim\(\)\)/, '空正文必须触发 chat/completions 回退一次');
  assert.match(llm, /404 && i < candidateModels\.length - 1\) \{\s*\/\/ 丢弃前显式取消[\s\S]*?cancel\(\)/, '丢弃 Response 前必须 cancel body');
});

test('protocol: chat-completions SSE tolerates bad frames', () => {
  const protocol = read('app/api/_lib/hyperknow/protocol.ts');
  assert.match(protocol, /let event: ChatCompletionsEvent \| null = null;\s*try \{\s*event = JSON\.parse\(data\)/, 'data 行解析必须 try/catch 跳过坏帧');
});

test('whiteboard: TTS prefetch text must match playback (sanitized) source', () => {
  const prefetch = read('hyperknow-spa/src/lattice/whiteboard/planPrefetch.ts');
  assert.match(prefetch, /\.map\(\(s\) => sanitizeNarration\(s\.spoken_text\)\)/, '预热文本必须先净化——与实播同键,否则含标签旁白永远 miss');
});

test('whiteboard: free-topic timeout path must fail explicitly, never silent demo', () => {
  const page = read('hyperknow-spa/src/lattice/whiteboard/WhiteboardPage.tsx');
  const hits = [...page.matchAll(/if \(!plan && freeTopicMode\) setPlanFailed\(true\);|if \(freeTopicMode\) setPlanFailed\(true\);/g)];
  assert.ok(hits.length >= 2, 'then 空计划分支与 catch 分支都必须无条件(仅 alive 门)置失败——135s 超时 aborted=true 时不得跳过');
  assert.doesNotMatch(page, /freeTopicMode && !ctrl\.signal\.aborted\) setPlanFailed/, '失败判定不得依赖 !aborted');
});

test('create-page: resume button unlocks finishedRef; checkpoint reads topicRef; language split is exact', () => {
  const page = read('hyperknow-spa/src/lattice/pages/CreatePage.tsx');
  assert.match(page, /finishedRef\.current = false;\s*setCancelled\(false\);[\s\S]*?void confirmAndStartStage2\(\);/, '恢复按钮必须先复位 finishedRef,否则守卫直接 return 成死按钮');
  assert.match(page, /topicRef\.current = topic;/, 'topicRef 必须逐渲染同步');
  assert.match(page, /query: topicRef\.current \}/, '检查点必须读 topicRef(卸载闭包拿不到 state)');
  assert.match(page, /const zhCourse = lng === 'zh-CN' \|\| lng === 'zh-TW';/, '课程语言只认中文界面');
  assert.doesNotMatch(page, /startsWith\('en'\)/, '非英语≠中文的旧误分不得回归');
  assert.match(page, /finish\(gen, true\)/, 'Stage2 完成必须标 persisted(集市失效)');
});

test('journey: per-course language preference is real UI (not dead selector)', () => {
  const journey = read('hyperknow-spa/src/lattice/pages/CourseJourney.tsx');
  assert.match(journey, /setCourseLang\(journeyUuid, lang\)/, '加入确认必须落每课语言偏好');
  assert.match(journey, /getCourseLang\(journeyUuid\)/, '预热/备课必须读每课偏好');
  const wb = read('hyperknow-spa/src/lattice/whiteboard/WhiteboardPage.tsx');
  assert.match(wb, /getCourseLang\(state\.activeCourseUuid\)/, '白板备课语言必须先取每课偏好');
});

test('spa: veil snapshot merge + locale failure retry', () => {
  const app = read('hyperknow-spa/src/App.tsx');
  assert.match(app, /applyState\(\{ \.\.\.stateRef\.current, \.\.\.patch \}\);/, 'veil 延迟提交必须以最新 state 为底,仅重放 patch');
  const i18n = read('hyperknow-spa/src/lattice/i18n/index.tsx');
  assert.match(i18n, /delete localePending\[code\];/, 'locale 加载失败必须清挂起记录(可重试)');
  assert.match(i18n, /\.catch\(\(\) => \{\s*toast\(/, 'setLng 失败必须给用户反馈');
});
