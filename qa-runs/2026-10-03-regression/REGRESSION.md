# 造场上线后回归复查报告

- 日期:2026-10-03
- 目标:`https://aetherstudio.top` 生产环境
- 上一轮:2026-10-02 审查(`qa-runs/2026-10-02-visual-audit`,11 条问题,gate `not_ready`)
- 本次审查基线:`9a59f77` → 之后 **7 个新 commit**
- 模式:**audit,只读**。未修改任何应用源码(唯一的临时改动是**变异测试**,用于验证新守卫是否会变红,每次当场确认写入并立即还原)
- Run:`qa-runs/2026-10-03-regression`

---

## 一、一句话结论

**上一轮 11 条问题:8 项修复全部落地,其中 7 项经线上实测确认修复,1 项(P-003)因需构造挂起态未在运行时触发但源码守卫到位。** 新功能「自由讲座」首次端到端跑通,**上一轮最大的盲区(白板授课播放零证据)已关闭**。新发现 4 条,其中 1 条中等(旧产品名残留)。

---

## 二、逐项回归

| 编号 | 问题 | 源码 | 运行时 | 守卫测试 |
|---|---|---|---|---|
| **P-001** | 白板计划客户端超时 65s < 服务端 130s | ✅ `PLAN_CLIENT_TIMEOUT_MS=135_000` | ✅ **plan 实测 101.6s / 102.8s / 105.3s 三次全部存活** | ✅ **已变异验证** |
| **P-002** | 建课问询 20s 客户端先放弃、静默降级 | ✅ 服务端 55s < 客户端 60s + 重试按钮 | ✅ 200/23.3s,`source: template` 如实标注 | ❌ 无 |
| **P-003** | 启动门无超时 → 永久白屏 | ✅ `LOCALE_LOAD_BUDGET_MS` 3s 放行 | ⚠️ 未触发(需构造挂起态) | ❌ 无 |
| **P-004** | `feed` 裸 catch 把 401 吞成 500 | ✅ 鉴权/限流移出业务 try | ✅ **500 → 401 `auth_required`** | ❌ 无 |
| **P-005** | `oauthJsonError` 不认 `AuthRequiredError` → 500 | ✅ 映射 401 | ✅ **500 → 401 `auth_required`** | ❌ 无 |
| **P-006** | 白板关闭键粗指针 28×32 | ✅ | ✅ 粗指针 <44px 由 2 → **1** | ❌ 无 |
| **P-010** | KaTeX 字体从未进产物 | ✅ postbuild + 契约测试 | ✅ **404 → 200**,dist 内 60 个字体 | ✅ **已变异验证** |
| **P-011** | 收藏/喜欢 toggle 不暴露按下状态 | ✅ | ✅ `aria-pressed="false"` | ❌ 无 |

未修:上一轮的 P-004~P-009 中,**P-007(学习动态页空态)/P-008(CSP 拦 beacon)/P-009(/docs 文案)为低优先级观察项,本轮未处理亦未复现恶化**。

### P-001 的运行时证据(本轮最强的一条)

三次独立冷实例 plan 调用:

```
run A(UI 自由讲座)  t=101.6s  200 application/json
run B(UI 越门禁进讲) t=105.3s  200 application/json
run C(直连 API)      t=102.8s  200 application/json  → degraded:true
```

三次全部落在 100–106s 区间。**旧的 65s 客户端超时会把这三次全部掐死**;新的 135s 常量全部接住。这是 P-001 修复有效性的直接运行时证明,不是纸面推断。

### 变异验证:新守卫不是摆设

我对两个新契约测试做了**反向变异**(必须当场确认变异写入才算有效):

| 测试 | 变异内容 | 结果 |
|---|---|---|
| `whiteboard-plan-budget` | `PLAN_CLIENT_TIMEOUT_MS` 135s → 60s(旧值) | **变红**(1 pass/1 fail),还原后 2/2 |
| `build-assets` | CSS 里的 `KaTeX_Main-Regular.woff2` → 错名 | **变红**(3 pass/1 fail),还原后 4/4 |

> 注:第一次做 `build-assets` 变异时我挑错了 CSS 文件(字母序第一个,而 KaTeX 引用在 `index-*.css`),导致假阴性。已纠正后重做,结论如上。**变异测试只有在变异确实落地时才有意义** —— 这条本身也是本轮的方法论收获。

### 守卫覆盖缺口(建议)

8 项修复中只有 3 项有专门守卫测试。**P-002 与 P-001 是同一族的时限不变量**(55s < 60s、135s > 130s),前者目前是裸的:

```
app/api/hyperknow/course-inquiry/route.ts:259   AbortSignal.timeout(55_000)
hyperknow-spa/src/lattice/pages/CreatePage.tsx:446  timeoutMs: 60_000
```

建议按 `whiteboard-plan-budget` 的做法加一条同类契约。P-003(i18n 预算)、P-006(44px)、P-011(aria-pressed)同样无测试。

---

## 三、新发现

### R-001【中】旧产品名 "Hyperknow" 残留在 8 处用户可见文案

9 月 `fe6e5f6` 更名见界/LATTICE 时,**只改了 i18n 字典的「值」(values 确实已是 Lattice/见界),漏掉了硬编码的 `L()` 字面量**。当前 `hyperknow-spa/src` 仍有:

| 位置 | 泄漏形态 | 状态 |
|---|---|---|
| `lattice/SettingsModal.tsx:242-243` | **账户删除申请邮件正文**「Please delete my **Hyperknow** account…」 | 确定性字面量,代码路径可达 |
| `lattice/boardExport.ts:395` | **导出板书标题**「**Hyperknow** board」 | 确定性字面量 |
| `lattice/actions.ts:161` | 反馈邮件默认主题「**Hyperknow** feedback」 | 确定性字面量 |
| `lattice/whiteboard/WhiteboardPage.tsx:280-281` | 讲座简介正文(中英双变体) | ✅ **运行时实证**(截图可见 "every Hyperknow lesson does") |
| `lattice/data.ts:536`、`lattice/generate.ts:175,254` | 策展人署名 "Hyperknow Official" | ⚠️ **运行时未复现**——在 `/lattice/#/course/preview`、`#/course/journey`、`#/marketplace` 三页均检索 0 次;属潜在项 |
| `lattice/actions.ts:61` | iCal PRODID | 元数据,非界面 |

**为什么值得单独记**:账户删除申请是**数据主体请求**模板,会带着旧产品名发到用户邮箱;导出文件标题同理。用户可见品牌已是「见界 / LATTICE」,内部代号 `hyperknow` 漏到客户端属于品牌一致性问题。

**复现**
```bash
grep -rn "Hyperknow" hyperknow-spa/src --include=*.ts --include=*.tsx | grep -v i18n/locales
# 或直接看线上:打开 https://aetherstudio.top/lattice/#/whiteboard?topic=任意主题
# 简介正文里会出现 "every Hyperknow lesson does"
```

---

### R-002【低-中】自由讲座简介:中文主题被硬拼进英文句子,语法不成立

`WhiteboardPage.tsx:280`:
```js
`This session opens ${targetTopic} the way every Hyperknow lesson does: watch the board take shape, ...`
```

中文主题无引号、无语法适配地嵌入英文句中,线上实际渲染为:

> This session opens **为什么说并发问题的本质是可见性,而不是加锁** the way every Hyperknow lesson does: …

这不是合法英文句。**同一模板的中文变体处理正确**(用「」包裹 + 冒号),英文变体没有对应处理。旁白字幕与 TTS 也用同一份文案,故该句会**被 TTS 逐字念出**。

---

### R-003【低】旁白出现模型输出瑕疵:孤立「未闭合 + 错字

自由讲座首次运行的 TTS 请求文本(逐字解码自 `tts/stream` 的 `text=` 参数):

```
旁白1:造场 Agent，你好！今天我们来深入探索为什么说并发问题的本质是可见性「而不是加锁的核心思维框架。
旁白2:请画流程图，理清为什么说并发问题的本质是可见性「而不是加锁的核心传导辑径。
```

两处问题:
1. 句中出现**孤立的「** 且闭括号 」缺失
2. 「传导**辑**径」应为「传导**路**径」

**已排除净化逻辑**:`sanitizeNarration.ts` 只做三件事——剥 HTML 标签、解 6 个基础实体、收敛空白并去中文标点前空格,**完全不碰 「 / 」**。故这是**模型原始输出**的问题,属提示词/内容质量,不是管线 bug。

旁白是逐字进 TTS 与字幕的,团队今日已为此投入 5 个 commit(`6160566` / `7abb73a` / `36df58e` / `64eb61c` / `34c8bf9`),建议在提示词里显式要求括号配对,或在净化层丢弃未闭合的 `「`。

> 说明:该现象在第 1 次运行的计划里出现,第 3 次(直连 API)未复现,故标注为**单次观测**。

---

### R-004【信息】plan 降级为 5 步模板(1/3 次观测),UI 是否有披露未验证

直连 API 的第 3 次 plan 调用返回:

```
步数 = 5        (v4 契约: 10-14)
mermaid = 0     (今日 36df58e 刚把下限提到 ≥2)
quick_check = 2 (契约: 恰好 3)
degraded = true
```

这是 `92c42fe` 记录的 5 步应急兜底。**UI 侧对此有专门处理**:`WhiteboardPage.tsx:353-360` 在自由讲座模式下若 `plan.degraded` 会**自动再挣一次真实生成**(注释:「用它开讲等于辜负学员命题…此时实例多已预热」),`planPrefetch.ts:120-122` 也拒绝把降级计划入缓存。

**但本轮未能确认两件事**:
1. UI 那两次(101.6s / 105.3s)拿到的计划是否降级 —— 网络日志只见各一次 plan 响应,无第二次,与「重试已触发」相符,也可能第一次就是好计划
2. 若最终仍降级,**学员是否被告知** —— 我的讲课截图未见任何降级提示,但也无从确认那次是否降级

**判为信息项而非缺陷**:降级兜底是设计内行为,且有重试。缺的是「降级是否对学员可见」这一验证,不是已知缺陷。

---

## 四、盲区关闭:白板授课首次真实进入

上一轮 gate 定为 `not_ready` 的首要理由是「白板授课播放零执行证据」。本轮通过新功能「自由讲座」(`#/whiteboard?topic=<主题>`)首次打通:

```
t=0        进入白板,简介卡显示主题 + "Preparing this lecture…"
t≈101-105s plan 200(冷实例,三次均存活)
t≈141s     备课完成,Start learning 由禁用转为可用(选择交互模式后)
t≈143-148s TTS 连续合成 audio/mpeg(200 / 206)
t≈149s     开讲,板书渐进书写,字幕逐字浮现
```

**实证到的能力**:
- 板书**渐进书写**:正文逐段变深、笔尖光标停在书写位置、标题先于正文完成
- 字幕条与 TTS 同步,内容正确
- **手写体中文字体渲染正常**,无豆腐块/回退
- 新增的「How would you like to talk with your tutor?」门禁按设计工作(未选模式时 Start learning 禁用)

**仍未覆盖**:未完整播放一堂课(只到第 1-2 步)、未触发 `quick_check` 答题交互、未观察到 mermaid 图与 KaTeX 公式渲染、未验证字幕分句(≤2 句)与旁白净化在真实播放中的表现。

---

## 五、重录

12 条关键路由重录(`r01`–`r12`),全部 HTTP 200,无 4xx/5xx:

见界 home / create / feed / plans / whiteboard;主站首页 / 书详情 / 章节正文 / 开发者文档 / 产品银河 / 探索 / 产品详情。

**页面级确认 P-010**:书详情与章节正文重录**不再出现任何 KaTeX 404**(上一轮每页 3 条)。

---

## 六、门禁

**`not_ready`** —— 但较上一轮显著收窄。

已消除的上一轮阻断理由:
- ~~旗舰路径零执行证据~~ → 已进入讲课并实证板书/字幕/TTS
- ~~P-001 削弱昨晚修复~~ → 三次冷实例实测存活
- ~~P-002 静默降级~~ → 服务端先降级并如实标注 + 重试按钮

仍持有的理由:
1. **一堂课未完整播放**,`quick_check` 答题交互、mermaid 图、KaTeX 公式、字幕分句均未在真实播放中观察到
2. **R-001(中)未修** —— 旧产品名残留在账户删除申请邮件正文等处
3. **4 项修复无守卫测试**,同类回归可再次无声发生

---

## 附:证据索引

| 文件 | 内容 |
|---|---|
| `evidence/21-free-lecture.json` | 自由讲座第一段:plan 101.6s 存活、TTS 合成、旁白文本 |
| `evidence/22-lecture-play.json` | 越门禁进讲课:plan 105.3s、开讲、板书/字幕 DOM 状态 |
| `evidence/25-plan-contract.json` | 直连 plan 完整响应(步数/图/quick_check/degraded) |
| `evidence/20-regression-dom.json` | P-011 aria-pressed、P-006 三模式命中框 |
| `evidence/24-hypernow-leak-runtime.json` | 旧名运行时检索结果(0 次,策展人未复现) |
| `evidence/23-rerecord.json` | 12 条重录的状态/文本量/观察者 |
| `evidence/30-free-*.png`、`31-play-*.png` | 自由讲座逐帧截图(含板书渐进书写) |
| `evidence/3*.webm` / `.mp4` | 自由讲座与重录录像 |
| `scripts/*.mjs` | 全部可复现脚本(讲课驱动 / DOM 抽查 / 旧名检索 / 重录) |
