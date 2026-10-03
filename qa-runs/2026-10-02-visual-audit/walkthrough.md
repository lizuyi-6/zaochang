# 见界 `/lattice` 线上纯视觉审查 — 走查报告

- Run: `20261002T151754Z-55a07251` / mode **audit**(未修改任何应用源码)
- 目标:`https://aetherstudio.top/lattice/` 生产环境
- 生产版本:审查开始 `6d885ac` → 审查期间推进到 `9a59f77`
- 主观察通道:**视频解析**(按用户明确要求),辅以截图 / console / network / DOM 几何
- 视口:1440×900(细指针)+ 390×844 / 820×1180(`hasTouch`)对照

---

## 结论先说

| # | 发现 | 状态 | 严重度 |
|---|---|---|---|
| F-001 | **白板讲课计划:客户端 65s 超时 < 服务端 130s 预算**,昨晚 `d59be3b` 的修复在冷实例上被浏览器提前掐死 | **confirmed** | **high** |
| F-002 | 建课问询**客户端 20s 主动放弃** → 静默降级模板问卷,而 intake brief 会持久化进课程 | **confirmed** | **medium-high** |
| F-003 | SPA 启动把 `createRoot` 挂在 `prepareI18n().finally()` 上,**无超时** ⇒ 可能永久白屏且不报错、不自愈 | **confirmed**(代码级)+ 1 次实测未复现 | **medium** |
| F-004 | 全新账号下学习动态页是**整月空日历 + 两个空卡片**,无空态引导、无下一步动作 | suspected(任务级) | low |
| F-005 | `wb-intro-close` 白板引入卡关闭键 28×32,**粗指针下也不放大** | confirmed(实测) | low |
| F-006 | Cloudflare Insights beacon 被 CSP 拦(每页固定一条) | dismissed(既有噪声) | informational |
| F-007 | 建课提交按钮「无障碍名」 | **dismissed(我的误判)** | — |
| F-008 | 积分状态「380 credits left」被截断 | **dismissed(我的误判)** | — |

---

## F-001 白板计划:客户端超时短于服务端预算(最高价值)

**cue** —— 昨晚 `d59be3b` 的 commit 正文写着:
> plan 路由超时 110→130s(v4 循证提示词推理链冷实例实测 92-100s)
> **绝不让路由超时把一次成功的计划掐死在半路(掐死=学员拿到模板降级课)**

**failure hypothesis** —— 浏览器端仍有更短的时限,于是「被掐死」这个失败**换了个地方继续发生**。

**观察到的代码事实**

| 位置 | 值 |
|---|---|
| `app/api/hyperknow/whiteboard/plan/route.ts:145-147` | `AbortSignal.timeout(130_000)`,注释「冷实例实测 92-100s」 |
| `hyperknow-spa/src/lattice/whiteboard/WhiteboardPage.tsx:316` | `window.setTimeout(() => ctrl.abort(), 65_000)`,注释「服务端 60s 超时 + 余量」 |
| `hyperknow-spa/src/lattice/backend.ts:506-510` | 计划请求 `signal` 由调用方透传,**无竞争超时** |
| `git show --stat d59be3b` | 改了 `plan/route.ts` / `backend.ts` / `planPrefetch.ts` / 测试 —— **未改 `WhiteboardPage.tsx`** |

**用户后果** —— 冷实例(团队自测 92–100s)下,浏览器 65s 先放弃,用户看不到计划;服务端仍烧到 130s 上游算力。服务端 130s 这个修复**对冷实例实际不生效**。新加的回归测试只钉了解析契约,测不到客户端/服务端时限一致性。

**最小修复方向(仅提案,本轮只读)**
1. `WhiteboardPage.tsx:316` 提到 `>= 135_000`(略高于服务端 130s,留余量),并把注释里的「服务端 60s」改成真实预算;
2. 加一条契约测试:`plan` 路由的 `AbortSignal.timeout` 必须大于所有调用点的客户端 abort 值 —— 这类失配目前**没有任何测试能拦**。

