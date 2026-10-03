# Hyperknow Agent · 1:1 复刻 agent.hyperknow.io

本模块是对 **Hyperknow.io 学习 Agent**(agent.hyperknow.io / hyperknow.io)的 1:1 完整复刻,
接入造场平台运行。原复刻工程(Node.js Express + WebSocket 独立服务)经协议迁移后原生跑在
Cloudflare Workers 上:三路 WebSocket 改为 SSE/REST,单文件 JSON 库改为 D1,磁盘音频缓存改为
R2。像素级前端以预构建 SPA 挂载在 `/lattice/`(与 `public/product-apps/` 的六个嵌入式产品同
一模式,但为直接访问,非 iframe)。

## 组成

```
hyperknow-spa/                 # 前端源码(React 19 + Vite,独立工程,CI 不安装其依赖;src/lattice/)
  └── 构建产物提交在 public/lattice/(vite base=/lattice/,见其 vite.config.ts)——改 src 必须重构建再提交
app/api/hyperknow/**           # REST + SSE 端点(12 组路由:auth/chat/conversations/course-generation/
                               #   course-inquiry/courses/feed/marketplace/model-check/translate/tts/whiteboard,
                               #   全部 requireMember)
app/api/_lib/hyperknow/        # 16 模块:prompts(纯)/protocol(纯)/config/llm/agents/tts/store/guards/
                               #   credits/dag-finalizer/feed/websearch/image-gen/image-cache/
                               #   image-upload-state/samples
db/schema.ts                   # hk_conversations/hk_courses/hk_whiteboard_sessions(0020)+
                               #   hk_credits 每日积分(0021)/hk_course_tasks 生成任务与断点/image-cache 表
tests/                         # hyperknow-core(纯逻辑)+ suites/11-hyperknow(集成,Wrangler 预览)+
                               #   契约族 lattice-*/whiteboard-*(含讲师提示词教学法不变量、
                               #   白板字幕/引擎、backend 解析器、CSS 健康、DAG 定稿、spa-typecheck 门禁)
```

## 与原复刻工程的协议差异(全部如实声明)

| 原版(Express + ws) | 本模块(Workers) | 说明 |
| --- | --- | --- |
| `WS /api/v1/ws`,事件逐帧 JSON | `POST /api/hyperknow/chat` → SSE(`event: frame`) | 事件序列逐帧一致:conversation_created → credit_status → directorAgent thinking → content_chunk×N → recommend_next_step → complete |
| `WS /api/v1/course-generation/ws` | `POST /api/hyperknow/course-generation` → SSE | 事件序列一致(含装饰性研学 sleep 1.2s/1s) |
| `WS /api/v1/whiteboard/ws`,服务端 setTimeout 链按节奏推步、连接内存存计划 | `POST /api/hyperknow/whiteboard/plan` 一次返回完整计划;播放节奏由客户端适配器驱动(hyperknow-spa/src/lattice/backend.ts `planLectureLive` 拉计划 → whiteboard/liveLesson.ts 转成与演示脚本同构的板书脚本,与服务端 protocol.ts 同一条 `max(4000, 字数×180ms)` 公式;拉取失败/超时静默回退内置演示脚本) | 举手插话改独立 `POST /whiteboard/interject`;答疑后 5s 恢复主线。**顺带修复原版缺陷**:插话恢复后原服务端推进链因 isPaused 标记永久停摆,现从当前步继续推进 |
| TTS 未命中逐块 pipe 流式返回 | 未命中整段合成后返回(≤500 字短文本);命中内存/R2 毫秒级 | Workers 无 waitUntil 挂靠点时后台回填不可靠,取整段换取确定性;`X-Cache: HIT-MEMORY/HIT-R2/MISS` 语义保留 |
| 启动时预热 6 音色试听缓存 | 惰性首次合成(Workers 无常驻启动钩子) | 首次试听慢(上游合成延迟),之后毫秒级 |
| md5 缓存 key | SHA-256(寻址 key,不影响语义) | 内存缓存加 100 条 FIFO 上限(原版无界,isolate 内存 128MB 需守卫) |
| 明文密码注册/伪造 token 假鉴权 | 全部不移植,身份统一走造场登录(requireMember) | `get_user_info` 返回造场成员身份;credits 为装饰性固定值 20/20(仅驱动徽章,无扣减语义) |
| store.json 单文件库(课程/会话无归属过滤) | D1 三表 `hk_*`,归属列 FK members.email | 市场列表只出本人课程 + 2 条官方样例;详情/续聊/插话越权一律 404(不泄露存在性) |

