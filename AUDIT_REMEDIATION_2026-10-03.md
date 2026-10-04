# 全库审查修复方案(2026-10-03)

> 来源:5 个只读子 agent 分区审查 + 主会话对重点条目的代码复核。
> 本文只给方案,不代表已修复。每条都标了「核实状态」与「当前状态」。
>
> - **核实状态**:`已确认`=主会话读代码/grep/node 片段确认;`子 agent 报告`=未经主会话逐行复核;`疑似`=推演得出,未复现。所有条目均**无运行时复现**,除非特别注明。
> - **当前状态**:`工作区已改(未提交)`=第 1 批中已动手的改动,见 §0;`未处理`=只有方案。

---

## 0. 工作区现状(决策前必读)

> **2026-10-04 更新**:用户已决定采用①(保留并补齐测试后提交)。F1/C1/A4 的缺失测试已补,第 1 批连同本文档一并提交(本地 main,**未推送**;其下还有未推送的 `92b6eb9`,见 `git log`);npm test 464/464(+6)。后续入口:§8 第 2 步起(C2 先复现再修)。
> - F1:`tests/suites/07-oidc-external.tests.mjs` 新增两条(旧挑战码 403 / 校验后换 hash 批次仍 paid),`tests/hyperknow-hardening.test.mjs` 钉"paid UPDATE 的 WHERE 不得依赖 challenge";
> - C1:新增零依赖 `app/api/_lib/hyperknow/budgets.ts`(导出两阶段预算常量 + `resolveCourseGenBudgetMs`,`HK_COURSE_GEN_TIMEOUT_MS` 仅 `APP_ENV=test` 采纳);route Stage1 经门禁解析、Stage2 用常量;`tests/harness/preview.mjs` 以 `HK_COURSE_GEN_TIMEOUT_MS:5000` 起预览;`tests/suites/11-hyperknow.tests.mjs` 新增超时退费集成测试与纯函数单测;契约钉禁止超时内联数字;
> - A4:门禁判定抽为 `dev-login-gate.ts` 的 `legacyIdentityHeadersEnabled` 纯函数(chatgpt-auth 委托之),`tests/suites/09-agent-ai.tests.mjs` 断言 staging/未设置/typo/旧 flag 一律拒绝;契约钉禁止再读 `TRUST_OAI_IDENTITY_HEADERS`。

在收到"只写文档"指示前,第 1 批已在工作区改动但**未提交、未推送**:

| 文件 | 改动 |
| --- | --- |
| `.github/workflows/deploy.yml` | S1/S2/S3 |
| `.github/workflows/ci.yml` | `npm audit` 加 `--prefer-online` |
| `app/api/_lib/external-fruit.ts` | F1(方案 A) |
| `app/api/hyperknow/course-generation/route.ts` | C1 |
| `app/api/auth/[provider]/start/route.ts` | A1 |
| `app/api/auth/logout/route.ts` | A2 |
| `app/chatgpt-auth.ts` | A3 + A4 |
| `app/api/_lib/dev-login-gate.ts`、`scripts/seed-acceptance.mjs` | 仅注释 |
| `CLAUDE.md`、`README.md`、`OAUTH_SETUP.md`、`RELEASE_RUNBOOK.md` | 身份头说明同步 |
| `tests/suites/03-auth-invite.tests.mjs` | A1/A2 新断言 |

该工作区状态下 `npm test` exit=0,tests 458 / pass 458 / fail 0 / skipped 0 / todo 0;tsc、lint(0 error)、`git diff --check`、`db:generate`(No schema changes)均通过。

另有本地提交 `92b6eb9`(websearch 重构),未推送。推 main 会触发生产部署。

可选处理:①保留并作为第 1 批提交;②`git restore` 全部回退,按本文由他人实施;③部分保留。需用户决定。

---

## 1. 第 1 批:安全 / 资金 / 计费(发布阻断级)

### S1 部署 workflow 可被 fork PR 触发 · P1 · 已确认(配置层) · 工作区已改

- **位置**:`.github/workflows/deploy.yml:25`(原)
- **问题**:`if` 只判断 `workflow_run.conclusion == 'success'`。`ci.yml:4` 对 `pull_request` 也触发;`branches: [main]` 按 head 分支**名**匹配,fork 的同名 `main` 分支同样命中。仓库为 PUBLIC。
- **失败场景**:fork 提 PR → CI 通过 → deploy 检出 `workflow_run.head_sha`(fork 代码)→ job 级 `CLOUDFLARE_API_TOKEN` 可用 → fork 代码被部署到生产,或 token 被 install 脚本窃取。
- **修法**:
  ```yaml
  if: >-
    ${{ github.event_name == 'workflow_dispatch' ||
    (github.event.workflow_run.conclusion == 'success' &&
     github.event.workflow_run.event == 'push' &&
     github.event.workflow_run.head_branch == 'main' &&
     github.event.workflow_run.head_repository.full_name == github.repository) }}
  ```
