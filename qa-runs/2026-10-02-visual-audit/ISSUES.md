# 造场全站测试问题文档

- 审查日期:2026-10-02(23:13 – 2026-10-03)
- 目标:`https://aetherstudio.top` 生产环境,**全站所有功能所有页面(含主站 + 见界)**
- 生产版本:审查开始 `6d885ac` → 期间推进到 `9a59f77`(4 次部署,均未改 `public/lattice`)
- 模式:**audit,只读** —— 未修改任何应用源码,未触发部署,未轮换 token
- 交付物:**本问题文档**。按要求**不自行修复**
- 证据目录:`qa-runs/2026-10-02-visual-audit/evidence/`(51 页录像 + 截图 + 观察者日志,均带 SHA-256 登记)

---

## 一、覆盖范围

| 面 | 数量 | 手段 |
|---|---|---|
| 主站页面路由 | 30 | 逐页录像(1440×900)+ 截图 + console/network 观察者 |
| 主站匿名/登录双身份 | 30 × 2 | HTTP 探针(状态码/重定向落点/正文指纹)+ 10 页登出态录像 |
| **动态路由(带参数)** | **18** | 3 本书详情 + 1 章节正文 + 1 文档正文 + 6 产品详情 + 6 产品应用 + 支付页错误态 |
| API 端点 | 54 | × 3 种凭据(无凭据 / 伪造 cookie / 伪造 Bearer)边界探针 |
| 见界 hash 路由 | 15 | 逐页录像 + 截图 + 观察者 |
| **功能流程(真实执行)** | **2** | ① 完整建课(命题→AI 出题→降级→模板问卷)② **书页「问 AI」端到端提问** |
| 命中框/无障碍 | 3 路由 × 3 指针模式 | DOM 几何测量(fine pointer + `hasTouch` 对照组) |
| 状态属性抽查 | 2 产品详情页 | DOM 读 `aria-pressed` / class / 计算样式(只读) |

**总计 74 页录像、54 端点 × 3 凭据 = 162 次授权边界请求、2 次真实 AI 功能调用。**

---

## 二、问题清单

### P-001 【高】白板讲课计划:客户端 65s 超时短于服务端 130s,昨晚的修复在冷实例上被浏览器提前掐死

**位置**
- `app/api/hyperknow/whiteboard/plan/route.ts:145-147` → `AbortSignal.timeout(130_000)`
- `hyperknow-spa/src/lattice/whiteboard/WhiteboardPage.tsx:316` → `window.setTimeout(() => ctrl.abort(), 65_000)`
- `hyperknow-spa/src/lattice/backend.ts:506-510` → 计划请求 `signal` 由调用方透传,**无竞争超时**

**问题**
`d59be3b`(2026-10-02 22:51)把服务端 plan 超时 110s→130s,commit 正文写明理由:
> 循证教学 v4 提示词的推理链更长,冷实例实测 92-100s:放宽到 130s,**绝不让路由超时把一次成功的计划掐死在半路(掐死=学员拿到模板降级课)**

但 `git show --stat d59be3b` 显示它只改了 `plan/route.ts` / `backend.ts` / `planPrefetch.ts` / `tests/lattice-backend.test.mjs`,**没有改 `WhiteboardPage.tsx`**。客户端那行注释至今仍写着「服务端 60s 超时 + 余量」。

冷实例需要 92–100s,浏览器 65s 即 abort → 学员看不到本可成功生成的计划,服务端仍烧到 130s 上游算力。**服务端那次 130s 修复对冷实例实际不生效。**

**为什么测试没拦住**
`d59be3b` 新增的回归测试只钉了解析契约(`planLectureLive` 的 `explanation` / `degraded` 透传),**没有任何测试断言「服务端超时 > 所有调用点客户端 abort 值」**,这类失配可以再次无声发生。

**复现**
```bash
# 1. 读两个超时值
grep -n "AbortSignal.timeout" app/api/hyperknow/whiteboard/plan/route.ts
grep -n "65_000\|ctrl.abort" hyperknow-spa/src/lattice/whiteboard/WhiteboardPage.tsx
# 2. 确认 d59be3b 没同步客户端
git show --stat d59be3b | grep WhiteboardPage   # 无输出
```