## 上游与配置

LLM 走 **StepFun/Anthropic Messages 协议**(`{base}/messages`,thinking 预算 384(流)/256(JSON),
step-explore 原生协议),`thinking_delta` 增量映射为 directorAgent 思考过程实时展示——与
`reading-ai-provider.ts` 刻意丢弃思维链不同,这是复刻产品的核心语义。TTS 走 StepFun
`/audio/speech`(默认 `stepaudio-3-tts`,StepAudio 3 代;兼容 step-tts 时代的克隆音色与 speed 参数),音色为对官方 6 个真实音频样本克隆所得的 Voice Tone ID
(warm/calm/bright/gentle/firm/lively,见 `tts.ts` 常量)。缓存 key 含模型名,换模型即全量重新合成。
TTS 请求体必须纯 ASCII(`asciiSafeJson` 做 `\u` 转义):上游 WAF 对该路由做字节级内容扫描,
原始 CJK 字节一律 451 `censorship_blocked`(chat/completions 与 /messages 无此层,勿扩大适用)。

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `AI_CHAT_BASE_URL` / `AI_CHAT_API_KEY` | 复用 | 与阅读 AI 共用密钥面;缺任一 → 503 `ai_not_configured`(fail-closed) |
| `HYPERKNOW_AI_BASE_URL` / `HYPERKNOW_AI_API_KEY` | 可选 | 覆盖位:上游与阅读 AI 不同时使用(如专门指向 StepFun) |
| `HYPERKNOW_AI_MODEL` | 可选 | 默认回退 `AI_CHAT_MODEL`,再默认 `step-explore` |
| `HYPERKNOW_TTS_BASE_URL` / `HYPERKNOW_TTS_MODEL` | 可选 | 默认 `https://api.stepfun.com/v1` / `stepaudio-3-tts`(测试注入假上游用) |
| `HK_WEB_SEARCH_PROVIDER` | 可选 | 课程研学供应商(`stepfun`/`tavily`/`brave`/`cloudflare`/`off`);未显式指定时默认优先现有 AI 渠道(`stepfun`),保留显式 Tavily/Brave;为 `off` 时跳过搜索 |
| `HK_WEB_SEARCH_MODEL` | 可选 | 课程研学专用模型(默认 `step-3.7-flash`),仅用于 StepFun web_search 工具调用,不影响其他 LLM |
| `HK_TAVILY_API_KEY`(或 `TAVILY_API_KEY`) | 可选 | 课程生成联网研学:Tavily 供应商密钥 |
| `HK_BRAVE_SEARCH_API_KEY`(或 `BRAVE_SEARCH_API_KEY`) | 可选 | 研学:Brave 供应商密钥 |
| `HK_SEARCH_ACCOUNT_ID` + `HK_SEARCH_API_TOKEN`(或 `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN`) | 可选 | 研学:Cloudflare Web Search 供应商 |
| `HK_WEB_SEARCH_BASE_URL` | 可选 | 外部传统搜索供应商基地址覆盖(测试注入假上游用;StepFun 忽略此项,始终自 AI 渠道配置推导) |
| `HK_IMAGE_ENABLED` | 可选 | 白板按需生图总开关(`true`/`false`,默认 `true`) |
| `HK_IMAGE_MODEL` | 可选 | 阶跃生图模型(默认 `step-image-edit-2`)。**风险提示**: 阶跃官方文档记录旧版生图模型预计于 2026-10-10 停止服务，必须使用 `step-image-edit-2` 且保持可配置 |

