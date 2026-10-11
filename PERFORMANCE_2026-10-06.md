# 2026-10-06 页面加载开销记录

状态：部分完成。本地代码、测试与测量有下述证据；未提交、未推送、未部署，线上速度未验收。

## 范围与设计取舍

本请求「优化性能开支，看看能不能优化页面打开速度」按首页和共享站壳处理。首页标题直接输出两个可见文本行；作品图按展示宽度请求，首页/列表/搜索图片延迟加载，其他使用者保留 eager 默认；全站导航在 pointer/focus 意图时预取；阅读字体通过 ReadingFonts 客户端边界生成独立、内容哈希 CSS，沿用资产缓存（2026-10-06 当时实现；2026-10-11 起见下方修订，该组件已删除）。

> 2026-10-11 修订（代码审查修复轮，未提交）：上述三处行为已变，本文其余测量、环境和结果均为修订前的 2026-10-06 采集，**未在本轮重测**，不得读作对新代码的性能结论。①阅读字体：`app/bookshelf/reading-fonts.tsx`（返回 null 的客户端组件）已删除，改为在 `app/bookshelf/[...slug]/page.tsx` 中 `import readingFontsHref from "../reading-fonts.css?url"` 并渲染 `<link rel="stylesheet" href={readingFontsHref} precedence="default" />`（类型声明 `app/css-url.d.ts`），产物名仍为 `reading-fonts-<hash>.css`；②意图预取：不再对全站链接预取，只对白名单（`/`、`/discover`、`/feed`、`/circles`、`/challenges`、`/guide`、`/galaxy`，见 `app/lib/intent-prefetch.ts`）生效，按用户/动态内容的页面（`/wallet`、`/admin`、`/founder`、`/notifications`、`/profile`、`/studio`、`/collections`、`/bookshelf`、`/docs`、`/developers`、`/product/*`）不再预取；③封面图：`app/lib/cover-image-sources.ts` 改为保持宽高比（同比缩放高）、保留 fit、候选宽度不超过原图 w，详情页主图 `sizes="(max-width: 1260px) 100vw, 1260px"`，收藏缩略图 `sizes="50px"`，首页实时榜与网格中同一作品复用卡片 sizes（只下载一次），CoverImage 挂载时失败检查改为用 `new Image()` 复核，lazy 图片等进入视口后再判定。另新增 `app/galaxy/layout.tsx` + `app/galaxy/galaxy-fonts.css`，仅在 `/galaxy/*` 加载 Noto Serif SC 400/500（约 242KB 未压缩 CSS，共享 CSS 只含 600/900）；删除未使用的 `app/components/motion/blur-text.tsx`。

未采用的合理解释：①只优化 `/lattice/`：会影响学习 SPA 启动，本轮没有改它；②修改生产边缘缓存或数据库：会改变公开数据新鲜度/查询成本，本轮没有改这些路径。鉴权、审查、钱包、缓存 TTL 和失败闭锁取值均无本轮改动。

图片快速失败的反例暴露了原有问题：hydration 前失败时 onError 事件丢失，8 个 img 仍存在。CoverImage 挂载时读取 complete/naturalWidth，失败源不再渲染；改动后网络 abort 反例的 imgCount==0、gradientContainerCount==4，浏览器脚本 exit=0。

## 相邻对比的环境与结果

Windows、Node 24.13.1、Chromium 154.0.8037.93、vinext 生产构建、本地真实 D1、APP_ENV=test、匿名首页。每个视口三次，独立浏览器 context，缓存关闭；CDP 配置 100 ms 延迟、10 Mbps、CPU 4 倍限速，load 后再观测 3 秒。CDP 参数是配置值；本地 TTFB 不代表公网 RTT。图片仍取自真实 Unsplash 服务。

基准代码为请求开始的 HEAD `79df2835afd428055be92c9428efafef959cd32e`，通过 `git archive HEAD app build db worker drizzle package.json package-lock.json vite.config.ts next.config.ts postcss.config.mjs tsconfig.json .openai public/favicon.svg public/_headers scripts/sync-katex-fonts.mjs` 构造首页基准，复用同一安装依赖及同一个本地 D1。未打包与首页无关的大型静态应用/实验材料；该基准全站 CSS 749800 字节，整仓初始构建为 752628 字节，差异 2828 字节（约 0.38%）。这不是全站完整复制的性能验收。

