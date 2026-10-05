# 见界手机布局改动证据 · 2026-10-05

状态：部分完成（网页生产发布证据见末节；真实安卓 WebView/IME/刘海验收未实测）。用户随后明确请求“部署”，GitHub release-gates → deploy-production 的同 SHA 结果与线上字段断言在末节追加。初次本地证据保留原请求上下文，不作本轮新增证据。

## 本轮改动与解释

按手机与小平板的见界页面布局处理：去除聊天/创建的 262px 留白，输入与工具分行；设置和动态采用单栏；课程预览动作换行；弹窗限定视口，白板插图留在自己的行内；导航与会话面板断点由 768px 扩至 1024px。放弃“只改 768px 以下”的解释，其后果是 844px 横屏手机仍用固定侧栏、600px 高设置，关闭按钮落在屏幕外。造场主站其余页面及原生壳未作修改。

## 命题与证据

命题 Y 是本地静态 SPA 在给定屏幕和语言下的指定布局/菜单状态。证据 X 是实际 Chromium DOM 矩形、输入值、aria-expanded 和 activeTabs 字段；X 与 Y 是同一件事。它们不是生产后台、真实硬件或完整业务能力的证据。

- 初始 390px 聊天复现（本轮工具输出）：paddingLeft=262px，composer.width=32px，input.right=544.9375px > 390。最终静态产物 zh-CN/390x844/chat：input.width=297.703125，input.right=318.703125 <= 390，composer.right=378 <= 390。
- 课程预览反例：前一版静态产物英文 320px 的 scrollWidth=423 > clientWidth=320；动作换行后 browser 检查 no-horizontal-content-clipping 的 scrollWidth == clientWidth == 320。
- 静态产物矩阵：base=http://127.0.0.1:5187/lattice/；中英文，320×640、360×800、390×844、768×1024、844×390、1440×900；额外 390×440 是布局视口缩小，**不是系统键盘仿真**。10 个常用页面、设置两标签、模型菜单、草稿保留、抽屉 Escape、引导 2/3/4 步。total=571 / passed=571 / failed=0 / skipped=0，运行命令退出码=0。
- 触屏补充：Chromium CDP 设置 pointer:coarse，390×844 中文；total=5 / passed=5 / failed=0 / skipped=0，退出码=0。coarse==true，聊天按钮最小 width=46.28125、height=44；白板侧栏 right=378 <= 390，bottom=832 <= 844；插图 runnerBottom=257.8397521972656 <= art.bottom=260.1640625。
- 全量 npm test：Windows/Node/本地 Worker 测试库，退出码=0，total=538 / passed=538 / failed=0 / skipped=0。它在最后的几处纯 CSS 收尾之前运行，不能冒充最终每个样式分支的证据。
- 最终改动复跑：npm run test:lattice，退出码=0，total=200 / passed=200 / failed=0 / skipped=0；最终 CSS/SPA 类型/资产/品牌四文件检查，退出码=0，total=25 / passed=25 / failed=0 / skipped=0。与本轮前次相同套件相比统计未下降。
- 浏览器矩阵由 515 增至 525（补触控尺寸），再到 561（补课程预览），最终 571（补插图越界断言）。期间抽屉的 10 个误报来自在过渡动画结束前读矩形，改为等待真实动画结束；课程预览 5 个失败经样式修改消除，未删工况/断言。
- SPA npm run build、主站 npm run lint、SPA npm run lint、git diff --check：退出码均为 0。SPA build 证明编译，不单独证明行为。
- 资产检查读 38 个 JS/CSS/HTML，检查 52 个匹配到的带哈希引用：missing.length==0；删除的 12 个旧哈希的 stale.length==0。字体引用另有 build-assets.test.mjs 检查。

## 可复现命令与原始证据

在 X:/zaochang 执行（Playwright CLI 的本机路径保存在执行脚本中）：

~~~powershell
cd hyperknow-spa
npm run build
npm run preview -- --host 127.0.0.1 --port 5187 --strictPort
# 另一个终端，项目根目录
.\.tmp\run-lattice-mobile-audit.ps1 -BaseUrl 'http://127.0.0.1:5187/lattice/'
node .tmp/check-lattice-mobile-assets.mjs
npm run test:lattice
node --experimental-strip-types --test tests/lattice-css-health.test.mjs tests/spa-typecheck.test.mjs tests/build-assets.test.mjs tests/lattice-brand.test.mjs
npm run lint
~~~

