# 发布前逐文件证据矩阵

> 本文件开头的 78 文件矩阵是 `0008` 阶段快照；`0009`、阿里云预发布、真实 GitHub OAuth 与 Nginx 静态并发修复的增量证据见文末“2026-07-16 线上收口增量”。历史数字不冒充当前工作树统计。

本矩阵锚定 2026-07-15 的 `git diff --stat` 与发布相关未跟踪文件。`git status --porcelain=v1 -uall` 共展开 `617` 个改动路径；只排除 `539` 个 `.playwright-cli/` 与 `output/` 临时证据文件后，剩余 `78` 个发布相关改动文件与下方 `78` 行证据说明机械对账为 `missing=0 / extra=0`。SPROUT 的两个生成 bundle 会进入线上静态资源，故仍逐文件纳入。共同门禁为：`npm test` 退出码 0（65 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo）、`npx tsc --noEmit` 退出码 0、`npm run lint` 退出码 0（0 errors / 9 warnings）、`npm run db:generate` 退出码 0（37 tables / No schema changes）、`npm audit --omit=dev --audit-level=high` 退出码 0（0 high / 0 critical / 2 moderate）、`git diff --check` 退出码 0；测试扫描输出 `NO_SKIP_OR_ONLY_MATCHES` 与 `NO_ADDED_SKIP_MECHANISMS`。下列每行只声明该文件获得的针对性证据；“未单独验证”表示共同门禁不构成对该文件交互语义的证明。

