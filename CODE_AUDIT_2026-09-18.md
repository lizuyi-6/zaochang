# 项目代码审查报告（重点：见界）

日期：2026-09-18  
基准提交：`304fe30`  
结论：确认 **15 项问题：3 项 P1、12 项 P2**。最优先处理课程跨用户写覆盖、生成积分幂等绕过、白板插话无法自动恢复。现有测试全部通过，但没有覆盖这些触发场景。

本次交付为审查结论，没有实施业务代码修复，没有提交、部署或访问线上业务数据。审查期间工作区出现其他并行工作产生的 `actions.ts`、`WhiteboardPage.tsx` 与 `public/lattice/` 更新，均予以保留；最终行号取自当前工作区。白板关键缺陷在该更新后的版本中再次核实。

## 范围与验证方法

重点深读见界的课程生成两阶段流程、课程/任务存储、积分、SSE、LLM 协议、TTS、图片缓存与租约、聊天会话切换、白板播放/插话/测验、检查点恢复；主站检查认证入口、上传、孵化资料评审，以及授权、账本与产品预审的重要边界。

验证包括现有测试，以及直接转译当前 TypeScript 后执行的本地最小场景。数据库复现使用内存 SQLite、仓库真实迁移和实际存储 SQL；模型、身份及云端存储等外部依赖以本地替身替代。前端复现使用实际组件/函数的逻辑测试，不等同于真实浏览器端到端验收。

| 检查 | 结果 |
| --- | --- |
| `npm test` | 构建成功，344/344 测试通过；隔离本地 D1、假模型/语音/扫描上游 |
| `npm run test:lattice` | 126/126 通过；并行源码变化后再次通过 |
| 根工程 `tsc --noEmit --incremental false` | 通过 |
| SPA app/node 两个 TypeScript 配置 | 通过；最终重新检查 app 配置通过 |
| 根工程 lint | 0 errors，11 warnings |
| SPA lint | 0 errors，8 warnings |
| `git diff --check` | 通过 |
| 根工程生产依赖审计 | 2 项 moderate；无 high/critical，详见文末 |
| SPA 生产依赖审计 | 0 项已知漏洞 |

未进行真实模型/语音供应商、生产部署、真实浏览器交互、Android 原生层的完整验收。未读取密钥文件。测试通过不能替代以下缺失场景的验证。

## P1：优先修复

### 1. 已知其他用户课程 UUID 时，可以越权覆盖其课程和生成任务

位置：[生成路由](X:/zaochang/app/api/hyperknow/course-generation/route.ts:337)、[课程 UPSERT](X:/zaochang/app/api/_lib/hyperknow/store.ts:87)、[任务 UPSERT](X:/zaochang/app/api/_lib/hyperknow/store.ts:171)。

触发：登录用户提交课程生成请求，携带其他用户的 `resumeUuid` 或 `courseUuid`，不走 `confirm_blueprint` 分支。知道 UUID 是前提；未发现可据此枚举任意用户 UUID 的路径。

归属过滤的 `getCourse/getCourseTask` 返回空后，路由没有返回 404，而是继续进入新建流程，并使用客户端给定的 UUID。`createCourseTask` 和 `saveCourse` 的主键冲突更新都没有检查属主。受害者的 `user_email` 保持原值，但课程标题、内容和任务元数据可以被另一用户覆盖。

**本地复现：**执行实际路由、存储函数与迁移，预置受害者课程，再以另一用户请求恢复。返回 HTTP 200 并发出 `course_structure_ready`；以受害者身份读取，课程标题已变为另一用户生成的 `replacement course`，课程属主仍为受害者。任务 query 同样被覆盖。

修复方向：显式恢复请求必须先确认任务/课程归属，否则返回 404；新任务 UUID 由服务器生成。所有相关 UPSERT 增加属主条件，并检查更新结果。补跨用户写入回归测试，不能只验证 GET 详情越权。

### 2. 已完成的幂等键可以为不同的新课程反复免除扣费

位置：[幂等扣费](X:/zaochang/app/api/_lib/hyperknow/credits.ts:177)、[调用扣费](X:/zaochang/app/api/hyperknow/course-generation/route.ts:319)、[新课程 UUID](X:/zaochang/app/api/hyperknow/course-generation/route.ts:337)。