- **验证**:本地只能 js-yaml 解析 + 断言字段。真实验证需:一次正常 push main 确认仍部署;一次 PR 确认 deploy job 显示 skipped。
- **附加建议**:仓库 Settings → Actions → 开启"Require approval for all outside collaborators"。

### S2 生产 token 暴露给全部 step · P2 · 已确认 · 工作区已改

- **位置**:`deploy.yml:27-28`(原,job 级 env)
- **问题**:`npm ci` 的 postinstall、`npm test` 中任意依赖代码都能读到 `CLOUDFLARE_API_TOKEN`。
- **修法**:job 级只留 `CLOUDFLARE_ACCOUNT_ID`(非机密);token 只在 `Verify migrations applied` 与 `Deploy Worker` 两个 step 的 `env:` 注入。
- **验证**:解析 yaml 断言 job env 键只有 `CLOUDFLARE_ACCOUNT_ID`,含 token 的 step 只有这两个(已做)。

### S3 手动部署未锁 SHA · P2 · 已确认 · 工作区已改

- **位置**:`deploy.yml:12`、`:34`(原)
- **问题**:`workflow_dispatch` 无 inputs,checkout 回落 `github.ref` 即分支当时 HEAD,违背 CLAUDE.md"pin exact SHA + reason + owner"。
- **修法**:
  1. `workflow_dispatch.inputs` 加必填 `sha` / `reason` / `owner`;
  2. checkout `ref: ${{ github.event.workflow_run.head_sha || inputs.sha }}`,`fetch-depth: 0`;
  3. 新增 step:校验 SHA 为 40 位小写 hex、`git rev-parse HEAD == SHA`、`git merge-base --is-ancestor SHA origin/main`;手动路径校验 reason/owner 非空并写入 `$GITHUB_STEP_SUMMARY`。
  4. 所有 `${{ inputs.* }}` 经 `env:` 传入 shell,不直接内插进 `run:`(防脚本注入)。
- **验证**:需一次真实手动触发:给不在 main 上的 SHA 应失败,给 main 上的 SHA 应通过。

### F1 外部支付确认竞态:扣款成功但单子停在 pending · P1 · 已确认(读代码) · 工作区已改(方案 A)

- **位置**:`app/api/_lib/external-fruit.ts:248-252`(校验)、`:290-295`(批次内 UPDATE)、`:227-230`(`prepareExternalPaymentApproval` 覆盖 hash)
- **问题**:批次最后改单子的 UPDATE 带 `AND approval_challenge_hash = ?`。校验与 `db.batch` 之间没有锁;用户在第二个标签页打开同一笔支付会重写 hash。
- **失败场景**(操作已生效后失败):
  - 买家余额扣减、商户 pending 增加、流水与权益写入,但 UPDATE 命中 0 行——D1 不因 0 行回滚;
  - 单子保持 pending → 过期变 expired,`purchase_operation_id` 为空;
  - 结算只认 `status='paid'`(`:422`),退款也要求 paid(`:350`)→ 钱永久卡死;
  - 再次提交时 `external-purchase:${paymentId}` 主键冲突,`:326-329` 读到 pending,原样抛出 → 500;
  - 账本借贷平衡,现有 `wallet_ledger_mismatch` 检查发现不了。
- **触发器为何没挡住**:`fruit_external_payment_guard`(`drizzle/0005_flimsy_magus.sql:181-205`)只校验 status/过期/金额/钱包/权益,不校验 challenge;`external_fruit_payments` 上无 UPDATE 触发器。
- **方案 A(已采用,零迁移)**:批次 UPDATE 去掉 challenge 条件,只留 `WHERE id = ? AND status = 'pending'`。批次是单事务,同一事务内触发器已要求 INSERT 时 `status='pending'`,UPDATE 必然命中 1 行,扣款与 paid 同生同灭。challenge 仍在 `:248` 校验一次。
  - 代价:批次执行时不再复核 challenge。另一标签页重新生成 challenge 后,旧页面在"已通过校验但尚未提交"这一窄窗口内仍会成功——这是用户本人对同一笔支付的确认,不构成越权。
- **方案 B(纵深防御,可后续追加)**:新增前向迁移 `0027`:
  1. 批次中把 UPDATE 挪到第一条;
  2. 新增 `BEFORE INSERT ON fruit_operations WHEN NEW.kind='external_purchase'` 触发器,要求 `EXISTS(SELECT 1 FROM external_fruit_payments WHERE id=NEW.reference_id AND status='paid' AND purchase_operation_id=NEW.id)`,否则 `RAISE(ABORT,'external_payment_not_marked_paid')`;
  3. 但 0005 的 guard 要求 `status='pending'`,两者冲突,需同迁移内 DROP/重建 guard,改为校验 `paid AND purchase_operation_id=NEW.id`——这会改动资金核心触发器,须单独评审。
  - 好处:直接写 D1 也成立,符合"不变量靠触发器"的约定。