- `.github/workflows/ci.yml`：CI 门禁编排；新增禁用测试语法扫描和 `git diff --check`，本地同模式扫描输出 `NO_DISABLED_TEST_MECHANISM_FOUND` 且格式检查退出码 0；未在 GitHub Actions 真实 runner 单独验证。
- `OAUTH_SETUP.md`：OAuth/生产密钥配置说明；文档人工核对，未用真实 GitHub/Google 回调单独验证。
- `PROJECT_STATUS.md`：持续账本与本轮证据；`git diff --check` 负责格式检查，内容由本矩阵与命令输出交叉核对。
- `README.md`：产品、开发和发布说明；文档人工核对，未单独验证所有示例命令。
- `RELEASE_RUNBOOK.md`：发布/回滚步骤；已与当前 `0006/0007/0008` 三个前向迁移及产品预审冒烟项对账，未在真实 Sites 环境演练，明确保留生产演练缺口。
- `RELEASE_EVIDENCE.md`：逐文件证据索引；由最终 `git diff --check` 与文件清单对账，运行时语义不适用。
- `app/admin/admin-console.tsx`：审核、风控和孵化管理 UI；浏览器实填审核意见并点击“批准上线”后，队列变为“没有待预审商品”；移动 `390x844` 队列含产品名/批准/驳回且 `scrollWidth=375 <= innerWidth=390`。后端落库语义仍由审核集成字段断言证明。
- `app/admin/page.tsx`：管理员入口与鉴权页面；路由构建通过，未单独执行白名单/非白名单浏览器对照。
- `app/api/_lib/admin.ts`：管理员白名单、D1 原子审计语句；`reports require an administrator decision...` 与 OAuth 集成用例通过。
- `app/api/_lib/community.ts`：社区成员、钱包和真实数据读取；`public community aggregates match the persisted records`、发布与钱包集成用例通过。
- `app/api/_lib/external-fruit.ts`：外部支付、撤销与退款；`OIDC login and delegated fruit API...` 通过，含未确认余额不变、并发确认、撤销与退款字段断言。
- `app/api/_lib/fruit.ts`：果子账本、结算、退款和付费产品冻结；订单幂等重放与 `activeEntitlement` 均联表检查当前批准版本，冲突恢复查不到当前批准产品时返回 `404`；复审后旧 checkout 键断言 `404`、买家 `balance == ledgerBalance == 5`。故障注入用例让审核在首条 purchase 操作时变化，最终订单/purchase operation 均为 `0` 且双边钱包字段未变；钱包守恒、并发退款、like 奖励和账本不可变用例保持通过，隐藏付费产品的最终买家补偿策略仍未验证。
- `app/api/_lib/oauth-provider.ts`：OAuth 2.1/OIDC、密钥、token family、客户端审核与用户撤权；OIDC 全流程断言用户撤权后付款为 `cancelled`，买卖双方余额与账本不变。
- `app/api/_lib/public-community.ts`：公共聚合与匿名内容；`public community aggregates match the persisted records` 断言 `platformStats/products/posts` 实际字段。
- `app/api/_lib/rate-limit.ts`：D1 固定窗口限流；相关 OAuth/支付路由集成运行通过，未单独做压力与窗口边界基准。
- `app/api/actions/route.ts`：点赞、取消点赞与奖励原子性；like 奖励、每日上限和并发取消专项断言通过；待审产品 like 路由返回 `404`，数据库直写由 `product_like_product_not_approved` 反例覆盖。
- `app/api/admin/incubation/route.ts`：管理员推进孵化阶段与审计；`persists profile, collections, comments, and incubation state` 通过，未单独做 D1 审计故障注入。
- `app/api/admin/moderation/route.ts`：举报隐藏、OAuth 审核、产品版本审核和风险处置；冲突并发决定断言 `[200,409]`，相同决定断言 `[200,200]` 且恰有一个 `replayed == true`；隐藏付费产品补偿策略仍为阻断级缺口。
- `app/api/auth/[provider]/callback/route.ts`：GitHub/Google OAuth 回调会话；未使用真实提供方凭据单独验证，本地未配置分支由 `keeps OAuth providers explicit...` 覆盖。
- `app/api/comments/route.ts`：评论持久化与公开计数；社区持久化用例通过，待审产品 GET/POST 均为 `404`，数据库直写命中 `product_comment_product_not_approved`。
- `app/api/community/route.ts`：社区 hydration 与真实动作状态；公共聚合、认证成员和社区持久化用例通过。
- `app/api/developer/clients/route.ts`：开发者客户端创建与审核默认值；OIDC 集成用例通过。
- `app/api/incubation/route.ts`：项目申请与资料阶段；孵化持久化用例通过，自动推进被拒绝的字段行为由集成断言覆盖。
- `app/api/oauth/token/route.ts`：token 交换与审核复核；OIDC 集成用例通过。
- `app/api/products/route.ts`：产品发布、定价和私有封面所有权；预审用例断言免费/付费共用 `pending_review/reviewVersion=1/approvedVersion=0` 默认值且发布奖励为 `0`。
- `app/api/reports/route.ts`：内容举报提交；`reports require an administrator decision and hidden products leave public queries` 通过。
- `app/api/uploads/route.ts`：上传可见性与所有权；`enforces upload visibility and ownership` 通过；恶意文件扫描未覆盖。
- `app/api/uploads/[key]/route.ts`：私有对象读取边界；上传用例断言管理员读取普通私有资料为 `403`、孤立产品封面为 `403`、已关联待审封面为 `200`、批准后匿名读取为 `200`。
- `app/api/v1/fruit/payments/route.ts`：外部支付创建与客户端复核；OIDC/外部支付集成用例通过。
- `app/challenges/page.tsx`：移除伪排行榜/奖金；路由 SSR 用例通过，未单独做移动交互。
- `app/chatgpt-auth.ts`：未设置 `APP_ENV` 时身份头 fail-closed；`production rejects forged workspace identity headers unless explicitly trusted` 通过。
- `app/circles/circles-client.tsx`：真实圈子计数与空态；路由 SSR 通过，旧一轮 390x844 浏览器无横向溢出；本轮未重复圈子交互。
- `app/components/product-card.tsx`：价格模型和官方标识；发现/首页 SSR 通过，未单独做所有卡片操作。
- `app/components/report-button.tsx`：举报入口；举报后端集成通过，未单独做按钮浏览器提交。
- `app/components/site-shell.tsx`：真实 feed/circle 数据和移动导航；首页移动浏览器断言 `scrollWidth == 390`，导航计算背景为不透明 `rgb(251, 250, 247)`。
- `app/developers/developer-console.tsx`：客户端审核状态、撤权和公开客户端密钥提示；浏览器切到 public 后表单显示“公开客户端不生成密钥”，真实创建后的 alert 只含 Client ID、PKCE 说明与“我已记录 Client ID”；点击撤销授权后页面移除 consent，D1 断言 consent/access/refresh token 均有撤销字段。
- `app/developers/docs/page.tsx`：OAuth/果子 API 文档；路由 SSR 与构建通过，未对外部消费者执行契约测试。
- `app/discover/discover-client.tsx`：真实产品筛选；`renders distinct route /discover` 通过，未单独做所有筛选组合。
- `app/feed/feed-client.tsx`：真实动态、讨论与空态；`renders distinct route /feed`、公共聚合用例与 390x844 浏览器截图通过，未做大数据分页测试。
- `app/galaxy/apply/incubation-application.tsx`：申请状态/资料提示；`renders distinct route /galaxy/apply` 与孵化持久化用例通过。
- `app/galaxy/company/page.tsx`：公司中心页面；构建路由通过，未单独做移动浏览器验收。
- `app/galaxy/ecosystem-shell.tsx`：银河生态外壳；银河桌面/移动 Playwright 验收通过。
- `app/galaxy/ecosystem.module.css`：银河生态外壳响应式样式；`390x844` 银河截图完整呈现黑洞、四赛道与行动入口，未在移动真机单独验证。
- `app/galaxy/galaxy-experience.tsx`：Three.js 银河与镜头飞行；浏览器断言 4 星系/12 行星、帧 `47→75`、`flying→settled`、桌面/移动 canvas 离线像素非空。
- `app/galaxy/incubator/incubation-console.tsx`：孵化任务/阶段真实状态；路由 SSR 与孵化持久化通过，未单独做多角色协作。
- `app/galaxy/product-galaxy.ts`：真实产品、赛道与状态映射；`product galaxy maps every planet to a real product and business sector` 通过。
- `app/globals.css`：系统字体、官方配色、移动底栏实体背景和移动嵌入控件避让；移动端不再渲染“独立打开”浮层，LOOPS 抽屉“完成”点击由浮层截获超时变为成功；桌面入口未单独重复点击。
- `app/layout.tsx`：移除远程字体、元数据；生产构建通过，首页浏览器检测为 0 个生成 `@font-face`。
- `app/lib/community-data.ts`：种子产品真实零计数和可体验标签；公共聚合、产品路由与六个应用映射用例通过。
- `next.config.ts`：vinext multipart/Server Action 请求体门限为 `10.1mb`；上传路由仍限制单文件 `10MB`，本地实测 `1,426,368` 字节 PNG 为 `201` 且响应字段 `size=1426368 / visibility=private / purpose=product_cover`，`89,875,456` 字节载荷为 `413`。未做并发大文件压力测试。
- `app/oauth-session.ts`：会话散列、删除与重放防护；`logout deletes the server session so a copied cookie cannot be replayed` 通过。
- `app/oauth/authorize/page.tsx`：授权页审核状态；OIDC 集成通过，未单独做浏览器授权确认。
- `app/page.tsx`：真实公共统计与社区空态；公共聚合字段断言、桌面/移动浏览器截图通过。
- `app/product/[slug]/embedded-product.tsx`：iframe ready 与失败终态；正常 MORI 为 `ready/overlay=0/iframeReadyState=complete/bodyChildCount=1`；挂起 iframe 请求时 500ms 的 `activeBefore=1`，12 秒失败后 `active100msIntervals=0` 且失败文案/重新载入按钮存在；`onLoad`、轮询命中、timeout 与 effect cleanup 均清除 poll ref。
- `app/product/[slug]/page.tsx`：隐藏产品公共访问边界与产品数据；举报隐藏集成和六个产品路由 SSR 通过。
- `app/product/[slug]/product-experience.tsx`：真实 like/follow/save/comment 与 24h 待结算文案；社区动作集成与六个产品浏览器外壳通过，未单独覆盖所有按钮组合。
- `app/profile/page.tsx`：个人页真实产品查询只返回当前批准版本；认证个人页 SSR 通过，预审产品的公开资料隐藏由产品预审集成用例覆盖。
- `app/signin/page.tsx`：独立登录页；`keeps sign-in outside the community shell` 与 OAuth 未配置分支通过。
- `app/studio/new/create-product-flow.tsx`：发布向导统一使用“提交平台预审”并说明批准前不公开/不交易；浏览器从名称/说明/一次解锁 5 果走到“作品已提交平台预审”，同时由产品提交集成断言数据库默认终态。
- `app/studio/studio-client.tsx`：真实作品指标和审核状态；桌面待审产品无详情链接，批准后显示“已发布”并出现两处 `/product/1` 链接；移动页同时含审核中/已发布，待审链接数 `0`、已发布链接数 `2`、`scrollWidth=375 <= innerWidth=390`。
- `app/wallet/wallet-client.tsx`：零余额、真实分录与空 CSV；钱包守恒/购买/退款/账本不可变用例通过，未单独做 CSV 内容浏览器下载。
- `db/schema.ts`：37 表约束、索引和审核版本映射；`db:generate` 输出 `37 tables / No schema changes`，全新 D1 按 `0000..0008` 运行 64 项用例。
- `drizzle/0006_release_readiness.sql`：审核、限流、风控与安全约束迁移；空 D1 全量集成应用成功。
- `drizzle/0007_product_like_counters.sql`：like 计数触发器；like/取消/每日上限和并发专项用例通过。
- `drizzle/0008_noisy_jazinda.sql`：全部用户产品预审、延期外键迁移和数据库写守门；迁移夹具断言历史订单/点赞引用保留，无决定直接批准、审核决定更新/删除、待审订单/点赞/评论/打赏直写均被命名触发器拒绝，所有权变化产生 `reviewVersion == 3 && approvedVersion == 2 && status == pending_review`。
- `drizzle/meta/0006_snapshot.json`：0006 schema 快照；`db:generate` 输出无漂移。
- `drizzle/meta/0007_snapshot.json`：0007 schema 快照；`db:generate` 输出无漂移。
- `drizzle/meta/0008_snapshot.json`：0008 schema 快照；`db:generate` 输出无漂移。
- `drizzle/meta/_journal.json`：迁移序列至 0008；含历史产品外键引用的本地 D1 全量集成依序应用成功。
- `public/_headers`：同源产品 iframe 的 CSP/X-Frame-Options；`only product app documents can be embedded by the same origin` 断言响应头字段通过。
- `public/product-apps/selection-a11y.js`：为四类明确选择器同步 `aria-pressed`；`node --check` 退出码 0，重建后的 MORI/MINUTE/SPROUT Playwright 快照分别出现主题与阶段 `[pressed]`，未在屏幕阅读器真机单独验证。
- `public/product-apps/mori/index.html`：加载共享选择态脚本；静态 bundle 200/MIME 集成通过，移动抽屉快照出现 `苔绿 [pressed]`。
- `public/product-apps/minute/index.html`：加载共享选择态脚本；静态 bundle 200/MIME 集成通过，移动快照出现 `晨光 [pressed]`。
- `public/product-apps/sprout/assets/index-Cag15iAY.css`：SPROUT 当前构建样式资源；`npm test` 的静态 bundle 用例断言该资源返回 `200` 且 MIME 为 `text/css`，未单独做 CSS 规则级视觉断言。
- `public/product-apps/sprout/assets/index-Zvp-dNoP.js`：SPROUT 当前构建脚本资源；`npm test` 的静态 bundle 用例断言该资源返回 `200` 且 MIME 为 JavaScript，浏览器快照出现可交互的 `种子 [pressed] / 工作纸 [pressed]`。
- `public/product-apps/sprout/index.html`：加载共享选择态脚本并指向当前 bundle；静态 bundle 200/MIME 集成通过，移动快照出现 `种子 [pressed] / 工作纸 [pressed]`。
- `tests/rendered-html.test.mjs`：65 项集成与安全断言；`npm test` 统计 65 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo；新增迁移外键保留、无决定批准拒绝、审核决定不可变、待审写守门、复审幂等重放拒绝、审核切换时财务 batch 零部分写入、相同并发审核幂等和私有上传管理员边界字段断言。审核切换故障触发器只在本地测试 D1 动态创建并删除，不进入生产迁移。
- `worker/index.ts`：安全响应头与 Worker 入口；全量集成通过，未在真实 Sites edge 单独验证。

