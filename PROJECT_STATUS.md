# 造场项目账本

## 2026-08-29(八)《Hello System》V1 冻结:78 节点定数 + UPSERT 发布语义 + 冻结回归测试(已上线,生产复验通过)

- 状态:已上线。冻结 commit `95bc851`(16 文件,+3422/-378)push → ci `release-gates@95bc851`(33230069204)success → deploy `deploy-production`(33230133286)success;后续 `511e903` 修正 verify-live 重定向比对(见下)。生产 D1 以围栏感知剥离文件执行 UPSERT 重导(changes 79 / rows_written 390 / 180ms),回读 hello-system 78 节点、全库 190 节点、孤儿节点 0。
- **节点定数**:真实节点数为 **78**(1 书根 + 序言 + 序章 + 6 部分容器 + 60 章(12+12+13+9+9+5) + 8 附录 + 后记);此前账本中"79 节点"为口径误记(把书根与"78 章节目录"重复计数),生产 `COUNT(*)` 实证 78。78 为 V1 权威定数,生成器头注释、附录 H、冻结测试与快照 `v1-snapshot.json` 全部统一。
- **发布语义(最高优先级工程修复)**:`build-all.mjs` 由"DELETE 全书 docs + 清 reading_progress 再重建"改为 `INSERT ... ON CONFLICT(id) DO UPDATE` 幂等 UPSERT;`updated_at` 仅在内容实际变化时刷新(CASE WHEN … IS NOT …)。生产实证:导入前 `reading_progress` 全表 5 行,导入后仍为 5 行——普通正文发布零触碰阅读进度,未伪造任何历史进度。章节删除今后只能走显式迁移。
- **附录 F 挂载修复**:parentId 由 part-5 纠正为书根(id/slug 不变,URL 保持 `/bookshelf/hello-system/appx-f-myths-faq`);旧层级 URL `/bookshelf/hello-system/part-5/appx-f-myths-faq` 在 `page.tsx` 中 307 重定向到新 URL(vinext 无 next.config redirects 支持),不静默 404。生产实证:新 URL 200、旧 URL 307 → 新 URL。
- **既有线上缺陷修复**:根级 sort_order 冲突(序言 1/序章 2 与 part-1 1/part-2 2 撞号,`listAllDocs` 回退按 created_at+id 排序导致线上目录 part-1 排在序言之前);部分容器改 3-8,生产目录实证 preface → prologue → part-1..6 → appx-a..h → epilogue。
- **21 章技术表述修订**(反绝对化/反伪精确清扫):2^n 状态模型标注教学简化、伪 JVM 栈帧图改源码语义模型、DOM≠"C++ 对象"、代理主键降为常见选择、16KiB 标注 InnoDB 默认配置、Durability 口径统一为"所承诺的故障模型与持久化配置下成功提交的效果应在恢复后保留"(ch36/ch52 双章一致)、五元组限定已建立 TCP 流、HTTP 文本仅限起始行+头部且 HTTP/3=QUIC、JS 大整数为舍入非截断、JWT 签名未加密、@Transactional 标注代理模式、RFC 7807→9457、Testcontainers 删 100% 一致性、ch56 删鼠标微动开关/坐标/LSN 伪精确并改从 DOM click 起笔、ch57 删"软件工程第一定律"、ch59 改题《框架消失以后:留在脑海中的核心问题》等;另修一处规格外真实错误:Vue PatchFlag 9→3(TEXT|CLASS)。正文 190,406 → 198,830 字节(+4.4%),结构修复非重写,体量与基线等价。
- **冻结回归测试(失败即禁止发布)**:`tests/hello-system-freeze.test.mjs` 39 断言——78 节点/60 章编号连续/父级存在且无环/同级 sort_order 唯一/快照 id+slug 逐字一致/生成 SQL 无 `DELETE FROM reading_progress`/78 个 ON CONFLICT/created_at 不被覆盖/**进度保存测试**(临时 sqlite 全量迁移建库→插阅读进度→重跑 UPSERT→断言进度存活且 last_chapter_id 可解析)/18 条禁用表述回潮拦截/规范模型 DDL 列禁(status/version/semester/deleted/active)与 UNIQUE(student_id,course_id)/EnrollRequest 无 studentId/围栏配对与 Mermaid 图型/零 emoji。测试顶部 import 生成器保证 SQL 与源码同步。`npm test` = build + 集成 105 + 冻结 39 = **144/144 通过**,tsc/eslint 双净。
- **verify-live 升级**:检查数组化(HTTP 状态/标题/包含/排除/重定向断言),TOC 结构校验(77 个非根链接、appx-f 在根部、无 part-5 下旧链接);`511e903` 修正 Location 绝对 URL 归一化(Next redirect() 写绝对形式,原样比对误报)。生产冒烟 **9/9 PASS**。
- 本轮改动可能引入的新风险:①UPSERT 不再清理"已废弃节点"——若未来真删章,残留节点需显式迁移清除(语义转向是有意的);②正文 +4.4% 主要集中于 ch36/ch48/ch56 口径段落,已抽查渲染正常;③匿名边缘缓存 60s 窗口内目录可能短暂滞后,本轮验证已在窗口外。
- 未覆盖范围:60 章未逐章生产走查(本地全量 78 节点已导 + 线上 6 页抽查 + TOC 结构校验);登录态阅读进度写入路径未实测(生产 5 行进度数据保全已实证)。

## 2026-08-29(七)《Hello System》全书修订版重发:内容收紧 1500 行 + 修复上轮误删的正文 COMMIT(已上线,生产复验通过)

- 状态:已上线。commit `701ab0a`(生成器 8 文件 + SQL)push → ci `release-gates@701ab0a`(33222318529)与 deploy `deploy-production`(33222407704)双 success;生产 D1 以围栏感知剥离文件重导(写入 553 行),回读 79 节点与本地 Miniflare 一致(正文总长 76488 逐数吻合)。
- 内容修订:全书正文净收窄约 1500 行(191KB→158KB),结构不变(书根 + 78 章节目录、6 部分 60 章);教学示例改用 course id 2048,书根摘要换新措辞;SQL 保持幂等全量替换语义。本地库经 `import-local-hellosystem.mjs` 同步新版。
- **上轮缺陷披露与修复**:上一轮生产导入用 `sed '/^COMMIT;$/d'` 剥事务包裹,误删了正文 Markdown 围栏内的 2 处 `COMMIT;`(第 37 章两个并发控制 SQL 示例)——生产 `body_md` 受损 1 个文档。本轮改为围栏感知剥离(只删文件级 `BEGIN TRANSACTION;` 与末行 `COMMIT;`,保留正文 4 处),重导后线上 curl 验证第 37 章 `COMMIT;` 回归(×3)、`INSERT…``` ` 紧邻围栏的损伤模式清零。教训入 commit message:书内 SQL 代码块是正文,剥语句必须按围栏状态。
- 证据(视觉亲验,headless Chrome 直打生产):书架卡片描述为新措辞;书主页「更新于 2026-08-29」+新摘要;`/bookshelf/hello-system/part-3/37-concurrency-and-locking` 200,面包屑/右栏目录(方案 A/方案 B FOR UPDATE)/进度 39/71 正常,底部代码块含完整 `START TRANSACTION;`。均截图目检。
- 本轮改动可能引入的新风险:①无 schema/迁移变更,纯 docs 数据替换;②章节 URL 为层级路径(需含 part 段),扁平路径 404 是路由设计非缺陷;③匿名边缘缓存 60s 窗口内书架/章节可能短暂滞后旧版。
- 未覆盖范围:60 章未逐章生产走查(本地全量已导 + 线上抽查 3 页);登录态阅读进度/「问 AI」未在新版复测。

## 2026-08-29(六)第三本书《Hello System · 图解软件系统》发布:60 章生成器与产物入库,CI 部署 + 生产 D1 导书(已上线,生产复验通过)

- 状态:已上线。commit `e52ef89`(生成器/SQL/脚本 14 文件)push → ci `release-gates@e52ef89`(33190710797)success → deploy `deploy-production`(33190819982)success;生产 D1 导入 `content/import-hellosystem.sql`——远端 import 端点拒收显式 `BEGIN TRANSACTION/COMMIT`(与本地 node:sqlite 用法冲突),剥去事务包裹后 `d1 execute --file` 写入 474 行,回读 79 节点(书根 public + 78 章节/目录)与本地 Miniflare 库一致。
- 内容:《Hello System · 图解软件系统》60 章(6 部分 + 序言/序章 + 附录/后记),主线 Mini Campus 校园选课系统,图解面向对象、分层架构、Vue 响应式、关系范式、事务并发与全链路 HTTP 调用;`scripts/builder-system/`(core/part1-6/appendix/build-all)模块化生成器、`import-local-hellosystem.mjs` 本地挂载脚本、3 个 CDP 截图脚本一并入库。纯 `docs` 表数据,无 schema/迁移变更。
- 门禁注记:CI `git diff --check` 跑在干净 checkout 上(diff 恒空),正文 Markdown 双空格硬换行的尾随空格不构成门禁风险(Hello Computer 先例同);新增 .mjs 脚本 eslint 0 错,tsc include 不含 .mjs。
- 证据(视觉亲验,headless Chrome 直打生产):书架三书并排(Hello System 卡片 79 节,与 Hello LLM/Hello Computer 同列);`/bookshelf/hello-system` 书主页标题/摘要/左栏目录完整;`/bookshelf/hello-system/preface` 面包屑/正文/右栏目录正常,均 200。
- 本轮改动可能引入的新风险:①生产导入失去显式事务原子性(端点限制),SQL 幂等(先删后插)可安全重跑,中途失败会短暂留下半本书状态,重跑即愈;②匿名边缘缓存 60s 内书架可能滞后,本轮验证已在窗口外;③书内 LaTeX/Mermaid 生产端与 Hello Computer 同渲染管线,本地 6 个代表章节已验,未逐节生产走查。
- 未覆盖范围:深层章节(第 46/56 章等)生产端仅 HTTP 状态+标题验证,未逐张截图;登录态下的阅读进度/「问 AI」在新书上未实测(匿名链路已验)。

## 2026-08-28(五)全量缺陷审查 + 修复部署:6 代理深审 2.5 万行,P1×4/P2×24/P3×20+,迁移 0019 已应用,staging 独立库(已部署,生产复验通过)

- **审查**:6 个并行子代理通读全部子系统(认证/OIDC 提供方/果子账本/Worker 管线/前端+AI 代理/安卓壳+脚本),头部发现全部人工复核后实施修复。审查前门禁基线全绿(tsc/99 测试/audit/漂移)——缺陷全部是门禁覆盖不到的语义问题。
- **P1 修复**:①`safeReturnPath` 协议相对 URL 逃逸(`/..//evil.com` → `//evil.com` 经 /signin 返回链接外跳,源头加输出终检);②划词"解释/翻译"气泡在 Chrome/Edge/Firefox 桌面端整体失效(mousedown 清选区导致 selectionchange 先卸载气泡;改为容器 preventDefault + `user-select:none` + 使用气泡捕获的选区文本);③订单结算不写 `transactions` 行,卖家流水与余额脱节(内/外部结算批次各补一行,购买/结算两侧账目对称);④书籍内容生成器与产物不受版本控制(`scripts/builder/`、`mini_cpu/`、`experiments/`、`content/import-hellocomputer.sql` 入库;产物从被 gitignore 的 backups/ 迁出,重生成字节级一致)。
- **P2 摘要**(24 项全修):账本——点赞结算补 `status='active'` CASE 守卫(此前唯一 fail-open 资金路径)、退款路径改 `assertWalletIntegrity`(不再静默按账本改写,上线前对账实证 0 漂移钱包)、隐藏帖评论区读写双封(路由校验 + `post_comments_visible_post_guard` 触发器)、`posts.likes_count` 死计数器激活/`comments_count` 触发器化并回填(迁移 **0019**)、feed/产品页双计消除。前端——galaxy `?planet=constructor` 原型链键砸死 RAF(`Object.hasOwn`)、"问 AI" ask 重试必 400(store 增加 `selection`/`question` 原始输入字段)、SSE `close()` 未处理 rejection、全部卡死按钮 try/finally、草稿存储守卫、docs PATCH 拒绝不存在父级(防孤儿提升到根)。Worker——请求体守卫覆盖 DELETE 且 chunked 流式限额、新增 `scheduled()` cron 每 6h 清理 7 张表的过期数据(授权请求/codes/tokens/payments/email codes/sessions)、CSP 注释如实声明 `'unsafe-inline'` 局限。安全——`assertSameOrigin` 接入全部 11 个写端点(www 域兼容)、外链封面与外链 demo 同规拒绝过审、`requestSecure` 生产 fail-closed(删除永不生效的 `cf.httpProtocol` 死分支)、邮箱验证码锁定改条件 UPDATE 原子占额、logout CSRF 防御 + 清瞬态 cookie。安卓——`doUpdateVisitedHistory` 对 30x 重定向落地重过主机白名单、下载失败清理 MediaStore 残留行、渲染进程崩溃恢复走完整门禁、AppShell 清单禁 302/缺字段 fail-closed。
- **P3**:google 死代码移除(`/api/auth/google/*` 404)、常数时间比较、Turnstile 前置于地址限流、`jsonError` CHECK 映射收窄到钱包约束、钱包假"探索金"移除、`/api/payments` 限流、每日点赞上限对齐北京时间午夜(0019 同步重建 0003 触发器)、撤销点赞翻转事件状态、`check-migrations` 全量对账(修自指引用)、`build-all.mjs` 事务化+全字段转义+parentId 引号修复、脚本退出码/端口防串。
- **迁移 0019**(`drizzle/0019_community_counter_triggers.sql`,纯触发器/回填,无表结构变更):部署前先对账(0 漂移)→ `d1 export` 备份(`backups/pre-0019-20260828.sql`,730KB)→ 应用 → 7 触发器落地、计数回填零错位 → `__drizzle_migrations` 回填(hash+journal 时间戳),账目 20/20。**部署后执行 comments_count 重归一化**(迁移落地到新代码上线之间旧版手动 +1 与触发器叠加,修正 1 个帖子)。
- **staging 独立库**:新建 `zaochang-db-staging`(APAC),`wrangler.staging.jsonc` 已指向;20 迁移全量灌入,48 触发器与生产一致,账目 20/20 回填。新增 CI 门禁 `scripts/check-env-split.mjs`(staging/生产共库即红)。
- **门禁与部署**:本地 105/105 集成测试(新增 6 个:安全 return_to/结算流水/隐藏帖联动/文档孤儿/外链封面/_headers 门禁)、tsc/lint/drift/audit 全绿、`compileDebugKotlin` 通过。commit `6e369b9` push → ci `release-gates@6e369b9`(33175314311)success → deploy `deploy-production`(33175432669)**success**,部署版本 2026-08-28T13:28:00Z。
- **生产复验**(DoH 取真实边缘 IP 104.21.48.47 + `--resolve`,本机 DNS 被 VPN 劫持到 198.18.x.x 不可用):首页 200;`/signin?return_to=/..//evil.com` 线上返回链接坍缩为 `href="/"`(攻击向量失效),对照 `return_to=/feed` 原样保留无误杀;HSTS/CSP/XFO 头正常。
- 未覆盖(显式声明):①CSP nonce 化待 vinext 支持 nonce 透传后再评估(当前 script-src 'unsafe-inline' 为已知局限,注释已声明);②`run_worker_first`(/product-apps、/downloads 走 worker 头分支)未启用,以新增 `_headers` 门禁测试兜底;③APK 未重发(本次 Kotlin 改动需 bump versionCode 3 才出包);④staging worker 下次部署需重灌 secrets(runbook §2),R2 仍与生产共享(可选后续拆分);⑤钱包页与结算流水的 UI 呈现、cron 首次触发(下一个 23 */6 时刻)待观察。

## 2026-08-28(八)匿名页边缘缓存:stale-while-revalidate + 命中 cache-control 钳制(已部署,生产复验通过)

- **起因**:用户问「为什么当前网页缓存低」。线上实测(`--resolve` 到 CF 边缘 104.21.48.47)定位出三层原因,全部修复并部署验证。
- **排查结论(改前)**:
  1. **命中率结构性趋近 0**:匿名页边缘缓存 TTL 仅 60s 且 `caches.default` 按机房隔离,低流量下前后访客几乎不可能落进同一机房同一 60s 窗口——实测前一访客条目 `Age: 59` 命中一次后,紧接的下一请求就回 `miss`,每次都付完整 SSR(1.2-1.4s)。
  2. **区域 Browser Cache TTL 改写(真 bug)**:缓存命中响应的 `cache-control` 是 `public, max-age=14400, s-maxage=60`,而源码写入的明确是 `max-age=0`(防匿名页本地副本在登录后被浏览器复用),且全仓库 git 历史从未有过 14400——是 CF 区域级 Browser Cache TTL(默认 4h)在命中路径改写。miss 路径(worker 自产响应)实测不受改写(`no-store` 原样到达)。
  3. **caches.default 按 s-maxage 到期即驱逐**:`cache.match()` 在条目过期后直接返回空(实测),任何「过期后回旧内容」的 SWR 必须让存储条目的 s-maxage 活过 TTL。
- **修复**(`worker/index.ts`,commit `a9b045a` + `7e1de27`):
  - **SWR**:条目存储 `s-maxage=TTL+300`(边缘保留 360s),自带 `x-zc-anon-cached-at` 时间戳判龄;命中时 age<TTL 回 `hit`,TTL≤age<TTL+300 回 `stale` 并 `waitUntil` 后台重渲刷新(同 isolate 按 URL 去重,失败静默);超窗条目已被边缘驱逐,自然回源。
  - **钳制**:命中/陈旧响应出 worker 前统一 `cache-control` 钳回 `public, max-age=0, s-maxage=60`,抵消区域设置改写;浏览器侧永不复用本地匿名副本的语义恢复。
  - 语义取舍(有意):匿名页极端可滞后 TTL+300s(仅当源站持续故障时逼近上限);登录态(Cookie)请求照旧 100% 绕过。
- **门禁与部署**:两轮 `npx tsc --noEmit` / `eslint` / `git diff --check` / `npm test` **99 pass / 0 fail / 0 skipped / 0 todo** 全绿;CI `release-gates`(33167836538、33168275001)与 `deploy-production`(33167929321、33168379504)全部 success。**第一轮部署后实测发现 SWR 不生效(存储 s-maxage=60 被边缘到期驱逐,t+76s 直接 miss)→ 第二个 commit 修正保留期 → 重部署**——「缓存命中路径无自动化测试覆盖,上线后 curl 手动验证」的既定流程真实拦住了一次缺陷。
- **生产复验(同 URL 四连时序,TPE)**:`t0 miss ttfb 1.22s` → `t+1s hit ttfb 0.24s,cache-control: public, max-age=0, s-maxage=60`(钳制生效,不再出现 14400)→ `sleep 75s` 后 `t+76s stale Age:76 ttfb 0.30s`(过去这是 1.2s+ 的冷 miss,现在秒回旧页+后台重渲)→ `t+77s hit Age:0 ttfb 0.28s`(后台重渲已刷新条目)。
- 未覆盖(显式声明):①>360s 超窗回源分支未实测(条目此时已被边缘驱逐,等价于普通 miss 路径,后者已验证);②区域 Browser Cache TTL 设置本身未在 CF 控制台改(钳制已在 worker 层抵消其影响;若想彻底根治可在控制台把该域名 Browser Cache TTL 设为 Respect Existing Headers,需 zone 设置权限,本轮未动);③静态资产(`/assets/*` immutable 一年、CF 边缘 MISS→HIT)本轮实测本就健康,未改动。

## 2026-08-27(七)外链外抛实测通过 + 白名单设计勘误((六)中「github 会外抛」的假设有误)

- **勘误**:(六)称「github.com 外链外抛未能实测触发」隐含假设 GitHub 登录应外抛——**该假设错误**。`AppShell.kt:18-23` 的 `INTERNAL_HOSTS` **有意**包含 `github.com` 与 `accounts.google.com`:OAuth 登录流留在壳内 WebView 是设计行为。实测(挂宿主代理 `settings put global http_proxy 10.0.2.2:6518` 使 github 可达后):点「使用 GitHub 登录」→ 连接页探测成功 → `location.replace` 跳 `github.com/login/oauth/authorize`(logcat sOUL 记录)→ GitHub 重定向 `github.com/login?...`(第二条 sOUL)→ **GitHub 登录页完整渲染在壳内**(截图 `gh-footer.png`,「Sign in to GitHub to continue to zaochang」)。
- **外链外抛实测通过**(此前仅代码级,现补端到端):在壳内 GitHub 登录页点页脚「Terms」(→ `docs.github.com/site-policy/...`,非白名单主机):logcat `sOUL main=true url=https://docs.github.com/site-policy/github-terms/github-terms-of-service` → **焦点切到 `com.android.chrome…FirstRunActivity`(Chrome 接管前台,截图 `chrome-ejected.png`)**——`navigateInternal` 非白名单分支 → `openExternal`(ACTION_VIEW)真实触发。壳仍留在 GitHub 登录页(导航被 `return true` 吃掉,未丢上下文)。
- 测试后现场已恢复:回到造场应用、`http_proxy` 清回 `:0`(dumpsys 焦点=MainActivity 实证)。
- 走查状态更新:**匿名可达面+壳行为全部端到端覆盖完毕,零未验项**(除下条)。唯一剩余缺口=**登录态全流程**(需测试账号,见(六));另:壳内 GitHub 登录页已可触达,**若用户提供 GitHub 账号凭据即可把 GitHub 登录闭环也走完**(此前因网络不可达,现挂代理即可达)。