- **必补测试(已补,2026-10-04)**:在 `tests/suites/07-oidc-external.tests.mjs`:
  1. 打开支付页取 challenge1 → 再打开一次(生成 challenge2)→ 用 challenge1 提交:断言 403 `invalid_approval_challenge`,`wallets.balance` 不变;✅ 已实现,另断言 challenge2 照常支付成功。
  2. 模拟"校验后、批次前"换 hash:✅ 已实现(按批次原语句直接执行:先覆盖 hash 再跑批次,断言单子 `paid`、`purchase_operation_id` 非空、余额与账本一致);另在 `tests/hyperknow-hardening.test.mjs` 钉住"paid UPDATE 的 WHERE 不得依赖 challenge"防源码回归(纯 SQL 模拟测不到生产代码改坏)。

### C1 建课服务端超时不退费 · P1 · 已确认(读代码) · 工作区已改

- **位置**:`app/api/hyperknow/course-generation/route.ts:476`(`AbortSignal.any([request.signal, AbortSignal.timeout(300_000)])`)、`:728`、`:795`;Stage2 同构于 `:172`(900s)、`:207`、`:292`
- **问题**:`if (signal.aborted || request.signal.aborted)` 把客户端断开与服务端超时合并成同一静默分支,跳过 `:809` 的 `refundCreditCharge` 与 `:812` 的 `course_generation_error`。
- **失败场景**:自动级联模式 8+ 单元课程超过 300s → 用户被扣 10 积分不退,前端只看到流断。
- **修法**:
  - 循环开头:`if (request.signal.aborted) return; if (signal.aborted) throw new Error("course_generation_timeout");`
  - catch:只在 `request.signal.aborted` 时静默;服务端超时走失败路径(标 failed、`charged` 时退费、推错误帧)。
  - Stage2 同样处理(Stage2 不扣费,只需显式报错)。
- **语义变更**:服务端超时从"静默断流、不退费"改为"显式失败、退费"。
- **必补测试(已补,2026-10-04)**:两个超时值提为 `app/api/_lib/hyperknow/budgets.ts` 导出常量;`HK_COURSE_GEN_TIMEOUT_MS` 仅 `APP_ENV=test` 生效(1s 下限防误配成立即失败);`11-hyperknow` 集成测试以 `setAiUpstreamUnitDelay(12000)` + 预览 var 5000ms 真实触发超时,断言 `course_generation_error`、任务 `failed`、计费行 `refunded`、`remaining_credits` 回 20;纯函数单测断言 production/staging/未设置/typo 忽略覆盖 var。**测试钩子声明(规则 3.4)**:该 var 在 `APP_ENV !== "test"` 时被 `resolveCourseGenBudgetMs` 无条件忽略,生产路径不生效,契约钉锁死。

### C2 计费租约 60s 短于蓝图生成 · P1 · 疑似 · 未处理

- **位置**:`app/api/_lib/hyperknow/credits.ts:132`(`leaseDurationMs = 60_000`);接管分支 `course-generation/route.ts:385-460`
- **推演**:同一 explicitKey 在 60s 后重发 → 任务存在但无蓝图 → 过期租约被接管、`charged=false` → `createCourseTask` upsert → 两个 Stage1 并行,后一个不扣费。
- **实施前先做**:读完 `:385-460` 接管逻辑;用 `setAiUpstreamUnitDelay`(或新增蓝图延迟)让第一次请求的蓝图 >60s,60s 后同 key 发第二次,观察是否出现两次上游蓝图调用、扣费次数。
- **修法(复现成立后)**:二选一
  1. 租约时长 ≥ Stage1 总预算(300s),并在成功/失败时显式释放;
  2. Stage1 开始即 `acquireCourseTaskLease`,拿不到返回 409 `concurrent_operation_in_progress`(与 Stage2 一致)。推荐 2。
- **测试**:上述复现脚本转为集成测试,断言第二次请求 409 且上游蓝图调用计数 = 1。

### A1 GET 登录入口接收邀请码 · P1 · 已确认 · 工作区已改

- **位置**:`app/api/auth/[provider]/start/route.ts:23-25`(原)
- **问题**:从 query 读 `invitation_code` 和 `cf-turnstile-response`,违反"邀请码只走 POST";会落进 URL、访问日志、浏览器历史、Referer。合法登录页只用 POST 提交邀请码(`signin/page.tsx` 表单 `method="post"`)。
- **修法**:GET 固定传 `null` 给邀请码与 Turnstile token,只保留 `return_to`。
- **测试**:`03-auth-invite` 生产预览段新增:GET 带 `invitation_code=ZC-NOT-A-REAL-CODE` → 200 连接页、不写 `zaochang_oauth_invite` cookie(旧实现会 307 到 `invitation_invalid`,可区分新旧)。

### A2 登出跳转把 `?`/`#` 编码坏 · P2 · 已确认(node 复现) · 工作区已改

- **位置**:`app/api/auth/logout/route.ts:28`(原 `url.pathname = safeReturnPath(...)`)
- **复现**:`/feed?x=1#h` → `https://a.top/feed%3Fx=1%23h` → 404。
- **修法**:`absoluteAppUrl(request, safeReturnPath(...))`。
- **测试**:`return_to=/feed?x=1#h` → Location pathname `/feed`、search `?x=1`、不含 `%3F|%23`。