[矩阵字段与逐断言结果](output/playwright/lattice-mobile-after.json) · [触屏数据](output/playwright/lattice-mobile-visual.json) · [资产数据](output/playwright/lattice-mobile-assets.json) · [全量测试原始日志](output/playwright/lattice-mobile-npm-test.log) · [最终检查日志](output/playwright/lattice-mobile-final-checks.log)。执行脚本位于 .tmp（本机可复现、gitignore，未成为项目持久测试入口）；证据/截图位于 output/playwright（本地留存，gitignore）。

## 按实际改动文件逐项给证据

范围锚为 git diff --stat 加 git ls-files --others --exclude-standard（后者补未跟踪的新 CSS 与新哈希产物）。以下逐文件对应验证或显式限制，不以套件总数替代。

| 文件 | 语义、证据与限制 |
| --- | --- |
| PROJECT_STATUS.md | 追加部署请求门禁账本，状态部分完成；不把提交前状态写为上线。 |
| hyperknow-spa/index.html | viewport 增加 viewport-fit 与 interactive-widget；产物 HTML 同值，浏览器 390×440 composer.bottom <= 440；真实系统键盘与刘海未实测。 |
| hyperknow-spa/src/lattice/Header.tsx | 头像改为具名 button；中英文账户菜单打开设置、切换记忆标签、关闭，settings-switch-tab 的 activeTabs == 1；未触发登出。 |
| hyperknow-spa/src/lattice/Sidebar.tsx | 1024px 断点与尺寸同步；手机 More 从抽屉外 sibling 移到 nav 内，div 变 button，打开后 scrollIntoView；矩阵实际 moreInert==false、键盘与指针激活后菜单 count==0；独立复核复跑1024/1025断点和跨断点恢复，未做 effect 注册窗口的独立时序注入。 |
| hyperknow-spa/src/lattice/shell.css | 抽屉样式断点扩至 1024px；844×390 和 1440×900 浏览器尺寸/菜单断言；未证明物理设备旋转。 |
| hyperknow-spa/src/lattice/whiteboard/whiteboard.css | 会话覆盖层断点768→1024；初次390×844 coarse侧栏矩形证据沿用，本次部署请求独立复核追加844×390会话与设置边界断言；真实讲课和多指操作未验证。 |
| hyperknow-spa/src/main.tsx | 导入集中手机样式；静态产物浏览器的 desktop-gutter-removed 实测 paddingLeft == 0px。 |
| public/lattice/assets/ChatPage-CrcYPB06.js | 重建移除旧哈希；check-lattice-mobile-assets.mjs 的 stale.length == 0，当前 JS/CSS/入口不再引用此旧文件；不构成独立业务行为验证。 |
| public/lattice/assets/CourseJourney-DNdvDG2B.js | 重建移除旧哈希；check-lattice-mobile-assets.mjs 的 stale.length == 0，当前 JS/CSS/入口不再引用此旧文件；不构成独立业务行为验证。 |
| public/lattice/assets/CoursesPage-Ct6wM2gE.js | 重建移除旧哈希；check-lattice-mobile-assets.mjs 的 stale.length == 0，当前 JS/CSS/入口不再引用此旧文件；不构成独立业务行为验证。 |
| public/lattice/assets/CreatePage-CJYzQUmq.js | 重建移除旧哈希；check-lattice-mobile-assets.mjs 的 stale.length == 0，当前 JS/CSS/入口不再引用此旧文件；不构成独立业务行为验证。 |
| public/lattice/assets/HistoryPage-6lluyh3x.js | 重建移除旧哈希；check-lattice-mobile-assets.mjs 的 stale.length == 0，当前 JS/CSS/入口不再引用此旧文件；不构成独立业务行为验证。 |
| public/lattice/assets/LearningFeed-ULme-4lF.js | 重建移除旧哈希；check-lattice-mobile-assets.mjs 的 stale.length == 0，当前 JS/CSS/入口不再引用此旧文件；不构成独立业务行为验证。 |
| public/lattice/assets/MarketplacePage-D5BDLDxz.js | 重建移除旧哈希；check-lattice-mobile-assets.mjs 的 stale.length == 0，当前 JS/CSS/入口不再引用此旧文件；不构成独立业务行为验证。 |
| public/lattice/assets/PlansPage-CIGfXVNN.js | 重建移除旧哈希；check-lattice-mobile-assets.mjs 的 stale.length == 0，当前 JS/CSS/入口不再引用此旧文件；不构成独立业务行为验证。 |
| public/lattice/assets/WhiteboardPage-BtDG1wbv.js | 重建移除旧哈希；check-lattice-mobile-assets.mjs 的 stale.length == 0，当前 JS/CSS/入口不再引用此旧文件；不构成独立业务行为验证。 |
| public/lattice/assets/WhiteboardPage-r7SPqLDN.css | 重建移除旧哈希；check-lattice-mobile-assets.mjs 的 stale.length == 0，当前 JS/CSS/入口不再引用此旧文件；不构成独立业务行为验证。 |
| public/lattice/assets/index-DpLH91S7.css | 重建移除旧哈希；check-lattice-mobile-assets.mjs 的 stale.length == 0，当前 JS/CSS/入口不再引用此旧文件；不构成独立业务行为验证。 |
| public/lattice/assets/index-DyNHSrtd.js | 重建移除旧哈希；check-lattice-mobile-assets.mjs 的 stale.length == 0，当前 JS/CSS/入口不再引用此旧文件；不构成独立业务行为验证。 |
| public/lattice/index.html | 本次部署请求重建入口与 viewport；SPA build exit=0、哈希引用缺失计数==0；发布后线上 bytes==914、SHA256==提交 blob，详见末节。真实系统键盘行为未实测。 |
| tests/lattice-css-health.test.mjs | 新 CSS 纳入现有注释扫描；lattice CSS:注释不得包含花括号、course journey 布局主规则存活，两项 pass=2 / fail=0 / skipped=0；该扫描不证明视觉正确。 |
| MOBILE_ADAPTATION_2026-10-05.md | 刷新实际文件集合、独立复核反例、最终源 full-test 538/538 和指纹；文档本身不证明运行。 |
| hyperknow-spa/src/lattice/mobile.css | 集中手机样式与抽屉内 More 静态排版；本次部署请求静态产物矩阵 621/621，fail=0、skipped=0，more-contained、more-not-inert、more-keyboard-activation、more-pointer-activation 均为具体字段断言；真实 IME/刘海未验证。 |
| public/lattice/assets/ChatPage-I8IAxsk5.js | 重建生成新哈希；静态浏览器 chat 路径 content-contained；资产检查 missing.length == 0。对应几何字段有断言；该文件未单独验证其所有业务分支。 |
| public/lattice/assets/CourseJourney-CGkJThYw.js | 重建生成新哈希；静态浏览器 course/preview 路径 content-contained；资产检查 missing.length == 0。对应几何字段有断言；该文件未单独验证其所有业务分支。 |
| public/lattice/assets/CoursesPage-CcX1tbnb.js | 重建生成新哈希；静态浏览器 courses 路径 content-contained；资产检查 missing.length == 0。对应几何字段有断言；该文件未单独验证其所有业务分支。 |
| public/lattice/assets/CreatePage-C6ee__tf.js | 重建生成新哈希；静态浏览器 create 路径 content-contained；资产检查 missing.length == 0。对应几何字段有断言；该文件未单独验证其所有业务分支。 |
| public/lattice/assets/HistoryPage-Y5GM5l1a.js | 重建生成新哈希；静态浏览器 history 路径 content-contained；资产检查 missing.length == 0。对应几何字段有断言；该文件未单独验证其所有业务分支。 |
| public/lattice/assets/LearningFeed-mzrS9YgQ.js | 重建生成新哈希；静态浏览器 feed 路径 content-contained；资产检查 missing.length == 0。对应几何字段有断言；该文件未单独验证其所有业务分支。 |
| public/lattice/assets/MarketplacePage-CP8VyCdH.js | 重建生成新哈希；静态浏览器 marketplace 路径 content-contained；资产检查 missing.length == 0。对应几何字段有断言；该文件未单独验证其所有业务分支。 |
| public/lattice/assets/PlansPage-qhuxA1N3.js | 重建生成新哈希；静态浏览器 plans 路径 content-contained；资产检查 missing.length == 0。对应几何字段有断言；该文件未单独验证其所有业务分支。 |
| public/lattice/assets/WhiteboardPage-DTvFojDW.js | 重建生成新哈希；静态浏览器 whiteboard 路径 content-contained；资产检查 missing.length == 0。对应几何字段有断言；该文件未单独验证其所有业务分支。 |
| public/lattice/assets/WhiteboardPage-hj8k-5YN.css | 重建生成新哈希；静态浏览器 whiteboard 路径 content-contained；资产检查 missing.length == 0。对应几何字段有断言；该文件未单独验证其所有业务分支。 |
| public/lattice/assets/index-DcqzhFCm.js | 重建生成新哈希；入口使用新主 bundle；资产检查 missing.length == 0。该 bundle 未单独验证全部业务分支，套件绿不构成其全部语义证明。 |
| public/lattice/assets/index-zxba1WPA.css | 重建生成新哈希；入口使用新主 bundle；资产检查 missing.length == 0。该 bundle 未单独验证全部业务分支，套件绿不构成其全部语义证明。 |