**建议方向**(不在本次实施)
1. `WhiteboardPage.tsx:316` 提到 `>= 135_000`(略高于服务端 130s 留余量),并订正注释里的「服务端 60s」
2. 增加契约测试:断言 plan 路由服务端超时必须大于所有调用点的客户端 abort 值

**证据**:`evidence/01-routes-recording.json` · 源码三处行号已逐一核对

---

### P-002 【中】建课问询被客户端 20s 超时主动放弃,静默降级为模板问卷,而该 brief 会持久化进课程

**位置**
- `hyperknow-spa/src/lattice/pages/CreatePage.tsx:444` → `timeoutMs: 20000`
- `hyperknow-spa/src/lattice/backend.ts:119-123` → `AbortSignal.timeout(args.timeoutMs ?? 5000)`,注释自称「AI 出题建议 20s+」

**实测时序**(真实建课,指针路径提交,主题「用一句话讲清楚傅里叶变换到底解决了什么问题」)

```
t=13.4s  "✦ Tailoring questions to your topic"(思考态)
t=21.6s  仍在思考
t=30.0s  仍在思考
t=38.3s  "AI unavailable — standard questionnaire" → 停在模板问卷「等你作答」
```

**关键证据**:`POST /api/hyperknow/course-inquiry` 失败原因是 `net::ERR_ABORTED`,**全程零 4xx/5xx** —— 不是网络故障、不是服务端拒绝,是客户端主动中止。

**问题**
上游是混合推理模型,同项目白板链冷实例就要 92–100s,20s 结构性偏短。降级只以一行灰色小字呈现,**无重试入口、无原因说明**;而这份 intake brief 会随课程 JSON 持久化并注入 `planLecture`(见 `92c42fe`),等于**模板问卷的产物静默决定整门课的教学质量**,用户全程不知情。

**复现**
```bash
# 浏览器打开 https://aetherstudio.top/lattice/#/create,输入任意主题,点右下角 ↑ 提交
# DevTools Network 过滤 course-inquiry,观察约 20s 后状态为 (canceled)/ERR_ABORTED
# 页面出现 "AI unavailable — standard questionnaire"
```

**正向提醒**:`fbfbf8d2` 做的 `source: ai|template` 如实标注**确实生效**——UI 明确写了 "AI unavailable",没有把降级伪装成 AI 出题。修复超时的同时**不要把这个标注改回去**。

**证据**:`evidence/20-create-journey.mp4` · `20-create-02-after-submit.png` · `20-create-08-final.png` · `02-create-journey.json`

---

### P-003 【中】SPA 启动门无超时:`prepareI18n` 挂起会导致永久白屏,不报错、不自愈

**位置**
- `public/lattice/index.html:11-19` → `#root` 初始为空,body 底色内联 `#FAFAFA`;CSS 以 `<link>` 独立加载
- `hyperknow-spa/src/main.tsx:12-16` → `createRoot` 只在 `prepareI18n().catch(...).finally(...)` 内执行
- `hyperknow-spa/src/lattice/i18n/index.tsx:159-163` → `Promise.all([ensureLocale(lng), ensureLocale('en')])`
- `ensureLocale` → `import('./locales/xx.json')`,**无超时、无重试、无 abort**

**契约缺口**
`main.tsx:11` 把不变量写死为:
> 加载失败(极端断网/文件缺失)仍渲染:translate 对缺失字典回退返回键名,**好过白屏**。

代码只对 **reject** 兑现。请求挂起时 promise 永远 pending → `.catch()` 不触发 → `.finally()` 不触发 → `createRoot` 从不执行 → `#root` 永远空 → **纯白、无报错、无 spinner、不自愈,只能手动刷新**。

**实测到 1 次完全吻合的表征**
逐路由录像中 `#/course/journey` 产出 **11.6s 全空白**视频,同轮截图**同样纯白**(`textLen=0`、`title` 正确、零 console 错误、零失败请求)。视频与截图互相印证,排除采集管线错误。