### A3 `chatgpt-auth.ts` 死代码含 open redirect · P2 · 已确认 · 工作区已改

- **位置**:`app/chatgpt-auth.ts:69-109`(原)
- **问题**:`safeRelativeReturnPath` 缺 `//` 终检,`/..//evil.com` → `//evil.com`(node 复现)。`requireChatGPTUser`/`chatGPTSignInPath`/`chatGPTSignOutPath` 在文件外无调用方。
- **修法**:删除三个函数及 `SIGN_IN_PATH`/`SIGN_OUT_PATH`/`CALLBACK_PATH`/`isReservedAuthPath`、`redirect` import。
- **验证**:tsc exit 0 证明无残留引用。

### A4 遗留身份头门槛 · P2 · 子 agent 报告,主会话已核代码 · 工作区已改

- **位置**:`app/chatgpt-auth.ts:58-67`(原)
- **问题**:只要 `APP_ENV !== "production"`(含 staging、未设置、`Production` 拼写)且 `TRUST_OAI_IDENTITY_HEADERS=true`,任意客户端可用请求头自封任意 email。
- **语义变更**:从"非 production 且 flag=true,或 APP_ENV∈{development,test}"改为"仅 APP_ENV∈{development,test}"。`TRUST_OAI_IDENTITY_HEADERS` 不再生效。
- **影响**:staging/未设 APP_ENV 的环境不再信任身份头;`scripts/seed-acceptance.mjs` 需本地 dev 带 `APP_ENV=development`。
- **文档**:CLAUDE.md、README、OAUTH_SETUP、RELEASE_RUNBOOK 同步(工作区已改)。
- **测试缺口(已补,2026-10-04)**:采用"抽零 import 纯函数"路线——`legacyIdentityHeadersEnabled` 落在 `dev-login-gate.ts`(与 dev-login 同一 APP_ENV 白名单共用一份实现),`09-agent-ai` 单测断言 staging(含旧 flag=true)/未设置/typo 拒绝、development/test 放行;契约钉禁止 chatgpt-auth 再读 `TRUST_OAI_IDENTITY_HEADERS`。生产实例的端到端拒绝已由 `03-auth-invite` 的生产预览段覆盖(伪造头 → 401)。

---

## 2. 第 2 批:正确性(P1)

### P1-T 聊天翻译串写 / 写回旧会话 · P1 · 已确认(串写)/疑似(跨会话)

- **位置**:`hyperknow-spa/src/lattice/pages/ChatPage.tsx:266-304`;`:271` 不传 signal,`:276` `text: cur.text + chunk`,`:291` 按 idx 写回。
- **失败场景**:
  1. 同一条消息先选英文再选日文:两路 chunk 追加到同一 `cur.text` → 混合文本,语言标签与内容不符(已确认);
  2. 翻译中切会话/换账户:若 `translations` 未随会话清空,旧结果按 idx 插进新视图(疑似,先核实切会话时是否重置 `translations`)。
- **修法**:
  1. `backend.ts` 的 `translateLive` 增加 `signal?: AbortSignal` 参数,传给 fetch,abort 时返回 `{ok:false, reason:'aborted'}` 且不弹 toast;
  2. ChatPage 维护 `const translateCtl = useRef(new Map<number, AbortController>())` 与 `const translateSeq = useRef(new Map<number, number>())`;
  3. 每次 `translateMessage(idx)`:abort 该 idx 旧 controller,`seq = (map.get(idx) ?? 0) + 1`;`onChunk`/写回前检查 `translateSeq.current.get(idx) === seq`,不等则丢弃;
  4. 切会话、身份变化、卸载的 effect cleanup:abort 全部 controller、清空两张 map 与 `translations`。
- **计费**:后端是在"探活后"扣费;客户端 abort 后服务端是否已扣需看 translate 路由——若已扣,abort 不退费,这是预期(用户主动切走)。在方案里明确记录。
- **测试**:SPA 无组件测试框架。最低限度:把"seq 守卫写回"抽成纯函数加到 `tests/hyperknow-*` 契约测试;并用 headless 浏览器手动验证(按 memory 中 UI 验证规范)。
- **交付**:改 `hyperknow-spa/src` 后必须 `cd hyperknow-spa && npm run build` 并提交 `public/lattice/` 产物,`spa-typecheck` 测试通过。

### P1-K 课程旅程键盘操作被外层吞掉 · P1 · 已确认(读代码)

- **位置**:`hyperknow-spa/src/lattice/pages/CourseJourney.tsx:677-687`(外层 `role="button"` div 的 onKeyDown)、`:696-707`(内层「重温」按钮)
- **失败场景**:已完成首课上,键盘聚焦「重温」按 Enter → keydown 冒泡到外层被 `preventDefault` → 按钮 click 不产生 → 外层打开 **练习**而非讲座。
- **修法**:
  - 短期:外层 onKeyDown 第一行 `if (e.target !== e.currentTarget) return;`
  - 长期:外层改为非交互容器,整行点击区域用一个真正的 `<button>`(或 `<a>`),内层按钮作为兄弟元素,消除"按钮嵌按钮"的 a11y 违规;顺带把 8 处重复的 `openLesson` 参数抽成 `SessionRow` 子组件。