## 已知不证明事项

- 本矩阵不证明真实 Sites secret、D1/R2 绑定、GitHub/Google 提供方回调、Webhook、邮件、备份恢复、压力容量、低端 Android、iOS Safari、4K/GPU 丢失和弱网行为。
- 本矩阵不证明同源 `allow-scripts + allow-same-origin` iframe 可隔离恶意代码；当前六个 bundle 必须按受信任的一方代码管理。
- 本矩阵不证明外部 `demoUrl` 的远端内容在批准后保持不变；当前不存在不可变站内包或内容摘要复核。
- 隐藏付费产品的买家补偿或受控历史访问没有产品决策，仍是发布阻断。
- 用户撤权与支付确认同时提交时，当前证据不证明撤权一定优先；D1 提交顺序决定最终线性化结果，尚无并发用例。

## 2026-07-16 线上收口增量

- `deploy/server/zaochang-preview.nginx.conf`：静态资源 `limit_conn` 从动态默认 30 分离为 128，动态页面/API 仍为 30，请求速率仍为 `10 req/s + burst 100`。远端 `nginx -t` 退出码 0，服务 `active/running, NRestarts=0`；改前 9 个银河模块为 `503`，改后 fresh Chrome 的 49 个请求全部 `200`，控制台 `0 errors / 0 warnings`。未单独验证 128 并发压力和内存峰值。
- `OAUTH_SETUP.md`：补充当前公开 origin、Client ID 与回调，不包含 Secret；真实 GitHub 授权返回 `/profile` 并读取 verified identity，Google 仍未配置。
- `PROJECT_STATUS.md`：追加当前 release、OAuth/Basic Auth 轮换、静态并发前后反例、服务恢复与剩余阻断；`git diff --check` 退出码 0，运行语义由本节其他证据提供。
- `RELEASE_RUNBOOK.md`：把“仍需轮换”改为每次发布核对只保留当前 Secret，并补充 Nginx 静态/动态限流验收步骤；远端实际配置与文档值逐字段一致。
- `RELEASE_EVIDENCE.md`：标明旧矩阵的时间边界并追加本节；`git diff --check` 退出码 0，运行语义不适用。
- 全量应用门禁：`npm test` 退出码 0，`67 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo`；`npx tsc --noEmit` 退出码 0；Lint 为 `0 errors / 9 warnings`；Drizzle 为 `37 tables / No schema changes`；依赖审计为 `0 high / 0 critical / 2 moderate`；禁用测试语法扫描输出 `NO_SKIP_OR_ONLY_MATCHES`。
- GitHub Secret：真实 token exchange 使用当前 Secret；GitHub 设置页最终只列后缀 `b080520e`，暴露过的旧项后缀 `b62dd389` 已删除并显示 `Client secret removed`。本证据不证明 Google 回调或第三方 GitHub 账号的管理员拒绝路径。
- Basic Auth：服务器回环断言 `unauth=401 / old=401 / new=200`，htpasswd 为 `root:www-data 640`；新密码只以 Windows DPAPI 密文留存。该证据证明认证结果，不证明共享账号满足公开生产的身份追踪要求。
- 服务与恢复：current 为 `/opt/zaochang/releases/20260715-221407-0428be85bf77-working-r3`；应用/Nginx 都是 `active/running, NRestarts=0`，4 GiB swap 未使用，备份/健康 timer 为 `enabled/active`，恢复检查为 `restore_check=ok sqlite=4 files=4`。