## 本轮改动可能引入的新风险

- 769–1024px 导航从固定侧栏变为抽屉，需要多一次打开操作；844×390 和 1440×900 的几何断言已执行，所有中间宽度与物理旋转未逐一验证。
- 320–374px 聊天工具增加一行，占用更多垂直空间；这是保留功能与 >=44px 热区的取舍。390×440 布局缩小断言不证明各厂商 IME 行为。
- viewport-fit、安全区内边距与安卓原生 Insets 组合的实机表现未知；常规浏览器安全区值为 0 的证据不能推出刘海屏/沉浸全屏结论。
- 新集中 CSS 的选择器优先级覆盖按需页面 CSS；真实后台长标题、长附件、多单元复杂课程、生成蓝图侧板/失败状态仍可能有未暴露的溢出。
- 构建替换旧哈希文件，生产滚动发布中的旧页面/旧缓存资源请求未验证。

## 未覆盖范围（本轮未触及的相关路径/测试/分支）

- 无连接的安卓设备：adb devices 输出只有表头；真实 WebView、系统键盘、刘海、Android 全屏切换/进程恢复未验证。iOS Safari、其余五个语言字典也未跑浏览器工况。
- 未读/未改主站 app/globals.css 全部手机规则、android/MainActivity.kt 全部控制分支；仅读取 Insets 相关段。主站其余模块不在本次布局修正范围。
- 引导第 1/5/6/7/8/9/10 步未跑矩阵；创建课程的真实问询/流式生成/蓝图侧板、断网重试、权限拒绝、余额不足、退款 UI 未触发。API requireMember/扣费/生成端点未作为本轮界面调试的读改范围。
- 会话面板在 390×844 与 844×390 打开，其他会话状态未测，不把静态白板开场矩阵扩张成所有白板对话状态的覆盖；画布拖拽/双指缩放、真实 TTS/讲课/导出、反馈上传未跑端到端。
- 未运行的其他相关顶层测试名：经检索无其他相关顶层 .test.mjs；命令按 tests 文件名匹配 lattice|whiteboard|hyperknow|spa-typecheck 并与 package.json scripts.test 比对，relatedFiles=21，notInFullSuite=[]。这不证明所有业务分支都有现成测试。
- 初次本地请求轮次不含生产部署、APK 更新或真机验收；随后“部署”请求的网页发布证据见末节，仍不能声明手机真机验收通过。