4 组判别实验(等满 25s):无 uuid / 假 uuid / preview / home **全部正常渲染**(`textLen` 2672–3853、底色正是暖纸 `rgb(247,241,228)`)→ 判为**启动未完成**,非路由缺陷。

**为什么用户无从分辨**
正常启动序列就是 `#FAFAFA → 暖纸`(白板视频 0.0s→0.2s 可见),失败态与正常首帧**同色**。

**复现**
```bash
# 1. 读契约与实现
sed -n '10,17p' hyperknow-spa/src/main.tsx
sed -n '155,163p' hyperknow-spa/src/lattice/i18n/index.tsx
# 2. 观察:反复刷新 /lattice/ 任意路由,盯 body 背景色是否长时间停在 #FAFAFA
#    失败时 #root 为空、标题是静态 HTML 的「见界 · LATTICE」、控制台无任何错误
```

**建议方向**(不在本次实施)
给 `prepareI18n` 加超时竞速(`Promise.race([Promise.all(loads), timeout(2500)])`),让挂起不再能永久阻塞首屏;或直接先 `render` 再补字典(`t()` 本就有英文回退链)。

**证据**:`evidence/10-course-journey.mp4` · `10-course-journey.png` · `03-journey-probe.json` · `probe-A-journey-nouuid.png`

---

### P-004 【中】`GET /api/hyperknow/feed` 用裸 `catch` 把 401 吞成 500,谎报「服务端故障」

**位置**:`app/api/hyperknow/feed/route.ts:36,66-68`

```ts
const member = await requireMember();   // 匿名 → 抛 auth_required
...
} catch {                                // 裸 catch,无差别
  return Response.json({ error: "feed_failed" }, { status: 500 });
}
```

**实测**:`GET /api/hyperknow/feed` 无凭据 → `500 {"error":"feed_failed"}`。而同一批端点里 `marketplace/courses`、`get_user_info`、白板各路由等**全部返回 401 `auth_required`**。

**为什么值得单独记一条**
`feed/route.ts` 是 **13 个 hyperknow 端点里唯一不使用 `jsonError` 的**(`courses/[uuid]` 也用 `jsonError`,已实测其匿名返回 401)。这个孤立写法直接违反了 `errors.ts` 顶部「错误统一走 accessError,由 jsonError 识别并映射」的单一事实来源意图。

**实际危害**
1. 监控/告警会把**每一次未登录访问**计成服务端 500 —— on-call 会去查阶跃搜索上游,而真实原因只是「没登录」
2. 客户端无法区分「请登录」与「服务端坏了」,可能重试而不是提示登录
3. 本次审查就被它误导过一次:先以为 feed 链路整体故障

**复现**
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://aetherstudio.top/api/hyperknow/feed
# 500(期望 401)
curl -s -o /dev/null -w '%{http_code}\n' https://aetherstudio.top/api/hyperknow/marketplace/courses
# 401(对照组)
```

**建议方向**:改用 `jsonError(error)`,并把 `requireMember()` 移出 try 块(或至少让 auth 错误走 `jsonError`)。

---

### P-005 【中】`oauthJsonError` 不认识 `AuthRequiredError`,把 401 变成 500

**位置**:`app/api/_lib/oauth-provider.ts` 的 `oauthJsonError`;触发点 `app/api/oauth/authorize/route.ts:9,18`

```ts
// oauthJsonError 只认 OAuthProviderError
const current = error instanceof OAuthProviderError
  ? error
  : new OAuthProviderError("server_error", 500);
```

**实测**:`POST /api/oauth/authorize` 无凭据 → `500 {"error":"server_error"}`。
而 `POST /api/oauth/token`、`/api/oauth/revoke` 同样无凭据,**正确返回 401**。

**问题**
`/api/oauth/authorize` 的 `requireMember()` 抛的是 `AuthRequiredError`,不是 `OAuthProviderError` → 落入默认分支 → 500。`requireMember` 抛错在 `try` 块内,被同一个 `catch` 接住后交给 `oauthJsonError`,而后者不认识这种形状。

**讽刺之处**
`oauthJsonError` 里**专门写了 401 分支**:
```ts
...(current.status === 401 ? { "www-authenticate": `Bearer error="${current.code}"` } : {})
```
但从 access-control 这条路径永远产生不出 401 —— 这个分支是死的。

**与 P-004 同源**:两个独立位置的错误映射器不共享同一套错误词汇,于是 auth 失败一律退化成 500。

**复现**
```bash
curl -s -X POST -H 'content-type: application/json' -d '{}' \
  -o /dev/null -w '%{http_code}\n' https://aetherstudio.top/api/oauth/authorize   # 500