### 未覆盖范围

- 非管理员 GitHub 账号拒绝、OAuth logout 旧 Cookie 重放的真实线上路径、Google 登录、撤权/支付确认竞态、静态 128 并发压力、GitHub Actions、受支持的生产 D1/R2、跨机备份、恶意上传扫描、Webhook、邮件和移动真机仍未覆盖。

## 2026-07-16 依赖安全增量

- `package.json`：升级 Next/React、Cloudflare Vite plugin、Vite 与 Wrangler，并对 PostCSS/esbuild 增加最小传递依赖覆盖；`npm ls --all --json` 退出码 `0`，升级后的 `npm test` 为 `67/67`，Drizzle 为 `37 tables / No schema changes`。
- `package.json` CI 增量：test 命令显式启用 Node 22 的 `--experimental-strip-types`。GitHub Actions run `29511188405` 的反例为 Node `22.13.0` 抛出 `ERR_UNKNOWN_FILE_EXTENSION`；修复后用 `npx node@22.13.0 --experimental-strip-types --test tests/rendered-html.test.mjs` 运行同一入口，退出码 `0`，统计 `67/67`。
- `package-lock.json`：锁定 Cloudflare plugin `1.45.0`、Vite `8.1.4`、Wrangler `4.111.0`、Next `16.2.10`、React `19.2.7`、`ws 8.21.0`、PostCSS `8.5.10` 与修复后的传递依赖；`npm audit` 退出码 `0`，统计 `0 critical / 0 high / 0 moderate / 0 low`。
- `tsconfig.json`：排除本地 X 盘依赖恢复目录；排除生效后 `npx tsc --noEmit` 退出码 `0`。第一次未排除时命中备份内损坏的第三方声明文件并退出 `2`，不作为源码结论。
- `eslint.config.mjs`：排除本地 X 盘依赖恢复目录；排除生效后 lint 退出码 `0`，统计 `0 errors / 9 warnings`。第一次误扫备份的运行被终止，不作为 lint 证据。
- `.gitignore`：排除 `.playwright-cli/`、`output/` 与 `node_modules.xdrive-partial-*/`；暂存前断言临时路径命中数必须为 `0`。
- 本节证据只证明本地发布分支在 Windows/Node 22/Wrangler 本地 D1 环境的依赖解析、构建和行为结果；服务器 current 仍是 r3，本节依赖版本尚未在线上运行。

### 未覆盖范围

- 未在 Linux 服务器重新安装本节锁文件或执行线上冒烟；未执行真实 GitHub Actions runner；未验证依赖覆盖在未来 npm 重算后的长期兼容性；X 盘半安装依赖备份因主机删除策略拒绝仍留在本机，但不在 Git 索引中。

## 2026-07-17 main r4 合并部署证据

- GitHub 命题：PR `#1` 已进入 main。连接器字段为 `merged=true / state=closed / merge_commit_sha=90b10b4f84755a5423f223f027ecf996058ed4e4`；Actions run `29514985327` 的 job `verify` 为 `status=completed / conclusion=success`，11 个发布步骤的 conclusion 均为 `success`。
- 包与安装命题：服务器运行的依赖来自 merge commit 对应归档。归档 `output/deploy/zaochang-90b10b4f8475.tar.gz` 的本地 SHA-256 为 `32e7f332a5e83723546f3ae1fd99bb791e7d6eb7daeb2df1b84eb4734490cc2f`；服务器在 r4 目录执行 `npm ci`、Vite `8.1.4` build 和 `npm audit` 均退出 0，审计输出 0 vulnerabilities。
- 迁移命题：本次切换没有把换行差异误判成数据库变更。服务器比较 `drizzle/0000..0009` 输出 `semantic_changes=0`，所有差异均为 CRLF/LF；因此没有重放 migration。生产 SQLite 断言为 `integrity=ok / business_tables=37 / wrangler_metadata_tables=1 / review_columns=6 / critical_guard_triggers=11`。
- 切换命题：systemd 实际进程与 current 指向同一 release。`readlink -f /opt/zaochang/current` 和 `/proc/<MainPID>/cwd` 均为 `/opt/zaochang/releases/20260716-162918-90b10b4f8475-main-r4`；`zaochang.service` 为 `ActiveState=active / SubState=running / NRestarts=0`，Nginx 同为 active/running，`nginx -t` 成功。
- 回退命题：切换前状态存在可读取恢复点。备份 `/var/backups/zaochang/state-20260716T163859Z.tar.gz` 校验和通过，恢复探针断言 `restore_check=ok sqlite=4 files=4`。该单机备份不证明跨机灾备。
- 线上命题：受保护域名的银河首屏不是空帧且资源没有失败。Playwright 会话记录 46 个页面/API/RSC/静态请求全部 `200`、控制台 `0 errors / 0 warnings`、Canvas `1440x900`；像素抽样为 `5760 samples / 665 non-dark / 150 quantized colors`。AURELIA 字段为 `target=aurelia / cameraTransition=settled / sceneDensity=solitude / visiblePlanetCount=12 / hostStarCount=4 / targetBlackHoleDistance=112.43 / targetHostStarDistance=15.49`。
- 登录页命题：`/signin` 是独立认证页面而非社区壳层。SSH 回环隧道的字段断言为 `path=/signin / mainCount=1 / navCount=0 / hasLoggedInAccount=false / scrollFits=true`，GitHub href 为 `/api/auth/github/start?return_to=%2F`，控制台为 0 errors/0 warnings。该隧道验证证明 UI 与路由行为，不证明公网 Basic Auth 或 GitHub token exchange。
- 嵌入命题：MORI 发布 bundle 能进入 ready 终态。隧道字段为 `iframeCount=1 / iframeReadyState=complete / iframeBodyChildren=1 / loadingOverlay=false / scrollFits=true`。控制台 0 errors、3 warnings；warnings 明确是隧道 `127.0.0.1` 与固定 `https://zaochang.com`、`https://galaxy.zaochang.com` target origin 不匹配及既有 same-origin iframe sandbox 提示，因此不能用该会话声称生产 0 warnings。
- 日志命题：发布后没有发现应用 warning/alert 或 Nginx `5xx`。命令 `journalctl -u zaochang.service --since '2026-07-16 16:38:00 UTC' -p warning..alert` 输出 `-- No entries --`；最近 1000 条 Nginx access log 的 `5xx` 检索为空。error log 唯一命中是轮换校验时旧 Basic Auth 密码被拒绝的 `password mismatch`。
- 凭据事件：旧 Basic Auth 密码曾进入浏览器 URL 并出现在工具输出，因此不能继续使用。轮换后的服务器字段断言为 `unauthenticated=401 / old=401 / new=200`，htpasswd 为 `root:www-data 640`；新密码只以 DPAPI 密文保存在 `C:\Users\Abraham\.ssh\zaochang-preview-password.dpapi`，指纹前缀 `d5f10051b929`。新明文没有写入仓库、URL、对话或发布包；自动化结束后明文配置路径不存在。
- 清理命题：浏览器和发布临时状态没有继续驻留。`release-r4-tunnel close` 退出 0，`release-r4-rotated` 返回 not open，SSH tunnel PID 退出且 `Port39001Listening=false`；远端 `/tmp` 发布压缩包与 6 个发布/迁移/验证/轮换脚本删除后逐项断言不存在。