## 首次产物指纹（本请求轮次）

- hyperknow-spa/src/lattice/mobile.css: mtime=2026-10-05T06:43:00.408Z, SHA256=e595f5e679da83d8aac5d181696a03fac572fda746a3f0f7a0bd731cfe848dbe
- public/lattice/index.html: mtime=2026-10-05T06:43:23.291Z, SHA256=31518bbfc1d8c97f19b1e700a0bb156dac609ac484624370c6a349601f74277c
- output/playwright/lattice-mobile-after.json: mtime=2026-10-05T06:45:30.849Z, SHA256=d7dcb79e11204eaa8564e832f9a21fa251792c18504d5b587c27273a4725af92
- output/playwright/lattice-mobile-visual.json: mtime=2026-10-05T06:45:03.634Z, SHA256=581333289d5cdeb64b0fd5e22265ec06b2085d2fd339bd8208ce7d4f86eea8f3

## 初次本地请求的 git diff --stat 快照

~~~text
 PROJECT_STATUS.md                                  |  8 +++++
 hyperknow-spa/index.html                           |  2 +-
 hyperknow-spa/src/lattice/Header.tsx               |  8 +++--
 hyperknow-spa/src/lattice/Sidebar.tsx              |  6 ++--
 hyperknow-spa/src/lattice/shell.css                |  4 +--
 .../src/lattice/whiteboard/whiteboard.css          |  2 +-
 hyperknow-spa/src/main.tsx                         |  1 +
 public/lattice/assets/ChatPage-CrcYPB06.js         | 34 ----------------------
 public/lattice/assets/CourseJourney-DNdvDG2B.js    |  1 -
 public/lattice/assets/CoursesPage-Ct6wM2gE.js      |  1 -
 public/lattice/assets/CreatePage-CJYzQUmq.js       |  1 -
 public/lattice/assets/HistoryPage-6lluyh3x.js      |  1 -
 public/lattice/assets/LearningFeed-ULme-4lF.js     |  1 -
 public/lattice/assets/MarketplacePage-D5BDLDxz.js  |  1 -
 public/lattice/assets/PlansPage-CIGfXVNN.js        |  1 -
 public/lattice/assets/WhiteboardPage-BtDG1wbv.js   | 14 ---------
 public/lattice/assets/WhiteboardPage-r7SPqLDN.css  |  1 -
 public/lattice/assets/index-DpLH91S7.css           |  1 -
 public/lattice/assets/index-DyNHSrtd.js            | 16 ----------
 public/lattice/index.html                          |  6 ++--
 tests/lattice-css-health.test.mjs                  |  1 +
 21 files changed, 27 insertions(+), 84 deletions(-)