curl -s -X POST -H 'content-type: application/json' -d '{}' \
  -o /dev/null -w '%{http_code}\n' https://aetherstudio.top/api/oauth/token       # 401
```

**建议方向**:让 `oauthJsonError` 复用 `jsonError` 的分类逻辑(或在 `accessError`/`AuthRequiredError` 与 `OAuthProviderError` 之间建立显式转换),保持「一份错误词汇」。

---

### P-006 【低】白板引入卡关闭键 `wb-intro-close` 28×32,粗指针下也不放大

**实测**(同批 14 个图标型控件)

| 模式 | <44px | <24px(WCAG 2.5.8 AA) | `wb-intro-close` |
|---|---|---|---|
| 细指针 1440×900 | 6 | 0 | 28×32 |
| hasTouch 390×844 | 2 | 0 | 28×32 |
| hasTouch 820×1180 | 3 | 0 | 28×32 |

其余控件在触屏下都放大了(白板 6→2、建课 3→1~2),**唯独这个不变**。它是白板引入卡唯一的退出控件。24×24 AA 仍达标。

**注**:项目 2026-09-18 声称的「主控件 44px + 粗指针触屏兜底」**经对照组验证确实成立**,这条只是该兜底里的唯一例外。

---

### P-007 【低】学习动态页空态无引导,观感与故障难区分

全新账号(`agent@zaochang`,380 credits)访问 `#/feed`:整月空日历 + Today's To-Dos 空 + Completed 空,**零引导、零下一步动作**,唯一可交互是「+」与待办输入框。该页在 `56b5013`/`cc22ed7`「做真」之后,对零课程用户呈现的观感与「坏了」难区分。

**无版本化要求**,按任务级一致性提出,不自行升级为缺陷。需产品方裁决。

---

### P-010 【中】KaTeX 字体从未进入构建产物,书与开发者文档的所有公式都在用回退字体渲染

**位置**:`app/globals.css:2` → `@import "katex/dist/katex.min.css"`

**实测**:`/bookshelf/hello-system` 与章节页各产生 3 条 404
```
404 /assets/fonts/KaTeX_Main-Regular.woff2
404 /assets/fonts/KaTeX_Main-Regular.woff
404 /assets/fonts/KaTeX_Main-Regular.ttf
```

**根因(构建产物层已核实)**
- 构建出的 CSS 位于 `dist/client/assets/index-BzlR0vhj.css`,其 `@font-face` src 是**相对路径** `url(fonts/KaTeX_Main-Regular.woff2)` —— **没有被 Vite 重写为产物 URL**
- `dist/client/assets/` 下**只有 `katex-B7rAX3Vi.js`(JS 模块),没有任何字体文件**
- `dist/client/assets/fonts/` **目录不存在**
- `public/` 下也没有任何 KaTeX 字体,`public/fonts` 不存在;字体只存在于 `node_modules/katex/dist/fonts/`

即 `@import` 只把 KaTeX 的 CSS(含 `@font-face` 声明)打进了产物,**字体资源从未被复制**。CSS 从 `/assets/` 提供,相对路径解析为 `/assets/fonts/…` → 三连 404。

**影响**
不崩溃,但《Hello System》等书籍与 `/developers/docs` 里**所有 KaTeX 公式的字形与度量都是错的**(浏览器回退到别的衬线字体)。数学内容的可读性受损,而书籍是本站的核心内容资产。

