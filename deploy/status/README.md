# 独立 status 站：行为、发布证据与回滚说明

⚠️ 安全变更/缺口：`server.mjs` 末行 `listen(PORT, HOST, …)`，`HOST = process.env.STATUS_HOST || '127.0.0.1'`。语义变更：源站监听从 `0.0.0.0:8080`（所有网卡，公网 EIP + 安全组已放行即可直连，绕过边缘缓存与 Cloudflare 防护）改为默认仅回环 `127.0.0.1:8080`。**2026-10-11 已部署到北京主机**（生产 SHA `324d7eb5…`）；部署前已核对 `/etc/cloudflared/config.yml:5` 为 `service: http://localhost:8080`。若今后 ingress 改为 EIP/内网 IP 或 cloudflared 改跑容器，回环绑定会让 status.aetherstudio.top 回源失败（502/530）。部署证据见文末“2026-10-11 源站绑定与覆盖率修订”。

状态：部分完成，2026-10-06 本次异常原因版的 `node output/status-reasons-2026-10-06/publish-release.mjs` exit=0，源站/公开字段检查exit=0（staleAfterMin==10、8项状态与字段重算相等、真实历史500带原因、servedClientEqualsCandidate==true）；当前源SHA256 `9071ba7b529e0419aece78e21f02c1afbdf1f53f1325f12e567ed1453469a3ce`。此前三个产品短入口公网18项exit0、DNS18/18记录见DNS计划，本次不写DNS。这里是 `/opt/zc-status/server.mjs` 的仓库源；独立 Node 服务不属于主站 Worker 的构建产物，推主站代码不会发布它。

短入口只匹配规范化根路径GET/HEAD并302到主站固定页面，保留query。未匹配深路径/POST实际约20秒后522、Location==null；raw双斜杠和点段可能归一化为根而跳转。登录后的身份流、全球传播、实际回滚和原cache规则全文（读取403）未验；独立对账24/24与公网15/15字段工况exit=0，完整范围见DNS计划与独立复核账本。

⚠️ 安全变更/缺口：`server.mjs:198` 的 `latest: publicSample(latest, p.id, latestReason)` 将公开latest从原始整行改为白名单投影；`:144` 非法HTTP值为null，`:148` 原始err换安全诊断。伪secret夹具断言公开JSON/HTML不含秘密（57/57、exit0），公开字段检查断言只含白名单；不声称生产曾泄露真实秘密。旧版原样公开行在日志含敏感附加字段时会破坏不外泄不变量；本地原日志保留。

10min新鲜度门禁保持原语义；当前 `server.mjs:197` 的判定仍为 `status: latest && now < freshUntil ? STATUS[classify(latest, p.expect)] : 'unknown'`。下方前次发布记录对应99源码，原line136判定冻结于 `output/status-reasons-2026-10-06/server-before.mjs:136`，不把旧行号当成当前源码行号。

## 前次生产发布记录（99源码，历史证据）

- 授权锚点：本对话用户“发布，然后我可以给你cloudflare 的apitoken你需要什么权限”；后续“再试试本地的token”保留发布授权。
- 发行目录 `/opt/zc-status/releases/status-20261006T024930Z`。源 SHA256 `09910096c3c11d0d7e2d7b30040d4154879f1598103a97d17553e42bbcfdda9a`；备份 `/opt/zc-status/server.mjs.bak-status-20261006T024930Z`，备份 SHA256 `322d3d5ae61296f089356095e6565b0211bd05a1e5de4f91067480ce0e022134`。
- Linux、真实生产 Node v22.20.0、发行目录执行 `/opt/node/bin/node --test tests/status-page.test.mjs tests/status-client.test.mjs` exit=0，total=36/pass=36/fail=0/skipped=0/cancelled=0/todo=0。使用隔离夹具，不读写生产日志/公告；客户端部分为 VM，产品源码没有测试时钟钩子。
- `ssh zaochang-cibox bash /opt/zc-status/releases/status-20261006T024930Z/publish-status.sh` exit=0，远端源 SHA 与上述源一致，`systemctl is-active zc-status.service` 为 active；探针与事件 CLI SHA 不变。首次重启健康请求曾连接拒绝，随后只读健康等待成功；没有触发恢复备份。
- 源站 `/opt/node/bin/node release-smoke.mjs http://127.0.0.1:8080` exit=0（北京时间10:53:39）；公开同命令目标 `https://status.aetherstudio.top` exit=0（10:54:46）。断言 staleAfterMin==10、8 个唯一探针、coverage==observedSlots/288、freshUntil==latest+600000、每项状态等于按年龄/HTTP/rc/TTFB 重算的结果、总状态最高严重度，以及 API/HTML must-revalidate 且无 SWR。公开 max-age=29、CF=EXPIRED、HTML 解码125447字节。
- 独立公开复核 `node output/status-fix-2026-10-06/review-public-check.mjs` exit=0（10:57:29），everyProbeStatusEqualsComputedState==true、overallEqualsHighestSeverity==true、servedClientEqualsCandidate==true、historyRowCount==768。该证据证明本次实际新鲜输入的公开行为和客户端版本，待证命题与该范围相同；不证明生产真实停采样/损坏公告/回滚。
- 11:01 公开 Chromium UI：390×844、scrollWidth=375<=390、serviceCount=8、第一服务top=495.802、首页覆盖160/288=55.56%。`production-mobile.png` 与 `production-ui-evidence.json` 只证明此视口渲染；后端字段交叉证据为前述公开检查，采样随时间新增，不能要求两次快照覆盖率相同。
- 命令、实际统计、源站/公开字段、独立复核与截图保存于 Git 忽略的 `output/status-fix-2026-10-06/`：`production-node-tests.log`、`publish.log`、`public-smoke.log`、`review-public-evidence.json`、`review-findings.md`。此前本地证据保持原时间与指纹；本次新增生产证据不把本地夹具冒充生产故障注入。