- **测试**:headless 浏览器:Tab 到「重温」→ Enter → 断言路由为 lecture。

### P1-R 确认流程丢失联网检索结果 · P2(质量) · 已确认

- **位置**:写入点 `app/api/_lib/hyperknow/store.ts:217` 只取 `createCourseTask` 入参;`course-generation/route.ts:467` 调用时没传 `researchHitsJson`;读取点 `:202`。
- **影响**:`requireConfirmation` 路径的 Stage2 单元生成永远没有检索上下文;自动级联路径(`:751`)有。
- **修法**:检索完成后(`:509-654` 段末,researchHits 定稿处)调用 `updateCourseTaskBlueprint` 或新增 `updateCourseTaskResearch(courseUuid, email, JSON.stringify(researchHits))`;`createCourseTask` 时检索尚未执行,不能在那里传。截断:最多 12 条、每条 snippet 已截 320,JSON 总长加上限(如 32KB)。
- **测试**:`11-hyperknow` 加确认流测试:Stage1(`requireConfirmation: true`)→ Stage2 confirm → 断言 Stage2 单元请求 `lastChatCompletion.user` 包含 `stepfun.research.test` 与 `UNTRUSTED EXTERNAL WEB RESEARCH`。

### P1-U 上传失败留下 R2 孤儿对象 · P2 · 子 agent 报告(读过代码)

- **位置**:`app/api/_lib/upload-core.ts:98-118`;`:98` 已写正式 key(`scanStatus:"clean"` 元数据),`:110/:111` 抛错后 catch 只删 quarantine。
- **影响**:不泄露(读取有 DB clean 守卫,`uploads/[key]/route.ts:22`),但占存储、无日志。
- **修法**:catch 中 `await bucket.delete(key).catch(() => undefined)` + `console.error("[upload] finalize failed", { key, error })`;确保 DB 行最终为 `error` 而不是悬挂 `pending`(注意 `uploaded_files_scan_transition_guard` 只允许 pending→clean/infected/error)。
- **测试**:harness 的假扫描器加"返回 clean 但随后 DB 写失败"不易模拟;可改为单测 upload-core 的清理函数,或在集成测试里用 `executeLocalD1` 预先制造冲突使 `:110` 失败,断言 R2 中无该 key。

---

## 3. 第 3 批:P2(按模块)

### 3.1 鉴权

| 编号 | 位置 | 问题 | 修法 | 核实 |
| --- | --- | --- | --- | --- |
| A5 | `app/api/_lib/email-send.ts:59` | 测试专用 `EMAIL_SEND_*` REST 覆盖未限环境,生产误配会把验证码发到任意 URL,且优先级高于 binding | `APP_ENV === "production"` 时忽略 REST 路径,直接走 `EMAIL` binding 或 503;生产预览测试加 `--var EMAIL_SEND_BASE_URL:...` 断言仍 503/走 binding | 子 agent |
| A6 | `logout/route.ts:17`、`dev-login/route.ts:25` | 只拦 `sec-fetch-site: cross-site`,缺该头的旧浏览器不受保护 | 头缺失时校验 `Origin`(或退而 `Referer`)与 `publicAppOrigin` 同源,不同源 403;两者都缺时对 logout 放行(登出影响小)、dev-login 拒绝 | 子 agent |
| A7 | `app/lib/security-policy.ts:18` | `/api/auth/github/start/` 带尾斜杠时不匹配锁死 CSP | 先确认 vinext 是否路由尾斜杠;若是,匹配前 `pathname.replace(/\/+$/, "")`;`worker-contracts` 加断言 | 疑似 |
| A8 | `access-control.ts:90/103`、`route-guards.ts:36`、`normalizeDevLoginEmail` | agent 判定一处用 email、一处用 `isAgent`;dev-login 不要求域名带点,非生产可用 `agent@zaochang` 拿到 agent 身份 | 统一用 `member.isAgent`(仅 bearer token 路径置位);dev-login 拒绝 `AGENT_EMAIL` 并要求域名含点 | 疑似 |
| A9 | `worker/index.ts:60` | 生产缺 `PUBLIC_APP_ORIGIN` 时每请求 500,与 `oauth-session.ts:72` 的 503 设计不一致 | worker 层 catch 该错误返回 503 `origin_not_configured`(仍 fail-closed) | 子 agent |
| A10 | `access-control.ts` `authorize()` | 无调用方 | 保留(CLAUDE.md 称其为声明式入口)或删除;二选一并更新 CLAUDE.md | 子 agent(grep) |

### 3.2 果子账本 / OIDC

