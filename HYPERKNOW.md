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
app/api/hyperknow/**           # REST + SSE 端点(12 条路由,全部 requireMember)
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

## 按钮接线:复刻界面 → 真实功能

复刻 SPA 里每个可点控件都必须有真实行为或显式失败反馈,不留静默死按钮。实现分三类:

| 类别 | 实现 |
| --- | --- |
| 真实后端能力 | 翻译(`POST /api/hyperknow/translate`,SSE 逐帧、服务端扣 2 积分、余额不足 402);模型探针(`POST /api/hyperknow/model-check`,`max_tokens:16` 的最小 ping,**不计费、不落库**,限流 20/h,只回 `{ok,latency_ms}`);连接面板延迟(ping 真实往返);音频自检(真拉 TTS 样本,量首字节延迟与下载码率,阈值 32 kbps,再真回放);白板课程旁白(每教学步随字幕真声朗读,**音频是时钟**:字幕等起声才起跑、音频播完字幕立即补全、步进等播完才前进,杜绝冷合成延迟下的声画错位与截断;中英文按音节密度分别估窗 180ms/汉字、65ms/英文字符,暂停为同元素断点续播) |
| 浏览器本地能力 | 复制(execCommand 回退)、分享链接(navigator.share 回退剪贴板)、日历 `.ics` 下载、附件/材料/反馈附件上传(`/api/uploads`,visibility=private)、语音输入(Web Speech API 一次性识别)、朗读(TTS 单例)、反馈邮件(mailto) |
| 复刻界面自绘 | 白板导出 JPG/PDF:Canvas 2D 按课堂数据重绘(Caveat/Handlee/Satoshi 用已加载 woff2,2200×1300 世界坐标,第 1/2 页按 x=1100 切分,表格波纹网格、荧光高亮带、红色圈注),非 DOM 截图;PDF 在点击内同步 `window.open` 再写 blob `<img>` 并 `print()` |

未复刻的装饰性按钮统一给可见反馈(顶部 toast 或 `SOON` 徽章),如兑换码、Canvas/Google 日历集成、外部记忆同步、付费档预览。

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