## 行为与证据边界

- 用户本轮选择：5 分钟采样，最新有效样本年龄 **>=10 分钟** 时 API `status=unknown`。未来时间及 24 小时窗口外的样本不能形成当前绿色。
- 总状态取最高严重度：`down > degraded > unknown > up`；所有未解决事件参与计算。读取事件失败或非法记录增加未知态；非法解决时间不能移除已知故障。
- 缓存同时检查 mtime 和时间，到期上限为 30 秒与下一采样过期边界的较小值。响应要求 `must-revalidate`，取消额外 300 秒的 stale-while-revalidate。
- 网页每 60 秒更新、每 5 秒核对新鲜度，失败时保留上次内容、显示失败提示。计时用服务端生成时间和浏览器单调时钟，包含缓存年龄保守上界 30 秒，因此可能提前最多 30 秒显示未知。重新显示后台页面时再次核对。
- 展开的历史、具有稳定 ID 的焦点和滚动位置在更新时保留。普通公告在服务列表之后，未解决故障在前；历史显示图例、时间段与展开表格。
- `uptime24h` 为兼容保留，但含义是**收到的样本中成功的比例**。界面另列 288 个预期采样时段的实际覆盖率，不能解释为连续 24 小时可用率。
- HTTP/TTFB 与北京单探测点只证明所列链路的探测结果。scanner=404 只表示隧道可达；不证明病毒扫描、真实登录、验证码、AI 或上传业务正确。

语义变更：从“任意 24h 内旧成功样本可一直显示正常”改为“10min 到期即未知”；从“最新一条事件覆盖总状态”改为“最高严重度聚合”；从“文件 mtime 不变永不过期、允许额外 300s 陈旧响应”改为“时间约束缓存并要求重新验证”；从“非法解决时间仍视为已解决”改为“保留未解决故障并报告记录异常”。依据：本轮 status 修复请求、用户的 10 分钟选择及全局 AGENTS.md 的 fail-closed 规则。

## 本地复现

```powershell
npm run test:status
# 真 Node 子进程 + 本地夹具 + 回环 HTTP 41 项；生产客户端函数 + 模拟 DOM/网络 16 项。
# 精确边界/25h 用例在测试子进程使用外部 Date 预加载器，产品没有测试注入入口。
node --check deploy/status/server.mjs
```

预览可以设置 `PORT`、`STATUS_HOST`（默认 `127.0.0.1`）、`ZC_MON_LOG`、`ZC_INCIDENTS`，再运行 `node deploy/status/server.mjs`。日志为 JSONL，公告为 JSON 数组；缺失/不可解析来源显式为未知，不用伪造持续正常的样本。

原生产快照与旧源码反例在 `output/status-review-2026-10-06/`；本轮测试日志、只读生产数据快照、本地截图、独立复核账本在 `output/status-fix-2026-10-06/`（Git 忽略）。旧源码执行新 HTTP 套件为 24 项中 22 项失败、2 项通过、0 跳过；这只证明测试能区分列出的旧行为。

