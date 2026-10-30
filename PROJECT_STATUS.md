# 造场项目账本

## 2026-10-30 账户申请页 /apply + 邀请码邮件发放(管理台「账户申请」)(部分完成:本地已验证;上线状态见本条末尾)

- **范围**:公开页 `/apply`(称呼/邮箱/想做什么/作品链接)→ `POST /api/account-applications`(同源、Turnstile 已配置时校验、每 IP 5/h + 每邮箱 3/天 + 全局 200/天;新建/重复待审/已是会员三态统一 202,提交不发任何邮件)→ 表 `account_applications`(迁移 0042)→ 管理台「账户申请」分区:通过/拒绝/重发(换新码)/直接邀请(人类专属)。通过 = 一个 db.batch 原子生成单次 `invitation_codes`(max_uses=1,默认 14 天,1–90)+ 申请置 approved + 审计,三条都以申请当前状态为前提(SQL 抽到 `account-application-sql.ts`);落库后经 `EMAIL` binding 从 zaochang@aetherstudio.top 发模板邮件(`invite-mail.ts`,零 import,管理台预览同函数换占位码)。明文只在邮件里:不进响应/审计/链接。发信失败立即撤销该码并记 `mail_status=failed`;重发撤销未用旧码再发新码。登录页加「还没有邀请码？申请造场账户」入口;站壳免壳名单加 `/apply`;CSP 的 Turnstile 源放行从 `/signin` 扩到 `/apply`(精确匹配)。机器通道能力表加 `PATCH /api/admin/account-applications`。
- **证据**:`tests/account-applications.test.mjs` 14 例(校验分支、模板转义/链接不带码/北京时间、占位码不在真码字母表、邮箱形状与邮箱登录同源、0042 落位与快照链、node:sqlite + 全量迁移构造「两请求都读到待审」时序:落败批次每条 0 行、重发竞态只换一次、已用码不撤不发、拒绝双击只一条审计、DB CHECK/部分唯一索引);集成套件 `tests/suites/20-account-applications.tests.mjs` 9 例(真预览+假邮件上游:邮件里的码哈希=库存→用它邮箱注册成功→uses_count=1→别的邮箱复用 400 `invitation_invalid`;注入发信失败 → 码 revoked 且泄出的明文注册 400 → 重发新码可用;安全矩阵 401/403/缺 origin 403/agent POST 403 `agent_scope_forbidden`;第 6 次提交 429)。变异:删发信失败撤销 → 集成用例变红;删批次 `status='pending'` 前提 → sqlite 用例 2 例变红(**集成并发用例不变红**:本地预览把并发请求串行化,落败者在读取阶段就 409,该用例只作端到端结果断言)。无头 Chrome 截图:/apply 桌面/手机/提交成功态、/signin 入口、管理台预览→确认发送→列表「已通过·邮件已发送」、邮件 640/375/320px(320px 下码单行,溢出断言=0)。`npm test` 981/981、fail 0、skipped 0、todo 0(exit 0);tsc/`git diff --check`/`db:generate` 无漂移 exit 0;lint 排除未跟踪 `tmp/`、已忽略 `promo/` 后 exit 0。顺带修正 `hyperknow-feedback-contract` 把「0041 是最后一条迁移」写死的断言(改为按 tag 定位,语义不变)。
- **已知取舍/未做**:邀请码不绑定申请邮箱(持码即可注册,邮件提示勿转发;绑定需改注册触发器,未做);申请行含个人信息,暂无保留期清理(purge 未接);对已是会员的申请只静默不落库,运营看不到;每 IP 5/h 在共享出口 IP(校园网)下可能误伤;生产邮件到达率/垃圾箱未实测(见下)。

## 2026-10-17 安卓 App「按钮点了没反应」:跳转中反馈 + 卡住整页兜底 + 触屏去重预取(部分完成:本地已验证,未提交/未上线,真机未复验)

- **真机证据**(`wrangler tail` 实时日志,用户 vivo V2426A / Android 16 / WebView Chrome 153,出口 IP 在美国 → App 流量走代理):30 个请求全 200,RSC 服务端 0.35–1.1s;但 01:29:40 点「发现/动态/个人/发布」后直到 01:30:13 才有页面挂载(首个 `/api/community`)≈30s;同一目标每点一次两条 RSC(触屏 pointerenter 预取 + 跳转各一份)。排除项:内核过旧(153)、壳吞触摸(模拟器 WebView 124 真实 `input tap` 4/4 命中按钮)、遮挡(线上 14 页 elementFromPoint 无遮挡,仅 `/galaxy` 加载层首屏挡 3–8s)。
- **根因(最可能)**:App Router 客户端跳转是 React 过渡,RSC 与新路由脚本到齐前旧页面原样不动、零反馈;弱网下就是"点不了",再点又重开跳转。**回退假设**:服务端 `/api/community` 3.2s、`/api/shell-state` 1.6s 偏慢在弱网叠加放大(未处理)。
- **改动**:`app/lib/navigation-pending.ts`(零 import 纯逻辑:目标判定/整页兜底模式/包装 `window.__VINEXT_RSC_NAVIGATE__` 广播开始事件,微任务延后派发以免 setState 并入 `<Link>` 的 startTransition);`app/components/navigation-pending.tsx`(点即出顶部条、离开出发页即收、7s 仍停留则 `location.assign/replace`,traverse 不兜底);`app/layout.tsx` 站壳外挂载;`app/globals.css` `.navigation-pending`(pointer-events:none);`app/components/intent-link.tsx` 触屏/指针聚焦不预取。`instrumentation-client.ts` 方案作废:vinext 0.0.50 只在 Pages Router 入口加载该钩子(`entries/pages-client-entry.js:28`)。
- **证据**:`tests/navigation-pending.test.mjs` 9 例(含 vinext 两处源码钉、产物含广播包装);本地生产构建 + 无头 Chrome 手机视口真实触摸 6 场景连跑 3 次 6/6(点后 120ms 出条;拦截 `.rsc` 永挂时 1s/5s 条在、≈9s 整页落到目标;点当前页不出条;一次点按只发 1 条 RSC);`npm test` 844/844、skipped 0、todo 0;`tsc`/`git diff --check` exit 0;lint 排除既有未跟踪 `tmp/` 与已忽略 `promo/` 后 exit 0。
- **未验证**:用户真机(需部署后复测);兜底整页跳转在真弱网下是否更快;`/galaxy` 加载层遮挡未改;服务端慢接口未优化。

## 2026-10-16 登录二维码改为「立体码」:体素樱花树 ↔ 平面码翻转(本地已验证;用户要求直接部署,随本提交推送 main,上线结果以 CI/部署记录为准)

- **起因**:上一版(`fdf3c92`,下条)上线后用户给出参考图——要的是支付宝式「立体码」:默认一棵斜 45° 的体素樱花树,点「点击查看平面码」相机转到正上方变成可扫的码,另有「改用普通二维码」。上一版的 SVG 花朵码整体被替换。
- **原理**(`app/lib/sakura-qr.ts` 重写,仍零 import):模块矩阵搭成体素园子(地砖/草/树干/树冠),正交投影;正上方看每列最高体素的顶面 = 一个模块。几何先搭完,最后按"每列最高者 × 模块真值"统一上色,树干树枝穿出树冠也只会拿到正确明暗。定位图形区不长树,是三块草坪。平面帧不画斜投影多边形,按模块 `fillRect`(取整到设备像素)+ 四周 3 模块浅色衬底作静区;树形态/转场用画家算法(单位体素按视线深度排序,视向分量全非负时中心深度序正确)。组件 `app/signin/sakura-qr-image.tsx` 改为 canvas:点画面或文字切换(1.1s 相机转场,减少动态效果时直接跳)、普通黑白码同一画布、偏好记在 localStorage(读写失败回落到树)。
- **证据**:①`tests/sakura-qr.test.mjs` 重写为 7 例:从体素列表独立求每列最高者,暗模块顶面亮度 ≤0.15、亮模块 ≥0.8、对比度 ≥4.5:1(24 个 URL:6 token×2 方向×2 域名);组件同一 `drawSakuraQr` 画进软件画布 → jsQR 解出原 URL(24 URL×5 种画布尺寸×樱花/普通两种配色);静区像素全浅;转场 7 个时刻坐标有限且不出画布;落花不出画面;面板/组件契约。变异 4 项:树冠顶面不看真值、去静区 → 各 2 例变红;树冠不限定位区、树干误标 top → 不变红(前者花团本就够不到定位区,后者不改变正上方帧)。②真 Chrome 端到端(预览服务器 4179):默认树 → 点开平面码截图 jsQR 解出确认链接 → 普通码同链接 → 刷新后记住平面码 → 手机 confirm 后桌面自动登录落 `/profile`;反向页截图解码 + 配对码 pair 200。③页面截图 4 张 × 12 种拍屏劣化:zxing-cpp / WeChatQRCode / OpenCV 均 48/48。
- **未验证**:真手机摄像头对屏实扫;Safari/Firefox;真实 GPU 浏览器的转场帧率(无头软件渲染每帧约 20–30ms);树形态本身不可扫(设计如此,需点一下)。

## 2026-10-16 登录二维码改为 3D 樱花树样式(已上线 `fdf3c92`;已被上条「立体码」取代,待其上线)

- **上线核对**:`release-gates` 38920785991 success → `deploy-production` 38921191353 success,Worker 版本 `0c47689f-c287-4bcd-ba21-f544cd9a1b7b`;线上 `/signin` 截图四个解码器均解出确认链接。

- **范围**:`/signin` 桌面扫码面板 + `/profile/qr-host` 反向邀请面板共用新渲染器 `app/lib/sakura-qr.ts`(零依赖,本地生成,token 仍不出浏览器)+ `app/signin/sakura-qr-image.tsx`。暗模块 = 深玫红立体樱花(每模块一朵、花心在模块中心),外圈三层花团树冠 + 伞形树干 + 地面;落花是 HTML 合成层动画(SVG 静态,减少动态效果时隐藏)。纠错 M→Q(V5→V7,45 模块),画幅 360px 宽。
- **可扫性证据**:①`tests/sakura-qr.test.mjs` 5 例(模块集合逐一比对、花团不进静区、静区兜底绘制顺序、落花不过码区、sharp 栅格化→jsQR 解出原 URL,6 token×2 方向×2 尺寸);变异 3 项(去兜底矩形/漏画 40% 模块/花团进静区)均被抓红。②草稿矩阵(6 URL×12 种拍屏劣化):WeChatQRCode 144/144、zxing-cpp 144/144;OpenCV 1x 58/72、2x 71/72(同条件旧黑白 Q 码 55/72、72/72)。③真 Chrome 端到端:截屏像素解码→手机会话 confirm→桌面页自动登录落 `/profile`;反向页解码 token+配对码 pair 200。`npm test` 833/833,skipped 0。
- **踩坑记录**:定位图形圆角过大会让严格解码器认不出(圆角 1.9 时 OpenCV 2x 仅 2/72),已压到 0.35/0.18/0.2 并在代码注释钉住上限;静区兜底矩形是承重的(去掉后花团投影渗入静区,jsQR 解不出)。
- **未验证**:真手机摄像头(iOS 相机/微信/安卓系统相机)对着屏幕实扫未做,上线前需人工扫一次;Safari/Firefox 渲染未截图。

## 2026-10-03(六·四)全库代码审查修复:P1×7 + P2 批 + 死代码清簇(已上线,454 测试全绿)

- **审查方式**:两个审查代理并行扫 API 侧/SPA 基础设施,白板管线本人精读;所有重大指控逐条抽验后才修(抓到一处误报:boardExport 的"注解画错位"实为空栈 no-op,降级为死行删除)。审计与审查材料只当线索,方案自定。
- **P1 钱**(`e3ccc27`):①建课失败不退费——新增 `refundCreditCharge`(退当日余额+计费行标 refunded),失败 catch 只在 `charged=true`(本次真扣过费)时退,避免接管重跑双重退费;refunded 行同 key 重试**免费接管**(失败重试不再二次扣 10 分);死代码 `releaseCreditCharge` 删除。②翻译先扣费后探活——扣费移到 `generator.next()` 首帧成功后(对齐 /chat 真实语义),402 返回前 `generator.return()` 收掉已启上游流。
- **P1 路径**:③建课「从检查点恢复生成」是死按钮——cancelToFeed 置 `finishedRef=true` 后恢复按钮守卫直接 return,onClick 先复位;④卸载检查点课程名恒空——空依赖 cleanup 捕获首渲染闭包,`topicRef` 逐渲染同步;⑤课程语言误分——`!startsWith('en')` 把西/韩/印地/乌尔都全当中文课,精确判 zh-CN/zh-TW;⑥**每课授课语言接真**——加入弹窗语言选择器是死 UI(选中文仍按界面语言讲课,与承诺相反),新增 `courseLang.ts` 按课程 UUID 持久化偏好,白板备课/旅程页预热/弹窗默认值三处同源;⑦自由讲座 135s 超时路径漏置失败态——`!aborted` 条件删除(超时 aborted=true 时跳过会放出"开始学习"播话题对不上的演示课),then/catch 两路都无条件置失败;⑧**TTS 预热键错位**——旅程页预热用原始 spoken_text,实播是净化文本,含标签旁白永远 miss(白烧配额+冷启动),预热同走 sanitizeNarration。
- **P2 批**:credits `cost===HK_COURSE_COST?HK_COURSE_COST:HK_COURSE_COST` 陷阱(参数被无视,一律收 10)→ 恒定价签名;402/credit_status 的 `max` 恒 20 → `dailyCreditsFor`(PRO/MAX 看到真额度);`chat()` 思考耗尽空正文静默 `""` → 视为可重试失败走一次 chat/completions 回退(非流式路径的"模板课降级"根因之一);chat-completions SSE 裸 JSON.parse → 坏帧 try/catch 跳过(与 Messages 解析器纪律一致);三处丢弃 Response 不 `body.cancel()` → 显式取消(Workers 连接不泄漏);`CREATE TABLE IF NOT EXISTS` 移出请求热路径(生产 D1 已有表,迁移覆盖已核);idempotencyKey/caption 截 512;chat 模型历史窗口 40 条+落库 200 条上限;veil 280ms 延迟提交改"最新 state+重放 patch"(旧快照覆盖会回滚窗口期并发 set);i18n chunk 失败清 pending 可重试+setLng 失败 toast;Stage2 恢复完成补 `persisted=true`(集市立即失效重拉);startIntake 重置失败/取消/蓝图态(旧警报与新问询同屏互踩);DAG 环修复只修环上单元(10 单元课从 10 次 LLM 降到环上次数,多轮上限 4);nextSteps prompt 带回答摘录(推荐不再与刚讲内容脱节);session React key 用复合 id(重复标题不再撞 key);导航提示 localStorage 读取加 try(隐私模式白屏)。**缓办**:集市/历史列表整包 JSON(消费面真吃完整树,"点开再拉详情"是产品流程变更,单独排期)。
- **安全/加固**:创始人邮箱硬编码 MAX 套餐删除(盒子 env ZAOCHANG_FOUNDER_EMAIL 已覆盖,核过值存在);**评估为健康**:diagram SVG 双层转义(XSS 排除)、限流/租约/扣费 batch 原子性、上传隔离管线、鉴权纪律全抽查通过。
- **死代码清簇**(零消费已逐一 grep 核实):`guards.ts` 整文件、Director Agent 链(directorAnalyzeIntent+DIRECTOR_SYSTEM_PROMPT+buildDirectorUserPrompt)、generateCourse→parseCourseStructure→COURSE_ARCHITECT_PROMPT 链、localizedField、onStep 死参、plan/interject 路由不可达上游错误分支、drawTable 多余 restore、WhiteboardPage 三处 `as any`。保留:stepDurationMs/parseCourseStructure(有测试钉的参考实现对账纯函数)、rawCourse(CoursesPage 真实消费,代理误报)。
- **测试**:+11 契约钉(`tests/hyperknow-hardening.test.mjs`:退费/接管/先探活/历史窗口/空正文回退/坏帧/预热同键/显式失败/恢复解锁/语言分发/每课偏好/veil 合并);free-topic 钉更新为无 `!aborted` 新契约;454/454 全绿;SPA 重建;IAB 冒烟四页(home/create/courses/history)渲染正常。
- **未修遗留**(记录不掩盖):AI 侧性能——每字符 setState 全板重渲染(React.memo 按条目切分,待做)、image-gen 等待者 15s×300ms 轮询白烧(接管必 409,待做)、store 稀疏数组错位(当前不可达,存疑)、租约接管窄竞态(重复生成无重复扣费,可接受);旁白错字类模型随机瑕疵无确定性修法。

## 2026-10-03(六·三)回归审计修复:旧品牌清零(含死邮箱)/en 简介引号/旁白孤立括号/两族守卫(已上线,IAB 复验)

- **分诊原则**:外部回归审计(`qa-runs/2026-10-03-regression`,gate not_ready)只当线索清单,修复方案自定。其 8 项旧账复核全部确认修复(P-001 三次冷实例 100-106s 实测存活);新报 R-001/R-002/R-003 采纳,R-004 判设计内不动(降级重试已有,披露待真降级观测)。其守卫覆盖缺口的建议按自家纪律落地。
- **R-001 旧品牌清零**(`559a8bf`):9 月更名见界/LATTICE 只改了字典值,漏了硬编码字面量——**审计找到 8 处,复查又挖出 23 处**:审计没查字典「值」(输入框提示语残留旧品牌词 ×7 语言)与两个**指向旧域名的死邮箱**(用户联系通道,改真实支持邮箱 zaochang@aetherstudio.top);源码侧账户删除邮件/反馈主题/板书导出标题/策展人署名/iCal PRODID/utm 参数/导出文件名全改;遗留 i18n 键名(共 8 键×7 语言)顺手更名。守卫:lattice-brand 新增**全源扫**(ts/tsx/json/css/html 禁大小写敏感旧品牌词;小写内部标识符/路径不受限)。
- **R-002**:自由讲座 en 简介模板把中文主题裸拼进英文句(`This session opens 贝叶斯…` 语法不成立且进 TTS)→ 引号包裹 `“…”`,zh 变体本就有「」不动。
- **R-003**:模型旁白偶发孤立「(闭括号丢失,单次观测)→ 不采审计建议的提示词软约束,净化层确定性修复:文本内「」仅一侧存在时全折(配对成功不动),narration-sanitize 加 3 用例。审计所报错字"传导辑径"属模型随机笔误,无确定性修法,不追。
- **守卫补齐**:whiteboard-plan-budget 增 inquiry 族断言(服务端降级上限 55s < 客户端 60s,倒挂则客户端 ERR_ABORTED 拿不到真实降级响应——P-002 复发即红)。
- **验证**:443/443(品牌 18 含新扫、预算 +1、净化 +1);IAB:首页文案/自由讲座简介均无旧品牌词,简介实测「本节课用见界的标准方式开启『贝叶斯定理的直觉』」。审计 gate 的首要理由(一堂课未完整播放)我们当日已有完整真点击证据(三道快测全答/双图/KaTeX),较审计自身覆盖更强。

## 2026-10-03(六·二)白板自由讲座(直进即 AI 实时备课)+ 观感四修:字幕分句窗口/公式 KaTeX/图 CJK 测量/禁 ASCII 摆阵(已上线)

- **自由讲座模式**(`64eb61c`,根因修复):用户报"更新大量教学提示词,白板还是老套路"——直进 `#/whiteboard` 无课程上下文时 `liveTopic=null` → 备课 effect 跳过 → **永远播录课的公开演讲演示脚本**,v2→v4 提示词在这条路径上零作用。改为学员命题 → 与课程讲次同一 `planLectureLive` 链路:IntroOverlay 自由讲座变体(话题输入+四枚快捷芯片+CTA),`#/whiteboard?topic=` 深链解析+自由话题回写 hash(刷新/分享不丢命题);备课失败显式「重新备课」重试(planAttempt 点火),**绝不拿话题对不上的演示课冒充**(课程模式维持静默演示双轨);degraded 模板(老套路观感来源)自由讲座里再挣一次真实生成;演示课降为显式兜底出口(匿名体验/屡败逃生),匿名学员给登录引导;直进白板关闭按钮不再跳空旅程页。契约测试 whiteboard-free-topic 8 条锁链路。
- **IAB 实测证据**(真实点击,非单测):命题「博弈论入门」→ 备课 ~40s(热实例)→ 13 步完整讲座:好奇引子(身边谜题)→术语首用即定义(参与者/策略/收益)→例题完整推演(奶茶店价格战收益矩阵)→直觉先行后公式(逐符号定义)→快测回捞例题(旁白"先自己想好答案")→**故意答错 A,解析逐干扰项点名具体混淆**(A 混淆总收益最高与纳什均衡/C 忽略最优反应/D 已验证稳定),任务聚焦无人身评价,v4 全中。
- **观感四修**(`6160566`,用户实测四连指):①**字幕溢出**——整段旁白累积字幕栏,长步六七行溢出屏幕下缘 → `captionWindow.ts` 分句窗口:**一次至多两句**(短句成对≤66 字),长句独占一窗(用户原话"语义最大的最连贯的一句话"),句终判定排除小数点/连用省略号/右引号随前句;字幕栏 max-height 4.5em 兜底,答错反馈框限高三行可滚动(朗读/面板全文不受影响)。②**公式 raw LaTeX**——formula 动作此前把源码当等宽文本上板(`\text` `\iff` 全外露)→ FormulaBlock 懒加载 KaTeX(独立异步 chunk 259KB,仅公式出现时下载)display 排版,throwOnError:false+错误段标红,加载失败回退等宽源码;**Vite 资产管线原生处理 node_modules CSS 字体**(与主站 vinext 需 postbuild 不同),build-assets 契约锁死产物字体引用全部入库。③**图压盖**——diagram 节点盒宽按字符数×7.6px(拉丁标定)估算,CJK 实际 ≈17px/字,盒宽低估一半以上文字溢出互压 → measureText 逐字真实测量(CJK 17/拉丁 7.6/宽窄符分档)+标签 158px 折行(≤3 行超出省略号),盒随内容。④**ASCII 摆阵**——收益矩阵写成斜杠表格进卡片 → 提示词明令禁止 ASCII 表格/矩阵,矩阵走 formula(pmatrix/bmatrix/cases),流程树走 diagram,表格性文字改每行一条短要点(回归 15 加契约)。
- **捎带修复**:自由讲座无课程上下文时讲师提示显式声明 STANDALONE 独立讲次(实测开场白虚构"上一讲"承接);备课页介绍正文跟话题走(不再落回演示课修辞三角文案);`.dev.vars` 发现残留轮换前旧 token(打票 401),已从盒子同值同步——**轮换同步点=CF secret/盒子 env/本地 .dev.vars 三处**(记忆已更)。
- **测试**:+11(caption-window 6/diagram CJK 1/提示词契约 1/字体产物契约 2/free-topic 2),435 全过;SPA 产物已重建。
- **观感六七修·提示词层**(`36df58e`,用户复验两指):①**举例冒犯**——实测贝叶斯讲用"如果你检测结果呈阳性,你真正得病的概率"把学员摆进病人角色 → Teaching Craft 15 举例主体规则:不得让学员充当倒霉/高风险/尴尬主体,负面领域(疾病筛查/债务/失败)改中立第三方(一位体检者/质检员)或客观框架,日常中性场景优先;②**图太少**——实测整讲仅 1 张 mermaid,文字板观感差 → diagram 下限 1→**2**(不足两张即 under-visualized)+有序/因果/比较/层级/状态内容画图不堆卡+自检清单两条;回归 15 换钉。**IAB 真点击复验**(同题贝叶斯重讲):开场改泛化"某个测试结果"、例题全面中性化(质检屏幕良品率完整示例+游戏 SSR 抽卡补全练习,"系统提示 SSR 真概率不到 10%")、**双图落地**(核心机制流程图+直觉 vs 贝叶斯路径对比泳道图,板书长至两页)、三道快测含场景判别交错题(哪条判断逻辑是贝叶斯:天气预报/全仓/牛熊先验+新证据/考公幸存者偏差)、综合检验答对收尾;字幕零标签/KaTeX/图不压盖无回退。残留观察:开场罕见病引入段仍轻度第二人称("你拿到阳性证据"的分析者视角,不再断言学员患病),冒犯直陈已消除。
- **观感第五修·旁白标签泄漏**(用户截图:字幕栏显示 `<strong>先验概率</strong>` 原文):模型偶发违反"纯口语"约定把 HTML 标签漏进 spoken_text——字幕原样显示、TTS 会把 "strong" 当词读出来。适配层源头净化 `sanitizeNarration`(剥标签/解码实体/收敛空白/中文标点前空格回收),liveLesson 一处接入,字幕/对答面板/TTS 预热/quick_check 题干选项解析全吃同一条净化数据。**首版正则 `/<[^>]*>/` 会把数学比较"x < y 且 y > 0"整段吞掉(新测试当场抓住)**——收窄为 `/<\/?[a-zA-Z][^>]*>/`(标签名起始才剥)。同轮:实测旁白用"；"串三四个定义一句占三行,分号计入断句符(短子句仍被成对逻辑两两合并,窗口不碎)。契约:whiteboard-narration-sanitize 4 条(含真实事故样本+比较符不误吞)+caption-window 分号用例;lattice-layout 手 mock 依赖白名单登记新模块。440/440,SPA 已重建。