注意:上游必须支持 Messages 协议(原复刻版的 OpenAI chat/completions 回退不移植——
"上游必须说 Messages"是显式契约)。

## 按钮接线:复刻界面 → 真实功能

复刻 SPA 里每个可点控件都必须有真实行为或显式失败反馈,不留静默死按钮。实现分三类:

| 类别 | 实现 |
| --- | --- |
| 真实后端能力 | 翻译(`POST /api/hyperknow/translate`,SSE 逐帧、服务端扣 2 积分、余额不足 402);模型探针(`POST /api/hyperknow/model-check`,`max_tokens:16` 的最小 ping,**不计费、不落库**,限流 20/h,只回 `{ok,latency_ms}`);连接面板延迟(ping 真实往返);音频自检(真拉 TTS 样本,量首字节延迟与下载码率,阈值 32 kbps,再真回放);白板课程计划(`POST /api/hyperknow/whiteboard/plan`,板书动作 `card|formula|diagram|image|quick_check`——服务端按 `courseUuid`/`unitId`/`lectureId`/`sessionId` 校验归属权限与精确定位讲次,兼容旧课仅传 `topic`;`diagram` 支持结构化节点边与 Mermaid 子集,失败友好文字降级不显示代码;`quick_check` 落选择题等学员作答;服务端无 AI 密钥时回退话题模板计划,客户端拉取失败回退演示脚本,均不静默卡死);白板按需生图(`POST /api/hyperknow/whiteboard/image`,阶跃星辰生图同步官方规范:n=1,1024x1024,b64_json,prompt<=512,核对 finish_reason;图片不可信限制响应大小、1024x1024像素、MIME魔数检测拒SVG/HTML;复用上传隔离 ClamAV 扫描 fail-closed 入 R2,属主私有缓存;缓存 key 包含模型、参数、版本、课节、用户并发去重,每节最多 1 图,日配额 10 张,总开关 `HK_IMAGE_ENABLED`,不擅改课程 10 积分定价;前端按需配图 pending/ready/failed 状态机、固定比例容器、alt 图注、点击放大 Lightbox、音频有界等待 3.5s、失败文字优雅降级、切课取消请求不串图);课程前置问询(`POST /api/hyperknow/course-inquiry`,3-5 项推荐问询一键推荐继续,必要时最多 2 轮智能追问,限流 30/h,组装版本化 CourseBrief:目标、基础、时间、深度、偏好、语言、视觉);课程大纲质量校验与单元修复(目标/先修/完成标准/项目/测验,DAG 先修无环检测,失败单元最多 1 次 LLM 修复,不模板冒充成功,规模适应主题与时间,6-8 单元仅作参考;蓝图就绪帧 `blueprint_ready` 与检查点恢复/取消/并发幂等锁,严守 10 积分定价);白板举手插话(`POST /api/hyperknow/whiteboard/interject`,按讲座会话与当前 step_id 取上下文答疑;主线声画同步暂停、答案与过渡句回流对话面板并 TTS 朗读、答疑后 5s 恢复;端点不可用给本地可见反馈,不落空);学员称呼(讲座计划/插话提示词与无密钥回退计划的开场白均携带会话成员 displayName,导师旁白/答疑以登录名称呼学员;演示课脚本同步模板化——挂载时绑定登录用户名、开播前等启动身份结算 `bootReady`,匿名/纯静态托管保底录课原版称呼);语音提问(Web Speech API 真转写,答步转写即作答、自由时段转写即插话,不再有 canned 台词);课程市场(`GET /api/hyperknow/marketplace/courses`:本人 D1 课程 + 官方样例,集市页与"我的课程"书架据此渲染,点击本人课程拉 `GET /courses/[uuid]` 详情进真实课程树;不可达回退演示卡);课程生成联网研学(原复刻版 `researching_the_web` 是装饰性 sleep——现真跑搜索:`POST /api/hyperknow/course-generation` 供应商可插拔 StepFun/Tavily/Brave/Cloudflare,默认优先复用现有 AI 渠道的 StepFun Chat Completions 协议 tools:web_search,单次真搜无自动重试;亦支持传统搜索按 3 条派生查询真搜;研学资料以隔离边界明确标记为外部不可信参考而非指令防范注入;搜索未配置时移除假等待假轮数直接跳过,上游失败/超时一律优雅降级为无研学上下文继续生成,不影响积分扣减语义,轮次帧与完成帧的 `sources` 如实计数,不虚报来源);白板课程旁白(每教学步随字幕真声朗读,**音频是时钟**:字幕等起声才起跑、音频播完字幕立即补全、步进等播完才前进,杜绝冷合成延迟下的声画错位与截断;中英文按音节密度分别估窗 180ms/汉字、65ms/英文字符,暂停为同元素断点续播) |
| 浏览器本地能力 | 复制(execCommand 回退)、分享链接(navigator.share 回退剪贴板)、日历 `.ics` 下载、附件/材料/反馈附件上传(`/api/uploads`,visibility=private)、语音输入(Web Speech API 一次性识别)、朗读(TTS 单例)、反馈邮件(mailto) |
| 复刻界面自绘 | 白板导出 JPG/PDF:Canvas 2D 按课堂数据重绘(Caveat/Handlee/Satoshi 用已加载 woff2,2200×1300 世界坐标,第 1/2 页按 x=1100 切分,表格波纹网格、荧光高亮带、红色圈注),非 DOM 截图;PDF 在点击内同步 `window.open` 再写 blob `<img>` 并 `print()` |

