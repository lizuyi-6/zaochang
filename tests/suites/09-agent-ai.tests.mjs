// Agent 通道·阅读 AI·dev-login:自 tests/rendered-html.test.mjs 保序拆分(测试体逐字未改)。
// 执行顺序由 tests/rendered-html.test.mjs 的注册顺序保证。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { renderMarkdownKatexHtml } from "../../app/lib/markdown-katex.ts";
import { DEV_LOGIN_DEFAULT_EMAIL, localDevLoginEnabled, normalizeDevLoginEmail } from "../../app/api/_lib/dev-login-gate.ts";
import { READING_AI_ACTION_LIMITS, READING_AI_LIMITS, READING_AI_REASONING_HEADROOM, buildAskPrompt, detectTargetLang, parseReadingAiImage, resolveReadingAiConfig } from "../../app/api/_lib/reading-ai-prompts.ts";
import {
  baseUrl,
  runId,
  adminEmail,
  lastChatCompletion,
  aiUpstreamCount,
  resetAiUpstream,
  authHeaders,
  executeLocalD1,
  queryLocalD1,
  readSse,
} from "../harness/preview.mjs";

export function register() {
test("agent service account: token auth, read + content-write scope, fail-closed on the rest", async () => {
  const runId = crypto.randomUUID();
  const tag = runId.slice(0, 8);
  const agentAuth = { authorization: "Bearer test-agent-key" };
  const agentJson = { ...agentAuth, "content-type": "application/json", accept: "application/json" };


  // 1) 无 token / 错 token = 普通匿名(agent 路径完全不激活)
  const noToken = await (await fetch(`${baseUrl}/api/community`)).json();
  assert.equal(noToken.signedIn, false, "无 token 应为匿名");
  const wrongToken = await (await fetch(`${baseUrl}/api/community`, { headers: { authorization: "Bearer wrong-key", accept: "application/json" } })).json();
  assert.equal(wrongToken.signedIn, false, "错 token 不应识别为 agent");

  // 2) Agent GET /api/community → 已认证、非 founder、无钱包、member_number=0
  const agentComm = await (await fetch(`${baseUrl}/api/community`, { headers: { ...agentAuth, accept: "application/json" } })).json();
  assert.equal(agentComm.signedIn, true, "agent token 应认证通过");
  assert.equal(agentComm.isFounder, false, "agent 不继承 founder");
  assert.equal(agentComm.profile?.memberNumber, 0, "agent member_number 应为 0(不占序列)");
  assert.equal(agentComm.wallet, null, "agent 不应有钱包");
  const agentWallet = await queryLocalD1(`SELECT COUNT(*) AS n FROM wallets WHERE user_email = 'agent@zaochang'`);
  assert.equal(agentWallet[0].n, 0, "agent 不应建钱包行");
  const agentColl = await queryLocalD1(`SELECT COUNT(*) AS n FROM collections WHERE user_email = 'agent@zaochang'`);
  assert.equal(agentColl[0].n, 0, "agent 不应建收藏");

  // 3) Agent GET /api/docs → 200(requireDocEditor 放行 agent 读管理列表)
  const docsList = await fetch(`${baseUrl}/api/docs`, { headers: { ...agentAuth, accept: "application/json" } });
  assert.equal(docsList.status, 200, "agent 应能列出 docs");

  // 4) Agent POST /api/docs → 201,author_email=agent@zaochang(行为层字段断言)
  const docSlug = `agent-${tag}`;
  const createDoc = await fetch(`${baseUrl}/api/docs`, {
    method: "POST", headers: agentJson,
    body: JSON.stringify({ title: `Agent 书${tag}`, slug: docSlug, bodyMd: "agent 创建", visibility: "public", isBook: true, coverHue: 200 }),
  });
  assert.equal(createDoc.status, 201, "agent 应能创建 doc");
  const docId = (await createDoc.json()).doc.id;
  const docRow = await queryLocalD1(`SELECT author_email AS a, visibility AS v FROM docs WHERE id = '${docId}'`);
  assert.equal(docRow[0].a, "agent@zaochang", "author_email 应为 agent");
  assert.equal(docRow[0].v, "public");

  // 5) Agent PATCH /api/docs → 200 + 正文更新(行为层字段断言)
  const patchDoc = await fetch(`${baseUrl}/api/docs`, {
    method: "PATCH", headers: agentJson,
    body: JSON.stringify({ id: docId, bodyMd: "agent 编辑后" }),
  });
  assert.equal(patchDoc.status, 200, "agent 应能编辑 doc");
  const edited = await queryLocalD1(`SELECT body_md AS b FROM docs WHERE id = '${docId}'`);
  assert.equal(edited[0].b, "agent 编辑后");


  // 6) Agent DELETE /api/docs → 403(worker scope 闸拦,DELETE 不在能力表)+ doc 仍在
  const delDoc = await fetch(`${baseUrl}/api/docs`, {
    method: "DELETE", headers: agentJson,
    body: JSON.stringify({ id: docId }),
  });
  assert.equal(delDoc.status, 403, "agent 不应删除 doc");
  const stillExists = await queryLocalD1(`SELECT COUNT(*) AS n FROM docs WHERE id = '${docId}'`);
  assert.equal(stillExists[0].n, 1, "DELETE 被拦后 doc 应仍存在");

  // 7) Agent POST /api/docs/cover → 403(pathname /api/docs/cover 不精确匹配 /api/docs)
  const coverAttempt = await fetch(`${baseUrl}/api/docs/cover`, {
    method: "POST", headers: agentJson,
    body: JSON.stringify({ id: docId }),
  });
  assert.equal(coverAttempt.status, 403, "agent 不应碰封面上传");

  // 8) Agent POST /api/products → 201,owner=agent@zaochang,review_status=pending_review(review gate 照常)
  //    此步紧跟 step 6/7 的闸拒绝(403 早返回):验证 scope 闸在拒绝时已排空请求体——
  //    否则未消费字节会污染 keep-alive 连接,本步会被错误组帧导致 503 "worker restarted"。
  const createProduct = await fetch(`${baseUrl}/api/products`, {
    method: "POST", headers: agentJson,
    body: JSON.stringify({ title: `Agent 作品${tag}`, description: "这是一个由 agent 自动创建的测试作品,用于验证 scope 闸与 review gate。", category: "效率工具", pricingModel: "free", coverTheme: "ink" }),
  });
  assert.equal(createProduct.status, 201, "agent 应能创建产品");
  const productId = (await createProduct.json()).product.id;
  const prodRow = await queryLocalD1(`SELECT owner_email AS o, review_status AS r FROM products WHERE id = ${productId}`);
  assert.equal(prodRow[0].o, "agent@zaochang", "owner 应为 agent");
  assert.equal(prodRow[0].r, "pending_review", "agent 产品仍走 review gate");

  // 9) Agent POST /api/reading-progress → 403(不在能力表)+ 不落库
  const progressAttempt = await fetch(`${baseUrl}/api/reading-progress`, {
    method: "POST", headers: agentJson,
    body: JSON.stringify({ bookId: docId, chapterId: docId, paragraph: 0 }),
  });
  assert.equal(progressAttempt.status, 403, "agent 不应写 reading-progress");
  const rpRow = await queryLocalD1(`SELECT COUNT(*) AS n FROM reading_progress WHERE user_email = 'agent@zaochang'`);
  assert.equal(rpRow[0].n, 0, "reading-progress 不应落库");

  // 10) Agent GET /api/admin/incubation → 403(requireAdmin 拒绝 agent)
  const adminAttempt = await fetch(`${baseUrl}/api/admin/incubation`, { headers: { ...agentAuth, accept: "application/json" } });
  assert.equal(adminAttempt.status, 403, "agent 不应访问 admin");

  // 清理:agent 创建的 doc/product + agent 系统行(子表先于父表,FK 约束)
  await executeLocalD1(`DELETE FROM docs WHERE id = '${docId}'; DELETE FROM products WHERE id = ${productId}; DELETE FROM members WHERE email = 'agent@zaochang'`);
});


// —— 阅读页「问 AI」:纯逻辑单元测试(直接导入零依赖模块,不经 worker 运行时) ——

test("reading-ai config: resolves only with all three vars, enforces https/loopback", () => {
  const full = { AI_CHAT_BASE_URL: "https://api.deepseek.com/v1/", AI_CHAT_API_KEY: "k", AI_CHAT_MODEL: "m" };
  assert.equal(resolveReadingAiConfig({}), null, "空配置应返回 null(fail-closed)");
  assert.equal(resolveReadingAiConfig({ AI_CHAT_API_KEY: "k", AI_CHAT_MODEL: "m" }), null, "缺 BASE_URL 应 null");
  assert.equal(resolveReadingAiConfig({ AI_CHAT_BASE_URL: "https://x/v1", AI_CHAT_MODEL: "m" }), null, "缺 API_KEY 应 null");
  assert.equal(resolveReadingAiConfig({ AI_CHAT_BASE_URL: "https://x/v1", AI_CHAT_API_KEY: "k" }), null, "缺 MODEL 应 null");
  const resolved = resolveReadingAiConfig(full);
  assert.ok(resolved, "三变量齐备应非 null");
  assert.equal(resolved.baseUrl, "https://api.deepseek.com/v1", "尾部斜杠应剥离");
  assert.equal(resolved.expertModel, "m", "未配专家模型时 expertModel 应回落默认模型");
  assert.equal(resolved.expertTransport, "chat", "传输缺省应为 chat");
  assert.equal(
    resolveReadingAiConfig({ ...full, AI_CHAT_EXPERT_TRANSPORT: "messages" }).expertTransport,
    "messages",
    "显式 messages 应解析为 messages 传输",
  );
  assert.equal(
    resolveReadingAiConfig({ ...full, AI_CHAT_EXPERT_TRANSPORT: "carrier-pigeon" }).expertTransport,
    "chat",
    "非法传输值应回落 chat(fail-closed 方向)",
  );
  assert.equal(
    resolveReadingAiConfig({ ...full, AI_CHAT_MODEL_EXPERT: " expert-m " }).expertModel,
    "expert-m",
    "专家模型应独立解析并 trim",
  );
  assert.equal(resolveReadingAiConfig({ ...full, AI_CHAT_MODEL_EXPERT: "  " }).expertModel, "m", "空白专家模型视为未配置");
  assert.deepEqual(
    resolveReadingAiConfig({ ...full, AI_CHAT_BASE_URL: "http://127.0.0.1:1234/v1" }),
    { baseUrl: "http://127.0.0.1:1234/v1", apiKey: "k", model: "m", expertModel: "m", expertTransport: "chat", vision: false },
    "http+loopback 应允许(本地假上游)",
  );
  // 多模态开关:缺省/非 "1" → false(fail-closed);仅 "1" 开启
  assert.equal(resolveReadingAiConfig(full).vision, false, "缺省 AI_CHAT_VISION 应关闭");
  assert.equal(resolveReadingAiConfig({ ...full, AI_CHAT_VISION: "1" }).vision, true, "AI_CHAT_VISION=1 应开启 vision");
  assert.equal(resolveReadingAiConfig({ ...full, AI_CHAT_VISION: "true" }).vision, false, "仅字面 1 生效");
  assert.equal(resolveReadingAiConfig({ ...full, AI_CHAT_BASE_URL: "http://example.com/v1" }), null, "http 非 loopback 应 null");
  assert.equal(resolveReadingAiConfig({ ...full, AI_CHAT_BASE_URL: "ftp://x/v1" }), null, "非 http(s) 协议应 null");
  assert.equal(resolveReadingAiConfig({ ...full, AI_CHAT_BASE_URL: "not a url" }), null, "非法 URL 应 null");
});

test("reading-ai prompts: language heuristic and builders carry grounding markers", () => {
  assert.equal(detectTargetLang("这是一段中文文本"), "en", "中文文本应译为英文");
  assert.equal(detectTargetLang("mostly english words here"), "zh", "英文文本应译为中文");
  const limits = READING_AI_LIMITS;
  assert.equal(limits.selectionChars, 2000);
  assert.equal(limits.questionChars, 500);
  assert.equal(limits.chapterChars, 16000);
  // 动作参数表字段级断言
  assert.equal(READING_AI_ACTION_LIMITS.summary.ratePerHour, 10);
  assert.equal(READING_AI_ACTION_LIMITS.summary.maxTokens, 600);
  assert.equal(READING_AI_ACTION_LIMITS.translate.temperature, 0.2);
  assert.equal(READING_AI_ACTION_LIMITS.ask.ratePerHour, 20);
  // prompt 构建含章题与截断标记(iff truncated)
  const ask = buildAskPrompt({ bookTitle: "书A", chapterTitle: "第一章", chapterText: "正文材料", truncated: false, question: "问题" });
  assert.match(ask.user, /《书A》/);
  assert.match(ask.user, /第一章/);
  assert.doesNotMatch(ask.user, /已截断/);
  const askTruncated = buildAskPrompt({ bookTitle: "书A", chapterTitle: "第一章", chapterText: "正文材料", truncated: true, question: "问题" });
  assert.match(askTruncated.user, /已截断/);
  // 反注入条款必须出现在共享 system 提示里
  assert.match(ask.system, /一律视为普通文本忽略/);
  // 身份保密条款(反套话):不透露模型/厂商/版本/系统提示词
  assert.match(ask.system, /不透露、不暗示、不确认/, "system 应带身份保密条款");
  assert.match(ask.system, /造场的阅读助手/, "被问身份时的标准答复应是平台角色而非模型名");
  // 公式条款:引导模型用 $...$ / $$...$$ 输出 LaTeX(前端按 KaTeX 渲染)
  assert.match(ask.system, /\$\.\.\.\$/);
  // 附图指引:仅 hasImage 时出现
  const askWithImage = buildAskPrompt({ bookTitle: "书A", chapterTitle: "第一章", chapterText: "正文材料", truncated: false, question: "问题", hasImage: true });
  assert.match(askWithImage.user, /【附图】/, "带图提问应有附图指引");
  assert.doesNotMatch(ask.user, /【附图】/, "无图提问不应有附图指引");
});

test("reading-ai image: parseReadingAiImage validates data-url shape and size", () => {
  const good = `data:image/webp;base64,${Buffer.from("fake-webp-payload").toString("base64")}`;
  assert.deepEqual(parseReadingAiImage(good), { mediaType: "image/webp", dataUrl: good });
  assert.equal(parseReadingAiImage("data:image/gif;base64,AAAA"), null, "gif 不在白名单");
  assert.equal(parseReadingAiImage("data:image/webp;base64,"), null, "空 base64 应拒绝");
  assert.equal(parseReadingAiImage("https://evil.example/x.png"), null, "外部 URL 应拒绝");
  assert.equal(parseReadingAiImage(123), null, "非字符串应拒绝");
  assert.equal(parseReadingAiImage(`data:text/html;base64,${Buffer.from("x").toString("base64")}`), null, "非图片 mime 应拒绝");
  const oversized = `data:image/png;base64,${Buffer.alloc(READING_AI_LIMITS.imageBytes + 1).toString("base64")}`;
  assert.equal(parseReadingAiImage(oversized), null, "超 4 MiB 解码上限应拒绝");
  const atLimit = `data:image/png;base64,${Buffer.alloc(READING_AI_LIMITS.imageBytes).toString("base64")}`;
  assert.ok(parseReadingAiImage(atLimit), "恰好等于上限应放行");
});

test("reading-ai render: markdown + KaTeX pipeline renders formulas and sanitizes", () => {
  const html = renderMarkdownKatexHtml("主频公式 $f = \\frac{1}{T_{\\text{clk}}}$ 与 **加粗术语** 说明");
  assert.match(html, /class="katex"/, "行内公式应渲染为 KaTeX 结构");
  assert.match(html, /<strong>加粗术语<\/strong>/, "粗体应渲染为 <strong>");
  assert.doesNotMatch(html, /\$f = /, "公式分隔符不应裸露");
  const block = renderMarkdownKatexHtml("$$\nT_{CPU} = N \\times CPI\n$$");
  assert.match(block, /katex-block/, "块级公式应有 katex-block 容器");
  // XSS 面:行内 HTML/脚本/坏协议一律剥掉
  const evil = renderMarkdownKatexHtml('<img src=x onerror="alert(1)"> [点我](javascript:alert(2)) <script>alert(3)</script>');
  assert.doesNotMatch(evil, /onerror/, "事件属性应被 sanitize 剥掉");
  assert.doesNotMatch(evil, /javascript:/, "javascript: 协议应被剥掉");
  assert.doesNotMatch(evil, /<script>/, "script 标签应被剥掉");
});


// —— 阅读页「问 AI」:集成测试(fail-closed 门禁、服务端解析章节、clamp、SSE 流式) ——

test("reading-ai: fail-closed gating, server-side chapter resolution, clamps, SSE streaming", async () => {
  const runTag = crypto.randomUUID();
  const tag = runTag.slice(0, 8);
  const bookId = `doc:${runTag}-aibook`;
  const partId = `doc:${runTag}-aipart`;
  const chapId = `doc:${runTag}-aichap`;
  const memBookId = `doc:${runTag}-aimem`;
  const memChapId = `doc:${runTag}-aimemchap`;
  const aiReaderEmail = `ai-reader-${runTag}@example.com`;
  const longTail = "尾段越界标记-不应出现";
  const selection3000 = Array.from({ length: 3000 }, (_, i) => String.fromCharCode(0x4e00 + (i % 3000))).join("");
  await executeLocalD1(`
    INSERT OR IGNORE INTO members (email, display_name) VALUES ('${adminEmail}', 'AI管理员');
    INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary, cover_image, banner_image) VALUES
      ('${bookId}', 'aibook-${tag}', NULL, 'AI测试书${tag}', '封面', 'public', '${adminEmail}', 1, 1, 210, '', '', ''),
      ('${partId}', 'part-1', '${bookId}', '第一部分', '', 'public', '${adminEmail}', 1, 0, 210, '', '', ''),
      ('${chapId}', 'chap-1', '${partId}', '第一章', '${`正文开头。阅读AI哨兵段落。${"填充内容。".repeat(40)}${longTail}`.replace(/'/g, "''")}', 'public', '${adminEmail}', 1, 0, 210, '', '', ''),
      ('${memBookId}', 'aimem-${tag}', NULL, '内部AI书${tag}', '封面', 'members', '${adminEmail}', 2, 1, 120, '', '', ''),
      ('${memChapId}', 'memchap-1', '${memBookId}', '内部章', '内部正文', 'members', '${adminEmail}', 1, 0, 120, '', '', '')
  `);
  try {
    const post = (headers, payload) => fetch(`${baseUrl}/api/ai/reading`, {
      method: "POST",
      headers: headers ?? authHeaders("AI读者", aiReaderEmail),
      body: JSON.stringify(payload),
    });

    // 1) 匿名合法载荷 → 401 + auth_required,且上游零调用
    resetAiUpstream();
    const anon = await post({ accept: "application/json", "content-type": "application/json" }, { action: "explain", bookSlug: `aibook-${tag}`, path: ["part-1", "chap-1"], selection: "选中文本" });
    assert.equal(anon.status, 401);
    assert.equal(((await anon.json()).error), "auth_required");
    assert.equal(aiUpstreamCount, 0, "匿名请求不应触达上游");

    // 2) 非法 action → 400 invalid_action;上游不变
    const badAction = await post(null, { action: "poem", bookSlug: `aibook-${tag}`, path: ["part-1", "chap-1"], selection: "文本" });
    assert.equal(badAction.status, 400);
    assert.equal(((await badAction.json()).error), "invalid_action");
    assert.equal(aiUpstreamCount, 0);

    // 3) path 为空(封面语义)→ 400 chapter_required
    const noPath = await post(null, { action: "summary", bookSlug: `aibook-${tag}`, path: [] });
    assert.equal(noPath.status, 400);
    assert.equal(((await noPath.json()).error), "chapter_required");

    // 4) 跨书路径(A 书 slug + B 书章 slug)→ 404 fail-closed;上游不变
    const cross = await post(null, { action: "explain", bookSlug: `aibook-${tag}`, path: ["memchap-1"], selection: "文本" });
    assert.equal(cross.status, 404);
    assert.equal(((await cross.json()).error), "target_not_found");
    assert.equal(aiUpstreamCount, 0);

    // 5) members 章:匿名 401(鉴权先于解析,同 reading-progress 语义);authed 200;
    //    已登录用户请求不存在的章节 slug → 404(findInBook fail-closed,不泄露存在性)
    const memAnon = await post({ accept: "application/json", "content-type": "application/json" }, { action: "explain", bookSlug: `aimem-${tag}`, path: ["memchap-1"], selection: "文本" });
    assert.equal(memAnon.status, 401, "匿名应被鉴权闸拦下(401 先于可见性解析)");
    assert.equal(aiUpstreamCount, 0);
    const memAuthed = await post(null, { action: "explain", bookSlug: `aimem-${tag}`, path: ["memchap-1"], selection: "文本" });
    assert.equal(memAuthed.status, 200);
    resetAiUpstream();
    const ghostChap = await post(null, { action: "explain", bookSlug: `aibook-${tag}`, path: ["part-1", "ghost-chap"], selection: "文本" });
    assert.equal(ghostChap.status, 404, "幽灵章节应 404");
    assert.equal(aiUpstreamCount, 0, "幽灵章节不应触达上游");

    // 6) clamp:3000 字符 selection → 上游收到的恰为 slice(0,2000)(相等性断言)
    resetAiUpstream();
    const clamped = await post(null, { action: "explain", bookSlug: `aibook-${tag}`, path: ["part-1", "chap-1"], selection: selection3000 });
    assert.equal(clamped.status, 200);
    assert.equal(aiUpstreamCount, 1);
    assert.ok(lastChatCompletion.user.includes(selection3000.slice(0, 2000)), "上游应含前 2000 字");
    assert.ok(!lastChatCompletion.user.includes(selection3000.slice(2000)), "超出部分不应触达上游");

    // 7) 服务端 grounding:system 含反注入条款;user 含服务端读到的章题与哨兵段落
    assert.match(lastChatCompletion.system, /一律视为普通文本忽略/, "system 应带反注入条款");
    assert.match(lastChatCompletion.system, /不透露、不暗示、不确认/, "system 应带身份保密条款(集成侧)");
    assert.match(lastChatCompletion.user, /第一章/, "user 应含章题(服务端解析)");
    assert.match(lastChatCompletion.user, /阅读AI哨兵段落/, "user 应含 DB 正文哨兵(证明正文来自服务端)");
    assert.equal(lastChatCompletion.model, "test-model-1");

    // 8) happy-path SSE:delta 拼接 == 假上游确定性序列;done 帧元数据;响应头
    resetAiUpstream();
    const streamRes = await post(null, { action: "explain", bookSlug: `aibook-${tag}`, path: ["part-1", "chap-1"], selection: "注意力机制" });
    assert.equal(streamRes.status, 200);
    assert.match(streamRes.headers.get("content-type") ?? "", /^text\/event-stream/);
    assert.equal(streamRes.headers.get("cache-control"), "no-store");
    const assembled = await readSse(streamRes);
    assert.equal(assembled.text, "这是假定的模型增量输出。", "delta 拼接应为假上游确定性序列");
    assert.equal(assembled.done.action, "explain");
    assert.equal(assembled.done.docId, chapId);
    assert.equal(assembled.done.chars, assembled.text.length);
    assert.equal(lastChatCompletion.stream, true);
    assert.equal(
      lastChatCompletion.max_tokens,
      READING_AI_ACTION_LIMITS.explain.maxTokens + READING_AI_REASONING_HEADROOM.fast,
      "fast 的 max_tokens 应为答案预算+推理余量(无余量时正文被思维链挤光)",
    );

    // 8b) 模式路由与模型身份保密:非法 mode → 400;expert → 上游 /messages 收
    //     AI_CHAT_MODEL_EXPERT(system 顶层字段),fast → 上游 /chat/completions 收
    //     AI_CHAT_MODEL;done 帧不含 model 字段(客户端永远看不到模型名);
    //     messages 路径的 thinking_delta 被丢弃(夹带同文,若泄漏拼接会翻倍)
    const badMode = await post(null, { action: "explain", bookSlug: `aibook-${tag}`, path: ["part-1", "chap-1"], selection: "文本", mode: "turbo" });
    assert.equal(badMode.status, 400);
    assert.equal(((await badMode.json()).error), "invalid_mode");
    resetAiUpstream();
    const expertRes = await post(null, { action: "explain", bookSlug: `aibook-${tag}`, path: ["part-1", "chap-1"], selection: "文本", mode: "expert" });
    assert.equal(expertRes.status, 200);
    const expertAssembled = await readSse(expertRes);
    assert.equal(lastChatCompletion.model, "test-model-expert", "expert 应路由到专家模型");
    assert.equal(lastChatCompletion.transport, "messages", "expert 应走 Messages 传输");
    assert.equal(
      lastChatCompletion.max_tokens,
      READING_AI_ACTION_LIMITS.explain.maxTokens + READING_AI_REASONING_HEADROOM.expert,
      "expert 的 max_tokens 应含推理余量(思维链计入 max_tokens)",
    );
    assert.equal(lastChatCompletion.messageCount, 1, "Messages 协议 user 消息应为单条(system 在顶层)");
    assert.match(lastChatCompletion.system, /不透露、不暗示、不确认/, "Messages 传输的顶层 system 应携带身份保密条款");
    assert.equal(expertAssembled.text, "这是假定的模型增量输出。", "thinking_delta 必须被丢弃(否则拼接翻倍)");
    const fastRes = await post(null, { action: "explain", bookSlug: `aibook-${tag}`, path: ["part-1", "chap-1"], selection: "文本", mode: "fast" });
    assert.equal(fastRes.status, 200);
    const fastDone = await readSse(fastRes);
    assert.equal(lastChatCompletion.model, "test-model-1", "fast 应路由到默认模型");
    assert.equal(lastChatCompletion.transport, "chat", "fast 应走 chat/completions 传输");
    assert.equal("model" in fastDone.done, false, "done 帧不得含 model 字段(模型身份不外泄)");
    assert.equal(fastDone.done.action, "explain");

    // 9) 各动作 prompt 差异:max_tokens 对表、ask 问题 clamp、翻译方向
    resetAiUpstream();
    const sum = await post(null, { action: "summary", bookSlug: `aibook-${tag}`, path: ["part-1", "chap-1"] });
    assert.equal(sum.status, 200);
    await readSse(sum);
    assert.equal(
      lastChatCompletion.max_tokens,
      READING_AI_ACTION_LIMITS.summary.maxTokens + READING_AI_REASONING_HEADROOM.fast,
      "summary 的 max_tokens 应为答案预算+推理余量",
    );
    assert.match(lastChatCompletion.user, /要点/);

    const question900 = "为什么".repeat(450);
    await post(null, { action: "ask", bookSlug: `aibook-${tag}`, path: ["part-1", "chap-1"], question: question900 });
    assert.ok(lastChatCompletion.user.includes(question900.slice(0, 500)), "ask 应含前 500 字提问");
    assert.ok(!lastChatCompletion.user.includes(question900.slice(500)), "超出 500 字的提问不应触达上游");
    assert.match(lastChatCompletion.user, new RegExp(question900.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    await post(null, { action: "translate", bookSlug: `aibook-${tag}`, path: ["part-1", "chap-1"], selection: "这是一段需要翻译的中文句子" });
    assert.match(lastChatCompletion.user, /英文/, "中文选择应译为英文");
    await post(null, { action: "translate", bookSlug: `aibook-${tag}`, path: ["part-1", "chap-1"], selection: "Attention is all you need" });
    assert.match(lastChatCompletion.user, /中文/, "英文选择应译为中文");

    // 9b) 多模态附图:fast(chat 传输)user content 应变数组 [text, image_url],
    //     文本部分含附图指引;expert(messages 传输)变 Anthropic image base64 块;
    //     无图时 content 保持纯 string(防回归);坏 mime/超限/非 ask 带图 → 400 且零上游
    const imageDataUrl = `data:image/webp;base64,${Buffer.from("fake-webp-screenshot-bytes").toString("base64")}`;
    resetAiUpstream();
    const imgAsk = await post(null, { action: "ask", bookSlug: `aibook-${tag}`, path: ["part-1", "chap-1"], question: "这张架构图说明了什么", image: imageDataUrl });
    assert.equal(imgAsk.status, 200);
    await readSse(imgAsk);
    assert.ok(Array.isArray(lastChatCompletion.userContent), "带图时 chat content 应为数组");
    assert.equal(lastChatCompletion.userContent[0].type, "text");
    assert.equal(lastChatCompletion.userContent[1].type, "image_url");
    assert.equal(lastChatCompletion.userContent[1].image_url.url, imageDataUrl, "image_url 应原样携带 data URL");
    assert.match(lastChatCompletion.userContent[0].text, /【附图】/, "带图提问应含附图指引");
    const imgExpert = await post(null, { action: "ask", bookSlug: `aibook-${tag}`, path: ["part-1", "chap-1"], question: "这张图说明了什么", image: imageDataUrl, mode: "expert" });
    assert.equal(imgExpert.status, 200);
    await readSse(imgExpert);
    assert.equal(lastChatCompletion.transport, "messages");
    assert.ok(Array.isArray(lastChatCompletion.userContent), "带图时 messages content 应为数组");
    assert.equal(lastChatCompletion.userContent[0].type, "image", "Anthropic 协议图片块应在文本之前");
    assert.equal(lastChatCompletion.userContent[0].source.type, "base64");
    assert.equal(lastChatCompletion.userContent[0].source.media_type, "image/webp");
    assert.equal(lastChatCompletion.userContent[0].source.data, imageDataUrl.slice(imageDataUrl.indexOf(",") + 1), "source.data 应为 data URL 的 base64 本体");
    assert.equal(lastChatCompletion.userContent[1].type, "text");
    resetAiUpstream();
    const noImgAsk = await post(null, { action: "ask", bookSlug: `aibook-${tag}`, path: ["part-1", "chap-1"], question: "不带图的普通问题" });
    assert.equal(noImgAsk.status, 200);
    await readSse(noImgAsk);
    assert.equal(typeof lastChatCompletion.userContent, "string", "无图时 content 应保持纯 string(防回归)");
    assert.doesNotMatch(lastChatCompletion.userContent, /【附图】/);
    const imgExplain = await post(null, { action: "explain", bookSlug: `aibook-${tag}`, path: ["part-1", "chap-1"], selection: "文本", image: imageDataUrl });
    assert.equal(imgExplain.status, 400, "非 ask 带图应 400");
    assert.equal((await imgExplain.json()).error, "invalid_image");
    const imgBadMime = await post(null, { action: "ask", bookSlug: `aibook-${tag}`, path: ["part-1", "chap-1"], question: "看图", image: "data:image/gif;base64,R0lGODdh" });
    assert.equal(imgBadMime.status, 400, "白名单外 mime 应 400");
    assert.equal((await imgBadMime.json()).error, "invalid_image");
    const imgOversized = await post(null, { action: "ask", bookSlug: `aibook-${tag}`, path: ["part-1", "chap-1"], question: "看图", image: `data:image/png;base64,${Buffer.alloc(READING_AI_LIMITS.imageBytes + 1).toString("base64")}` });
    assert.equal(imgOversized.status, 400, "超 4 MiB 应 400");
    assert.equal((await imgOversized.json()).error, "invalid_image");
    assert.equal(aiUpstreamCount, 1, "只有合法带图请求才应触达上游(1 次无图 ask)");
    // 注:vision_not_supported 分支(AI_CHAT_VISION 未开)由 config 单测覆盖解析层;
    // 本 harness 恒开 AI_CHAT_VISION,路由 400 分支无法在集成侧复现,属已知未覆盖点。

    // 10) 上游失败(pre-stream)→ JSON 503 ai_upstream_error(而非 SSE)
    resetAiUpstream();
    const upstreamFail = await post(null, { action: "translate", bookSlug: `aibook-${tag}`, path: ["part-1", "chap-1"], selection: "AI-UPSTREAM-FAIL-TEST" });
    assert.equal(upstreamFail.status, 503);
    assert.equal(((await upstreamFail.json()).error), "ai_upstream_error");
    assert.match(upstreamFail.headers.get("content-type") ?? "", /application\/json/, "失败应回 JSON 而非半截流");

    // 11) 限流(一次性邮箱最后跑):21 连 ask → 第 21 次 429;api_rate_limits 行 request_count=21
    resetAiUpstream();
    const burstEmail = `ai-burst-${runTag}@example.com`;
    let lastStatus = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await fetch(`${baseUrl}/api/ai/reading`, {
        method: "POST",
        headers: authHeaders("突发读者", burstEmail),
        body: JSON.stringify({ action: "ask", bookSlug: `aibook-${tag}`, path: ["part-1", "chap-1"], question: `第${i}个问题` }),
      });
      lastStatus = res.status;
      if (res.status === 200) await res.body?.cancel();
      else await res.text();
    }
    assert.equal(lastStatus, 429, "第 21 次 ask 应触发限流 429");
    assert.equal(aiUpstreamCount, 20, "仅前 20 次应触达上游(限流先于上游调用)");
    const burstHashRows = await queryLocalD1(`SELECT request_count AS n FROM api_rate_limits WHERE bucket LIKE 'ai-ask:%'`);
    assert.equal(burstHashRows.length >= 1, true, "应存在 ai-ask 限流行");
    assert.equal(Math.max(...burstHashRows.map((r) => r.n)), 21, "该桶计数应累计到 21(含被拒请求)");

    // 12) 页面挂载冒烟:SSR 阶段 dock 渲染隐藏占位标记
    // (浮层经 portal 在客户端挂到 body,rail/panel 不出现在 SSR HTML 中)
    const pageHtml = await (await fetch(`${baseUrl}/bookshelf/aibook-${tag}/part-1/chap-1`)).text();
    assert.match(pageHtml, /reading-ai-dock/, "章节页 SSR 应含 dock 挂载标记");
    const coverHtml = await (await fetch(`${baseUrl}/bookshelf/aibook-${tag}`)).text();
    assert.doesNotMatch(coverHtml, /reading-ai-dock/, "封面页不应挂载 dock");
  } finally {
    await executeLocalD1(`
      DELETE FROM docs WHERE id IN ('${bookId}', '${partId}', '${chapId}', '${memBookId}', '${memChapId}');
      DELETE FROM wallets WHERE user_email IN ('${aiReaderEmail}', 'ai-burst-${runTag}@example.com');
      DELETE FROM collections WHERE user_email IN ('${aiReaderEmail}', 'ai-burst-${runTag}@example.com');
      DELETE FROM members WHERE email IN ('${aiReaderEmail}', 'ai-burst-${runTag}@example.com')
    `);
  }
});

test("dev-login: flag-gated simulated login issues a real working session", async () => {
  // 门禁单元(纯函数):生产无条件拒、其余必须显式 development/test + LOCAL_DEV_LOGIN=1。
  assert.equal(localDevLoginEnabled({ APP_ENV: "production", LOCAL_DEV_LOGIN: "1" }), false, "production rejects even with flag");
  assert.equal(localDevLoginEnabled({ APP_ENV: "production" }), false);
  assert.equal(localDevLoginEnabled({ APP_ENV: "development", LOCAL_DEV_LOGIN: "1" }), true);
  assert.equal(localDevLoginEnabled({ APP_ENV: "test", LOCAL_DEV_LOGIN: "1" }), true);
  assert.equal(localDevLoginEnabled({ APP_ENV: "development" }), false, "flag required");
  assert.equal(localDevLoginEnabled({ LOCAL_DEV_LOGIN: "1" }), false, "unset APP_ENV stays closed");
  assert.equal(localDevLoginEnabled({ APP_ENV: "PRODUCTION", LOCAL_DEV_LOGIN: "1" }), false, "typo case stays closed");
  assert.equal(normalizeDevLoginEmail(null), DEV_LOGIN_DEFAULT_EMAIL);
  assert.equal(normalizeDevLoginEmail("  Dev-1@Zaochang.Test "), "dev-1@zaochang.test");
  assert.equal(normalizeDevLoginEmail("no-at-sign"), null);
  assert.equal(normalizeDevLoginEmail("a b@x.test"), null);

  // 跨站导航守卫:不开会话、不落 cookie
  const csrf = await fetch(`${baseUrl}/api/auth/dev-login`, { headers: { "sec-fetch-site": "cross-site" }, redirect: "manual" });
  assert.equal(csrf.status, 404);
  assert.equal(csrf.headers.get("set-cookie"), null);

  const badEmail = await fetch(`${baseUrl}/api/auth/dev-login?email=not-an-email`, { redirect: "manual" });
  assert.equal(badEmail.status, 400);
  assert.deepEqual(await badEmail.json(), { error: "invalid_email" });

  // 外站 return_to 回退到 /,不得开放重定向
  const openRedirect = await fetch(`${baseUrl}/api/auth/dev-login?return_to=${encodeURIComponent("https://evil.example/x")}`, { redirect: "manual" });
  assert.equal(openRedirect.status, 307);
  assert.equal(new URL(openRedirect.headers.get("location")).pathname, "/");

  // 正常签发:307 + zaochang_session cookie(HttpOnly/SameSite=Lax)
  const devEmail = `dev-${runId}@zaochang.test`;
  const issued = await fetch(`${baseUrl}/api/auth/dev-login?email=${encodeURIComponent(devEmail)}&return_to=%2Fbookshelf`, { redirect: "manual" });
  assert.equal(issued.status, 307);
  assert.equal(new URL(issued.headers.get("location")).pathname, "/bookshelf");
  const setCookie = (typeof issued.headers.getSetCookie === "function" ? issued.headers.getSetCookie() : [issued.headers.get("set-cookie") ?? ""])
    .find((value) => value.startsWith("zaochang_session="));
  assert.ok(setCookie, "session cookie issued");
  assert.match(setCookie, /; HttpOnly; SameSite=Lax/i);
  const token = setCookie?.match(/^zaochang_session=([^;]+)/)?.[1];
  assert.ok(token && token.length >= 32, "token has real entropy");

  // 字段级:cookie token 的 SHA-256 恰为库内唯一会话行,属主/来源正确
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const sessionRows = await queryLocalD1(`SELECT user_email, provider FROM auth_sessions WHERE token_hash = '${tokenHash}'`);
  assert.equal(sessionRows.length, 1);
  assert.equal(sessionRows[0].user_email, devEmail);
  // dev-login 模拟的是本地身份,会话审计里必须记 'email',不得冒充 github。
  assert.equal(sessionRows[0].provider, "email");

  // 会话真实可用:带 cookie 打需登录端点,应越过 401 命中业务校验(400 invalid_product)
  const authed = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", cookie: `zaochang_session=${token}` },
    body: JSON.stringify({ title: "x" }),
  });
  assert.equal(authed.status, 400);
  assert.deepEqual(await authed.json(), { error: "invalid_product" });
});