**复现**
```bash
npm run build
# 1. 构建产物里有没有字体
ls dist/client/assets/ | grep -i katex          # 只有 .js
ls dist/client/assets/fonts                       # 不存在
# 2. CSS 里的引用是否被重写
grep -o 'url(fonts/KaTeX_Main-Regular[^)]*)' dist/client/assets/*.css   # 相对路径,未重写
# 3. 线上确认
#    打开 https://aetherstudio.top/bookshelf/hello-system
#    DevTools Network 过滤 katex -> 3 条 404
```

**建议方向**(不在本次实施)
- 把 `node_modules/katex/dist/fonts/` 显式拷进 `public/assets/fonts/`,或
- 改用自带字体的 KaTeX 分发方式,或在 Vite 配置里让该 CSS 的 `url()` 走 `assetsInclude`/显式 asset 导入

---

### P-011 【低】产品详情页「收藏」「喜欢」是 toggle 按钮但不暴露按下状态,视觉上也看不出可切换

**位置**:`/product/[slug]`(已在 `/product/loops` 与 `/product/mori` 两个产品上实测,表现一致)

**DOM 实测**
```
{"text":"收藏","tag":"button","ariaPressed":null,"cls":"","bg":"rgb(61, 44, 30)","color":"rgb(255,255,255)"}
{"text":"喜欢","tag":"button","ariaPressed":null,"cls":"","bg":"rgb(61, 44, 30)","color":"rgb(255,255,255)"}
{"text":"体验","tag":"button","ariaPressed":null,"cls":"active","bg":"rgba(0,0,0,0)","color":"rgb(61,44,30)"}
```

**澄清一个易误判的点**:计数为 0 而按钮呈深色实心,**不是「误标已赞/已收藏」**。两个产品上表现完全一致,且该深底是静态主按钮样式(无 class、无状态属性),与「已激活」无关。

**真实问题**
1. **无障碍**:`收藏`/`喜欢` 的语义是 toggle(点击后状态改变),但都不带 `aria-pressed`,辅助技术无法获知当前状态 —— WCAG 4.1.2 Name, Role, Value
2. **视觉可辨**:同一页面里激活态有明确范式(页签用 `class="active"` + 透明底 + 深字),而这两个按钮是深底白字,与之完全不像,用户无法从样式分辨「当前是开还是关」

**复现**
```bash
# 打开 https://aetherstudio.top/product/loops
# DevTools Console:
[...document.querySelectorAll('button')].filter(b=>/喜欢|收藏/.test(b.innerText))
  .map(b=>({t:b.innerText, pressed:b.getAttribute('aria-pressed'), cls:b.className}))
# -> pressed 全为 null,cls 全为空
```

---

### P-008 【低】Cloudflare Insights beacon 被 CSP 拦截,`/lattice` 没有 Web Analytics 数据

**实测**:全部 74 页稳定出现同一条报错
```
Loading the script 'https://static.cloudflareinsights.com/beacon.min.js/...'
violates the following Content Security Policy directive: "script-src 'self' 'unsafe-inline'"
```
审查开始前即存在,非本轮引入。是否放行属产品/合规决策(可能正有意屏蔽以收紧 CSP),**不判定为缺陷**;但需知晓副作用:`/lattice` 的 Web Analytics **没有数据**。

---

### P-009 【低】`/docs` 文案承诺的登录门禁标记当前无从演示

`/docs` 页面文案:「带 ⚠️ 标记的文档需要登录后才能阅读」。但当前归档里唯一一篇「试验文档 · 欢迎来到造场」**没有 ⚠️ 标记**,这条规则当前无任何实例可展示。非功能缺陷,属文案与数据不同步。

---

## 三、经验证「不是问题」的项(请勿重复跟进)

审查过程中我提出了 10 个嫌疑,全部经反证推翻。记录在此以免后续对账时被当成缺陷重查。