未复刻的装饰性按钮统一给可见反馈(顶部 toast 或 `SOON` 徽章),如兑换码、Canvas/Google 日历集成、外部记忆同步、付费档预览。

集市/课程列表每张卡打开**对应课程**的预览与学习旅程(深链 `#/course/preview?topic=…&cover=…`
可分享/直开),不再是固定演示课;进入白板时按当前课程话题实时拉取讲解计划,无课程上下文时
播内置演示课(像素级保真路径)。

## 安全与限流

所有端点 `requireMember`;写端点(chat/plan/interject/course-generation/translate/model-check)加 `assertSameOrigin`;
限流(bucket/每小时):chat 30、tts 120、whiteboard plan 20、interject 30、course-gen 5、translate 60、model-check 20。
答案侧无资金/证据语义,不需要 DB 触发器。白板板书 HTML 由 LLM 生成、前端
`dangerouslySetInnerHTML` 渲染——**复刻原版行为**,如实记录(内容只能由本人触发生成)。

## 重建 SPA

```bash
cd hyperknow-spa && npm install && npm run build   # 产物输出到 ../public/lattice/
```

CI 不安装 hyperknow-spa 依赖、不参与主站 tsc/eslint(tsconfig/eslint 已排除);构建产物
以"预构建静态资产"入库(与 product-apps 同纪律)。

## 2026-09-26 白板与课程的本地修订