### 本轮文档改动验证

- `PROJECT_STATUS.md`：记录 r4 当前态、凭据事件、清理和公开发布阻断；由本节运行证据支撑，文档自身不证明线上行为。
- `RELEASE_EVIDENCE.md`：记录命题与可证伪字段；`git diff --check` 与关键词/密钥扫描需在提交前执行。
- `RELEASE_RUNBOOK.md`：新增禁止 URL 凭据、临时 `httpCredentials` 配置和暴露后强制轮换流程；本轮未再次故意暴露凭据验证该流程。

### 未覆盖范围

- 公开生产仍未覆盖：受支持的 Cloudflare D1/R2、非共享身份入口、Google 登录、跨机备份、恶意上传扫描、告警投递、容量与 128 静态并发压力。
- 行为仍未覆盖：非管理员 GitHub 账号拒绝、线上 logout Cookie 重放、撤权/支付确认竞态、低端 Android、iOS Safari、4K、高刷新率、GPU context loss、弱网、Webhook 和邮件。

## 2026-07-17 r5 静态容量证据

- 命题映射：待证命题是“单个已认证 IP 的 128 个静态请求都得到完整成功响应且服务不重启”；充分条件字段为 `statuses.200 == 128 && fullBodyCount == 128 && errors == {} && appRestartsBefore == appRestartsAfter && nginxRestartsBefore == nginxRestartsAfter`。修正前同一类探针为 `117×200 + 11×502`，因此旧配置不能推出该命题。
- 修正后可复现探针：从受控凭据源把 Basic 值只经 stdin 传给服务器上的 `node /tmp/zaochang-capacity-probe.mjs --path /assets/galaxy-experience-CYxZKn6Z.js --concurrency 128 --expected-status 200 --expected-bytes 624888 --timeout-ms 30000 --label r5_static`，退出码 `0`；字段为 `maxActive=128 / maxOpenSockets=128 / statuses.200=128 / errors={} / totalBytes=79985664 / fullBodyCount=128 / P95=17890.1ms / app NRestarts 0→0 / nginx NRestarts 0→0`，四个 verdict 均为 `true`。
- 动态反例边界：同一脚本执行 `--path /api/community --concurrency 30 --expected-status 200 --label r5_dynamic`，退出码 `0`；字段为 `statuses.200=30 / errors={} / P95=4320.9ms / NRestarts 0→0`。此证据证明 30 请求成功终态，不证明延迟 SLO。
- 线上配置命题：候选与实际 Nginx 配置的 `nginx -t` 均退出 `0`；重载后 `nginx.service` 为 `active/running/NRestarts=0`。访问日志中 `r5_static` 请求为 128 个 `200`；从重载时间起 Workerd journal 没有对应银河资产请求，证明该批静态响应没有进入 Workerd。
- 响应头命题：字段断言为成功资产 `status=200 / bytes=624888 / immutable cache`，匿名同路径 `status=401 / cacheControl=null`，缺失资产 `status=404 / cacheControl=null`；WANDER `status=200 / X-Frame-Options=SAMEORIGIN / geolocation=(self)`，MORI 对应 `geolocation=()`。这些字段是缓存和 iframe 边界的充分条件，不证明浏览器 Canvas。
- 全量应用门禁：当前完整 diff 的 `npm test` 退出码 `0`，日志终止标记为 `__TEST_EXIT__=0`，统计 `68 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo / duration_ms=380603.4928`；包含新增配置字段断言、Vite `8.1.4` 生产构建与既有支付、审核、OAuth、上传和迁移行为。
- 清理失败二分：旧清理路径的无超时 `taskkill` 挂起后，残留 Workerd 让下一次构建以 `EPERM dist/server/.wrangler` 退出 `1`；该证据证明“测试未形成终态且目录仍被占用”。修正后直接 Wrangler 子进程在 after hook 中退出，最终套件退出 `0`，并由 `4179` 无 LISTENING 与任务列表无 `workerd.exe` 证明“服务进程已退出且端口释放”。这不证明 Windows 在所有异常内核状态下都能强制终止进程；超时兜底失败时套件会显式失败。

### 本轮逐文件证据

