# 造场发布运行手册

## 1. 发布前闸门

同一提交必须满足：

```bash
npm ci
npx tsc --noEmit
npm run lint
npm test
npm run db:generate
git diff --check
npm audit --omit=dev --audit-level=high
```

判定要求：测试 `failed=0`、`skipped=0`、`todo=0`；迁移生成器输出无结构变化；高危或严重依赖漏洞为发布阻断项。中危告警必须登记受影响依赖、可利用条件与暂缓原因。

## 2. 运行时配置

发布前逐项确认 Sites 环境存在：

```text
APP_ENV=production
PUBLIC_APP_ORIGIN=https://<造场正式域名>
GITHUB_OAUTH_CLIENT_ID
GITHUB_OAUTH_CLIENT_SECRET (secret)
OIDC_SIGNING_PRIVATE_JWK (secret)
ZAOCHANG_ADMIN_EMAILS
```

`PUBLIC_APP_ORIGIN` 必须是纯 HTTPS origin，生产缺失或为 HTTP 时停止发布。Google 登录暂停时不要配置占位值。`TRUST_OAI_IDENTITY_HEADERS` 默认保持未设置；只有平台身份头注入边界经过独立验证后才能开启。

## 3. 数据与迁移

1. 确认待部署版本只包含预期的 `0006_release_readiness.sql`、`0007_product_like_counters.sql`、`0008_noisy_jazinda.sql`、`0009_moderation_remediation.sql` 与 `0010_invite_upload_security.sql` 新迁移。
2. 保存发布前 D1 数据导出或平台快照，并记录时间与版本。
3. 在包含历史 `product_orders` 与 `product_likes` 引用的隔离数据库按 `0000` 至 `0009` 顺序重放，要求全部退出码为 0，且引用的 `product_id` 不变。
4. 核对所有迁移前用户产品均变为 `status=review_status=pending_review`、`review_version=1`、`approved_version=0`，并已进入管理员预审队列。
5. 核对钱包物化余额与 `fruit_entries` 聚合余额；存在不一致时停止发布并转人工复核。
6. 先保存站点版本，再执行迁移和部署；不要在未保存回退版本时修改生产数据结构。

`0008` 会在延期外键约束下重建 `products` 表，但不得删除订单、点赞或其他业务引用；任何外键错误都必须中止发布。代码回滚不会自动删除新结构；禁止直接反向删除列、审核决定或账本记录。

`0009` 会让已有外部 `demoUrl` 的批准产品重新进入待审，并禁止外链版本再次批准。它还增加违规下架退款/补偿分录守门；回滚应用时不得删除这些触发器或已生成分录。

## 4. 发布顺序

1. 保存已通过闸门的精确源码版本。
2. 先部署为所有者可访问版本。
3. 执行下方冒烟检查。
4. 检查错误日志、支付风险事件和 D1 迁移状态。
5. 只有所有阻断项关闭后，才请求开启目标公开访问策略。

## 5. 冒烟检查

- 匿名访问社区、产品银河和六个嵌入应用。
- GitHub 测试账号登录、返回原路径、退出、旧 Cookie 重放失败。
- 新账户钱包余额为 `0`，签到和充值入口均不存在。
- 免费与付费用户产品提交后均显示“审核中”，匿名列表、详情、体验、点赞、评论、打赏和支付均返回不可访问；管理员批准当前版本后才公开。
- 修改已批准产品的所有权、标题、说明、分类、体验地址、封面或价格后，产品重新进入预审；旧支付幂等键不得在复审期间返回访问权。
- 管理员能读取已关联待审产品的私有封面，但不能读取普通私有上传或尚未关联产品的孤立封面。
- 未审核 OAuth 应用请求 `fruit:pay` 返回拒绝；审核后可进入授权页。
- 外部支付创建时余额不变，用户确认后只扣一次。
- 一次解锁退款后买家余额恢复、商户待结算归零；商户冻结状态不被退款过程解除。
- 修改测试钱包物化余额后，购买返回 `wallet_ledger_mismatch` 且钱包状态为 `review`。
- 用户提交孵化项目后停留在“资料审核”；只有管理员操作才推进阶段。
- 举报作品经管理员隐藏后，不再出现在公开列表和详情页。
- 举报下架的一次解锁产品必须撤销权益；未结算订单从卖家待结算余额退回，已结算订单生成 `moderation_compensation` 审计分录，按次体验不追溯退款。
- 带外部 `demoUrl` 的产品批准请求必须返回 `409 external_demo_requires_immutable_package`，直接写审核决定也必须被数据库触发器拒绝。
- GitHub 授权请求的 `redirect_uri`、OIDC `issuer` 与外部支付确认 origin 必须等于 `PUBLIC_APP_ORIGIN`。
- 普通页面响应 `X-Frame-Options: DENY`；`/product-apps/*` 仅允许 `SAMEORIGIN`，嵌入体验可加载。