| 编号 | 位置 | 问题 | 修法 | 核实 |
| --- | --- | --- | --- | --- |
| L1 | `fruit.ts:450-459`、触发器 0003:148-161、0006:101-102 | 退款不检查卖家钱包状态 | **降级为设计确认**:`07-oidc-external` 现有测试显式把商户钱包置 `frozen` 后断言退款 200、pending 归零——这是被测试钉住的有意行为。只需在 `fruit.ts` 与 0006 迁移旁的文档(PROJECT_STATUS/HYPERKNOW 无关,建议写进 OAUTH_SETUP 资金章节)补书面理由:买家退款权优先于卖家风控状态 | 主会话核对测试 |
| L2 | `oauth-provider.ts:627-630` | refresh 重放只吊销 `refresh_parent_hash IN 家族` 的 access token,授权码换出的第一枚 access token 不在内 | 前向迁移给 access token 表加 `family_id`(授权码兑换时生成,refresh 继承),吊销按 `family_id`;回填历史行可设为自身 id | 子 agent |
| L3 | `oauth-provider.ts:604` | 授权码重放只回 `invalid_grant`,不吊销已签发 token(RFC 6749 §4.1.2 SHOULD) | 发现 `usedAt` 时按 `authorization_code_hash` 找家族并吊销全部 access/refresh | 子 agent |
| L4 | `oauth-provider.ts:657-660` | revoke refresh token 不连带同家族 access token | revoke 时按家族吊销 | 子 agent |
| L5 | `oauth-provider.ts:609-613/644-648` | 所有异常改写为 400 `invalid_grant`,掩盖签名密钥配置错误(500)与 `unauthorized_client`(403) | 只把已知的 grant 错误映射 400;`OAuthProviderError` 按自身 status;未知异常 500 + 日志 | 子 agent |
| L6 | `oauth-provider.ts:121` | PKCE verifier 正则缺 `.` `~` | 改 `^[A-Za-z0-9\-._~]{43,128}$`;单测加含 `.~` 的 verifier | 子 agent |

L2–L4 需同一个迁移与一组集成测试(`07-oidc-external`):重放 refresh → 断言原 access token 访问 userinfo 401;重放授权码 → 断言已签发 token 全部 401;revoke refresh → 同家族 access 401。

### 3.3 见界后端

| 编号 | 位置 | 问题 | 修法 | 核实 |
| --- | --- | --- | --- | --- |
| H1 | `course-generation/route.ts:198/282` | Stage2 的 brief 取自请求体,可与任务不一致并被持久化进讲师 prompt | Stage2 一律用 `task.briefJson`,忽略请求体 brief | 子 agent |
| H2 | `route.ts:441` | Stage1 先扣费再探活,与 chat/translate"首帧后扣费"不一致 | 扣费前做一次轻量上游探活(或把扣费移到蓝图首次成功返回后,配合幂等 key);叠加 C1 修复后至少不会白扣 | 子 agent |
| H3 | `llm.ts:106` | Pro(step-5-preview)404 时静默换 Flash | 降级时推 SSE 帧或在响应中标 `degraded: true`;前端提示"Pro 暂不可用,已用 Flash" | 子 agent |
| H4 | `route.ts:544/572` | 检索异常 `err.message` 原文推给客户端 | 客户端只给固定文案 + status,原文仅 `console.warn` | 子 agent |
| H5 | `route.ts:99` | confirm/恢复回放与新建课共享 5 次/小时限流 | 回放已完成课程不计数;confirm 单独计数 | 子 agent |
| H6 | `model-check` `:29` + `llm.ts:257` | `maxTokens:16` 小于思考预算 256,混合推理模型大概率空正文仍报 ok | 探针 maxTokens ≥ 512,并要求正文非空才算 ok | 疑似 |
| H7 | `app/api/ai/reading/route.ts:46-49` | 未调用 `assertSameOrigin`,其他 hyperknow 路由都有 | 加同源校验;先确认 worker 层是否已有兜底 | 疑似 |
| H8 | `chat/route.ts:71-73` | `typeof AbortSignal.any` 判断在 Workers 恒真,360s 分支不可达;chat 总预算 120s 下 3+3 次重试跑不到 | 删死分支;重试次数按预算重新核算并写成常量契约 | 子 agent |

### 3.4 见界 SPA