- `deploy/server/nginx-rate-limit.conf`：新增静态 `64r/s` zone；配置测试断言精确值，远端候选与实际 `nginx -t` 均退出 0。
- `deploy/server/zaochang-preview.nginx.conf`：静态直出、128 连接、160 burst、缓存与产品应用安全头；线上 128 请求、401/404 缓存反例和 WANDER/MORI 头字段共同覆盖，浏览器像素未单独验证。
- `deploy/server/zaochang-capacity-probe.mjs`：可证伪容量探针；`node --check` 与 `--help` 均退出 0，服务器静态/动态两组 verdict 全为 true。
- `tests/rendered-html.test.mjs`：新增配置、探针入口和有界测试服务器清理；旧路径出现 `taskkill` 挂起与后续 `EPERM`，修正后的当前完整 diff 全量 `npm test` 为 `68/68`、退出码 `0`、无跳过或 todo，结束后无 4179 listener/Workerd。
- `PROJECT_STATUS.md`：记录语义变更、反例、结果和剩余阻断；运行语义由本节服务器字段支撑，文档自身不证明线上行为。
- `RELEASE_RUNBOOK.md`：同步静态/动态分层、缓存失败语义和探针放行字段；尚未由另一名操作者独立演练。
- `RELEASE_EVIDENCE.md`：记录本节命题映射与逐文件证据；最终 `git diff --check` 和改动文件对账仍需在提交前执行。

### 未覆盖范围

- 本轮没有新增真实浏览器 Canvas、网络瀑布或控制台证据：内置浏览器未能附着，Chrome 未运行且 ChatGPT Chrome Extension 原生通信注册缺失。
- 静态 P95 为 `17890.1ms`，动态 P95 为 `4320.9ms`；没有已批准的生产延迟 SLO，故不能声称延迟达标。
- 公开生产仍未覆盖受支持的 Cloudflare D1/R2、非共享身份入口、Google 登录、跨机备份、恶意上传扫描和告警投递；非管理员 GitHub 拒绝、logout Cookie 重放、撤权/支付竞态、移动真机、弱网、Webhook 与邮件仍未验证。

## 2026-07-17 PR #3 CI 重载竞态证据

- 失败命题：GitHub Actions run `29573038076`、job `87861071901`、head `3f473176b3da9666436d86aa087aa8fc540f4e74` 的 `npm test` 退出 `1`；完整统计为 `67 pass / 1 fail / 0 cancelled / 0 skipped / 0 todo`。唯一失败在 `tests/rendered-html.test.mjs:883` 的 GET 抛出 `fetch failed`，持续 `302000.542884ms`；它直接证明旧测试运行器没有给该读取设置有界终态，不证明产品审核字段被错误修改。
- 重试边界命题：`fetchIdempotentWithRetry` 的可证伪入口断言要求 `method ∈ {GET, HEAD}` 且 `body === undefined`；新增反例把 `POST` 传入该入口并由 `assert.rejects(... /only supports idempotent GET or HEAD/)` 判定拒绝。全套中该用例通过，证明当前测试调用不能借该助手重放 POST；它不证明仓库中所有其他手写重试均为幂等。
- 审核不变量命题：D1 绕过批准失败后，状态读取先断言 `stateResponse.status == 200`，随后断言目标产品 `status == pending_review`、`reviewStatus == pending_review`、`approvedVersion == 0`、`state.products.some(id) == false`。本地定向命令退出 `0`、`1/1` 通过；当前精确 diff 的完整 `npm test` 退出 `0`、`69/69` 通过、无 skipped/todo、`duration_ms=304455.9513`，原失败用例为 `2690.0835ms`。
- 静态门禁：`node --check tests/rendered-html.test.mjs`、`git diff --check`、`npx tsc --noEmit`、CI 同模式禁用测试扫描、`npm run db:generate && git diff --exit-code -- db/schema.ts drizzle` 均退出 `0`；lint 为 `0 errors / 9 warnings`；生产依赖审计为 `0 vulnerabilities`。
- 远端命题：GitHub Actions run `29576605970` 的 `headSha == f2b33b412efe2856dde97f9ca023f3b6394c8665`、`status == completed`、`conclusion == success`；job `87872378220` 中 checkout、setup-node、`npm ci`、TypeScript、Lint、禁用测试扫描、`npm test`、diff check、迁移漂移和高危生产依赖门禁均为 success。该字段集合证明修复 commit 通过 Ubuntu runner，不证明随后记录本段文字的文档 commit。

### 本轮逐文件证据

- `tests/rendered-html.test.mjs`：增加有界幂等读取、连续健康判定、POST 拒绝反例和原失败路径的显式 200 断言；定向 `1/1` 与全套 `69/69` 均退出 `0`，无 skipped/todo。
- `PROJECT_STATUS.md`：记录远端失败、测试语义变化、本地反例和未覆盖远端状态；文档自身不证明 GitHub Actions 或合并结果。
- `RELEASE_EVIDENCE.md`：记录命题—字段断言与逐文件证据；提交前仍需重新执行 `git diff --check`、改动集对账和暂存区凭据扫描。

### 未覆盖范围

- 修复 commit 已有成功远端 run；记录该 run 的文档 commit 仍须触发并通过自己的新 run。PR `#3` 尚未合并，main 尚未包含补丁。
- 未在更慢或更高抖动的 Linux runner 上证伪 12 秒恢复窗口；超过窗口时预期明确失败，而非继续重试。
- 本节没有修改或复验生产服务器、Nginx、Cloudflare D1/R2、OAuth 回调、浏览器像素、移动真机、备份、恶意上传扫描或告警投递。

## 2026-07-17 r6 阿里云受保护部署证据