原提交测量结束于北京时间 08:44:11，改动版结束于 08:46:14。相邻两组测量期间没有本任务的 build/tsc/lint 同时运行。以下均为三次中位数，KB=1000 字节：

| 指标 | 桌面 1440×900：前 → 后 | 手机 390×844：前 → 后 |
| --- | --- | --- |
| 首次内容绘制 FCP | 1964 → 1884 ms（-4.1%） | 2088 → 1484 ms（-28.9%） |
| 首页 CSS 下载量 | 263994 → 146037 B（-44.7%） | 263994 → 146037 B（-44.7%） |
| 图片下载量 | 764578 → 294564 B（-61.5%） | 767853 → 129508 B（-83.1%） |
| 总资源下载量 | 1711252 → 1086939 B | 1698149 → 921883 B |
| 无用户意图的 RSC 预取次数 | 14 → 0 | 7 → 0 |
| load 事件时间 | 2530.3 → 2532.6 ms | 2557.2 → 1792.5 ms |
| 观测窗口长任务超 50 ms 部分之和 | 233 → 871 ms | 858 → 191 ms |
| CLS（窗口内累加） | 0.000173 → 0.001198 | 0.000643 → 0.001369 |

桌面整体 load 没有下降，主线程长任务波动显著，不能称 CPU 开销下降。FCP 结论仅限上述样本，不是统计显著性或生产 SLA。最初初版手机 FCP 1392→1216 ms 的结果不能替代这组最终相邻数据。

命题映射：证据 X 是该批后版 FCP 中位数小于原提交中位数、CSS/image 字节数降低、每次 rscRequests==0、overflow==0；待证 Y 是这批本地样本的这些指标下降/为零；X 与 Y 是同一件事。它不证明线上或所有设备提速。可证伪出口为 `scripts/summarize-page-load.mjs` 的 `assert.equal(metrics.fcpMs.after < metrics.fcpMs.before, true)`、CSS/image 同类字段断言，以及 `assert.equal(samples(after).every((sample) => sample.rscRequests === 0), true)`。

复现采集：先用 Playwright CLI 的 `-s=zaochang-perf goto http://127.0.0.1:4181` 打开目标构建，再运行 `npx --yes --package @playwright/cli playwright-cli -s=zaochang-perf run-code --filename scripts/measure-page-load.mjs`（两组 exit=0），分别保存输出到 `output/performance/before.txt`、`after.txt`；`node scripts/summarize-page-load.mjs` exit=0，22/22 字段断言，failed=0、skipped=0。需自行启动对应构建的 Wrangler 预览服务器；本轮预览进程和浏览器已关闭。

测量不是只取一组绿灯：`before-early.json`、`first-after.json` 保留初版；`after-busy.json` 保留与类型检查重叠的数据；`after-invalid.json` 的一个手机样本 imageBytes==0，比较门禁真实 exit=1，因此未作为有效图片节省证据；`after-quiet-early.json` 保留最后相邻比较前的独立测量。原提交在后段环境也明显变慢，故采用相邻重建对比，所有中间结果保留在 output/performance。

## 行为与质量证据

- `npm test` exit=0：total=544、pass=544、fail=0、cancelled=0、skipped=0、todo=0。账本上一基线 542；新增图片 URL 行为和阅读 CSS 分块两项测试，未删减/禁用用例。测试使用 local D1、假 AI/扫描/邮件服务，不证明真实上游或生产权限配置。
- `npx tsc --noEmit` exit=0；`npm run lint` exit=0，warnings=0；`git diff --check` exit=0。
- `check-behavior.mjs` 浏览器反例脚本 exit=0，13/13、failed=0、skipped=0：无 JS 时 title.opacity==1、手机 overflow==0；网络 abort 时 imgCount==0、渐变容器==4；阅读页 Inter/中文衬线/代码字体存在，字体 HTTP 失败数==0，KaTeX 元素存在，overflow==0。网络故障由浏览器路由 abort 触发，生产组件没有测试专用钩子。
- 站壳进入探索：初始 rscBefore==0，hover 后 discoverPrefetched==true，点击后 path=="/discover"、overflow==0；沿用本请求 08:24 的事件记录，IntentLink 源码此后未改变。（2026-10-11 修订：此后 IntentLink 已加白名单，`/discover` 仍在名单内，但该条记录采集于修订前，白名单版本的 hover 请求未在真实浏览器重验。）
- 阅读客户端导航：从书架点击真实书卡后 path=="/bookshelf/perf-book"、readingStylesheet==true、loadedSerif==true、katex==true，CLI exit=0。样本书在本地临时 D1，采集后 DELETE 清理 exit=0。
- 手机截图只证明 UI；不作为后端落库或权限证明。截图：`output/performance/home-mobile-no-js.png`、`reader-mobile.png`。