`consumeCreditsIdempotent` 发现当前用户的 key 已 completed 就免扣费放行，但 key 没有绑定原任务 UUID、请求参数摘要或原响应。新请求只要复用已完成 key、不给 `resumeUuid`，就会用新的随机 UUID 创建另一个任务；query 可以完全不同。仍受每小时请求数限制，但课程的 10 积分定价可以绕过。

**本地复现：**实际扣费逻辑将余额从 20 扣至 10 并完成 key。随后对两个不同主题使用同一 key 调用实际生成路由，两次均返回 200、创建不同 UUID 的蓝图任务，余额仍为 10。后续 Stage 2 本身没有再次扣费。

修复方向：建立用户、幂等键、请求摘要、任务 UUID 的持久绑定。重放只能返回原任务/结果；参数不一致必须拒绝，不可只跳过扣款再执行新工作。

### 3. 白板举手插话后，自动恢复等待被自身暂停状态锁住

位置：[暂停感知计时器](X:/zaochang/hyperknow-spa/src/replica/whiteboard/WhiteboardPage.tsx:503)、[插话暂停](X:/zaochang/hyperknow-spa/src/replica/whiteboard/WhiteboardPage.tsx:838)、[恢复前等待](X:/zaochang/hyperknow-spa/src/replica/whiteboard/WhiteboardPage.tsx:860)。

在线课堂插话先执行 `setLessonPaused(true)`，答疑返回后又 `await wait(5000)`，失败时则等待 1500ms。但 `wait` 只在 `ctl.current.paused === false` 时减少剩余时间；解除暂停位于这个 await 后面。于是成功答疑和失败降级都无法自动恢复，必须有额外用户操作解除暂停/跳过，或退出课堂。

**本地复现：**从当前源码提取并执行真实 `wait`、`askTutor` 函数，模拟服务端成功答疑并静音。模拟经过 60,000ms 后仍 `lessonPaused:true`、`askTutorSettled:false`。手动解除暂停后才能完成。

修复方向：插话冷却/答疑音频等待使用独立于主线暂停的时钟；用 `finally` 恢复主线状态，并覆盖答疑成功、失败、取消、用户主动暂停等不同状态。

## P2：见界功能与一致性问题

### 4. Stage 2 没有任务互斥，两次确认会并发生成同一门课

位置：[确认分支](X:/zaochang/app/api/hyperknow/course-generation/route.ts:83)、[单元检查点](X:/zaochang/app/api/_lib/hyperknow/store.ts:267)。

只有 Stage 1 使用积分租约。`confirm_blueprint` 检查任务和已完成课程后直接开始单元生成，没有取得任务租约。多标签页、接口重试或同时恢复可以并发调用模型；检查点则采用读 JSON、修改数组、整串写回的方式，没有版本条件，存在覆盖彼此结果的窗口。

**本地复现：**同一未完成任务并发两次 `confirm_blueprint`，用可控模型阻塞点确认两次均返回 200、同时进入模型生成。释放阻塞后两次均返回课程成功，不是一个执行、另一个 409。检查点 SQL 没有任何租约或版本限制。

修复方向：在任务表原子获取执行租约，更新/续约/完成均校验租约 token；对检查点增加版本或独立单元记录。前端的单组件忙碌守卫无法替代后端互斥。

### 5. Messages SSE 把上游报错、截断和缺少终态当成正常完成

位置：[事件过滤](X:/zaochang/app/api/_lib/hyperknow/protocol.ts:27)、[Messages 流消费](X:/zaochang/app/api/_lib/hyperknow/protocol.ts:38)、[聊天保存与完成](X:/zaochang/app/api/hyperknow/chat/route.ts:176)。

解析器只接受 `content_block_delta`，丢弃 Messages 的 `error`、终止原因及完成事件；流 EOF 时也不验证 `message_stop`。相同异常在 Chat Completions 分支会失败，Messages 分支却正常结束。聊天路由可能把半截回复保存并发送 complete；翻译可能把半截译文当作成功。error-only 流也会被解析为空的正常结束。