## 发布步骤与回滚边界

1. 获得用户对本候选发布的明确批准；全局 AGENTS.md 第 0 节将部署列为高风险门禁。
2. 本地执行 `npm run test:status`、`npm test`、`npm run lint`、`npx tsc --noEmit`、`git diff --check`，保存真实退出码和统计；不能只跑启动或 200 探针代替字段行为断言。
3. 通过 `zaochang-cibox` 检查 `zc-status.service`、Node 版本、现有源码与探针/CLI SHA256；候选只替换 `server.mjs`，不改探针、cron、事件数据、Tunnel、DNS 或主站 Worker。
4. 在 `/opt/zc-status/` 备份原源码为 `server.mjs.bak-<UTC timestamp>`，上传候选为临时文件，核对本地/远端 SHA256 相等、远端 `node --check` 成功，再原子替换、重启 `zc-status.service`。
5. 源站与公开 API 核对 `staleAfterMin==10`、`expectedSamples24h==288`、每个 `status` 与采样年龄一致、总状态等于最高严重度；核对常规 URL 的 Cache-Control、页面标记与公开回源结果。截图只作为 UI 证据。旧缓存规则未在本轮修改，边缘端到端结果须发布后实测。
6. 若服务启动/行为字段检查失败，恢复指定备份文件并重启，同样保存回滚后的SHA256、服务状态和API字段证据。本次9071回滚到99会失去原因/隐私投影，但99保留10min及最高严重度门禁；前次99回滚到322则重新引入旧新鲜度/严重度缺陷。不能把不同备份的回滚语义混为一谈。

本次执行了批准、远端同版本隔离测试、SHA核对、备份、替换、重启与源站/公开字段检查；未执行第6步的真实回滚。未覆盖范围：真实生产停止探针、故障公告读写、Tunnel 断开、Cloudflare 来源失败时的陈旧缓存与发布回滚；浏览器/操作系统休眠、实际后台计时限制、无 JavaScript 模式、读屏和手机真机。本地测试或源码存在不能替代这些结果。

本轮新风险：缓存重算更频繁、ETag 随生成时间改变；每个服务的 96 行详情使 HTML 增大；30s 保守界限会提前显示未知；客户端更新依赖现代浏览器的 AbortSignal.timeout，缺失时会保留内容并提示失败。生产源站负载与多浏览器兼容性尚未实测。

## 前次结果与当前工作树逐文件对账

前次环境：Windows/Node v24.13.1，本地夹具和回环 HTTP；主项目完整套件使用真实本地 Wrangler/D1 与假扫描/AI/邮件上游，不是生产业务验收。下方前次36/580证据的源SHA256为 `09910096c3c11d0d7e2d7b30040d4154879f1598103a97d17553e42bbcfdda9a`；当前9071/57/601证据见文末。

`npm run test:status` exit=0，36/36（failed=0/skipped=0/cancelled=0/todo=0）；`npm test` 最终 exit=0，580/580（同样全零），相对入场基线 544 新增 36，没有删除、筛选或跳过。整库 lint/TypeScript exit=0；最后客户端修改后，四个本轮 JS 文件 ESLint exit=0。日志为 `acceptance-final.log`、`full-test-final.log`、`lint.log`、`typecheck.log`。独立复核最终源 10/10、仓库客户端 12/12、exit=0，见 `output/status-fix-2026-10-06/review-findings.md`。

命题映射：HTTP 反例 `status: freshness expires at exactly 10 minutes even inside the 30-second cache` 断言所有探针 `status=='unknown' && stale==true`，证明本地未改 mtime 的精确期限行为，待证命题是同一软件输入行为；不证明 Cloudflare 此刻是否遵守缓存头。严重度测试断言 `home.status=='down' && overall=='down'`；单样本覆盖断言 `observedSlots24h==1 && coverage24h==0.35 && uptime24h==100`，证明已观察比例与成功比例分开，不能证明未观察时间可用。

真实 Chromium UI：390×844、320×640、1280×720，分别 `scrollWidth=375/305/1265 <= viewportWidth`；390px 第一服务 top=495.802；每项详情 96 行。实际暂停**本地预览**后刷新，`note=='刷新失败，显示上次数据；可重试'`、`probeCount==8`、历史仍展开、按钮焦点保留；本地恢复后重试显示“刚刚更新”。未暂停生产。该证据仅证明浏览器渲染/交互层，不证明业务与生产网络。