- 部署命题：远端 main merge commit 为 `efc90d7397317ab65f511b289d7db05554d3a62d`，其 tree 与本地部署源同为 `f3eaf491b0fa942b9374a83d732f8c83a593f5e5`。服务器 `current == /opt/zaochang/releases/20260717-201245-efc90d739731-main-r5`、应用与 Nginx `ActiveState == active && SubState == running && NRestarts == 0 && ExecMainStatus == 0`；这些字段证明受保护 r5 当前运行，不证明公开访问。
- 回退命题：切换前快照恢复断言为 `checksum == true && restore_check == ok && sqlite == 4 && files == 4`，上一 release r4 保留。首个 CRLF 归档在 current 切换前退出，现场字段仍为 `current == r4 && app active && NRestarts == 0`；规范化归档用四个 Git blob 相等断言证伪损坏后才切换。
- 数据命题：发布前后 SQLite `integrity == ok`；钱包物化/available+pending 账本漂移、负余额、无当前审核决定的 published/approved 产品、外链批准产品计数均为 0。runtime 目录 diff 为 0，故本节没有执行迁移，也不证明未来 Cloudflare D1 迁移。
- HTTP/OAuth 命题：受保护凭据仅经 DPAPI 内存和 SSH stdin 使用。首页、银河、独立登录页、匿名社区 API、OIDC、六个产品应用和各自 JS/CSS 入口均为 200；字段断言覆盖 `DENY`、`SAMEORIGIN`、CSP、HSTS、nosniff、Permissions-Policy、匿名私有字段为空、OIDC HTTPS origin 与 GitHub HTTPS callback。Google 待配置 start 的 `Location origin == http://aetherstudio.top`，因此公开规范 origin 命题为 false。
- 容量命题：静态充分条件为 `statuses.200 == 128 && fullBodyCount == 128 && errors == {} && restartsStable == true`，动态充分条件为 `statuses.200 == 30 && errors == {} && restartsStable == true`；两组均满足，P95 分别为 `16429.7ms` 与 `4434.4ms`，没有延迟 SLO 达标结论。
- 公开判定：可公开命题要求受支持数据运行时、非共享身份、跨机备份、上传恶意扫描和外部告警字段均为 true；现场对应字段为 `false / BASIC_AUTH_USER_COUNT=1 / false / false / false`，故充分条件不成立。Basic Auth 仍覆盖 4 个 location，匿名首页为 401。

### 本轮逐文件证据

- `PROJECT_STATUS.md`：记录版本、备份、部署失败反例、运行字段、公开阻断和新风险；文档自身不证明服务器状态。
- `RELEASE_EVIDENCE.md`：记录命题与可证伪字段映射；提交前仍需执行 diff check、凭据扫描与工作树对账。

### 未覆盖范围

- 未取得本轮认证后真实浏览器 Canvas、网络瀑布与控制台证据；Playwright 包装器/运行版本不兼容，应用内浏览器无 Basic 会话。
- 未执行真实 GitHub 完整回调、logout Cookie 重放、Google 回调、Cloudflare D1/R2、跨机恢复、恶意上传样本、告警投递、Webhook、邮件、移动真机或弱网验收。
- 本节证明受保护预发布部署，不证明公开生产发布；Basic Auth 没有移除。
- 终场可达性未覆盖：最后一次成功 health/SSH 之后，本机 DNS 与 GitHub 控制请求同时异常；真实 IP TCP connect 成功，但 SSH/HTTP/TLS 协议终态未返回。不能用先前 200/health 证据外推“此刻仍可达”，也不能据本机异常断言服务器已宕机。

## 2026-07-19 r12 全流程页面证据

- 代码命题：匿名与成员空状态都渲染可见“项目孵化控制台”标题。`tests/rendered-html.test.mjs` 的两个 `assert.match(html, /<h1>项目孵化控制台<\/h1>/)` 在完整 `npm test` 中通过；套件退出 `0`，统计为 `72/72`、`failed=0 / skipped=0 / todo=0`。该字段断言直接证明服务端 HTML，不证明 CSS 可见性；可见性由线上 Playwright 的 `h1Visible == true` 补充。
- 移动命题：待证命题为 27 个核心路由在 `390x844` 稳定态均满足 `status == 200 && scrollWidth <= clientWidth + 1 && firstH1Visible == true`。Playwright 汇总字段为 `total=27 / non200=[] / overflow=[] / hiddenH1=[]`。160ms 过渡帧的 `/studio/new scrollWidth=392` 未被隐藏；500ms 定点反例为 `scrollWidth=390 / offenders=[]`，因此本证据只证明稳定态，不证明动画每一帧都无 2px 位移。
- 嵌入交互命题：等待每个 iframe 的 `#root > *` 可见后，六个应用结果数组的 `passed` 全为 true。具体充分字段为 MORI/WANDER 输入值相等且 canvas 存在、TYPEWAVE/LOOPS 播放按钮状态改变且下载后缀分别为 `.json/.md`、SPROUT 五个 textarea 均非空、MINUTE `aria-checked=true`、暮色按钮 class 含 `is-active`、计时重置与 `.md` 下载。此前 SPROUT `fields=0` 是挂载前探针，修正等待后同一发布版本复跑通过。
- OAuth/HTTPS 命题：外部 Node 探针退出 `0`，字段为首页/孵化/登录/社区/OIDC/产品应用均 `200`，GitHub `307`、目标 `github.com/login/oauth/authorize`、callback 精确为 `https://aetherstudio.top/api/auth/github/callback`、state 非空、OIDC issuer 精确为 HTTPS origin、普通页/应用 frame 头分别为 `DENY/SAMEORIGIN` 且 HSTS 存在。该 start 证据不证明 GitHub callback token exchange。
- 发布与数据命题：运行 commit `ea2748b084b4424f4e1821d6053f44c6cb8011f4` 的归档本地/远端 SHA-256 同为 `5ff20bf6d478b036e9f968d73d86ca2537d40a394073eceb7f28b9bfff2b44f1`，276 条且敏感/运行目录命中 0。默认 mirror audit 的 `404 NOT_IMPLEMENTED` 被判失败；官方 registry 复跑为 `found 0 vulnerabilities`。11 个迁移规范化一致，Wrangler 目录为 `zaochang:zaochang 0755`，current 与进程 cwd 均为 r12。
- 回退命题：切换前备份 SHA-256 为 `352d3d7b888201dc2fd79071fa91652c0f6cb6b2b6ba5dd404608907e2164206`，恢复字段为 `restore_check=ok sqlite=5 files=5`。真实业务库在 PRE/POST/终场脚本均断言 `integrity == ok && tables == 40 && walletDrift == 0 && negativeWallets == 0 && invalidPublished == 0 && approvedExternal == 0`。两次转义错误的内联 SQLite 诊断已明确作废；这里只引用上传只读脚本退出 `0` 的结果。
- 服务命题：应用、扫描器、Nginx 均为 `active/running/NRestarts=0/ExecMainStatus=0`，健康任务为 `Result=success/ExecMainStatus=0`。切换 stop 让旧 Wrangler 以 143 退出并留下 systemd failed 日志，但新进程一次 Ready；r12 时间窗 Nginx 5xx 为空、Ready 后 warning..alert 为空。服务 unit 仍未把 143 配成预期成功退出码。