**本地复现：**实际解析器分别接受了“partial + overloaded_error”“partial + EOF”“error-only”“max_tokens + message_stop”，全部正常 resolve；Chat Completions 等价错误明确 reject。

修复方向：按 Messages 协议处理 error/stop_reason/终态；EOF 前必须达到有效完成条件，错误或 token 截断不能伪装成功。为两个协议建立对称的异常测试。

### 6. 白板图片缓存缺少课程维度，会把上一门课的图用于另一门课

位置：[图片缓存键](X:/zaochang/app/api/_lib/hyperknow/image-gen.ts:85)、[图片路由参数](X:/zaochang/app/api/hyperknow/whiteboard/image/route.ts:44)、[官方课节编号](X:/zaochang/app/api/_lib/hyperknow/samples.ts:71)。

图片服务仅以用户和 `sessionId` 等生成缓存键，没有课程/单元/讲次维度；图片路由虽然接受并验证课程 UUID，却不把它传入缓存服务。官方社会学、机器学习两门课的第一节都叫 `sess-1-1-1`，生成课的模板编号也会重复。未提供 sessionId 时还统一落入 `global`。

**本地复现：**读取真实官方课程，确认首节 ID 相同。先生成主题 A 的图，再以同一用户、同一局部 sessionId 请求主题 B，实际服务返回 `cached:true` 和 A 的 caption/图片，没有发起 B 的生成。这是同一用户跨课程串图，未发现跨用户图片读取。

修复方向：服务端验证完整课程树定位，并使用稳定的 `user + course + unit + lecture + session` 作用域。无课节上下文的旧路径也必须有明确独立命名空间。

### 7. 配图租约会提前被抢占，并且未取得租约也能进入生成

位置：[租约接管 SQL](X:/zaochang/app/api/_lib/hyperknow/image-gen.ts:195)、[生成入口](X:/zaochang/app/api/_lib/hyperknow/image-gen.ts:221)、[成功回填](X:/zaochang/app/api/_lib/hyperknow/image-gen.ts:294)。

接管条件是 `lease_expires_at <= ? OR status != 'completed'`，pending 状态天然满足后半条件。第二个请求最多等 15 秒，就能抢走仍有效的 45 秒租约。其后没有以 `hasLease` 为门槛阻止未持锁请求调用上游；成功更新也没有 token 条件。

**本地复现：**执行实际服务和 SQL，使用可控时钟模拟等待。第一租约仍有效时已出现两次同时上游调用、两次配额消耗，lease token 被替换，最终产生两个上传对象。

修复方向：仅允许原子接管真正过期/可重试状态；未持锁立即等待/返回冲突，禁止进入生成；成功与失败回填都验证租约 token。

### 8. 翻译在上游首个增量失败时仍扣 2 积分

位置：[先扣费](X:/zaochang/app/api/hyperknow/translate/route.ts:56)、[后预取](X:/zaochang/app/api/hyperknow/translate/route.ts:82)。

翻译先消费积分，再预取模型首个增量。上游认证/网络等错误发生在任何译文输出前，路由直接返回 503，没有恢复余额。聊天端点的顺序是先预取成功、再扣费；这里与声称一致的计费语义不符。

**本地复现：**实际翻译路由，余额 20，首个 generator.next 抛出上游错误。结果 HTTP 503、`ai_upstream_error`，余额 18；执行顺序确认为先扣 2、再预取失败。

修复方向：预取成功后再扣费，或采用可结算/可回滚的扣费记录；余额不足和取消时也要关闭上游请求。

### 9. 切换聊天会话不清理译文，旧翻译继续写入新页面

位置：[翻译调用](X:/zaochang/hyperknow-spa/src/replica/pages/ChatPage.tsx:220)、[译文渲染](X:/zaochang/hyperknow-spa/src/replica/pages/ChatPage.tsx:466)。

主聊天流已具备 abort 和会话守卫，这部分不是缺陷。但翻译以消息数组下标为 key，切换会话既不清空 translations，也不取消 translateLive 或检查会话归属。渲染无条件遍历全部译文。