## 2026-08-27(六)部署后闭环走查收尾:v2 壳下载端到端实测 + 匿名可达面交互全绿

- 承接(五)。部署后继续把走查目标(摸遍每个交互)收尾,本轮全部在生产实测:
  - **v2 壳下载链路端到端(上条的 ⚠️ 缺口已补)**:线上字节 `zaochang-1.0.1.apk` 直接 `adb install -r` 成功(versionCode 1→2,签名兼容)——同时证明托管 APK 可安装。壳内 /app 点「下载安装包(v1.0.1)」:logcat `sOUL main=true url=…/zaochang-1.0.1.apk` → `MediaProvider: …/storage/emulated/0/Download/zaochang-1.0.1.apk` 落盘 → 设备端 `sha256sum` = `8f2df827…02f6`(与生产/签名产物/app-download.ts 三方一致)→ toast「已下载到「下载」文件夹」截图实证。二次点击 MediaStore 自动改名 `(1)` 未覆盖旧文件。截图 `.walkthrough/app-{download-fired,toast}.png`。
  - **探索页交互 DOM 级验证(生产,headless chromium CDP@390px,断言可证伪字段)**:排序三态 趋势→最新→最多体验 ✓;筛选 免费+造场官方 → 选中态 active ✓ + 结果数 6→1 ✓;视图 grid↔list(`.discover-grid list` class 切换)✓;重置筛选 → 计数回 6 ✓(筛选按钮保持 active 为设计行为:`discover-client.tsx:83` 条件含 `filtersOpen`,面板未关);搜索无结果 → count=0 + route-empty 空态 ✓;清除筛选 → 回 6 ✓;无横向溢出 scrollWidth 390=innerWidth ✓。首版脚本 6 处 FAIL 均为点击后同步读数早于 React 重渲染的时序伪影(FAIL 详情自带反证),修正为 350ms settle 后 10/11,唯一遗留 FAIL 即上述设计行为误判,非 bug。临时脚本已删。
  - **问AI dock**:阅读器「问 AI」浮钮点开 dock 正常:输入框+快速/专家切换(快速默认)+附加图片+关闭齐全(截图 `.walkthrough/reader-ai-open.png`)。模式切换与 SSE 行为由套件 `reading-ai: fail-closed gating…SSE streaming` 测试覆盖。
  - **首页信息流**:冷启动渲染正常,连续 4 次滑动流畅,卡片(字浪排版实验室/四拍 Loop 厨房)加载完整无撕裂。
  - **GitHub 登录连接页**:壳内点「使用 GitHub 登录」→ 连接页渲染正常;探测(客户端加载 `github.com/favicon.ico`,5s×3)在模拟器网络下失败并显示「重新连接/返回登录」——**按设计的网络韧性降级**,非 bug(盒子侧 curl github.com 302 可达,是模拟器 3G 到 GitHub 不通;邮箱验证码登录正是为此场景存在)。
  - **外链外抛**:github.com 外抛未能实测触发(被上述探测降级挡在跳转前);`navigateInternal` 入口已由 .apk 分支实测走通(同一函数),`openExternal`(ACTION_VIEW)保持代码级确认(`MainActivity.kt:272-287`)。
- **匿名可达面走查至此全覆盖**:首页/探索(含排序筛选视图搜索)/产品详情/登录页(GitHub 连接页+邮箱表单渲染)/书架/阅读器(BUG B 修复后)/问AI dock/圈子/创作页表单/旋转/滚动/底部导航/深链/壳下载/升级页逻辑(代码级)。
- 仍未覆盖(显式声明):①**登录态全流程**(发帖/上传/问AI 提交/钱包/加圈/真实产品提交/GitHub 登录闭环)无测试账号,未端到端——需要用户提供或创建测试账号才能推进;②github.com 外链外抛真机点击;③问AI 实际提问(SSE 流)在壳内的体验(服务端行为有测试覆盖,壳内仅验 dock 开合)。

## 2026-08-27(五)两个 UI bug 修复 + APK 1.0.1 重托管:**已部署并生产复验通过**

- 承接上条(四)。commit:`84a0fc1`(站点两修复)→ `39b3b38`(壳下载修复 + APK 重托管)→ `309da40`(走查账本),push 触发 ci `release-gates@309da40` 成功 → deploy `deploy-production@309da40` **success**。
- **APK 重托管**:versionCode 1→2 / versionName 1.0.0→1.0.1(壳下载接管属 Mode 3 壳变更,按 app-download.ts 文档流程 bump)。`gradlew assembleRelease` exit 0;aapt badging 实证 `versionCode='2' versionName='1.0.1'`;apksigner v2 签名在位。新文件 `public/downloads/zaochang-1.0.1.apk`(664,682 B,sha256 `8f2df8272d76d1c06cd9ae4539cab1aa565c0babdc409c493c0ec57d998b02f6`),未覆盖旧文件;旧 1.0.0.apk(含下载 bug、无引用)已 `git rm` 移除。`app-download.ts` 全常量更新;`minShellVersionCode` 保持 1(下载修复纯壳侧,不动 web/壳兼容契约)。`npm test` **99 pass / 0 fail / 0 skipped / 0 todo,exit 0**(含 APK 字节级 sha256/size 校验)。
- **生产实测(盒子 `--resolve` 到 CF 边缘 104.21.48.47,DNS 干净)**:
  - `/api/app-shell` → `latestVersionCode:2 / latestVersionName:"1.0.1" / downloadUrl:…/zaochang-1.0.1.apk / sha256:8f2df827…02f6 / minShellVersionCode:1`;
  - `/downloads/zaochang-1.0.1.apk` → 200,`content-type: application/vnd.android.package-archive`,`content-disposition: attachment`,`cache-control: …immutable`,nosniff;盒子下载后 sha256==`8f2df827…02f6`、大小 664,682 —— 与签名产物/app-download.ts 三方一致;
  - 旧 `/downloads/zaochang-1.0.0.apk` → **404**(已移除,符合预期);
  - `/app` 页 → 含 `zaochang-1.0.1.apk` 链接与 `8f2df827…` sha256 标记;
  - 部署后 CSS 资产 `index-Dj0Xhshm.css` grep 命中全部修复标记:`.book-reader>*{min-width:0`、`.book-reader .docs-body table{…display:block;overflow-x:auto`、`.category-tabs button>*{z-index:2`。