## 6. 回滚条件

出现以下任一情况立即回滚应用版本并关闭付费写入口：

- 同一幂等键产生多次扣果或退款。
- 钱包余额与账本聚合不一致持续新增。
- 退款后买家未恢复或卖家待结算未冲销。
- 未审核客户端获得果子写权限。
- 伪造身份头可在生产环境创建登录态。
- 管理员白名单为空时仍有人可访问后台。
- 没有 `product_review_decisions` 当前版本记录时，产品能被直接改成 `approved/published`。
- 待审或驳回产品仍能新增订单、点赞、产品评论、打赏或点赞奖励。

回滚应用后保留 `0006`、`0007`、`0008` 与 `0009` 新结构，不删除账本、订单、产品审核决定、退款/补偿分录、审计或风险记录。对已生效的错误财务动作先冻结相关钱包，再依据不可变分录进行人工对账；不得通过更新或删除历史分录“修正”余额。

## 7. 公开测试边界

阿里云入口可以作为“公开测试版”匿名开放首页、银河、产品页和公开社区读取。它仍使用服务器本地 Wrangler/Workerd 与 `/var/lib/zaochang/state`，单机数据库、单机备份和未建立外部告警接收链意味着它不得表述为正式生产或高可用发布。

GitHub 是唯一启用的账户提供方。已有 `oauth_accounts` 身份直接登录；首次创建 OAuth 身份必须通过 `invitation_redemptions` 原子消耗有效邀请码。邀请码明文只允许由管理员创建接口返回一次，数据库只保存 SHA-256；不得把邀请码放进 OAuth URL、Nginx 日志或发布包。

所有上传必须经过 `uploaded_files.pending → ClamAV → clean|infected|error`。只有数据库和 R2 metadata 同时为 `clean` 且 SHA-256 相等的最终对象可以读取；扫描器缺失、超时、忙、签名更新中或响应不一致均返回 `503`，不得回退成直接上传。ClamAV 扫描和签名更新共用 `/run/lock/zaochang-clamav.lock`，避免在 1.6 GiB 主机上并发占用内存。

用户仍可把外部 `demoUrl` 作为待核对资料提交，但 `0009` 与管理员 API 会拒绝批准。公开测试的可批准产品只覆盖站内原型；外部体验恢复前必须实现受控站内包或可复核的不可变内容摘要。

## 8. 阿里云公开测试发布

检查当前版本和服务：

```bash
readlink -f /opt/zaochang/current
systemctl show zaochang.service -p ActiveState -p SubState -p NRestarts -p ExecMainStatus
systemctl show zaochang-upload-scanner.service -p ActiveState -p SubState -p NRestarts -p ExecMainStatus
systemctl show nginx.service -p ActiveState -p SubState -p NRestarts -p ExecMainStatus
systemctl is-enabled zaochang-clamav-update.timer
systemctl is-active zaochang-clamav-update.timer
ss -lntp | grep -E ':(80|443|3001|3311)[[:space:]]'
nginx -t
certbot certificates
sysctl vm.swappiness
```

部署扫描器前安装 `clamav` 与 `clamav-freshclam`，关闭其常驻 updater，改由仓库内串行 timer 更新；把 `deploy/server/99-zaochang-memory.conf` 安装到 `/etc/sysctl.d/` 后要求 `vm.swappiness == 20`。扫描 token 只保存在 `root:zaochang 0640` 的 `/etc/zaochang/scanner.env` 与应用 env，不输出明文：