### 本轮逐文件证据

- `app/galaxy/incubator/incubation-console.tsx`：匿名和成员空状态增加同一 H1；线上 Playwright 断言 `h1 == 项目孵化控制台 && h1Visible == true`，完整测试同时断言两种 HTML 状态。
- `app/galaxy/ecosystem.module.css`：为 notice 内标题和可缩容正文添加样式；390px 27 路由稳定态 overflow 为空。320px、系统大字体和逐动画帧未单独验证。
- `tests/rendered-html.test.mjs`：新增两条 H1 响应体字段断言；完整套件 `72 pass / 0 fail / 0 skipped / 0 todo`，退出码 `0`。
- `PROJECT_STATUS.md`：记录范围、反例、部署与剩余风险；文档自身不证明运行行为。
- `RELEASE_EVIDENCE.md`：记录命题到字段的映射；最终 diff/凭据扫描和文档提交在本节之后执行。

### 未覆盖范围

- 未执行真实支付/退款 UI、真实审核决定、真实邀请码生命周期、举报提交、全新外部 GitHub 身份 callback、Google OAuth、320px/移动真机、弱网、跨机恢复、外部告警和正式延迟 SLO。
- 回环 iframe 有同源 sandbox 警告与固定生产 origin 的 postMessage 警告；后两条由 `127.0.0.1` 隧道 origin 不匹配触发。没有在公网 origin 的 DevTools 会话重新证明 warning=0。
- 本地外部明文 HTTP 被 `Server=Beaver` 返回 403，未到达 Nginx；只有服务器本机端口 80 `301 → HTTPS` 证据，缺少另一网络对公网 80 的终态验证。

## 2026-07-19 GitHub 连接与创始人候选证据

- OAuth start 命题：待证命题是“GitHub 不可达时，用户在有限时间内看见失败；可达时才离开造场”。动态反例在模拟 DOM 中连续触发三次 `image.onerror`，字段为 `navigatedTo == '' && actions.visible == true`；随后重试并触发 `image.onload`，字段为 `new URL(navigatedTo).hostname == github.com`。生产集成测试同时断言 `status == 200`、`maxAttempts == 3`、`timeoutMs == 5000`、CSP 精确相等、state Cookie 含 `HttpOnly/Secure/SameSite=Lax` 且 `decodeURIComponent(pageState) == cookieState`。这些字段不证明公网 GitHub 当前可达。
- 回调超时命题：一次性 token exchange 不得自动重放。慢 provider 反例断言 `requestCount == 1` 且 50ms 测试上限触发 `TimeoutError`；生产配置为 token 12 秒、profile/email 各 8 秒。它证明有界和单次请求，不证明真实 GitHub token 响应成功。
- 邀请码保密命题：登录表单 HTML 与源码均断言 `method == post` 且不存在 GET 表单。该字段证明浏览器不会把表单字段编码进 action URL；公网 Nginx 日志尚未在新版本复验。
- 创始人权限命题：充分字段为 `founderProducts.length == 6`、每项 `ownerName == Abraham Valerio`、创始人 profile/admin 均 200、普通成员 admin 404、普通成员 HTML 不含 `/admin` 链接。`ZAOCHANG_FOUNDER_EMAIL` 缺失或多值时 `isFounderEmail == false`，管理权限仍由独立管理员白名单决定。线上只读 SQL 显示业务 products 为 0 行，因此未执行 owner_email/财务归属迁移。
- 完整套件：`npm test` 退出码 `0`，`tests=75 / pass=75 / fail=0 / cancelled=0 / skipped=0 / todo=0`，包含生产构建、OAuth、邀请、管理权限、果子支付、退款、审核、上传和创始人身份字段。定向原失败用例为 `2 pass / 0 fail`。
- 静态门禁：TypeScript 退出 `0`；修改文件定向 ESLint `0 errors / 3 warnings`；npm audit `0 vulnerabilities`；Drizzle `40 tables / No schema changes`；skip/only 与凭据扫描均无命中；diff check 退出 `0`。

### 候选逐文件证据

- `app/api/auth/[provider]/start/route.ts`、`github-connection-page.ts`、`app/lib/security-policy.ts`：生产集成测试直接断言同源 200、精确 CSP、安全 state Cookie 与连接页失败/重试字段。
- `app/api/auth/[provider]/callback/route.ts`、`app/lib/fetch-with-timeout.ts`：慢 provider 反例断言一次请求与 TimeoutError；真实 GitHub callback 未验证。
- `app/signin/page.tsx`：服务端 HTML 和源码断言 POST 邀请表单；公网日志未验证。
- `app/api/_lib/admin.ts`、`app/layout.tsx`、`app/components/site-shell.tsx`：创始人/管理员独立判定，创始人管理入口 200 与普通成员 404/无入口反例通过。
- `app/lib/community-data.ts`、`app/components/product-card.tsx`、`app/product/[slug]/product-experience.tsx`、`app/profile/page.tsx`、`app/globals.css`：六个静态应用 owner 与创始人标识由服务端 HTML 字段覆盖；像素、溢出与移动端尚未单独验证。
- `worker/index.ts`：生产安全头映射由 GitHub start 集成响应字段覆盖；独立边缘部署尚未验证。
- `tests/rendered-html.test.mjs`：迁移和测试 SQL 改为同一 SQLite WAL 文件的事务；完整 75 项通过。Node SQLite experimental 警告仍存在。
- `OAUTH_SETUP.md`、`RELEASE_RUNBOOK.md`、`PROJECT_STATUS.md`、`RELEASE_EVIDENCE.md`：记录配置、回滚条件、事实与未覆盖范围；文档自身不构成运行证明。

### 未覆盖范围

- 候选尚未提交、合并、部署；线上仍是 r12，不能把本节本地证据外推为公网行为。
- 真实 GitHub 授权/callback、邀请码不进入 Nginx 日志、浏览器像素/控制台、移动端、favicon 单点被阻断网络、Google OAuth、弱网、跨机恢复与外部告警未验证。