- **模拟器生产复验**(emulator-5554 装旧壳 versionCode 1,Mode 1 冷启动载最新站;截图 `.walkthrough/reverify-{discover,reader,reader-table}.png`):BUG A——「全部」激活 chip 文字清晰可见(深字灰 pill),非空灰盒;BUG B——von-neumann 宽表章文字全部在屏宽内可读,无横向裁切/无需平移,多处滚动位置均无整页溢出。**两修复在生产生效。**
- 未覆盖:①下载接管修复本身(新壳 versionCode 2 的 MediaStore 落盘)未在真机重装新 APK 实测——模拟器仍跑旧壳,新壳的下载链路只在源码+签名构建层验证,真机安装 1.0.1 后的下载行为未端到端走;②登录态流程仍无测试账号(任务 #11 未动)。

## 2026-08-27(四)安卓壳全交互走查:修两个站点 UI bug(本地已验证,**待部署**)

- 状态:**修复已本地无头浏览器实测验证,但尚未推送/部署**——线上 App(载远程站)仍带这两个 bug,待用户批准 commit+push 后走 ci→deploy。
- 走查范围(未登录可达面,模拟器 emulator-5554 载生产站):首页/探索/产品详情(标签+内嵌应用+喜欢/收藏/打赏登录门)/登录页/书架/阅读器/圈子/创作页(+)/旋转/滚动。
- **BUG B|阅读器整页横向溢出(移动端每行文字被裁,需左右平移)**:根因=`.book-reader .docs-body table` 仅设字体、无 overflow 兜底,宽表格 min-content 把 `.docs-body`(网格项,`min-width:auto`)撑过阅读器栏→整页溢出。修复(`app/globals.css`):①表格 `display:block+max-width:100%+overflow-x:auto`(内部自滚,min-content 归零);②`.book-reader > *{min-width:0}`(网格防爆防御)。实测(playwright chromium CDP @390px,真实 dev server+真实章节):chapter01 `docScrollWidth 482→380`(≤innerWidth 390);von-neumann 宽表格章 `556→380`,表格 `sw:540/cw:348` 内部滚动;桌面 1280px `1270≤1280` 不破。截图 `.walkthrough/bug-b-{before,final,von3,desktop}.png`。
- **BUG A|探索页激活分类 chip 渲染成空灰盒(文字不可见)**:根因=`discover-client.tsx` 把标签渲染成裸文本节点 `{item}`,而 `globals.css` 的 `.category-tabs button > *{z-index:2}` 只提升元素子节点,文本节点被 `<motion.i>` 灰 pill(`z-index:1;background:#dfddd7`)盖住。修复:`{item}` 包 `<span>` 使其吃到 z-index:2。实测 @390px:修复前"全部"chip 空灰盒,修复后文字正常显示。截图 `.walkthrough/bug-a-{before,after}.png`。
- 回归:`npm test` 全套 **99 pass / 0 fail / 0 skipped / 0 todo,exit 0**(两处改动无副作用)。
- 其余确认正常:底部导航客户端跳转可用;旋转(configChanges)状态保留不重载;`/studio/new` 未登录可填表单但提交 401→登录(设计如此,源码 `create-product-flow.tsx:53`);外链外抛由 `MainActivity.kt:272-287` 代码级确认(非白名单 https→openExternal)。
- 未证实/未覆盖:①logcat 偶现 `Failed to fetch dynamically imported module circles-client-*.js`——出现在 3G 抖动期(同时刻 bookshelf 也 Failed to fetch),冷启动一致 bundle 下 circles 正常加载,判为模拟器 3G 瞬时网络,**非系统性 stale-chunk**(但未能从本机证伪该资源 404,因本机 DNS 被劫持);②登录态全流程(发帖/上传/问AI提交/钱包/加圈/真实提交)无测试账号,未端到端覆盖(见任务 #11);③外链外抛仅代码级确认,未真机点击实测(无可达外链+tap 偶偏)。
- 临时诊断脚本 `scripts/_diag-overflow.mjs`/`_diag2.mjs`、截图目录 `.walkthrough/` 均为未跟踪临时产物,**不提交**,部署验证后清理。

## 2026-08-26(三)安卓壳+APK 分发上线(GitHub Actions outage 期间走本地手动部署)

- 状态:**已上线**。commit `b94c96d` 推送 main 成功但未触发任何 Actions run——GitHub 全平台 Actions major outage(status API 实证:Actions component=major_outage;事故公告「database primary 故障,主从切换中」,起于 UTC 15:11,push 在其前 6 分钟)。按 runbook 应急路径改走**本地手动部署**,与 deploy.yml 逐步等价:
  - checkout 锚点一致性:本地 HEAD=远程 main=`b94c96d`(gh api 证实),工作区干净(diff 仅本账本);
  - `npm run build` exit 0;
  - 迁移核对(check-migrations.mjs 需 REST token 而本地无 → 用 wrangler OAuth 等价执行):`wrangler d1 execute zaochang-db --remote --json "SELECT created_at FROM __drizzle_migrations … LIMIT 1"` 得生产水位 `1787478054485`,与 journal 最新(`0018_stale_speed_demon`, when=`1787478054485`)逐字节相等 → PASS,零新迁移;
  - `npx wrangler deploy --config wrangler.prod.jsonc`(代理 per-command 注入):98 新资产上传(APK 含内),Current Version ID `b0cc0a26-30b2-4946-a102-5c4dc2de519b`,triggers apex+www。凭据为本次重登的 wrangler OAuth(zaherharris65@gmail.com,账号 ID 与 runbook §1 锚点一致)。
- 生产实测(盒子 curl,DNS 干净):
  - `/api/app-shell` → 200,no-store;manifest:`schemaVersion=1 / web.buildId="2026-08-26.2" / minShellVersionCode=1 / android.downloadUrl=https://aetherstudio.top/downloads/zaochang-1.0.0.apk / android.sha256=d011a998…f7a467dd`;
  - `/downloads/zaochang-1.0.0.apk` → 200,`content-type: application/vnd.android.package-archive`,`cache-control: public, max-age=31536000, immutable`,nosniff;盒子下载后 sha256==`d011a998dd3202936923cbe5c5407d044967b817fe55a5bbb91bb503f7a467dd`,大小 663,446 —— 与签名构建产物/app-download.ts 常量三方一致;
  - `/app` 页 → 200,HTML 含下载链接、sha256、「造场 App」标题。
- 兼容门禁就此在生产生效:旧壳拿到 min>自身 versionCode 的清单会进原生升级页(fail-closed 分支此前未被生产触发过,逻辑由模拟器审查+代码路径覆盖,真机触发场景仍无端到端实例)。
- 已知差异/风险:①本地 Node v24.13.1 vs CI 22.13(build/test 均通过,历史所有本地验证同为 v24,如实声明非同版本);②本次发布未经 CI release-gates 的远程复核,门禁靠本地等价五步(tsc/lint/npm test 99 通过/git diff --check/迁移核对——前四者在本轮(二)已全绿);③GitHub 恢复后若补跑 b94c96d 或后续 ledger commit 触发的 release-gates→deploy 为同码幂等重部署,无害。

## 2026-08-26 安卓壳(web-to-android)

**结论:壳工程已就位、构建与模拟器运行时验证通过;未部署、未分发、release 签名未配置——不可投产。**

### 已做(附证据锚点)

- 架构:远程 WebView 壳(方案 B)+ Mode 1 restart-to-latest。站点是 Workers SSR 非 PWA,TWA 不成立;无 JS↔原生桥需求,Capacitor 无必要。壳代码 `android/app/src/main/java/top/aetherstudio/zaochang/`。
- Web 侧兼容契约端点 `app/api/app-shell/route.ts`(no-store JSON,schemaVersion=1,minShellVersionCode=1)。集成测试 `tests/rendered-html.test.mjs` 新增 "android app-shell compatibility manifest is no-store JSON with a shell version gate"。全套 `npm test`:**97 pass / 0 fail / 0 skipped / 0 todo,exit 0**。
- 构建:`gradlew assembleDebug` 与 `assembleRelease lintVitalRelease` 均 BUILD SUCCESSFUL(app-debug.apk 899,567 字节;aapt badging:package=top.aetherstudio.zaochang versionCode=1,targetSdk 36,仅 INTERNET 权限)。工具链:AGP 9.2.0 内置 Kotlin(不应用外部 KGP,2.2.x 与 AGP 9 不兼容)、Gradle 9.4.1、JDK 21(Android Studio JBR)。
- 模拟器运行时验证(Pixel 6 / API 35 镜像,载 app-debug.apk,连生产 https://aetherstudio.top):
  - 冷启动:首页完整渲染(顶栏/hero/卡片/底部导航),edge-to-edge 内边距无遮挡;应用零崩溃零 ANR(dropbox 无本包记录)。
  - 深链:`am start -d https://aetherstudio.top/bookshelf -n top.aetherstudio.zaochang/.MainActivity` → singleTask onNewIntent → 书架页完整渲染(「造场书架」+ Hello LLM 卡片)。`resolveSiteUrl` 主机白名单路径已实走。
  - 返回键:第 1 次回书架→首页(WebView 历史),第 2 次历史耗尽退出回 launcher——无用户困死。
  - 断网(有缓存):冷启动仍完整渲染首页(chromium HTTP cache 回退,LOAD_DEFAULT)。
  - 断网(清数据无缓存):冷启动 25s 内进错误页「无法连接造场 / net::ERR_NAME_NOT_RESOLVED」;恢复网络点「重试」→ 首页恢复。
- skill 审计脚本:`python scripts/audit_android_wrapper.py` → 2 条 medium,均裁定为 by-design(debugging 由 FLAG_DEBUGGABLE 门控;JS 必需 + 主机白名单),无 high/critical。
- `git diff --check` exit 0。

### 未做 / 缺口(阻断或待决策)

- **未部署**:`app/api/app-shell` 路由未上生产(生产 fetch 404)。壳当前走「清单不可达→照常加载站点」兜底,**兼容性门禁在生产上尚未生效**——需要一次 web 部署 + 验证 `curl https://aetherstudio.top/api/app-shell` 返回清单。状态:**部分完成,部署前门禁不生效**。
- **release 签名未配置**:`android/keystore.properties` 不存在,assembleRelease 产出未签名 APK,不可分发。需要用户决策密钥生成/托管。
- **未分发**:无任何渠道(APK 未交到任何设备/商店)。
- 真机未验:仅模拟器(x86_64/API 35)。真机 GPU/网络栈/厂商 WebView 行为未覆盖。
- 设备上未验:登录持久化(cookie 落盘后冷启动登录态)、文件上传选择器、下载落盘、外链外抛(在模拟器上无对应 app 场景)、深链与其他浏览器的默认打开歧义(未做 assetlinks 验证,无法做)。
- `android/local.properties`(gitignored)与 gradle wrapper dist junction 是本机特定,换机需重建(README 有说明)。

### 本轮未跟踪目录说明

`experiments/`、`mini_cpu/`、`scripts/builder/`、`scripts/import-local-hellocomputer.mjs`、`scripts/test-katex.mjs` 为会话开始前已存在的未跟踪文件,非本轮安卓工作产物。

## 2026-08-26(二)APK 站内分发 + 发布密钥

**结论:签名 APK 已产出并挂到站点 public/downloads,下载页/清单/测试链路本地全绿;尚未部署(未推 main)、未分发。**

### 已做(附证据锚点)

- 发布密钥:`keytool -genkeypair` RSA-2048/10950 天生成 `android/zaochang-release.jks`(PKCS12,store/key 口令同一随机值,均只落盘未回显)。**权威备份在盒子 `/etc/zaochang/zaochang-release.jks` + `keystore.properties`**(root:zaochang 640,2026-08-26 22:37 scp 落盘)。证书 SHA-256 指纹 `71:E2:E8:40:...:D9:FC:A3:59`。
- 签名构建:`gradlew assembleRelease` BUILD SUCCESSFUL → `app-release.apk` 663,446 字节;`apksigner verify --verbose`:**v2 scheme true**、1 signer、DN/指纹与 keytool 一致;`zipalign -c 4` exit 0。
- 站内托管:APK 拷贝为 `public/downloads/zaochang-1.0.0.apk`(sha256 `d011a998...f7a467dd`);`public/_headers` 加 `/downloads/*`(nosniff + immutable,文件名版本化)。
- 单一事实源 `app/api/_lib/app-download.ts`(versionCode/versionName/fileName/sizeBytes/sha256),三方共用:`/api/app-shell` 清单 `android.downloadUrl`(GET 内以请求 origin 动态拼,修复过一次模块顶层引用 request 的运行时错误)、`/app` 下载页(新 `app/app/page.tsx` + globals.css 追加样式)、集成测试。
- 测试(代理下 `npm test`,wrangler 直连 CF 下载会挂死——两次复现,挂在 `wrangler d1 execute`,netstat 见挂起连接 104.16.5.34:443):**tests 99 / pass 99 / fail 0 / skipped 0 / todo 0,exit 0**。新增 2 测试:①APK 下载字节级校验(200 + content-type + PK 魔数 + byteLength + sha256 与常量一致);②/app 页含下载链接与 sha256。原 manifest 测试扩展 downloadUrl/latestVersionCode 断言。
- 门禁:`npm run lint` 0 errors(2 warnings 为既有 scripts/builder/core.mjs);`npx tsc --noEmit` exit 0;`git diff --check` exit 0。
- 盒子分发形态取证(未改动任何生产配置):cloudflared 为 config-file 模式(tunnel `ddc84c25-2f91-4f68-81b2-66572cc06eb2`,ingress 仅 scanner→127.0.0.1:3311),`/root/.cloudflared/cert.pem` 在(可 `tunnel route dns` 加域名,无需 dashboard),nginx 1.28.3 在跑,磁盘 20G 空闲。加 `dl.aetherstudio.top` 可行,但属生产变更且与「盒子 scanner-only」决策相反,**待用户拍板**。

### 未做 / 缺口

- **未部署**:全部 web 侧改动(下载页/清单/APK 文件/_headers)未推 main;生产上 `/api/app-shell` 仍 404、`/downloads/*` 不存在、`/app` 404。待用户确认推送。
- 盒子 `dl.aetherstudio.top` 未配置(方案已备,待拍板)。
- 签名 APK 未在任何真机安装验证(仅上轮 debug 包的模拟器验证;release 包未装机)。
## 2026-08-26 「问 AI」面板:回答 markdown+KaTeX 渲染 + 提问附图(多模态)(已部署)

- 状态:已上线。commit `eac2bd3` 推送 main(本机直连 GitHub 被重置,经系统代理 `127.0.0.1:6518` per-command `-c http.proxy` 推送,未改 git config);release-gates run 32868949150 与 deploy-production run 32869111018 双 success;生产 Worker Current Version ID `b2bf83d9-c01c-4b42-8779-b76dfc46595d`;部署前置迁移核对通过(journal 最新 0018,本轮零新迁移)。
- 动因:用户截图实证——AI 回答的 LaTeX(`$f = \frac{1}{T_{\text{clk}}}$`)与 `**粗体**` 以原始符号裸露(回答区是纯文本 pre-wrap),且多模态模型无图片提问入口。
- 机制:① 渲染——把 docs.ts 的 marked+KaTeX+sanitize-html 管线抽为共享模块 `app/lib/markdown-katex.ts`(零 cloudflare import,客户端可打包),dock 回答区改 `dangerouslySetInnerHTML` + `useMemo` 全量重渲染(流式每 60ms flush 一次,未闭合 `$` 靠 throwOnError:false 容错);sanitize 白名单仍只维护一份,书籍正文渲染行为零变化。② 附图——客户端 canvas 压缩(长边 ≤1600、webp q0.85、~3.5 MiB 上限)后以 data URL 内联请求体直发上游;**刻意不走** R2+ClamAV 上传管道(瞬态输入不落库/不公开,11 MiB 请求体硬顶兜底),chat 传输映射为 `image_url` 块、Messages 传输映射为 base64 `image` 块;无图请求的上游消息体与改动前逐字节一致。
- 安全门禁(新增,均为收紧):`AI_CHAT_VISION` 普通 var(非 secret)缺省关闭,未开时带图请求 fail-closed 400 `vision_not_supported`;`parseReadingAiImage` 只认 png/jpeg/webp data URL、解码后 >4 MiB 拒(400 `invalid_image`);非 ask 动作带图同 400。prod/staging 的 wrangler `vars` 已配 `"1"`(前提:上游两个模型均支持图像输入——用户确认其为多模态模型)。
- 证据(门禁):全量 **96 pass / 0 fail / 0 skipped / 0 todo**(首跑 95/96,唯一失败暴露真 bug:base64 体积估算未扣 `=` 填充,恰在 4 MiB 上限的合法图被误拒;修为 `Math.floor((len-padding)*3/4)` 后 4194303/4194304/4194305 三点 PASS/PASS/REJECT 边界经 node 直算+套件复跑双确认);tsc 0 错;lint 0 errors;db:generate "No schema changes";git diff --check 通过。集成断言:fast 带图 `userContent[1].type==="image_url"` 且 url 逐字节相等、expert 带图 `content[0].type==="image"` 且 `source.data` 与发出 base64 相等、无图 content 保持 string(防回归)、坏 mime/超限/explain 带图均 400 且假上游计数不变。
- UI 亲验(headless Chrome + dev-login + 假上游,11/11 项):附图 chip 出现且为 webp data URL、回答卡片含附图缩略图、行内公式 `.katex`≥1、块级公式 `.katex-block`≥1、`<strong>`/`<li>` 真实渲染、上游收到含【附图】指引的多模态数组;截图人工复核(分式 `f=1/T_clk`、E=mc² 居中块、粗体、列表排版正确)。
- 生产实测(部署后,盒子 `--resolve` 到 CF 边缘,本机 DNS 被 VPN 污染不可信):未认证 POST `/api/ai/reading` → `401 auth_required`,鉴权闸完整、路由存活。
- 本轮改动可能引入的新风险:① sanitize 白名单与正文共享,回答区攻击面=正文渲染面(已有 `onerror`/`javascript:`/`<script>` 剥除断言);② 附图内联放大请求体(单图 ≤4 MiB 解码,worker 11 MiB 硬顶+ask 20/h 限流双重兜底);③ 系统提示新增"公式用 LaTeX 表示"条款,模型若输出畸形 `$` 靠 throwOnError:false 降级为字面显示,不炸页面。
- 未覆盖范围:① `vision_not_supported` 路由分支无集成测试(harness 恒开 `AI_CHAT_VISION:1`,仅 `resolveReadingAiConfig` 单测覆盖解析层,测试注释已留痕);② 粘贴附图路径未在浏览器点过(与 file input 共用同一 `attachImage`);③ 专家模式附图仅 API 层断言,浏览器点的是快速模式;④ 生产带图链路未实测(需登录态+真实上游,且会真实计费;本地全链路已验,生产 401 探针证明部署存活);⑤ 真实上游模型的图像理解质量属外部服务行为,首次真实使用即首验。

## 2026-07-10

- 状态：部分完成
- 已落地：发现页、创作者动态、作品发布、互动试玩、点赞、收藏、站内果子钱包、每日领取、作品奖励、用户间支持、交易流水、身份识别与数据库结构。
- 当前边界：部署默认保持仅站点所有者可访问；未在本轮打开公共访问。
- 阻断级缺口：无安全路径阻断项。
- 待产品决策：公共社区开放范围、内容审核策略、举报与封禁工作流、外部作品托管方式、真实运营规则。
- 非目标：果子不对应法币，不支持购买、提现或兑换。

## 2026-07-10 第二轮

- 状态：部分完成
- 新增：11 个真实页面与动态作品详情路由，覆盖首页、探索、动态、圈子、挑战、收藏、创作台、发布向导、钱包、个人主页和作品体验。
- 新增：页面转场、导航指示器、滚动揭示、数据计数、实时波形、作品控制台、发布步骤和操作反馈动画。
- 验证：本地 Worker 集成测试覆盖 10 个页面入口、登录态渲染、发布持久化和余额下限。
- 当前边界：公共访问和生产级内容治理仍未开放；图片上传仍使用封面模板和外部体验链接。

## 2026-07-10 银河实验页

- 状态：部分完成
- 新增：独立路由 `/galaxy`，完全旁路社区导航，提供全屏 Three.js 银河、环形巨行星、多层粒子、星云、轨道、三颗星体切换、镜头巡航、拖拽观察、缩放、暂停、复位与跃迁反馈。
- 性能边界：桌面渲染上限约 60fps，暂停与减少动态模式约 8fps；桌面像素比上限 1.5，移动端上限 1.2。
- 验证：`npm test` 为 16 passed / 0 failed / 0 skipped；桌面 1440x900 与手机 390x844 均检测到非黑、非白场画布，手机无页面溢出和主要控件重叠，最终浏览器控制台无 error/warn。
- 当前边界：未在真实低端 Android、Safari iOS、4K 屏幕或 GPU 丢失后的自动恢复场景做设备验证。
- 依赖风险：生产依赖审计仍报告 Next.js 内置 PostCSS 的 2 个 moderate 告警；本轮未改动 Next.js，审计建议的降级版本与当前技术栈不兼容。

## 2026-07-11 宇宙记忆视觉迭代

- 状态：部分完成
- 叙事变化：把 `/galaxy` 从技术观测台改成“微光 / 漂流 / 回声”三章宇宙记忆，用恒星燃烧、黑暗保存与星光迟到构成一条哲学叙事。
- 视觉变化：移除扫描线、坐标、角标和遥测面板；增加程序化星云、前景星尘、星座连线、衍射星芒、光迹流星、暗部行星、缓慢宇宙呼吸和章节点色。
- 交互变化：增加静默模式与按住“让时间经过”，并保留星体章节切换、暂停、全屏、拖拽观察和缩放。
- 本地验证：`npm run build` 退出码 0；桌面 1440x900 像素断言为非暗场比例 0.2575、纯白高光比例 0.0013、彩色像素比例 0.0942；手机 390x844 对应 0.4560 / 0.0026 / 0.1995。两端均满足非暗场 > 0.05、纯白高光 < 0.03、彩色像素 > 0.03。
- 行为验证：浏览器实点 AURELIA→NYX 后标题为“黑暗并非空无”且仅 NYX `aria-pressed=true`；静默按钮切换后主容器包含 quiet 类且按钮标签变为“离开静默模式”；暂停后按钮标签变为“继续星图”，恢复后变回“暂停星图”；控制台 warn/error 数为 0。
- 移动排版断言：页面滚动宽高与 390x844 视口相等；正文底部 < 章节导航顶部 < 控制条顶部，控制条四边均在视口内。
- 当前边界：按住“让时间经过”的持续按压动画仅做源码与单击路径检查，未自动化保持长按；暂停与减少动态仍采用约 8fps 节流而非完全停止 RAF；未做真实低端 Android、Safari iOS、4K 屏幕和 GPU 丢失恢复验证。

## 2026-07-11 社区星门入口

- 状态：部分完成
- 新增：社区首页主视觉右下角加入“去看星光”入口，使用微型行星、轨道、星点呼吸和 ASTRA 标识连接到 `/galaxy`，不加入主导航以保留隐藏世界的感觉。
- 桌面验证：1440x900 下入口矩形为 190x75.33，完整位于首页主视觉右下角。
- 手机验证：390x844 下入口矩形为 172x72.33，`insideVisual=true` 且 `overflowX=false`；实点后 URL 为 `http://localhost:3001/galaxy`，标题字段为“我们从微光中来”，控制台 warn/error 数为 0。
- 当前边界：入口只放在社区首页，不在探索、动态、圈子等二级页面重复出现。

## 2026-07-11 天体逻辑与哲学叙事重构

- 状态：部分完成
- 逻辑变化：AURELIA、NYX、CAELUM 的轨道线和实际位置改为共享同一套椭圆轨道参数；三颗天体以不同速度缓慢公转，运行时最大轨道残差断言为 `0 < 0.000001`。
- 镜头变化：每颗天体新增相机锚点和观察锚点，镜头每帧读取天体经公转、父级旋转和用户拖拽后的真实世界坐标；桌面拖拽后切换 NYX 得到 `target=nyx, ndc=(0.1442,-0.0210)`，反向拖拽后切换 CAELUM 得到 `target=caelum, ndc=(0.3091,-0.0103)`，两者均位于视野阈值 `|x|,|y| < 0.8` 内。
- 身份变化：NYX 从与层级结构冲突的 `EMBER MOON` 改为独立的 `EMBER WORLD`；AURELIA 原有的真实子卫星关系保留。
- 叙事变化：三章改写为“起源 / 造史 / 余响”，围绕孤独的光、共同想象塑造的文明、可被预测的未来与自由选择展开；全部为原创表述，不直接引用外部书籍或游戏文本。
- 双端验证：桌面 1440x900 与手机 390x844 均无页面溢出，手机正文、章节导航和控制条无重叠；默认章节目标坐标为 `ndc=(0.0489,-0.0008)`。桌面像素断言为非暗场 0.2654、纯白高光 0.0016、彩色像素 0.1041；手机默认章节对应 0.4820 / 0.0039 / 0.3780，均满足阈值。
- 回归验证：`npm test` 为 17 passed / 0 failed / 0 skipped；`npx tsc --noEmit` 退出码 0；清洁重启后的浏览器控制台 warn/error 数为 0。
- 当前边界：这是美学化的自洽星系，不模拟天体质量、引力摄动、开普勒变速或真实尺度；暂停与减少动态仍采用帧率节流，不是完全停止 RAF。

## 2026-07-11 星体构图与天体辨识度

- 状态：部分完成
- 桌面构图：三章统一为左侧 520px 叙事列与右侧主天体；1536x1000 下正文矩形为 `left=92.16, right=612.16, width=520`，AURELIA、NYX、CAELUM 的主星体均落在正文右侧且无页面溢出。
- 天体设计：AURELIA 保留青蓝气态条纹、宽环与卫星；NYX 改为玄武岩暗面、橙红熔裂、倾斜碎片环与三枚漂浮碎片；CAELUM 改为冰川层理、晶体裂隙、边缘极光与双层冷光环。
- 移动构图：390x844 下改用上星体、下文字的纵向叙事；三章正文底部均为 `670`，章节导航顶部为 `728`，控制条顶部为 `786`，页面横纵向均无溢出。
- 回归验证：`npm test` 为 17 passed / 0 failed / 0 skipped；桌面三章与手机三章均实点切换并截图检查，目标轨道残差最大值为 `3.33e-16`。
- 当前边界：Playwright 在 Windows 的 vinext 开发模式下记录 11 条本地 Geist 字体 `file://` 加载拒绝；该问题未影响画布、布局或交互，但本轮未修改框架字体加载链。未在真实低端 Android、Safari iOS、4K 屏幕与 GPU 丢失恢复场景做设备验证。

## 2026-07-11 观渊宇宙图谱与双层行星叙事

- 状态：部分完成
- 世界观：为杭州视界奇点科技有限公司建立“界外纪”IP；默认总览以中央黑洞“观渊”和超银河光环“见界环”为视觉核心，环外分布源光、忆潮、镜梦、未至 4 个星系。
- 天体层级：4 个星系各含 3 颗行星，共 12 颗；总览隐藏行星只保留黑洞、星环与星系，进入星系后只显现所属 3 颗行星，避免所有天体同时堆叠。
- 叙事层级：每颗行星提供短章和两段完整档案；“读取完整记录”按钮可展开，再次点击当前行星也可切换，展开后用“返回短章”回到简短文案。
- 数据断言：`GALAXIES.length === 4`、`PLANETS.length === 12`、每星系行星数 `=== 3`、12 个短章标题与 12 个档案标题均唯一，完整档案均为 2 段且单段不少于 45 个字符。
- 浏览器验证：自动循环 12 颗行星得到 `12` 个唯一目标、`12` 个唯一短章、`12` 个唯一档案，且每份档案渲染 2 段；390x844 下最长“终钟”档案的正文至导航间距为 `68.33px`、导航至控制区间距为 `8px`，页面横纵向均无溢出。
- 回归验证：`npm test` 为 18 passed / 0 failed / 0 skipped；构建包含 `/galaxy` 路由，并断言奇点总览、4 星系、12 行星和完整档案文本出现在服务端 HTML 中。
- 当前边界：Windows 的 vinext 开发模式仍记录 11 条 Geist 本地字体 `file://` 加载拒绝，本轮未修改框架字体链；未在真实低端 Android、Safari iOS、4K 屏幕与 GPU 丢失恢复场景做设备验证。

## 2026-07-11 黑洞引力透镜与行星材质重制

- 状态：部分完成
- 黑洞视觉：观渊保留三维倾斜吸积盘，新增面向观察者的纯黑视界遮蔽、细光子环和上下引力折叠弧；吸积盘改用暖白、琥珀与暗红的差速流动和左右亮度差，不直接复刻电影画面。
- 黑洞像素证据：1536x1000 总览中视界内部平均亮度为 `3.2065`，外侧 `1.05R-1.5R` 环带平均亮度为 `84.3341`；上弧与下弧分别检出 `3793 / 2678` 个亮像素，全画面非暗像素比例 `0.07773`、纯白像素比例 `0.000077`。
- 行星材质：12 颗行星明确分为 `gas / lava / ice / ocean / desert / forest / rogue / crystal` 8 类表面；气态云带、玄武岩熔裂、冰层裂纹、海洋高光、荒漠地层、森林河网、流浪星夜面和晶体切面使用不同程序化分支。大气统一改为边缘衰减，行星环改为带颗粒、分缝和明暗层次的环盘。
- 聚焦构图：进入行星后只显示当前目标，中央黑洞回到总览页；12 颗行星自动遍历得到 `12` 个唯一目标和标题、`8` 个材质家族、`visiblePlanetCount === 1`、`blackHoleVisible === false`，桌面文字到天体的最小间距为 `45.20px`，最大轨道残差为 `2.22e-16`。
- 交互证据：再次点击当前 CHRONARA 后 `data-story-mode` 从 `short` 变为 `archive`，再点一次恢复为 `short`；浏览器遍历 12 颗行星时未记录 pageerror 或 WebGL shader error。
- 移动构图：390x844 与 360x800 的页面滚动尺寸均等于视口；展开 AURELIA 档案时故事区底部为 `624 / 580px`，图谱导航顶部为 `692 / 648px`，天体、正文与导航保持分区。
- 当前边界：本轮采用稳定的电影化近似，没有实现多采样实时引力光线追踪或背景星光的真实测地线弯曲；Windows vinext 开发模式仍有 11 条 Geist `file://` 字体加载拒绝；未在真实低端 Android、Safari iOS、4K 屏幕或 GPU 丢失恢复场景做设备验证。

## 2026-07-11 行星孤寂聚焦态

- 状态：部分完成
- 层级变化：保留用户认可的观渊总览，进入任一行星后切换为 `sceneDensity=solitude`；只显示当前目标行星，关闭见界环粒子带、局部星系核心、银河尘带、前景尘埃与行星轨道线。
- 镜头变化：桌面行星镜头距离增加 `16%`，移动端增加 `10%`；NYX 与 EIDORA 在 1536x1000 聚焦态的视觉半径分别为 `139.41px / 130.62px`，周围只保留稀疏远星、淡星云和各自行星自身的环或卫星。
- 浏览器证据：AURELIA、NYX、EIDORA 均报告 `visiblePlanetCount=1`、`blackHoleVisible=false`、`sceneDensity=solitude`，未记录 pageerror 或 WebGL shader error；观渊总览仍报告 `sceneDensity=atlas`。
- 移动构图：390x844 的 AURELIA 短章故事区为 `y=448.81-624px`，图谱导航从 `692px` 开始，页面尺寸保持 `390x844`，没有横向或纵向页面溢出。
- 当前边界：孤寂聚焦态仍保留目标行星自身的星环与卫星，作为该世界的身份特征；真实设备与低端 GPU 性能范围沿用上一节未覆盖项。

## 2026-07-12 行星间电影化镜头航行

- 状态：部分完成
- 镜头变化：目标切换由逐帧线性追随改为三次贝塞尔航线；航程按世界坐标距离映射到 `2.0-3.4s`，中段加入最高 `7deg` 的视野扩张，并使用真实动画时间推进。
- 空间连续性：航行期间同时保留出发行星与目的行星，跨星系时同时开放两侧行星父级；从奇点出发或返回奇点时保留观渊层，抵达后再收束为目标单星或奇点总览。
- 改道行为：航行途中再次选择目标时，以当下相机位置和注视点作为新航线起点，不回跳至上一颗行星；浏览器实测 `CAELUM -> EIDORA` 改道时状态为 `from=caelum, to=eidora, visiblePlanetCount=2`。
- 浏览器证据：`AURELIA -> NYX`、`NYX -> CAELUM` 与跨星系 `EIDORA -> SOLENNE` 航行中均为 `cameraTransition=flying`、`visiblePlanetCount=2`；抵达后均为 `settled`、`visiblePlanetCount=1`、`sceneDensity=solitude`。`SOLENNE -> singularity` 航行中 `blackHoleLayerVisible=true`，抵达后奇点总览为 `visiblePlanetCount=0`。
- 移动构图：390x844 抵达 AURELIA 后页面滚动尺寸为 `390x844`，状态为 `settled`、`visiblePlanetCount=1`、`sceneDensity=solitude`。
- 当前边界：Windows vinext 开发模式仍记录 11 条 Geist 本地字体 `file://` 加载拒绝；未在真实低端 Android、Safari iOS、4K 屏幕、GPU 丢失恢复或高刷新率显示器上做设备验证。

## 2026-07-12 持续存在的深空行星层

- 状态：部分完成
- 空间变化：不修改观渊总览的相机、星环、黑洞和粒子构图；仅把总览中原本隐藏的行星层沿四个星系方向外移 `80` 个世界单位，并把行星轨道位置扩大为原来的 `3.4` 倍。
- 存在规则：进入行星层后 12 颗行星持续保留，不再在镜头抵达目标时隐藏出发行星；奇点实体层也持续存在，仅总览粒子带在离开观渊后退出视野密度。
- 距离证据：浏览器遍历 12 颗行星时，目标到观渊距离范围为 `71.17-128.64`，行星间最小距离约为 `28.76-30.22`；每次航行和抵达均保持 `visiblePlanetCount=12`。
- 首页边界：返回观渊后仍为 `target=singularity`、`visiblePlanetCount=0`、`sceneDensity=atlas`、`blackHoleVisible=true`，1536x1000 对照截图的首页布局和黑洞构图未改变。
- 移动构图：390x844 的 AURELIA 抵达态页面滚动尺寸为 `390x844`，状态为 `settled`、`visiblePlanetCount=12`、`sceneDensity=solitude`，没有横向或纵向页面溢出。
- 当前边界：这是叙事尺度而非物理单位仿真；真实低端 Android、Safari iOS、4K 屏幕、GPU 丢失恢复及高刷新率显示器仍未做设备验证。

## 2026-07-12 四星系主恒星层

- 状态：部分完成
- 天体层级：源光、忆潮、镜梦、未至各新增一颗真实位于行星轨道中心的主恒星；对应为暖白主序星、琥珀巨星、冷蓝白星与青白高能星，分别拥有独立半径、表面流动、日冕、衍射和点光源参数。
- 轨道关系：12 颗行星继续以各自星系的主恒星为局部坐标原点运行；浏览器遍历得到目标到主恒星距离 `12.59-35.66`，最大椭圆轨道残差 `4.44e-16`，每个行星态均为 `visibleHostStarCount=4`。
- 取景变化：EIDORA 与 NOVAIA 的桌面相机改为斜切恒星方向，让冷蓝白星和青白星稳定落在右侧天体区；移动端保留原相机参数，镜梦主星从左上边缘进入且不覆盖正文。
- 首页边界：主恒星是深空行星层的子节点；返回观渊后为 `visibleHostStarCount=0`、`visiblePlanetCount=0`、`sceneDensity=atlas`、`blackHoleVisible=true`，不改变观渊总览。
- 浏览器边界：Windows vinext 开发模式仍记录 11 条 Geist 本地字体 `file://` 加载拒绝，没有记录 WebGL shader error；真实低端 Android、Safari iOS、4K 与 GPU 丢失恢复仍未覆盖。

## 2026-07-12 造场产品银河生态化改造

- 状态：部分完成
- 产品定位：保留观渊黑洞、见界环、4 个主恒星系统、12 颗行星、镜头飞行和双层哲学故事；为 4 个星系补充真实业务分类，为 12 颗行星补充产品名、状态、版本、目标用户、能力、里程碑、卫星模块与产品入口。
- 银河入口：总览改为“探索造场产品宇宙”，提供开始探索、全部产品、随机行星和申请加入入口；行星聚焦态先展示产品信息，再由“读取行星故事”进入原有完整档案。社区首页只更新角落入口文字，不改变主视觉布局。
- 新增路径：`/galaxy/products` 支持搜索、赛道筛选、状态筛选和网格/列表模式；`/galaxy/apply` 提供项目类型、产品信号、合作需求、确认发射四步申请；`/galaxy/incubator` 展示阶段轨道、当前任务、下一步、完成条件、负责人、等待原因、资料、反馈与成员。
- 行为验证：浏览器完整执行四步申请，第三步“继续”停留在确认页，点击“发射产品信号”后 URL 为 `/galaxy/incubator?submitted=1` 且项目名为“星桥协作台”；提交当前任务后状态从“等待用户 / 35%”变为“等待造场 / 42%”。产品目录搜索“共识”时结果计数为 `1 / 12`。
- 移动策略：390x844 的银河总览使用 4 个星系列表替代完整桌面导航，并隐藏会压住底部行动区的总览控制条；具体行星仍保留上天体、下产品信息的沉浸构图。孵化控制台修正前 `documentElement.scrollWidth=947`，修正后为 `375 <= innerWidth 390`。
- 自动验证：`npm test` 为 `22 passed / 0 failed / 0 skipped / 0 todo`；`npx tsc --noEmit` 退出码 0；目标 ESLint 为 `0 errors / 2 个既有 img 性能警告`；`git diff --check` 退出码 0。
- 当前边界：申请数据只保存在当前浏览器 `localStorage`，不构成账号级持久化、多人协作或跨设备同步；资料上传按钮为交互演示，不会上传真实文件；产品名称、版本、状态与负责人为产品规划示例，需接入公司真实产品主数据后才能作为对外承诺。自定义社交分享图的生成服务返回 404，本轮未使用通用占位图替代。
- 未覆盖范围：未验证真实低端 Android、Safari iOS、4K、高刷新率、GPU 丢失恢复、账号权限、D1 孵化数据模型、文件存储、通知、审批流与多人并发；Windows vinext 开发模式仍有 11 条 Geist `file://` 字体加载拒绝，未发现 WebGL shader error。

## 2026-07-12 官方产品深空主题

- 状态：部分完成
- 身份规则：产品数据增加 `official` 标记；当前由产品银河直接访问的 `typewave` 标记为造场官方产品，数据库中的社区投稿和其余示例作品默认仍为普通社区作品。
- 视觉边界：不改变产品详情页组件、布局或交互，只由页面根类切换近黑背景、暖白正文、琥珀金强调、深色表面与低透明边框；普通作品继续使用原浅色主题。
- 响应式约束：修正移动端体验台动画覆盖居中位移后向右溢出的既有问题，组件结构与尺寸不变，体验台在 390px 视口内完整显示。
- 自动断言：服务端 HTML 必须满足 `/product/typewave` 含 `official-product-page`，同时 `/product/mori` 不含该类名。
- 浏览器证据：1536x1000 官方页显示近黑整页背景、深色体验台与琥珀金交互；390x844 下官方页根背景为 `rgb(8, 10, 12)`，体验台横向范围为 `30-360px`，`documentElement.scrollWidth === innerWidth === 390`。普通作品 `/product/mori` 根类仍为 `product-detail-page`，未进入官方主题。
- 自动验证：`npm test` 为 `23 passed / 0 failed / 0 skipped / 0 todo`；`npx tsc --noEmit` 退出码 0；目标 ESLint 为 0 errors。
- 当前边界：官方身份目前来自种子产品数据，尚未进入 D1 产品表、管理端发布流程或可审计的品牌认证机制；后续官方产品需要由真实产品主数据明确标记。
- 未覆盖范围：未在真实低端 Android、Safari iOS、4K 或高刷新率屏幕验证；Windows vinext 开发模式仍记录 11 条 Geist 本地字体 `file://` 加载拒绝，本轮没有修改框架字体链。

## 2026-07-12 官方产品全局壳统一

- 状态：部分完成
- 视觉修正：官方产品页的深空主题从内容区扩展到顶部栏、搜索、账户操作、左侧导航、路由栏和移动端导航，消除截图中浅色社区壳与深色产品区的断裂；普通社区作品继续使用原浅色壳。
- 身份层级：在左上造场品牌标志旁显示“造场官方项目”，路由栏同步显示“造场官方产品 / PRODUCT GALAXY / OFFICIAL”；身份来自产品数据的 `official` 字段，不依赖页面标题硬编码。
- 自动断言：官方页 HTML 同时包含 `official-product-page`、`official-product-shell`、中文官方身份与英文银河身份；普通作品 HTML 不包含以上标记。
- 浏览器证据：1536x1000 官方页的顶部栏、侧栏、路由栏和内容区均为近黑表面，左上官方标识可见；390x844 下官方标识范围为 `x=91-164px`，页面 `scrollWidth === innerWidth === 390`，顶部栏与移动导航背景均为 `rgba(8, 10, 12, 0.97)`。普通作品 `/product/mori` 的壳类仍为 `deep-shell`，顶部栏为 `rgba(251, 250, 247, 0.96)`、侧栏为 `rgb(238, 236, 231)`，且正文不含“造场官方项目”。
- 自动验证：`npm test` 为 `23 passed / 0 failed / 0 skipped / 0 todo`；`npx tsc --noEmit` 退出码 0；目标 ESLint 为 0 errors / 1 个既有 `<img>` 性能警告。
- 当前边界：官方身份仍来自种子产品数据，尚未进入 D1 产品表、管理端认证流程或可审计的官方发布权限。
- 未覆盖范围：未在真实低端 Android、Safari iOS、4K 或高刷新率屏幕验证；Windows vinext 开发模式仍记录 11 条 Geist 本地字体 `file://` 加载拒绝，本轮没有修改框架字体链。

## 2026-07-12 官方项目轻量入场过渡

- 状态：部分完成
- 过渡逻辑：进入任一 `official` 产品时，在内容区域叠加不可交互的近黑暗幕，并用一条 1px 琥珀金扫描线提示从社区进入产品银河；暗幕透明度在 `460ms` 内退场，扫描线在 `520ms` 内展开。
- 性能边界：过渡只动画 `opacity` 与 `transform: scaleX`，不加载图片、视频、字体或额外接口；覆盖层设置 `pointer-events: none` 与 `contain: strict`，不阻塞页面内容渲染和点击。
- 无障碍：`prefers-reduced-motion: reduce` 时隐藏过渡层并关闭外层壳配色动画。
- 自动断言：官方产品 HTML 包含 `official-entry-transition`，普通社区作品 HTML 不包含该过渡层。
- 浏览器证据：1536x1000 下暗幕透明度从起始 `0.72` 降至 120ms 的 `0.233755`，扫描线同期由 `scaleX(0)` 展开至 `0.622223`，620ms 时暗幕透明度为 `0`；三个采样点的 `pointerEvents` 均为 `none`。390x844 下覆盖范围为 `x=0-390px / y=60-779px`，底部导航从 `y=779px` 开始，页面 `scrollWidth === innerWidth === 390`。
- 减少动态效果：浏览器模拟 `prefers-reduced-motion: reduce` 后，过渡层计算样式为 `display: none`。
- 自动验证：`npm test` 为 `23 passed / 0 failed / 0 skipped / 0 todo`；`npx tsc --noEmit` 退出码 0；目标 ESLint 为 0 errors / 1 个既有 `<img>` 性能警告。
- 当前边界：未在真实低端 Android、Safari iOS、4K 或高刷新率屏幕验证；Windows vinext 开发模式仍记录 11 条 Geist 本地字体 `file://` 加载拒绝，本轮没有修改框架字体链。

## 2026-07-12 Google 与 GitHub OAuth 骨架

- 状态：部分完成
- 认证入口：新增 `/signin` 登录页，保留 ChatGPT 登录，并提供 Google/GitHub 两个可配置入口；未配置 Client ID/Secret 时显示“待配置”，不会伪造登录成功。
- OAuth 路由：新增 `/api/auth/google/start`、`/api/auth/google/callback`、`/api/auth/github/start`、`/api/auth/github/callback` 和 `/api/auth/logout`。
- 数据模型：新增 `oauth_accounts` 与 `auth_sessions` 表；第三方账号登录后映射到现有 `members`、钱包和作品数据。
- 安全边界：OAuth state 使用 HttpOnly、SameSite=Lax 短期 Cookie 校验；会话 Cookie 只保存随机 token，数据库保存 SHA-256 哈希；Client Secret 仅从 Sites 运行时环境读取。
- 配置缺口：尚未填入 Google/GitHub Client ID、Client Secret，也未在 Sites 运行时环境中执行迁移；完成真实第三方登录前必须配置凭据并应用 `drizzle/0001_oauth_accounts.sql`。
- 自动验证：`npm test` 为 `25 passed / 0 failed / 0 skipped / 0 todo`；`npx tsc --noEmit` 退出码 0；目标 ESLint 为 0 errors / 1 个既有 `<img>` 性能警告。
- 线上证据：新站点第 2 版部署状态为 `succeeded`；线上 `/signin` 返回 `200` 且包含 Google/GitHub 入口；未配置凭据时 `/api/auth/google/start` 返回 `307` 并重定向到 `signin?error=not_configured&provider=google`。
- 未覆盖范围：尚未使用真实 Google/GitHub 凭据执行完整授权回调；尚未在真实低端 Android、Safari iOS、4K 或高刷新率屏幕验证；OAuth migration 是否已应用需在填写凭据前由 Sites/D1 运行时确认。

## 2026-07-12 社区页面与交互收口

- 状态：部分完成
- 页面与账号数据：新增通知中心、社区指南、资料编辑页；创作台、个人主页、顶部余额与通知红点改为读取当前账号的作品、钱包、互动和已读状态；匿名状态不再显示伪造个人数据。
- 社区交互：探索筛选、收藏夹创建与空态、圈子搜索/排序/加入/话题讨论、动态图片与关联作品/类型/评论/分享/讨论房、产品收藏/喜欢/关注/讨论、钱包 CSV、作品排序、本机草稿恢复、封面上传与预览均有明确行为。
- 孵化流程：项目申请写入 D1，资料写入 R2，材料与项目按账号关联；资料提交后项目从“资料审核”转为“项目评估”，阶段详情、资料中心、反馈记录和等待原因可展开；未提交账号显示真实空态并直接进入申请页。
- 上传权限：产品封面显式为 `public`，孵化资料显式为 `private`；私有对象读取要求当前账号邮箱等于 R2 `owner` 元数据，缺失可见性按私有处理；孵化项目只接受当前用户真实拥有的私有对象。
- 自动验证：`npm test` 退出码 0，`33 passed / 0 failed / 0 skipped / 0 todo`；`npx tsc --noEmit` 退出码 0；`npm run lint` 退出码 0，`0 errors / 9 warnings`；`git diff --check` 退出码 0。
- 浏览器验证：账号通知由真实喜欢与发布流水生成，“全部已读”点击后禁用；创作台显示测试账号的 1 件作品、1 个喜欢和 140 果；圈子话题、动态讨论房与孵化阶段详情均能进入下一层内容。390x844 下 `/studio`、`/notifications`、`/feed`、`/circles`、`/collections`、`/galaxy/incubator` 均满足 `documentElement.scrollWidth == innerWidth == 390`。
- 按钮扫描：TypeScript JSX 扫描只剩收藏夹表单提交按钮和银河长按控件；前者由 `form onSubmit` 处理，后者由 `onPointerDown/onPointerUp/onPointerLeave/onPointerCancel` 处理。`href="#"`、`javascript:`、空 `onClick`、TODO、待开放与待上线控件检索无命中。
- Google 登录：按本轮要求暂停，未修改 Google OAuth 配置或回调逻辑。
- 本轮改动可能引入的新风险：通知由现有业务表实时聚合，数据量增长后需要分页或事件表；创作台排序是当前设备偏好，不会跨设备同步；R2 私有资料依赖对象元数据，历史上缺少 `visibility` 的对象会按私有处理。
- 未覆盖范围：未在真实低端 Android、Safari iOS、4K、高刷新率或弱网环境验证；未验证 Google 完整授权回调；未建设运营审核后台、内容举报处置和多人孵化协作席位；Windows vinext 开发模式仍记录 11 条 Geist 本地字体 `file://` 加载拒绝，另有 9 条 `<img>`/生成声明性能警告，未发现本轮业务脚本控制台错误。
## 2026-07-12 六个既有社区 Mock 应用嵌入

- 状态：部分完成
- 产品边界：`MORI / WANDER / TYPEWAVE / LOOPS / SPROUT / MINUTE` 继续使用网站原有产品卡片、slug、作者和社区互动，不新增产品条目，也不修改产品银河首页。
- 体验入口：六个原详情页的“体验”标签改为加载各自位于 `/product-apps/<slug>/index.html?embed=1&lang=zh-CN` 的独立应用；只有既有官方产品 `TYPEWAVE` 额外传入 `official=1`。
- 加载边界：iframe 使用 `allow-scripts allow-same-origin allow-downloads`，只开放音频自动播放；页面提供 12 秒无响应提示、重新载入和独立打开入口。
- 自动验证：`npx tsc --noEmit` 退出码 0；`npm test` 退出码 0，`46 passed / 0 failed / 0 skipped / 0 todo`。其中 6 条断言核对原 slug 与应用地址一一对应，6 条断言核对每个静态入口、JS 和 CSS 均返回 200 且 MIME 类型正确，另有断言保证官方身份没有污染普通社区产品。
- 当前缺口：六套应用均能发送 `ready`，但只有 `TYPEWAVE` 在真实交互时发送 `start`；其余五套应用尚未统一体验统计事件，本轮没有使用 iframe `load` 冒充用户体验。未在真实低端 Android、Safari iOS、弱网、浏览器禁用第三方存储或音频自动播放限制环境验证。
- 本轮改动可能引入的新风险：静态应用产物复制进主站后，六套应用升级需要重新构建并同步复制，否则网站会继续提供旧 bundle；iframe 的本地数据仍各自保存在浏览器 localStorage，不会同步到造场账号。

## 2026-07-13 闭环果子账本与反刷发行

- 状态：部分完成
- 语义变更：每日签到 `+10` 与发布作品 `+20` 改为不发行；新成员仅有一次 `20` 果探索金，此后只由满足账号年龄、唯一性、频率与每日上限的真实作品点赞发行 `+1`。
- 语义变更：新账号可立即付费转移探索金，改为账号注册满 `24h` 后才允许站内购买、支持创作者或外部应用支付；免费体验与退款不受该限制，拦截事件写入 `fruit_risk_events`。
- 定价选择：创作者发布时可选免费、一次解锁或按次体验；一次解锁产生持久权益并有 `10min` 退款窗口，按次体验每次生成独立订单且确认后不可退款。
- 账本约束：可用与待结算余额分离，创作者收入 `24h` 后结算；购买、退款与结算使用不可更新/删除的操作与分录，数据库触发器阻止重复权益、重复退款、过期退款和并发越限奖励。
- 防刷规则：点赞者账号满 `24h`、禁止自赞、同一用户/作品终身只发行一次、`60s` 最多 6 次奖励尝试、点赞者每日最多 10 次发行、创作者每日最多获得 20 果。
- 自动验证：`npm test` 退出码 0，`55 passed / 0 failed / 0 skipped / 0 todo`；包含同幂等键并发购买、不同幂等键并发一次解锁、并发退款、余额不足整体回滚、点赞速度/双方每日上限、结算与账本不可变断言。
- 当前边界：果子仍是社区内部记账单位，不构成储值、法币、提现或兑付承诺；尚未建设人工风险审核后台与自动冻结处置工作台。

## 2026-07-13 造场 OAuth 2.1 / OIDC 与外部果子 API

- 状态：部分完成
- 身份提供方：第三方平台可注册公开或保密客户端，使用 Authorization Code + PKCE S256；提供 OIDC discovery、ES256 ID Token/JWKS、pairwise subject、UserInfo、1h 访问令牌、30d 轮换刷新令牌与令牌撤销。
- 权限边界：开放 `openid/profile/email/fruit:balance/fruit:pay/fruit:refund`；公开客户端禁止果子写权限，空权限按拒绝处理，精确回调地址不匹配时拒绝授权。
- 用户控制：授权页逐项解释范围；用户可查看并撤销已授权应用，撤销后该客户端对该用户的访问/刷新令牌同时失效。
- 外部支付：应用只能创建 `15min` 支付意图，创建时买卖双方余额不变；用户必须回到独立造场确认页逐笔批准。支持一次解锁/按次体验、幂等查询、造场钱包直接退款、外部 API 退款与 24h 待结算。
- 数据库门禁：外部扣款、退款与结算在第一条账本操作前由触发器核对订单状态、账号年龄、钱包状态、金额、双方、退款窗口与一次性权益，失败时整批回滚。
- 自动验证：OIDC/外部支付集成用例断言 discovery 可达、ID Token 的 `iss/aud/nonce/email/sub` 与 ES256 签名、授权码单次使用、刷新令牌轮换、范围缩减、撤销后 `invalid_token`、未确认余额不变、并发确认只扣一次、API/钱包并发退款只反转一次、按次拒退和账本余额相等。
- 依赖风险：`npm audit --omit=dev` 报告 Next 内置 PostCSS 的 `2 moderate`；自动修复建议错误地降级到 `next@9.3.3`，未执行破坏性降级，等待上游稳定版修复。
- 当前边界：ES256 私钥由 Worker 生成并保存在仅服务端可访问的 D1 表中，尚未接入独立 KMS/HSM；未建设客户端人工审核、Webhook 投递与运营风控后台，第三方服务端应以支付查询 API 结果为准。

## 2026-07-14 发布准备收口

- 状态：进行中
- 本轮依据：用户要求把整个产品推进到“即将发布”的准备状态；发布声明必须等待全量自动验证、浏览器主链路和独立安全复核三道闸门。
- 语义变更：新账号钱包从 `20` 果探索金改为 `0` 果；签到、发布、充值仍不发行果子，测试所需余额只通过测试数据库的双边一致账本夹具注入。
- 语义变更：合格点赞奖励从立即进入可用余额改为先进入待结算余额，`24h` 后结算；结算前取消点赞会生成反向分录，结算后取消不回滚历史收入。
- 语义变更：退款从“商户钱包必须 active”改为“订单与退款窗口有效即可冲销”；商户处于 `frozen/review` 时退款仍恢复买家并冲销商户待结算，但不会解除商户限制状态。
- 语义变更：生产环境对 `oai-authenticated-user-*` 从默认信任改为默认拒绝；只有显式设置 `TRUST_OAI_IDENTITY_HEADERS=true` 才允许使用，开发环境保持本地测试兼容。
- 语义变更：生产 OIDC 签名从允许 D1 生成私钥改为必须提供 `OIDC_SIGNING_PRIVATE_JWK`；D1 自动生成仅保留给非生产本地环境。
- 语义变更：管理员权限从未定义的隐式入口改为 `ZAOCHANG_ADMIN_EMAILS` 显式白名单，空配置为全部拒绝。
- 语义变更：孵化资料上传从自动推进到“项目评估”改为保持当前阶段；只有后台管理员能推进阶段并写入负责人、等待原因、下一步、进度和反馈。
- 语义变更：刷新令牌旧令牌重放从只拒绝该令牌改为撤销整个令牌族及其派生访问令牌。
- 新增运营能力：内容举报与隐藏、OAuth 客户端审核、果子风险事件处置、管理员审计、孵化阶段管理和 D1 固定窗口限流。
- 迁移证据：`npm run db:generate` 在补齐 `0006_snapshot.json` 后退出码 0，关键输出为 `No schema changes, nothing to migrate`；全新 D1 集成测试可依次执行 `0000` 至 `0006`。
- 中间验证：`npx tsc --noEmit` 退出码 0；首轮全套为 `59 tests / 54 pass / 5 fail / 0 skipped / 0 todo`，失败修正后的目标复跑为 `5 tests / 5 pass / 0 fail / 0 skipped / 0 todo`。该目标复跑不替代最终全套结果。
- 当前阻断：最终全量测试、Lint、依赖审计、浏览器关键流程和独立安全复核尚未形成最终证据；Sites 工作区仍不允许 internet publishing，因此不能声明公开上线。
- 本轮改动可能引入的新风险：CSP 与 iframe 例外可能影响嵌入应用或第三方网络请求；新的 D1 限流表会持续增长并依赖概率清理；后台目前是邮箱白名单而非角色生命周期系统；冻结钱包退款允许负向冲销待结算但不允许任何新支出，需继续依赖账本守恒测试。
- 未覆盖范围：真实 GitHub 提供方回调、Google 登录、生产密钥注入、真实 Sites D1 升级、公开访问策略、Webhook、邮件通知、低端 Android、iOS Safari、4K/GPU 丢失、压力与容量测试尚未验证。

## 2026-07-14 发布准备最终门禁

- 状态：阻断级缺口
- 全量自动门禁：顺序执行 `npm test` 退出码 0，统计为 `61 tests / 61 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo`；该命令包含 vinext 生产构建与从空 D1 依次应用 `0000` 至 `0007` 的集成流程。`npx tsc --noEmit` 退出码 0；`npm run lint` 退出码 0，统计为 `0 errors / 9 warnings`；`npm run db:generate` 退出码 0，关键输出为 `No schema changes, nothing to migrate`。
- 依赖审计：`npm audit --omit=dev --audit-level=high` 退出码 0，统计为 `0 high / 0 critical / 2 moderate`；两项中危均来自 Next 间接依赖 PostCSS，自动修复会破坏性降级到 `next@9.3.3`，本轮未执行该降级。
- 语义变更：用户主动撤销 OAuth consent 从“只撤销 consent/access/refresh token”改为“同一 D1 batch 同时取消该用户与客户端的全部 pending external payment 并清空 approval challenge”。全量 OIDC 用例新增字段断言：撤权后付款回跳 `payment_status == cancelled`，买家 `balance == ledgerBalance == 16`，卖家 `pendingBalance == ledgerPendingBalance == 4`。
- 嵌入应用浏览器断言：在 `1440x1000` 下逐个进入 `MORI / WANDER / TYPEWAVE / LOOPS / SPROUT / MINUTE`，六个外壳均满足 `data-embed-state == ready`、`loadingOverlayCount == 0`、`iframeReadyState == complete`、`iframeBodyChildCount == 1`；正文长度分别为 `197 / 342 / 320 / 195 / 334 / 184`，iframe 尺寸均为 `1150x808`。MORI 修正前同一脚本得到 `loadingOverlayCount == 1`，加入同源 `readyState + body` 轮询后同一断言变为 `0`。
- 嵌入应用视觉断言：六个作品稳定态截图位于 `output/playwright/releaseqa/*-cli-settled.png`；MORI、WANDER、TYPEWAVE、LOOPS 的 canvas 均为非零尺寸并有实际绘制，SPROUT 与 MINUTE 为纯 DOM 工具；六页均满足 `scrollWidth == innerWidth == 1280`。
- 银河桌面断言：`1440x1000` 总览满足 `target == singularity`、`cameraTransition == settled`、`galaxyCount == 4`、`planetCount == 12`、`hostStarCount == 4`、`blackHoleVisible == true`、`blackHoleLayerVisible == true`、`orbitResidual <= 3.33e-16`；帧号在 450ms 内从 `47` 增至 `75`。点击 `进入源光星系 ORIGO` 后先采到 `cameraTransition == flying`，随后收敛到 `target == aurelia && cameraTransition == settled`，目标距黑洞 `110.53`、距宿主恒星 `14.65`。
- 银河像素断言：对 canvas 元素截图按 `80x60` 网格抽样，桌面总览为 `4800 samples / 1610 non-black / 700 distinct`，AURELIA 行星视图为 `4800 / 1429 / 983`，移动总览为 `4800 / 1842 / 483`；亮度范围分别为 `0..238 / 0..250 / 0..234`。这证明截图中的 Three.js canvas 不是空白帧，不把页面文字像素作为画布证据。
- 银河移动断言：`390x844` 下 `scrollWidth == innerWidth == 390`、`scrollHeight == innerHeight == 844`，黑洞总览保持 `blackHoleVisible == true`；截图为 `output/playwright/releaseqa/galaxy-mobile.png`。
- 移动底栏断言：`390x844` 下首页固定导航为 `y=779..844`，其计算背景从半透明改为不透明 `rgb(251, 250, 247)`；`output/playwright/releaseqa/home-mobile-latest.png` 中不再透出下方统计文字。内容仍有底部安全留白，可通过滚动完整访问。
- iframe 边界：`onLoad` 与同源 body 轮询现在都会清除 interval，跨源导航不会在 ready 后留下 100ms 轮询；浏览器仍报告同源 iframe 同时使用 `allow-scripts` 与 `allow-same-origin` 的警告。六个作品依赖同源 localStorage，因此当前把它们视为受信任的一方静态代码，不声称具备恶意 iframe 隔离。五个非官方作品在 localhost 还会因桥接白名单只含正式域名而报告 `postMessage target origin` 警告；真实 Sites 域名上的桥接事件尚未验证。
- 独立安全复核：复核确认缺失 `APP_ENV` 的身份头/OIDC 临时密钥、管理员客户端拒绝、管理状态与审计同 batch、并发 unlike 四条代码路径已有闭合条件；其中审计 INSERT 失败回滚仍缺动态故障注入。复核发现的用户 consent/pending payment 缺口已按上一条修正并进入 61 项全量用例；隐藏付费产品政策与 iframe 隔离边界仍保留。
- 发布阻断一：GitHub OAuth Client Secret 曾出现在对话中；公开发布前必须在 GitHub 轮换并更新 Sites secret，旧密钥不得继续使用。
- 发布阻断二：隐藏已有付费订单的产品时，当前策略只会隐藏内容、把卖家钱包置为 `review`、冻结未结算收入并创建高风险事件；买家获得受控历史访问还是平台补偿尚无业务决策，不能据当前状态声明发布就绪。
- 本轮改动可能引入的新风险：iframe ready 兜底依赖同源 `contentDocument` 与非空 body，若将来把作品迁到跨域主机必须改用经过 origin 白名单校验的 `postMessage`；移动底栏改为实体底色后视觉层不再透出页面内容，但固定导航仍覆盖视口底部，依赖现有 `82px/88px` 内容底部留白保证可滚动访问。
- 未覆盖范围：真实 GitHub 授权回调、Google 登录、生产 `APP_ENV/OIDC_SIGNING_PRIVATE_JWK/ZAOCHANG_ADMIN_EMAILS` 注入、真实 Sites D1/R2 升级、真实部署域名的 iframe bridge、Webhook、邮件通知、低端 Android、iOS Safari、4K、高刷新率、GPU context loss、弱网、压力、容量、备份恢复和生产观测尚未验证；本轮未部署、未推送 GitHub。

## 2026-07-14 CI 与迁移 Runbook 对账

- 状态：部分完成
- 发现并修正的漂移：仓库迁移已到 `0007_product_like_counters.sql`，但发布 Runbook 仍只要求重放和回滚保留至 `0006`；Runbook 现在明确按 `0000..0007` 顺序重放，并在应用回滚时保留 `0006/0007` 两个前向结构。
- CI 门禁：GitHub Actions 新增禁用测试语法扫描与 `git diff --check`，使流水线与 Runbook 的本地闸门一致。扫描命令本地退出码 0，关键输出为 `NO_DISABLED_TEST_MECHANISM_FOUND`；`git diff --check` 退出码 0。
- 证据边界：上述结果证明当前工作区没有命中已列举的 Node 测试 skip/todo 语法，且文本补丁无 whitespace error；`.github/workflows/ci.yml` 尚未在真实 GitHub Actions Ubuntu runner 执行，不能据此声明远端 CI 已生效。
- 本轮改动可能引入的新风险：禁用测试扫描基于语法模式，若未来通过自定义包装器或运行器配置过滤测试，当前规则不会自动识别；应继续核对测试总数与 `skipped/todo` 统计。
- 未覆盖范围：未运行 GitHub Actions；未演练真实 Sites D1 的 `0000..0007` 重放、备份和回滚；未修改或验证隐藏付费产品的买家补偿政策。

## 2026-07-14 iframe 失败终态与最终复跑

- 状态：部分完成
- 独立复核：复核者静态确认用户撤销 consent 时，consent/access/refresh/pending payment 位于同一 D1 batch；旧 challenge 返回 `cancelled`，买家 `balance == 16 == ledgerBalance`，卖家 `pendingBalance == 4 == ledgerPendingBalance`。复核未重跑测试，明确保留“撤权与支付确认同时到达”的线性化竞态缺口。
- iframe 失败语义：12 秒无响应现在清除并置空 100ms `pollRef` 后进入 `failed`；失败页保留重新载入入口，晚到的真实 iframe `onLoad` 仍可恢复为 `ready`，但不再依赖永久轮询。
- 浏览器故障注入：Playwright 将 `**/product-apps/mori/**` 请求挂起 20 秒；500ms 时 `activeBefore == 1`，12 秒后 `data-embed-state == failed` 且 `active100msIntervals == 0`，失败文案包含“作品暂时没有响应”和“重新载入”。正常加载反例为 `state == ready`、`loadingOverlayCount == 0`、`iframeReadyState == complete`、`iframeBodyChildCount == 1`。
- 最终自动门禁：`npm test` 退出码 0，统计 `61 tests / 61 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo`；`npx tsc --noEmit` 退出码 0；`npm run lint` 退出码 0，统计 `0 errors / 9 warnings`；`npm run db:generate` 退出码 0，输出 `36 tables / No schema changes, nothing to migrate`；`npm audit --omit=dev --audit-level=high` 退出码 0，统计 `0 high / 0 critical / 2 moderate`；`git diff --check` 退出码 0。
- CI 与证据矩阵：同 CI 正则的本地扫描输出 `NO_DISABLED_TEST_MECHANISM_FOUND`；`js-yaml` 解析 `.github/workflows/ci.yml` 输出 `CI_YAML_PARSE_OK`；非生成型改动对账为 `changed=65 / evidence=65 / missing=0 / extra=0`。
- 本轮改动可能引入的新风险：12 秒后不再轮询 `contentDocument`，极少数浏览器若晚到资源完成但不触发 iframe `load`，页面会保持失败态直到用户点击重新载入；正常同源加载与故障挂起两个分支已覆盖，真实弱网晚到事件顺序未覆盖。
- 未覆盖范围：撤权与确认支付并发线性化、GitHub Actions 真实 runner、真实 GitHub 回调、Sites secret/D1/R2/公开域名、真实弱网晚到 iframe、同源 iframe 恶意代码隔离、Webhook、邮件、备份恢复、压力容量和移动真机仍未验证；隐藏付费产品政策与泄露 OAuth secret 轮换继续阻断发布。

## 2026-07-14 全部用户产品预审

- 状态：部分完成
- 需求口径：所有用户/卖家提交的产品，无论免费、一次解锁或按次体验，必须先经平台预审；造场官方内置静态应用不属于卖家上传记录。
- 语义变更：用户产品默认从可发布改为 `pending_review`；只有当前 `review_version` 存在同审核人、决定、意见和时间的 `product_review_decisions` 记录时，才允许进入 `approved/published`。
- 语义变更：审核决定从可被数据库直接更新/删除改为追加后不可变；`UPDATE` 与 `DELETE product_review_decisions` 均由 `product_review_decision_immutable` 中止，避免终态仍公开而审核证据被篡改或清空。
- 语义变更：所有权、名称、说明、分类、体验地址、封面、主题或定价变化，从维持原批准状态改为 `review_version + 1` 并重新进入预审。
- 语义变更：订单、点赞、产品评论、打赏与点赞奖励从 API 预查改为同时增加数据库写入守门；审核状态在预查后发生变化时，写入触发器以 `product_*_not_approved` 中止整批财务动作。
- 语义变更：支付与打赏的旧幂等键从可在商品复审时直接重放，改为先核对当前批准状态；待审/隐藏/驳回时返回 `product_not_found`，不再次扣果或授予访问权。
- 独立复核修正：checkout 正常入口、订单唯一键冲突恢复和一次解锁权益冲突恢复现在都把访问判定绑定到同一条“当前产品 `published + visible + approvedVersion == reviewVersion`”谓词；重复订单查询已通过 `JOIN products` 线性化，重复订单不存在且产品已失效时、或权益冲突后当前批准权益不存在时，显式返回 `404 product_not_found`，不再落成旧访问权或原始 `500`。
- 独立复核结论：修正后的静态 diff 未发现原 checkout 竞态仍可复现；复核确认订单重放与权益查询以当前批准联表查询为线性化点。剩余错误语义是“旧幂等键属于另一个已进入复审商品”时可能返回通用 `409` 而非明确 `idempotency_conflict`，但不会扣果或授予访问权，列为非阻断语义。
- 迁移证据：`npm test` 的全新 D1 流程预置历史订单和点赞后应用 `0008`；字段断言为产品 `pending_review/pending_review/1/0` 且两条历史引用仍存在。无审核决定的全字段直接批准命中 `product_review_state_invalid`；审核决定更新/删除均命中 `product_review_decision_immutable`；待审订单、点赞、评论和打赏分别命中对应数据库触发器。
- 自动门禁：`npm test` 退出码 0，统计 `65 tests / 65 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo`；该命令包含 vinext 生产构建和 `0000..0008` 迁移。`review invalidation during checkout rolls back the entire financial batch` 通过字段断言证明审核在首条 purchase 操作触发时变化，最终产品仍为 `published/approved/1/1`、买家 `balance=10/pending=0`、卖家 `balance=0/pending=0`、订单数 `0`、对应 purchase operation 数 `0`。故障注入触发器仅存在于测试，本身不会编译或部署；生产路径执行的是同一 `db.batch` 与 `product_orders_approved_product_guard`。`npx tsc --noEmit` 退出码 0。
- 浏览器 UI 证据：桌面创作台在待审阶段显示“审核中”且待审产品链接数为 `0`；管理员填写意见并批准后，队列显示“没有待预审商品”，创作台显示“已发布”且产品详情链接数为 `2`（最近作品与作品列表）。移动 `390x844` 下管理员队列含产品名/批准/驳回控件，创作台同时含“审核中/已发布”，待审产品链接数为 `0`、已发布产品链接数为 `2`，两页 `scrollWidth=375 <= innerWidth=390`。截图为 `output/playwright/releaseqa/product-review-admin-mobile.png`、`product-review-studio-mobile.png` 与 `studio-product-review-approved.png`。
- 本轮改动可能引入的新风险：严格的数据库写守门会让审核切换瞬间到达的旧客户端请求由成功变为 `404`；这是 fail-closed 行为，但客户端需要把它呈现为“产品正在复审”，不能无限重试。管理员只能读取已关联待审产品的私有封面，孤立封面和普通私有资料均为 `403`。
- 发布阻断：外部 `demoUrl` 内容可在相同 URL 原地替换，当前没有不可变站内包或内容摘要复核；GitHub OAuth 旧 secret 必须轮换；隐藏已有付费订单后的买家历史访问/补偿政策仍未决。
- 未覆盖范围：真实 Sites D1 迁移、真实 R2 元数据、审核与支付并发的生产压力、远程演示内容变更检测、GitHub Actions、生产密钥和真实公开域名尚未验证；本轮未部署、未推送 GitHub。

## 2026-07-15 逐钮回归与发布前复跑

- 状态：阻断级缺口
- 全量自动门禁：`npm test` 退出码 0，统计 `65 tests / 65 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo`，包含 vinext 生产构建和空 D1 的 `0000..0008` 迁移；`npx tsc --noEmit` 退出码 0；`npm run lint` 退出码 0，统计 `0 errors / 9 warnings`；`git diff --check` 退出码 0；测试目录与配置检索输出 `NO_SKIP_OR_ONLY_MATCHES`，新增 diff 检索输出 `NO_ADDED_SKIP_MECHANISMS`。
- 依赖与迁移：`npm run db:generate` 退出码 0，输出 `37 tables / No schema changes, nothing to migrate`；`npm audit --omit=dev --audit-level=high` 退出码 0，但仍报告 Next 内置 PostCSS 的 `2 moderate`，强制修复会破坏性降级到 `next@9.3.3`，未执行。
- 逐文件证据对账：`git status --porcelain=v1 -uall` 展开目录后共发现 `617` 个改动路径；只排除 `539` 个 `.playwright-cli/` 与 `output/` 临时证据文件，`RELEASE_EVIDENCE.md` 对剩余 `78` 个发布相关改动文件给出 `78` 行证据说明，机械对账结果为 `missing=0 / extra=0`。SPROUT 的两个生成 bundle 会进入线上静态资源，故仍逐文件纳入；套件级绿灯不替代各行标注的“未单独验证”。
- multipart 边界：`next.config.ts` 将 vinext 的 multipart/Server Action 请求体门限从默认 `1MB` 提高到 `10.1mb`，路由仍按单文件 `10MB` 拒绝；本地实测 `1,426,368` 字节 PNG 返回 `201` 且 `size=1426368 / visibility=private / purpose=product_cover`，`89,875,456` 字节载荷返回 `413`。该设置扩大框架入口可接收体积，不等于取消应用层文件上限。
- 移动嵌入交互：`390x844` 下 MORI、LOOPS、WANDER 的参数抽屉可展开并改变主题/心境/滑杆实际值，MINUTE 的文字、心情、计时、暂停、重置和主题均产生状态变化。主站“独立打开”浮层曾截获 LOOPS 的“调整声场/完成”，移动端隐藏该次级链接后，LOOPS 抽屉的“完成”由超时改为真实点击成功；桌面入口保持不变。
- 嵌入应用无障碍：共享 `selection-a11y.js` 为 MORI、MINUTE、SPROUT 的主题与阶段按钮同步 `aria-pressed`；重建后快照分别出现 `苔绿 [pressed]`、`晨光 [pressed]`、`种子 [pressed] / 工作纸 [pressed]`。LOOPS 与 WANDER 原 bundle 已原生暴露 pressed，未改其生成逻辑。
- 银河移动证据：`output/playwright/button-audit-galaxy-mobile.png` 为 `390x844`，可见黑洞、吸积环、四个产品赛道与两个行动入口；整页按 `8x12` 步长抽样得到 `3479 sampled / 152 quantized colors / 314 non-dark samples`，证明移动截图不是空黑帧，但该整页抽样不替代上一轮只截 canvas 的像素证据。
- 站内支付未生效分支：`audit-owner@example.com` 钱包保持 `review` 时，产品 1 的“确认解锁”显示“钱包正在审核，暂时不能发生交易”；随后字段断言为买家 `balance=17 / lifetime_spent=3`、非退款新订单数 `0`、新 purchase 分录数 `0`。
- 一次解锁与重复购买：本地预审产品 5 首次 UI 解锁后买家 `17→13`、卖家待结算 `3→7`、订单 `paid`、权益 `active`、purchase operation 数 `1`、产品 `plays_count=1`；使用不同幂等键再次 checkout 返回 `access=true / charged=false / reason=already_owned / balance=13`，没有第二次扣款。
- 退款二分：有效窗口内点击钱包“退款”后买家 `13→17`、卖家待结算 `7→3`、订单 `refunded`、权益 `revoked`，反向分录为 `available +4 / pending -4`；第二次购买后把窗口置为过去，API 返回 `409 {error: refund_window_closed}`，最终订单仍 `paid`、权益仍 `active`、退款 operation 数 `0`、双边余额未变。按次产品 6 支付后订单 `paid / amount=2 / refundable_until=null`、权益数 `0`，退款返回 `409 {error: per_use_not_refundable}`，钱包不显示退款按钮且最终退款 operation 数 `0`。
- OAuth 撤销与公开客户端：浏览器点击“撤销授权”后页面显示“应用授权与现有令牌已经撤销”，D1 字段为 consent `revoked_at=2026-07-15 10:46:50`、`access_tokens=1/revoked_access_tokens=1`、`refresh_tokens=1/revoked_refresh_tokens=1`。公开客户端表单改为“公开客户端不生成密钥”；真实创建后警示只显示 Client ID、PKCE 说明和“我已记录 Client ID”，没有伪造 Client Secret。
- 本轮改动可能引入的新风险：移动端不再提供主站“独立打开”快捷链接，只保留嵌入体验；共享 MutationObserver 只观察四类明确选择器，但仍增加一次轻量 DOM 观察；multipart 框架门限提高会扩大单请求内存压力，仍依赖路由 `10MB`、边缘平台体积限制和未来压力测试。
- 发布阻断：对话中暴露过的 GitHub OAuth Client Secret 仍必须轮换并更新 Sites secret；隐藏已有付费订单后的买家受控访问/补偿政策仍未决定；外部 `demoUrl` 没有内容摘要或不可变站内包；真实 Sites 环境尚未执行密钥注入、D1/R2 升级和公开部署。
- 未覆盖范围：真实 GitHub/Google 回调、GitHub Actions runner、Sites 生产 secret/D1/R2/域名、真实弱网与晚到 iframe、低端 Android、iOS Safari、4K、高刷新率、GPU context loss、压力容量、恶意文件扫描、Webhook、邮件、备份恢复和生产观测仍未验证；本轮未推送 GitHub、未部署线上。

## 2026-07-15 工作区迁移到 X 盘

- 状态：部分完成
- 唯一开发根目录：`X:\zaochang`；后续代码、测试、Git 与部署操作只允许在该目录执行。
- 文件迁移证据：增量 `robocopy` 退出码 `1`（成功复制且无失败），统计 `38450 files / 0 mismatch / 0 failed`；源与目标 Git `HEAD` 同为 `0428be85bf77044de44e124777324f73beb6b8ef`，远端同为 `https://github.com/lizuyi-6/zaochang.git`。
- 工作树证据：源与目标 `git status --porcelain=v1 -uall` 均为 `591` 行且 `STATUS_DIFF=0`；排除 `.playwright-cli/` 与 `output/` 临时证据后，`157` 个项目文件 SHA-256 对账为 `MISSING=0 / HASH_DIFF=0`。
- 新路径运行证据：在 `X:\zaochang` 干净环境执行 `npm test` 退出码 `0`，统计 `65 tests / 65 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo`；该命令包含 vinext 生产构建、空 D1 的 `0000..0008` 迁移和集成行为断言，总时长 `190696.7481ms`。此前两次外层工具超时未形成测试结论，清理为 `X_WRANGLER_PROCESSES=0 / PORT_4179_LISTENERS=0` 后的本次结果才作为迁移运行证据。
- 对话迁移：Codex 任务 `019f5418-d443-77d3-9597-bac87717c09f` 保留全部历史，并已改名为“造场产品银河｜X:\zaochang”。由于当前任务进程持有旧目录句柄，Codex 元数据中的旧 `cwd` 无法在运行中自我换绑；旧目录只保留重定向规则，后续代理必须使用本节声明的新根目录。
- 清理边界：旧目录尚未删除，也尚未改为目录联接；关闭当前任务释放 Windows 句柄后，才能在再次核对 `X:\zaochang` 后安全清理。此项不影响 X 盘副本的 Git 内容，但不应把“存在两个物理副本”表述为已经彻底搬迁。

## 2026-07-15 阿里云受保护预发布

- 状态：部分完成；当前是 Basic Auth 保护的预发布环境，不是公开生产发布。
- 入口：`https://aetherstudio.top/` 与 `https://www.aetherstudio.top/` 指向 `39.96.196.207`；Nginx 对 HTTP 执行 HTTPS 跳转，HTTPS 未认证请求返回 `401`，认证后才代理到应用。预览用户名为 `preview`，密码只在部署交付中单独提供，不写入仓库；服务器只保存 `/etc/nginx/.htpasswd-zaochang` 的 bcrypt 哈希，权限为 `root:www-data:640`。浏览器自动化结束后已轮换预览密码，旧密码反例返回 `401`、新密码返回 `200`。
- 版本锚点：远端 current 为 `/opt/zaochang/releases/20260715-200514-0428be85bf77-working-r2`；上传包 SHA-256 为 `e887a2f19f12165ce6c13f605e4a66076de719f42f60bfec4435102153d8561f`，本地与远端一致。首个缺少 `build/sites-vite-plugin.ts` 的失败包没有切换 current，也没有执行迁移。
- 运行架构：Ubuntu 26.04、Node `v22.23.0`、Nginx `1.28.3`；systemd 以专用 `zaochang` 用户运行 Wrangler/Workerd，应用只监听 `127.0.0.1:3001`，仅 `/var/lib/zaochang` 与当前 release 的 Wrangler 临时目录可写。`zaochang.service` 与 `nginx.service` 均为 `active/running`、`NRestarts=0`。
- 数据证据：对全新的 `/var/lib/zaochang/state` 顺序应用 `0000..0008` 共 9 个迁移，查询 `sqlite_master` 得到 `user_tables == 37`；当前使用本机持久化 D1/R2 模拟层，数据不在 Cloudflare 托管 D1/R2。
- 初始恢复点：停服后生成 `/var/backups/zaochang/state-initial-20260715T123625Z.tar.gz`，SHA-256 为 `b3559d07a88f1e7063f1b5aa309bd3e0d82ad792586b936783daeb90d60c8984`，大小 `17967` 字节、权限 `root:root:600`；重新启动后社区 API 返回 `200`。该单次快照不构成自动备份能力。
- HTTPS 证据：Let's Encrypt 证书 SAN 为 `aetherstudio.top` 与 `www.aetherstudio.top`，有效期至 `2026-10-13 11:23:10+00:00`；`certbot.timer` 为 `enabled/active`，`nginx -t` 退出码 0。
- 行为证据：服务器回环首页 `200 / 68544 bytes / 造场标记 2`、`/api/community` 为 `200` 且 JSON；公网 HTTPS 首页、银河、登录页、社区 API 与 `www` 入口均为 `200`。伪造 `oai-authenticated-user-*` 头 POST `/api/products` 返回 `401 {"error":"auth_required"}`，匿名管理员 API 同样返回 `401`，证明 `APP_ENV=production` 下身份头默认拒绝。
- 浏览器证据：Basic Auth 缓存后的干净标签页为 `0 errors / 0 warnings`；桌面银河截图中央区域抽样为 `4800 samples / 1561 non-dark / 98 quantized colors`。移动端 `390x844` 满足 `scrollWidth == innerWidth == 390`、`scrollHeight == innerHeight == 844`，轻量星图截图为 `6890 samples / 809 non-dark / 49 quantized colors`；移动端按既定策略不加载 Three.js canvas。登录页明确显示 Google 与 GitHub 均为“待配置”。
- 发布阻断：泄露过的 GitHub OAuth Secret 尚未轮换；隐藏已有付费订单后的买家访问/补偿政策未决；外部 `demoUrl` 没有不可变摘要；本机 Wrangler 持久化不是 Cloudflare 正式生产运行时。因此 Basic Auth 不得移除，本环境不得表述为公开生产站。
- 本轮部署可能引入的新风险：服务器只有约 `1.6GiB` 内存且无 swap；Wrangler 本地运行时和状态目录缺少自动备份、跨机复制与容量告警；Basic Auth 只有一个共享账号；`aetherstudio.top` 是通用工作室域名而非 `zaochang.com`。这些均需在正式发布前替换或补齐。

## 2026-07-16 OAuth 与预发布入口收口

- 状态：部分完成；`https://aetherstudio.top` 继续作为 Basic Auth 保护的远程验收环境，不是公开生产环境。当前版本为 `/opt/zaochang/releases/20260715-221407-0428be85bf77-working-r3`，发布包 SHA-256 为 `0794ddb985b713d71a9f35dbca356d877c976cb272d8ecbeb8d2d77fd03e3bcc`。
- GitHub OAuth：应用 `zaochang` 的 Client ID 为 `Ov23livgjlLc01RdgmuN`，Homepage 为 `https://aetherstudio.top/`，回调为 `https://aetherstudio.top/api/auth/github/callback`。真实 GitHub 授权从提供方返回 `/profile`，页面身份为 `Abraham Valerio`；同一会话访问 `/admin` 返回 `200` 并渲染“发布运营控制台”。
- Secret 轮换：新 Secret 仅存在于服务器 `/etc/zaochang/zaochang.env`，文件为 `root:zaochang 0640`；GitHub 设置页只剩后缀 `b080520e` 的当前 Secret。曾在对话中暴露、后缀为 `b62dd389` 的旧 Secret 已从 GitHub 删除，页面显示 `Client secret removed`，旧项不再出现在 Secret 列表。
- Basic Auth 轮换：用户名仍为 `preview`，服务器只保存 `/etc/nginx/.htpasswd-zaochang` 的 bcrypt 哈希，权限为 `root:www-data 640`。服务器回环 HTTPS 反例为 `unauth=401 / old=401 / new=200`；新密码不写入仓库或对话，使用当前 Windows 用户 DPAPI 加密保存在 `C:\Users\Abraham\.ssh\zaochang-preview-password.dpapi`，明文 SHA-256 指纹前 12 位为 `4004406f0407`。
- 语义变更（由本轮“继续”触发的线上冒烟修复）：Nginx 的动态页面/API 每 IP 并发上限保持 `30`；`/assets/`、`/product-apps/` 与 `/favicon.svg` 从同一 `30` 上限改为静态资源专用 `128`。所有路径继续使用 `10 req/s`、`burst=100` 的请求速率守门，Basic Auth 没有放宽。
- 静态并发反例：改前 fresh Chrome 请求银河时 9 个模块被 Nginx `limit_conn` 返回 `503`，页面空白且控制台 11 errors；第一次只放宽 `/assets/` 后模块恢复但 `/favicon.svg` 仍有 1 个 `503`。最终 fresh session 的 49 个页面、模块、favicon、API 与 RSC 请求全部返回 `200`，控制台 `0 errors / 0 warnings`，Canvas 为 `1440x900`、`cameraTransition=settled`，页面滚动尺寸等于视口。截图为 `output/playwright/release-smoke-2/page-2026-07-15T15-12-55-526Z.png`。
- 登录与权限：独立 `/signin` 的 GitHub 链接为 `/api/auth/github/start?return_to=%2F`，Google 明确显示“待配置”，主社区导航数量为 `0`。原 GitHub 会话携带新 Basic 凭据读取 `/profile` 与 `/admin` 均为 `200`；前者命中当前身份，后者命中管理员控制台，未被登录页替代。
- 全量门禁：`npm test` 退出码 0，统计 `67 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo`，包含生产构建和 `0000..0009`；`npx tsc --noEmit` 退出码 0；`npm run lint` 退出码 0，统计 `0 errors / 9 warnings`；`npm run db:generate` 输出 `37 tables / No schema changes`；`npm audit --omit=dev --audit-level=high` 退出码 0，统计 `0 high / 0 critical / 2 moderate`；`git diff --check` 退出码 0，跳过语法扫描输出 `NO_SKIP_OR_ONLY_MATCHES`。
- 服务器与恢复：`zaochang.service`、`nginx.service` 均为 `active/running` 且 `NRestarts=0`；`/swapfile` 为 `4294963200` 字节；每日备份与五分钟健康检查 timer 均为 `enabled/active`；最新备份恢复探针输出 `restore_check=ok sqlite=4 files=4`。
- 本轮改动可能引入的新风险：静态资源每 IP 可同时占用的上游请求从 30 增至 128，理论上增加单个已知 Basic Auth 用户的静态带宽和 Workerd 并发占用；现有 `10 req/s + burst 100` 仍限制请求速率，但尚未做 128 并发压力和内存峰值测试。
- 仍阻断公开发布：生产数据仍运行在服务器本地 Wrangler/Workerd 持久化层而非受支持的 Cloudflare D1/R2；Basic Auth 是共享预览凭据；Google 登录未配置；跨机备份、容量压测、恶意上传扫描与生产告警接收链未验收。因此不得移除 Basic Auth 或把当前环境描述为公开生产站。
- 未覆盖范围：非管理员 GitHub 账号的 `/admin` 拒绝、GitHub 退出后的旧 Cookie 重放、Google 真实回调、用户撤权与支付确认同时到达、128 静态并发压力、外部 Demo 恢复批准路径、GitHub Actions runner、低端 Android、iOS Safari、4K、高刷新率、GPU context loss、弱网、Webhook 与邮件仍未验证。

## 2026-07-16 依赖安全收口与 Git 固化

- 状态：部分完成；本地发布分支为 `codex/release-ready-20260716`，线上 current 仍是 `/opt/zaochang/releases/20260715-221407-0428be85bf77-working-r3`，本节依赖升级尚未部署到服务器。
- 依赖变更：Next `16.2.6 -> 16.2.10`、React/React DOM/RSC `19.2.6 -> 19.2.7`、Cloudflare Vite plugin `1.37.1 -> 1.45.0`、Vite `8.0.13 -> 8.1.4`、Wrangler `4.92.0 -> 4.111.0`；Next 内嵌 PostCSS 固定为 `8.5.10`，Drizzle 旧加载器的 esbuild 固定为 `0.25.12`。
- 审计反例与结果：升级前 `npm audit` 退出码 `1`，统计 `6 high / 7 moderate / 1 low / 0 critical`；升级后从 `X:\zaochang` 执行审计退出码 `0`，统计 `0 high / 0 moderate / 0 low / 0 critical`。`npm ls --all --json` 退出码 `0`，目标包实际解析版本与清单逐项相等。
- 升级后行为门禁：`npm test` 退出码 `0`，Vite `8.1.4` 生产构建成功，统计 `67 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo`；`npx tsc --noEmit` 退出码 `0`；Lint 退出码 `0`，统计 `0 errors / 9 warnings`；Drizzle 输出 `37 tables / No schema changes`。
- X 盘依赖边界：X 盘增量 npm reify 两次长时间无退出后停止，锁文件在 NTFS 验证副本生成；`X:\zaochang\node_modules` 当前是指向该已审计依赖树的本地目录联接。半安装恢复目录 `node_modules.xdrive-partial-20260716-230708` 的删除被主机策略拒绝，未删除，仅由 Git、TypeScript 与 ESLint 排除，不进入提交。
- CI 兼容修复：GitHub Actions run `29511188405` 在 Node `22.13.0` 构建成功后，因测试直接导入 `.ts` 而返回 `ERR_UNKNOWN_FILE_EXTENSION`；test 脚本显式增加 `--experimental-strip-types`。本地使用 `npx node@22.13.0` 执行同一测试入口退出码 `0`，统计 `67 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo`。
- 仍阻断公开发布：本节依赖升级未部署；生产数据仍使用本机 Wrangler/Workerd 持久化层；Basic Auth 仍是共享预览凭据；Google 登录、跨机备份、恶意上传扫描、生产告警接收链与容量压测未验收。

## 2026-07-17 r4 合并部署与预览凭据事件

- 状态：部分完成；`https://aetherstudio.top` 仍是 Nginx Basic Auth 保护的远程验收环境，不是公开生产站，Basic Auth 不得移除。
- GitHub 合并：PR `#1` 已合并，merge commit 为 `90b10b4f84755a5423f223f027ecf996058ed4e4`。主分支 Actions run `29514985327` 的 `verify` job 为 `success`，其中 checkout、Node 22、`npm ci`、TypeScript、Lint、禁用测试扫描、`npm test`、`git diff --check`、迁移漂移检查和生产依赖高危门禁共 11 个步骤全部成功。
- 发布包：本地归档为 `output/deploy/zaochang-90b10b4f8475.tar.gz`，SHA-256 为 `32e7f332a5e83723546f3ae1fd99bb791e7d6eb7daeb2df1b84eb4734490cc2f`；服务器 release 为 `/opt/zaochang/releases/20260716-162918-90b10b4f8475-main-r4`。服务器 `npm ci`、Vite `8.1.4` 构建和 `npm audit` 均退出 0，审计结果为 0 vulnerabilities，Wrangler 为 `4.111.0`。
- 迁移与数据：服务器比较 `0000..0009` 后得到 `semantic_changes=0`，差异仅为 CRLF/LF，因此没有重放迁移。生产数据库 `integrity=ok`，包含 37 张业务表、1 张 Wrangler `_cf_METADATA` 表、6 个审核字段和 11 个审核/支付关键触发器。
- 原子切换与恢复点：`/opt/zaochang/current` 和 `zaochang.service` 进程 cwd 均解析到 r4。切换前备份为 `/var/backups/zaochang/state-20260716T163859Z.tar.gz`，校验和一致，恢复探针为 `restore_check=ok sqlite=4 files=4`。
- 服务与日志：`zaochang.service`、Nginx 均为 `active/running`，应用 `NRestarts=0`，`nginx -t` 成功。自 `2026-07-16 16:38 UTC` 起应用 journal 没有 warning/alert，最近 1000 条 Nginx access log 没有 `5xx`；Nginx error log 只有轮换校验时旧预览密码被拒绝的 `password mismatch`。
- 线上行为：受保护生产域名的银河页 46 个页面/API/RSC/静态请求均为 `200`，控制台 `0 errors / 0 warnings`，Canvas 为 `1440x900`；AURELIA 镜头终态为 `cameraTransition=settled`，可见 12 颗行星和 4 颗宿主恒星。SSH 回环隧道验证独立 `/signin` 为 `path=/signin / navCount=0 / hasLoggedInAccount=false`，GitHub 控件指向 `/api/auth/github/start?return_to=%2F`，控制台 `0 errors / 0 warnings`。同一隧道下 MORI 为 `iframeReadyState=complete / bodyChildCount=1 / loadingOverlay=false`；其 3 条 warning 来自隧道 origin 与固定生产 origin 不一致，只证明回环加载，不构成生产控制台证据。
- 凭据事件：浏览器自动化曾把旧 Basic Auth 密码放入 URL，且 URL 出现在工具输出中，因此旧值按已暴露处理并立即轮换。服务器反例为 `unauthenticated=401 / old=401 / new=200`，htpasswd 权限仍为 `root:www-data 640`；新值只保留为 `C:\Users\Abraham\.ssh\zaochang-preview-password.dpapi` 的 DPAPI 密文，指纹前缀为 `d5f10051b929`，没有写入仓库、URL 或发布包。Runbook 已新增禁止 URL 凭据及暴露后强制轮换门禁。
- 清理：`release-r4-tunnel` 浏览器会话已关闭，旧 `release-r4-rotated` 会话确认未打开，SSH 本地隧道进程已停止且端口 `39001` 不再监听；本地明文认证配置不存在。服务器 `/tmp/zaochang-90b10b4f8475.tar.gz` 与 6 个本次发布脚本均已删除并断言不存在。
- 仍阻断公开发布：数据仍运行在服务器本地 Wrangler/Workerd 持久化层，而非受支持的 Cloudflare D1/R2；Basic Auth 是共享预览账号；Google 登录未配置；跨机备份、恶意上传扫描、告警投递链和容量/128 静态并发压力尚未验收。因此本节只证明受保护预览 r4 的部署和冒烟，不证明公开生产发布。
- 未覆盖范围：非管理员 GitHub 账号的后台拒绝、真实 Google 回调、线上 logout 后旧 Cookie 重放、撤权与支付确认竞态、128 静态并发、低端 Android、iOS Safari、4K、高刷新率、GPU context loss、弱网、Webhook、邮件、跨机灾备和公开生产数据迁移仍未验证。

## 2026-07-17 r5 静态容量与代理分层

- 状态：部分完成；`https://aetherstudio.top` 仍是 Basic Auth 保护的远程验收环境，不是公开生产站。应用 release 仍为 r4，本节只改变 Nginx 静态交付层并保留可回退配置备份。
- 反例：修正前在服务器回环以 HTTP/1.1 同时请求 128 份 `624888` 字节银河模块，客户端确实打开 `128` 个 socket，终态为 `117×200 + 11×502`；11 条 Nginx 错误均为 Workerd `upstream prematurely closed connection while reading response header`。服务未重启，但该结果直接否定 128 静态并发可用命题。
- 语义变更（触发轮次：2026-07-17 用户“继续做”；依据：上述 `117/11` 反例）：`/assets/`、`/product-apps/`、`/favicon.svg` 从“共享 `10r/s + burst 100` 且代理到 Workerd”改为“独立 `64r/s + burst 160` 且由 Nginx 读取 `/opt/zaochang/current/dist/client`”；静态 `limit_conn=128` 不变。动态页面/API 仍为 `10r/s + burst 100 + limit_conn=30` 并代理到 Workerd。
- 静态容量字段：仓库脚本 `zaochang-capacity-probe.mjs` 在服务器回环执行 `concurrency=128 / maxOpenSockets=128`，结果为 `statuses.200=128 / errors={} / fullBodyCount=128 / totalBytes=79985664`；`allExpectedStatus/noErrors/allExpectedBytes/restartsStable` 四个 verdict 均为 `true`。应用与 Nginx `NRestarts` 都保持 `0`，Nginx cgroup 峰值 `22536192` 字节。
- 动态容量字段：同一脚本对 `/api/community` 执行 `concurrency=30`，结果为 `statuses.200=30 / errors={}`，四个 verdict 均为 `true`，P95 为 `4320.9ms`。该结果证明 30 个请求都有成功终态，不证明 4 秒级负载延迟满足尚未定义的生产 SLO。
- 缓存与嵌入边界：成功银河模块为 `200 / 624888 bytes / Cache-Control=public,max-age=31536000,immutable`；同一路径匿名访问为 `401 / Cache-Control=null`，缺失资产为 `404 / Cache-Control=null`。WANDER 为 `SAMEORIGIN + geolocation=(self)`，MORI 为 `SAMEORIGIN + geolocation=()`，CSP、nosniff、Referrer-Policy 与 HSTS 均保留。
- 自动门禁：加入 Nginx 配置和探针入口字段断言后，`npm test` 退出码 `0`，统计 `68 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo`；该命令包含 Vite `8.1.4` 生产构建与空 D1 的 `0000..0009` 集成流程。候选和实际 `/etc/nginx/nginx.conf` 的 `nginx -t` 均退出 `0`，Nginx 为 `active/running/NRestarts=0`。
- 测试清理反例与修正：一次全量复跑在 Windows `after()` 的无超时 `taskkill /T /F` 中挂起，留下 `workerd.exe` 并锁住 `dist/server/.wrangler`；随后构建以 `EPERM` 明确失败。测试服务器改为直接启动 Wrangler Node 入口，优先通过子进程句柄结束，并只把带 `10s` 超时的 `taskkill` 作为兜底。清除残留后当前完整 diff 的复跑退出码 `0`，终态为 `68/68`、`skipped=0`、`todo=0`、`duration_ms=380603.4928`，结束后 4179 无监听且无 Workerd 进程。
- 本轮改动可能引入的新风险：每个已认证 IP 可对静态命名空间瞬时发起最多 `160` 个突发请求，静态 TLS/带宽压力高于原 `100`；动态业务边界未放宽。128 份最大模块的 P95 为 `17890.1ms`，因此本节关闭“请求失败”容量缺口，不关闭 CDN、吞吐或延迟 SLO 缺口。测试进程若无法在优雅终止和 10 秒强制兜底内退出，套件现在会明确失败而不是无限等待，仍可能需要人工清理残留进程。
- 仍阻断公开发布：生产数据仍运行在服务器本地 Wrangler/Workerd 持久化层而非受支持的 Cloudflare D1/R2；Basic Auth 是共享预览账号；Google 登录未配置；跨机备份、恶意上传扫描与生产告警接收链仍未验收。
- 未覆盖范围：本机内置浏览器未能附着，Chrome 未运行且 ChatGPT Chrome Extension 原生通信注册缺失，因此本节没有新增 Canvas 像素、模块网络瀑布或控制台证据；非管理员 GitHub 拒绝、logout Cookie 重放、撤权/支付竞态、低端 Android、iOS Safari、4K、GPU context loss、弱网、Webhook、邮件和跨机灾备仍未验证。

## 2026-07-17 PR #3 CI 重载竞态

- 状态：部分完成；PR `#3` 仍为 `OPEN / MERGEABLE / UNSTABLE`。GitHub Actions run `29573038076` 在 commit `3f473176b3da9666436d86aa087aa8fc540f4e74` 上以 `67 pass / 1 fail / 0 skipped / 0 todo` 退出 `1`，唯一失败为 `external demo URLs cannot cross the immutable review boundary` 的状态 GET 在 Wrangler 重载后抛出 `fetch failed`，耗时 `302000.542884ms`。该结果不证明审核不变量失败；后续产品、支付和 OAuth 子测试继续执行并通过。
- 测试运行器语义变更（触发轮次：2026-07-17 用户“同意修复并合并”；依据：上述 run 的 302 秒网络失败）：外部 D1 维护后的就绪条件从“单次首页 `response.ok`”改为“最多 12 秒内连续 3 次首页 `response.ok`，每次最多 1.5 秒”；失败用例的状态读取从“单次无界 GET”改为“仅 GET/HEAD、无请求体、单次最多 1.5 秒、总计最多 12 秒，并只重试网络错误或 502/503”。POST/支付/审核写请求不进入该重试函数。
- 定向反例：`node --experimental-strip-types --test --test-name-pattern="external demo URLs cannot cross the immutable review boundary" tests/rendered-html.test.mjs` 退出码 `0`，统计 `1 pass / 0 fail / 0 skipped / 0 todo`；目标用例为 `4232.7224ms`。该定向结果只证明原失败路径，没有被用作全套门禁。
- 全套字段：当前精确 diff 的 `npm test` 退出码 `0`，统计 `69 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo / duration_ms=304455.9513`；新增反例 `idempotent retry helper rejects write requests before replay` 通过，原失败用例为 `2690.0835ms`，并继续断言状态响应 `200`、产品 `status == reviewStatus == pending_review`、`approvedVersion == 0` 且公开列表中不存在该产品。
- 其余本地门禁：`node --check tests/rendered-html.test.mjs`、`git diff --check`、`npx tsc --noEmit`、禁用测试扫描和迁移 diff 均退出 `0`；ESLint 为 `0 errors / 9 warnings`；Drizzle 为 `37 tables / No schema changes`；`npm audit --omit=dev --audit-level=high` 为 `found 0 vulnerabilities`。
- 远端复验：GitHub Actions run `29576605970` 在修复 commit `f2b33b412efe2856dde97f9ca023f3b6394c8665` 上以 `conclusion=success` 结束，job `87872378220` 耗时 `2m44s`；checkout、Node、`npm ci`、TypeScript、Lint、禁用测试扫描、`npm test`、diff check、迁移漂移和高危生产依赖门禁均为 `success`。当时 PR 字段为 `OPEN / MERGEABLE / CLEAN`。
- 本轮改动可能引入的新风险：连续健康读取与 12 秒有界恢复会增加每次外部 D1 维护后的测试耗时；极慢 CI runner 可能明确超时失败，但不会无限等待。幂等重试当前只用于测试中的 `/api/community` GET，不改变生产请求处理，也不重试任何不可逆写操作。
- 未覆盖范围：PR 尚未合并，main 尚未包含本节补丁；记录上述 run 的文档提交无法在自身内容中预先记录它尚未触发的后续 run，因此合并前仍必须从 GitHub 外部核对最终 head 的新 `verify == SUCCESS`。公开生产阻断项维持上一节不变。

## 2026-07-17 r6 阿里云部署与公开放行审计

- 状态：部分完成；PR `#3` 的 merge commit `efc90d7397317ab65f511b289d7db05554d3a62d` 已部署到受保护地址 `https://aetherstudio.top/`，当前 release 为 `/opt/zaochang/releases/20260717-201245-efc90d739731-main-r5`，上一版 r4 目录保留。公开放行审计未通过，Nginx Basic Auth 保持启用，匿名首页字段为 `401`，因此本节不构成公开上线。
- 版本命题：本地待部署 HEAD 与远端 merge commit 的 Git tree 均为 `f3eaf491b0fa942b9374a83d732f8c83a593f5e5`。`90b10b4..HEAD` 只改发布配置、探针、测试与证据文档；`app/worker/db/drizzle/public/package.json/package-lock.json` 的 runtime diff 退出 `0`，故没有执行数据库迁移。
- 回滚与数据：部署前生成停服一致性快照 `state-20260717T120542Z.tar.gz`，SHA-256 校验成功，恢复演练为 `restore_check=ok sqlite=4 files=4`。发布前后数据库均为 `integrity=ok / wallet drift=0 / negative wallets=0 / invalid published=0 / invalid approved=0 / approved external demos=0`。
- 部署失败反例：首个 `git archive` 受 Windows 全局 `core.autocrlf=true` 影响导出 CRLF，文件 SHA 与 commit blob 不一致，脚本在切换 current 之前退出 `1`；现场仍指向 r4，应用 active、`NRestarts=0`。改用 `git -c core.autocrlf=false archive` 后，服务器四个文件的 `git hash-object` 与 HEAD blob 逐项相等，再原子切换 symlink；回环 `/api/community` 返回成功，应用与 Nginx 为 `active/running / NRestarts=0 / ExecMainStatus=0`，`nginx -t` 成功。
- 受保护 HTTP 验收：带 DPAPI 凭据的内存脚本对 `/`、`/galaxy`、`/signin`、`/api/community`、OIDC discovery、六个产品应用入口和 favicon 均得到 `200`。普通页为 `X-Frame-Options=DENY + nosniff + HSTS`；六个应用为 `SAMEORIGIN + CSP`，MORI/TYPEWAVE/LOOPS/SPROUT/MINUTE 为 `geolocation=()`，WANDER 为 `geolocation=(self)`，各应用 2 至 3 个 JS/CSS 引用全部 `200`。匿名应用态断言 `signedIn=false / wallet=null / profile=null / ownedProducts=0`。
- OAuth 字段：OIDC `issuer`、authorization、token 与 JWKS origin 均为 `https://aetherstudio.top`；GitHub start 为 `307` 到 `github.com/login/oauth/authorize`，`redirect_uri` 精确等于 HTTPS callback。Google 仍显示“待配置”，直接 start 为 `307` 回登录页，但 Location origin 是 `http://aetherstudio.top`，随后才由 Nginx 301 升级；该非规范降级跳转列为公开缺口。
- 容量字段：最大银河模块为 `624879` 字节。静态 128 并发为 `statuses.200=128 / fullBodyCount=128 / errors={} / P95=16429.7ms / app+nginx restarts 0→0`；动态 `/api/community` 30 并发为 `statuses.200=30 / errors={} / P95=4434.4ms / restarts 0→0`。四个探针 verdict 均为 true；这些字段证明终态和 body 完整，不证明延迟满足尚未定义的 SLO。
- 健康与日志：发布后健康服务 `Result=success / ExecMainStatus=0`，备份和健康 timer 均 active/waiting，证书到期 `2026-10-13`，Nginx error 为 0、访问 5xx 为 0。受控 `systemctl restart` 使 Wrangler 以 SIGTERM `143` 退出，systemd 记录 1 条 `Failed with result exit-code` 后立即启动新进程；当前服务状态正常，但 unit 尚未把 143 声明为预期退出码。
- 浏览器边界：Playwright CLI 因 Windows/WSL 包装器和 run-code 版本差异未取得认证后的 Canvas/控制台证据；应用内浏览器无认证会话，访问银河明确返回 `ERR_INVALID_AUTH_CREDENTIALS`，与匿名 401 一致。未使用 URL userinfo、未把密码写入配置，浏览器会话不再出现在 WSL 进程列表。
- 公开阻断字段：`SUPPORTED_PRODUCTION_DATA_RUNTIME=false`（Wrangler 日志明确 D1/R2 均为 local）、`BASIC_AUTH_USER_COUNT=1`、`MALWARE_SCANNER_BINARY=false`、`UPLOAD_SCANNER_CODE_MATCHES=0`、`CROSS_MACHINE_BACKUP_HOOK=false`、`ALERT_DELIVERY_HOOK=false`、`GOOGLE_OAUTH_COMPLETE=false`。因此没有移除 Basic Auth；这是发布阻断结论，不是普通后续优化。
- 本轮可能引入的新风险：r5 的 `node_modules` 通过硬链接复用 r4 已审计依赖树，若以后在任一 release 内执行包管理器写操作可能同时污染回退版本；发布纪律必须保持 release 只读。当前 `dist` 是 Windows 本地门禁构建而非 GitHub Actions artifact，虽已在 Linux Workerd 下通过 HTTP、OAuth 与容量验收，但没有与 CI runner 产物做字节级一致性证明。静态 P95 仍为 16 秒级。
- 清理：服务器 `/tmp` 发布归档、验收脚本和 `/run` 认证 Header 均逐项断言不存在；本机敏感临时 JSON/脚本不存在。主机删除策略拒绝递归删除 3 个不含凭据的本地发布归档（约 3.6 MB）和空白 Playwright 元数据目录，它们不在 Git 索引中。
- 终场网络边界：最后一次成功 SSH 健康检查之后，本机 DNS 把 `aetherstudio.top` 解析为保留测试地址 `198.18.0.82`，GitHub 控制请求也在同一窗口超时。固定真实 IP 后 22/80/443 的 TCP connect 均为 true，但 SSH banner、HTTP body 与 TLS handshake 未形成终态。该组证据更支持本机网络/出口异常，但不能单独排除服务器后续异常；因此“此刻公网可达”未验证，前述运行字段只锚定最后一次成功服务器检查。
- 未覆盖范围：真实 GitHub provider 完整登录/退出与旧 Cookie 重放、本轮认证后的 Canvas 像素和控制台、Google 完整回调、Cloudflare D1/R2 迁移、跨机灾备、恶意上传扫描、外部告警投递、Webhook、邮件、移动真机、弱网和已批准延迟 SLO 仍未覆盖。

## 2026-07-19 全流程页面摸排与公开测试 r12

- 状态：部分完成；公开测试 current 为 `/opt/zaochang/releases/20260719-091200-ea2748b-flow-audit-r12`，运行代码 commit 为 `ea2748b084b4424f4e1821d6053f44c6cb8011f4`。应用、上传扫描器与 Nginx 的终场字段均为 `active/running / NRestarts=0 / ExecMainStatus=0`，应用进程 cwd 精确等于 r12。
- 流程修复：commit `2a197c8` 把作品创建的“继续”与最终“提交平台预审”分为不同按钮，并让匿名孵化控制台不请求私有 `/api/incubation`；commit `ea2748b` 为孵化控制台匿名和成员空状态补齐可见 `h1=项目孵化控制台`。全量 `npm test` 退出码 `0`，统计 `72 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo`，包含生产构建与匿名/成员空状态 H1 字段断言。
- 本地静态门禁：`npx tsc --noEmit` 退出码 `0`；Lint 为 `0 errors / 9 warnings`；官方 npm 审计为 `0 vulnerabilities`；Drizzle 为 `40 tables / No schema changes`；禁用/单跑测试扫描为 `NO_SKIP_OR_ONLY_MATCHES`；`git diff --check` 退出码 `0`。
- 前半段全流程覆盖：匿名与成员各 31 个路由；成员实际执行资料保存、帖子/收藏创建、圈子加入退出、点赞收藏关注评论、OAuth public client 创建撤销、孵化提交与详情面板；普通成员管理员 API 反例为 `403 admin_forbidden`、`/admin=404`。管理员读取三类 API、刷新、非法邀请码 `400` 且数量不变；未执行真实批准、驳回、邀请创建和内容下架。临时成员、作品、项目、客户端、帖子、会话和邀请码清理后的字段为 `fixture_rows_remaining=0 / admin_session_remaining=0 / fixture_invites=0`。
- r12 浏览器字段：匿名孵化页为 `status=200 / h1Visible=true / h1=项目孵化控制台 / private API requests=0 / consoleErrors=0`，且登录链接精确返回该页；`390x844` 的 27 路由稳定态矩阵为 `non200=[] / overflow=[] / hiddenH1=[]`。作品创建页在 160ms Reveal 过渡帧出现一次 `scrollWidth=392`，500ms 稳定态为 `scrollWidth=390 / offenders=[]`，因此记录为审计时序而非稳定布局缺陷。
- 六个嵌入应用字段：MORI/WANDER 输入保留并存在 canvas；TYPEWAVE 模式、主题、播放与 JSON 导出；LOOPS 预设、播放与 Markdown 导出；SPROUT 五段输入保留；MINUTE 情绪、计时重置、日期、暮色主题和 Markdown 导出均命中。SPROUT 首次复跑在 React 挂载前读取到字段数 0，审计改为等待 `#root > *` 后同一 r12 复跑 6/6；该改动只位于被忽略的 `output/playwright` 证据脚本，不进入发布包。
- 公网协议字段：`/`、孵化、登录、社区 API、OIDC 和 MINUTE 应用均为 `200`；GitHub start 为 `307` 到 `github.com/login/oauth/authorize`，`redirect_uri=https://aetherstudio.top/api/auth/github/callback` 且 state 非空；OIDC issuer 为 HTTPS 正式 origin；普通页 `DENY`、应用 `SAMEORIGIN`、HSTS 存在。服务器端口 80 回环为 `301` 到 HTTPS；本机外部明文 HTTP 被 `Server=Beaver` 返回 `403`，没有到达 Nginx，故未形成跨网络端口 80 证据。
- 数据与回退：切换前备份为 `/var/backups/zaochang/state-20260719T090418Z.tar.gz`，SHA-256 `352d3d7b888201dc2fd79071fa91652c0f6cb6b2b6ba5dd404608907e2164206`，恢复探针为 `restore_check=ok sqlite=5 files=5`。切换前、切换后和终场真实业务库均为 `integrity=ok / tables=40 / wallet drift=0 / negative wallets=0 / invalid published=0 / approved external=0`。
- 发布反例：服务器默认 `npmmirror` 不实现 audit API，首次审计以 `404 NOT_IMPLEMENTED` 退出，current 未切换；改用 `https://registry.npmjs.org` 后退出 `0 / found 0 vulnerabilities`。r11 与 Git 归档的 lock 文件字节不同，但规范化 JSON SHA 同为 `14f3d38d...f639` 且 Git diff 为空，依赖才被允许复用。11 个迁移逐文件去 CR 后 SHA 全相等，未执行迁移。
- 发布窗口：systemd 的 `Failed with result exit-code` 对应主动停止 r11 时 Wrangler 收到 SIGTERM `143`，r12 随后一次启动即 Ready，`NRestarts=0`；唯一 Nginx 502 发生在 16:18 的 r11 权限事故，r12 从 17:13:59 起 5xx 检索为空，Ready 后 warning..alert 为空。健康服务终态为 `Result=success / ExecMainStatus=0`。
- 本轮改动可能引入的新风险：新增 H1 会增加匿名/空状态提示的垂直高度；390px 稳定态未溢出不证明 320px、系统大字体或移动真机。官方应用 iframe 在回环隧道仍有 `allow-scripts + allow-same-origin` 浏览器警告；当前只承载仓库内官方静态应用且用户外链产品不能获批，但未来若允许不受信任包进入同源命名空间，必须重新隔离 origin。
- 清理：服务器归档和 5 个 r12 临时脚本逐项断言不存在；Playwright 下载、控制台和审计脚本仍保留在 Git 忽略的 `output/` 目录作为本机证据，不进入仓库或发布包。
- 未覆盖范围：真实支付/退款 UI、真实审核批准/驳回、真实邀请码创建/撤销、举报提交、使用新外部 GitHub 身份跑完 callback、Google OAuth、320px/移动真机、弱网、跨机灾备恢复、外部告警投递和正式延迟 SLO 仍未覆盖。本节证明公开测试流程，不证明托管 D1/R2、高可用或正式生产发布。

## 2026-07-19 GitHub 连接可见失败与创始人身份候选

- 状态：部分完成；本地候选尚未提交、合并或部署，线上仍运行 `/opt/zaochang/releases/20260719-091200-ea2748b-flow-audit-r12`。服务器应用只读字段为 `active/running / NRestarts=0 / ExecMainStatus=0`。
- GitHub 根因：应用 start 在约 4ms 内返回 307，但服务器与当前网络到 `github.com/login` 的 TCP/TLS 建连随机超时，而 `api.github.com` 可达；旧流程让浏览器离开造场后无限等待。候选改为同源 200 连接页，三次探测 `https://github.com/favicon.ico`、每次 5 秒；任一次 `load` 成功才 `location.replace()` 到官方授权页，`error` 或超时均计为失败，全部失败则停在明确错误态并提供重试/返回登录。start 的 CSP 精确限制为 `default-src 'none' / img-src https://github.com / frame-ancestors 'none' / form-action 'none'`。
- 安全语义变更：登录页邀请码从 `GET` 改为 `POST`，避免邀请码进入 URL、浏览器历史和 Nginx access log。GitHub token exchange 采用 12 秒上限，profile/email 各 8 秒；一次性授权码 POST 不自动重放。该变更尚未部署，因此 r12 仍保留旧行为。
- 创始人身份：新增独立 `ZAOCHANG_FOUNDER_EMAIL`，缺失或配置多个值时按普通成员显示；它不自动授予管理权限，管理入口仍要求独立命中 `ZAOCHANG_ADMIN_EMAILS`。六个内置应用归属 `Abraham Valerio` 并保留各自产品配色；账号菜单、侧栏和个人主页展示创始人身份与管理中心入口，普通成员 `/admin` 仍为 404。
- 线上归属核对：真实业务库只有一个 GitHub 身份 `displayName=Abraham Valerio`，业务 `products` 表当前无记录；因此本轮没有批量修改数据库 `owner_email`，也没有改变任何果子收款人、订单或账本。
- 本地完整门禁：`npm test` 退出码 `0`，统计 `75 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo`，包含 Vite 生产构建；创始人用例断言 `founderProducts.length == 6`、六项 owner 相等、创始人 `/admin == 200`、普通成员 `/admin == 404`。GitHub start 用例断言同源 HTML、state Cookie 与页面 state 相等、`HttpOnly/Secure/SameSite=Lax` 及精确 CSP；token 超时用例断言一次请求且有界失败。
- 其余门禁：直接 TypeScript 编译退出 `0`；本轮 15 个代码/测试文件 ESLint 为 `0 errors / 3 existing img warnings`；`npm audit --audit-level=high` 为 `0 vulnerabilities`；Drizzle 为 `40 tables / No schema changes`；禁用/单跑测试扫描为 `NO_SKIP_OR_ONLY_MATCHES`；凭据模式扫描为 `NO_CREDENTIAL_PATTERN_MATCHES`；`git diff --check` 退出 `0`。
- 测试基础设施反例：旧套件依赖 Wrangler 在外部 `d1 execute` 后热重载，曾出现 `72 pass / 2 fail`，两个失败均为 30 秒内未连续恢复三次；逐次强制重启方案又在 15 分钟超时。候选改为一次 Wrangler 建库、同一 SQLite WAL 文件中的事务化测试 SQL，定向原失败用例为 `2 pass / 0 fail / 0 skipped / 0 todo`，完整套件耗时降至约 34 秒测试阶段。该 Node SQLite 连接只存在于测试文件，不进入生产 worker。
- 本轮改动可能引入的新风险：GitHub 连接页依赖 favicon 探针；若 GitHub 授权端点可达但 favicon 被网络策略单独阻断，会显示可重试错误而不进入授权。创始人显示名目前与已核对 GitHub 身份一致，后续 GitHub 展示名变化不会自动重写静态产品作者文案。Node 22 的 `node:sqlite` 仍标记 experimental，但仓库与 CI 最低版本均为 Node `22.13.0`。
- 未覆盖范围：尚未在公网新版本执行真实 GitHub 授权、callback token exchange、邀请码 POST 的 Nginx 日志反例、创始人账号浏览器像素与移动布局、GitHub favicon 单独被阻断的企业网络、Google OAuth、移动真机和弱网。部署、回退、线上 Cookie/CSP 与浏览器证据仍待本候选合并后取得。

## 2026-08-10 Agent 服务账户:token 认证 + 显式写 scope(已上线激活)

- 状态:已交付并激活。代码 commit `b7ddf36` 推送 main;CI release-gates(run 31365404703)与 deploy-production(run 31365529660)均 success;`ZAOCHANG_AGENT_TOKEN` 生产 secret 已注入并激活;生产端到端实测通过;E2E 产物已清理。
- 机制:非用户机器身份 `agent@zaochang`(`member_number=0`,不占会员号序列,不建钱包/收藏),单一全局 Bearer token 认证,恒时比较;token 未配置时 worker 闸整段不进入 → 零行为变化。Worker 入口 fail-closed scope 闸仅放行 `AGENT_WRITE_CAPABILITIES`(POST/PATCH `/api/docs`、POST `/api/products`);docs 编辑语义变更 founder-only → founder OR agent(`requireDocEditor`),DELETE 仍 `requireFounder`(agent 被拦)。两处识别:worker 入口(scope 闸)+ `getChatGPTUser`(身份)。
- 关键缺陷修复(scope 闸请求体排空):闸在 `prepareRequestBody` 之前早返回 403 时请求体未消费,残留字节污染 keep-alive 连接、使下一请求错误组帧,workerd 重启 isolate → 503 "worker restarted mid-request"(try/catch 接不住,属网络层非 JS 层)。二分定位:products 探针在首个 agent 操作/step5 后均 201,在 step6/7(DELETE/cover 的 403 闸拒绝)后 503。修复:闸拒绝时 `await request.arrayBuffer()` 排空。测试 step8(products 201)紧跟 step6/7 作回归守护。
- 证据:本地门禁 `npm test` 86 pass/0 fail/0 skip/0 todo;tsc/lint(0 errors)/db:generate(No schema changes)/audit(0 vulns)/diff --check 全绿。生产实测:GET community `signedIn=true memberNumber=0 wallet=null isFounder=false`;POST /api/docs 201;DELETE /api/docs 403 `agent_scope_forbidden`;POST /api/products 201 `review=pending_review`(review gate 照常,agent 不绕审核);POST /api/reading-progress 403 `agent_scope_forbidden`;GET /api/admin/incubation 403 `admin_forbidden`。无 worker restarted。
- secret 与权威来源:token 经管道生成注入,值未落对话/日志/磁盘;权威备份已写入盒子 `/etc/zaochang/zaochang.env`(`ZAOCHANG_AGENT_TOKEN`,root:zaochang 640),符合 runbook §2(盒子=唯一权威来源)。
- 本轮改动可能引入的新风险:① 文档编辑放宽到 agent —— 由 worker 能力表收敛到 POST/PATCH /api/docs,DELETE/财务/admin 均 fail-closed;② token 为单一全局凭证,泄露即等于 agent 全写权限,需按需轮换(重设 secret + 更新盒子 env);③ 排空分支对超大 body 会先读后拒绝,受 prepareRequestBody 11 MiB 上限同等级防护。
- 未覆盖范围:agent 调用速率限制/重试风暴、token 轮换流程演练、多 agent 隔离(现仅单一全局 token)、对 agent 写内容的后续审核 SLA 未覆盖。CLAUDE.md(项目根,既有遗留)仍未跟踪,未入本次 commit。

## 2026-08-23 邮箱验证码登录(CF Email Service,未部署)

- 状态:代码与测试完成,**未提交/未部署**(等用户确认)。全量集成测试 93 pass / 0 fail / 0 skip / 0 todo(FULL_EXIT=0);tsc 0 错、lint 0 errors(2 条 warning 来自外来未跟踪文件 `scripts/builder/core.mjs`,非本轮)、db:generate 无输出、git diff --check 通过;`/signin` 桌面 1280 与移动 390 无头截图亲验通过(邮箱表单/分隔线/邀请码区/无溢出重叠)。
- 机制:`POST /api/auth/email/request` 发 6 位验证码(逐位拒绝采样、库存 SHA-256、10 分钟 TTL、5 次锁定、原子单次消费),`POST /api/auth/email/verify` 换会话(provider `email`,同一 cookie 管线)。发信走 `app/api/_lib/email-send.ts`:测试 `EMAIL_SEND_*` REST 覆盖 → 生产 `EMAIL` send_email binding → 两者皆无 ⇒ 503 `email_not_configured`(惰性检查位于一切 DB 写之前)。新地址必须带邀请码,与 OAuth 同一原子 batch、同一 SQLite 触发器门槛;老成员邮箱免邀请。限流:每 IP 10/时 + 每地址 3/15 分;Turnstile 配置即对每次发码 fail-closed 校验。
- 迁移:`drizzle/0018_stale_speed_demon.sql` 新表 `email_login_codes` + 三表 provider CHECK 加 `'email'`(表重建)。**重建陷阱已修**:SQLite ALTER RENAME 重解析全 schema,`oauth_registration_invitation_guard` 文本引用 invitation_redemptions 导致 RENAME 炸(no such table)——迁移内先显式 DROP 该触发器、末尾逐字补建全部 5 个邀请触发器;迁移后 sqlite_master 验证 5 个触发器在位。生产 D1 尚未应用 0018(deploy 前必须 `d1 migrations apply`,check-migrations 会 fail-closed 拦截未应用)。
- 测试断言到字段级:code_hash == sha256(邮件正文验证码)、invitation_redemptions.provider == 'email'、oauth_accounts 行、uses_count 递增、auth_sessions.provider == 'email'、cookie 登录态、5 次错码后 attempts == 5 锁定、发送失败(上游 500)后 email_login_codes/members/兑换 零残留、第 4 次发码 429 `rate_limited retry_after=15m` + retry-after:900;生产测试服务器(空 D1、无 email vars)断言 503 `email_not_configured`。
- 本轮改动可能引入的新风险:① 0018 表重建在触发器缺位窗口内运行(D1 单迁移文件单事务,外部写不可插入,评估为可控);② provider CHECK 从 (google,github) 扩到 +email 为语义放宽(仅枚举校验层,插入仍受 oauth_registration_invitation_guard 门槛);③ 新增未认证端点真实外发邮件 = 成本/轰炸面,已由双层限流 + Turnstile + 邀请/成员前置闸收敛,上线后需观察;④ 生产 `EMAIL` binding 路径本轮从未真实执行(测试走 REST 假上游),部署后需真实收码验证。
- 未覆盖范围:生产 send_email binding 端到端(需部署后实测);Turnstile 实际校验(测试环境无 keys,staging 有,部署后验);表单 JS 点击流(仅渲染截图验证,API 行为已由集成测试覆盖);0018 未在真实生产数据副本上演练(仅空库);CLAUDE.md 本轮新增邮箱路径说明,随功能一并提交。

## 2026-08-23 第二轮:生产上线 + 邀请码转写归一化(已部署)

- 状态:已上线。`841d454` 推送 main 后 release-gates 与 deploy-production 双 success;生产 D1 先行应用 0018(备份 `backups/pre-0018.sql` 566KB/113 INSERT → `d1 execute --file` 306 行写入 → 验证 `invitation_triggers=5`/新表在位/行数保留 → `__drizzle_migrations` 回填 id=19 created_at=1787478054485 与 journal 一致)。应用迁移前用 sqlite_master LIKE 断言三重建表只被已知 5 个邀请触发器文本引用(RENAME 重解析陷阱),无其他引用者。
- 生产实测:边缘(盒子 --resolve)POST `/api/auth/email/request` → `200 {"status":"sent","expires_in":600}`(EMAIL binding 真实外发成功);`email_login_codes` 行 attempts=0/consumed=null/TTL 精确 10 分钟。曾误判 binding 结构化调用为"签名错误阻断级缺陷",经 worker-configuration.d.ts:11358 的 SendEmail builder 重载证伪,已收回。
- 缺陷(用户报"新邀请码提示无效"):生产邀请码行完全健康(uses 0、未撤销、9 月到期),服务端生码/验码同函数——根因是**手输转写变形**(小写 zc-/中文输入法全角 ｚｃ-/空格):regex 放行但 sha256(变形)≠sha256(原文) → invitation_invalid。红测试复现(`actual: 400, expected: 200`),修复为 `hashInvitationCode` 入口归一化(去空白含全角、全角→半角、转大写)。**语义变更声明(6.4)**:接受集从"精确原文"扩为"原文的转写变体",任何通过者仍须哈希命中真实码;生成侧原文全大写半角,归一化对其恒等。GitHub 与邮箱两条路径共用该函数,一处修复双路径生效。表单侧另加 autoCapitalize/spellCheck 与"不区分大小写"占位提示。
- 证据:新测试「invitation entry tolerates lowercase, full-width, and stray-space transcription」红→绿;全量 94 pass/0 fail/0 skip/0 todo(FULL_EXIT=0);tsc 0 错;lint 0 errors(4 warnings 均在外来未跟踪 scripts/);git diff --check 通过。存哈希断言:归一化后 code 行的 invitation_hash == sha256(原文),兑换 batch 命中、uses_count 归 1。
- 本轮改动可能引入的新风险:① 归一化扩大哈希接受集(见上,已论证不构成门槛放宽);② 全角映射区间 [！-～] 恰为 FF01-FF5E 单调平移,不含全角空格(单独处理);③ 表单 placeholder 变化仅文案。
- 未覆盖范围:GitHub start 路径的小写/全角变体未单独端到端测试(与 email 路径共用 hashInvitationCode,函数级已覆盖);用户重试真实手输场景待部署后确认。
- 部署后闭环(补记):`9004301` 部署后,①运维侧自验:插入可撤销验证码 `invite:normcheck-9004301`(已知明文),以小写转写请求生产发码端点 → `200 sent`(旧构建同请求必 400,红测试锚定),验证码行已撤销(revoked=1, uses=0,永不可用);②用户侧实证:此前被拒的邀请码成功注册 `wa609765@foxmail.com`(provider='email' 兑换行,uses_count 0→1)——手输重试场景由真实用户闭环,上一条"待确认"销项。


## 2026-08-23 书站右栏加宽 + 目录实体修复 + Hello Computer 封面(已部署)

- 状态:已上线。commit `e45edb2` 推送 main,release-gates 与 deploy-production 双 success;生产 D1 `docs` 行 `doc:book-hello-computer` 的 cover_image/banner_image 已写入并回读确认。门禁:全量 94 pass/0 fail/0 skip/0 todo;tsc 0 错;eslint(page.tsx)0 错。
- 语义变更(6.4):`.book-page-chapter` 右栏 grid 列由固定 `220px` 改为 `clamp(240px, 18vw, 340px)`(globals.css:624)。动因:新书长标题在 220px 下折成 3 行观感差;改后消费中栏死空间,中栏阅读列仍保 840px 上限(1440px 地板下中栏轨道仍 ≥840px,不被挤压)。纯展示层宽度,不触及可见性/权限/fail-closed。
- 目录实体修复:章节 h2/h3 标题提取处(page.tsx:117-120)对 marked 转义实体解码(&amp;/&lt;/&gt;/&quot;/&#39;/&nbsp;),修右栏目录把 `&` 显示成字面 `&amp;`;`&amp;` 放最后解码避免 `&amp;lt;` 被二次解码成 `<`。书架测试章节夹具无 h2/h3,该回调对其为空操作,可证不影响既有断言。
- 封面:新增 `public/book-covers/hello-computer-cover.webp`(竖版 900x1272 约 53KB→书架卡片)与 `hello-computer-banner.webp`(横版 1491x1055 约 55KB→封面页横幅),创始人可信静态资产,与内置 showcase 同级;schema 注释纯展示字段,不影响可见性/权限。生产库 UPDATE changes=1。
- 证据(视觉亲验,headless Chrome,生产经 --host-resolver-rules 指向 CF 边缘):书架卡片(竖版 CPU 封面入 5:6 卡槽)、封面页横幅(横版 360px 带,标题与 CPU 图在中轴完整)、1920px 章节页(右栏约 340px,目录项 "Decode & Operand Fetch" 显示真实 & 而非字面 &amp;)。
- 本轮改动可能引入的新风险:① 右栏 clamp 在 <1440px 窗口回落既有媒体查询断点,不影响移动/平板;② 实体解码遇未列举实体(如 &hellip;)保持原样直出,输出仍经 React 转义,不构成注入;③ 静态封面占仓库体积约 108KB,可忽略。
- 未覆盖范围:clamp 中间断点(1100-1439px 两栏、<1100px 单栏)未逐一截图(沿既有媒体查询,本轮未改动其逻辑);Hello LLM 旧书右栏于 1920/1440 早前本地验无回归,生产更全断点未重验。

## 2026-08-24 线上跳转卡顿治理:Smart Placement + 查询合并 + 匿访边缘缓存(已部署)

- 状态:已上线。两轮:`8e54c9d`/`17ca976`(Smart Placement 开启 + 书站字体改 unicode-range 子集化,run 32646341084)与 `5c51fc1`(docs.ts 查询合并 + worker 匿访边缘缓存,run 32651012311)均 release-gates / deploy-production 双 success。第一轮后用户仍报"明显卡顿",第二轮命中真正根因。
- 根因(测量定位,非推测):GraphQL Workers Analytics cpuTimeP50=12ms vs wallTimeP99=3516ms——瓶颈在等待不在 CPU。① Worker 跑在访客边缘、D1 主库在 APAC,串行查询每次往返百毫秒级;② 章节页每渲染 10-15 条串行 D1 查询(findInBook 每个 slug 段一条、docBreadcrumbs 每级父一条、generateMetadata 与页面组件重复调 currentMember+findInBook);③ vinext `prefetch=auto` 跳过动态路由,章节跳转每次冷渲染;④ `.rsc` 跳转 token 构建期稳定(两次独立浏览器加载同值)→ 同路由 .rsc URL 可跨访客共享缓存。
- 机制(5c51fc1):docs.ts 树读取全部收敛到 per-request `React cache()` 的单次 listAllDocs(docs 表 112 行/285KB),findInBook/docBreadcrumbs 改内存解析(`UNIQUE(parent_id, slug)` 索引保证与原逐段 SQL 等价),listBooks 去掉独立书根查询,章节页登录态降到 ~3 条查询;可见性 fail-closed 判定未动。worker/index.ts 匿访边缘缓存:仅 `APP_ENV=production` + GET + 无任何 cookie/authorization + 路径不在排除表 + 200 且无 set-cookie + text/html 或 `.rsc`;存储 `s-maxage=60` + `max-age=0`(浏览器不落本地副本,匿名页不会在登录后遮蔽登录态);请求带 `no-cache` 也绕过(线上排查强制回源)。
- 语义变更声明(6.4):匿名视角公开页面/feed 最多滞后 60 秒(刚发布/过审内容 ≤60s 后出现;刚转私有的书 ≤60s 内匿名仍可见缓存副本)。审查门控/订单/点赞/打赏/账本等强制不变量全在服务端触发器层执行,不受此缓存影响;带 cookie 的请求(登录态)永远绕过缓存读写。
- 生产实测(部署后 curl 二连,本机经代理出口):`/bookshelf` HTML miss 2.64s → hit 0.33s(7-8×);`/bookshelf.rsc` miss 1.01s → hit 0.40s;深层章节 `hello-computer/preface.rsc`(28KB)miss 1.26s → hit 0.57s;带 cookie 请求无 `x-zc-anon-cache` 头、真实回源 0.96s(绕过 ✓);307 未入缓存(只存 200 ✓);匿访响应无 set-cookie(无 `__cf_bm` 注入,缓存对匿名持续可用)。
- 证据(门禁):全量 94 pass/0 fail/0 skip/0 todo;tsc 0 错;lint 0 errors(4 warnings 均在外来未跟踪 scripts/);db:generate "No schema changes";git diff --check 通过。书架套件(卡片墙/封面目录树/深层章节渲染/members 书匿名 404/docs 308 重定向)断言重写后的解析路径,真实 D1 + 触发器。
- 本轮改动可能引入的新风险:① 匿访 60s 滞后(上文声明,`ANON_PAGE_CACHE_TTL_SECONDS` 一常量可调);② React `cache()` 依赖 vinext 提供 per-request store——94 测试经真实 worker 运行时实证成立,若 vinext 升级破坏会抛错而非静默失效;③ listAllDocs 全表单查询(含 body_md)随书量增长——当前量级下单查询远优于 N 次往返,书库数量级增长后需再评估(如列裁剪);④ Smart Placement 是否真实搬迁未证实(站点流量 ~1.3 req/min 低于决策阈值,API 无执行 colo 维度可查)——本轮两修复已不依赖它。
- 未覆盖范围:缓存命中路径无自动化测试(APP_ENV 门控在测试关闭,防 60s 陈旧污染断言;worker/index.ts 注释已声明,生产 curl 二连补上实测);真实登录用户端到端跳转体验未实测(无真实凭据;cookie 绕过路径与合并后渲染已由测试+生产 curl 分别验证);首页/feed 等其他页面的生产命中未逐一 curl(同管线,bookshelf 已代表)。