~~~

未跟踪文件另由上述逐文件表纳入；未创建 commit，不使用历史 commit 标题作当前工作区的完成证据。

## “部署”请求的发布前记录

- 独立复核发现 More 反例：844×390 下 bottom=394>390，inert==true，实际命中侧栏 footer；手机菜单现置于抽屉内并改为原生 button，正常文档流+最近滚动。新矩阵 621/621，failed=0、skipped=0，包含新增50个 More 几何/inert/焦点/键盘/指针断言，未删除原571个工况断言。命令 .tmp/run-lattice-mobile-audit.ps1 -BaseUrl http://127.0.0.1:5187/lattice/ -EvidenceTag release-local，exit=0。
- 最终源全量 npm test，Windows Node 24.13.1，exit=0：tests=538、pass=538、fail=0、skipped=0、todo=0，与上一基线538无下降。原始日志 output/playwright/lattice-mobile-deploy-full-test.log。
- npm ci 最初两次 EPERM 失败，Vite预览停止后仍有原生模块占用；残留依赖保留在 ignored node_modules.xdrive-partial-*。默认安装还遇到195–247秒串行元数据请求，随后中止X盘慢安装；最终在C:/Users/Abraham/AppData/Local/zaochang-mobile-deploy-20261005运行 npm ci --prefer-offline --no-audit，exit=0、added 709 packages in 1m，日志 local-runtime.log。生产审计另行执行；两份package-lock SHA256都为8622ECEDECE0D7BD2B2DAB9BAC3C8B6E05AEDC1655DFCEFAE6C1DD7405529278，X:/zaochang/node_modules为指向此runtime的junction。3个10月1日启动的本仓库Vinext开发进程93496/101308/105740因锁模块停止；没有修改生产进程。不把失败或中止尝试记成通过。
- 发布门禁 npx tsc --noEmit、npm run lint、npm run db:generate + git diff --exit-code -- db/schema.ts drizzle、node scripts/check-env-split.mjs、npm audit --omit=dev --audit-level=high --prefer-online：本轮各 exit=0；production audit all-severity total=0；生产迁移门禁由 deploy workflow 使用受控 token 运行，不绕过。
- 上线前正式会话采样 https://aetherstudio.top/lattice/#/chat，390×844：旧入口 index-DyNHSrtd.js，paddingLeft=262px，inputWidth=20，inputRight=544.9375>390（output/playwright/lattice-mobile-production-before.log）。
- 回退锚点：Worker 673b4413-4722-4f30-8516-6c944ce0a740，D1 Time Travel bookmark 000011f7-00000000-000050fb-8a8e24ec65f8a0160d4a963fc0f1ae14（本次部署请求只读取得，两个 Wrangler 命令exit=0）。
- 新风险补记：手机 More 改成抽屉内展开，会使后面的最近活动区域向下移动；小横屏需要抽屉滚动。按钮仍显示知识库尚未接入，不声称知识库业务可用。
- 独立资产复核额外发现预存 assets/css/MessageBubble-DhyQ6Pwf.css、SplitLayout-BQlerRSS.css 的旧 Xiaolai 路径缺失；当前入口/JS/顶层CSS未引用它们，且不在本轮diff；这两个未使用遗留文件不是本轮菜单/布局的验证证据。
- 未覆盖范围沿用上节并补充：生产实际内容与生产菜单的浏览器断言在发布后另行记录；尚无真机。只有一个独立复核 agent，无多 agent 同问题分歧合并。

本次部署请求的新产物指纹（与初次产物区别）：