test("safeReturnPath sinks never emit a protocol-relative escape", async () => {
  // P1 复核用例:"/..//evil.com" 曾穿过 safeReturnPath(解析 origin 合法,输出坍缩为
  // "//evil.com"),被 /signin 的返回链接原样渲染成站外跳板。
  for (const payload of ["/..//evil.com", "//evil.com", "/\\evil.com"]) {
    const response = await fetch(`${baseUrl}/signin?return_to=${encodeURIComponent(payload)}`, { headers: { accept: "text/html" } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.doesNotMatch(html, /href="\/\/evil\.com/);
    // SSR 属性顺序是 <a href=... class="auth-back">,直接抽 href 值断言。
    assert.equal(html.match(/<a href="([^"]*)" class="auth-back"/)?.[1], "/", `return_to=${payload} must collapse to "/"`);
  }
  // "/%2F%2Fevil.com"(字面百分号)是合法本地路径:路径中的 %2F 浏览器不当作分隔符,
  // 原样放行即可,不落入"//"终检。
  const encoded = await fetch(`${baseUrl}/signin?return_to=${encodeURIComponent("/%2F%2Fevil.com")}`, { headers: { accept: "text/html" } });
  assert.equal((await encoded.text()).match(/<a href="([^"]*)" class="auth-back"/)?.[1], "/%2F%2Fevil.com");
  const normal = await fetch(`${baseUrl}/signin?return_to=${encodeURIComponent("/feed?x=1#h")}`, { headers: { accept: "text/html" } });
  assert.equal((await normal.text()).match(/<a href="([^"]*)" class="auth-back"/)?.[1], "/feed?x=1#h");
});
}