| 编号 | 位置 | 问题 | 修法 |
| --- | --- | --- | --- |
| W1 | `WhiteboardPage.tsx:329/350/359` | plan 重试与首请求共用一个 135s 计时器,冷启动后重试只剩 ~35s | 每次请求独立 controller + `PLAN_CLIENT_TIMEOUT_MS` 计时器;`whiteboard-plan-budget` 契约测试同步 |
| W2 | `CreatePage.tsx:210-215` | 卸载 cleanup 未置 `finishedRef`,abort 后的 `{ok:false}` 可能再次 `setGenFailed`/登记检查点(疑似,`:350/:418` 守卫未读) | cleanup 首行 `finishedRef.current = true` |
| W3 | `ChatPage.tsx:673` | 中文输入法回车选词直接发送 | `if (e.key === 'Enter' && !e.nativeEvent.isComposing)` |
| W4 | `Popups.tsx:336/361/604`、`CourseJourney.tsx:820`、`WhiteboardPage.tsx:511-520`、`Popups.tsx:566/390` | 弹窗无 `role="dialog"`/焦点管理;Esc 不覆盖 exit/idle/conn;导出菜单 `<div onClick>`;伪复选框 | 抽 `useModal`(`role="dialog" aria-modal`、焦点陷阱、Esc、关闭还原焦点);菜单项 `<button role="menuitem">`;复选框用原生 `<input type="checkbox">` |
| W5 | `CreatePage.tsx:457-473` | 卸载后问询请求仍弹 toast | 同 W2 用卸载标记守卫 |
| W6 | `:973` | `localStorage.setItem` 未包 try,隐私模式抛错 | try/catch,失败只影响记忆不影响关闭 |
| W7 | `backend.ts:797` | 积分缺失兜底 `?? 20` 误导用户余额充足 | 缺失时显示"—"并触发重新拉取 |
| W8 | `backend.ts:673/739/757` | `pingBackend`/`fetchMe` 等无超时 | 统一 `AbortSignal.timeout`,值定为导出常量 |
| W9 | `backend.ts:257/348/411` | 非 SSE 提前返回不 `body.cancel()` | 补 `await res.body?.cancel().catch(()=>{})` |
| W10 | `WhiteboardPage.tsx:865` | 空 `catch {}` | 至少 `console.warn` |

SPA 改动统一要求:`npx oxlint src`、`tsc -b`(经 `spa-typecheck` 测试)、`npm run build` 并提交 `public/lattice/`;UI 行为用 headless 浏览器亲验。

### 3.5 社区功能

| 编号 | 位置 | 问题 | 修法 |
| --- | --- | --- | --- |
| M1 | `uploads/[key]/route.ts:44` | 封面被多个产品共用时 `.first()` 可能命中待审产品,对已批准产品的匿名访客返回 403 | `SELECT EXISTS(... WHERE image_url = ? AND ${PUBLISHED_PRODUCT_SQL})` |
| M2 | `products/route.ts:37-38`、`errors.ts:37-38`、`community.ts:13` | 桶缺失回 403 `product_cover_not_owned`(应 503);所有 UNIQUE 冲突映射 409 `already_completed`;DB 不可用落 500(应 503) | 分别改 503 `storage_unavailable`;UNIQUE 映射按约束名区分;`database()` 缺失抛 503 错误类型 |
| M3 | `docs.ts:583/652` | `coverImage/bannerImage` 接受任意外链,读者 IP/Referer 泄露给外站(agent 也可写) | 只允许 `/api/uploads/<key>`(正则复用 upload-core)或白名单域名;不合格 400 |
| M4 | `incubation/route.ts:55-67` | INSERT 与 UPDATE 分两次 run,非原子 | 改 `db.batch([...])` |

---

## 4. 第 4 批:可重构(不改行为)

每项要求重构前后 `npm test` 总数不变、全绿。

1. **course-generation 检索分支合并**(`route.ts:534-654`):`const queries = provider === "stepfun" ? [query] : researchQueriesFor(query)`,共用一段循环;结束帧 status/reason 规则参数化(stepfun 单轮直接取 outcome,多轮取"有命中则 success 否则末轮状态")。`11-hyperknow` 的 `round 1/1` 文案断言需保持。
2. **单元生成循环**:Stage1 `:725-793` 与 Stage2 `:206-290` 抽 `runUnitGeneration({ units, signal, onProgress, saveCheckpoint })`,C1 的超时判定只写一处。
3. **SSE 响应构造 7 处重复**:抽 `sseResponse(stream)`,统一带 `x-accel-buffering: no`(`:405/:426` 现缺)。"已完成课程直接回放"3 处(`:112/:330/:398`)抽 `replayCompletedCourse()`。
4. **`frame()` 3 份**(chat/translate/course-gen)→ `_lib/hyperknow/sse.ts`。
5. **`llm.ts` 401/403/429 映射 4 次** → `throwForStatus(response)`。
6. **常量时间比较 3 份**(`agent-auth.ts:36/95`、`oauth-session.ts:97`)、`toBase64Url` 2 份 → `_lib/crypto-utils.ts`(保持零 cloudflare import 以便单测)。
7. **钱包辅助函数**:`wallet`/`assertWalletIntegrity`/`validIdempotencyKey`/`sqliteTimestamp` 在 `fruit.ts:74-115` 与 `external-fruit.ts:65-93` 各一份;结算批次 3 份 → `_lib/fruit-core.ts`。资金路径,重构后必须跑 `07-oidc-external` 与钱包套件。
8. **触发器常量与 `FRUIT_POLICY` 双源**(24h、6、10、20):加契约测试读取迁移 SQL,正则抽出数值与 `FRUIT_POLICY` 比对。不要试图让触发器读配置。
9. **上传 key 正则 3 份**(`uploads/[key]/route.ts:8`、`incubation/route.ts:48`、`products/route.ts:30`)→ upload-core 导出。
10. **`handleMemberAction`**(`community-actions.ts:34`)十分支 → 分派表。
11. **`docs.ts` 732 行** → 拆 `docs-write.ts`。
12. **SPA**:`chatLive`/`translateLive` SSE 循环 → `consumeTextStream`;约 10 处 fetch→ok→json→null → `postJson`;`cancelToFeed`/`abandonAll` → `stopInFlight()`;`MiniCube`/`KnotMark` 同一 SVG 合并;删 `CourseJourney.tsx:952` 无人用的具名导出、`LiveBoardAction.nodes/edges`;backend.ts 16 个仅内部用的类型去掉 `export`。
13. **过时注释**:`fruit.ts:436` 提及已不存在的 `reconcileWalletFromLedger`。