**反证记录** —— 我没有触发部署或压测来复现(只读约束);结论基于源码值 + commit 变更范围 + 服务端注释里的自测数据。若 65s 之上另有 CDN/浏览器层更短超时,需另行确认(我未测)。

---

## F-002 建课问询:20s 客户端放弃 → 静默降级

**cue / 实测**(用户授权的真实建课,指针路径提交,主题「用一句话讲清楚傅里叶变换到底解决了什么问题」)

```
t=13.4s  "✦ Tailoring questions to your topic"(思考态)
t=21.6s / 30.0s  仍在思考(约 17–25s)
t=38.3s  "AI unavailable — standard questionnaire" → 停在模板问卷「等你作答」
```

网络观察者:**零 4xx/5xx**,但 `POST /api/hyperknow/course-inquiry` → `net::ERR_ABORTED`。
= 不是网络故障、不是服务端拒绝,是**客户端主动中止**。

**代码确认**:`CreatePage.tsx:444` `timeoutMs: 20000` → `backend.ts:123` `AbortSignal.timeout(args.timeoutMs ?? 5000)`。注释自称「AI 出题建议 20s+」,但上游是**混合推理**模型,同项目白板链冷实例就要 92–100s。

**用户后果** —— 降级只以一行灰色小字呈现,**无重试入口、无原因说明**;而这份 intake brief 会随课程 JSON 持久化(`92c42fe` 明确把 brief 注入 `planLecture`),于是**模板问卷的产物会静默决定整门课的教学质量**,用户全程不知情。

**正向观察(同时记录)** —— `fbfbf8d2` 做的 `source: ai|template` 如实标注**确实生效**:UI 明确写了 "AI unavailable",没有把降级伪装成 AI 出题。这是对的,修的时候别把它改回去。

---

## F-003 启动门无超时 ⇒ 可能的永久白屏

**一次实测**:逐路由录像中 `#/course/journey` 产出 **11.6s 全空白**视频 + **同轮同样是纯白的截图**(`textLen=0`,`title` 正确,零 console 错误、零失败请求)。视频与截图互相印证,**排除了采集管线错误**。

**判别实验(4 组)**:25s 后同一路由 `textLen=3853`、底色正是暖纸 `rgb(247,241,228)`、侧栏在;无 uuid / 假 uuid / preview / home 四组全部正常。⇒ **不是路由缺陷,是启动未完成**。

**代码机制**(`public/lattice/index.html` + `main.tsx` + `i18n`)

- `index.html`:`#root` 是**空的**,body 底色内联 `#FAFAFA`(≈白);CSS 以 `<link>` 独立加载
- `main.tsx:12-16`:`prepareI18n().catch(...).finally(() => createRoot(...).render(<App/>))`
- `i18n/index.tsx:159-163`:`Promise.all([ensureLocale(lng), ensureLocale('en')])`
- `ensureLocale` → `import('./locales/xx.json')` —— **无超时、无重试、无 abort**

**契约缺口**:`main.tsx:11` 把不变量写成「加载失败仍渲染…**好过白屏**」。代码只对 **reject** 兑现,对 **永不 settle 的 pending** 不兑现:`.catch()` 不触发 → `.finally()` 不触发 → `createRoot` 从不执行 → `#root` 永远空 → 纯白、无报错、无 spinner、**不自愈,只能手动刷新**。正常启动序列确实是 `#FAFAFA → 暖纸`(白板视频 0.0s→0.2s 可见),与失败态同色,所以用户完全无从分辨。

**为何仍记为 confirmed(代码级)**:缺口读代码即可证伪,不依赖复现。症状只观测到 1 次,4 次后续未复现 —— 与「网络停顿型竞态」相符,而非稳定 bug。

**时间线巧合(如实记录,未证成因果)**:录像窗口(15:33–15:45Z)套在 3 次部署(15:33/15:35/15:39Z)上。但 `main` 推进的两个 commit(`23cbc20`/`9a59f77`)**都没有改 `public/lattice`**,所以「资源哈希换血导致 chunk 404」这条解释**不成立**,我据此排除了它。