浏览器曾揭示原模拟测试遗漏：旧候选将按钮 `disabled=true` 后焦点落到 BODY；补模拟原生 blur 后，改产品前客户端 12 项为 11pass/1fail、exit=1（`focus-regression-before.log`）。候选使用 `aria-disabled=true` 与 `busy` 守卫，保留键盘焦点，两次请求尝试 `fetchCalls==1`；修改后的 VM 和真实浏览器都检查该分支。原 12 项未删，只将“原生禁用”断言改为明确的 ARIA 忙态与请求排他断言；这不改变故障或超时分类。

本轮改动以 `git diff --stat` 为锚；同时保留入场的性能改动。下面逐一列出，不将旧性能文件包装成本次状态页修复。

| 文件 | 改动与对应证据 |
|---|---|
| `deploy/status/server.mjs` | 本次原因/隐私/最严重格记录：41 HTTP + 16 VM，Windows及生产Linux/Node22.20隔离57/57、exit0；源站/公开release-smoke字段exit0，历史500原因/恢复及客户端函数相等；真实生产超时、停采样、缓存来源失败与回滚未验证 |
| `tests/status-page.test.mjs` | 本次扩到41 HTTP字段反例，超时/无响应/HTTP/慢响应/历史恢复/最严重原因/公开字段投影；旧99执行初版55套件35pass/20fail/exit1，修改后最终57/57；无跳过，恶意HTTP旧断言从转义强化为null投影及原值不外泄 |
| `tests/status-client.test.mjs` | 本次扩到16 VM用例，原因同步与9m30保守提示不冒充实际10min；初版旧99客户端12pass/3fail，候选最终16/16；VM不证明真实浏览器后台调度 |
| `package.json` | 接入两个测试文件及test:status；前次36/580、当前定向57与npm test601均exit0，544基线+36前次+21本次==601，0删除/过滤/跳过 |
| `scripts/inspect-cloudflare-dns.mjs` | 仅 GET 本地凭据检查；exit=2，Zone=200/1、Routes=200/2、Domains=200/0、DNS=403/10000；DNS内容/分页未单独验证，权限拒绝阻断 |
| `DNS_PLAN_2026-10-06.md` | 记录旧权限缺口与新token三短入口实际发布；完整DNS15→16→18、原15字段相等、新规则字段等于候选、公网18/18/exit0；实际回滚/已登录认证未验证 |
| `CLOUDFLARE_RUNBOOK.md` | 本次追加9071发行/备份/57与601/公开原因字段及隐私语义；check-record对账实际JSON/日志，git diff --check；此前DNS内容保留，重建全部部署未单独验证 |
| `deploy/status/README.md` | 本次原因合同、生产证据、回滚边界与24行文件表；check-record核对源SHA/57与601/公开字段/文件清单，git diff --check；真实回滚未单独验证 |
| `PROJECT_STATUS.md` | 本次追加55套件35pass/20fail→57、复核17项1fail→20/20、发行/公开原因及边界；check-record对账真实产物，差异格式检查；文档无独立运行行为 |
| `PERFORMANCE_2026-10-06.md` | 入场已有，保留；本轮未重测性能，沿用此前报告不抬升结论 |
| `app/bookshelf/[...slug]/page.tsx` | 入场已有，保留；本轮未单独验阅读导航/字体，套件绿不证明其全部语义 |
| `app/bookshelf/reading-fonts.css` | 入场已有，保留；本轮未单独验字体与真实设备渲染 |
| `app/bookshelf/reading-fonts.tsx` | 已于 2026-10-11 删除（改由阅读页 `import ...reading-fonts.css?url` + `<link precedence>` 承担）；本轮未单独验跨部署样式加载失败分支 |
| `app/components/cover-image.tsx` | 入场已有，保留；本轮未单独验所有图片失败/换源分支 |
| `app/components/intent-link.tsx` | 入场已有，保留；本轮未单独验键盘/触屏预取交互 |
| `app/components/product-card.tsx` | 入场已有，保留；本轮未单独验卡片封面/导航全部语义 |
| `app/components/site-shell.tsx` | 入场已有，保留；本轮未单独验站壳所有导航语义 |
| `app/lib/cover-image-sources.ts` | 入场已有，保留；本轮未单独验供应商换源与高 DPI 清晰度 |
| `app/page.tsx` | 入场已有，保留；本轮未重测首页性能与导航全部交互 |
| `scripts/measure-page-load.mjs` | 入场已有，保留；本轮未重新采集性能测量 |
| `scripts/summarize-page-load.mjs` | 入场已有，保留；本轮未重新汇总性能样本 |
| `tests/build-assets.test.mjs` | 入场已有，保留；npm test 执行该文件，未逐项重新对账其外来修改 |
| `tests/modularization-contracts.test.mjs` | 入场已有，保留；npm test 执行该文件，未单独验其新增契约对应的真实浏览器语义 |
| `tests/suites/02-docs-books.tests.mjs` | 入场已有，保留；完整 runner 执行该文件，未单独重做性能改动的浏览器验收 |