---

## 5. 第 5 批:工程卫生

| 项 | 现状 | 建议 | 需决策 |
| --- | --- | --- | --- |
| `qa-runs/` | 1568 个文件全入库,工作区约 729M;lint 27 条 warning 全来自这里 | eslint `globalIgnores` 加 `qa-runs/**`;新产物写入 gitignore 目录;历史证据迁外部存储或 LFS。改写 git 历史会影响所有克隆,只建议"停止新增 + 忽略",不建议 filter-repo | 是 |
| lint 门禁 | warning 不拦截 | 忽略 qa-runs 后 `eslint --max-warnings=0` | 否 |
| `examples/` | 模板残留,被 tsc/lint 扫描 | 删除或加入 exclude | 否 |
| `.pyc` | experiments/mini_cpu 中 tracked | `git rm --cached` + `.gitignore` 加 `__pycache__/` | 否 |
| `build/**` | 被 eslint 忽略,但 `vite.config.ts:4` 引用其中插件源码 | 对插件源码目录取消忽略 | 否 |
| CI audit | 已在工作区加 `--prefer-online` | — | — |
| 禁用测试正则 | 不拦 `t.skip()`/`t.todo()`(当前 0 命中) | 正则加 `\bt\.(skip|todo)\s*\(`,`ci.yml` 与 `deploy.yml` 同步 | 否 |
| actions 版本 | 未 pin commit SHA | `actions/checkout@<sha> # v7` 等 | 否 |
| 未引用脚本 | 7 个(如 take-system-shots) | 确认无人工使用后删除 | 是 |
| CLAUDE.md 漂移 | 写 "~22 entry files"/"414 tests",实际 28 / 458 | 改为"以 node:test 输出为准",去掉具体数字 | 否 |
| HYPERKNOW.md 漂移 | `HYPERKNOW_AI_MODEL` 默认写 `step-explore`,`config.ts:42` 实为 `step-3.7-flash` | 改文档 | 否 |
| MCP 集成测试缺口 | 测试桩对 `/v1/mcp/web_search/mcp` 返回 404,MCP 成功路径无集成测试 | harness 加 MCP 路由(tools/call 信封),新增"MCP 成功不打 /v1/search"与"MCP 401 回退 /v1/search"两条 | 否 |

---

## 6. 子 agent 分歧与降级记录

- 社区 agent 报"编辑后重审应用层未实现"(P1),其自身复核降级:`drizzle/0008_noisy_jazinda.sql:133` 触发器 `review_version = OLD.review_version + 1`,且当前无产品编辑 API。采纳降级,不列为问题。
- SPA agent 对 P1-K 的方向描述反了("点练习进讲座"),根因成立;本文 P1-K 为更正后版本。
- SPA agent 原报 W1 为 P1,其自身降为 P2(abort 走 `catch → null`,降级计划保留,不白屏)。采纳。
- L1(退款不查钱包状态)由主会话依据现有测试降级为"有意设计,补书面理由"。
- 无少数派安全警报被否决。

## 7. 未覆盖范围

- 未读:`app/api/_lib/email-codes.ts`、`rate-limit.ts`、`route-guards.ts`、`worker/{request-body,anon-cache,lattice-gate}.ts`、`app/api/oauth/*` 路由、`app/oauth/authorize/page.tsx`、`db/schema.ts` 全文与大部分迁移(含产品审核触发器组、wallets CHECK)、`prompts.ts`/`tts`/`image-gen`/`image-cache`/`dag-finalizer`/`feed`、course-inquiry/interject 路由、`Board.tsx`/`lessonScript.ts`/`actions.ts`/`materials.ts`、`studio/**`、`bookshelf/[...slug]`、comments/reports/admin 路由、`android/`。
- 未查:hyperknow-spa 与 android 的依赖;CSS `@import` 与动态 import 的依赖使用;仓库 Actions 外部贡献者审批设置。
- 所有 P2 与疑似项均无运行时证据;实施前应先按各条"实施前先做"复现。

## 8. 建议实施顺序

1. 决定 §0 工作区改动去留,第 1 批补齐 F1/C1/A4 的缺失测试后提交。
2. C2 先复现再修。
3. 第 2 批(P1-T、P1-K 需 SPA 重建;P1-R、P1-U 纯后端)。
4. 第 3 批按模块成组:L2–L4 一个迁移一组测试;A5–A9 一组;H1–H8 一组;W 系列随一次 SPA 构建;M 系列一组。
5. 第 4 批重构每项独立提交,便于回滚。
6. 第 5 批卫生,qa-runs 与未引用脚本先决策。