**本地复现：**执行实际 ChatPage 逻辑，在会话 A 翻译期间切到 B。页面已经显示 B answer，同时还显示 A partial translation；A 请求完成后又显示 A completed translation。已完成译文也会残留。

修复方向：翻译请求绑定会话与稳定消息 ID；切会话/卸载时取消并隔离所有迟到回调，清理当前视图的翻译状态。

### 10. 重新打开生成浮层恢复任务，会丢失原先选择的单元范围

位置：[断点登记](X:/zaochang/hyperknow-spa/src/replica/GenerationOverlay.tsx:132)、[恢复交接](X:/zaochang/hyperknow-spa/src/replica/GenerationOverlay.tsx:217)、[后端空选单处理](X:/zaochang/app/api/hyperknow/course-generation/route.ts:143)。

用户只选择部分单元生成，发生中断后通过“我的课程”的继续入口重新挂载浮层。交接只保留 uuid/query，`selectedUnitIds` 重新初始化为 `[]`，恢复请求就发送空选单。后端把空数组解释为全部蓝图单元；数据库虽有 `selected_units_json`，实际没有写入/恢复选单。

验证：完整核对前端交接、请求参数、后端条件与存储读写。结果是用户取消勾选的单元重新被生成，不是“生成零单元”。此项限定于存在恢复入口且重新挂载浮层的情形；未将“浏览器刷新能保留该入口”当作已实现能力。

修复方向：首次确认时在任务中持久化选单，恢复以服务端记录为准；区分字段缺失、合法空选单和显式新选单。

### 11. 快速测验提示可输入答案，但文字/语音答案没有接入选择题处理器

位置：[提示文案](X:/zaochang/hyperknow-spa/src/replica/whiteboard/Popups.tsx:668)、[文字提交](X:/zaochang/hyperknow-spa/src/replica/whiteboard/WhiteboardPage.tsx:881)、[语音提交](X:/zaochang/hyperknow-spa/src/replica/whiteboard/WhiteboardPage.tsx:905)。

测验等待的是 `choiceResolver`，文字和语音入口却只处理 `answerResolver`。没有普通问答等待时，输入被送进 askTutor。界面中文明确提示“点击一个选项，或直接输入你的答案 / 提问”，实际输入答案不能完成测验，在线课还会触发第 3 项插话问题。

**本地复现：**执行实际 handleSend，预置选择题等待，输入 A。`choicePromiseResolved:false`，`forwardedToTutor:"A"`。

修复方向：测验态识别序号/选项文本并 resolve 正确选项，无法识别时提示选择；区分作答和自由提问。

### 12. TTS 回退模型合成后的缓存无法在后续同样请求命中

位置：[缓存读取键](X:/zaochang/app/api/_lib/hyperknow/tts.ts:56)、[备用模型写入键](X:/zaochang/app/api/_lib/hyperknow/tts.ts:129)。

缓存查询总使用配置模型的 key。若该模型 404 后回退到备用模型，成功音频却存入备用模型 key。下一次相同文本/音色/速度仍只查配置模型 key，再次 404、再次合成备用模型，重复上游成本和等待。

**本地复现：**模拟配置模型 404、备用模型成功，连续两次相同调用都返回 MISS，上游模型序列为“主、备、主、备”，R2 读取键不等于实际写入键。

修复方向：统一有效模型解析与缓存寻址，或维护有期限的回退映射；仍需保证切换实际模型时缓存正确隔离。

## P2：主站问题

### 13. 孵化控制台漏传上传用途，正常上传的材料无法关联项目

位置：[上传表单](X:/zaochang/app/galaxy/incubator/incubation-console.tsx:43)、[默认用途](X:/zaochang/app/api/uploads/route.ts:17)、[项目材料校验](X:/zaochang/app/api/incubation/route.ts:50)。

控制台仅发送 file 与 private visibility，未发送 `purpose=incubation_material`。上传接口默认为 general；后续 add_material 要求 incubation_material，最终返回 409 `material_not_scanned`。文件即使确实已通过扫描，正常界面流程也必然失败，并遗留未关联的上传对象。