- **课程归属**：显式 `resumeUuid/courseUuid` 只用于恢复本人既有任务或课程；不存在或属他人时返回 404。任务与课程 UPSERT 同时核对属主，零行更新作为错误处理。
- **计费幂等**：新任务 UUID 由服务端按会员与显式幂等键确定。同键同请求返回原课程或蓝图；同键不同 query/brief 返回 409。任务持久保存首次扣费键，蓝图确认仍保持 charge=pending，只有完整课程写入后才以原键标记 charge=completed（2026-09-26 用户确认）；历史任务若缺少该映射，仍按旧 UUID 尝试标记，无法据此声称历史账目已修复。历史版本已完成、但没有可确认任务绑定的键会返回 409；调用方需携带原 `resumeUuid` 恢复。
- **课程生成租约**：自动生成和蓝图确认均在生成单元前原子获取任务租约；检查点与最终课程写入核对租约 token。蓝图确认的单元选择首次写入任务，失败恢复沿用已保存选择；显式空选单返回 400，不再解释为“全部”。生成中另一请求返回 409；失败或进程中断留下的过期生成租约可用原 UUID 继续，仍有效的租约不能接管。
- **白板插话与测验**：插话冷却按墙钟计时，不依赖已暂停的授课时钟；主动暂停继续优先。快速测验的文字和语音输入可用选项字母、序号或完整选项内容作答，无法匹配时提示重新选择。
- **配图缓存与租约**：带课程 UUID 的请求须提供能在课程树中精确定位的 `unitId/lectureId/sessionId`；缓存作用域包含完整课程路径，旧式无课程请求按会话或提示词隔离。缓存版本从 `v1` 变为 `v2`，旧缓存不会命中，首次请求可能重新消耗当日生图配额。等待 15 秒后租约仍有效返回 409，不调用上游；仅过期或失败行可接管。上传后若失去租约，不回填缓存；私有资产先删 R2 对象，再删 D1 元数据。`hyperknow_image` 标记随上传元数据先写入；后台认领超过 15 分钟且未引用的 `pending/clean/error/infected` 行。上传完成状态只能在清理令牌为空时写为 `clean`，缓存 finalizer 同样要求令牌为空；这样认领成功后，已开始的上传无法把被扫除对象登记为成功。后台先删最终对象和 `quarantine/` 临时对象，候选若在本轮开始时为终态则两者成功后删除 D1 行；若开始时为 `pending`，即使同一轮转为终态也保留带 15 分钟过期时间的 tombstone，下一轮再扫，以覆盖清理期间迟到的 R2 写入。失败时认领令牌保留到下个重试窗口，已引用的课程缓存不会被认领或清理。若上传进程永久停在 `pending`，D1 tombstone 也会保留并每 15 分钟重试，这是避免迟到对象失去清理标记的代价。
- **Messages 流终态**：流式模型响应只有 `message_delta.stop_reason=end_turn` 后收到 `message_stop` 才视为正常结束；`error`、`max_tokens` 或提前 EOF 抛错，聊天/翻译不应保存或报告半截回复为正常完成。流式请求已输出部分内容后不改用另一协议重放。
- **证据边界**：本地 SQLite 状态测试执行清理、上传完成和缓存 finalizer SQL，断言清理先后竞态、pending tombstone 对迟到 R2 写入的再次清理、最终对象删除未生效、只删除最终对象、R2 两个对象已删而 D1 失败，以及重试后的 D1/R2 最终状态；独立测试还核对 15 分钟和 6 小时 Cron 路由与生产配置一致。缓存租约 45 秒，测试中未来 lease 只用于合成两个 SQL 更新先后顺序，不代表生产可出现的租约时序。这些本地证据不等于 Cloudflare 生产 D1/R2 故障注入或 Worker Cron 实际触发验证。定时 Worker 必须同时具备 `DB` 与 `UPLOADS` 绑定，缺少 `UPLOADS` 时会留下显式 cron 错误日志。

## 2026-10-02 课程创建代理活动流 + 白板教学循证升级

