# Hyperknow Agent · 1:1 复刻 agent.hyperknow.io

本模块是对 **Hyperknow.io 学习 Agent**(agent.hyperknow.io / hyperknow.io)的 1:1 完整复刻,
接入造场平台运行。原复刻工程(Node.js Express + WebSocket 独立服务)经协议迁移后原生跑在
Cloudflare Workers 上:三路 WebSocket 改为 SSE/REST,单文件 JSON 库改为 D1,磁盘音频缓存改为
R2。像素级前端以预构建 SPA 挂载在 `/lattice/`(与 `public/product-apps/` 的六个嵌入式产品同
一模式,但为直接访问,非 iframe)。

## 组成

```
hyperknow-spa/                 # 复刻前端源码(React 19 + Vite,独立工程,CI 不安装其依赖)
  └── 构建产物提交在 public/lattice/(vite base=/lattice/,见其 vite.config.ts)
app/api/hyperknow/**           # REST + SSE 端点(10 条路由,全部 requireMember)
app/api/_lib/hyperknow/        # 移植层:prompts(纯)/protocol(纯)/config/llm/agents/tts/store/guards
db/schema.ts                   # hk_conversations / hk_courses / hk_whiteboard_sessions(迁移 0020)
tests/hyperknow-core.test.mjs  # 纯逻辑单测(SSE 解析/fallback/缓存 key/节奏公式)
tests/suites/11-hyperknow.tests.mjs # 集成套件(真实 Wrangler 预览 + 假 AI/TTS 上游)
```

## 与原复刻工程的协议差异(全部如实声明)

| 原版(Express + ws) | 本模块(Workers) | 说明 |
| --- | --- | --- |
| `WS /api/v1/ws`,事件逐帧 JSON | `POST /api/hyperknow/chat` → SSE(`event: frame`) | 事件序列逐帧一致:conversation_created → credit_status → directorAgent thinking → content_chunk×N → recommend_next_step → complete |
| `WS /api/v1/course-generation/ws` | `POST /api/hyperknow/course-generation` → SSE | 事件序列一致(含装饰性研学 sleep 1.2s/1s) |
| `WS /api/v1/whiteboard/ws`,服务端 setTimeout 链按节奏推步、连接内存存计划 | `POST /api/hyperknow/whiteboard/plan` 一次返回完整计划;播放节奏由客户端适配器驱动(hyperknow-spa/src/services/wsClient.ts,与服务端 protocol.ts 同一条 `max(4000, 字数×180ms)` 公式) | 举手插话改独立 `POST /whiteboard/interject`;答疑后 5s 恢复主线。**顺带修复原版缺陷**:插话恢复后原服务端推进链因 isPaused 标记永久停摆,现从当前步继续推进 |
| TTS 未命中逐块 pipe 流式返回 | 未命中整段合成后返回(≤500 字短文本);命中内存/R2 毫秒级 | Workers 无 waitUntil 挂靠点时后台回填不可靠,取整段换取确定性;`X-Cache: HIT-MEMORY/HIT-R2/MISS` 语义保留 |
| 启动时预热 6 音色试听缓存 | 惰性首次合成(Workers 无常驻启动钩子) | 首次试听慢(上游合成延迟),之后毫秒级 |
| md5 缓存 key | SHA-256(寻址 key,不影响语义) | 内存缓存加 100 条 FIFO 上限(原版无界,isolate 内存 128MB 需守卫) |
| 明文密码注册/伪造 token 假鉴权 | 全部不移植,身份统一走造场登录(requireMember) | `get_user_info` 返回造场成员身份;credits 为装饰性固定值 20/20(仅驱动徽章,无扣减语义) |
| store.json 单文件库(课程/会话无归属过滤) | D1 三表 `hk_*`,归属列 FK members.email | 市场列表只出本人课程 + 2 条官方样例;详情/续聊/插话越权一律 404(不泄露存在性) |

## 上游与配置

LLM 走 **StepFun/Anthropic Messages 协议**(`{base}/messages`,thinking 预算 384(流)/256(JSON),
step-explore 原生协议),`thinking_delta` 增量映射为 directorAgent 思考过程实时展示——与
`reading-ai-provider.ts` 刻意丢弃思维链不同,这是复刻产品的核心语义。TTS 走 StepFun
`/audio/speech`(`step-tts-mini`),音色为对官方 6 个真实音频样本克隆所得的 Voice Tone ID
(warm/calm/bright/gentle/firm/lively,见 `tts.ts` 常量)。

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `AI_CHAT_BASE_URL` / `AI_CHAT_API_KEY` | 复用 | 与阅读 AI 共用密钥面;缺任一 → 503 `ai_not_configured`(fail-closed) |
| `HYPERKNOW_AI_BASE_URL` / `HYPERKNOW_AI_API_KEY` | 可选 | 覆盖位:上游与阅读 AI 不同时使用(如专门指向 StepFun) |
| `HYPERKNOW_AI_MODEL` | 可选 | 默认回退 `AI_CHAT_MODEL`,再默认 `step-explore` |
| `HYPERKNOW_TTS_BASE_URL` / `HYPERKNOW_TTS_MODEL` | 可选 | 默认 `https://api.stepfun.com/v1` / `step-tts-mini`(测试注入假上游用) |

注意:上游必须支持 Messages 协议(原复刻版的 OpenAI chat/completions 回退不移植——
"上游必须说 Messages"是显式契约)。

## 安全与限流

所有端点 `requireMember`;写端点(chat/plan/interject/course-generation)加 `assertSameOrigin`;
限流(bucket/每小时):chat 30、tts 120、whiteboard plan 20、interject 30、course-gen 5。
答案侧无资金/证据语义,不需要 DB 触发器。白板板书 HTML 由 LLM 生成、前端
`dangerouslySetInnerHTML` 渲染——**复刻原版行为**,如实记录(内容只能由本人触发生成)。

## 重建 SPA

```bash
cd hyperknow-spa && npm install && npm run build   # 产物输出到 ../public/lattice/
```

CI 不安装 hyperknow-spa 依赖、不参与主站 tsc/eslint(tsconfig/eslint 已排除);构建产物
以"预构建静态资产"入库(与 product-apps 同纪律)。