## 2026-10-03(六)qa-runs 全站审查修复:超时预算对齐/白屏守卫/错误语义归一/KaTeX 字体/无障碍(已上线,IAB 真实点击验证)

- **背景**:外部审计 `qa-runs/2026-10-02-visual-audit/`(74 页录像+162 次授权边界探针)报 8 项程序缺陷(P-007/008/009 为产品裁决项未动);修复方案自定未照抄文档建议(`b5d5bd9`)。
- **超时预算对齐**(P-001/P-002):白板计划客户端 65s abort 掐死服务端 130s 预算(冷实例 92-100s 实际拿不到)→ 导出 `PLAN_CLIENT_TIMEOUT_MS=135s` 常量+契约测试逐文件扫描禁内联毫秒;建课问询 20s 客户端先于 AI 放弃(ERR_ABORTED 静默模板,brief 持久化进课程)→ **服务端 55s 上限先降级(source 如实标注)+客户端 60s 兜底**(55<60 保证拿到真实降级响应而非本地拼模板),降级行新增「重试 AI 出题」按钮(粗指针 44px)。
- **白屏守卫**(P-003):prepareI18n 字典 chunk 挂起=永久白屏零报错(审计实测 11.6s 空白)→ 每个加载 3s 硬上限,超时放行渲染(translate 回退 en→键名,迟到 import 写 TREES 下一渲染自愈)。
- **错误语义归一**(P-004/P-005):feed 裸 catch 把未登录吞成 500→鉴权/限流移出业务 try 走 jsonError(401/429 如实,13 个 hyperknow 端点最后一个反例清除);oauthJsonError 补 AuthRequiredError→401 映射(authorize 不再把匿名探测记成 server_error,死代码 401 分支复活)。
- **KaTeX 字体**(P-010):@import 只带出 @font-face 声明,字体从未进产物,线上全部公式回退字体→ postbuild 脚本同步 node_modules 字体到 dist/client/assets/fonts+build-assets 契约测试(产物 CSS 每个 url(fonts/…) 必须真实存在,对任意新字体生效)。
- **无障碍**(P-006/P-011):wb-intro-close 粗指针 44px(全站兜底最后一例);产品页收藏/喜欢补 aria-pressed(toggle 语义 WCAG 4.1.2;审计所述"视觉无可辨激活态"实为零状态误读,激活态样式本存在)。
- **验证**:418 测试全过(+4 契约);盒子探针 feed/authorize 匿名 401、KaTeX woff2/ttf 200;IAB 真实点击:建课问询 AI 出题 20.1s 到达无降级、白板冷实例掉模板(设计内)后热实例 AI 计划 29.6s 直达 UI(旁白引用课程标题+学员背景,不再被 65s 掐死)、连续 3 次刷新启动正常。
- **遗留观察**(非本轮引入):白板 hash 直跳 journey 偶发卡「正在加载课程」需刷新自愈(路由边界既有 case);白板冷实例 130s 掉模板对首讲体验仍是硬延迟(plan 预热管线只在旅程页挂载时触发,直接进讲次不享受)。

## 2026-10-02(五)课程创建页重做为代理活动流 + 白板教学循证升级 v2→v4 + 计划管道两处真 bug 修复(已上线,生产实网验证)

- **CreatePage v2 代理活动流**(`284d1cd`):GenerationOverlay 整体退役,建课全程一条连续 feed 讲完——命题气泡→「询问学习需求」步骤条(AI 实时出题,`3c47539` 修问询 maxTokens 2048→4096 推理耗尽空正文+`source: ai|template` 区分真 AI/模板兜底)→逐题作答(单选 pill+其他…+跳过/提交,未答提交才套推荐值)→「搜索课程大纲」网络检索来源组→蓝图卡确认门(不自动弹侧板,`d289ec7`)→侧板单元树计费勾选→确认后逐单元展开;底部条取消生成保留 feed 恢复卡(`3618364`),Courses 页断点路由到创建页接管;shell.css gen-* 死样式清除。
- **讲课细腻度 v3**(`92c42fe`):白板讲师不再看题讲课——plan 路由组装全链路上下文(课程标题/简介/targetLearner/intake brief(老课从生成任务 brief_json 兜底)/单元目标/本讲小节清单/前后讲与课程内位置)注入 planLecture;提示词升级:深度按 overview/systematic/deep 校准、例子贴学员背景、开场承接上一讲收尾预告下一讲、旁白 3-5 句微结构、卡片 4-6 条、mermaid 节点用学科词汇、quick_check 干扰项真实误区。空正文修复(`89d0339`):混合推理模型把 8192 maxTokens 全耗在思考上→正文空→parse 报 Unexpected end of JSON→静默降级 5 步模板课;planLecture maxTokens 16384+路由超时 110s。
- **循证教学 v4**(`f63b8f6`/`cc99bea`/`68381c3`):四路联网检索学习科学(有效学习技术元分析 Dunlosky/Roediger/Cepeda/Rohrer、教学设计框架 Merrill/Gagné/Rosenshine/Bloom、认知负荷与多媒体 Sweller/Mayer/Chi/Fiorella、启发式与反馈 Rowe/Wiliam/Kluger&DeNisi/Kapur/Bjork),Teaching Craft 14 则熔进讲师提示词:具体→视觉→抽象消退序、例题渐撤(首例全解嵌自我解释提问+次例留关键步补全)、快测考回忆非再认且回捞≥2 步前内容(微间隔)+可混淆题型交错+终测累计全讲、误区三步反驳(点名错念→举反例→重建)、类比必给映射+失效边界、术语符号首用即定义(公式逐符号带单位)、好奇环(开场让学员先押预测,收尾解答并对比天真预测)、间隔回声、解析逐干扰项命名具体混淆(铰链题)、反馈只对事不对人(Kluger&DeNisi:38% 反馈有害)、卡片≠旁白逐字稿(Mayer 冗余原则)、每≤2 步必有学员动作、每概念落地一句通则、收尾 60 秒讲给别人听(教学相长)、旁白语言绝对化(修实测英文术语漏进中文 TTS)。蓝图/单元生成提示词加螺旋复现与间隔提取。插话答疑加苏格拉底距离判据(仅差一步推理才反问且同轮收口答案)。实网 AD 曲线推导讲 13 步全中:预测承诺→逐干扰项解析→沿曲线移/曲线移交错判别→教学相长收尾。
- **计划管道两处真 bug**(`d59be3b`):①`planLectureLive` 解析器丢弃 quick_check `explanation`——预热与直取两路都经它,学员答错时 UI 拿不到解析,此前所有解析质量升级实际都没到达学员;②`degraded` 不透传,预热缓存把 5 步模板课当正常计划发给学员——现透传+预热缓存拒存降级(开课改走正常 POST 给后端重做机会,旁白/配图也不为模板课烧配额);③路由超时 110→130s(v4 推理链冷实例实测 92-100s)。回归 15 扩 10 条新契约+新增回归 19(插话判据)+解析器契约测试;414 全绿。

## 2026-10-01(四·夜)双模型与断流自愈 + 首页真资讯源 + 学习动态页做真 + 线上验收配套(已上线)