- **课程创建页(CreatePage v2)**：GenerationOverlay 退役,建课全程一条连续 feed(AI 实时问询→检索来源组→蓝图确认门+侧板→逐单元大纲);`POST /api/hyperknow/course-inquiry` 出题一律 AI 实时生成(`COURSE_INQUIRY_PROMPT`+`parseInquiryQuestions`,模板仅上游故障兜底,响应带 `source: ai|template` 供前端区分);问询 maxTokens 4096(混合推理模型先思考后作答,2048 会被推理耗尽致正文空→误降模板)。intake brief 随 course_json 持久化,老课从 hk_course_tasks.brief_json 兜底。
- **讲师上下文注入**:`whiteboard/plan` 路由把全链路课程上下文(课程/单元目标/本讲小节清单/前后讲/课程内位置/brief)组装为 `LectureCourseContext` 注入 planLecture——深度按 overview/systematic/deep 校准、例子贴学员背景、开场承接上一讲收尾预告下一讲、范围锁定本讲目标。
- **WHITEBOARD_INSTRUCTOR_PROMPT v2→v4 演进**:v2 微讲座→10-14 步完整讲座;v3 旁白 3-5 句微结构+卡片 4-6 条+干扰项真实误区;v4 基于四路联网学习科学研究(元分析/教学设计框架/认知负荷与多媒体/启发式与反馈)注入 Teaching Craft 14 则:具体→视觉→抽象、例题渐撤+自我解释提问、快测考回忆非再认且回捞≥2 步+混淆题型交错+终测累计、误区三步反驳、类比映射+失效边界、符号首用即定义、好奇环(开场押预测收尾解答)、间隔回声、解析逐干扰项(铰链题)、反馈只对事不对人、卡片≠旁白逐字稿(Mayer 冗余)、每≤2 步一学员动作、概念落地通则、60 秒教学相长收尾、**旁白语言绝对化**(中文课旁白 100% 中文,禁把指令英文术语漏进 TTS)。教学法不变量由 `tests/whiteboard-caption-sync.test.mjs` Regression 15(讲师契约)与 19(插话苏格拉底距离判据:仅差一步推理才反问且同轮收口)钉住。
- **空正文/预算纪律**(反复出现的故障模式):混合推理模型链式思考计入 max_tokens——planLecture 8192 被思考耗尽→parse Unexpected end of JSON→静默降级 5 步模板课;现 16384+路由超时 130s(冷实例实测 92-100s)。诊断入口:wrangler tail 找 `lecture plan parse failed ... payload head:`(空 head=正文空)。
- **计划管道解析契约**:`planLectureLive`(预热与直取共用解析器)必须透传 quick_check `explanation`(学员答错 UI 反馈的唯一来源)与顶层 `degraded`;预热缓存(planPrefetch)拒存 degraded 计划——开课取不到预热就走正常 POST 给后端重做机会,旁白/配图不为模板课烧配额。契约由 `tests/lattice-backend.test.mjs` 钉住。
- **蓝图/单元螺旋课程**:COURSE_BLUEPRINT_PROMPT/UNIT_GENERATION_PROMPT 要求后续单元在新情境复用早前技能、项目跨单元累积、测验回捞旧单元内容(间隔提取)。

## 2026-10-03 回归审计修复(旧品牌清零/死邮箱/净化括号)

- **品牌清零守卫**:更名时字典「值」与硬编码字面量是两个独立泄漏面,只查其一必漏——`lattice-brand` 现有全源扫(ts/tsx/json/css/html 禁 "Hyperknow"),小写内部标识符(包名/`/api/hyperknow/*` 路径/注释)不受限。字典值里的用户联系邮箱也是品牌面:`contact@/public-mail@hyperknow.io` 是指向外人域名的死通道,真实支持邮箱 `zaochang@aetherstudio.top`(actions.ts SUPPORT_EMAIL)。
- **旁白净化新规**:未配对角括号(孤立「或」)整折——文本内只有一侧有括号即视为配对失败;两侧都在不做过深嵌套推断。模型随机错字(如"传导辑径")无确定性修法,不进净化层。
- **en 简介模板**:`This session opens “{topic}” …`——自由命题话题可能是任意语言,嵌入英文句必须带引号,否则语法不成立且 TTS 逐字念出病句。