| # | 我的初始怀疑 | 推翻理由(权威依据) |
|---|---|---|
| D-1 | 建课页提交按钮缺可访问名 | `CreatePage.tsx:918-926` 带 `title="开始定制"`,可访问名存在。是我用 `has-text` 匹配不到 `title`,**采集器局限** |
| D-2 | 「380 credits left ⓘ」被截断 | 全分辨率截图显示完整。**降采样视频帧误读**(640px 帧不可作文字判读依据) |
| D-3 | 首页企划卡按钮文案错字 | 源码 `app/page.tsx:142` 逐字为 `<b>无截止日期</b>`。**图像放大不增加信息**,6 倍上采样后我把「截止」糊成了「止」 |
| D-4 | `/galaxy` 暗色是暖色改造的漏网冷色 | `/galaxy` 是带 shader/相机的 3D「产品银河」暗色宇宙子品牌,内部完全自洽(黑洞视觉 + PRODUCT GALAXY 标识 + 底部图例 + 时间经过控制)。**刻意设计** |
| D-5 | `/galaxy/incubator` 生产恒为登出态 | `getChatGPTUser()` 顺序是 agent Bearer → OAuth 会话 cookie →(仅非生产)legacy 头,生产 cookie 路径完好。该页空是因为**账号没有孵化权限**,会话是被识别的 |
| D-6 | `/studio/new` 无服务端鉴权是缺陷 | `create-product-flow.tsx:81-84,100` **故意在提交时拦 401** 并 `redirect` 到 `/signin?return_to=...`;草稿自动存 localStorage(第 55 行),登录后带回**草稿完好**。比入口拦截更好 |
| D-7 | 匿名可达 `/wallet` `/profile` `/notifications` 泄漏个人数据 | 双身份正文 diff:`/profile` 匿名 49 节点 vs 登录 78 节点,「造场 Agent」「杭州」等全部仅登录态出现;**无任何验收号身份值泄漏**。这些是登出壳 + 静态说明文案 |
| D-8 | `/studio/docs` `/admin` `/founder` 返回 404 | 三者均先 `requireFounder()`/`requireAdmin()`,失败即 `notFound()` **隐藏存在性**,设计内 fail-closed |
| D-9 | 「收藏/喜欢」计数 0 却深色实心 = 误标已赞 | DOM 实测两个产品表现完全一致,深底是**静态主按钮样式**(无 class、无 `aria-pressed`),与已激活无关。真实问题另记为 P-011 |
| D-10 | `/lattice` 没有 Web Analytics 是缺陷 | 可能是有意收紧 CSP;仅记录副作用,不判定为缺陷(P-008) |

---

## 四、经验证为「健康」的面(负面结论同样有值)

- **书页「问 AI」端到端可用,且抗编造**:走右栏入口 → 提问 → `POST /api/ai/reading` 返回 **200 `text/event-stream`**,正文流式渲染。故意提问一个**本章并不存在的概念**时,模型回答「本章未涉及相关内容。正文中未提及「可变性」概念」——**拒绝编造**。这反向验证了 CLAUDE.md 的核心不变量:章节正文确实由服务端经 `findInBook` 解析(否则模型看不到真实章节,答不出「本章未涉及」),且答案被锚定在真实材料上
- **权限面零 fail-open**:54 个端点 × 3 种凭据 = 162 次请求,**所有非 GET 端点在无凭据下一律 401/403,无一例外返回 2xx**
- **伪造凭据零收益**:伪造 cookie 与伪造 Bearer 的结果与完全无凭据**逐条一致**,未获得任何额外权限
- **登录门禁正确**:`/profile/edit` 307→`/signin?return_to=...`;`/lattice/` 302→`/signin?return_to=%2Flattice%2F&via=lattice`;已登录访问 `/signin` 302→`/`
- **登出态写按钮正确禁用**:通知中心「全部已读」在匿名态为 `disabled`
- **主站 30 页 + 18 条动态路由中只有 3 个 404**,全部是设计内 fail-closed(`/admin` `/founder` `/studio/docs`),零意外 5xx
- **6 个产品应用全部可运行**:`LOOPS` 实测有种子词/预设/4 滑杆/波形画布/播放·撤销·重做·重置·保存·导出配方·导出 WAV
- **换肤一致**:主站各页均为暖纸 `#F7F1E4` 一家族,未见冷色漏网、溢出或重叠;`/galaxy` 与产品应用的暗色系是刻意的「造场产品银河」子品牌,内部自洽
- **公开面 200 属设计内**:`/api/community` `/api/shell-state`(其中 `wallet: null` 正确)`/api/oauth/jwks` `/api/app-shell`
- **`/oauth/authorize` 无参数**是正确的不动产错误态:「造场账号 / 无法继续授权 / invalid_client / 返回造场」