**最小修复方向(仅提案)**:给 `prepareI18n` 加超时竞速(如 `Promise.race([Promise.all(loads), timeout(2500)])`),让挂起不再能永久阻塞首屏;或直接先 `render` 再补字典(`t()` 本就有英文回退链)。

---

## F-004 学习动态页空态(任务级观察)

`#/feed` 在全新账号(380 credits)下:整月空日历 + Today's To-Dos 空 + Completed 空,**零引导、零下一步动作**。唯一可交互的是「+」和待办输入框。页面在 `56b5013`/`cc22ed7`「做真」之后,对新用户而言与「坏了」无法区分。
**未证成缺陷**:无版本化要求;需产品方裁决「空态是否应给引导」。不自行发明需求。

---

## F-005 / F-006 及其余

- **F-005** `wb-intro-close` 28×32,细指针与粗指针**都不放大**(其余控件在 touch 下从 6→2 变大了)。24×24 AA 仍达标。
- **F-006** 每页固定一条 CSP 报错:`static.cloudflareinsights.com/beacon.min.js` 被 `script-src 'self' 'unsafe-inline'` 拦。审查开始前即存在,非本轮发现。附带后果:**/lattice 的 Cloudflare Web Analytics 没有数据**。
- **被推翻的自身嫌疑(留档)**
  - F-007:以为建课提交按钮无可访问名 → 实为 `title="开始定制"`,是我的 `has-text` 选择器匹配不到 `title`。**采集器局限,非产品缺陷**。
  - F-008:以为「380 credits left」被截断 → 是我从 640px 降采样帧里读错。全分辨率截图显示完整。**降采样不可作为文字判读依据**。

## 触达实测(本轮唯一「差点误控」的地方)

| 模式 | 路由 | 图标控件 | <44px | <24px(AA) |
|---|---|---|---|---|
| 细指针 1440×900 | whiteboard | 14 | 6 | 0 |
| **触屏 390×844** | whiteboard | 14 | **2** | 0 |
| 细指针 1440×900 | create | 3 | 3 | 0 |
| **触屏 390×844** | create | 5 | **2** | 0 |
| 细指针 1440×900 | home | 4 | 4 | 0 |
| **触屏 390×844** | home | 6 | **4** | 0 |

只量桌面细指针的话,我会把「2026-09-18 声称的 44px + 粗指针触屏兜底」误判为**未兑现**。加了 `hasTouch` 对照后,兜底**确实存在**(6→2 / 3→2),WCAG 2.5.8 AA 24×24 在所有模式**全部达标**。该声称成立。

---

## 覆盖与盲区(如实)

**已测**:`/lattice` 15 条 hash 路由逐条录像(12 条主路由 + 2 条 onboarding + signin 深链);一次真实完整建课(命题→AI 出题降级→模板问卷,停在等你作答);一次 4 组首屏判别实验;触达在 3 种指针/视口组合下测量。

**未测 / 受限**
- **白板授课播放(TTS 旁白、板书书写、插话、答题)完全未测** —— `agent@zaochang` 名下**无课程**(集市发现返回空),需先成功建课或注入 fixture 课程
- 移动端**视觉**走查(只测了命中框几何,没看 390px 下的排版)
- 多语言切换后的视觉一致性(UI 现为英文,账户内容中英混排;**无版本化要求,未自行发明缺陷**)
- 视频解析是**采样**而非逐帧,<1s 的帧级瞬态无法判定;录制无 GPU 合成
- 单账号单权限;未测屏幕阅读器(无障碍结论仅来自 DOM 几何与可访问名)
- 建课流程**未推进过蓝图/白板**(需要人工作答,超出「视觉审查」范围)

**Gate:`not_ready`** —— 理由不是发现了阻断级缺陷,而是**旗舰路径(白板授课)零执行证据**,且 F-001/F-002 两个 confirmed 项都落在刚发布的功能主链上。是否接受由产品负责人裁决,我不代签。

**停止原因**:用户限定「只审 /lattice」+「只读」;建课停在交互门;预算内 9 组实验已覆盖四条 charter 的主要风险面,继续投入的预期信息增益下降。