补充未覆盖范围：本轮相关检索 `rg -n '(zc-status|zc-mon|status\.aetherstudio\.top|statusClient)' deploy tests scripts package.json CLOUDFLARE_RUNBOOK.md`；覆盖仓库 status 源和新增两套测试，生产 `probe.sh`/`zc-incident.mjs` 仅核对原 SHA256 未执行。未验真实 AI/邮件/认证/扫描操作，未验生产停探针/事件 CLI/告警投递/边缘陈旧缓存/Tunnel 断开/回滚。真实本地失联与重试覆盖刷新 catch 分支；实际后台调度、系统休眠、无 JS、读屏、多浏览器与真机仍未覆盖。

## 2026-10-06 本次异常原因修订

状态：部分完成；本次生产源SHA256 `9071ba7b529e0419aece78e21f02c1afbdf1f53f1325f12e567ed1453469a3ce`。用户澄清“status标记故障并显示原因，业务请求继续按现有规则处理”，不创建业务熔断器、不停止请求、不修改探针/cron/DNS/Tunnel。

真实基线记录：北京时间10-06 02:20:01，shell-state与community均HTTP500/rc0，TTFB分别8.993499/0.934189s；02:25:01各收到后续HTTP200/rc0正常采样。原日志证明非预期HTTP，不证明D1或网络根因；原probe只丢弃响应体，历史业务根因不能由此补造。数据与源码冻结在 `output/status-reasons-2026-10-06/`；13:48:54快照1375条中两条异常、当时8项当前up。

分类口径没有变：rc非0/HTTP0/无效字段→down，非预期HTTP（含5xx）或TTFB>10s→degraded，TTFB恰10s仍up，age>=10min/无有效样本→unknown。选择保持口径，避免将本次原因展示悄悄变成新的告警严重度策略；被放弃的业务实际熔断解释会拒绝业务请求，用户明确未选择该项。

公开字段：`reason`为当前状态依据（正常为null）；`lastAnomaly`含实际异常采样时间、安全诊断和后续首次正常采样时间，不把历史异常当当前故障；`anomalySamples24h`保留全计数，`bucketDetails`每格保存最近3次异常和独立`worstIssue`。最严重原因不会被后续较轻样本挤掉，未展示记录计数明确写出；仍不声称每条历史异常全部展示。