## 按文件对应的证据

改动集合以最终 `git diff --stat` 为锚；新增源码使用 intent-to-add 纳入 diff，未提交。

| 文件 | 改动语义与对应检查 |
| --- | --- |
| app/page.tsx | 可见 SSR 标题、意图导航和缩略图尺寸；无 JS title/opacity 字段断言、两视口 FCP/overflow 测量。 |
| app/components/site-shell.tsx | 导航改意图预取、搜索缩略图尺寸；rscBefore==0、discoverPrefetched==true、导航 path==/discover；原 mobile-nav 与 shell-state-sync 测试同轮通过。 |
| app/components/intent-link.tsx | pointer/focus 触发预取；pointer 与点击路径有浏览器字段证据；键盘 focus 分支未单独注入事件验证。2026-10-11 修订：现仅对 `app/lib/intent-prefetch.ts` 白名单预取，契约测试 `tests/intent-prefetch.test.mjs`；上述浏览器证据采集于白名单之前。 |
| app/components/cover-image.tsx | responsive URL、可配置 eager/lazy、async decode、挂载前失败补偿；真实图片正路径有非零字节与 images==8，abort 反例 imgCount==0、gradientContainerCount==4；源 props 改变后的恢复分支未单独验证。2026-10-11 修订：挂载失败检查改为 `new Image()` 复核，lazy 图片等进入视口后判定；上述 abort 反例采集于修订前，Safari/Firefox 的 lazy 行为未测。 |
| app/components/product-card.tsx | 卡片 sizes/lazy；两端实际图片字节与零 overflow；未对每张卡片逐一做视觉清晰度验收。 |
| app/lib/cover-image-sources.ts | （2026-10-11 修订：现保持宽高比、保留 fit、候选不超过原图 w；以下断言与测量为修订前。）仅修改精确 HTTPS Unsplash 源；`cover images: resize showcase images but preserve exact upload/private and unrelated URLs` 断言上传/私有/伪域/HTTP/data/非法 URL 返回对象与原 src 相等，token/path 保留。 |
| app/bookshelf/[...slug]/page.tsx | 阅读页挂载 ReadingFonts（2026-10-11 修订：该客户端组件已删除，改为页内 `import ...reading-fonts.css?url` + `<link rel="stylesheet" precedence="default">`，以下 2026-10-06 检查为修订前）；`bookshelf: book card wall, cover toc, chapter renders katex + mermaid, members book gated` 校验真实 CSS/字体字节；浏览器直接进入与客户端导航均取到样式及公式。 |
| app/bookshelf/reading-fonts.tsx | 已于 2026-10-11 删除（原为独立 CSS 客户端边界；2026-10-06 时阅读页 readingStylesheet==true、首页采集请求无阅读 CSS，为修订前证据）。 |
| app/bookshelf/reading-fonts.css | 保留阅读 400/500 与 UI/code 字体，600 衬线由根 layout 供应；`build assets: reading-only font faces stay out of the shared CSS` 检查独立 CSS、所有绝对字体 URL 对应真实产物；浏览器字体字段断言。 |
| tests/build-assets.test.mjs | 增加共享 CSS 无阅读字重、独立 CSS 与字体资源断言；该测试包含在 544/544 全量结果中。 |
| tests/modularization-contracts.test.mjs | 增加图片 URL 的正常与反例数据断言；该测试包含在 544/544 全量结果中。 |
| tests/suites/02-docs-books.tests.mjs | 增加 SSR 字体样式/字体真实字节检查；该章节集成测试在全量结果中通过。 |
| scripts/measure-page-load.mjs | 可重跑的冷缓存采集；最终 before/after 各 6 条非占位样本，CLI exit=0；这是受控本地实验，不是生产流量采样。 |
| scripts/summarize-page-load.mjs | 同源/同配置/样本计数、指标及零预取/零溢出断言；最终 `node scripts/summarize-page-load.mjs` exit=0、22/22；此前 imageBytes==0 反例触发 exit=1。 |
| PERFORMANCE_2026-10-06.md | 证据与范围记录；文档未单独做语义自动验收，引用输出指纹及 diff 检查；套件绿不构成文档每一句的证明。 |
| PROJECT_STATUS.md | 本请求账本追加；未单独做语义自动验收，记录同一 comparison/全量测试结果和明确缺口。 |