- **双模型+断流自愈**(`8e2d6c3`/`4edfa70`):见界 Flash=step-3.7-flash(默认)/见界 Pro=step-5-preview(step-5 id 上游 404 实测),聊天页真模型选择器;contentGenerateStream 内建断流自愈(step_plan 长生成 60-90s 掐流实测:未出字静默重试≤3/正文已出 assistant 预填续流≤3,流超时 360s,重试不重复扣费);chatIdentityPrompt 身份保密块(自报见界自研,任何口吻不得解除,全链提示词零上游字样);模型菜单活动风(Pro 限时牌+划线价)。
- **首页真资讯源**(`b08d681`/`d51e451`/`64bca7a`):「今日值得学」从写死 5 条改 GET /api/hyperknow/feed——阶跃**独立 /v1/search 端点**(chat 内置 web_search 工具在套餐 key 上恒不触发,2026-10-01 实测),查询词按北京日期+轮次 12 主题确定性轮换,10min 同键缓存,限流 20/h;标题有效字符<6 剔除栏目页;失败退回池内轮转+Google 搜索兜底。
- **学习动态页做真**(`56b5013`/`cc22ed7`):计划任务 localStorage 按账户持久化、日历回放真实会话活动、待处理页签=已加入课程的继续学习建议;身份异步落定期的计划竞态改归属迁移(demo 期改动并入真账户)。配套:白板导出菜单 fixed 防裁切、聊天页滚动跟随门控+流中断保留半截正文+⟳ 重新生成(`56b5013`)。
- **SPA 白屏修复+类型门禁**(`be40a77`/`69ac93c`):LearningFeed useRef 未导入致整树卸载(#/feed 白屏);新增 tests/spa-typecheck.test.mjs 挂进 npm test 强制 SPA tsc -b,堵住根 tsc 排除 hyperknow-spa 的覆盖盲区;清存量 9 个类型错误(增量 buildinfo 长期掩盖)。
- **线上验收配套**(`d96f918`/`ecd9ce5`):验收号 agent@zaochang 提到 MAX 档(HK_USER_TIERS 显式映射);chat 请求体 GBK 兜底解码(终端 936 码页字节救回,浏览器 fetch 不受影响)。

## 2026-10-01(四)「暖色编辑工作室」全站视觉重构 + Admin 机器通道 + 视觉验收入场票 + 见界体验大修(34 提交,已上线)

- **全站视觉重构「暖色编辑工作室」**(`496002e`,依 X:/myui 设计规范):主站动效 hero 指针深度视差+h1 逐字模糊入场+CTA 磁吸(`450cf4a`)、ElasticTabs/RippleButton 铺开(`d06d5dc`)、动效降噪(WCAG 2.2.2 跑马灯 56s+悬停暂停+TickerBand aria-pressed,持续动效只留星芒一处,`1e3a6d5`);**见界并入同家族**(`35d3017`/`f350c34`):token 层暖纸#F7F1E4/墨#241B10/深珊瑚#C24A2E 重定调,src/replica→src/lattice 重命名,设计 token 单一事实源(variables.css 完整色阶,CSS 784 处硬编码→var()),全路由截图验收修 11 处换肤漏网冷色(`e078c1b`);配图缓存 v2(scopeKey+租约/失败重试)+孤儿图 15min 定时清理快照(`68b6c7d`)。
- **Admin API 机器通道**(`bab3636`):线上登录门禁之外的受控管理面——ZAOCHANG_AGENT_TOKEN+AGENT_ADMIN_CAPABILITIES 显式列名(moderation/invitations/incubation PATCH/POST),worker 入口 fail-closed 未列名 403;DELETE/财务/上传/oauth 永不开放;requireAdminOrAgent 双入口原语,人类白名单语义零变化。
- **视觉验收入场票**(`3445e64`,runbook §6):admin token→一次性 HMAC 入场 URL→植入正式会话,打通线上登录门禁(302 /signin)挡住自动化视觉验收的最后一环;10 分钟 TTL 常量时间比对;复用人类登录管线 provider email。配套 next 16.3.4→16.3.8 修 next/og RCE(`062704f`,CI 依赖审计拦截)。
- **见界体验大修**:课程旅程双列塌方(死规则清理留下未闭合注释吞掉 .cj-layout)+lattice-css-health 契约测试(注释状态机扫描 16 个 CSS 文件,`e730c72`);课程生成等待体验「LATTICE ATELIER 课程工坊」全屏接管+真实 SSE 帧驱动阶段时间线+已耗时计时器(`e2731b9`);答疑回复富文本 markup 解析器(零依赖+表格+流式安全半截标签,XSS 免疫 React 元素树,朗读/复制走 markupToPlain,`b40698a`/`caba4a1`,以生产真实 13KB 回复 SSR 预览验证);见界全量 SVG 重绘 v2 封面唯一化引擎(`d57f4de`);**讲座从微讲座升级 10-14 步完整讲座**(WHITEBOARD_INSTRUCTOR_PROMPT v2,`55d1fc7`);直播课板书与旁白脱节根因(引擎回调陈旧闭包绑定首渲染演示课,全回调改 lessonRef.current,`6bb75a1`);答错验收题反馈即讲解自动续课(`9824941`);全站按钮命中测试排查(elementFromPoint 遮挡检测,首页欢迎层每会话只弹一次,`f725678`)。

## 2026-09-18(五)~09-19(六)白板资产预生成 + 见界封面重设计 + 主站/见界 HIG 无障碍 + 首包分包 -72%(已上线)

- **白板预生成管线**(`c2cf8b1`/`5428ad3`):旅程页加入课程即后台生成首讲 plan+预热首两条旁白;整讲旁白错峰预热+配图进课堂前生成(in-flight promise 共享零重复);悬停讲次行 650ms 意图预热任意讲次(预算 4 次/挂载);起声预算 8s→25s 盖真实 TTS 合成 TTFB 修首步被杀静默。
- **见界封面全套重设计**(`2a204fe`):十科专属宝石色底(深浅书架节奏)+大胆几何徽标(三环/双螺旋/决策树/芯片/拱门/终端/侧脸/靶心/问号/钟形曲线)+统一藏书票签名框;社区 CoverImage 裂图兜底(`4eddc7e`)。
- **HIG 无障碍**(`2384d85`/`975517e`):主站焦点环高对比双底+outline:0 不吞焦点/--muted 4.5:1/主控件 44px+粗指针触屏兜底/信息文本字号下限 8px/aria-current;见界侧栏/头部/课程/首页/白板控件 44px+Onboarding 字号下限;**首包分包 -72%**(路由 React.lazy 8 页+locales 按语言拆 chunk 启动只载当前语言+en 兜底,t() 同步 API 不变)。

## 2026-09-06(日)~09-12(六)学习 Agent 并入 main + 全量按钮接线 + /lattice 登录门禁 + 品牌定名「见界」(215→384 测试,已上线)

- **并入与入口**(`2c38d17` merge):feature/hyperknow-agent 合入 main;全站入口(侧栏 AI 徽章/首页 Stage 按钮/悬浮卡片/⌘K,`80ad6c9`);**品牌定名「见界(LATTICE)」**(`fe6e5f6`);wrangler assets run_worker_first(/lattice 先进 Worker 门禁,`02e9049`)。
- **全量按钮接线**(`99a33bb`,26 项契约):翻译 SSE(服务端扣 2 积分/不足 402)、模型探针(不计费/限流 20/h)、白板 Canvas 导出 JPG·PDF、连接面板真实延迟+音频+模型自检、**课程旁白声画同步(音频是时钟:字幕等起声、播完补全、步进等播完;中英文 180ms/65ms 每字符自适应窗口)**;hk_credits 每日积分(迁移 0021)。
- **/lattice 登录门禁**(`36ce617`):未登录 302 /signin via=lattice 变体(GitHub+邮箱验证码双通道共用登录区块);Worker 入口 lattice-gate 纯模块+契约测试。
- **白板/课程质量链**(`4273830`~`83ec1dc`):插话/语音/集市课程接真实端点+旁白称呼绑定登录名+课程生成联网研学;流式终止状态机收紧+课程未知结构安全校验;课程内容中文化大批量完善;课程真实性/深度/语言链路+白板相机布局+字幕死锁修复;LLM 双协议适配+讲座详实阶梯约束+5 步完整兜底;汉字折行与真实高对齐+图文测验遮挡消除;DAG 定稿/字幕同步/布局 LLM 测试套件;动态验收(白板字幕真实时钟/Stage2 可取消/断点跨浮层恢复/市场选课竞态/蓝图 8192 有界重试);旁白预热管线(整段合成 TTFB 超起声上限修复)。

## 2026-09-05(六)学习 Agent 接入:SPA 挂 /lattice + Workers 原生后端(SSE 替代 WS),知序 Lattice 分支退役未合并(本地开发完成,未部署)

- 状态:**分支 `feature/hyperknow-agent`(基于 main `6888155`),本地完成,未 push、未部署**。学习 Agent(流式学习对话/白板授课与举手插话/全自动课程蓝图/多音色 TTS)从早期独立工程(Express + WebSocket + store.json)迁移进造场 Workers 运行时;原计划同位置的知序 Lattice(自适应 AI 课程,`feature/lattice-adaptive-courses` 8 个本地 commit)**不合并、留本地存档**——生产 D1 从未执行 lattice 迁移 0020-0026,无需 DROP 手术。架构文档 `LATTICE.md`,协议差异表/配置变量/已知取舍全部如实记录。
- **后端(`app/api/_lib/hyperknow/` 8 模块 + `app/api/hyperknow/` 10 路由)**:四 Agent(director/content/whiteboard/courseArchitect)与 prompt 集中于纯模块(`prompts.ts`/`protocol.ts` 零 import 可单测);LLM 只说 Anthropic Messages 协议(StepFun step-explore 原生,thinking 预算 384/256),`thinking_delta` 增量映射为 directorAgent 思考实时展示(与 reading-ai-provider 刻意丢思维链相反,是本产品语义);三路 WS → SSE/REST:chat 与 course-generation 逐帧保留既定事件序列(conversation_created → credit_status → thinking → content_chunk → recommend_next_step → complete),白板改无状态化(plan 一次返回全量讲座,播放节奏移交客户端,`max(4000,字数×180ms)` 公式两端同源;顺带修复早期"插话恢复后推进链永久停摆"缺陷);TTS 走 StepFun `step-tts-mini` + 6 个预置 Voice Tone ID,磁盘缓存换 R2 `UPLOADS/tts-cache/` + isolate 内存两级(X-Cache 语义保留,md5→SHA-256,内存加 100 条 FIFO 上限);假鉴权/明文密码不保留,身份统一 requireMember,credits 装饰性 20/20。越权 404 不泄露存在性;限流 chat 30/h、tts 120/h、plan 20/h、interject 30/h、course-gen 5/h;上游协议契约显式化(必须支持 /messages,不保留 OpenAI 回退)。
- **数据模型(迁移 `0020_exotic_the_renegades.sql`)**:`hk_conversations`/`hk_courses`/`hk_whiteboard_sessions` 三表,归属列 FK → members.email(替代原 store.json 无归属单文件库);会话历史 JSON 列与原 conversations 桶同构;市场列表只出本人课程 + 2 条官方样例。`db:generate` 二次运行 no-op 已验。
- **前端接入(`hyperknow-spa/` 独立 Vite 工程 → `public/lattice/` 预构建产物入库)**:前端约 3100 行薄壳整体 vendor,279KB 样式表与类名原样保留;vite `base:'/lattice/'` 产物直出主站 public;28 处 public 资产字符串引用改走 `ASSET_BASE`(import.meta.env.BASE_URL);`wsClient.ts` 三类重写为**同接口适配器**(类名/方法签名/事件 type 序列不变,页面层除白板音频 URL 相对化与 ChatResponse 错误帧解除思考态外零改动);CI 不安装 SPA 依赖、tsconfig/eslint 排除(与 product-apps "预构建产物入库"同纪律)。wrangler assets 实测:`/lattice/` 200、`/lattice` 307 自动补斜杠,无需兜底路由;API 匿名 401 fail-closed 实测通过。
- **测试 198→215(+17)**:纯逻辑单测 `tests/hyperknow-core.test.mjs`(11:SSE 行解析/跨 chunk 断行与坏帧容忍/THinking-text 分流/TTS 净化与 SHA-256 缓存 key 隔离/节奏公式/四 Agent JSON fallback);集成 `tests/suites/11-hyperknow.tests.mjs`(5 个测试体内多断言,真实 Wrangler 预览):chat SSE 全事件序列逐帧断言(thinking 不入正文——假上游两者同文可证伪)、会话落库与归属 404、TTS MISS→HIT-MEMORY 与音色/速度 key 隔离(假 TTS 上游记录请求体断言音色映射)、白板计划 fallback 落库/插话 fallback/他人 404、course-generation 时间线与市场/详情归属隔离。harness 增加 `/v1/audio/speech` 假上游 + `HYPERKNOW_TTS_BASE_URL` var + 迁移 0020 引导。全套 215/215 绿,失败三轮均为测试侧断言笔误(SSE body 被断言消费/对象拼接/标题省略号),按真实行为修正。
- **配置面**:不新增必需 secret——复用 `AI_CHAT_BASE_URL`/`AI_CHAT_API_KEY`;可选覆盖 `HYPERKNOW_AI_BASE_URL`/`HYPERKNOW_AI_API_KEY`/`HYPERKNOW_AI_MODEL`(缺省回落 AI_CHAT_MODEL 再 `step-explore`)+ `HYPERKNOW_TTS_BASE_URL`/`HYPERKNOW_TTS_MODEL`(缺省 stepfun/step-tts-mini),已记入 `CLOUDFLARE_RUNBOOK.md` §2。
- **本轮改动可能引入的新风险**:①SPA 首包 ~846KB(mermaid/cytoscape 静态 import,早期实现为动态分包;当前版已知退化,未在本轮顺手改);②TTS 未命中时整段合成(早期实现逐块 pipe)——首次试听/旁白慢一个上游 RTT,命中后毫秒级不变;③白板板书 HTML 由 LLM 生成、前端 `dangerouslySetInnerHTML` 渲染,如实记录(内容仅本人触发);④`/lattice` 静态页匿名可达,其 API 全部 401,SPA 对未登录用户表现为空态/错误帧(未做登录引导 UI,后续可加)。
- **未覆盖范围/待办**:生产 secrets 未注入 HYPERKNOW 无需动作(复用 AI_CHAT_*);push 与部署待用户确认(沿用发布闸门);生产/staging D1 届时需执行迁移 `0020_exotic_the_renegades.sql`(仅 3 张 hk_* 新表,无重建/无触发器);SPA 构建产物 12MB 入库(REPO 体积增量,与 product-apps 同量级)。

## 2026-08-31(一)全站点击性能优化 + 三轮审查修复:文档元数据/正文拆读、生产 isolate 缓存、/api/shell-state 轻量聚合(已上线,生产复测通过)

- 状态:已上线。8 个 commit(`3a21301`→`6735daf`,26 文件,+635/-162)fast-forward push → ci `release-gates@6735daf`(33355203558)success → deploy `deploy-production`(33355285179)success,Cloudflare version `f81342f4-e7c8-4244-838f-f7e72897c0b7`,部署 SHA 与 CI 通过 SHA 逐字一致。schema/migration/trigger 零变更(`db:generate` 仍 no-op)。
- **性能修复(5 commit)**:①目录/树/面包屑/进度全部改用元数据列查询,正文按 id 单取——docs 表 190 行/790KB 正文不再随每次结构查询整表搬运;②书架书卡、继续阅读、下一章显式 `prefetch`(Vinext `auto` 不覆盖动态路由);③站壳不再按 pathname 整份拉 `/api/community`;④新增 `/api/shell-state` 轻量聚合(公开计数/圈子统计/钱包余额/未读四件,登录侧语义与 /api/community 对齐);⑤生产 isolate 级 60s 文档缓存(APP_ENV 门控,测试/本地仍每请求直读;不缓存任何用户数据,可见性仍按请求判定)。
- **审查修复(3 commit)**:封面/横幅上传此前绕过缓存失效(写作 isolate 继续展示旧图满 TTL)——已接入统一失效;缓存失效与并发读存在旧值回填竞争——缓存核心抽为纯模块 `doc-data-cache.ts`,generation 机制拒绝失效前发起的查询回填;站壳 effect 依赖由 `signedIn` 布尔改为 `member.email`(同页账户 A→B 可区分,渲染期先清空旧账户余额/未读);新增 `shell-state-sync` 事件通道——已读/退款/打赏/解锁/发帖/入退圈成功后站壳主动对账,红点与余额不再滞留到硬刷新;`/api/shell-state` 未读判定只查 `read_notification` 行,不再搬运成员全部行为流水;手工 `workflow_dispatch` 部署补齐与 release-gates 等价门禁(tsc/lint/禁用测试/npm test/diff/schema 漂移/环境隔离/审计),不再能只构建即上线;迁移检查 tag 入账降级限定为 0013-0018 历史六条白名单,其余位置一律 fail-closed。
- **生产实测(IAB 真实浏览器客户端导航)**:书架→《Hello System》封面 2845ms→**1817ms**(RSC 2815ms→779ms);封面→第一章 7616ms→**1645ms**(RSC 6895ms→734ms,负载 13.3KB);`/api/shell-state` 硬加载恰好 1 次(约 570-630ms),路由切换 0 次 `/api/community` 与 0 次重复 shell-state;匿名 shell-state 形状 `{posts, circleStats, wallet:null, hasUnread:false}` 正确;安全头无损(普通页 DENY+frame-ancestors none+HSTS,product-apps SAMEORIGIN),伪造 `oai-authenticated-user-*` 头仍按匿名处理(signedIn:false)。curl 热路径:书架/封面/章节 TTFB 稳定 1.4-1.8s(个别冷 isolate 5-6s 离群仍在)。
- **测试 192→198**:doc-data-cache 命中/TTL/失效/竞争 3 例、docs 写入口失效源级契约、shell-state-sync 事件常量与六派发点契约、迁移 tag 白名单拒绝 2 例、匿名书架可见登录入口断言、shell-state 服务端三态保留。npm test 全绿(198/198),tsc/eslint/diff 干净。
- 本轮改动可能引入的新风险:①生产 isolate 缓存使文档变更对其他 isolate 最多滞后 60s(与匿名边缘缓存同界,有意取舍);②预取链路静态证据齐全(RSC 负载含 `"prefetch":true`、bundle 逻辑完整、nodeEnv=production),但自动化标签页 visibilityState=hidden 会物理冻结 IntersectionObserver/requestIdleCallback,预取的真实网络触发只能在用户可见标签页生效,本轮无法在自动化环境取证;③EWR→SIN 跨洲执行未变,Smart Placement 5/5 采样仍 local-EWR,极端冷启动离群值仍需观察。
- 未覆盖范围:登录态(阅读进度/继续阅读href)生产未实测;APP_ENV=production 的缓存 env 接线未做端到端双 preview 验证(核心逻辑已由纯契约测试覆盖);章节"下一章"预取的点击消费命中率待真实用户环境观察。

## 2026-08-29(十)《Hello System》书封上线:cover + banner 挂载书根节点(已上线,生产复验通过)

- 状态:已上线。assets commit `a3fd9e0`(2 文件)push → ci `release-gates`(33234454853)success → deploy `deploy-production`(33234511587)success;生产 D1 对 `doc:book-hello-system` 一次性 UPDATE `cover_image`/`banner_image`(changes 1)并回读一致。
- 内容:用户提供两张成图(竖版 1055×1491 / 横版 1491×1055),ffmpeg/libwebp 转为 `public/book-covers/hello-system-cover.webp`(900×1272,68.7KB)与 `hello-system-banner.webp`(1491×1055,75KB)——尺寸与 hello-computer 既定 WebP 惯例逐一对齐。
- 机制:生成器 UPSERT 只写 id/slug/parent/title/body 等正文字段,不触碰 cover_image/banner_image,故本次 D1 直改在未来任意正文重发后持续有效(与 hello-computer 同路径);`import-hellosystem.sql` 与 `v1-snapshot.json` 零变更,冻结 78 节点结构不受影响。
- 证据:两资源生产 200 且字节数与仓库一致(68700/75072);书架页 HTML 含卡片封面引用、书主页含 `book-banner` 横幅;headless Chrome 视觉亲验——书架三书卡片并列渲染正常、书主页顶部横幅与左栏小封面正常。
- 本轮改动可能引入的新风险:①纯静态资源 + 单字段 UPDATE,无代码路径变更;②匿名边缘缓存 60s 窗口内书架可能短暂显示旧无封面卡片,本轮验证已在窗口外。
- 未覆盖范围:登录态下"继续阅读"行的 32×38 小封面缩略未单独截图(同一 cover_image 字段,书架卡片已实证)。

## 2026-08-29(九)《Hello System》V1 Final Patch:ch34 BCNF 校正 + ch56 原子性边界 + ch35 EXPLAIN 标注 + appx-F 注释统一 307(已上线,生产复验通过)

- 状态:已上线。patch commit `4ec618a`(5 文件,+88/-11)push → ci `release-gates@4ec618a`(33232264365)success → deploy `deploy-production`(33232323145)success。生产 D1 以围栏感知剥离文件执行 UPSERT 重导(changes 79 / rows_written 390 / 173ms),回读 hello-system 78 节点、全库 190 节点、孤儿节点 0、`reading_progress` 5→5 保全。冻结结构零变更:78 节点/60 章/doc id/slug/`v1-snapshot.json` 全部不变。
- **修复 1(ch34 BCNF)**:删除错误表述“BCNF 进一步消除了主属性对其他非键属性的依赖”,改为正确定义——每个非平凡函数依赖 X→Y 的决定因素 X 必须是超键;明确 3NF 允许右侧主属性例外而 BCNF 不提供该例外。两处绝对化断言改限定口径:“彻底消除三大异常”→“由当前函数依赖结构导致的主要异常已被显著减少或消除”;“保证极高严密性”→“减少一类由函数依赖与冗余引起的异常,不排除并发/一致性/约束建模/业务规则问题”。
- **修复 2(ch56 原子性边界)**:状态机视角问题由“协同完成原子性跃迁”改为“沿调用链依次推进,最终形成一致的业务结果”;状态表后新增【原子性边界说明】——Atomicity 只覆盖数据库事务边界内(UPDATE/INSERT 同提交同回滚),不覆盖浏览器状态/HTTP 传输/响应返回/UI 更新,端到端无统一单一原子事务;COMMIT 成功但响应丢失反例与第50章重试/幂等形成跨章呼应。控制流/数据形态/状态变化三视角结构保持不变。
- **修复 3(ch35 EXPLAIN 标注)**:EXPLAIN 表格前增加教学示例说明(受数据规模/统计信息/MySQL 版本/索引选择/成本模型影响);rows 统一标注为优化器估计口径(“估计需检查约 100 万行”/“估计仅检查 1 行”),表尾补 EXPLAIN ANALYZE 实际执行信息指引。未声称真实扫描行数。
- **修复 4(appx-F 注释统一)**:`page.tsx` 旧层级 URL 注释由“永久 301”更正为实际行为的“兼容重定向(临时 307)”,与 verify-live/账本既有 307 口径统一;重定向行为本身零变更(生产实证仍为 HTTP 307 → 新 URL)。
- **冻结回归测试 39→45**:新增“Final Patch 定点修复回归”组 6 断言——ch34 旧 BCNF 表述与两处绝对化断言禁回潮、BCNF 核心定义完整性(非平凡函数依赖/X→Y/必须为超键)、ch56 三个错误抽象短语禁回潮、ch56 边界说明在位(数据库事务边界/响应丢失/幂等性/第50章呼应+三视角保留)、ch35 教学示例与估计口径标注、appx-F 源码/verify-live/账本无“永久301”且 redirect() 在位。`npm test` = build + 集成 105 + 冻结 45 = **150/150 通过**,tsc/eslint 双净。
- **verify-live 9/9 PASS**:含 ch56 200、附录F 旧 URL HTTP 307 → 新 URL、TOC 77 个非书根节点、附录F 直属书根。生产页面抽查:ch34 新 BCNF 表述在位/旧表述清零,ch35“教学示例说明”与 ch56“原子性边界说明”均在位。
- 本轮改动可能引入的新风险:①仅 3 章正文段落级修订(+约 0.5KB),无结构变更;②D1 对超长 CJK LIKE 模式报 SQLITE_ERROR 7500,生产内容回读校验改用 instr() 规避(仅验证手段,非应用代码);③匿名边缘缓存 60s 窗口内可能短暂滞后,本轮验证已在窗口外。
- 未覆盖范围:60 章未逐章生产走查(冻结测试 45 断言 + 线上 6 页冒烟 + 3 章定点抽查)。

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

## 2026-09-26 见界白板与课程错误修订（部分完成，本地未部署）

- 触发：本轮用户提出“优化见界的代码bug太多了”，并指定“先修白板/课程相关错误”。工作区开始时已有未提交的 SPA、测试、静态产物与审计报告变动；本轮保留这些原有变动，`git diff --stat` 反映整个当前工作区，并非全由本轮产生。
- 基线：`CODE_AUDIT_2026-09-18.md` 记载 15 项问题；本轮开始时 `npm run test:lattice` 为 139/139，但缺少相应反例。现有问题仍需逐项核对，不能以套件绿色推断生产行为。
- 课程归属/计费：`app/api/hyperknow/course-generation/route.ts` 的外来或未知恢复 UUID 返回 404；`app/api/_lib/hyperknow/store.ts` 的课程/任务写入按用户与租约限定，零行更新报错。显式幂等键绑定会员和确定性任务 UUID；同键不同请求返回 409，同请求返回原任务/课程。蓝图确认与自动生成持租约，选择单元存入任务。语义变更:从“客户端 UUID 可以进入新建分支、UPSERT 可覆盖其他属主”改为“显式恢复 UUID 必须属于本人且写入再次核属主”；依据是本轮用户指定优先修课程错误及 2026-09-18 审计第 1 项。语义变更:从“已完成计费键可带新主题新建免费课程”改为“同键同请求只重放原任务、不同请求拒绝”；依据为审计第 2 项。对应行为与兼容性记录于 `LATTICE.md`。
- 课程中断恢复：语义变更:从“进程崩溃后任务停在 generating_units，即使租约已过期也不能重取”改为“过期租约可按原选单继续，未过期租约返回 409”；触发依据为本轮用户的课程错误优先级，以及审计第 4 项要求的并发排他与故障恢复。`LATTICE.md` 已同步。
- 白板：`lessonDelay.ts` 的插话冷却在授课暂停时继续计时；`WhiteboardPage.tsx` 在答疑后按用户主动暂停状态恢复，测验文字/语音经 `choiceInput.ts` 解析成选项，不匹配时明确提示；`actions.ts` 的导师语音恢复只操作导师播放器。语义变更:从“暂停授课也冻结插话恢复等待”改为“插话冷却独立走墙钟，用户主动暂停仍保留”；依据为审计第 3 项及本轮优先修白板要求。文档已记录于 `LATTICE.md`。
- 配图：`whiteboard/image/route.ts` 按课程树定位完整课节；`image-gen.ts` 缓存版本 v1→v2，作用域含课程、单元、讲次和会话；活跃租约阻止重复上游调用，完成缓存回填核对 token/过期时间。语义变更:从“同名局部 session 可跨课程共享缓存、pending 活跃租约可被抢占”改为“全路径隔离、仅失效或失败租约可接管”；依据为审计第 6/7 项。旧缓存不能命中，首次再生图可能增加日配额用量；文档已记录于 `LATTICE.md`。
- 模型流：`protocol.ts` 只有 `message_delta.stop_reason=end_turn` 加 `message_stop` 才接受正常结束；错误帧、`max_tokens` 和 EOF 报错。语义变更:从“半截 Messages 流可正常完成”改为“缺少正常终态时失败”；依据为审计第 5 项及本轮课程生成错误路径核查，文档已记录于 `LATTICE.md`。
- 可复现本地证据：`tests/hyperknow-core.test.mjs` 的 `consumeMessagesSse: partial/error/truncation are not successful terminal states` 在修订前失败(缺少预期拒绝)，修订后定向 38/38、退出码 0；`tests/lattice-llm.test.mjs` 增加 Messages 三类错误不重放断言。最终 `npm test` 退出码 0，367 pass/0 fail/0 cancelled/0 skipped/0 todo（Windows 开发机、local D1、假 AI/扫描/R2）；最终 `npm run test:lattice` 为 145/145、退出码 0；SPA build、根 TypeScript、SPA lint、根 lint、`git diff --check` 退出码均为 0，根 lint 有 6 个 unused warnings。集成断言包括跨用户课程内容不变、同键余额与任务 UUID 不变、二阶段并发 409 和选择恢复、跨课程图片 URL 不相等、有效图片租约不增加上游调用、上传后租约丢失不写缓存。
- 本轮改动可能引入的新风险：应用代码若先于 `0023` 迁移上线，建课 SQL 因缺 `credit_key` 返回 500（本地重建后漏载迁移的预览环境已触发），必须先迁移再切应用；课程任务 16 分钟租约或图片 45 秒租约若实际上游耗时超过期限，完成写入会被拒绝，可能留下已产生的外部费用或私有孤儿对象；缓存 v2 冷启动增加生图用量；Messages 供应商若不发送 `message_delta.stop_reason=end_turn`，现在会明确报错。上传后清理 D1/R2 失败的孤儿对象处理仍是发布阻断级缺口，当前成功清理的 mock 测试不证明真实云端失败路径。
- 计费语义决策（用户本轮明确回复“完整课程生成后”）：语义变更:从“二阶段用 resumeUuid 结算，显式原计费键可能长期 pending”改为“课程任务持久保存 credit_key，完整课程生成后以原键标记 completed；蓝图就绪和二阶段失败时保持 pending”。`db/schema.ts` 新增 nullable `credit_key`，Drizzle 生成迁移 `drizzle/0023_cool_madame_hydra.sql`（`ALTER TABLE hk_course_tasks ADD credit_key text`），测试预览迁移清单同步更新。新增集成反例在旧构建上得到 `actual=pending/expected=completed`（退出码 1）；重建并载入迁移后 `node --experimental-strip-types --test tests/rendered-html.test.mjs` 为 130 pass/0 fail/0 skipped，退出码 0。字段断言证明蓝图就绪/失败时 charge=pending 且余额=10、完整课程落库后 charge=completed 且余额仍=10；最后一次 `npm test` 为 367 pass/0 fail/0 skipped、退出码 0。此变更在生产应用代码前必须先迁移；历史无映射的任务仍用 UUID 兜底，历史账目未批量修复。
- 未覆盖范围：真实 StepFun Messages/TTS/生图供应商与生产 D1/R2、认证浏览器端到端、弱网断流后用户恢复、租约过期时上游仍在执行的外部费用/对象对账，以及审计中的 TTS 回退缓存、翻译计费与会话切换旧译文等路径未验证；`tests/whiteboard-camera.test.mjs` 与 `tests/whiteboard-caption-sync.test.mjs` 的既有脏工作区变更虽被整套执行，未对其全部新增视觉/交互语义做逐项浏览器验收。状态保持“部分完成”，没有提交、推送或部署。


## 2026-10-05 见界手机布局（本地，未部署）

- 状态：部分完成。用户本轮反馈“手机 APP 适配不好，特别是见界”，按网页布局处理；断点 768→1024，聊天/创建去除固定留白、设置/动态单栏、课程动作换行、白板弹窗与插图限制视口，预构建 SPA 重建。
- 本轮证据：静态 Chromium 中英文矩阵 571/571，fail=0、skipped=0，命令 .tmp/run-lattice-mobile-audit.ps1 -BaseUrl http://127.0.0.1:5187/lattice/ 退出码 0；pointer:coarse 补充 5/5，fail=0、skipped=0；最终相关检查 25/25，fail=0、skipped=0；npm run test:lattice 200/200；全量 npm test 538/538（最后纯 CSS 收尾之前），全部退出码 0。
- 没做：未部署、未发 APK；无 adb 设备，真实 WebView/IME/刘海、生产数据长内容、生成失败 UI 未验证。
- 逐文件证据、实际 diff 范围、新风险、未覆盖路径和本轮 SHA256 指纹：[MOBILE_ADAPTATION_2026-10-05.md](MOBILE_ADAPTATION_2026-10-05.md)。


## 2026-10-05 见界手机适配发布请求（发布前）

- 状态：部分完成。用户明确请求部署，按 release-gates → deploy-production 流程。独立复核 More 菜单844×390 inert/越界反例，补丁与621/621静态浏览器断言（fail=0、skipped=0、exit=0）纳入同一提交；最终源npm test 538/538（fail=0、skipped=0、todo=0、exit=0）。
- 本地依赖两次npm ci失败如实保留日志；生产依赖audit total=0；Worker与D1回退锚点见 MOBILE_ADAPTATION_2026-10-05.md。
- 没做：提交时尚未上线，生产浏览器结果待发布后追加；真安卓/WebView/系统IME/刘海未实测，未发APK。


## 2026-10-05 见界手机适配生产结果

- 状态：部分完成（网页发布有证据，真机验收未覆盖）。生产提交b5249eaac932a8d04702702f45f5d18bad2f2cf9在main/github/main；release-gates 37280891500、deploy-production 37281147414均status==completed、conclusion==success、headSha==该SHA，gh命令exit=0。Worker 50a5cb24-809f-435b-b327-ebfff027510a承接100%流量（wrangler deployments list exit=0）。
- 本请求轮次新生产证据：13/13发布文件bytes与SHA256等于提交blob；线上中英文六视口及缩小视口矩阵621/621、failed=0、skipped=0、exit=0。390px输入right=318.703125<=390、paddingLeft==0px，More inert==false且键盘/指针激活后count==0。CI全量538/538、failed=0、skipped=0、todo=0。命题映射、命令、逐文件证据、时间和指纹见 [MOBILE_ADAPTATION_2026-10-05.md](MOBILE_ADAPTATION_2026-10-05.md)生产结果节。
- 没做：未发APK，安卓/iOS真机WebView/IME/刘海、真实生成失败路径、旧缓存跨版本懒加载未实测。新交互取舍：769–1024px抽屉先打开、320px工具栏增行、More使最近活动下移。6条历史迁移仅tag比对无内容hash，非本轮DB改动。
- 发布后账本仅本地追加，未推文档触发重复发版；生产代码提交保持上述SHA。


## 2026-10-05 手机底部导航重构(首页/探索/中央发布/动态/我的)

- 状态:本地完成,未推送未部署。用户验收反馈「首页下面按钮不合理」,线上实测确认:旧栏 首页/探索/书架/圈子+最右端凸起发布钮;书架 Library 图标 20px 下呈柱状信号格易误读;标签 fontSize=8px、tab 热区仅 35px 高;≤900px 断点通知铃铛 display:none,未读红点在手机端完全不可达;无「我的」一级入口。
- 改动:底部栏固定五栏 首页/探索/＋发布(居中凸起)/动态/我的,书架、圈子让位;标签 10px、网格项 align-items:stretch 拉满栏高、激活项加粗;≤900px 恢复通知铃铛(44×44),640px 顶栏列改 auto 容纳铃铛+头像。文件:app/components/site-shell.tsx、app/globals.css、tests/modularization-contracts.test.mjs。
- 证据:npx tsc --noEmit exit=0;npm run lint exit=0;npm test 539/539(fail=0、skipped=0、todo=0,较基线 538 新增 1 条 mobile-nav 契约钉:白名单/渲染顺序/铃铛可见性/字号)。本地 dev(localhost:5200)390×844 实测:发布钮圆心 x=190.5≈栏中心 190、标签 fontSize=10px、tab 热区 72×56、铃铛 44×44 可见;320×640 scrollWidth-clientWidth=0 无横向溢出。
- 没做:未推送未部署;安卓/iOS 真机 WebView 未实测;未登录点「我的」落到既有 /profile 登录引导页,未新增处理;书架降级后手机端入口为首页区块与搜索,未在其他页面新增链接。


## 2026-10-05 手机底部导航重构生产上线(App 走网页增量更新)

- 状态:网页部分已上线;真机未实测。提交 1eb8bb3abf65437bfa0c02444c64cc75ecb0d920 推送 github/main;release-gates run 37297386968、deploy-production run 37297648142 均 conclusion==success(gh run watch --exit-status exit=0),迁移门禁 fail-closed 通过。本次纯网页改动(站壳 tsx + CSS + 契约测试),无原生壳变更,故不发 APK:App WebView 加载线上站点,用户下次打开即增量生效。
- 线上复验(390×844 Chromium,https://aetherstudio.top/):底部五栏 首页(x=10)/探索(82)/＋发布(168,圆心 190.5≈栏中心 190)/动态(226)/我的(298),标签 fontSize=10px,tab 热区 72×56,发布钮 45px 居中凸起;顶栏通知铃铛 display=flex、44×44 恢复可见。与本地 dev 实测一致。
- 没做:安卓/iOS 真机与 WebView 未实测(无连接设备);未登录态点击「我的」走既有 /profile 登录引导页;旧缓存页面跨版本边界未逐一验证。

## 2026-10-05 个人主页手机版式修复 + /app/version 版本页 + 壳 v1.2.2

- 状态:本地完成,待部署。用户真机截图验收:个人主页动作列手机端半宽竖排留白难看;需要单独页面展示当前 App 版本与相关信息。
- 改动:①profile-actions ≤640px 改全宽列表行(46px 高、11px 字),新增「App 与版本」入口;②新页 /app/version:当前安装版本(客户端 UA 识别:ZaochangApp/x.y.z → 已是最新/可更新;旧壳 ≤1.2.1 → 「版本未上报」引导更新;浏览器 → 下载引导)、线上最新版事实、站点构建号、权限与更新机制说明;③壳 v1.2.2(versionCode 6):WebView UA 末尾追加 ZaochangApp/<versionName>(PackageManager 取值,与 versionCode() 同源;不启用 AGP9 默认关闭的 BuildConfig);④app-shell 清单常量抽到 shell-manifest.ts 供路由与页面共用,buildId 2026-10-05.4;⑤APP_DOWNLOAD 常量更新至 1.2.2(sha256 fd507732…,672926 字节),APK 落 public/downloads(旧版本保留可回滚)。
- 证据:tsc --noEmit exit=0;npm run lint exit=0;npm test 542/542(fail=0、skipped=0;新增 UA 三态解析/版本名比较单测、壳-站版本一致性钉、/app/version SSR 断言)。一轮 541/542 的 failure 是本地 dev 服务器与 harness 生产子服务器并发抢资源启动超时,停掉 dev 后复跑全绿。本地 390×844 截图验证 /app/version 浏览器态与 /profile 修复后版式。
- 没做:真机/模拟器装 v1.2.2 实测 UA 上报链,部署后补验;旧壳 legacy 分支仅有单测与源码钉,未做真机截图。

### 补验(同日,部署后)

- 生产:release-gates 37304314716、deploy-production 37304571616 均 success;/api/app-shell 返回 latestVersionCode=6/latestVersionName=1.2.2,APK 直链 200 且 672926 字节与常量一致。线上 390×844 /app/version 浏览器态截图正常。
- 安卓模拟器(sdk_gphone64_x86_64)装 zaochang-1.2.2.apk 签名包,深链进 /app/version:状态卡显示「当前已是最新版 · 造场 App v1.2.2,与线上最新版一致」——壳 UA 标记 → 页面解析 → 清单比对链路实测通过。旧签名包模拟器上需先卸载(签名不一致不能覆盖安装),真机同签名正常覆盖。
- 仍未覆盖:用户真机 v1.2.1→v1.2.2 应用内横幅更新路径(机制在 v1.2.0 已验);旧壳「版本未上报」分支仅单测。

## 2026-10-06 首页加载开销与阅读字体分块

- 状态：部分完成。本地修改和复现证据；未提交、未推送、未部署。
- 本请求做了什么：标题输出可见文本；首页/站壳意图预取；Unsplash 响应式封面与延迟加载；补偿 hydration 前图片失败；ReadingFonts 客户端边界拆出独立、可缓存的阅读 CSS（2026-10-11 修订：该客户端组件已删除，改为阅读页内 `reading-fonts.css?url` + `<link precedence>`，见文末 2026-10-11 条目）。逐文件证据、取舍及未覆盖范围见 PERFORMANCE_2026-10-06.md。
- 本轮本地相邻测量（Windows、生产构建、local D1、匿名、冷缓存，每端 3 次）：手机 FCP 中位数 2088→1484ms，CSS 263994→146037B，图片 767853→129508B，RSC 预取 7→0；桌面 FCP 1964→1884ms，RSC 14→0，但整体 load 2530.3→2532.6ms 未下降。node scripts/summarize-page-load.mjs exit=0，22/22 字段断言。comparison.json SHA256=a8e7929609afee882e778c10f49a95eb4d11387ba64b69f6abd4082e1eb6e8de，首次出现本请求。
- 质量证据：npm test exit=0，544/544（fail=0、cancelled=0、skipped=0、todo=0），比既有 542 基线新增 2 项；tsc 与 lint exit=0。浏览器直接进入反例脚本 13/13，失败图片 imgCount==0、渐变容器==4，阅读字体/公式及手机 overflow==0；真实书卡客户端导航的 readingStylesheet/loadedSerif/katex 均为 true。full-test.log SHA256=6a72d610bec139c174b1691d2ea85eddef1f98628cc2c89bf359f520bf01e689。
- 没做：生产部署/TTFB/边缘缓存、安卓真机与 iOS、见界/银河性能、键盘 focus/图片换源/跨部署旧资产缓存失败分支。保留全部中间测量；imageBytes==0 的样本触发比较门禁 exit=1，未当作节省证据。
- 本轮改动可能引入的新风险：标题动画取消；q=88→80/1280w 上限可能损失高 DPI 清晰度；触屏首次立即跳转可能等回源；阅读 CSS 分块需资产发布完整。desktop 长任务余量中位数 233→871ms 且波动大，CPU 开销下降没有证据。未改变安全/缓存 TTL/鉴权/钱包语义。

## 2026-10-06 status 页面审查（本对话首次产物）

- 状态：部分完成。线上页面、公开 JSON、服务器源码只读检查；缺陷本地复现。没有修改服务器、探针、公告、缓存规则或部署。
- ⚠️ 安全变更/缺口：服务器 `/opt/zc-status/server.mjs:113,361`（本机原样副本 `output/status-review-2026-10-06/server.mjs`）只按最后一条结果定状态，且 `if (rendered.html && rendered.mLog === mLog && rendered.mInc === mInc) return;` 无时间失效条件；探针停止写入时，数据新鲜度不变量失效，旧绿色响应可以一直复用。此项阻断将页面作为可靠故障判定依据。
- ⚠️ 安全变更/缺口：同源码 `:123-124`，`const openIncident = out.incidents.find(i => !i.resolved && i.level !== 'info');` 后以该单条事件覆盖探针最坏状态；存在较新降级公告时，实际 down 探针/较旧未解决 down 事件可能被显示为 degraded。此项阻断将总状态作为可靠故障严重度依据。
- 环境与前置：Windows，Node v24.13.1，2026-10-06；从华为云只读下载原样 server.mjs/probe.sh/zc-incident.mjs，SHA256 同远端 `sha256sum` 相等。使用全新的本地 JSONL/事件夹具、独立子进程和回环 HTTP；未停止生产探针，未制造真实业务故障。
- 命题映射：以下具体字段断言证明“这份生产源码在列出的本地反例输入下输出错误状态”；待证命题为同一软件分支行为，二者相同。它们不证明线上此刻处于故障，也不证明修复；检查时线上公开 API 为 overall=up、8 个探针 up，采样时间 09:55（UTC+8）。
- 复现命令：`node --test output/status-review-2026-10-06/reproduce.test.mjs` exit=0，total=5/pass=5/fail=0/cancelled=0/skipped=0/todo=0；首次执行 4/5、exit=1，原因是 Windows `--import` 接收路径而非 file URL，随后只修复审查脚本的 `pathToFileURL(preloader).href`，5 项全部重跑，无筛选/跳过。没有既有同套件基线；该绿色统计表示缺陷复现断言成立，绝不表示功能正确。
- stopped producer 用例：8 条 20 分钟前成功记录；`assert.equal(data.overall, 'up')`、`assert.equal(data.probes.every(p => p.status === 'up'), true)`、样本年龄断言 >=20min，HTML 仍包含 `<h1>全部系统正常`。
- incident aggregation 用例一：首页夹具 rc=28/http=0 加一条 degraded 事件；`home.status == 'down'` 且 `overall == 'degraded'`。用例二：旧未解决 down 事件 + 新 degraded 事件；`openDownCount == 1` 且 `overall == 'degraded'`。
- mtime cache 用例：首次 fresh=up 后测试时钟前移 25h、输入文件不变；`cached.ts == before.ts` 且 `cached.overall == 'up'`。只追加空行触发 mtime 后 `all probes.status == 'unknown'`、`overall == 'degraded'`。时钟注入是审查专用 Node `--import` 预加载器，生产服务没有该注入；这是时间模拟下的原源码 HTTP 行为，不是生产停探针 25h 实验。
- history coverage 用例：每项仅 1 条成功记录；`samples24h == 1`、`uptime24h == 100`、`emptyBuckets == 95`，HTML 仍写“24h 可用率 100%”、`coverageLabel == false`。线上快照 112/288 或 149/288 预期样本（5min 周期），存在大量 null 桶；百分比只计算收到的样本，页面没有同时展示观测覆盖率，不能解释为连续 24h 全部正常。
- UI 渲染层：441×627 浏览器视口，`probeCount == 8`、每条 `stripCellCounts == 96`、`firstProbeDocumentTop == 742.802`、`noticeCount == 2`、`legendVisibleOutsideDetails == false`、`scriptCount == 0`、meta refresh=60。普通性能/上线公告排在服务列表之前；历史条带无可见时间刻度、逐格提示，展开只得到 u/d/x/· 字符串；60s 整页刷新会重建展开状态。无横向溢出证据只限该视口（scrollWidth=426 <=441），不推出其他设备可用。
- 探针能力范围：`probe.sh` 使用 curl `-o /dev/null`，按 HTTP/rc/TTFB 分类；scanner 的 GET /scan 返回 404 仅判隧道连通，signin=200 不证明账号能登录、app-shell=200 不证明清单字段正确。没有覆盖见界 AI 对话、验证码投递、真实上传扫描业务。server/probe/incident CLI 源码检索没有自动告警投递/异常转事件逻辑；其他外部告警系统未检查，不能据此断言整个部署没有告警。
- 建议次序：先定义并落实采样过期未知态、按最大严重度聚合所有探针/未解决事件、缓存加入时间失效；再把服务列表与最后采样时间放首屏，活动故障置顶、普通公告移后，补常驻图例/时间刻度/逐格详情与采样覆盖率。未对阈值、未知态是否触发外部告警作未授权决策。
- 首次出现及内容指纹：本对话 `output/status-review-2026-10-06/server.mjs` SHA256=322d3d5ae61296f089356095e6565b0211bd05a1e5de4f91067480ce0e022134（远端 mtime=2026-10-06 01:18:29 +08:00）；probe.sh=7450e181179bfe58cb8e07e4520fc7ff1bd30418f0a821e2a4577244c1911114；zc-incident.mjs=57c34290cbb206551ffc9e1b11776b31f16359155ae3d9728663e782f4edb652；reproduce.test.mjs=abe4134b8392dd713000ebd22da30dbb05907b98787d45bf8f465a52b298faa4；reproduction.log=b067091e87014fc35ed0d4a2c557a3725479e3a4d62fcc564f8f3c19c923e3cf；ui-evidence.json=ee65b6cf17dbd0b6a28e4b41c7c967008bb4d7ec025026a742ca01ab027e5de1。原始快照与截图在 Git 忽略的 output/ 保留。
- 按文件证据：server.mjs 是只读原样副本，5 个本地反例覆盖以上列出的软件行为；probe.sh 是只读副本，仅读源码、核对 cron `*/5`，未单独执行或故障注入；zc-incident.mjs 是只读副本，仅读源码，CLI add/update/resolve 未执行；reproduce.test.mjs 的 5 项 exit=0（包含首次路径错误的修正），不证明真实外部系统；ui-evidence.json/live.html/live-status.json/headers.txt/strip-mobile.png 是观察快照，不证明业务功能；PROJECT_STATUS.md 仅追加审查账本，`git diff --check` exit=0（只证明差异格式，无功能结论）。
- 未覆盖范围（本轮未触及的相关路径/测试/分支）：`rg -n '(zc-status|zc-mon|status\.aetherstudio\.top)' tests package.json` exit=1，无主项目现有状态页测试接入命中；未跑 `tests/worker-contracts.test.mjs`、`tests/suites/08-community-uploads.tests.mjs` 及完整 npm test，它们不包含独立状态站。未读本轮的 `app/api/shell-state/route.ts`、`app/api/community/route.ts`、`deploy/server/zaochang-upload-scanner.mjs`；未验 scanner 真扫描/签名库、真实登录/AI/邮件、生产停止探针、Tunnel 断开、CF stale cache/304、日志截断/错误 JSON/未来时间/公告读写失败、CLI 操作、外部告警投递、桌面/320px/安卓与 iOS 真机、完整键盘/读屏流程。
- 变更边界：本次只追加本账本及 output/ 审查证据；入场 `git diff --stat` 已有 16 文件/364 insertions/25 deletions 的首页性能改动，不改写、不宣称本轮审查覆盖。相关既有逐文件结果沿用前一节 PERFORMANCE_2026-10-06.md，不新增性能或安全达标结论。没有本轮代码/配置语义变更，故没有修改造成的新运行风险；剩余风险是状态站错误绿色/严重度掩盖缺陷尚未修复，以及复现测试绿色被误读为功能正确。

## 2026-10-06 status 修复候选与本地 Cloudflare DNS 检查

- 状态：部分完成。本轮用户要求修 status、用本地 Cloudflare 整理 DNS，并选择采样 10 分钟无更新后未知；本地候选与证据存在，尚未提交、推送或部署，DNS未写入。发布等待用户按全局 AGENTS.md 第0节的部署门禁批准；DNS记录读取被当前本地凭据拒绝。
- ⚠️ 安全变更/缺口：`deploy/status/server.mjs:136` 为 `status: latest && now < freshUntil ? STATUS[classify(latest, p.expect)] : 'unknown'`；语义变更:从“24h内旧成功样本可持续正常”改为“年龄>=10min即unknown”。实际输入为八个采样年龄从9:59.999到10:00.000、mtime不变；字段断言 `status=='unknown' && stale==true`，定向36项exit=0。原生产源码仍为322d3d5a…，停止采样可保留绿色的旧缺陷尚未在生产替换。
- ⚠️ 安全变更/缺口：`deploy/status/server.mjs:30,153` 以最高严重度聚合，实际语句 `out.overall = highest([...out.probes.map(p => p.status), out.incidentStatus]);`；语义变更:从“最新一条未解决事件覆盖探针/其他事件”改为“down>degraded>unknown>up”。输入为首页timeout+degraded事件或旧down+新degraded，字段 `overall=='down'`；定向36项exit=0。这些断言证明本地软件条件行为，与待证命题相同；不证明线上当时是否有真实故障。
- 语义变更:从“mtime不变永不过期、stale-while-revalidate=300”改为“mtime+最多30s且不跨下个新鲜度边界、must-revalidate”；位置server.mjs:506,510，25h未写文件反例与缓存截止字段在24项HTTP中。依据是本轮修复与10min选择；说明同步deploy/status/README.md和CLOUDFLARE_RUNBOOK.md。Cloudflare已有规则未改，真实边缘失败分支未验。
- 语义变更:从“损坏/未知事件可被忽略、非法resolved视为已解决”改为“事件来源异常产生unknown，非法/未来/早于started的resolved保留null，不隐藏已知down”；位置server.mjs:84,92,100,156。独立反例字段 `resolved==null && incidentsUnavailable==true && overall=='down'`。依据为本轮独立复核，不改事件CLI或已有数据。
- 语义变更:从“设备wall clock决定客户端样本有效期”改为“服务端生成时间+30s保守缓存界限+performance.now单调计时”；位置server.mjs:416,424，实际语句 `const now = serverBase + performance.now() - clockBase;`，客户端12项中设备落后20min和±24h跳变仍最终全部unknown。API精确10min、网页可能提前最多30s；footer与README明确说明。实际系统休眠/后台计时限制仍未证明。
- 其他候选：采样覆盖与成功率分列、事件/服务顺序、常驻图例与真实时间段表格、60s局部刷新保留展开/焦点/滚动，恶意HTTP字段转义。源码HTTP行测试 `rawMarkup==false`，不声称完整XSS审计或真实业务监测能力。
- 本轮发现并纠正模拟器证据缺口：真实浏览器按钮native disabled导致activeElement=BODY，旧VM未模拟blur；补模拟后12项为11pass/1fail/exit=1，修产品为aria-disabled忙态+busy守卫后12/12。并发断言 `aria-disabled=='true' && disabled==false && fetchCalls==1 && activeElement==refreshButton`；真实浏览器刷新后focusId=refresh-status、history.open=true。原测试总数未下降/无skip，仅将忙态期望改为上述明确字段；旧VM结果不能推出原生焦点正确。
- 最终本地命令：npm run test:status exit=0 total=36/pass=36/fail=0/cancelled=0/skipped=0/todo=0；npm test（最后客户端修改后重跑）exit=0 total=580/pass=580/fail=0/cancelled=0/skipped=0/todo=0，对入场544增加36，无用例排除/删除。全库lint、根tsc exit=0；最后四个本轮JS文件ESLint exit=0；git diff --check exit=0。Windows/Node v24.13.1；主项目是本地Wrangler/D1与假外部上游，不是生产业务验收。
- 独立复核（按全局7.3）：最终源码09910096…由status_independent_review复跑10独立反例和12仓库客户端用例，均exit=0/fail=0/skipped=0。先前无效解决时间、设备时钟落后、HTTP恶意字段警报逐项采纳并记录；另明确原VM未模拟原生blur的证据限制。只有一个独立子agent，无多agent结论投票或分歧归并。
- 浏览器UI证据：390×844/320×640/1280×720 scrollWidth=375/305/1265<=width，390第一服务top=495.802、详情96行。只停止本地预览后note=“刷新失败，显示上次数据；可重试”、8项仍显示、历史展开/按钮焦点保留；恢复本地进程重试返回“刚刚更新”。node --test output/status-fix-2026-10-06/verify-browser-evidence.test.mjs exit=0，6pass/0fail/0skip/0cancelled/0todo；该命令只断言实际CUA观察快照，不重新操作浏览器，也不证明安全/业务数据落库。
- 本地Cloudflare：node scripts/inspect-cloudflare-dns.mjs exit=2；Zone HTTP200/success=true/1项，Workers Routes HTTP200/success=true/2项（apex/www→zaochang，request_limit_fail_open=false），Workers Domains HTTP200返回空数组；DNS Records HTTP403/success=false/10000 Authentication error。没有取得DNS清单，不宣称清理或修改。凭证只在内存，不输出/落文件。DNS_PLAN_2026-10-06.md提议learn/books/app少量跳转入口，最终仍回主站；CNAME不能映射页面路径，不扩大Cookie Domain、OAuth回调、Passkey或壳白名单。developers入口为按传播需要再选的候选。
- 生产只读对账：ssh zaochang-cibox sha256sum与systemctl is-active exit=0，server.mjs=322d3d5ae61296f089356095e6565b0211bd05a1e5de4f91067480ce0e022134，probe.sh=7450e181179bfe58cb8e07e4520fc7ff1bd30418f0a821e2a4577244c1911114，zc-incident.mjs=57c34290cbb206551ffc9e1b11776b31f16359155ae3d9728663e782f4edb652，服务active。三者与首次审查快照相同，这仅证明读取时字节/服务状态，不证明旧版监控语义正确。
- 变更集：git diff --stat为24文件（本轮9个文件含账本，另15个是入场性能改动）；本轮源为新纳入仓库的原服务候选，不与主站Worker混发。逐文件语义、验证或明确未单独验证逐行列于deploy/status/README.md“本轮结果与逐文件对账”，包括所有15个保留文件，完整套件绿色不替代它们的性能/视觉语义证明。
- 本轮改动可能引入的新风险：缓存重算更频繁/ETag变化、96行×8详情增大HTML、网页保守提前30s未知、现代AbortSignal.timeout兼容性未全浏览器实测；ARIA忙态依赖busy守卫，守卫重复请求反例已断言，不靠原生disabled。DNS脚本仅GET、方案文档不产生外部配置变化；若实施别名会增加TLS/重定向维护，必须先读完整记录清单，不能套通配主站路由截获status/scanner。
- 未覆盖范围（本轮未触及的相关路径/测试/分支）：相关检索rg -n '(zc-status|zc-mon|status\.aetherstudio\.top|statusClient)' deploy tests scripts package.json CLOUDFLARE_RUNBOOK.md；仓库两套status测试与主项目全套已执行，但未执行生产probe.sh、事件CLI add/update/resolve、真实业务AI/邮件/认证/扫描操作；本轮未通读worker/index.ts、app/api/uploads/route.ts的所有业务分支。未验生产停探针、损坏公告、外部告警投递、Tunnel断开、Cloudflare陈旧缓存/来源规则、发布与回滚、DNS清单/所有分页/MX-TXT依赖/新别名TLS和身份端到端。UI未验后台调度/系统休眠/无JS/读屏/多浏览器/真机。预览使用只读生产数据快照，停止复制后会自然过期。
- 首次产物锚点：本修复请求轮次的最终server.mjs SHA256=09910096c3c11d0d7e2d7b30040d4154879f1598103a97d17553e42bbcfdda9a，status-page测试=d128f3a93b0b752faf8c72862e904672f49da5a8b4efff5b18aecc1b25ac765c，status-client测试=8a927c857355df123c7e09544faada2471fc07ef52d5512a24dfecef07f1c43d；acceptance-final.log=439b5af74b457d2a2967c7efc9ac0200d72d3ae199cc84d4b52430a4157f25f2（36pass），full-test-final.log=1953a3afbc04688d086d2f251992d052d90207ce813d4da1c0f0d1b5301ad62e（580pass），browser-evidence-final.json=0828617730a1ea27b58b0bde02d188b7daa04494de1e8d09b306b0cee865202d（390px首服务495.802），cloudflare-inventory.json=d5f5631c1b2f9894948fc52c23a3e2fd771c7211958d304d2b68cd7e3e242a54（Routes2项/DNS403）。路径、mtimeUTC、字节与完整指纹在output/status-fix-2026-10-06/fingerprints.json。保留此前失败与中间日志，未拿旧产物抬升为生产可用态。
- 本轮真实时间补验：本地预览不再复制日志后，2026-10-06T02:43:58.676Z 生成的 API 中实际采样年龄13.9612667min；node字段断言命令exit=0，staleAfterMin==10、probes.length==8、全部status==unknown且stale==true、overall==unknown。没有Date预加载器/生产停探针；natural-expiry.json记录此输入时间与输出，浏览器同generated回显全部unknown、0/8，natural-expiry-ui.json与preview-expired-mobile-final.png为UI层证据，后端/API与UI时间戳匹配。精确10min边界仍由定向HTTP用例证明，此补验只证明真实本地13.96min过期行为。

## 2026-10-06 status 发布授权执行与本地 token 重试

- 状态：部分完成。用户“发布，然后我可以给你cloudflare 的apitoken你需要什么权限”提供发布授权；后续“再试试本地的token我刚才授权了”与“不清楚，但是本地之前有能用的token”提供本地凭据复用授权。独立status替换/源站检查exit=0、公开检查exit=0；DNS整理停在完整记录导出之前，缺有效DNS凭据才可推进，没有写DNS或重定向。
- ⚠️ 安全变更/缺口：deploy/status/server.mjs:136 的实际判定为 `status: latest && now < freshUntil ? STATUS[classify(latest, p.expect)] : 'unknown'`。语义变更:从生产旧32d源码的“24h内旧成功可持续绿色”改为发布99源码的“年龄>=10min即unknown”；依据为此前10分钟选择与本轮发布授权。实际精确边界夹具在生产Linux/Node22.20隔离运行，所有status==unknown且stale==true；公开真实输入尚新鲜，状态均等于采样字段重算结果，不冒充生产停止采样实验。
- 语义变更:生产来源从322d3d5ae61296f089356095e6565b0211bd05a1e5de4f91067480ce0e022134替换为09910096c3c11d0d7e2d7b30040d4154879f1598103a97d17553e42bbcfdda9a；同时采用候选最高严重度、损坏事件未知/保留已知down、时间缓存期限、must-revalidate与客户端服务端时间/单调计时。候选具体前后语义沿用上节，未再改代码。README/运行手册同步生产状态，不抬升旧本地快照为生产故障注入证据。
- 发布目录 /opt/zc-status/releases/status-20261006T024930Z；远端Node v22.20.0。命令 /opt/node/bin/node --test tests/status-page.test.mjs tests/status-client.test.mjs exit=0，total=36/pass=36/fail=0/skipped=0/cancelled=0/todo=0，无删除/过滤/跳过。测试夹具不写生产日志或事件；VM客户端用例不证明实际后台调度。production-node-tests.log为本次新增产物，先前Windows36/整库580日志与原指纹保留，不把旧日志重新称作新增测试。
- ssh发布脚本exit=0：先校验现生产/候选SHA，备份到 /opt/zc-status/server.mjs.bak-status-20261006T024930Z，原子替换并重启；服务active、源SHA==99、备份SHA==32。首次重启健康请求曾连接拒绝，随后只读健康等待成功；没有执行回滚trap。探针SHA=7450e181179bfe58cb8e07e4520fc7ff1bd30418f0a821e2a4577244c1911114、事件CLI SHA=57c34290cbb206551ffc9e1b11776b31f16359155ae3d9728663e782f4edb652，与原快照相同。没有发布主站Worker/入场性能改动，没有Git提交或推送。
- 源站release-smoke.mjs exit=0、北京时间10:53:39；公开目标https://status.aetherstudio.top同脚本exit=0、10:54:46。字段断言staleAfterMin==10、probeCount==8、每项coverage==round(observedSlots/288)、freshUntil==latest+600000、status与age/rc/http/ttfb分类相等、overall等于最高严重度；API/HTML Cache-Control含must-revalidate且无SWR。公开观测max-age=29、CF=EXPIRED、解码HTML125447B。命题映射：该证据证明当时真实新鲜输入经过公开链路取得新版本行为，待证命题与此范围相同；不证明生产采样停止/源站失联时边缘行为。
- 按全局7.3沿用同一独立reviewer：node output/status-fix-2026-10-06/review-public-check.mjs exit=0，10:57:29；everyProbeStatusEqualsComputedState==true、overallEqualsHighestSeverity==true、servedClientEqualsCandidate==true、historyRowCount==768；首页159/288=55.21%、登录123/288=42.71%。复核没有独立SSH或停生产探针；只有一个独立子agent，不涉及多agent投票。追加review-findings.md保留此前警报/修正记录。
- 公开Chromium UI证据首次出现在本轮11:01:19：production-ui-evidence.json，390×844、scrollWidth375<=390、serviceCount8、firstServiceTop495.802，generated=2026-10-06T03:01:02.436Z、首页160/288=55.56%；production-mobile.png只证明该视口渲染。后端来源由上述公开API字段交叉核对；不同时间采样数增加是实测变化，不将截图当作登录/扫描功能证明。临时视口已恢复。
- 用户授权后本地凭据重试：node scripts/inspect-cloudflare-dns.mjs exit=2，Zone200/1、Routes200/2（apex/www→zaochang、request_limit_fail_open=false）、Domains200/0，DNS403/error10000。检查常见Process/User/Machine token变量均未设置，Wrangler配置mtime北京时间10:10；Claude插件旧OAuth过期且scope含dns.read不含dns.write，官方refresh HTTP400/error=invalid_grant。包装器随后的Windows Node句柄断言使实际exit=-1073740791，不能虚报exit=2；拒绝在写凭据之前发生，凭据mtime未变。未检索其他应用私有凭据库，不能推出整机没有其他token。
- 凭据值没有进入日志/仓库/对话。local-credential-metadata.json只含存在性、mtime、三个环境变量布尔值及scope布尔值；常规Git忽略路径.env.cloudflare.local经git check-ignore --no-index exit=0，但文件尚未创建。新token建议仅aetherstudio.top、Zone/Zone/Read、Zone/DNS/Edit、Zone/Single Redirect/Edit，DNS Edit接受列表读取；官方权限链接在DNS_PLAN_2026-10-06.md。
- 证据可变性：inventory重试覆盖了cloudflare-inventory.json，前节首次d5f5631c…指纹仅对应旧快照，不再代表当前固定文件；当前结果另存cloudflare-inventory-retry.json。原fingerprints.json备份为fingerprints-before-publication.json；本轮新增/更新文件的路径、mtimeUTC与SHA另行重算，源99与两套测试字节不变。
- 按文件证据：本轮只新增生产证据和修改README、运行手册、DNS计划、账本；四份文档与真实日志/元数据字段对账及git diff --check，不含独立运行能力。整个工作树改动仍以git diff --stat的24文件为锚，所有24项在deploy/status/README.md逐行给验证或未单独验证声明，15个入场性能文件没有混入独立status发布。套件绿不构成这些性能/视觉改动已验收的证明。
- 本轮改动可能引入的新风险：实际启用时间缓存重算与动态ETag会增加回源工作，公开HTML解码125447B的历史详情会增加正文，客户端保守界限可最多提前30秒未知；发布重启有短暂可达性窗口，本次初次健康连接拒绝后重试恢复。缓存来源失败/多PoP负载/真实系统休眠未测；回滚会重新引入旧绿色与严重度缺陷。DNS无写入、凭据刷新被拒，没有扩大授权；仅文档变化不引入额外运行逻辑。
- 未覆盖范围（本轮未触及的相关路径/测试/分支）：生产probe.sh实际执行与事件CLI add/update/resolve，生产停采样/损坏公告/Tunnel断开/外部告警投递/来源失败边缘陈旧缓存/真实回滚；真实登录、AI、邮件、扫描、Android壳与后台休眠/无JS/读屏/多浏览器真机。相关仓库两套status测试已跑，未新增漏跑的status测试；本轮没有通读worker/index.ts和app/api/uploads/route.ts的业务分支。DNS记录完整分页、MX/TXT依赖、规则集、别名冲突、TLS与重定向/认证端到端未验；其他应用凭据库未查。这些缺口不能由公开200、截图或脚本存在性推出。
- 本轮文档对账：node output/status-fix-2026-10-06/check-publication-record.mjs exit=0，changedFilesWithEvidence==24、生产日志total/pass==36且fail/skip/cancelled/todo==0、公开staleAfterMin==10/probeCount==8、源与两套测试SHA均等于冻结候选、DNS返回403。此命令只证明记录与产物字段一致，待证命题为文档准确性，不重跑生产故障或DNS写入；git diff --check exit=0。新增生产/凭据/公开UI证据首次出现于本发布授权轮，完整当前指纹在fingerprints.json；旧fingerprints-before-publication.json与首次轮次记录保留。

## 2026-10-06 DNS 权限更新后的三个产品入口

- 状态：部分完成（限定入口的配置及公开行为有证据，登录后/真机/全球传播与真实回滚未覆盖）。依据是用户此前“修一下……整理一下dns”“发布”“继续”以及本轮权限问答“更新了”；不重复请求发布许可。新token只经关闭回显的stdin进入进程内存，没有写入项目或证据。上一节旧凭据403/invalid_grant及无DNS写入是当时结果，本节是新的实际写入记录。
- ⚠️ 安全变更/缺口：DNS_PLAN_2026-10-06.md“权限更新后的实际发布”段记录新增域名只接受规范化根路径GET/HEAD，POST与OAuth回调路径实际522、Location==null；不能将新别名当成产品API或认证回调来源。登录后、Passkey与Android身份流没有执行，不能据匿名跳转宣称身份端到端正确。
- 语义变更：从learn/books/app无DNS及无Single Redirect phase，改为三个proxied A=192.0.2.1/ttl=1与三条固定目标302，精确host、规范化path=="/"、method∈{GET,HEAD}、preserve_query_string==true；依据是上述发布授权与“更新了”。learn.aetherstudio.top→https://aetherstudio.top/lattice/、books.aetherstudio.top→https://aetherstudio.top/bookshelf、app.aetherstudio.top→https://aetherstudio.top/app。未采用任意深路径映射、子域直接托管或301；对应的深链接、Cookie/OAuth来源及缓存行为不同，明确不属于本次入口合同。DNS计划、运行手册、status README同步记录。
- 完整清单：13:15:50初读15/15，精确(type,name,content,priority)去重uniqueCount==15；两apex/www A、两status/scanner Tunnel CNAME、六MX、五SPF/DKIM/DMARC TXT均保留，没有删除依据。权限更新后13:20:11规则列表200/4、目标phase404/code10003；这是phase不存在，不是403授权失败。
- 预检证据语义变更：从要求原cache全文深比，改为冻结快照/写前/写后原zone cache元数据deepEqual（含id/kind/phase/version=2/last_updated），且旧ID无写请求。原cache全文GET仍403；官方每次修改增版本与独立复核支持当前版本未改的字段证明，不支持全文逐字相等或缓存失败行为正确。没有扩大Cache Rules权限。
- 操作未生效分支：apply-journal-preflight-cache-denied.json为3个GET、POST==0、newRulesetId==null、newDnsIds.length==0，因cache body403停止；最终外部状态仍15条。操作已生效后停止分支：apply-journal-first-write.json恰2个POST，新规则集及learn均200/success=true，读回records.length==16但total_count==15而停止，books/app未写。13:27:26独立重导16/16、learn真实302；没有把计数延迟描述为零写入，也没有盲重试POST。
- 恢复命令node output/status-fix-2026-10-06/cf-apply-page-entries.mjs --resume exit=0；先逐字段核对并采用既有规则/learn ID，resume POST==2且仅books/app。最终dnsCount==18、existingRecordsUnchanged==true、existingCacheRulesetMetadataUnchanged==true、existingCacheRulesetBodyRead==false；只读GET计数收敛门禁保持actualCount==total_count，最多13次间隔5秒，不自动重试写请求。
- 新规则集ID=9ee7acef9be64496b0ecf76397632899、phase=http_request_dynamic_redirect/version1/rules3；learn DNS=170876c19b1e5c9a87633027503400ae、books=245f7da3ebcbb4931ee339b86f979302、app=5044ac3d5c62a753ca37ed1f12902dd1。最终dns-after.json observedAt=2026-10-06T05:30:51.351Z（北京时间13:30:51）。原15条按ID全对象（含created_on/modified_on/meta）相等由独立24项套件断言；最终18个ID唯一且恰新增这三个host。
- 新公网证据：node --test output/status-fix-2026-10-06/verify-page-entries.test.mjs exit=0，total/pass=18、fail/skipped/cancelled/todo=0、suite=1，无筛选/跳过。本轮首次公开18项产物，Windows/Node24.13.1、匿名HTTPS、CF-Ray=LAX、截至13:31:28。每host GET/HEAD根status==302且Location==固定目标；query origin/path固定、x==['a/b','书']；跟随后hostname==aetherstudio.top，bookshelf/app为目标页，learn为signin且return_to==/lattice/、via==lattice。POST根与GET回调六例实际status==522且Location==null，不是客户端超时冒充拒绝。此证据直接证明这些输入下的公开字段行为，与待证命题相同，不证明登录后的业务能力。
- 独立复核沿用/root/status_independent_review：node --test output/status-fix-2026-10-06/review-dns-candidate.test.mjs exit=0，24/24、fail/skipped/cancelled/todo=0；node output/status-fix-2026-10-06/review-dns-public.mjs exit=0，15/15字段工况、另3个raw观察，共18请求，13:31:34–13:32:16。原15全对象、原cache完整列表元数据/版本2相等，规则字段等于冻结候选，resume未重写learn/规则集。独立公网非根GET真实522且Location/SetCookie==null，约19.5秒。只有一个独立agent；其规范化路径和慢522警报均采纳。
- UI层：13:32:37 Chromium从books短入口到实际https://aetherstudio.top/bookshelf，h1==造场书架、bookLinks.length==3；books-entry-ui.json/png在最终dns目录。截图只证明UI，公开HTTP字段来自上述真实测试。临时视口已恢复，没有用截图替代认证/落库证据。
- 按文件证据：本轮只修改DNS_PLAN_2026-10-06.md（清单、前后语义与18项公网字段）、CLOUDFLARE_RUNBOOK.md（ID、方法/路径与回滚范围）、deploy/status/README.md（入口结果及24文件证据表）、PROJECT_STATUS.md（两类实际失败及恢复留痕）；check-dns-release-record.mjs对这些记录与JSON/日志字段核对，git diff --check只证明差异格式。最终改动集合仍锚git diff --stat的全部24文件，其余20项逐行验证/未单独验证声明保留于README；源09910096…及两套status测试冻结SHA不变，未重跑无关性能/业务套件，未发主站Worker、未Git提交/推送。
- 首次出现与指纹：本权限更新轮的候选固定SHA256=f29f6e3b0e853152ac06439c4399a9eb650898dddf11d92f112adc228d364c3c（state仍保留当时blocked历史，不冒充最终状态）；dns-after.json=c0ce35b7…、独立公网JSON=10eab992…、review-dns-findings.md=4abbd96a…；完整SHA/mtimeUTC/字节见dns-release-fingerprints.json。旧fingerprints.json另存fingerprints-before-dns.json，保留此前发布证据；apply-journal-resume.json的public_checks_pending是写入当时状态，独立新增release-record-check.json以真实公网字段记录后续测试，不改写旧日志。
- 未覆盖范围（本轮未触及的相关路径/测试/分支）：登录后的会话连续性、OAuth/Passkey真实授权、Android/真机、实际邮件/AI/扫描操作；POST网络超时写结果未知故障注入、真实回滚、OPTIONS/所有方法/全部raw路径变体、DNSSEC/CAA/证书续期/全球PoP、其它CF产品规则全文与cache body（403）。未重跑认证全套，worker/lattice-gate.ts与app/oauth-session.ts只读相关来源/跳转部分；任意深路径映射不在合同内。status生产停采样/来源失败/告警等缺口仍沿用上一节，不被本轮DNS证据解除。
- 本轮改动可能引入的新风险：三个新主机增加TLS/规则维护；规范化path可能让raw //、/x/..、/%2e/成为根并实际302，合同不保证raw非根全部拒绝；规则失配/非根/POST落占位origin约20秒后522，不是友好404。query保留可能携带敏感参数到同一规范origin，已登录会话未测。实际回滚只能按本轮新增ID处理，原15条不能删；没有执行真实回滚。主站/status源代码、鉴权门槛、邮件与隧道配置未改，没有把新增DNS包装成对整站身份安全的证明。
- 最后文档/产物对账：node output/status-fix-2026-10-06/check-dns-release-record.mjs exit=0，13:41:13，originalFullRecordObjectsEqual==true、finalDnsCount==18、publicCases==18/publicNegativeStatus==522、changedFilesWithIndividualEvidence==24，源与两套status测试SHA等于冻结值。首次对账exit=1是脚本把真实spec reporter的“ℹ tests 18”误按TAP“# tests 18”读取；只修日志格式解析并全量重跑统计/字段断言，没有重写公网结果或跳过用例，record-check-first-failure.json明示为实际工具结果的人工摘录，不冒充原始stdout。该命令证明记录准确性，不构成新一次公网故障验证。

## 2026-10-06 用户追问 status 是否也换过去

- 状态：部分完成；本轮只读复查，无部署/配置写入。13:44:29公开https://status.aetherstudio.top/返回status==200、Location==null；node output/status-fix-2026-10-06/release-smoke.mjs https://status.aetherstudio.top exit=0，staleAfterMin==10、probeCount==8、各状态与年龄/HTTP/rc/TTFB字段重算相等、最高严重度与缓存期限断言成立。命题是“修正版仍在原status地址提供这些公开行为”，证据与命题同一范围；不是迁移托管的证明。
- ssh zaochang-cibox的sha256sum /opt/zc-status/server.mjs及systemctl is-active zc-status.service exit=0，source==09910096c3c11d0d7e2d7b30040d4154879f1598103a97d17553e42bbcfdda9a、service==active。上一轮冻结DNS读回里status CNAME仍为1e9c7b9d-d68d-45eb-99c0-db19c5b29919.cfargotunnel.com；本轮未重读Cloudflare DNS API或Tunnel ingress。DNS整理没有修改这条记录；独立status服务没有迁往Workers/Pages。
- 本追问轮次的新产物：output/status-fix-2026-10-06/status-location-recheck-1791265469088.json，observedAt=2026-10-06T05:44:29.086Z、首页coverage24h=66.67（192/288），为当前公网字段而非沿用此前截图。此前完整指纹manifest作为历史保留，不把此追加伪装成当时已覆盖；本轮命令输出记录了实际exit0。
- 按文件证据及新风险：只追加PROJECT_STATUS.md的复查账本，不改运行语义；git diff --check用于文档格式，原24文件的证据/未单独验证声明继续列在deploy/status/README.md。本轮记录不引入新的运行路径风险。
- 未覆盖范围：生产停采样/来源失联边缘缓存/真实回滚，生产probe.sh与事件CLI未执行、Tunnel ingress与Cloudflare DNS API未重新读取；没有重跑36项夹具测试，沿用原生产Node22隔离36/36证据且明确不称本轮新增测试。

## 2026-10-06 status 超时与异常原因展示修订

- 状态：部分完成。触发锚点为用户“服务状态应该超时无返回都应该降级或者熔断……降级为什么没发原因”及本轮答复“status标记故障并显示原因，业务请求继续按现有规则处理”。选择只做监测状态/解释，放弃实际业务熔断解释（后者会拒绝/停止业务请求），不改业务路由/Worker/探针/cron/DNS/Tunnel。发布沿用此前明确“发布”授权，候选通过本地/生产同版本隔离/独立反例后再替换。
- ⚠️ 安全变更/缺口：deploy/status/server.mjs:198 的 `latest: publicSample(latest, p.id, latestReason)`。语义变更：从公开原始latest行及任意附加字段/err，改为白名单数值投影与安全诊断（非法HTTP为null），原始服务器日志不改；原公开路径在日志含敏感附加字段时会破坏不外泄不变量。依据为本轮原因请求及独立假secret反例；`Object.hasOwn(home.latest,'extraAuthorization')==false`且JSON/HTML不含LOCAL_FAKE_SECRET的本地夹具通过，不声称生产曾泄露真实token。公开字段检查只证明此次白名单合同。
- 语义变更：当前原因从“无reason/历史只有颜色”改为“reason当前/null正常、lastAnomaly保留历史原因+首次正常采样时间、bucketDetails最近3+独立最严重记录及全计数”；本轮未发布初候选的客户端保守未知文案从“已达10min”改为“新鲜度无法确认，可能提前最多30s”。依据是用户本轮选择和独立9m30反例；服务器10min门禁/客户端保守30s范围/分类函数字节相等未变。rc非0/无HTTP→down，非预期HTTP（含500）/TTFB>10→degraded，TTFB恰10仍up，age>=600000或无有效样本→unknown。README与运行手册同步前后语义。
- 定位证据：只读生产1375条快照中2条异常，北京时间02:20:01 shell-state/community都HTTP500/rc0，TTFB8.993499/0.934189s；02:25:01首次后续正常HTTP200/rc0。旧99源码只有classify整数、历史bucket整数及latest，缺当前/历史原因字段，后续成功latest覆盖原异常现象。baseline-observations.json/review-baseline-repro.mjs支持这个展示缺口；可以用真实500记录在新公开JSON中code==http_error并有恢复时间证伪修复命题。若后端根因调查是目标，需当时业务错误体/Worker日志；原probe使用-o /dev/null，现有日志不能补造D1/网络根因。
- 本轮初版回归真实记录：旧99+更新55项套件为total55/pass35/fail20/exit1/skipped0；初候选55/55与全库599/599，但独立17项16pass/1fail，9m30提前未知时文案误称10min。原失败日志保留；修订文案并补最严重原因/提前提示反例，最终冻结source SHA256=9071ba7b529e0419aece78e21f02c1afbdf1f53f1325f12e567ed1453469a3ce。两套status最终total57/pass57/fail0/skipped0/cancelled0/todo0/exit0（41HTTP+16VM），比原36新增21、0删除/过滤/跳过；恶意HTTP旧转义断言强化为null投影且不外泄，不是跳过旧用例。
- 本轮最终全库：npm test exit0，total601/pass601/suites6/fail0/skipped0/cancelled0/todo0，原580+21==601，不拿早期599替代最终源码证据。source --check/最终3个JS定向ESLint exit0；前序整库lint/tsc exit0，后续只改JS原因文本/历史，不增加TS改动。quality-checks-final.json/full-test-final.log/status-test-final.log在output/status-reasons-2026-10-06。真实Wrangler/D1测试使用本地数据库及假上游，不能证明生产AI/邮件/扫描操作。
- 生产LinuxNode22.20隔离：release /opt/zc-status/releases/status-reasons-20261006T060537Z，sha256sum候选==9071及两套测试==本地；/opt/node/bin/node --test --test-reporter=tap tests/status-page.test.mjs tests/status-client.test.mjs total57/pass57、其余0、exit0，production-node-tests.log/stage-release.json记录真实命令。测试Date预加载仅在测试子进程，不存在生产测试钩子；VM不证明浏览器后台计时。
- 生产执行：node output/status-reasons-2026-10-06/publish-release.mjs exit0（SSH替换、源站字段、公开字段均exit0）。先核对现生产99及候选9071/探针CLI SHA，再备份、原子替换/restart；service active，current SHA==9071，backup==99，路径 /opt/zc-status/server.mjs.bak-status-reasons-20261006T060537Z。probe SHA=7450e181179bfe58cb8e07e4520fc7ff1bd30418f0a821e2a4577244c1911114、incident CLI SHA=57c34290cbb206551ffc9e1b11776b31f16359155ae3d9728663e782f4edb652前后相同；没有真实回滚，trap未触发，未Git提交/推送或发布主站Worker。release-id.json中的published:false保留上传阶段历史；publication-result.json独立记录实际发布。
- 公开行为：14:12:50、https://status.aetherstudio.top，staleAfterMin==10、probes8/8当前up/reason==null；两条真实历史reason.code==http_error/at==2026-10-05T18:20:01Z/recoveredAt==18:25:01Z/rootCauseConfirmed==false。everyProbeStatusEqualsComputedState/publicLatestHasOnlyAllowedFields/bucketCountsEqualSampleCounts/retainedActual500HasReason/servedClientEqualsCandidate均true；historyRowCount768，Cache-Control max-age26 must-revalidate、CF EXPIRED、无SWR，HTML156122B/JSON57566B。命题映射：此证据证明真实历史经当前公開路径取得原因/恢复字段，与待证命题相同；不证明生产超时或无响应故障时序，也不证明根因。
- 独立复核：沿用/root/status_independent_review（全局7.3触发，只有一个独立agent）；最终本地反例20/20、仓库定向57/57、exit0且fail/skipped/cancelled/todo全0，source==9071、classify字节==旧99。14:14:56只读公网复核exit0：8up、两条真实历史500/恢复与原日志相等、bucket计数相等、servedClientEqualsFrozenCandidate==true/historyRow768。初次公网exit1是复核器日期正则遗漏“10-06”，保留失败日志，修正为实际日期格式后全量复跑exit0；这是工具断言错误，不修改产品/公开结果。review-findings.md与review-public-evidence.json为新增证据。
- UI层：本輪14:13:52 production-ui.json/production-mobile.png，公开Chromium390×844、scrollWidth375<=390、generated2026-10-06T06:12:47.595Z与公开API一致、8项，历史展开第三列“探测记录与原因”、站点状态接口现正常/最近02:20HTTP500/02:25恢复。截图不证明安全/业务根因；临时视口恢复。早期local-ui-*截图及自然过期输入是初候选模拟日志，明确不当最终9071生产证据。
- 按文件证据：本轮直接修改server.mjs、两套status测试、README、CLOUDFLARE_RUNBOOK.md、PROJECT_STATUS.md；server源/两套测试对应57项、601整库、实际公开字段；3份文档由check-record与实际SHA/退出码/字段对账及git diff --check。整个git diff --stat仍有24文件，README24行逐项列当前证据或未单独验证；入场性能文件不混入本次独立status发布。
- 首次出现/指纹：本异常原因轮新source9071、status-page f82e1d4f76fc15158491a81db790c53e4d95daacd90c4de300437ada6d5fe739、status-client092f6ddd915c92389f0b53c6faa6090ae4d95e3a7cbc952783d94e98319817f6；原99/live/probe/incident冻结快照保留，新增产物完整SHA/mtimeUTC/字节记录在output/status-reasons-2026-10-06/fingerprints.json。之前status-fix与DNS指纹仍为原轮历史，不用旧记录提高本轮结论。
- 本轮改动可能引入的新风险：API最新原始err/附加字段收窄影响依赖者；JSON/HTML历史原因增大传输及回源运算（以上实测字节），多PoP/负载未测；每格最多最近3+最严重4条，计数全量但个别明细未展示；客户端可保守提前30s未知。发布重启有短暂可达性窗口，publish-journal.json的SSH stderr记录一次curl(7)源站连接拒绝，只读健康重试随后成功、最终exit0，不能仅看stdout省略这个窗口；回滚99将去掉原因/投影，本次备份不是旧322新鲜度缺陷源码。诊断仅描述探测点现象，不等于业务根因或邮件/消息告警。
- 未覆盖范围（本轮未触及的相关路径/测试/分支）：真实生产超时/无响应/停采样/损坏公告/Tunnel断开、来源失败边缘陈旧缓存、实际回滚、告警投递、业务实际熔断（用户未选）、登录后/AI/邮件/扫描/Android真实业务；主站worker/index.ts、worker/lattice-gate.ts、app/api/uploads/route.ts本轮未通读，scripts/cf-cache-rule.mjs及Cloudflare规则body未重读；生产probe.sh/zc-incident.mjs仅读取和SHA核对、不执行；两套仓库status57项全部执行，不新增漏跑同语义用例。实际后台调度/系统休眠/无JS/读屏/多浏览器/真机、同时间戳矛盾样本与日志2MB截断边界未覆盖。仓库相关检索rg -n '(zc-status|zc-mon|status\.aetherstudio\.top|statusClient|sampleReason|publicSample)' deploy tests scripts package.json CLOUDFLARE_RUNBOOK.md用于范围定位，不充当语义验证。
- 文档对账：node output/status-reasons-2026-10-06/check-record.mjs exit0，changedFilesWithIndividualEvidence==24、statusStats.total/pass==57、fullStats.total/pass==601、Linux==57、independent==20，各fail/skip/cancelled/todo0；publicFieldsEqualExpected/actual500HistoryAndRecoveryEqual/uiGeneratedEqualsApiGenerated/restartConnectionRefusalDisclosed均true。git diff --check exit0。该证据与“记录准确”命题同范围，不重新触发生产故障；完整24文件与新产物指纹单独保存，不更新旧轮manifest。

## 2026-10-11 代码审查修复轮（性能改动与 status 服务；部分完成）

- 状态：部分完成。本轮针对 2026-10-06 性能改动及 status 服务的代码审查，修 10 项发现；用户指示“提交并部署”：status 服务已部署到北京主机，主站改动随本次提交推 main 走 CI→deploy（部署结果以 `gh run list` 为准，本条不代写）。
- ⚠️ 安全变更：deploy/status/server.mjs 默认监听地址。语义变更：从默认绑定 0.0.0.0 改为 127.0.0.1（`STATUS_HOST` 可覆盖）。2026-10-11 06:47 UTC 已部署（生产 SHA `324d7eb5…`，备份 `server.mjs.bak-loopback-20261011T064705Z`）；部署前核对 cloudflared ingress 为 `http://localhost:8080`；部署后 `ss` 只见 `127.0.0.1:8080`，公网 status 200，从阿里云主机直连 8080 连接拒绝。8080 的 SG 规则撤销另行审批。替换前对临时文件的 `node --check` 因扩展名失败未生效，替换后补跑 exit 0（详见 deploy/status/README.md 末节）。
- 10 项修复：①意图预取收窄为白名单（`app/lib/intent-prefetch.ts`：`/`、`/discover`、`/feed`、`/circles`、`/challenges`、`/guide`、`/galaxy`），`/wallet`、`/admin`、`/founder`、`/notifications`、`/profile`、`/studio`、`/collections`、`/bookshelf`、`/docs`、`/developers`、`/product/*` 等按用户/动态页面不再预取，测试 `tests/intent-prefetch.test.mjs`；②银河字体：新增 `app/galaxy/layout.tsx`（仓库首个嵌套 layout）+ `app/galaxy/galaxy-fonts.css`，仅 `/galaxy/*` 加载 Noto Serif SC 400/500（galaxy.module.css / ecosystem.module.css 用到而共享 CSS 只有 600/900），代价约 242KB 未压缩 CSS；③阅读字体：删除返回 null 的客户端组件 `reading-fonts.tsx`，改 `import ...reading-fonts.css?url` + `<link rel="stylesheet" precedence="default">`（`app/css-url.d.ts` 声明 `*.css?url`），产物名仍为 `reading-fonts-<hash>.css`；④CoverImage 挂载失败检查改用 `new Image()` 复核，lazy 图片等进入视口后再判；⑤Unsplash 封面保持宽高比（同比缩放高）、保留 fit、候选宽度不超过原图 w；⑥详情页主图 `sizes="(max-width: 1260px) 100vw, 1260px"`，收藏缩略图 `sizes="50px"`；⑦首页实时榜与网格重复作品复用卡片 sizes，只下载一次；⑧status 服务默认绑定 0.0.0.0→127.0.0.1；⑨24h 覆盖率按固定 UTC 5 分钟槽计数、容差 ±2.5 分钟；⑩删除未使用的 `app/components/motion/blur-text.tsx`。
- 验证：npm test exit=0，614 tests pass / 0 fail / 0 skipped / 0 todo（上一账本基线 601，增量来自 `tests/intent-prefetch.test.mjs` 等新增/更新用例，无删减或禁用）；npx tsc --noEmit exit=0；eslint（排除未跟踪 tmp/）exit=0；git diff --check exit=0。测试使用 local D1 与假上游，不证明真实浏览器行为或生产。
- 没做/缺口：未在真实浏览器验证 hover 预取实际请求（白名单内外）；未验 Windows/Android 上 Noto Serif SC 400/500 实际字重渲染；未验详情页主图清晰度（sizes 变化）；Safari/Firefox 下 lazy 图片失败复核行为未测；本轮没有重做性能测量，PERFORMANCE_2026-10-06.md 的数字仍是修订前采集；status 服务回滚未演练、生产抖动场景下的覆盖率差异未复现（当前 24h 真实只有约 178 轮采样，新旧口径相等）；银河页多出约 242KB CSS 的加载影响未测。
- 本轮改动可能引入的新风险：白名单外页面首次点击无预热、一律等回源；`?url` + `<link precedence>` 依赖 vinext 对 React 19 资源提示的 SSR 输出，未在跨部署旧缓存下验证；galaxy 嵌套 layout 可能影响该路由段的既有布局/样式顺序（未做视觉比对）；覆盖率口径变化会使 coverage24h 与旧值不连续，不可与此前数字直接比较；默认回环绑定会改变任何直连 :8080 的探测方式。
- 文档同步：PERFORMANCE_2026-10-06.md 加「2026-10-11 修订」说明行为变化并声明测量为修订前；deploy/status/README.md 的 reading-fonts.tsx 文件表行改为已删除；CLOUDFLARE_RUNBOOK.md 状态页两处改为已部署回环绑定及证据指针。

## 2026-10-11 Agent 接入一期

- 状态：部分完成。按本轮用户需求在 `feat/agent-connect` 工作区增加个人 API key、精确能力表、MCP JSON-RPC 端点、key 管理页面/API、共享产品函数、Skill、迁移/Drizzle schema、测试与文档。已在本地分支 feat/agent-connect 提交（哈希以 git log 为准），未推送，未切分支。
- 安全语义变更：从“无个人 API key 身份入口”改为“`zc_` key 只允许 `POST /api/mcp`，其他 method+pathname 在路由前拒绝”；触发依据为本轮用户规格第 1 条。`USER_KEY_CAPABILITIES` 与 `AGENT_WRITE_CAPABILITIES` 分表。Worker scope 闸位于公开 origin 配置解析之前；身份 key 分支清除 admin/founder/agent 权限；无效 `zc_` 不回落 Cookie；MCP Cookie-only 认证拒绝并带 `WWW-Authenticate: Bearer`。文档已同步 `CLAUDE.md`。
- 产品行为复用现有产品创建校验和每日 10 次限额；MCP JSON 请求体上限为 11 MiB，封面解码后沿用现有 10 MiB 图片上限并调用 `storeScannedUpload` 扫描路径；已存在的 `product_material_change_requires_review` SQL trigger 被复用，没有新增触发器。新增序列测试包含创建/列出/吊销/过期/容量、能力边界、MCP 协议、11 MiB 请求体拒绝、产品归属与审核重置、上传扫描分支，但本轮因构建启动失败未执行集成套件。
- 独立只读复核发现 MCP 未执行 `additionalProperties:false`，可用未声明的 `image_url`/`imageUrl` 绕过扫描写入。代码现于 `app/api/mcp/route.ts` 按每个工具 schema 拒绝未知字段/类型/枚举越界；14 号 upload suite 增加 create/update 的 HTTP 错误结果与 DB 不变断言，并保留 clean 扫描封面正例。新增断言未运行，当前只有 TypeScript/定向 ESLint 静态结果。
- 待用户决策：同一 MCP 请求同时有跨站 `Origin` 与缺失/无效 Bearer 时，规格分别要求 403 与 401+challenge；当前代码先校验 Origin，返回 403。已向用户提供两种后果并询问优先级；在答复前不改变该响应顺序，也不把此边界列为已验证。
- 本轮自检：`npx tsc --noEmit` exit=0；`npx eslint` 对本轮 TS/TSX/MJS 文件 exit=0；`node --experimental-strip-types tests/user-api-key-capabilities.test.mjs` exit=0，2 pass / 0 fail / 0 skipped / 0 todo；内存 SQLite 迁移检查曾断言 9 列、token hash 唯一索引和 member FK 均为 true。`git diff --check` exit=0，但 Git 同时对原有 `qa-runs/` 文件输出 Permission denied。`npm run lint` exit=1，报错只在既有 `promo/v60/cap/lattice-probe.mjs`、`tmp/build-zaochang-ppt.cjs`、`tmp/gen-ppt-images.cjs`。`npm run db:generate` exit=1，Drizzle 读取配置后 `spawn EPERM`，未取得 `No schema changes`；`drizzle/meta/0030_snapshot.json` 因此为手工构造，需在可启动子进程的环境重新生成并对比。`npm test` exit=1，`vinext build` 在 Vite externalize-deps 阶段因 `spawn EPERM` 失败，未启动 Wrangler preview :4179，14 号串行 HTTP/DB suite 未执行。
- 已知取舍/不证明事项：纯 Node 能力表断言证明表内容和身份 flag 条件，不证明 Worker 运行时拦截、MCP 请求行为或数据库副作用；TypeScript 与 targeted ESLint 不证明端到端行为。假扫描器集成用例未运行；真实扫描器、真实客户端配置导入和生产部署均未验证。OAuth/MCP 授权规范按决策留到二期。
- 未覆盖范围：未执行 `tests/suites/14-agent-connect.tests.mjs` 和现有全套 serial suites；未执行 Wrangler preview :4179；没有运行时覆盖 Origin 归一化、请求体 11 MiB 边界、工具级限流及扫描超时失败，也没有配置缺失时 Worker scope 闸仍返回 403 的 HTTP 断言；没有实际浏览器验证 key 明文一次性呈现/复制/客户端配置片段；未在可运行 Drizzle subprocess 的环境验证 schema generator 零差异；没有生产环境验证。安全失败分支仍须等端到端套件在可启动构建环境里执行。
- 本轮改动可能引入的新风险：worker 在路由前新增 `zc_` method+pathname 拦截，若前缀识别或路径规范化与部署路由不一致，可能错误放行或拒绝；MCP Origin 允许当前请求 origin 与配置的公开 origin，生产域名配置未验证；手工 snapshot 可能与 Drizzle 生成格式/数据库 schema 产生漂移；共享 create 函数对 REST 的响应形状和错误时序尚未用 HTTP 回归测试证明；工具参数拒绝及封面扫描不可绕过目前只有代码与未执行测试断言，尚无 HTTP/DB 反例实测。当前证据不能作为发布验收依据。
- 本轮修订（2026-10-11，状态仍为**部分完成**）：
  - F1：语义变更：从“`upload_cover` 只受每 key 60/分钟 MCP 限流”改为“扫描前另消耗 `rateLimitKey("upload", member.email)` 的每会员 30/3600 秒额度”；依据为本轮用户规格 F1。`app/api/mcp/route.ts` 复用 REST 键和窗口。14 号套件新增 `agent connect: upload_cover shares the member upload limit before scanner invocation`，预置生产同格式哈希 bucket 的 30 次计数，并断言 MCP `isError === true`、`error === "rate_limit_exceeded"`、`uploaded_files` 行数不变、扫描器请求计数不变、限流计数变为 31。
  - F2：语义变更：从“API key POST/DELETE 不检查 Origin”改为“Cookie 会话创建/吊销在解析与写入前要求 `assertSameOrigin` 通过”；依据为本轮用户规格 F2。新增 `agent connect: API-key writes reject foreign Origin without changing key rows`，断言跨站创建与吊销均为 403，创建前后行数一致且目标 key `revoked_at === null`。套件内 Cookie 创建与吊销请求已补本站 `origin: baseUrl`。
  - F3：语义变更：从“REST/MCP 共用函数均接受 camelCase 与 snake_case 字段”改为“共享函数只读 camelCase，snake_case 转换仅在 MCP 工具层执行”；依据为本轮用户规格 F3。`app/api/_lib/products.ts` 共享输入只读 camelCase；`app/api/mcp/route.ts` 映射 `demo_url`、`pricing_model`、`cover_theme`，封面仍只由 `cover_upload_key` 转为内部 `imageUrl`。工具 schema 与白名单未扩展。新增 `agent connect: REST product creation ignores snake_case image_url`，断言 REST POST 为 201 且该产品 `image_url === null`；既有 MCP 创建用例另断言 `pricing_model: "free"` 映射结果为 `pricingModel === "free"`。
- 本轮自检：`npx tsc --noEmit` exit=0；定向 `npx eslint --max-warnings=0`（本轮修改的 3 个 TS 路由/库文件与 2 个 MJS 文件）exit=0；原样执行 `node --experimental-strip-types --test tests/user-api-key-capabilities.test.mjs tests/hyperknow-hardening.test.mjs` 因 Node test runner `spawn EPERM`，0 个用例启动；增加 `--test-isolation=none` 后同两文件为 25 pass / 0 fail / 0 skipped / 0 todo，证明的是这两组纯 Node 断言，不证明 Worker HTTP/DB 行为。`git diff --check` exit=0，但 Git 对工作区既有 `qa-runs/` 文件输出 Permission denied 与换行警告。14 号集成套件及全量 `npm test` 未在本轮运行，按用户要求由外部执行。
- 仍存在的已知缺口：
  - 六处页面/路由直接用 `isAdminEmail(member.email)` / `isFounderEmail(member.email)` 判角色而不检查 `authVia`；当前 API key 隔离依赖 Worker 入口能力闸这一层防线。
  - `get_product` / `update_product` 对他人项目返回 `not_owned`（403），对不存在项目返回 `not_found`（404），可据响应探测项目 ID 是否存在。
  - MCP 路由自身的 11 MiB 请求检查会先被 Worker 入口闸拦截；现有测试观察的是 Worker 返回 `request_too_large`，没有直接覆盖 MCP 路由检查分支。
- 未覆盖范围：本轮未执行 `tests/suites/14-agent-connect.tests.mjs`（含上述 3 个新增集成断言）和 `tests/suites/08-community-uploads.tests.mjs`；因此没有在 Wrangler preview/D1/R2 上观察跨站拒绝、REST 入库值、共享限流写入或扫描器计数。真实 ClamAV、生产部署、无 Origin 的 `assertSameOrigin` 分支和 MCP 路由独立 11 MiB 分支未验证。用户提供的上一轮 `npm test` 626/626 结果不是本轮新增证据。
- 本轮改动可能引入的新风险：`upload` 桶现由 REST 与 MCP 共享，任一通道耗尽会员的 30 次额度会同时阻止另一通道封面上传，这是规格要求的共享配额取舍；`assertSameOrigin` 沿用公共 helper 对缺失 Origin 的既有放行语义，本轮测试只证明显式跨站 Origin 被拒。改动集按 `git diff --stat` 核对为 14 个已跟踪文件（本轮开始前已是 14 个；本轮增加的 Agent 接入源文件与套件原本为未跟踪状态，另由 `git status --short` 核对）；不能把整个工作区 diff 归为本轮 F1–F3。
- 工作区可见性限制：沙箱中 `git status --short` 将 `qa-runs/2026-10-02-visual-audit/` 与 `qa-runs/2026-10-03-regression/` 下多条路径列为 `D`，但读取/`git diff` 同一批路径报 `Permission denied`，`Test-Path` 也返回访问拒绝；本轮无法判定文件实际是否缺失，未对这些路径写入、删除或恢复。
- 提交前最终验证（2026-10-11）：`npm test` 退出码 0，tests 629 / pass 629 / fail 0 / skipped 0 / todo 0，日志 `npm-test-phase1-r3.txt`（会话 scratchpad）；`14-agent-connect` 的 13 个 `agent connect` 用例全部 ✔，含 F1 `upload_cover shares the member upload limit before scanner invocation`、F2 `API-key writes reject foreign Origin without changing key rows`、F3 `REST product creation ignores snake_case image_url`。`npx tsc --noEmit` 退出码 0；`npm run db:generate` 退出码 0，输出 `No schema changes, nothing to migrate`。
- 本条取代本节前文中 `npm test exit=1`、`db:generate` 的 EPERM、「未执行 14 号套件」等 r3 之前的旧结论；那些段落保留作历史记录，不改写。
- 阻断发布前提（未解决）：(1) key 管理页面未在浏览器验证（一次性明文、复制、客户端配置片段）；(2) 未用真实 MCP 客户端（`claude mcp add` / Codex）接入；(3) `public/skills/zaochang/SKILL.md` 未人工核对；(4) 6 个文件共 8 处按邮箱判角色且未检查 `authVia` 的判定（清单见下方更正）目前只靠 worker 入口闸一层防线挡住 key；(5) 真实 ClamAV 与生产环境未验证。
- 更正（提交后核对，2026-10-11）：上文「已知缺口」第一条及提交说明中「`access-control.ts:47,48,96,110` 未检查 authVia」已过时。`app/api/_lib/access-control.ts:46`（`hasRole`；`:74` 的 `requireRole` 经此判定，覆盖 requireAdmin/requireFounder）、`:95`（requireAdminOrAgent）、`:109`（requireDocEditor）已加 `authVia === "api_key"` 守卫。以 `grep -rn "isAdminEmail(|isFounderEmail(" app worker` 重新检索，未守卫判定为：`app/api/uploads/[key]/route.ts:43`（访问判定：待审封面可见性）、`app/api/_lib/hyperknow/credits.ts:47`（套餐判定：founder 邮箱得 MAX，按调用方传入的邮箱判定，由 hyperknow 路由调用，MCP 不引用）、`app/api/community/route.ts:40`（响应展示 isFounder）、`app/layout.tsx:39-40`、`app/profile/page.tsx:21-22`、`app/founder/page.tsx:34`（页面展示标志）。
- 以上 6 个文件 8 处判定目前只被 worker 入口闸挡住，key 无法到达；它们没有单独的测试证明「闸失效时仍被拒」。若闸失效：uploads 与 credits 两处会把 key 主人的邮箱当作白名单角色做出访问或套餐判定，违反「key 永不继承特权」不变量。
- 本轮角色身份来源收口（本轮用户任务第 1–4 项；状态仍为**部分完成**）：语义变更：从 `authVia === "api_key"` 黑名单（按邮箱判角色时拒绝 `api_key`，但 `session`、`legacy`、`agent`、缺失值及未来未知值仍可能通过）改为 fail-closed 白名单（仅 `session` / `legacy` 可按邮箱持有 admin/founder；`api_key`、`agent`、`undefined`、`oauth` 及任何其它值均拒绝）。`requireAdminOrAgent` 与 `requireDocEditor` 的 `member.isAgent` 既有放行分支保留。依据为本轮用户任务第 1–3 项；`CLAUDE.md` 的 Access control is modularized 段已同步。`app/api/uploads/[key]/route.ts`、`app/api/community/route.ts`、`app/layout.tsx`、`app/profile/page.tsx`、`app/founder/page.tsx` 的 7 处展示/访问判定改用 `hasRole`；第 8 处原在 `app/api/_lib/hyperknow/credits.ts` 的 founder 默认 MAX 判定改为传递 `{ email, authVia }` 并经 `hasRole(..., "founder")`。credits 先沿用 `HK_USER_TIERS` / `HK_MAX_USERS` 付费映射；无付费映射时，若 founder 邮箱的身份来源不合格则在积分查询/扣费前返回 403，防止同邮箱已存在的同日高余额继续被使用；幂等扣费在检查或写租约前先校验该身份。新增 `tests/role-eligibility.test.mjs`，测试名为 `email whitelist role eligibility accepts only session and legacy auth`、`email whitelist calls stay within the centralized access-control module`、`all email-role guards call the fail-closed eligibility helper`、`ineligible founder identities cannot reuse shared same-day credits`；并注册到 `npm test`。本轮未修改 `USER_KEY_CAPABILITIES`、Worker 入口闸或 `resolveUserApiKey`。
- 独立复核补出的 credits 反例及处理（已撤回）：Codex 曾把 `ensureFreshRow` 改为同日余额封顶 `MIN(balance, excluded.balance)`，以防「`HK_USER_TIERS` 把 founder 邮箱降到 PRO/FREE + 非会话身份 + 当日已有 500 余额」。该场景需要非会话身份进入 hyperknow 路由（worker 入口闸已拦 key），且会改变所有用户日中降档时的余额，超出本轮范围，已撤回为原语义（同日余额不变）。该反例记为已知缺口：仅在 worker 闸失效且套餐配置日中下调时成立。
- 自检（本轮，工作区 `feat/agent-connect`，HEAD 未变为 `51577f54804e1bf2c6d4d1473301b7edf9b1bb09`）：`npx tsc --noEmit` exit=0；对本轮全部 TS/TSX/MJS 目标运行 `npx eslint --max-warnings=0 ...` exit=0；指定的 `node --experimental-strip-types --test tests/role-eligibility.test.mjs tests/user-api-key-capabilities.test.mjs` exit=1，Node test runner 两个文件均报 `spawn EPERM`，0 个测试启动；加 `--test-isolation=none` 并连同 `tests/hyperknow-hardening.test.mjs tests/agent-admin-api.test.mjs` 运行，exit=0，41 pass / 0 fail / 0 skipped / 0 todo。`git diff --check` exit=0，但 Git 输出 1578 行既有 `qa-runs/` 路径 `Permission denied` 诊断；这些路径没有写入。本轮未运行全量 `npm test`、`vinext build` 或 `db:generate`；629/629 是用户给出的改动前基线，不是本轮结果。
- 未覆盖范围（角色与 credits）：未运行 `tests/suites/01-render.tests.mjs`、`02-docs-books.tests.mjs`、`03-auth-invite.tests.mjs`、`05-products-review.tests.mjs`、`07-oidc-external.tests.mjs`、`08-community-uploads.tests.mjs`、`09-agent-ai.tests.mjs`、`10-ledger-misc.tests.mjs`、`14-agent-connect.tests.mjs`；这些 HTTP suites 的现有身份头由 harness 以 `APP_ENV=test` 解析成 `authVia: "legacy"`，没有找到 admin/founder 保护路由与 Cookie `authVia: "session"` 的组合用例，因此 session-cookie 管理员 HTTP 路径未验证。无 D1 运行时断言覆盖“500 同日余额 + PRO/FREE 映射”SQL 行为；本轮只执行了源码契约。未来 OAuth、缺失/未知 authVia 的实际 HTTP 403、agent 放行运行时和页面渲染均未做 HTTP/浏览器验证。依据 `rg` AST 源码契约扫描结果，`app/`、`worker/` 的 `.ts/.tsx` 邮箱白名单调用已集中在 `access-control.ts`；该源码扫描不证明请求运行行为。
- 本轮改动可能引入的新风险：邮箱白名单现在拒绝任何非 `session`/`legacy` 来源，若未来合法管理员身份源未显式获批或身份解析丢失 `authVia`，会收到 403；credits 付费映射仍按邮箱生效且先于角色检查，配置 `MAX` 仍可独立给予 MAX。
- 已知取舍/已知不证明事项：41 个 Node 用例包含身份值断言、AST 源码契约和既有源码契约；它们证明本地函数返回值与代码结构断言，不证明 HTTP 身份链、D1 SQL 执行、数据库最终余额或 session admin 页面行为。要求的隔离默认 Node 命令因 `spawn EPERM` 未启动测试；非隔离替代命令有完整统计。全量 `npm test` 的改前 629/629 结果不等于改后统计。本条状态仍为**部分完成**，未提交、未推送、未切分支。

## Agent 接入二期：MCP OAuth 授权与防滥用（2026-10-11）

- 状态：**部分完成**。代码、迁移草案、发现文档、配置文案和测试用例已写入工作区；端到端 HTTP 套件、D1 迁移执行、`db:generate` 无漂移检查未运行，因此不作为已验收结论。保留并叠加在本轮原有角色白名单改动上；未切分支、未提交、未推送。
- 做了：增加动态注册、resource 绑定、MCP 专用 bearer 解析、授权/撤销、限流、写审计及 purge 代码；改动锚点见 `app/api/oauth/register/route.ts:68`、`app/api/_lib/oauth-provider.ts:899`、`app/api/mcp/route.ts:300`、`app/api/_lib/purge/oauth-provider.ts:10`。新增串行 HTTP suite 并注册到 runner，但本轮未启动该 suite。
- 没做：未执行 D1 migration、`npm run db:generate`、`npm test`、`vinext build`；这些命令按用户沙箱说明留给外部环境。
- 语义变更：从「生产环境所有本机回跳禁止」改为「仅 `registration_source=dynamic` 且授权用途允许本机回跳」，URI/端口精确匹配；支付用途仍拒绝。依据：用户本轮决策 1。代码分支：`app/api/_lib/loopback-redirect.ts:10` 的 `return input.registrationSource === "dynamic" && input.purpose === "authorization";`；契约矩阵：`tests/loopback-redirect.test.mjs`。
- 语义变更：MCP 限流从「每凭据 60 次/分」改为「每凭据 60 次/分 + 每会员各凭据合计 120 次/分」。依据：用户本轮防滥用 5。代码：`app/api/mcp/route.ts:355` 的 `await enforceRateLimit(await rateLimitKey("mcp-member", member.email), 120, 60);`；预置桶拒绝断言：`tests/suites/15-mcp-oauth.tests.mjs` 的 MCP 会员合计限流用例（本轮未执行该 HTTP suite）。
- 语义变更：动态 consent 上限从「同客户端任何历史 consent 均免计数」改为「仅同客户端当前活跃 consent 免计数，已撤销 consent 重新授权时重新计入上限」，从而防止撤销后在已有 10 个活跃客户端时重开第 11 个。依据：用户本轮防滥用 4 的“同时有效上限”。代码：`app/api/_lib/oauth-provider.ts` 中 `AND revoked_at IS NULL`；数据库触发器同样只豁免活跃 consent。集成断言已加入 `tests/suites/15-mcp-oauth.tests.mjs`，HTTP suite 未执行。
- 本轮改动可能引入的新风险：`git diff --stat` 显示 33 个 tracked 文件、650 insertions / 197 deletions（另有新文件，须以 `git status --short` 一并查看；工作区含先前角色白名单改动）。若 MCP 写入后审计结果更新失败，数据库保留 `audit_incomplete` 记录且请求报错；不能据此推断产品/封面写入已回滚。D1 迁移与 ORM snapshot 尚未由生成器对账。
- 写审计失败语义与覆盖：审计首写失败在调用工具前回 `audit_unavailable`，测试断言产品行数不变；审计结果更新失败发生于产品写入之后，响应仍报错但产品行保留、审计行是 `audit_incomplete`，测试断言此现场状态。`tests/suites/15-mcp-oauth.tests.mjs` 用本地测试 D1 临时创建的触发器注入两种故障；该触发器不在生产迁移或 Worker 代码中。HTTP suite 本轮未执行，因此这些断言仍未取得运行证据；事故发生于结果回写失败时，调用方不可据 503 推断写入未生效。
- 已知取舍/已知不证明事项：动态客户端通过可空 `owner_email` 与 `registration_source` 区分，不创建会员占位行；DB CHECK/触发器限制 dynamic 客户端的 public/unverified/no-write/MCP scope 属性。MCP 写审计只存身份、凭据、工具、产品 ID、结果与时间，不存请求体/封面。MCP OAuth 不进入全局会员解析器；`zca_` 只在 `/api/mcp` 解析。源代码与纯 Node 契约用例不证明生产部署、浏览器客户端互操作或 D1 上迁移/触发器的实际行为。
- 未覆盖范围：未运行 `tests/suites/15-mcp-oauth.tests.mjs`、更新后的 `tests/suites/07-oidc-external.tests.mjs` 与 `tests/suites/14-agent-connect.tests.mjs` HTTP 运行；未执行 `drizzle/0031_mcp_oauth.sql`、`npm run db:generate`、`npm test`、`vinext build`（按用户要求留给外部环境）；未验证真实 D1 上迁移/外键/触发器、生产部署后的 OAuth 浏览器往返与 Claude/Codex 客户端交互、生产支付 return_uri 分支。上述缺口使本条维持「部分完成」。
- 自检记录：`npx tsc --noEmit` exit=0；对 36 个可访问的 TS/TSX/MJS 目标运行 `npx eslint --max-warnings=0` exit=0；纯 Node 契约组命令 `node --experimental-strip-types --test --test-isolation=none tests/loopback-redirect.test.mjs tests/role-eligibility.test.mjs tests/user-api-key-capabilities.test.mjs tests/worker-contracts.test.mjs tests/hyperknow-hardening.test.mjs tests/agent-admin-api.test.mjs` exit=0，81 pass / 0 fail / 0 skipped / 0 todo；单独运行 `tests/loopback-redirect.test.mjs` 为 3 pass / 0 fail。`git diff --check` exit=0，但 Git 同时输出 1,594 条 `qa-runs/` `Permission denied` 诊断及 CRLF 提示；未触碰这些路径。一次组合契约运行先发现 purge 扩容后的旧 `{ ok: 8 }` 断言，因新增 3 条 purge 注册语句后为 11 成功，已更新对应成功数及日志数并重跑得到上述 81/81。
- 2026-10-12 本地真实客户端验收与修复（本轮 Claude 侧；状态仍为**部分完成**）：在本机 wrangler dev（全新本地 D1，迁移 0000–0031，假扫描器，APP_ENV=test）上用真实客户端跑端到端，暴露并修复 6 个自动化测试没覆盖的问题：
  1. `app/api/mcp/route.ts` initialize 对未知协议版本返回 `-32602`，Claude Code 2.1.296 用个人 key 连接被拒；改为回落到最新支持版本 `2025-06-18`，并对协商后请求中不支持的 `MCP-Protocol-Version` 头返回 400（initialize 不校验该头）。suite 14 补断言：`2099-01-01` → result.protocolVersion=`2025-06-18`；缺 protocolVersion → -32602；坏头 → 400；正确头 → 200。
  2. Codex CLI 0.162 动态注册时把 `/.well-known/oauth-authorization-server` 的 `scopes_supported` 原样作为注册 scope（实抓请求体含 `fruit:pay` 等），被正确拒绝导致无法接入；该文档改为只公布 `mcp:projects`（RFC 8414 允许部分公布），OIDC 发现文档保持全量不变。
  3. 动态客户端注册的空字符串 scope、以及授权请求缺省 scope，改为默认 `mcp:projects`；开发者客户端缺 scope 仍拒绝（suite 15 新增 `dynamic clients default to mcp:projects when the authorization request omits scope`，含开发者客户端反例）。
  4. Claude Code 注册名为 `Claude Code (zaochang)`（括号内是用户本地服务器名），被防冒充规则拒绝；改为只检查末尾括号前的主名称，整名只有括号时回退检查全名。suite 15 补：`Claude Code (zaochang)` → 201；`造场官方 (Claude Code)`、`(zaochang)` → 400。
  5. 授权同意页警示框 flex 布局把说明文字挤成窄列、手机宽度截断回跳地址；文字包进单一 span、回跳地址独占一行可断行。
  6. key 管理区块的 Claude Code OAuth 片段把中文说明放进了可复制代码块；改为两条可执行命令（`claude mcp add …` + `claude mcp login zaochang`，后者本机实测可用），说明移到代码块外；「Codex config.toml」标签改为「Codex CLI」；小标题跨整行。SKILL.md 占位符 `<PUBLIC_APP_ORIGIN>` 改为 `https://aetherstudio.top`，补 `claude mcp login` 用法。
  另修：Codex 手写的 `drizzle/meta/0031_snapshot.json` 与 schema 的 CHECK 文本空白不一致导致 `db:generate` 生成 0032，已用生成器输出替换快照并删除 0032；`tests/harness/preview.mjs` 迁移清单漏 0031，已补；suite 15 的测试代码错误（null 原型行直接 deepStrictEqual、key 名超 60 字、名称含 admin 被规则拦、响应体读两次、标题超 36 字截断）已修。撤回 Codex 在 credits 加的同日余额封顶（超范围，改变所有用户日中降档行为）。
  真实客户端证据（本地，非生产）：Claude Code `claude -p`（个人 key）create_product → D1 行 owner=会话用户、pending_review、审计 `api_key:create_product:ok`；Codex CLI `codex mcp login`（DCR→同意页→回跳→换 token，输出 Successfully logged in）后 `codex exec` create_product → D1 行审计 `oauth`、client_name `Codex`、token resource=`<origin>/api/mcp`、scope `mcp:projects`；Claude Code `claude mcp login`（伪终端，输出 Authenticated with "zaochang"）后 `claude -p` create_product → 审计 `oauth`、client_name `Claude Code (zaochang)`。无头 Chrome 截图：key 区块创建后明文显示一次、刷新后页面源码不含明文、390px 无横向溢出；同意页桌面/手机无横向溢出。测试后已 logout 两个客户端的 OAuth 凭据并移除临时 MCP 配置。
  未覆盖：生产环境（未部署、生产 D1 未执行 0031）；Cursor 等其它客户端；`/.well-known/oauth-authorization-server` 无 CORS 头（与现有 OIDC 发现一致，浏览器内 MCP 客户端可能需要）；审计结果回写失败时产品已写入但响应报错，客户端重试可能造成重复提交（已由测试固定现场状态，未做幂等）。
- 2026-10-12 0031 迁移阻断级缺陷（已修，本地验证）：Codex 写的 `drizzle/0031_mcp_oauth.sql` 用 `PRAGMA foreign_keys=OFF` 重建被 9 张子表引用的 `oauth_provider_clients`。D1 恒开外键且在事务内忽略该 PRAGMA，在「已有开发者客户端 + 子表行」的本地 D1 上执行报 `FOREIGN KEY constraint failed`（整文件回滚），按 CLOUDFLARE_RUNBOOK §3 在生产执行会失败。语义变更：从 `PRAGMA foreign_keys=OFF/ON` 改为 `PRAGMA defer_foreign_keys=ON/OFF`（同 0008 写法）。修复后同一有数据库执行 exit=0：既有客户端保留且 `registration_source='developer'`、`review_status='verified'` 不变，5 张子表行数不变，`PRAGMA foreign_key_check` 为空。`tests/harness/preview.mjs` 在 0031 前灌入既有客户端与子表行、迁移后断言数据、`foreign_key_check` 为空、孤儿子行插入仍报外键错误；反向验证：临时改回旧 PRAGMA 时测试环境初始化以 `FOREIGN KEY constraint failed` 失败（exit=1）。最终全量 `npm test` 651/651、0 fail/0 skipped/0 todo；`tsc`、`db:generate`（No schema changes）、`git diff --check`、36 个改动文件 ESLint 均 exit=0。未验证：生产 D1 的实际数据规模与 external_fruit_* 子表有数据时的执行（本地种子未含这两张表的行）。状态仍为**部分完成**：未提交、未推送、未部署，生产 D1 未执行 0031。
- 2026-10-12 Agent 接入上线（一期+二期；状态：**部分完成**——生产端到端未由真实用户跑通）：
  - 生产 D1：按 CLOUDFLARE_RUNBOOK §3 先导出备份 `backups/pre-agent-connect-20261012.sql`（1,942,035 字节，本机 ignored；导入副本 `integrity_check`=ok），在该真实数据副本上以「外键开启、事务内」重放 0030+0031：执行成功、`foreign_key_check` 空、各表行数不变。生产账本 30 行与 journal 0000–0029 逐条一致后，`wrangler d1 execute --remote --file` 依次执行 0030、0031，并回填 `__drizzle_migrations`（hash=LF 归一 SQL 的 sha256：0030 `94776932…`/when 1791726899864，0031 `f9ec82cc…`/when 1791763587038）。生产核对：新列/新表/3 个触发器存在、`pragma_foreign_key_check` 0 行、账本 32 行与 journal 逐条一致（6 行为历史 tag 白名单）。
  - 代码：PR #8 合并为 `d29a7d0`。首次部署 run 38192095578 在部署工作流内重跑 npm test 时 650/651（「MCP rejects request bodies above 11 MiB」偶发 write ECONNRESET，客户端写 11 MiB 与服务端 413 后断开的竞态），Worker 未部署。`e775d3d` 改为只声明超限 content-length（断言不变），本地连跑 3 次 13/13。CI run 38192394795 成功；部署 run 38192550648 成功：npm test 651/651、0 fail/0 skipped/0 todo，迁移检查「所有本地迁移均已应用到生产」，Current Version ID `cdbab1fc-8dee-46f1-ab8f-b480e8dba610`。
  - 线上只读冒烟（经 --resolve 104.21.48.47）：资源元数据 resource=`https://aetherstudio.top/api/mcp`；授权服务器元数据 scopes_supported=["mcp:projects"]、registration_endpoint 存在；OIDC 发现仍含 fruit:pay 且新增 mcp:projects；/api/mcp 无凭据 401 + `resource_metadata`；无效 zc_ → 401 invalid_api_key；zc_ 访问 /api/admin/moderation → 403 user_api_key_scope_forbidden；无效 zca_ → 401 `error="invalid_token"`；自定义 scheme 注册 → 400；Skill 200；首页/登录 200；/profile/edit 未登录 307。冒烟后生产 clients/api_keys/audits 均 0 行。
  - 未验证：生产上真实用户的 key 创建、OAuth 授权往返与 MCP 写入（需要真实造场账号在浏览器登录）；真实 ClamAV 扫描 upload_cover；Cursor 等其它客户端。
- 2026-10-12 生产 OAuth 同意页修复（用户实测 Claude Code `/mcp` 登录卡住）：同意页 CSP 为 `form-action 'self'`，Chrome 把「表单提交后的 303 重定向」也按 form-action 检查，跳往客户端回调（`http://localhost:端口/callback`）被拦——授权码已签发、页面看似原地刷新，再点提示授权请求失效，客户端收不到回调。此前本地验收用脚本发请求，绕过了浏览器 CSP，未测出。修复：`app/api/oauth/authorize/route.ts` 改为返回 `text/html` 中转页（meta refresh + 手动链接），不再 303，不放宽任何 CSP。真实 Chrome 验证（本地 wrangler dev + CDP 点击「允许」+ 本机回调监听）：修复后最终 URL 为回调地址、监听端收到 1 次带 code 的回调；临时改回 303 时回调 0 次，Chrome 控制台报 `Sending form data … violates … "form-action 'self'"`。suite 07/15 改用 `consentCallback()` 断言 200 + text/html + 无 Location + CSP 仍为 `form-action 'self'` 并从 meta refresh 取回调。全量 `npm test` 651/651、0 fail/0 skipped/0 todo；tsc、git diff --check、eslint exit 0。已知同类遗留（未修，涉及扣款）：`app/api/v1/fruit/payments/approve/route.ts:14` 支付确认表单提交后同样 303 跳第三方 `return_uri`，浏览器会被同一 CSP 拦下（扣款已发生但用户回不到应用）；生产目前 0 个第三方客户端，尚未触发。
- 2026-10-12 生产 OAuth 端到端（同意页修复后，版本 3298ed52）：用户在 Claude Code 内 `/mcp` 授权成功（输出 "Authentication successful. Connected to zaochang."）；本会话经该 OAuth 连接调用 `list_my_products` 返回 `{"products":[]}`。生产 D1 只读核对：动态客户端 1 个（`Claude Code (zaochang)`、dynamic、无 owner、`mcp:projects`、unverified、回跳 `http://localhost:47518/callback`），consent 1 条有效，access/refresh token 各 1 个且 `resource=https://aetherstudio.top/api/mcp`、scope `mcp:projects`。未验证：生产写工具（create/update/upload_cover）与真实 ClamAV；个人 key 路径在生产未实测。
- 2026-10-12 静态项目托管(StepFun Page)与上传容量加固 —— **部分完成:代码在分支 `feat/page-hosting`,未合并 main、未推送、未部署、生产迁移 0032 与盒子部署器均未执行。**
  - 范围与结构:P0(扫描器有界排队、Worker 对 `scanner_busy` 退避重试、全站上传桶 120/小时、外链 demo 提示)+ 托管全链路(契约 `deploy/hosting/CONTRACT.md`;迁移 `0032_page_hosting.sql`:授权/托管行/上传令牌表、触发器、视图 `product_hosted_urls`;zip 校验器 `app/api/_lib/hosting-bundle.ts`;Worker 核心 `app/api/_lib/hosting.ts` 与 `/api/hosting*`、`/api/hosting-worker/*`、`/api/admin/hosting-grants`;盒子部署器 `deploy/hosting/`;MCP 工具 `begin_hosting_upload`/`get_hosting_status`/`remove_hosting`;成员面板、管理员审核与授权、产品页托管链接)。由 Codex gpt-6-luna(max)按工作包并行实现(P0/S/S2/B/D/D2/A/U/M),Claude 逐包审查、合并、外部跑集成测试与修复。
  - 审查发现并已修的设计缺陷:① 批准原按 `review_version` 绑定,与包无关的编辑(改标题、已 live 后重审)会让 `hosting_not_staged` 死锁 → 改按 `hosting_revision` 绑定;② 部署器对「deploy 通用错误」一律转人工对账 → 按 `list` 是否存在同名站点分流(无站点=无副作用,按原错误分类可重试);③ 部署器只信声明尺寸 → 增加逐成员实际展开量/CRC 校验(Worker 侧校验器只读声明值,ClamAV 对超限成员默认静默跳过);④ 移除请求后链接仍经视图暴露 → 视图要求 `desired='live'`;⑤ D1 的 `meta.changes` 含触发器变更,提交批的 `changes===1` 断言会让成功提交误报 404 → 放宽。另:suite16 把全站上传桶钉到 120 后未还原,会 429 误伤后续套件 → 用例后还原。
  - 验证(最终 HEAD,本机 Windows):`npm test` 808/808、0 fail/0 skipped/0 todo;`tsc --noEmit` exit 0;`eslint . --max-warnings=0`(排除未跟踪的 tmp/、promo/)exit 0;`git diff --check 23d8aa3..HEAD` exit 0;`npm run db:generate` 输出 No schema changes;`npm audit --omit=dev --audit-level=high` exit 0(2 个 low)。迁移 0032 在已有会员/上传/产品/审计行的本地 D1(外键开启)上应用通过,重建后行保留、`PRAGMA foreign_key_check` 为空、触发器重建(harness 断言)。
  - 端到端:① 真 Worker + 真部署器进程 + 假 CLI(`e2e-hosting-local.mjs`):提交→暂存(预览 7 天过期)→管理员队列可见→批准→promote→产品页出现托管链接→MCP 改标题后链接隐藏→再批准无需重传→移除→D1 行 removed;CLI 调用序列 `deploy→preview expiry→get→promote→get→preview revoke→get→delete`,deploy/delete 各 1 次、无 `list`。② 真 Worker + 真部署器 + **真钉版本 `steppage` CLI + 真 StepFun 账号**(`e2e-hosting-real.mjs`):站点 `zc-p13-h13` 暂存→批准→上线(`https://warm-harbor-d0cf.page.stepcloud.com`,经大陆盒子取到的线上响应头含 `x-zc-probe: 1`、`x-content-type-options: nosniff`;预览上不含)→部署器删除,账号回到原有 2 个站点。③ 无头 Chrome(`ui-hosting.mjs`):成员面板(失败态中文提示、3/3 配额)、产品页托管块(href 等于视图返回值、`rel="noopener noreferrer nofollow"`、`target=_blank`)、未批准产品无托管块、管理员审核卡(staged 备注后可批准,failed 禁用)、授权表单、手机宽度无横向溢出、控制台无错误。④ 盒子真实 ClamAV:EICAR 放进 deflate 与 stored 两种 zip 均判 `infected`(`Eicar-Test-Signature`),单次约 10s。
  - 未验证 / 缺口(不得据本条宣称可用):生产 D1 迁移 0032 与 `d1_migrations` 回填;生产 Worker 的 `HOSTING_DEPLOYER_TOKEN`;盒子上部署器 systemd 实装(unit 须取 LF 版本,Windows 检出为 CRLF)、真实 Node 22.23 下的内存占用与 SIGTERM;P0 的盒子扫描器新文件未部署(Worker 重试对旧扫描器也有效,但队列未生效);StepFun 站点/版本额度上限、价格、自定义域名、托管第三方内容的条款均未确认;`*.page.stepcloud.com` 子域间 Cookie 隔离未测;Worker 处理 10 MiB zip 的内存峰值未测;`promote` 的 stdout 形态未实测(部署器以退出码 + `get` 校验兜底);OAuth 凭据路径的 `begin_hosting_upload` 未单独覆盖;R2 孤儿 bundle 的回收未做(失败批后保留 clean 对象);StepFun Page key 曾出现在对话里,上线前必须轮换。
  - 与契约的一处显式例外(`CONTRACT.md` §5):失败的首次 deploy 留下的孤儿站点,仅当站点名与已领取作业的 `siteName` 逐字相等、`list` 中唯一、`get` 复核、无可信版本时才允许 `delete`;其余一律保留并上报 `ambiguous`。
- 2026-10-12 静态项目托管上生产(PR #9 合并为 `c1dbca8`,部署版本 `6942e453-dfde-4cad-a67e-4938d95dd5f8`;后续部署器重试补丁走 PR) —— **部分完成:链路已在生产跑通一次(含真实 StepFun),但仅验证了一条验收项目;StepFun key 仍待用户轮换;未向普通会员开放(验收授权已撤销)。**
  - 执行顺序与证据:① 备份生产 D1(`backups/pre-page-hosting-20261012.sql`,1,954,024 字节,ignored;Time Travel 书签 `00001a83-00000000-00005102-0f4a141820ab39e5df3f4de43933ab87`),在备份副本(外键开启)重放 0032 通过(表 56→59、触发器 51→71、既有行逐表不变、`foreign_key_check` 空)→ 生产手工应用 0032(`num_tables=59`),生产 `members=4/uploads=9/products=0` 不变,`PRAGMA foreign_key_check` 空;回填 `__drizzle_migrations`(hash=LF sha256 `9b1027e6d0850522415cf3440b5b757eda384b615a190e9449ede453d1188d3f`,created_at=1791778511164),账目 33 行。② Worker secret `HOSTING_DEPLOYER_TOKEN`(`zch_`+60 字符)与盒子 `/etc/zaochang/hosting.env`(640 root:zaochang)同值写入,值未打印。③ 盒子安装:部署器装在独立目录 `/opt/zaochang/hosting/`(不用指向旧发布的 `current`),文件取 git 原始 LF blob(`git archive` 在 Windows 会出 CRLF;`install /dev/stdin` 覆盖已存在目标会报错,须先落临时文件),`steppage.mjs` sha256 与 `STEPPAGE_SHA256` 逐字相等;扫描器新文件覆盖到 `/opt/zaochang/current/deploy/server/`(旧文件备份 `.bak-20261012`)并重启,`/health` 含 `queued`。④ 推送、PR #9 的 CI(release-gates)success;合并后 CI success、部署工作流 success:Linux `npm test` 808/808、迁移检查「所有本地迁移均已应用到生产」、Worker 部署。
  - 生产验收(只读冒烟 + 真实流程):首页/登录 200;未带令牌与伪造 `zch_` 令牌访问 `/api/hosting-worker/*` 均 401 `invalid_hosting_token`;真实令牌 `health` 200,访问非机器路由 403 `hosting_worker_scope_forbidden`;`dev-login` 生产 404;Skill 含托管工具。真实流程(验收账号即 MCP 授权账号,授权由 Claude 经 D1 直接写入并补写 admin_audit_events,验收后撤销):MCP `create_product` 返回含 `hostedUrl:null` 与 `warnings:[]` → 一次性令牌 PUT zip 返回 201(含真实 ClamAV 扫描,约 14s)、同令牌第二次 401 → 盒子部署器领取并在真 StepFun 暂存(预览 7 天过期,attempts=1)→ agent 通道批准 → 部署器 promote → 线上 `https://swift-harbor-181e.page.stepcloud.com`(经盒子取到 200、`x-zc-probe: prod`、nosniff),产品页出现「访问托管站点」且 `rel="noopener noreferrer nofollow"` → MCP `update_product` 改标题后产品回待审、`hostedUrl` 立即消失 → 移除后部署器删除远端站点(StepFun 账号回到原有 2 个站点,线上 503、预览 404)→ 驳回验收产品归档(`rejected`,项目 #3)→ 撤销验收授权。扫描器新代码在真盒子上:EICAR 放进 deflate zip 判 infected;6 个并发扫描结果为 4 个依次 200(10/19/29/38s)、2 个 503 `scanner_busy`+`retry-after: 1`。
  - 生产上发现的问题与处理:盒子(北京)到 Cloudflare 边缘链路不稳(12~14 次请求约 3~4 次 15~30s 超时,固定 IPv4 同样)→ 部署器 API 客户端加 4 次指数退避重试(仅网络错误/超时/5xx),盒子已装该版本,补丁走独立 PR。
  - 未验证 / 缺口:StepFun 站点/版本额度上限、价格、自定义域名、托管第三方内容条款;`*.page.stepcloud.com` 子域 Cookie 隔离;真实 MCP 客户端调用 `begin_hosting_upload`(本会话的 MCP 工具列表在连接时缓存,新工具需用户 `/mcp` 重连后才可见;令牌路径用等价的库口径写入代替);Worker 处理 10 MiB zip 的内存峰值;生产上多用户并发与长期运行(部署器常驻内存约 63~70MB,<100MB 目标);R2 孤儿 bundle 不回收;部署器日志在重试耗尽时只写通用一行,排查需结合 `journalctl` 时间与 WAL;**StepFun Page key 曾出现在对话里,尚未轮换(阻断级,见下)**。
  - 待用户:① 在 StepFun 控制台作废旧 Page key 并生成新 key,仅写入盒子 `/etc/zaochang/hosting.env` 的 `STEPFUN_API_KEY` 后 `systemctl restart zaochang-hosting-deployer`;② 在 `/admin` 的「托管授权」给要开放的会员授权(`max_sites` 默认建议 1~3)。

## 管理后台重做与会员/内容管控（2026-10-16）

- **2026-10-17 复核更新(以此为准,下方 Codex 原始条目中"未运行/部分完成"已过时)**:沙箱外实跑发现并修复 5 处——①会员搜索用 `LIKE '%长邮箱%'` 触发 D1「LIKE or GLOB pattern too complex」500(会员/内容搜索改 `instr(lower(col), ?)`,同时消除 `%`/`_` 通配符注入);②`admin-members.ts` 直调 `isAdminEmail` 违反角色判定集中规则(改走 `hasRole`);③suite 18 两处买家未回拨注册时间被 `account_too_new_for_transfer` 拦;④suite 07 缺 `quoteSql`;⑤suite 18 自相矛盾断言改为"overview 返回体不含 `@`"、null-prototype 行深比较。另修手机端标题挤成两行、首次进入多余「已刷新」提示。证据:`npm test` 845/845、skipped 0、todo 0;`tsc`/`lint`/`git diff --check` exit 0;`db:generate` No schema changes;本地生产构建 + 种子库截图(桌面待办/会员/审核/封禁确认框、手机待办/会员,无横向滚动、无页面报错)。仍未验证:GitHub/邮箱码/passkey/扫码各登录入口对封禁账号的真实运行时表现(仅 dev-login 入口有集成断言);确认框键盘焦点;内容搜索 `q` 无单独断言;生产 D1 尚未应用 0035。

- 状态：**部分完成**。工作区包含待办收件箱/分区 UI、会员封禁与运行时凭证闸门、主动下架/资金补救、总览/审计 API 和相应集成断言；本地集成服务和 Drizzle generator 受 `spawn EPERM` 阻断，不能作为已验收结论。未 commit、push、deploy，也未连接生产。
- 改动锚点：详细逐文件清单见 `reports/admin-platform-redo-report.md`；当前 `git diff --stat` 31 个 tracked 文件、871 insertions / 436 deletions，`git status --short --untracked-files=all` 含 54 个实现/测试文件及报告/账本。
- 本轮可复现检查：`npx tsc --noEmit` exit=0；`npm run lint` exit=0；纯 Node 定向命令 `node --experimental-strip-types --test --test-isolation=none tests/admin-suspension-triggers.test.mjs tests/hosting-ui-contracts.test.mjs tests/agent-admin-api.test.mjs` 为 30 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo；测试断言包括五类凭证插入触发器、托管 UI 合约、agent capability 和管理台断点/确认框静态结构。
- 未运行/失败：`npm test` 在 Vite build 的 `spawn EPERM` 停止，测试 runner 未启动；直接 `tests/rendered-html.test.mjs` 的 preview harness 不能启动本地 D1/Wrangler 子进程；`npm run db:generate` 在读取 drizzle config 后 `spawn EPERM`，没有 `No schema changes` 结果。
- 语义变更：从没有封禁字段/凭证限制改为 `suspended_at` 标记、五类凭证 INSERT DB trigger 和 Cookie/API key/OAuth bearer 运行时过滤。触发依据：本轮任务 B.2/B.4/B.5；迁移见 `drizzle/0035_member_suspension.sql`，运行时锚点见 report。
- 语义变更：从被下架作品材料编辑后继续保持 hidden 改为材料编辑后清 `moderation_status`、回到 `pending_review`，由常规审核决定是否公开。触发依据：本轮任务 C“作者重新提交走正常预审”。公开页/下单/互动失败语义尚未由集成 suite 验证，必须保留发布阻断检查。
- 语义变更：风险队列 resolve/dismiss 从无理由直接更改状态改为页面内确认、理由至少 4 字并写入审计；触发依据：本轮任务 A“所有破坏性操作统一确认并必填理由”。suite 18 对该路径的 DB 状态和 audit detail 有断言，但未运行。
- 独立静态审查发现并修复两项：无点号域名的 `AGENT_EMAIL` 先被常规邮箱格式校验拒绝（现保护名单优先，返回 403）；举报风险 evidence 曾收到管理员 note（现回传原始 `report.reason`，suite 07 增 DB 字段断言）。审查未报告其他具体静态安全发现，但 D1/Worker 行为未运行。
- 本轮改动可能引入的新风险：Drizzle snapshot/journal 是手动同步，generator 无法运行；封禁 DB batch 的原子性、OAuth consent 失效及未认证行为未在 D1/Worker 集成验证；材料编辑触发器放开 hidden 标志，安全依赖待审门禁保持有效；移动端布局/真实焦点陷阱只做了静态结构断言。
- 已知取舍/已知不证明事项：钱包“进入复核时间”以 `wallets.updated_at` 近似；Node SQLite 证明本地五个凭证插入触发器字段断言，不证明 D1 batch 运行语义；README 暂不更新后台功能可用性描述，因为端到端未验收，避免把未验证状态发布为用户可用功能；当前报告和本状态账本承载待验信息。
- 未覆盖范围：未执行 `tests/suites/18-admin-platform.tests.mjs` 与更新后的 `tests/suites/07-oidc-external.tests.mjs`；未逐入口运行 GitHub、邮箱码、passkey、QR、dev-login。检索命令 `rg -n "createOAuthSession\\(" app/api app/oauth-session.ts` 命中共用 session writer 的 OAuth callback、email-codes、passkey、QR poll/claim、dev-login 及 `admin/visual-session/enter`；`rg -n "suspended_at IS NULL" app` 命中 Cookie、API key、OAuth access/refresh bearer 解析过滤。入口与未验证分支见 report 的「未覆盖范围」。

## 状态页新增见界模型探针(2026-10-30,已部署)

- **部分完成**:状态页(https://status.aetherstudio.top)从 8 条探针扩到 9 条,新增 `lattice-model`(显示名「见界模型」)——北京盒子每 5 分钟向见界学习 Agent 的 LLM 上游(`api.stepfun.com/step_plan/v1/messages`,Anthropic Messages 协议,`step-5-preview`、`max_tokens=64`、流式)发真实小补全,预期 200;模型 404/密钥 401→降级,不可达→故障。`server.mjs` 的 classify/sampleReason/严重度口径零改动。
- 仓库与生产:`deploy/status/server.mjs`(SHA `2fc2151b…`)与首次入库的 `deploy/status/probe.sh`(SHA `a932c087…`)已替换到盒子并重启 `zc-status.service`(备份 `.bak-latticemodel-20261030T034529Z`,旧 server SHA `324d7eb5…` 无漂移);上游密钥在盒子 `/opt/zc-mon/stepfun.env`(root 600,缺失即探针跳过→显式 unknown)。首个 probe.sh 候选漏 `>> "$LOG"` 追加,验收时当场发现修正重发,坏版未进 cron,采样无缺口(细节见 `deploy/status/README.md` 2026-10-30 节)。
- 验证:`npm run test:status` 64/64(ids 夹具与断言 8→9)、eslint/`git diff --check` exit0;源站与公网 API 均 overall=up、9 项探针、lattice-model up(http 200,ttfb≈0.7s),公网 HTML 渲染「见界模型」。未证明:探针不经 Worker,不代表生产 Worker→上游全链路;盒子 key 与线上 Worker secret 同值性无法读回验证;TTS/图片/搜索等其他上游能力不在监控内。

## 见界积分显示与流水（2026-10-30）

- 状态：部分完成。白板结课的前端扣 5 已移除，初始伪余额与 Onboarding 示意顶栏的 `PRO 100` 已替换为占位符；Chat/Create 的积分回写只接受服务端回调值；`MAX` 每日额度与后端 500 对齐。0040 新增积分流水表、余额触发器、90 天清理和会员私有分页接口；顶栏徽章打开双语记录弹窗。
- 语义变更：从“白板结课会在浏览器本地扣 5；余额写入没有统一流水”改为“白板不改变余额；每次余额变化需在同一 UPDATE 声明原因，SQLite 同事务记录 delta 与 balance_after；原因缺失或过期会使 UPDATE abort”。依据：本轮 T1 A/B/C；迁移 `drizzle/0040_hk_credit_events.sql`。
- 本地证据：`node --experimental-strip-types --test --test-isolation=none tests/credits-ledger.test.mjs tests/lattice-credit-history.test.mjs tests/hk-redeem.test.mjs tests/worker-contracts.test.mjs` 为 48 pass / 0 fail / 0 skipped / 0 todo；`npx tsc --noEmit` exit 0；`cd hyperknow-spa && npx tsc -b` exit 0。SQLite 断言覆盖 chat/translate/course/refund/daily_reset 字段、余额不足 changes=0、额度对账、90 天 purge 和触发器不变量。
- 未运行：`tests/suites/11-hyperknow.tests.mjs` 与 Wrangler preview 未在沙箱运行；`npm run db:generate` 打印 `spawn EPERM`，未观察到 `No schema changes`。SPA build 未运行，按本轮约束由 Claude 统一处理 `public/lattice/` 构建产物。
- 额外迁移门禁检查：`node --experimental-strip-types --test --test-isolation=none tests/migration-gate.test.mjs` 为 1 pass / 7 fail / 0 skipped；失败断言收到空输出，测试辅助函数未带出 `spawnSync.error`，所以不能判定为迁移校验逻辑缺陷或沙箱子进程拦截，需外部重跑。
- 已知取舍/已知不证明事项：流水只从 0040 应用后记录，不回填旧余额或历史扣费；余额首行是对账基线而非一条虚构发放事件；跨北京日界的退款沿用现有策略，不在新一天余额中追加退款。
- 未覆盖范围：未通过 Wrangler 验证 history HTTP 鉴权、A/B 隔离、50 条分页游标、对话事件字段；未测试 Cloudflare D1 上的并发扣费和 `batch` 回滚；未在浏览器验证积分弹窗布局、加载/错误/重试和实际点击；未取得 Drizzle generator 零漂移证据。
- 本轮改动可能引入的新风险：`drizzle/meta/0040_snapshot.json` 与 journal 按 0039 手工续写，SQLite 迁移通过但 Drizzle generator 尚未校验快照与 schema 的零差异；history Worker 响应和前端运行时只经过类型/静态契约检查；迁移前的扣费流水不可恢复。

## 见界语音输入与服务端 ASR（2026-10-30）

- 状态：部分完成。改动新增 `POST /api/hyperknow/asr`（会员、同源、30 次/10 分钟、2 MiB、音频 MIME 白名单、20 秒上游超时）；前端 Home/Chat/Whiteboard 录音后追加识别文本，卸载时停止轨道；Android 未改。
- 语义变更：从全站 `microphone=()` 改为仅 `/lattice` 与 `/lattice/*` 返回 `microphone=(self)`；`/api/auth/github/start`、`/signin`、`/api/*`、`/latticefoo`、`/product-apps/*` 仍关闭。触发依据：本轮 T5 A 明确限定路径。`tests/worker-contracts.test.mjs` 的字段断言覆盖这些路径，但只验证 `withSecurityHeaders`，不证明生产 Worker 响应。
- 可复现检查：`node --experimental-strip-types --test --test-isolation=none tests/worker-contracts.test.mjs` 37 pass / 0 fail / 0 skipped / 0 todo；`npx tsc --noEmit` exit=0；SPA `tsconfig.app.json` 与 `tsconfig.node.json` 独立 typecheck exit=0（临时 `tsBuildInfoFile` 放在 `$TEMP`）。原样 `npx tsc -b` 因只读 `node_modules` 链接无法写 `.tmp/*.tsbuildinfo`，exit=1。
- 未运行：`tests/suites/11-hyperknow.tests.mjs` 中 `hyperknow asr: 登录录音代理、字段映射、限体积/MIME/同源与 no_speech` 未在本沙箱启动 Wrangler preview；因此 ASR HTTP/D1/假上游路径、浏览器录音/权限/停止语义和真实 StepFun 上游均没有本轮运行证据。`public/lattice/` 未构建更新；Claude 合并时需在外部构建并运行 Worker 集成套件。无新增迁移/表/列。
- 已知取舍/不证明事项：`worker-contracts` 证明路径 helper 输出字段，不证明部署响应；TypeScript 只证明可类型检查，不证明浏览器 API、音频编码或上游 multipart 互通。Android 壳仍拒绝麦克风权限，壳内无法录音。
- 未覆盖范围：未运行 ASR preview suite（登录、401、403、413、415、422、上游错误/超时、限流、未配置字段断言）；未在 Chrome/Safari/Android WebView 运行 MediaRecorder；未用真实密钥调用 ASR；未部署或核对生产响应头。新增 HTTP suite 的相关源断言已写入，但本轮未执行。
- 本轮改动可能引入的新风险：若 `/lattice` 前缀边界判断回归，非见界页面可能获得麦克风权限；ASR 代理与 413/415/422 的 Worker 实际状态映射尚无本轮集成结果；Android 壳能力不兼容仍需面向使用者说明。

## 见界学员反馈 6 项修复——合并与外部验证(2026-10-30,随本提交部署;生产验证见后续条目)

- **状态:部分完成**(本地合并 + 全量测试 + 浏览器验收通过;生产侧验证待部署后补记)。部署顺序:0040 含"余额变更须带原因"的 BEFORE 触发器,旧代码扣费会被拒,故 CI 通过后执行迁移并立即部署同一 SHA,把旧代码与新触发器并存的空窗压到最短。6 个工作包(T1 积分流水 / T2 字幕时长校准 / T3 反馈通道 / T4 聊天操作栏与朗读暂停 / T5 语音输入 ASR / T6 课程卡状态隔离)由 Codex 在独立 worktree 并发完成,Claude 三方合并进主工作区(暂存区)。上方各条目中"未在沙箱运行"的项已在本条外部补跑。
- **合并决策**:T3 原在 worker 入口为 `/api/hyperknow/feedback` 加了复刻 vinext 路径归一化的 32 KiB 预缓冲闸(位于机器凭据闸之前),合并时未采纳——全局 11 MiB 闸不变,32 KiB 上限由路由内 `feedback_payload_too_large` 413 承担;对应契约测试改为断言 worker 入口无反馈专属分支。T3 迁移由 0040 重编号为 `0041_hk_feedback`(snapshot prevId 接 T1 的 0040)。另修:聊天朗读轨道 `speed !== 1` 致 1.0x 不生效(补回归测试,修前 fail/修后 pass);积分弹窗换页不收起;MAX 徽章 `✦ MAX` 文案恢复。
- **外部证据**:`npm test` exit 0,958 tests / 958 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo(含 `hyperknow credits history`、`hyperknow feedback: submit persists…`、`hyperknow asr: 登录录音代理…` 三条 Wrangler 集成用例);`npm run db:generate` → "No schema changes";根 `tsc --noEmit`、SPA `tsc -b`、`oxlint src`、改动文件 eslint、`git diff --cached --check` 均 exit 0。
- **浏览器验收**(headless Chrome + CDP,复用 tests/harness/preview.mjs 的真实 Wrangler 预览与假上游;TTS 经 CDP 替换为真实阶跃 mp3):两轮对话后每条回复下方各 1 行操作栏;朗读按钮 朗读→暂停朗读→继续朗读→暂停朗读;假麦克风录音态「点击结束」,识别文本回填输入框;反馈弹窗显示「已收到你的反馈(编号 #…)」且页面不跳转,D1 `hk_feedback.notify_status='sent'`;顶栏积分 20→16,积分记录列出两条「AI 对话 -2」,D1 流水 `[-2/18/chat, -2/16/chat]`;先开社会学导论(hash 带 uuid 091d5945…)再点 AP 生物学 → hash `card=ap-bio` 无旧 uuid,标题「AP 生物学」+「按此课题生成课程」。
- **未覆盖/已知缺口**:①本地预览 `dist/server/wrangler.json` 无 `run_worker_first`,`/lattice/*` 不经 Worker,`permissions-policy: microphone=(self)` 只有 `worker-contracts` 单测证据,须部署后在生产实测响应头;②真实麦克风/真实 StepFun ASR 端到端未在浏览器跑(ASR 上游仅用 curl 以同套餐 key 实测 webm/m4a/wav 均 200);③安卓壳无 RECORD_AUDIO,壳内语音输入仍不可用;④字幕校准系数基于 6 音色实测拟合,流式未知时长下的真实浏览器表现未验证;⑤`hosting-deployer-process` 子进程测试在一次全量中偶发失败(WAL 状态 'result'≠'reported'),单独重跑 3/3 通过,最终全量通过,与本轮改动无关。

## 见界学员反馈 6 项修复——生产部署(2026-10-30,已部署 af03ad2)

- **部署顺序与空窗**:CI release-gates run 41023784099 success 后,先 `wrangler d1 export` 全量备份(`backups/prod-d1-before-0040-0041-20261030T040114.sql`,2.26 MB/741 INSERT),在导出副本上重放 0040+0041(外键检查 0 违规,旧形态扣费被 `hk_credit_change_reason_required` 拒绝),再一次性执行迁移 + 两条 `__drizzle_migrations` 登记(UTC 08:06:31→08:06:44,changes=3,last_row_id=42),紧接本地 `wrangler deploy` 同一 SHA(08:07:12,版本 968f96f8)。旧代码与新 BEFORE 触发器并存空窗约 34s(另迁移执行中约 13s),期间扣费类请求会失败(fail-closed,不错扣)。空窗前后 2.5 小时内 `hk_conversations` 无更新、其余会员 `hk_credits` 无更新——旁证无人撞上,但被拒的 UPDATE 不留痕,不能完全排除。
- **CI 部署**:deploy-production run 41024141604 全步骤 success(Verify migrations applied 08:09:05;Deploy Worker 08:09:16),当前生产版本 93693622(100%,CI 构建产物)。
- **生产实测**:`__drizzle_migrations` 第 41/42 行 hash 前缀 8cb9ede0/b508e6db、created_at 与 journal 一致;`hk_credit_events`、`hk_feedback` 表及 4 个触发器存在。`/lattice/` 响应头 `microphone=(self)`,`/`、`/latticex` 仍 `microphone=()`;未登录 `GET credits/history`、`POST feedback`、`POST asr`、`GET admin/hk-feedback` 均 401。agent 视觉票(agent@zaochang)登录态:`/lattice/` 加载 `index-BjjEauXJ.js`(本次构建),`credits/history` 200;用后 logout(复用 cookie 返回 401),令牌文件已删。
- **仍未验证**:真实学员端到端(真实麦克风+阶跃 ASR、反馈邮件实际送达团队邮箱、白板字幕与朗读的真实同步体感);安卓壳内语音输入仍不可用(壳无 RECORD_AUDIO)。