## 2026-10-03 白板自由讲座 + 板书观感四修

- **自由讲座(直进 `#/whiteboard`)**:无课程上下文时不再静默播录课复刻演示脚本(教学提示词在这条路径上零作用的根因)——IntroOverlay 命题(输入+芯片)→ `set activeTopic` → 与课程讲次同一 `planLectureLive` 链路;`?topic=` 深链解析/自由话题回写 hash;失败显式重试(planAttempt 点火),degraded 模板再挣一次真实生成;演示课仅作显式兜底(匿名/屡败),匿名学员给登录引导。无课程上下文时讲师提示注入 STANDALONE 独立讲次声明(禁幻影"上一讲")。
- **字幕分句窗口**(`whiteboard/captionWindow.ts` 纯函数):字幕栏只渲染当前窗口——一次至多两句(短句成对 ≤66 字),长句独占(语义最大连贯一句);句终判定排除小数点/连用省略号,右引号随前句;CaptionBar 按揭示游标滑窗,字幕栏 max-height 4.5em 兜底;答错反馈框限高三行可滚动。回归:`tests/whiteboard-caption-window.test.mjs`。
- **公式 KaTeX 排版**(`whiteboard/FormulaBlock.tsx`):formula 动作不再把 LaTeX 源码当等宽文本上板——懒加载 katex 异步 chunk(仅公式出现时下载)+display 排版,throwOnError:false+错误段标红,失败回退等宽源码;**Vite 资产管线原生处理 node_modules CSS 字体**(主站 vinext 需 postbuild 同步,SPA 不需要——两套管线差异别搞混);契约 `tests/build-assets.test.mjs` lattice 段。
- **diagram CJK 测量与折行**:节点盒宽改 `measureText` 逐字真实测量(CJK 17px/拉丁 7.6px/宽窄符分档,此前一律 7.6 致 CJK 盒宽低估一半、文字溢出互压);标签按 `LABEL_MAX_W=158px` 折行(≤3 行,超出省略号),盒随内容;边标签同法。回归:`tests/hyperknow-diagram.test.mjs` CJK 用例。
- **提示词**:禁 ASCII 摆阵(斜杠/管道表格)——矩阵走 formula(pmatrix/bmatrix/cases),流程树走 diagram,表格性文字改每行一条短要点;diagram 节点标签从"单行"放宽为"短语"(渲染器已会折行)。契约:回归 15。
- **旁白净化**(`whiteboard/sanitizeNarration.ts`,观感第五修):模型偶发违反纯口语约定把 `<strong>` 漏进 spoken_text(字幕原样显示、TTS 念出标签名)——liveLesson 适配层一处净化,字幕/面板/TTS 预热/quick_check 题干选项解析全吃同源数据;正则必须窄匹配 `/<\/?[a-zA-Z][^>]*>/`(标签名起始才剥),宽匹配 `/<[^>]*>/` 会误吞数学比较"x < y 且 y > 0"(测试当场抓住)。同轮:`；`;` 计入断句符(实测三四个定义用分号串成一句占三行)。回归:`tests/whiteboard-narration-sanitize.test.mjs`+caption-window 分号用例;lattice-layout 手 mock 依赖白名单需登记新模块。
- **提示词观感两修**(2026-10-03,用户复验两指):①**举例主体**(Teaching Craft 15):不得让学员充当倒霉/尴尬主体(实测"如果你检测结果呈阳性,你真正得病的概率"被用户指冒犯)——负面领域改中立第三方或客观框架,日常中性场景优先;②**图下限**:diagram 1→2 张硬下限+"有序/因果/比较/层级/状态内容画图不堆卡"(实测整讲仅一图)。IAB 真点击复验:例题中性化(质检良品率+游戏 SSR 抽卡)、双图(机制流程图+直觉/贝叶斯对比泳道图)落地。回归 15 换钉。