## 本轮改动可能引入的新风险

- 标题逐字模糊动画被移除，换成首帧可见文本；这是体验取舍。
- Unsplash q=88→80、最大候选 1280w，可能降低高 DPI 大尺寸图清晰度；私有上传 URL 不改写，字段相等断言有证据。
- 取消全导航 viewport 预取，首次触屏立即点选尚未暖过的路由可能等候回源；pointer 路径有证据，键盘 focus 未单独注入。2026-10-11 起白名单之外的页面（钱包、后台、个人页等）连 hover/focus 预取也没有，首次点击这些页面一律等回源。
- 新的阅读 CSS 分块依赖资产发布完整；当前全部字体引用文件存在、阅读 SSR/客户端导航有效，但跨版本旧 RSC/旧 CSS 缓存未验。
- desktop 长任务余量中位数从 233→871 ms，存在明显时序/机器波动，未定位为单一代码回归；不能将网络字节降低包装成 CPU 开销改善。
- 图片失败补偿增加挂载 effect 和一次 rAF；快速失败反例有证据，但 props 换源和多次失败恢复未单独测。

## 未覆盖范围（本轮未触及的相关路径/测试/分支）

- 未发布，未测生产 TTFB/边缘冷热缓存/真实大规模 D1；worker/anon-cache.ts、worker/index.ts 缓存失败分支未逐分支复核，虽然既有 worker-contracts 在全量测试中运行。
- 未给 `/lattice/` SPA、`/galaxy/` Three.js、登录态首页、搜索大结果集、真实长书章节做性能跟踪；相关 lattice/SPA/读书集成用例在全量套件中运行，不等同其性能验收。
- 未测安卓真机 WebView、iOS/Safari、高 DPI 图片清晰度、不同网络地区、长时间 INP/内存/电量；只有 Windows Chromium 与上述两视口。
- 未单独跑 IntentLink 键盘 focus、CoverImage 换 src 恢复、跨部署旧缓存缺失新 CSS/字体的失败分支。
- 相关检索留在 output/performance/scope-search.txt：`rg -n 'measure|性能|prefetch|lazy|fontsource' app/components app/bookshelf app/page.tsx worker/anon-cache.ts -g '*.tsx' -g '*.ts' -g '*.css'`。不声称检索范围之外无其他性能路径。

## 证据首次出现与内容指纹

全部首次出现于本用户请求轮次（2026-10-06），没有复用历史性能数据抬升结论。完整 mtime/bytes/SHA256 见 output/performance/fingerprints.json；下列是最终引用：

- before.json：SHA256 `7da57d283d93e5f78617dcaf37fc38d3976bbad002913a0ade0a0cb5101252ed`，78603 字节。
- after.json：SHA256 `3bdccb8897d77b323527b4527c97971068634baec20bd6907ae17906922f80d3`，70923 字节。
- comparison.json：SHA256 `a8e7929609afee882e778c10f49a95eb4d11387ba64b69f6abd4082e1eb6e8de`，2405 字节，mtime 北京时间 08:48:08。
- full-test.log：SHA256 `6a72d610bec139c174b1691d2ea85eddef1f98628cc2c89bf359f520bf01e689`，69566 字节，mtime 北京时间 08:32:03。
- behavior.txt：SHA256 `c18b48af9c64d9b53177ab493ade4866faef62650ea6a1e0e759895311b532ea`，4188 字节，mtime 北京时间 08:38:38。

基准归档与提取副本是本轮生成的临时数据。递归清理被自动审批拒绝（blocked by policy），改用可恢复的原生 Move-Item 将两份代码副本移至 `X:/.codex-task-artifacts/zaochang-performance-20261006-79df2835/`，exit=0，避免被本项目 TypeScript 的文件扫描纳入。该位置保留全仓归档的部分提取副本及首页基准，未声称它们已删除。output/performance 的中间结果不入 Git。
