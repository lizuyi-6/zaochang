# Regression context — 上线后回归复查

## 目标与范围
- 目标:`https://aetherstudio.top` 生产环境,针对 2026-10-02 审查(`qa-runs/2026-10-02-visual-audit`)之后的 7 个新 commit 做**回归复查**
- Run ID / mode:`20261003T035156Z-d0fac94f` / **audit**(未修改任何应用源码)
- 用户指令:「重新录制,我们上线了一堆更新」+ 显式加载 autonomous-qa
- 上一轮结论(作为本轮的基线):11 条问题 P-001~P-011,gate `not_ready`,最大盲区=白板授课播放零执行证据

## 本轮新版本
- 审查起点:上一轮终点 `9a59f77`
- 之后新增 **7 个 commit**:
  - `b5d5bd9` 修复 P-001/002/003/004/005/006/010/011(8 项),新增 4 个契约测试,418 测试
  - `b6366bd` 台账条目
  - `64eb61c` **自由讲座**:直进白板不再静默播录课演示,学员命题→AI 实时备课
  - `6160566` 白板观感四修:字幕分句窗口(≤2句)+ 公式 KaTeX 真排版 + 图 CJK 测量折行 + 禁 ASCII 摆阵
  - `7abb73a` 白板观感五修:旁白 HTML 标签泄漏净化(sanitizeNarration)+ 分号计入断句符
  - `36df58e` 讲师提示词观感两修:举例主体中立化(Teaching Craft 15)+ mermaid 图下限一张升两张
  - `34c8bf9` 台账 + IAB 真点击复验证据
- 关键:新功能「自由讲座」路由 `#/whiteboard?topic=<主题>`(`App.tsx:123-124`,无 `activeCourseUuid` 时走 `?topic=`),**这是第一次能真正进入白板的路径**

## 授权与只读边界
- 本轮用户未追加授权,沿用上一轮:**只读**。未修改源码、未触发部署、未轮换 token
- 会话:复用 `qa-runs/2026-10-02-visual-audit/.secret/storage.json`(cookie 30 天 TTL,至 2026-11-01,当前有效)
- 机器通道:`GET /api/admin/capabilities` 返回 200(只读探测)
- **变异测试例外**:为验证新契约测试是否真会拦,临时改过 `dist/client/assets/index-*.css` 与 `hyperknow-spa/src/lattice/backend.ts` 的**副本性内容**,每次都当场确认变异写入并在同一命令内还原;还原后已复跑确认 2/2、4/4 通过。这是测试装置自检,不是产品源码修改。

## 能力清单(沿用已验证配置)
- Playwright 1.58.2(全局)+ Chromium 1208 + recordVideo;`read` 不支持 webm → ffmpeg 转 mp4
- SSH 至阿里盒子(wrangler secret list / deployments list、--resolve 到 CF 边缘)
- 文字级判断一律以 DOM `innerText` 为准(上一轮的三次图像误读教训)

## 基线对照方法
本轮的核心价值是**逐条回归对照**,而非重新普查:
- 源码层:读每项修复的实际落点(含是否只改声明未改调用点)
- 运行时层:线上实测(500/404/状态码/DOM 属性)
- **变异层:反向验证新契约测试会变红**(变异必须确认写入才有效——第一次我挑错 CSS 文件导致假阴性,已纠正)

## 预算
起始预算 12 个实验,实际执行 9 组。约四分之一留给反证与变异自检。

## 停止原因
待定:自由讲座端到端与重录完成后收口。