```bash
apt-get install -y --no-install-recommends clamav clamav-freshclam
systemctl disable --now clamav-freshclam.service
install -o root -g root -m 0644 deploy/server/99-zaochang-memory.conf /etc/sysctl.d/99-zaochang-memory.conf
sysctl --system
systemctl enable --now zaochang-upload-scanner.service zaochang-clamav-update.timer
```

需要立即关闭公开测试时，先恢复上一 release 的 Basic Auth Nginx 配置并验证匿名首页重新为 `401`，再决定是否回退应用。不得删除业务数据、新迁移表、邀请码兑换记录或上传扫描记录：

```bash
install -o root -g root -m 0644 /opt/zaochang/releases/<上一版>/deploy/server/zaochang-preview.nginx.conf /etc/nginx/sites-available/zaochang-preview
nginx -t && systemctl reload nginx
curl --resolve aetherstudio.top:443:127.0.0.1 -k -sS -o /dev/null -w '%{http_code}\n' https://aetherstudio.top/
```

禁止通过删除 `/var/lib/zaochang/state` 回滚业务数据；该目录必须先做完整快照。正式生产前仍须迁回受支持的 Cloudflare D1/R2 或等价托管运行时，并补齐跨机备份和外部告警。任何曾进入对话、日志或命令输出的 Secret 都必须先轮换并删除旧项。

Nginx 对动态页面和 API 保持每 IP `10 req/s + burst=100 + limit_conn=30`，并继续代理到 Workerd。只对受信任的 `/assets/`、`/product-apps/` 和 `/favicon.svg` 静态命名空间使用独立的 `64 req/s + burst=160 + limit_conn=128`；这些文件必须从原子发布链接 `/opt/zaochang/current/dist/client` 直接读取，不得重新代理到 Workerd。静态速率放宽只适用于版本化文件，动态写路径不得复用该 zone。

`/assets/*` 的不可变缓存头只能出现在成功响应，缺失文件 `404` 必须满足 `Cache-Control == null`。`/product-apps/*` 直接由 Nginx 提供后，仍必须逐字段保留 `X-Frame-Options: SAMEORIGIN`、`Content-Security-Policy`、`X-Content-Type-Options: nosniff`、Referrer-Policy 和 Permissions-Policy；WANDER 为 `geolocation=(self)`，其余五个应用为 `geolocation=()`。

修改静态根目录、速率或并发值后必须同时执行：

```bash
nginx -t
systemctl reload nginx
systemctl show nginx -p ActiveState -p SubState -p NRestarts
```

公开测试静态探针使用 `--auth none --path /assets/<当前最大模块> --concurrency 128 --expected-status 200 --expected-bytes <真实字节数>`；动态探针使用 `--auth none --path /api/community --concurrency 30 --expected-status 200`。放行字段必须同时为 `allExpectedStatus == true`、`noErrors == true`、`allExpectedBytes == true`、`restartsStable == true`，并记录 P95；全状态码为 `200` 只证明请求终态，不证明延迟满足未定义的 SLO。保留的 `--auth basic` 只用于关闭公开测试后的回滚探针，凭据仍只能经 stdin 传入。

最后用全新浏览器上下文加载 `/galaxy`，要求每个模块与 favicon 都是 `200`、控制台 `0 errors` 且 Canvas 非空；只检查首页 `200` 或容量探针不足以证明页面像素与 WebGL 终态。

服务器加固资产位于 `deploy/server/`。`zaochang-backup.timer` 每日生成停服一致性快照并保留 14 天；`zaochang-health.timer` 每 5 分钟检查应用、Nginx、上传扫描器、签名年龄、签名更新 timer、回环 API、磁盘、内存、备份校验和与证书。每次发布后至少执行一次：

```bash
systemctl start zaochang-backup.service
/usr/local/sbin/zaochang-restore-check /var/backups/zaochang/<最新备份>.tar.gz
systemctl start zaochang-health.service
```