**本地复现：**实际 verifyScannedUpload 对属主、私有性、扫描状态、hash 全部正确但 purpose=general 的文件返回 not_scanned；仅改为 incubation_material 即返回 ok。现有集成测试手动设置了正确 purpose，所以没有覆盖真实表单遗漏。

修复方向：控制台补传用途，并对上传成功/项目关联失败提供重试或清理机制；回归测试应从实际表单构造覆盖至关联请求。

### 14. 私有孵化材料没有授权运营读取路径

位置：[私有文件门禁](X:/zaochang/app/api/uploads/[key]/route.ts:38)、[默认拒绝](X:/zaochang/app/api/uploads/[key]/route.ts:57)、[孵化管理接口](X:/zaochang/app/api/admin/incubation/route.ts:8)。

即使修复第 13 项、正确上传并关联 incubation_material，文件下载仍只允许 owner；唯一 reviewer 特例是 product_cover。管理员/授权运营不是属主时仍得到 403。孵化管理 GET 也只返回项目阶段摘要，没有资料列表。控制台“资料进入审核队列”“所有者与授权运营人员开放”的承诺缺少实际可用链路。

验证：核对文件权限完整分支、材料的 private 要求、孵化管理接口。此项是评审流程阻断，不是私有文件泄露，也不建议泛化为“管理员可读所有私有文件”。

修复方向：增加与具体项目、资料关联和运营角色绑定的审核读取授权与资料入口，保留一般私有文件默认拒绝。

### 15. OAuth 启动 GET 仍接收邀请码，敏感值可以进入 URL 历史和访问日志

位置：[GET 读取邀请码](X:/zaochang/app/api/auth/[provider]/start/route.ts:23)。

GET 与 POST 都把邀请码交给相同 OAuth 启动逻辑。用户或接入方通过 `?invitation_code=...` 打开连接入口时，邀请码会出现在请求 URL，可进入浏览器历史、代理/CDN访问日志。这与项目“邀请码只接受 POST”的明确约定不符。

验证：核对实际 GET 参数提取、邀请码验证及状态 cookie 写入路径。响应已经设置 `Referrer-Policy: no-referrer`，因此本报告不声称邀请码会随 Referer 发给 GitHub，也不声称已经发生线上日志泄露。

修复方向：GET 不接受邀请码与相关人机验证参数；敏感邀请码只走 POST 表单并继续执行现有人机验证。

## 依赖公告与已排除的候选

根工程 `npm audit --omit=dev --audit-level=high --prefer-online` 首次遇到 TLS 网络错误，重试成功，报告：

- `baseline-browser-mapping`：moderate，GHSA-w5vr-8v7q-w6rv，非法输入导致进程终止。
- `sanitize-html`：moderate，GHSA-g8qq-57p8-ggw5，SVG SMIL URI-list 清理绕过。

这是依赖公告，不等同于已确认可利用的本站漏洞。当前 Markdown 清理白名单没有放行 SVG/SMIL 标签，未复现该 XSS。未执行 audit fix 或修改锁文件。SPA 的独立生产依赖审计报告 0 漏洞。

其他排除/边界：

- 不把主聊天流“切会话未 abort”列为问题，当前代码已有保护；确认的是独立翻译流。
- 官方样例课程详情已有 getSampleCourse 兜底，不存在先前候选中的必然 404。
- 白板卡片通过文本 run 渲染；图表生成器转义文本。不因出现 dangerouslySetInnerHTML 就断言 XSS；模块文档对此的描述已经落后于实现。
- 未把缺少同源检查但没有实际跨站利用路径的端点列为已确认 CSRF 漏洞。
- 没有将“测试通过”解释为所有权限、账本或并发场景均安全。主站账本、预审和上传扫描有数据库/运行时防线且相关测试通过，本次未在已核对路径确认额外绕过。

## 处理顺序

先修复 1、2、3，再处理课程/图片执行租约与检查点一致性（4、7、10）。随后处理错误完成判定、错图、翻译扣费及会话隔离（5、6、8、9），最后补齐测验输入、语音缓存、孵化资料链路和邀请码入口。每项修复应加入本文触发场景的回归测试；正常 happy-path 用例已经通过，单独增加同类成功路径不能防住这些问题。
