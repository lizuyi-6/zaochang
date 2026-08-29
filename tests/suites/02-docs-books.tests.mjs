// 文档·书架·阅读进度:自 tests/rendered-html.test.mjs 保序拆分(测试体逐字未改)。
// 执行顺序由 tests/rendered-html.test.mjs 的注册顺序保证。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  baseUrl,
  adminEmail,
  authHeaders,
  identityHeaders,
  executeLocalD1,
  queryLocalD1,
} from "../harness/preview.mjs";

export function register() {
test("docs: public visible to anonymous, members-only gated, tree and markdown sanitized", async () => {
  const docsRunId = crypto.randomUUID();
  const pubId = `doc:${docsRunId}-pub`;
  const childId = `doc:${docsRunId}-child`;
  const memId = `doc:${docsRunId}-mem`;
  const xssTitle = `公开文档 ${docsRunId.slice(0, 8)}`;
  const memberEmail = `docs-member-${docsRunId}@example.com`;
  // seed:根公开文档(含 XSS)、其公开子文档、一篇 members 文档
  await executeLocalD1(`
    INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order) VALUES
      ('${pubId}', 'guide-${docsRunId.slice(0, 8)}', NULL, '${xssTitle}', '# 你好\n\n这是**公开**文档。<script>window.__xss=1</script><img src=x onerror=alert(1)>', 'public', '${adminEmail}', 1),
      ('${childId}', 'setup', '${pubId}', '安装指南', '子级内容', 'public', '${adminEmail}', 1),
      ('${memId}', 'internal-${docsRunId.slice(0, 8)}', NULL, '内部笔记', '只给登录用户看', 'members', '${adminEmail}', 2)
  `);
  const base = `guide-${docsRunId.slice(0, 8)}`;
  try {
    // 1) 公开文档:匿名可见,Markdown 渲染,且 XSS 被剥掉(行为断言,非状态码)
    const anonPub = await fetch(`${baseUrl}/docs/${base}`);
    assert.equal(anonPub.status, 200);
    const anonPubHtml = await anonPub.text();
    assert.match(anonPubHtml, new RegExp(xssTitle));
    assert.match(anonPubHtml, /<strong>公开<\/strong>/);
    assert.doesNotMatch(anonPubHtml, /<script>window\.__xss/);
    assert.doesNotMatch(anonPubHtml, /onerror=/);
    // 2) 匿名目录树:公开文档+子文档可见,members 文档不出现
    const anonIndex = await fetch(`${baseUrl}/docs`);
    assert.equal(anonIndex.status, 200);
    const anonIndexHtml = await anonIndex.text();
    assert.match(anonIndexHtml, new RegExp(xssTitle));
    assert.match(anonIndexHtml, /安装指南/);
    assert.doesNotMatch(anonIndexHtml, /内部笔记/);
    // 3) members 文档:匿名访问 -> 404(fail-closed,不暴露存在性,与 /founder 对非创始人 404 同理)
    const anonMem = await fetch(`${baseUrl}/docs/internal-${docsRunId.slice(0, 8)}`);
    assert.equal(anonMem.status, 404);
    // 4) members 文档:登录用户 -> 可见正文
    const authMem = await fetch(`${baseUrl}/docs/internal-${docsRunId.slice(0, 8)}`, { headers: authHeaders("文档成员", memberEmail) });
    assert.equal(authMem.status, 200);
    const authMemHtml = await authMem.text();
    assert.match(authMemHtml, /只给登录用户看/);
    // 5) 嵌套子文档 URL 可达
    const childPage = await fetch(`${baseUrl}/docs/${base}/setup`);
    assert.equal(childPage.status, 200);
    assert.match(await childPage.text(), /子级内容/);
    // 6) 登录用户在目录树里能看到 members 文档
    const authIndex = await fetch(`${baseUrl}/docs`, { headers: authHeaders("文档成员", memberEmail) });
    assert.match(await authIndex.text(), /内部笔记/);
  } finally {
    await executeLocalD1(`DELETE FROM docs WHERE id IN ('${pubId}', '${childId}', '${memId}')`);
  }
});

test("docs tree hides unreachable child whose parent is invisible", async () => {
  const docsRunId = crypto.randomUUID();
  const privParent = `doc:${docsRunId}-pp`;
  const pubChild = `doc:${docsRunId}-pc`;
  const privSlug = `priv-${docsRunId.slice(0, 8)}`;
  const childSlug = `pubchild-${docsRunId.slice(0, 8)}`;
  // 私有父 + 公开子:子的访问路径必经不可见的父,对匿名不可达
  await executeLocalD1(`
    INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order) VALUES
      ('${privParent}', '${privSlug}', NULL, '私有父${docsRunId.slice(0, 6)}', 'x', 'private', '${adminEmail}', 1),
      ('${pubChild}', '${childSlug}', '${privParent}', '公开子${docsRunId.slice(0, 6)}', 'y', 'public', '${adminEmail}', 1)
  `);
  try {
    // 匿名目录树:不应列出不可达的公开子(否则显示一个点击必 404 的链接)
    const idx = await fetch(`${baseUrl}/docs`);
    const idxHtml = await idx.text();
    assert.doesNotMatch(idxHtml, /公开子/);
    // 经任何路径都不可达:直接根级查不到(父非根),经父路径父不可见 -> 均 404
    assert.equal((await fetch(`${baseUrl}/docs/${childSlug}`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/docs/${privSlug}/${childSlug}`)).status, 404);
  } finally {
    await executeLocalD1(`DELETE FROM docs WHERE id IN ('${privParent}', '${pubChild}')`);
  }
});

test("docs no longer lists books; old book URLs 308-redirect to bookshelf", async () => {
  const runId = crypto.randomUUID();
  const tag = runId.slice(0, 8);
  const bookId = `doc:${runId}-book`;
  const partId = `doc:${runId}-part`;
  const chapId = `doc:${runId}-chap`;
  const memBookId = `doc:${runId}-membook`;
  const standaloneId = `doc:${runId}-standalone`;
  const standaloneSlug = `standalone-${tag}`;
  const memberEmail = `docs-redirect-${runId}@example.com`;
  // seed:一本公开书(书根+part+章节)+ 一本 members 书 + 一个独立文档。
  // 期望:独立文档留在 /docs;书与书的章节整体从 /docs 消失;旧书 URL 308 到书架。
  await executeLocalD1(`
    INSERT OR IGNORE INTO members (email, display_name) VALUES ('${adminEmail}', '文档去重管理员');
    INSERT OR IGNORE INTO members (email, display_name) VALUES ('${memberEmail}', '文档成员');
    INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary, cover_image, banner_image) VALUES
      ('${bookId}', 'docbook-${tag}', NULL, '去重测试书${tag}', '封面正文', 'public', '${adminEmail}', 1, 1, 210, '一本测试书', '', ''),
      ('${partId}', 'part-a', '${bookId}', '第一部分', '', 'public', '${adminEmail}', 1, 0, 210, '', '', ''),
      ('${chapId}', 'chap-1', '${partId}', '第一章', '章节正文', 'public', '${adminEmail}', 1, 0, 210, '', '', ''),
      ('${memBookId}', 'memdocbook-${tag}', NULL, 'members测试书${tag}', 'x', 'members', '${adminEmail}', 2, 1, 200, '', '', '');
    INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book) VALUES
      ('${standaloneId}', '${standaloneSlug}', NULL, '独立文档${tag}', '正文', 'public', '${adminEmail}', 9, 0)
  `);
  try {
    // 1) /docs 目录:独立文档在,书与书的章节都不在(去重——方案甲的核心)。
    const idx = await fetch(`${baseUrl}/docs`);
    const idxHtml = await idx.text();
    assert.match(idxHtml, /独立文档/, "独立文档应留在 /docs 目录");
    assert.match(idxHtml, new RegExp(standaloneSlug), "独立文档链接应在 /docs 目录");
    assert.doesNotMatch(idxHtml, /去重测试书/, "书根不应出现在 /docs 目录");
    assert.doesNotMatch(idxHtml, /第一部分/, "书的 part 不应出现在 /docs 目录");
    assert.doesNotMatch(idxHtml, /第一章/, "书的章节不应出现在 /docs 目录");

    // 2) 旧书根 URL → 308 → /bookshelf/同路径
    const redirRoot = await fetch(`${baseUrl}/docs/docbook-${tag}`, { redirect: "manual" });
    assert.equal(redirRoot.status, 308, "旧书根 URL 应 308 永久重定向");
    assert.match(redirRoot.headers.get("location") ?? "", new RegExp(`/bookshelf/docbook-${tag}([/?]|$)`), "location 应指向书架同路径");

    // 3) 旧深层章节 URL → 308 → /bookshelf/同深路径
    const redirDeep = await fetch(`${baseUrl}/docs/docbook-${tag}/part-a/chap-1`, { redirect: "manual" });
    assert.equal(redirDeep.status, 308, "旧章节 URL 应 308");
    assert.match(redirDeep.headers.get("location") ?? "", new RegExp(`/bookshelf/docbook-${tag}/part-a/chap-1([/?]|$)`), "深层 location 应指向书架同深路径");

    // 4) members 书匿名访问旧 URL → 404(fail-closed:不重定向、不借 308 泄露存在性)
    const memAnon = await fetch(`${baseUrl}/docs/memdocbook-${tag}`, { redirect: "manual" });
    assert.equal(memAnon.status, 404, "匿名访问 members 书旧 URL 应 404,不重定向");

    // 5) members 书登录用户 → 308(可见才重定向)
    const memAuth = await fetch(`${baseUrl}/docs/memdocbook-${tag}`, { redirect: "manual", headers: authHeaders("文档成员", memberEmail) });
    assert.equal(memAuth.status, 308, "登录用户访问 members 书旧 URL 应 308");

    // 6) 独立文档 URL 不受影响:仍 200 直达,不重定向
    const standalone = await fetch(`${baseUrl}/docs/${standaloneSlug}`);
    assert.equal(standalone.status, 200, "独立文档 URL 不应被重定向");
    assert.match(await standalone.text(), /正文/);
  } finally {
    await executeLocalD1(`DELETE FROM docs WHERE id IN ('${bookId}', '${partId}', '${chapId}', '${memBookId}', '${standaloneId}'); DELETE FROM members WHERE email = '${memberEmail}'`);
  }
});

test("bookshelf: book card wall, cover toc, chapter renders katex + mermaid, members book gated", async () => {
  const runId = crypto.randomUUID();
  const tag = runId.slice(0, 8);
  const bookId = `doc:${runId}-book`;
  const partId = `doc:${runId}-part`;
  const chapId = `doc:${runId}-chap`;
  const chap2Id = `doc:${runId}-chap2`;
  const memBookId = `doc:${runId}-membook`;
  const memberEmail = `bookshelf-${runId}@example.com`;
  // seed:一本公开书(书根 + 一个 Part + 一章,章节含 LaTeX 公式与 mermaid),一本 members 书。
  // 章节正文用普通字符串拼接,避免模板串与 ``` 围栏 / 反引号 / ${} 冲突。
  const fence = String.fromCharCode(96).repeat(3); // ```
  const chapBody = [
    "行内公式 $\\langle Q_i, K_j \\rangle$ 与块级:",
    "",
    "$$\\sqrt{d_k}$$",
    "",
    fence + "mermaid",
    "flowchart LR",
    "  A-->B",
    fence,
    "",
    // MkDocs 搬运遗留:.md 相对链接 + :material-*: 图标宏。验证渲染层重写/删除。
    "下一章 [:material-book-arrow-right: 第二章](chap-2.md),回[封面](../index.md)。",
    "",
    // MkDocs admonition 提示框:!!! type "标题" + 4 空格缩进内容,应转为 blockquote。
    '!!! warning "分清两件事"',
    "    Softmax 本身是**确定性**的:给定 Logits,分布固定。",
    "",
    // CommonMark strong-emphasis 闭合边界:inner 以标点()结尾、闭合**后跟中文时,
    // marked 的 Rule 16 flanking 判定不闭合 → 预处理改写为 <strong>。模拟生产"中文术语(English)"写法。
    "沿特征维度**拼接(Concatenation)**成一份长向量。",
    "",
    // 错配回归:前一个 emphasis 闭合后是标点(——),正则不能把它的闭合** 当下一对的开启、
    // 错配到后续 **,从而漏修紧随的 emphasis。模拟生产 part-5/22 "外推" 漏修根因。
    "先见**泛化(Generalization)**——再按模式**外推(Extrapolation)**到新输入。",
  ].join("\n");
  await executeLocalD1(`
    INSERT OR IGNORE INTO members (email, display_name) VALUES ('${adminEmail}', '书架管理员');
    INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary, cover_image, banner_image) VALUES
      ('${bookId}', 'book-${tag}', NULL, '图解测试书${tag}', '# 封面正文', 'public', '${adminEmail}', 1, 1, 200, '这是一本测试书的简介', '/api/uploads/cover-${tag}.png', '/api/uploads/banner-${tag}.png'),
      ('${partId}', 'part-1', '${bookId}', '第一部分 基础', '', 'public', '${adminEmail}', 1, 0, 210, '', '', ''),
      ('${chapId}', 'chap-1', '${partId}', '第一章 注意力', '${chapBody.replace(/'/g, "''")}', 'public', '${adminEmail}', 1, 0, 210, '', '', ''),
      ('${chap2Id}', 'chap-2', '${partId}', '第二章 前馈', '第二章正文', 'public', '${adminEmail}', 2, 0, 210, '', '', ''),
      ('${memBookId}', 'membook-${tag}', NULL, '内部书${tag}', 'x', 'members', '${adminEmail}', 2, 1, 120, '内部简介', '', '')
  `);
  try {
    // 1) 书架:匿名看到公开书卡片(书名/简介/章节数),不看到 members 书
    const anon = await fetch(`${baseUrl}/bookshelf`);
    assert.equal(anon.status, 200);
    const anonHtml = await anon.text();
    assert.match(anonHtml, new RegExp(`图解测试书${tag}`));
    assert.match(anonHtml, /这是一本测试书的简介/);
    assert.doesNotMatch(anonHtml, new RegExp(`内部书${tag}`));
    // 1b) 封面图:书架卡片用 cover_image 渲染 <img>(有封面时不退回渐变占位)
    assert.match(anonHtml, new RegExp(`<img src="/api/uploads/cover-${tag}\\.png"`), "书架卡片应渲染封面图 img");
    // 2) 书封面页:目录树列出 Part 与章节;横幅位优先渲染 banner_image(横版)
    const cover = await fetch(`${baseUrl}/bookshelf/book-${tag}`);
    assert.equal(cover.status, 200);
    const coverHtml = await cover.text();
    assert.match(coverHtml, /第一部分 基础/);
    assert.match(coverHtml, /第一章 注意力/);
    assert.match(coverHtml, new RegExp(`<img class="book-banner" src="/api/uploads/banner-${tag}\\.png"`), "封面页横幅位应优先渲染横版 banner_image");
    // 3) 章节页:LaTeX 经 KaTeX 渲染成 span.katex,mermaid 占位成 pre.mermaid,XSS 不出现
    const chap = await fetch(`${baseUrl}/bookshelf/book-${tag}/part-1/chap-1`);
    assert.equal(chap.status, 200);
    const chapHtml = await chap.text();
    assert.match(chapHtml, /class="katex"/, "行内公式应被 KaTeX 渲染");
    assert.match(chapHtml, /katex-block/, "块级公式应被 KaTeX 渲染");
    assert.match(chapHtml, /<pre class="mermaid">/, "mermaid 应回填为 pre.mermaid");
    assert.match(chapHtml, /flowchart LR/, "mermaid 源码应保留供前端渲染");
    assert.doesNotMatch(chapHtml, /\$\\langle/, "原始 $...$ 不应裸露");
    // 3c) MkDocs 搬运兼容:.md 相对链接重写成造场路由;:material-*: 图标宏删除(留文字)。
    //     chap-2.md → 同 part 下 chap-2 的书内路径;../index.md → 书封面。
    assert.ok(chapHtml.includes(`/bookshelf/book-${tag}/part-1/chap-2`), `chap-2.md 链接应重写为造场路由,实际 HTML 未含该路径`);
    assert.ok(chapHtml.includes(`href="/bookshelf/book-${tag}"`), `../index.md 应重写为书封面路由`);
    assert.doesNotMatch(chapHtml, /chap-2\.md/, "重写后不应残留 .md 链接");
    assert.doesNotMatch(chapHtml, /\.\.\/index\.md/, "重写后不应残留 ../index.md");
    assert.doesNotMatch(chapHtml, /:material-[a-z0-9-]+:/, ":material-*: 图标宏应被删除,不应裸露");
    assert.match(chapHtml, /第二章/, "宏删除后链接文字应保留");
    // 3d) MkDocs admonition(!!! type "标题" + 缩进内容)应转为 blockquote,!!! 不裸露,
    //     标题加粗保留,内容里的内联 markdown(**code)仍被解析。
    assert.doesNotMatch(chapHtml, /!!! ?warning/, "admonition 的 !!! 标记不应裸露");
    assert.match(chapHtml, /<blockquote>/, "admonition 应渲染为 blockquote");
    assert.match(chapHtml, /<strong>分清两件事<\/strong>/, "admonition 标题应加粗保留");
    assert.match(chapHtml, /<strong>确定性<\/strong>/, "admonition 内容里的内联 ** 应仍被解析");
    // 3e) CommonMark strong-emphasis 闭合边界:inner 以标点()结尾、闭合**后跟中文时,
    //     marked 的 Rule 16 不闭合 → 预处理改写成 <strong>(绕开 flanking 判定)。
    assert.match(chapHtml, /<strong>拼接\(Concatenation\)<\/strong>/, "标点结尾的 **X** 在中文上下文应渲染为 <strong>");
    assert.doesNotMatch(chapHtml, /\*\*拼接\(/, "标点结尾的 **X** 不应裸露成文本");
    assert.match(chapHtml, /<strong>泛化\(Generalization\)<\/strong>/, "错配回归:闭合后标点的前一个 emphasis 应渲染");
    assert.match(chapHtml, /<strong>外推\(Extrapolation\)<\/strong>/, "错配回归:紧随的第二个 emphasis 不应被错配漏掉");
    // 3a) KaTeX 视觉层定位 style 必须经 allowedStyles 白名单放行(回归:sanitize 曾剥光
    //     inline style 导致 vlist 退化为普通流、公式整排塌陷)。块级 \sqrt 会产生
    //     height/vertical-align 等几何 style;断言至少一处合法几何 style 存活。
    assert.match(chapHtml, /style="[^"]*(height|vertical-align|top):-?[\d.]+(em|px)/, "KaTeX 视觉层几何 style 应经白名单保留");
    // 危险 style 向量不得出现在任何 span 上(url 引用 / expression / 脚本协议)。
    // 注:不断言 background/position —— 页面模板合法 inline style(如封面渐变)也用它,
    // sanitize 的职责是挡注入,不是禁掉这些属性本身;值正则已拒 url(/expression(。
    assert.doesNotMatch(chapHtml, /style="[^"]*(url\(|expression\(|javascript:|behavior:)/i, "危险 style 值(url/expression/脚本)不得放行");
    // 3b) 阅读器沉浸模式:正文页隐藏站侧栏/顶部搜索/发布,但保留右上角账户区;
    //     书架首页(1) 保留整站导航,不在沉浸模式。
    assert.match(chapHtml, /reading-mode/, "阅读器页应进入沉浸模式");
    assert.doesNotMatch(chapHtml, /deep-search-trigger/, "沉浸模式不渲染顶部搜索");
    assert.doesNotMatch(chapHtml, /deep-create/, "沉浸模式不渲染发布按钮");
    assert.doesNotMatch(chapHtml, /<aside class="deep-sidebar">/, "沉浸模式不渲染站侧栏");
    assert.match(chapHtml, /deep-top-actions/, "沉浸模式保留右上角账户区");
    assert.doesNotMatch(anonHtml, /reading-mode/, "书架首页不进入沉浸模式,保留整站导航");
    assert.match(anonHtml, /deep-sidebar/, "书架首页保留站侧栏");
    // 4) members 书:匿名 404(fail-closed),登录可见
    assert.equal((await fetch(`${baseUrl}/bookshelf/membook-${tag}`)).status, 404);
    const authMem = await fetch(`${baseUrl}/bookshelf/membook-${tag}`, { headers: authHeaders("书架成员", memberEmail) });
    assert.equal(authMem.status, 200);
    assert.match(await authMem.text(), new RegExp(`内部书${tag}`));
    // 5) 登录用户在书架上能看到 members 书卡片
    const authIndex = await fetch(`${baseUrl}/bookshelf`, { headers: authHeaders("书架成员", memberEmail) });
    assert.match(await authIndex.text(), new RegExp(`内部书${tag}`));
  } finally {
    await executeLocalD1(`DELETE FROM docs WHERE id IN ('${bookId}', '${partId}', '${chapId}', '${memBookId}')`);
  }
});

test("book cover upload: founder-only, scanned clean, public readable, writes cover + banner slots", async () => {
  const runId = crypto.randomUUID();
  const tag = runId.slice(0, 8);
  const bookId = `doc:${runId}-coverbook`;
  const memberEmail = `cover-${runId}@example.com`;
  // 1x1 透明 PNG。
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  const uploadForm = (slot = "cover") => {
    const form = new FormData();
    form.set("file", new File([png], `${slot}-${tag}.png`, { type: "image/png" }));
    form.set("docId", bookId);
    form.set("slot", slot);
    form.set("visibility", "public");
    return form;
  };
  await executeLocalD1(`
    INSERT OR IGNORE INTO members (email, display_name) VALUES ('${adminEmail}', '封面管理员');
    INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, is_book, cover_hue, summary, cover_image, banner_image) VALUES
      ('${bookId}', 'coverbook-${tag}', NULL, '封面上传书${tag}', 'x', 'public', '${adminEmail}', 1, 200, '', '', '')
  `);
  try {
    // 1) 匿名 -> 401;非创始人成员 -> 403
    assert.equal((await fetch(`${baseUrl}/api/docs/cover`, { method: "POST", body: uploadForm() })).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/docs/cover`, { method: "POST", headers: identityHeaders("普通成员", memberEmail), body: uploadForm() })).status, 403);

    // 2) 创始人上传竖版 -> 201,scanStatus clean,写回 cover_image
    const coverUpload = await fetch(`${baseUrl}/api/docs/cover`, { method: "POST", headers: identityHeaders("封面管理员", adminEmail), body: uploadForm("cover") });
    assert.equal(coverUpload.status, 201, await coverUpload.clone().text().catch(() => ""));
    const coverPayload = await coverUpload.json();
    assert.equal(coverPayload.scanStatus, "clean");
    assert.equal(coverPayload.purpose, "book_cover");
    assert.equal(coverPayload.slot, "cover");
    assert.match(coverPayload.url, /^\/api\/uploads\/[a-f0-9-]+\.png$/);
    const coverRows = await queryLocalD1(`SELECT cover_image AS coverImage, banner_image AS bannerImage FROM docs WHERE id = '${bookId}'`);
    assert.equal(coverRows.length, 1);
    assert.equal(coverRows[0].coverImage, coverPayload.url, "竖版上传应写回 docs.cover_image");
    assert.equal(coverRows[0].bannerImage, "", "竖版上传不应动 banner_image");

    // 3) 创始人上传横版 -> 写回 banner_image,不动 cover_image
    const bannerUpload = await fetch(`${baseUrl}/api/docs/cover`, { method: "POST", headers: identityHeaders("封面管理员", adminEmail), body: uploadForm("banner") });
    assert.equal(bannerUpload.status, 201);
    const bannerPayload = await bannerUpload.json();
    assert.equal(bannerPayload.slot, "banner");
    const bannerRows = await queryLocalD1(`SELECT cover_image AS coverImage, banner_image AS bannerImage FROM docs WHERE id = '${bookId}'`);
    assert.equal(bannerRows[0].bannerImage, bannerPayload.url, "横版上传应写回 docs.banner_image");
    assert.equal(bannerRows[0].coverImage, coverPayload.url, "横版上传不应覆盖 cover_image");

    // 4) 公开封面/横幅匿名可读(经扫描 clean + sha256 一致)
    assert.equal((await fetch(`${baseUrl}${coverPayload.url}`)).status, 200);
    assert.equal((await fetch(`${baseUrl}${bannerPayload.url}`)).status, 200);

    // 5) 书架卡片渲染竖版,封面页横幅位渲染横版(行为层端到端)
    const shelf = await fetch(`${baseUrl}/bookshelf`);
    assert.match(await shelf.text(), new RegExp(`<img src="${coverPayload.url.replace(/\//g, "\\/").replace(/\./g, "\\.")}"`), "书架卡片应渲染竖版 cover");
    const coverPage = await fetch(`${baseUrl}/bookshelf/coverbook-${tag}`);
    assert.match(await coverPage.text(), new RegExp(`<img class="book-banner" src="${bannerPayload.url.replace(/\//g, "\\/").replace(/\./g, "\\.")}"`), "封面页横幅位应渲染横版 banner");
  } finally {
    await executeLocalD1(`DELETE FROM docs WHERE id = '${bookId}'; DELETE FROM uploaded_files WHERE purpose = 'book_cover' AND original_name LIKE '%-${tag}.png'; DELETE FROM admin_audit_events WHERE target_ref = '${bookId}'`);
  }
});

test("studio docs entry: isFounder flag + founder-gated docs pages", async () => {
  const runId = crypto.randomUUID();
  const memberEmail = `studio-docs-${runId}@example.com`;
  // 「文档与书架」入口卡在 /studio 客户端组件里由 /api/community 的 isFounder 驱动
  // (useEffect 注入,不进 SSR HTML),故无法靠渲染 HTML 断言;改而验证其真实驱动:
  // 1) /api/community 对创始人回 isFounder=true、普通成员 false;
  // 2) 入口目标 /studio/docs 由 requireFounder 把关:创始人 200,普通成员/匿名 404(fail-closed)。
  const founderApi = await (await fetch(`${baseUrl}/api/community`, { headers: authHeaders("创始人", adminEmail) })).json();
  assert.equal(founderApi.signedIn, true);
  assert.equal(founderApi.isFounder, true, "创始人 /api/community 应回 isFounder=true");
  const memberApi = await (await fetch(`${baseUrl}/api/community`, { headers: authHeaders("普通成员", memberEmail) })).json();
  assert.equal(memberApi.signedIn, true);
  assert.equal(memberApi.isFounder, false, "普通成员 /api/community 应回 isFounder=false");
  const anonApi = await (await fetch(`${baseUrl}/api/community`)).json();
  assert.equal(anonApi.isFounder, false, "匿名 /api/community 应回 isFounder=false");

  assert.equal((await fetch(`${baseUrl}/studio/docs`, { headers: authHeaders("创始人", adminEmail) })).status, 200, "创始人应能进 /studio/docs");
  assert.equal((await fetch(`${baseUrl}/studio/docs`, { headers: authHeaders("普通成员", memberEmail) })).status, 404, "普通成员进 /studio/docs 应 404");
  assert.equal((await fetch(`${baseUrl}/studio/docs`)).status, 404, "匿名进 /studio/docs 应 404");
});

test("/api/community authoredBooks lists the signed-in member's books with chapter count", async () => {
  const runId = crypto.randomUUID();
  const tag = runId.slice(0, 8);
  const bookId = `doc:${runId}-mybook`;
  const partId = `doc:${runId}-part`;
  const chapId = `doc:${runId}-chap`;
  const otherEmail = `nobooks-${runId}@example.com`;
  // seed:adminEmail 名下的书(书根 + part + 章)。后代 = part + chap = 2。
  await executeLocalD1(`
    INSERT OR IGNORE INTO members (email, display_name) VALUES ('${adminEmail}', '我的书管理员');
    INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary, cover_image, banner_image) VALUES
      ('${bookId}', 'mybook-${tag}', NULL, '我的书${tag}', '封面正文', 'public', '${adminEmail}', 1, 1, 210, '一本我的书', '', ''),
      ('${partId}', 'part-a', '${bookId}', '第一部分', '', 'public', '${adminEmail}', 1, 0, 210, '', '', ''),
      ('${chapId}', 'chap-1', '${partId}', '第一章', '章节正文', 'public', '${adminEmail}', 1, 0, 210, '', '', '')
  `);
  try {
    // founder(adminEmail)名下有这本书,chapterCount = 2(part + chap,递归后代)
    const founderApi = await (await fetch(`${baseUrl}/api/community`, { headers: authHeaders("我的书创始人", adminEmail) })).json();
    assert.ok(Array.isArray(founderApi.authoredBooks), "authoredBooks 应为数组");
    const mine = founderApi.authoredBooks.find((b) => b.slug === `mybook-${tag}`);
    assert.ok(mine, "founder 应在 authoredBooks 看到自己的书");
    assert.equal(mine.title, `我的书${tag}`);
    assert.equal(mine.chapterCount, 2, "章节数应含 part + chap");
    assert.equal(mine.visibility, "public");

    // 普通成员名下无书 -> authoredBooks 为空
    const memberApi = await (await fetch(`${baseUrl}/api/community`, { headers: authHeaders("无书成员", otherEmail) })).json();
    assert.ok(Array.isArray(memberApi.authoredBooks));
    assert.equal(memberApi.authoredBooks.length, 0, "其他成员名下无书");

    // 匿名 authoredBooks 也应存在且为空(不报错、不泄露)
    const anonApi = await (await fetch(`${baseUrl}/api/community`)).json();
    assert.ok(Array.isArray(anonApi.authoredBooks), "匿名 authoredBooks 应为数组(空)");
    assert.equal(anonApi.authoredBooks.length, 0);
  } finally {
    await executeLocalD1(`DELETE FROM docs WHERE id IN ('${bookId}', '${partId}', '${chapId}')`);
  }
});

test("reading-progress: POST upserts, validates fail-closed, GET + recentReading + shelf SSR surface it", async () => {
  const runId = crypto.randomUUID();
  const tag = runId.slice(0, 8);
  const bookId = `doc:${runId}-rpbook`;
  const partId = `doc:${runId}-rppart`;
  const chapId = `doc:${runId}-rpchap`;
  const otherBookId = `doc:${runId}-rpother`;
  const otherChapId = `doc:${runId}-rpochap`;
  const readerEmail = `reader-${runId}@example.com`;
  // seed:一本书(book + part + chap)+ 另一本独立书 + 它的章(用于跨书 fail-closed 校验)。
  await executeLocalD1(`
    INSERT OR IGNORE INTO members (email, display_name) VALUES ('${adminEmail}', '阅读进度管理员');
    INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary, cover_image, banner_image) VALUES
      ('${bookId}', 'rpbook-${tag}', NULL, '进度书${tag}', '封面', 'public', '${adminEmail}', 1, 1, 210, '一本可读的书', '', ''),
      ('${partId}', 'part-1', '${bookId}', '第一部分', '', 'public', '${adminEmail}', 1, 0, 210, '', '', ''),
      ('${chapId}', 'chap-1', '${partId}', '第一章', '正文', 'public', '${adminEmail}', 1, 0, 210, '', '', ''),
      ('${otherBookId}', 'rpother-${tag}', NULL, '另一本书', '', 'public', '${adminEmail}', 2, 1, 120, '', '', ''),
      ('${otherChapId}', 'ochap-1', '${otherBookId}', '另一章', '正文', 'public', '${adminEmail}', 1, 0, 120, '', '', '')
  `);
  try {
    // 1) 匿名 POST -> 401(requireMember)
    const anonPost = await fetch(`${baseUrl}/api/reading-progress`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookId, chapterId: chapId, paragraph: 3 }),
    });
    assert.equal(anonPost.status, 401, "匿名上报进度应 401");

    // 2) 合法 POST(upsert)→ DB 落 last_chapter_id=chapId, last_paragraph=3(行为层字段断言)
    const post1 = await fetch(`${baseUrl}/api/reading-progress`, {
      method: "POST",
      headers: authHeaders("读者", readerEmail),
      body: JSON.stringify({ bookId, chapterId: chapId, paragraph: 3 }),
    });
    assert.equal(post1.status, 200, "合法上报应 200");
    const row1 = await queryLocalD1(`SELECT last_chapter_id AS c, last_paragraph AS p FROM reading_progress WHERE user_email = '${readerEmail}' AND book_id = '${bookId}'`);
    assert.equal(row1.length, 1, "进度行应存在");
    assert.equal(row1[0].c, chapId, "last_chapter_id 应为上报的章节");
    assert.equal(row1[0].p, 3, "last_paragraph 应为上报值 3");

    // 3) 再次 POST 更新(upsert,不新增行)→ paragraph 变化,行数仍 1
    await fetch(`${baseUrl}/api/reading-progress`, {
      method: "POST",
      headers: authHeaders("读者", readerEmail),
      body: JSON.stringify({ bookId, chapterId: chapId, paragraph: 7 }),
    });
    const rowCount = await queryLocalD1(`SELECT COUNT(*) AS n FROM reading_progress WHERE user_email = '${readerEmail}' AND book_id = '${bookId}'`);
    assert.equal(rowCount[0].n, 1, "upsert 不应新增行");
    const row2 = await queryLocalD1(`SELECT last_paragraph AS p FROM reading_progress WHERE user_email = '${readerEmail}' AND book_id = '${bookId}'`);
    assert.equal(row2[0].p, 7, "last_paragraph 应更新为 7");

    // 4) 负数 paragraph -> clamp 到 0(行为层字段断言,非仅状态码)
    await fetch(`${baseUrl}/api/reading-progress`, {
      method: "POST",
      headers: authHeaders("读者", readerEmail),
      body: JSON.stringify({ bookId, chapterId: chapId, paragraph: -5 }),
    });
    const rowNeg = await queryLocalD1(`SELECT last_paragraph AS p FROM reading_progress WHERE user_email = '${readerEmail}' AND book_id = '${bookId}'`);
    assert.equal(rowNeg[0].p, 0, "负 paragraph 应 clamp 到 0");

    // 5) 跨书校验 fail-closed:把 A 书章节记到 B 书名下 -> 404,不落库
    const crossPost = await fetch(`${baseUrl}/api/reading-progress`, {
      method: "POST",
      headers: authHeaders("读者", readerEmail),
      body: JSON.stringify({ bookId: otherBookId, chapterId: chapId, paragraph: 1 }),
    });
    assert.equal(crossPost.status, 404, "跨书章节应被 fail-closed 拒绝(404)");
    const crossRow = await queryLocalD1(`SELECT COUNT(*) AS n FROM reading_progress WHERE user_email = '${readerEmail}' AND book_id = '${otherBookId}'`);
    assert.equal(crossRow[0].n, 0, "跨书进度不应落库");

    // 6) 不存在的 bookId -> 404(校验在 FK 之前,fail-closed 不泄露存在性)
    const ghostPost = await fetch(`${baseUrl}/api/reading-progress`, {
      method: "POST",
      headers: authHeaders("读者", readerEmail),
      body: JSON.stringify({ bookId: `doc:${runId}-ghost`, chapterId: chapId, paragraph: 1 }),
    });
    assert.equal(ghostPost.status, 404, "不存在的 bookId 应 404");

    // 7) GET 返回当前用户进度(camelCase 字段)
    const getRes = await fetch(`${baseUrl}/api/reading-progress`, { headers: authHeaders("读者", readerEmail) });
    assert.equal(getRes.status, 200);
    const getJson = await getRes.json();
    assert.ok(Array.isArray(getJson.progress), "GET 应返回 progress 数组");
    const mine = getJson.progress.find((r) => r.bookId === bookId);
    assert.ok(mine, "GET 应含上报过的书");
    assert.equal(mine.lastChapterId, chapId);

    // 8) /api/community recentReading 含该书 + href 直指章节(非封面两步跳)
    const comm = await (await fetch(`${baseUrl}/api/community`, { headers: authHeaders("读者", readerEmail) })).json();
    assert.ok(Array.isArray(comm.recentReading), "recentReading 应为数组");
    const cr = comm.recentReading.find((r) => r.bookId === bookId);
    assert.ok(cr, "recentReading 应含读过的书");
    assert.equal(cr.chapterTitle, "第一章");
    assert.ok(cr.href.includes(`/bookshelf/rpbook-${tag}/part-1/chap-1`), `recentReading href 应指向章节路径,实际 ${cr.href}`);

    // 9) 书架首页卡片 href 直指上次章节(SSR,非封面)
    const shelfHtml = await (await fetch(`${baseUrl}/bookshelf`, { headers: authHeaders("读者", readerEmail) })).text();
    assert.ok(shelfHtml.includes(`/bookshelf/rpbook-${tag}/part-1/chap-1`), "书架首页卡片应直指上次章节 URL");

    // 10) 封面页"继续阅读"链接渲染 + href 指向章节
    const coverHtml = await (await fetch(`${baseUrl}/bookshelf/rpbook-${tag}`, { headers: authHeaders("读者", readerEmail) })).text();
    assert.ok(coverHtml.includes("继续阅读"), "封面页应渲染继续阅读入口");
    assert.ok(coverHtml.includes(`/bookshelf/rpbook-${tag}/part-1/chap-1`), "封面页继续阅读 href 应指向章节");

    // 11) 匿名 GET -> 401
    const anonGet = await fetch(`${baseUrl}/api/reading-progress`);
    assert.equal(anonGet.status, 401, "匿名 GET 进度应 401");
  } finally {
    await executeLocalD1(`
      DELETE FROM reading_progress WHERE user_email = '${readerEmail}';
      DELETE FROM docs WHERE id IN ('${bookId}', '${partId}', '${chapId}', '${otherBookId}', '${otherChapId}');
      DELETE FROM wallets WHERE user_email = '${readerEmail}';
      DELETE FROM collections WHERE user_email = '${readerEmail}';
      DELETE FROM members WHERE email = '${readerEmail}'
    `);
  }
});

test("member_number: trigger auto-assigns sequential ids, UNIQUE-enforced, surfaced on profile + api", async () => {
  const runId = crypto.randomUUID();
  const emailA = `mem-a-${runId}@example.com`;
  const emailB = `mem-b-${runId}@example.com`;
  // 通过 /api/community(GET 内 ensureMember)创建两个 member → trigger 应自动赋号
  await (await fetch(`${baseUrl}/api/community`, { headers: authHeaders("会员甲", emailA) })).json();
  await (await fetch(`${baseUrl}/api/community`, { headers: authHeaders("会员乙", emailB) })).json();
  const rows = await queryLocalD1(`SELECT email, member_number AS n FROM members WHERE email IN ('${emailA}', '${emailB}') ORDER BY member_number ASC`);
  assert.equal(rows.length, 2, "两个 member 都应被 trigger 赋 member_number");
  const nA = rows.find((r) => r.email === emailA).n;
  const nB = rows.find((r) => r.email === emailB).n;
  assert.ok(Number.isInteger(nA) && nA > 0, `A 会员号应为正整数,实际 ${nA}`);
  assert.equal(nB, nA + 1, "trigger 应给后到的成员赋 MAX(member_number)+1");
  // UNIQUE 约束:直接撞号写入应被拒(不变量不靠应用层)
  const dupErr = await executeLocalD1(`INSERT INTO members (email, display_name, member_number) VALUES ('dup-${runId}@x.com', '撞号', ${nA})`, false);
  assert.match(dupErr, /UNIQUE/i, "member_number 撞号应被 UNIQUE 索引拒绝");
  // 不变量锚点:trigger 与 UNIQUE 索引确实存在于 schema
  const schema = await queryLocalD1(`SELECT type, name FROM sqlite_master WHERE name IN ('members_assign_member_number', 'members_member_number_idx')`);
  assert.ok(schema.some((r) => r.type === "trigger" && r.name === "members_assign_member_number"), "赋号 trigger 存在");
  assert.ok(schema.some((r) => r.name === "members_member_number_idx"), "UNIQUE 索引存在");
  // /api/community profile.memberNumber 与库一致
  const api = await (await fetch(`${baseUrl}/api/community`, { headers: authHeaders("会员甲", emailA) })).json();
  assert.equal(api.profile.memberNumber, nA);
  // profile 页面 SSR 渲染零填充会员号 #00NN
  const profileHtml = await (await fetch(`${baseUrl}/profile`, { headers: authHeaders("会员甲", emailA) })).text();
  // React SSR 在相邻文本节点间插入 <!-- --> 注释;去掉后再断言,避免误判(hydration 后视觉无影响)。
  const profileHtmlCleaned = profileHtml.replace(/<!--.*?-->/g, "");
  assert.ok(profileHtmlCleaned.includes(`#${String(nA).padStart(4, "0")}`), `profile SSR 应含 #${String(nA).padStart(4, "0")}`);
  // 清理(wallets/collections 经 ensureMember 创建,FK 引用 members,须先删)
  await executeLocalD1(`
    DELETE FROM collections WHERE user_email IN ('${emailA}', '${emailB}');
    DELETE FROM wallets WHERE user_email IN ('${emailA}', '${emailB}');
    DELETE FROM members WHERE email IN ('${emailA}', '${emailB}')
  `);
});

test("docs API: founder-gated CRUD, non-founder forbidden, cycle rejected", async () => {
  const docsRunId = crypto.randomUUID();
  const memberEmail = `docs-api-${docsRunId}@example.com`;
  // 非创始人(普通成员)写 -> 403
  const forbidden = await fetch(`${baseUrl}/api/docs`, {
    method: "POST",
    headers: authHeaders("普通成员", memberEmail),
    body: JSON.stringify({ title: "越权文档", slug: "forbidden", visibility: "public" }),
  });
  assert.equal(forbidden.status, 403);
  // 匿名写 -> 401
  const anon = await fetch(`${baseUrl}/api/docs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "匿名文档" }),
  });
  assert.equal(anon.status, 401);
  // 创始人建父 + 子,再尝试把父移到子下 -> 409 防环
  const mkDoc = async (payload) => {
    const res = await fetch(`${baseUrl}/api/docs`, {
      method: "POST",
      headers: authHeaders("造场创始人", adminEmail),
      body: JSON.stringify(payload),
    });
    const resText = await res.text();
    assert.equal(res.status, 201, resText);
    return JSON.parse(resText).doc;
  };
  const parent = await mkDoc({ title: `父 ${docsRunId.slice(0, 8)}`, slug: `p-${docsRunId.slice(0, 8)}`, visibility: "public" });
  const child = await mkDoc({ title: "子", slug: "c", parentId: parent.id, visibility: "public" });
  try {
    const cycle = await fetch(`${baseUrl}/api/docs`, {
      method: "PATCH",
      headers: authHeaders("造场创始人", adminEmail),
      body: JSON.stringify({ id: parent.id, parentId: child.id }),
    });
    assert.equal(cycle.status, 409);
    // 删除有子级的父 -> 409;先删子再删父 -> 成功
    const delParent = await fetch(`${baseUrl}/api/docs`, {
      method: "DELETE",
      headers: authHeaders("造场创始人", adminEmail),
      body: JSON.stringify({ id: parent.id }),
    });
    assert.equal(delParent.status, 409);
  } finally {
    for (const id of [child.id, parent.id]) {
      await fetch(`${baseUrl}/api/docs`, {
        method: "DELETE",
        headers: authHeaders("造场创始人", adminEmail),
        body: JSON.stringify({ id }),
      });
    }
  }
});
}