---

## 五、未覆盖 / 盲区(重要)

- **白板授课播放(TTS 旁白、板书书写、插话、验收题反馈)零执行证据** —— `agent@zaochang` 名下**无课程**(集市发现返回空),无可用 fixture。**这是旗舰路径,却是最大盲区**,P-001 的实际运行时影响也正落在这里,未能实测复现(只读约束下不压测、不部署)
- **建课人工交互门之后**未测:蓝图确认门、侧板单元树、逐单元大纲、最终白板开课(需人工作答,超出审查范围)
- **移动端视觉走查**未做(仅测了命中框几何,未看 390px 下的排版/换行/抽屉/横向溢出)
- **多语言切换**未测;见界 UI 现为英文而账户内容中英混排,**无版本化要求,未自行判定为缺陷**
- **多账户/多权限/多积分档**未测(只有验收号一个身份)
- **屏幕阅读器未实测**:无障碍结论仅来自 DOM 几何与可访问名属性
- **帧级瞬态(<1s 闪烁/重排/过渡断裂)无法判定**:视频解析为采样而非逐帧;录制无 GPU 合成,动效观感与真实设备不完全等同
- **未做写操作的功能验证**:创建作品、发布动态、打赏支付、上传、退款等**未提交任何生产写请求**。这些路径的**成功路径**未经端到端验证(只验证了它们在无凭据下正确 fail-closed)

---

## 六、门禁结论

**`not_ready`**

理由不是发现了阻断级缺陷,而是:
1. **旗舰路径零执行证据** —— 白板授课播放完全未测
2. **P-001(high)** 直接削弱昨晚 `d59be3b` 修复的实际效果,而该修复正是团队当日的主要产出之一
3. **P-002(medium)** 落在刚上线的建课代理流主链上
4. **P-010(medium)** 影响全部书籍与开发者文档的公式渲染,是存量内容资产的持续性质量损失

是否接受由产品负责人裁决,本审查**不代签**。

---

## 附:证据文件索引

| 文件 | 内容 |
|---|---|
| `evidence/01-routes-recording.json` | 见界 15 路由逐条状态/文本量/观察者 |
| `evidence/02-create-journey.json` | 建课全程时序 + 指标 + `course-inquiry` ERR_ABORTED |
| `evidence/03-journey-probe.json` | 空白页 4 组判别实验(early@3s vs late@25s) |
| `evidence/04-hit-targets.json` | 命中框(细指针) |
| `evidence/05-hit-targets-touch.json` | 命中框(`hasTouch` 对照组) |
| `evidence/10-main-site-reachability.json` | 主站 35 路径 × 2 身份可达性 |
| `evidence/11-main-site-recording.json` | 主站 29 路由,逐条状态/文本量/观察者 |
| `evidence/13-anon-recording.json` | 10 条登出态路由,含登录页 + 写按钮 enabled/disabled 状态 |
| `evidence/15-dynamic-routes.json` | 18 条动态路由(3 书 + 章节 + 文档 + 6 产品 + 6 产品应用 + 支付页) |
| `evidence/16-reading-ai.json` | 「问 AI」端到端:入口、提问、SSE 响应状态、面板逐帧文本 |
| `evidence/12-anon-leak-diff.json` | 匿名 vs 登录正文 diff(无泄漏证明) |
| `evidence/14-api-boundary.json` | 54 端点 × 3 凭据授权边界 |
| `evidence/*.mp4` | 74 页录像(webm 为原始捕获,mp4 为解析用派生件) |
| `evidence/*.png` | 对应全分辨率截图 |
| `evidence/crops/` | 文字局部裁切(用于 D-3 的误读复核) |
| `scripts/*.mjs` | 全部可复现脚本(4 个录像器 + 4 个探针 + 问 AI 驱动 + 状态抽查) |
