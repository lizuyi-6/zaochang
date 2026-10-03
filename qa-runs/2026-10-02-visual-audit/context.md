# QA context

## Target and scope
- Target: `https://aetherstudio.top/lattice/`(见界 LATTICE),生产环境,只读视觉审查
- Run ID / mode: `20261002T151754Z-55a07251` / **audit**(不修改任何应用源码)
- 用户目标:对线上见界做**纯视觉审查**,并明确要求**用视频解析**(而非静态截图)作为主观察通道
- 授权边界(用户在本轮明确给出):
  - 登录入口:用户回答「我同步好了」——即用户**自行完成了 token 轮换与双向同步**;本轮 agent **只读**
  - 范围:**只审见界 `/lattice`**(选项 scope_opt2),不含主站
  - 建课流程:**允许真跑一次完整建课并录全程**(消耗验收号积分 + 真实上游调用)
  - 明确禁令:「不需要你再次轮换,我已经完成轮换了,你只能做只读」
- 排除:主站(造场社区/书架/支付/OAuth)、安卓壳、后台管理写面、任何非 GET 的生产变更
- 测试账号:验收号 `agent@zaochang`(经 `GET /api/admin/visual-session` 一次性 HMAC 票换取的正式会话,provider `email`,30 天)
- 清理计划:票据一次性消费即失效;无数据写入;建课产生的一次 intake 停在「等你作答」,未推进到蓝图/落库

## Environment and capability inventory
- 审查机:Windows / PowerShell,Node ≥22.13,Python 3.14.6
- 浏览器:Playwright 1.58.2(**全局** `npm root`,不在项目 `node_modules`),Chromium 1208,`recordVideo` 产 `.webm`
- 视频解析:`read` 工具**不支持 `.webm`** → 全部经 ffmpeg(libx264, crf 23)转 `.mp4` 后解析;原始 `.webm` 保留为原始捕获
- 视频解析能力已**先证伪后使用**:3s 测试片(带 burn-in 帧号)解析出 0.0/0.2/0.4/0.6s 四帧,帧号 0→12→23→28 与画面时间戳逐一吻合
- 观察通道:Playwright `recordVideo`(主)+ 截图 + console/pageerror + requestfailed + HTTP≥400 + DOM 几何测量
- **缺失/受限通道(必须留在报告里)**:
  - 视频解析是**采样**的,不是逐帧;短于 ~1s 的瞬时帧级问题无法判定
  - 录制期间**无 GPU 合成**,动效观感与真实用户设备不完全等同
  - 本机 DNS 被 VPN 劫持到 `198.18.1.174`(CLAUDE.md 已警告),但透明代理**实测可用**(`/api/community` 返回真实站点数据 4 成员/1 帖子);机器通道 curl 仍按 runbook 走盒子 `--resolve` 到 CF 边缘
  - 未做屏幕阅读器实测;无障碍结论仅来自 DOM 几何与可访问名
  - 单账号单视口,未覆盖多账户/多权限/多语言切换
  - 未测白板授课播放(TTS 旁白/板书书写)——需要已生成课程,而 `agent@zaochang` 名下**无课程**(集市发现返回空)

## Baseline
- 审查开始时 `main` == `github/main` == `6cd23bf`(纯文档台账补账),工作树干净
- 生产部署:审查开始时 production = `6d885ac`;审查期间(15:17–15:39Z)发生 4 次部署,`main` 推进到 `9a59f77`(用户自行处理 token 漂移)
- 已知既有噪声(**非本轮发现**):每页控制台固定一条 CSP 报错 —— `static.cloudflareinsights.com/beacon.min.js` 被 `script-src 'self' 'unsafe-inline'` 拦截
- 已知既有状态(来自 PROJECT_STATUS,非本次验证):混合推理模型 maxTokens 陷阱、断流自愈、SPA 产物入库纪律

## Partial product model
`actor: agent@zaochang(验收号, MAX 档) -> goal: 建课/学习 -> object: 见界 SPA(#/… hash 路由) + 白板讲座 -> state: 12 条 hash 路由 + 建课多阶段(命题→问询→检索→蓝图→大纲) -> side effect: 建课会耗积分并调上游 -> authority: 视觉验收一次性 HMAC 票 -> observation: 视频/截图/console/network/DOM`
信任边界:①机器通道 Bearer → ②一次性票 → ③浏览器正式会话;④客户端 AbortSignal 超时 与 ⑤服务端路由超时 是两条**独立**的时限,本轮发现其失配。

## Expectations and open decisions
- 明确要求(用户):用视频解析做视觉审查;只审 `/lattice`;跑一次完整建课;只读
- 版本化契约(代码内注释,作为可证伪不变量):
  - `hyperknow-spa/src/main.tsx:11` ——「加载失败(极端断网/文件缺失)仍渲染…**好过白屏**」
  - `app/api/hyperknow/whiteboard/plan/route.ts:145` ——「冷实例实测 92-100s:放宽到 130s,**绝不让路由超时把一次成功的计划掐死在半路**」
  - `hyperknow-spa/src/lattice/whiteboard/WhiteboardPage.tsx:316` —— 客户端 abort @65s,注释「服务端 60s 超时 + 余量」
  - `hyperknow-spa/src/lattice/backend.ts:119` ——「AbortSignal 超时;默认 5s,**AI 出题建议 20s+**」
- **未决规则(不自行发明需求)**:UI 全英文而账户内容中英混排 —— 无版本化要求,仅记为观察,是否缺陷需产品方裁决
- 被我**推翻**的自造嫌疑(留档,防止后人对账):建课页提交按钮「无障碍名」——实为 `title="开始定制"`,是我的 `has-text` 选择器匹配不到 `title`,**采集器局限,非产品缺陷**

## Charters and exploration frontier
- C1 视觉呈现:暖色编辑工作室换肤后,各路由是否真的都是暖色一家族、有无漏网冷色/错位/溢出
- C2 首屏与过渡:每条路由从导航到可交互的真实时长;首屏是否白屏/闪烁/无骨架
- C3 降级可观测性:AI 上游不稳时,降级是否被用户看见、是否可恢复
- C4 触达与无障碍:图标控件命中框是否满足声称的 44px + 粗指针兜底
- frontier:`question / state / why now / next`
  - 白板授课播放质量 / 未测 / 名下无课程 / 需先成功建课或注入 fixture 课程
  - 多语言切换后的视觉一致性 / 未测 / 需构造 / 本轮优先级低于已确认项
  - 移动端布局 / 测了命中框几何 / 未做完整视觉走查

## Budget and handoff
- 起始预算 12 个假设驱动实验(quick review 上限 6、深审 24),实际执行 9 组,约四分之一留给反证与复核
- 已执行:①全链路烟测 ②15 路由逐条录像 ③journey 空白页 4 组对照判别 ④完整建课全程(指针路径)⑤图标命中框(细指针)⑥触屏命中框对照(进行中)
- 停止原因:用户限定范围为「只审 /lattice」且「只读」;建课停在等你作答的交互门,继续推进需超出「视觉审查」范围
