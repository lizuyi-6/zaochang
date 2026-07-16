# 造场项目账本

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