语义变更：公开latest从“原始行所有字段+原始err”改为“固定时间/探针/数值字段，非法数值为null，err仅生成安全诊断文本”；依据为本次原因请求及独立假secret反例，原始服务器日志不变。HTML转义防脚本不等于去敏；JSON和HTML均断言不包含假秘密/私有URL/附加Authorization。诊断只描述探测结果，`rootCauseConfirmed==false`；curl代码含义参照[官方退出码文档](https://curl.se/docs/manpage.html#exit-codes)。

语义变更（本轮初候选→冻结候选，未将错误文案发布）：客户端未知态的原因文案从初候选“已达10min”改为“新鲜度无法确认，按10min阈值保守核对，可能提前最多30s”；未知态触发阈值/30s上界不变。独立反例在9m30断言初候选文案失败，修订后新增字段/文案反例；此前生产99客户端只写“数据新鲜度无法确认，当前状态未知”，服务器实际age>=10min仍写“已达10分钟”。

证据分层：初版更新套件55项在旧99源上35pass/20fail/exit1；初版候选55/55、全库599/599但独立17项为16pass/1fail（保守时间文案）。保留这些记录；最终57项（原36+21，0删除/过滤/跳过）Windows与Linux/Node22隔离57/57/exit0，最终全库601/601/exit0、suites6、fail/skipped/cancelled/todo全0。独立最终20/20及仓库57/57/exit0；不拿早期599替代最终修订证据。

本次发行目录 `/opt/zc-status/releases/status-reasons-20261006T060537Z`，备份 `/opt/zc-status/server.mjs.bak-status-reasons-20261006T060537Z` SHA99，当前生产SHA9071；`publish-release.mjs` exit0（SSH替换/源站/公网检查exit0），14:12:50公网overall==up、8项当前up/reason==null，两条历史异常reason.code==http_error、at==02:20:01、recoveredAt==02:25:01。`publicLatestHasOnlyAllowedFields==true`、`bucketCountsEqualSampleCounts==true`、`retainedActual500HasReason==true`、`servedClientEqualsCandidate==true`。命题映射：这些字段证明当前公开链路处理真实历史记录的原因展示，与该命题同一范围；不证明真实生产故障时的全链路时序。探针与事件CLI SHA保持原值；真实回滚未执行，trap未触发。SSH stderr记录重启后一次curl(7)源站连接拒绝，健康只读重试随后成功，不将最终exit0描述为无瞬断。

可复现命令/证据目录 `output/status-reasons-2026-10-06/`：`node --test --test-reporter=tap tests/status-page.test.mjs tests/status-client.test.mjs`（status-test-final.log、57/57）、`npm test`（full-test-final.log、601/601）、生产隔离production-node-tests.log（57/57）、quality-checks-final.json（各exit0）；`node release-smoke.mjs https://status.aetherstudio.top`读当前公网字段，source与副本均冻结9071。`release-id.json`的published:false是上传候选时的历史元数据，后续publication-result.json记录实际发布，旧文件未改写。

字段反例锚点：rc28/http0输入的`home.status=='down' && home.reason.code=='request_timeout'`；age600000输入的`home.status=='unknown' && home.reason.code=='sample_stale'`且旧timeout仍在lastAnomaly；恢复用例`home.status=='up' && home.reason==null && lastAnomaly.recoveredAt==新采样时间`；伪secret用例`Object.hasOwn(home.latest,'extraAuthorization')==false`且JSON/HTML不含LOCAL_FAKE_SECRET。测试Date预加载只在测试子进程，生产没有该钩子；客户端VM不等于真实浏览器后台计时覆盖。

UI层本轮14:13:52公开Chromium证据：production-ui.json/production-mobile.png，390×844、scrollWidth375<=390、8项、generated==2026-10-06T06:12:47.595Z，与主代理公网字段生成时间相等。站点状态接口显示历史HTTP500/02:20、后续02:25恢复、当前正常，第三列标题“探测记录与原因”。只证明渲染与展开状态；未用截图证明业务根因。视口已恢复。本轮早期local-ui/local-mobile产物来自初版候选模拟日志，不作为9071最终发布证明。

独立公网复核 `node output/status-reasons-2026-10-06/review-public-release.mjs` 14:14:56 exit0，8up、历史500及随后首次正常采样时间与原日志相等、servedClientEqualsFrozenCandidate==true、historyRow768。首次exit1为复核脚本日期正则漏写“10-06”，修复该断言后全量复跑exit0，失败日志保留；不是产品故障或跳过用例。独立账本review-findings.md仍标部分完成。`node output/status-reasons-2026-10-06/check-record.mjs` exit0，changedFilesWithIndividualEvidence==24、最终统计57/601、公开字段一致/原失败记录保留/重启连接拒绝披露字段true；该命令只证明记录一致，不能扩大真实故障覆盖。

本轮改动可能引入的新风险：JSON新增历史诊断及HTML第三列增加字节/回源计算；每桶最近3+最严重为最多4条明细，不展示其余个别记录，但总数保持；公开raw err/附加字段收窄可能影响依赖非契约字段的API消费者。客户端保守未知理由是新鲜度确认范围，不能解读为实际停采样已满10分钟。诊断不能代替业务根因调查，也没有邮件/消息告警投递。

未覆盖范围：生产真实超时/无响应/停止采样、业务根因、外部告警、主站业务熔断、来源失败边缘缓存、真实回滚、全部浏览器/后台休眠/读屏/真机；本地UI只用明确标注的模拟日志。主站业务代码和原probe/incident CLI没有变。

## 2026-10-11 源站绑定与覆盖率修订（已部署）

状态：部分完成；2026-10-11 06:47 UTC 经用户“部署”指示替换到华为云北京主机，未改 Tunnel/DNS/安全组。修改前生产源 SHA256 `9071ba7b…`，修改后 `324d7eb5fcc10c90b5072d37635a182588ec296615ee64af7bca6064492d9b9c`。

部署证据（`ssh zaochang-cibox`）：
- 前置检查：`grep -rn service: /etc/cloudflared/` → `config.yml:5: service: http://localhost:8080`（`zc-cloudflared` ExecStart 使用该文件，非远程托管）；替换前 `ss -ltnp` 为 `0.0.0.0:8080`，远端 Node v22.20.0，`zc-status.service` 仅 `Environment=PORT=8080`（无 `STATUS_HOST`）。
- 备份 `/opt/zc-status/server.mjs.bak-loopback-20261011T064705Z`（SHA `9071ba7b…`）；上传候选远端 SHA 与本地 `324d7eb5…` 相等；替换并 `systemctl restart zc-status.service` 后 `is-active`=active，第 2 次健康请求 200，`ss -ltnp` 只见 `127.0.0.1:8080`。
- 偏差如实记录：替换前对临时文件 `server.mjs.candidate-<ts>` 的 `node --check` 因扩展名不被识别而报 `ERR_UNKNOWN_FILE_EXTENSION`（未进行语法检查），脚本未因此中止；替换后补跑 `node --check /opt/zc-status/server.mjs` exit 0。今后候选临时文件应命名为 `*.candidate-<ts>.mjs`。
- 行为：源站 `/api/status.json` overall=up、8 项 up、`expectedSamples24h==288`；盒子经公网 `https://status.aetherstudio.top/api/status.json` 200（cf-cache-status MISS）；从阿里云主机 `curl http://1.92.152.128:8080/` exit 7（连接拒绝），即公网直连 8080 已不可达。本机直连结果为 exit 52，受本地 VPN 拦截影响，不作证据。
- 覆盖率前后对比：替换前后均为 177/288（61.46%）与 178/288（61.81%），`samples24h` 同为 177/178——当前 24h 窗口内真实采样只有约 178 轮，不是分格算法造成的，新旧口径在此数据上相等；抖动场景差异由本地测试覆盖，未在生产复现。
- 未执行：回滚演练；安全组 8080 放行未收回（需单独批准）。

### 1. 源站只绑回环（代码审查发现，已核实）

- 发现核实：修改前 `server.mjs:632` 原文 `}).listen(PORT, '0.0.0.0', () => …)`；`CLOUDFLARE_RUNBOOK.md` 资源表记录北京主机 EIP `1.92.152.128`、“状态页(:8080,SG 已放行)”，即源站可能被公网直连，绕过 `status.aetherstudio.top` 的边缘缓存规则与 Cloudflare 防护。
- 现行：`HOST = process.env.STATUS_HOST || '127.0.0.1'`；启动日志为 `zc-status listening on <HOST>:<PORT>`。空字符串的 `STATUS_HOST` 也回落到回环。
- cloudflared 如何回源（证据边界）：仓库只记录连接器在北京主机本机（`/etc/cloudflared/`，systemd `zc-cloudflared`，非容器），以及发布脚本在盒子上用 `http://127.0.0.1:8080` 做源站 smoke（exit 0）；后者只证明本机回环可达，**不证明 Tunnel ingress 的目标地址**。ingress 配置文件内容/是否远程托管在仓库中无记录，本轮未读取。
- 部署前置检查（阻断级，未通过不得替换）：在盒子上 `grep -n 'service:' /etc/cloudflared/*.yml`（若为 dashboard 远程托管则在 Zero Trust → Tunnels → `zaochang-status-cibox` → Public Hostname 查看），确认 `status.aetherstudio.top` 的 service 为 `http://127.0.0.1:8080` 或 `http://localhost:8080`（`localhost` 由 cloudflared 先后尝试 ::1/127.0.0.1；旧 `0.0.0.0` 绑定本来就只监听 IPv4，因此行为等价）。若指向 EIP/内网 IP，二选一：先把 ingress 改为 `http://127.0.0.1:8080` 并重启 `zc-cloudflared`，或在 `zc-status.service` 的 drop-in 设 `Environment=STATUS_HOST=<该地址>`（不推荐 `0.0.0.0`，那等于不修）。
- 部署步骤：沿用上文“发布步骤”第 3–5 步替换 `server.mjs` 后 **必须 `systemctl restart zc-status.service`** 才会改绑；随后在盒子上 `ss -ltnp | grep 8080` 应只见 `127.0.0.1:8080`，源站 `release-smoke.mjs http://127.0.0.1:8080` 与公网 `https://status.aetherstudio.top` 均 exit 0；最后从外部 `curl --max-time 5 http://1.92.152.128:8080/` 应连接失败。确认公网链路正常后，可再收回安全组对 8080 的放行（属另一项生产变更，需单独批准）。
- 回滚：恢复备份 `server.mjs` 并重启，或临时 `STATUS_HOST=0.0.0.0` 恢复原暴露面（会重新引入该缺口）。

### 2. 采样覆盖率按固定计划时段计数（代码审查发现，已核实）

- 发现核实：修改前 `server.mjs:189` 原文 `new Set(rs.map(r => Math.floor((now - Date.parse(r.ts)) / INTERVAL))).size`，按“相对请求时刻 now”分格。夹具反例：288 轮采样、每轮 ±30s 确定性抖动、请求时刻在整 5 分钟后 1s，旧源得 `observedSlots24h==236`（期望 288）。
- 生产时间戳形态：冻结快照 `output/status-reasons-2026-10-06/probe-live-before.jsonl`（1375 行、195 个不同 ts）中 193 个 ts 位于 UTC 整 5 分钟后 1s（`probe.sh` 用 `date -u` 在脚本启动时取一次 ts，cron `*/5`），另 2 个为手动补跑；用该快照比对，旧算法在 05:49:59 得 194（把补跑算成独立时段），新算法得 193，等于 cron 实际轮数。
- 语义变更：从“以 now 为原点每 5 分钟一格、计有样本的格数”改为“UTC epoch 对齐的计划时段 k↔k·5min，样本归入最近时段（容差 ±2.5min），统计最近 288 个已到期时段中被覆盖的个数”。最新时段若尚无样本且容差未关闭（距该时段 <2.5min）视为待采样，窗口退一格；容差关闭后仍无样本计为缺失。为此最旧时段的样本最多可比 24h 早约 7.5 分钟，可能出现 `observedSlots24h` 比 `samples24h` 多 1 的边界情形。`expectedSamples24h==288`、`coverage24h==round2(100·observed/288)` 的公开关系不变。
- 仍能报告真实缺口：缺 1 轮 −1、15 分钟空洞（3 轮）−3；补跑/重复样本只能填补其所在 ±2.5min 时段，不能掩盖别处缺口。前提是探针保持整 5 分钟触发；若改为带随机偏移的定时器（偏移接近 ±2.5min），需同步调整对齐相位。

### 证据（Windows / Node v24.13.1，本地夹具 + 回环 HTTP，非生产）

- 新增 7 个 HTTP 用例（`tests/status-page.test.mjs`）：`status bind: default listens on loopback only …` 断言 `connectResult('127.0.0.2', port)=='ECONNREFUSED'` 且启动日志行等于 `zc-status listening on 127.0.0.1:<port>`；`status bind: STATUS_HOST explicitly overrides …` 断言 127.0.0.2 可取 200、127.0.0.1 拒绝；覆盖率用例断言 ±30s 抖动 `observedSlots24h==288 && coverage24h==100`、15 分钟空洞 `==285 && 98.96`、单轮缺失+两次补跑 `==287 && samples24h==289`、窗口边界 `samples24h==2 && observedSlots24h==2`（24h+1s 前的时段不计）、待采样时段 `==288`、容差关闭后 `==287`。harness 默认删除继承的 `STATUS_HOST`，保证其余用例走生产默认绑定。
- 修改前源（SHA `9071ba7b…`）跑这 7 项：1 pass / 6 fail、exit 1（窗口边界用例新旧都通过；绑定两项 actual `connected`，覆盖率 236/234/236/287）。修改后 `node --experimental-strip-types --test tests/status-client.test.mjs tests/status-page.test.mjs` exit 0，tests 64 / pass 64 / fail 0 / skipped 0 / cancelled 0 / todo 0（原 57 + 新 7，无删除/过滤/跳过）；`node --check deploy/status/server.mjs` exit 0。
- 后续补充：全量 `npm test` exit 0（614 pass / 0 fail / 0 skipped / 0 todo）；生产绑定、ingress 与外部 8080 可达性见上方部署证据。
- 未覆盖：真实安全组规则内容（只测了从阿里云主机直连被拒）、`output/status-*/check-record.mjs` 等历史对账脚本（它们钉死旧 SHA `9071…`，对新源必然不等，属预期）。`CLOUDFLARE_RUNBOOK.md` 主机表已于部署后同步。