- hyperknow-spa/src/lattice/mobile.css: mtime=2026-10-05T07:02:13.027Z, SHA256=46866c3419e655c84941988430cac349b2b0b85747f2684a86644eaff07c49ff
- hyperknow-spa/src/lattice/Sidebar.tsx: mtime=2026-10-05T07:02:12.920Z, SHA256=9f38fb3321df390eb3fbbb2e3ff7bff528d36d74d36b5cb337da8f22c8ec5c3d
- public/lattice/index.html: mtime=2026-10-05T07:37:15.674Z, SHA256=b1a8781e633d9c181429f121997421d91af412c9ab571eabdf6db0c377acfc9f
- output/playwright/lattice-mobile-release-local.json: mtime=2026-10-05T07:45:28.776Z, SHA256=27211f272379e3fcce3d883284fb361ca35069324bbe5a1c86ba9dec1b6ad285


## “部署”请求的生产结果（2026-10-05 16:04 CST 发布）

- 当前提交 b5249eaac932a8d04702702f45f5d18bad2f2cf9，git log -1 状态为 HEAD -> main, github/main, github/HEAD；标题原文 lattice: adapt phone layouts and accessible drawer menu，无 gap/todo/not-yet 限定词。git ls-remote github refs/heads/main 返回相同 SHA，exit=0。未创建 PR，未另发 APK。
- [release-gates](https://github.com/lizuyi-6/zaochang/actions/runs/37280891500) 与 [deploy-production](https://github.com/lizuyi-6/zaochang/actions/runs/37281147414) 均 status==completed、conclusion==success、headSha==上述SHA，gh run view <runID> --json databaseId,workflowName,status,conclusion,headSha,url,createdAt,updatedAt，exit=0；原字段 [production-runs.json](output/playwright/lattice-mobile-production-runs.json)。环境 Linux/Node 22.13，正常npm ci与所有门禁；两次npm test均 total=538、passed=538、failed=0、skipped=0、todo=0，与本地538无下降，production audit found 0 vulnerabilities。选摘日志为 release-gates-evidence.log、production-deploy-evidence.log。
- Worker版本50a5cb24-809f-435b-b327-ebfff027510a，发布日志时间2026-10-05T08:04:37.895Z；wrangler deployments list --config wrangler.prod.jsonc，exit=0，最新Version(s)==(100%)该版本。没有本机直接部署绕过CI。
- 迁移门禁输出journal.count==production.count==30、latest.created_at==1791173022484，exit=0；6条历史账目为tag入帐，无内容hash可比，不证明这6条迁移内容逐字一致。本轮未改DB schema、迁移或权限/安全代码路径。
- 命题Y：生产边缘返回本提交13个新增/改写网页产物。证据X：每文件status==200、bytes==expectedBytes、sha256==git show HEAD:path的blob哈希，X与Y同一件事，不是仅HTTP状态码。命令 .tmp/verify-lattice-prod-assets.ps1，exit=0，total=13、passed=13、failed=0、skipped=0；HTML实测914字节，主CSS实测79254字节。[完整资产字段](output/playwright/lattice-mobile-production-assets.json)。
- 命题Y：发布页面在所列视口/语言/菜单状态下满足布局断言。证据X：实际Chromium DOM几何、paddingLeft、inert、输入值和菜单数量字段，X与Y同一件事。命令 .tmp/run-lattice-mobile-audit.ps1 -BaseUrl https://aetherstudio.top/lattice/ -SessionName lattice-prod -EvidenceTag production，exit=0，total=621、passed=621、failed=0、skipped=0，与最终本地621相同，未过滤/删除/禁用用例；前置为正式站点验收会话，只导航与本地UI操作，未发起建课、消息或扣费请求。[完整逐断言数据](output/playwright/lattice-mobile-production.json)。
- 390×844中文聊天：发布前input.right=544.9375>390、width=20、paddingLeft=262px；发布后input.right=318.703125<=390、width=297.703125、composer.right=378<=390、paddingLeft==0px。英文320px课程预览scrollWidth==clientWidth==320；844×390 More inert==false，Enter/点击后菜单count==0；390×440 composer.bottom==428<=440且草稿字段等于填入值。缩小布局视口不是系统IME证据。
- [生产首页截图](output/playwright/lattice-mobile-production-home.png)、[生产白板开场截图](output/playwright/lattice-mobile-production-whiteboard.png)仅证明UI渲染；不证明截图积分来源、数据持久化或权限。独立复核只有一个agent，最终本地59/59、failed=0、skipped=0、exit=0；范围及原命令后补落盘说明见 .tmp/lattice-mobile-independent-repro.md。原命令未再次执行，不计为新增测试；生产621另行执行。

### 逐发布文件的线上证据

每行只证明该发布文件与提交内容一致；页面几何与菜单行为另由621字段断言证明，不扩张为全部业务分支验收。源文件、删除的旧哈希和测试文件的逐项语义沿用前方35路径表。

| 文件 | 针对本文件的字段断言 |
| --- | --- |
| public/lattice/assets/ChatPage-I8IAxsk5.js | bytes=29494==expectedBytes；SHA256=e0a9311f99e3570ed2635757efedbb0646826fdf83cc0621ddb5786d5fe7292e==提交 blob |
| public/lattice/assets/CourseJourney-CGkJThYw.js | bytes=25933==expectedBytes；SHA256=2a6222e6d6a8beef21cf786ac6a9ccdb1d390ee5998893f8a0082134e74db206==提交 blob |
| public/lattice/assets/CoursesPage-CcX1tbnb.js | bytes=12429==expectedBytes；SHA256=3b747a53791f84b4aeb2ad1720ae51732d5cc49d761a4c2c9b34d951bd54ef81==提交 blob |
| public/lattice/assets/CreatePage-C6ee__tf.js | bytes=27269==expectedBytes；SHA256=7ca059600da9e52696939e903ce1d89b8fdc7f1d049e358cd7a5ab1ad4e3ab13==提交 blob |
| public/lattice/assets/HistoryPage-Y5GM5l1a.js | bytes=4364==expectedBytes；SHA256=c19ece1f524dd5345708a2edca9b9b8f41e727749335400579c9fd5fe83337c7==提交 blob |
| public/lattice/assets/LearningFeed-mzrS9YgQ.js | bytes=13396==expectedBytes；SHA256=0211566dfed5a2be78987eac3c4dfde76f9cd51aaf181d159c94d05429596bc7==提交 blob |
| public/lattice/assets/MarketplacePage-CP8VyCdH.js | bytes=5418==expectedBytes；SHA256=10863954069ff0e8609e217937fed4e88b84ca73cbebd82ab4c5fec3a5e5214e==提交 blob |
| public/lattice/assets/PlansPage-qhuxA1N3.js | bytes=3528==expectedBytes；SHA256=3c43833c17283af23f58f4b3b9cf0c2f7623ceecc26ff2f30f95f09a51be57de==提交 blob |
| public/lattice/assets/WhiteboardPage-DTvFojDW.js | bytes=127313==expectedBytes；SHA256=710bedcb2208740db0736d65ab32399d5920ea2fb33e13bd75c004ad2fc305d2==提交 blob |
| public/lattice/assets/WhiteboardPage-hj8k-5YN.css | bytes=36175==expectedBytes；SHA256=0b88864fd5ed8fd6d06a5d8e17598a0ceadfeeeddeb9aa4152cbe69da0ea0c18==提交 blob |
| public/lattice/assets/index-DcqzhFCm.js | bytes=385997==expectedBytes；SHA256=d8d0f81428cf22dff3a9283bdfde0a8268d31e6892396f84e9816c123a571239==提交 blob |
| public/lattice/assets/index-zxba1WPA.css | bytes=79254==expectedBytes；SHA256=f5aab0794a2d58f209a93281987d4ed9809e06952682d9c01658fa7cd0a73c57==提交 blob |
| public/lattice/index.html | bytes=914==expectedBytes；SHA256=b1a8781e633d9c181429f121997421d91af412c9ab571eabdf6db0c377acfc9f==提交 blob |

### 未覆盖范围（发布后）

安卓/iOS真机、WebView系统键盘/刘海/全屏切换/进程恢复、其他五种语言、引导1/5–10、真实生成/讲课/TTS/手势/断网恢复、生产失败分支、旧缓存页面跨版本懒加载未验证。主站其余模块、原生壳与前方遗留未使用CSS不在本轮布局范围。21个相关顶层测试全部在全量套件内，不证明不存在未测试业务分支；未读函数/文件等详细范围沿用前方未覆盖范围节。

### 本轮改动可能引入的新风险

769–1024px改抽屉后导航增加一次打开动作；320–374px工具栏增加一行；More展开使最近活动区下移，小横屏需滚动。真实安全区/键盘及旧缓存跨版本资源请求仍缺实测证据，不作真机可用态声明。发布未修改安全默认值、限额、鉴权或DB语义。

### 发布后记录文件验证与留痕

- MOBILE_ADAPTATION_2026-10-05.md：区分历史本地状态与当前生产字段；生成脚本断言SHA、两run状态、621/13统计和聊天/More字段匹配后再写入（exit=0）；文档不是运行证明。
- PROJECT_STATUS.md：追加账本且保留状态部分完成，显式列真机缺口；同一脚本读取实际字段生成账本（exit=0）；状态文字不替代运行证据。
- 两份发布后记录仅本地追加，未另推无代码变化的文档提交触发重复发版；生产代码锚点仍为b5249eaac932a8d04702702f45f5d18bad2f2cf9。发布前35路径范围取自 git show --no-renames --name-status HEAD；发布后本地差异以 git diff --stat 为准，不将生产改动范围收窄成只有文档。

本次“部署”请求新采集的生产证据指纹（首次出现于本请求轮次）：

- output/playwright/lattice-mobile-production-runs.json: mtime=2026-10-05T08:13:20.023Z, SHA256=b74d23bf7aaa5653746eca8d232a218c9056e0cf3d6e8a2609146d4e896346e0
- output/playwright/lattice-mobile-production-assets.json: mtime=2026-10-05T08:08:08.343Z, SHA256=a29a99466be6923e756066306d446e2024712a07ab194fd41cd1df30b1b8afdf
- output/playwright/lattice-mobile-production.json: mtime=2026-10-05T08:13:40.626Z, SHA256=cebd408ae2a6b2571a1e9da921fd193cbcd295ebc588f3b887e3b54ed707aae7
- output/playwright/lattice-mobile-production-versions.log: mtime=2026-10-05T08:12:07.526Z, SHA256=64b7d96dad4847b8b51795a72b4f45c5ec0b6b99d75a5eacd7552db23cf0eb93
- output/playwright/lattice-mobile-production-home.png: mtime=2026-10-05T08:13:39.041Z, SHA256=e148307f94d4d8f0b247d23906109acfad98cde4d1277f96c7ac16394a5695a6
- output/playwright/lattice-mobile-production-whiteboard.png: mtime=2026-10-05T08:13:39.870Z, SHA256=ff9f3cd81a4805aeda987eea41866e21591f1729a10f62662a31a68b76c7eb5c

生产代码提交范围（git show --stat HEAD）：

~~~text
b5249ea lattice: adapt phone layouts and accessible drawer menu
 MOBILE_ADAPTATION_2026-10-05.md                    | 153 ++++++++++++++++++
 PROJECT_STATUS.md                                  |  15 ++
 hyperknow-spa/index.html                           |   2 +-
 hyperknow-spa/src/lattice/Header.tsx               |   8 +-
 hyperknow-spa/src/lattice/Sidebar.tsx              |  42 +++--
 hyperknow-spa/src/lattice/mobile.css               | 179 +++++++++++++++++++++
 hyperknow-spa/src/lattice/shell.css                |   4 +-
 .../src/lattice/whiteboard/whiteboard.css          |   2 +-
 hyperknow-spa/src/main.tsx                         |   1 +
 .../{ChatPage-CrcYPB06.js => ChatPage-I8IAxsk5.js} |   2 +-
 ...urney-DNdvDG2B.js => CourseJourney-CGkJThYw.js} |   2 +-
 ...sesPage-Ct6wM2gE.js => CoursesPage-CcX1tbnb.js} |   2 +-
 ...eatePage-CJYzQUmq.js => CreatePage-C6ee__tf.js} |   2 +-
 ...oryPage-6lluyh3x.js => HistoryPage-Y5GM5l1a.js} |   2 +-
 ...ngFeed-ULme-4lF.js => LearningFeed-mzrS9YgQ.js} |   2 +-
 ...age-D5BDLDxz.js => MarketplacePage-CP8VyCdH.js} |   2 +-
 ...PlansPage-CIGfXVNN.js => PlansPage-qhuxA1N3.js} |   2 +-
 ...Page-BtDG1wbv.js => WhiteboardPage-DTvFojDW.js} |   2 +-
 ...ge-r7SPqLDN.css => WhiteboardPage-hj8k-5YN.css} |   2 +-
 public/lattice/assets/index-DcqzhFCm.js            |  16 ++
 public/lattice/assets/index-DyNHSrtd.js            |  16 --
 .../{index-DpLH91S7.css => index-zxba1WPA.css}     |   2 +-
 public/lattice/index.html                          |   6 +-
 tests/lattice-css-health.test.mjs                  |   1 +
 24 files changed, 416 insertions(+), 51 deletions(-)
~~~
