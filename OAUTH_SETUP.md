# 登录与 OAuth 配置

造场同时包含两类 OAuth 能力：

1. GitHub 登录造场：造场是 OAuth 客户端。
2. 第三方平台“使用造场登录”：造场是 OAuth 2.1 / OIDC 身份提供方。

两者的 Client ID、密钥和回调地址不可混用。

## GitHub 登录造场

在 GitHub Settings > Developer settings > OAuth Apps 创建应用：

```text
Application name: 造场
Homepage URL: https://<造场正式域名>
Authorization callback URL: https://<造场正式域名>/api/auth/github/callback
```

本地独立 OAuth 应用可使用：

```text
http://localhost:3001/api/auth/github/callback
```

Sites 运行时变量：

```text
PUBLIC_APP_ORIGIN=https://<造场正式域名>
GITHUB_OAUTH_CLIENT_ID=<GitHub Client ID>
GITHUB_OAUTH_CLIENT_SECRET=<secret>
```

`PUBLIC_APP_ORIGIN` 是 OAuth 回调、OIDC issuer、支付确认与退出重定向的唯一生产 origin。它必须是没有路径、查询参数或凭据的 HTTPS origin；生产缺失时返回 `public_app_origin_required`，配置 HTTP 或畸形值时返回 `invalid_public_app_origin`。不要使用客户端提供的 `Host` 或 `X-Forwarded-*` 推导生产 issuer。

回调会同时读取 `/user` 与 `/user/emails`，只接受 verified email。账号绑定键为 `github + GitHub user id`；GitHub 邮箱后续变化不会把同一个 GitHub 身份迁移到另一造场账户。

公开测试采用邀请注册：已有 `oauth_accounts` 身份不需要邀请码；首次创建 GitHub 身份必须在登录表单提供有效邀请码。原始邀请码只经 HTTPS 表单提交，OAuth 跳转前转换成 SHA-256 并放入 10 分钟 HttpOnly、SameSite=Lax Cookie；回调使用数据库 trigger 原子写入 `invitation_redemptions` 并消耗次数。无邀请码、已过期、已撤销或次数耗尽时不得创建 `members`、`wallets` 或 `oauth_accounts` 残留记录。

当前公开测试使用以下公开配置：

```text
PUBLIC_APP_ORIGIN=https://aetherstudio.top
GITHUB_OAUTH_CLIENT_ID=Ov23livgjlLc01RdgmuN
ZAOCHANG_FOUNDER_EMAIL=<创始人 GitHub 已验证邮箱，必须且只能配置一个>
Authorization callback URL=https://aetherstudio.top/api/auth/github/callback
```

`ZAOCHANG_FOUNDER_EMAIL` 只控制创始人身份呈现，必须同时单独列入 `ZAOCHANG_ADMIN_EMAILS` 才能访问管理中心。两项权限不互相推导：创始人变量缺失或配置多个值时，页面按普通成员显示；管理员白名单缺失时，后台继续拒绝全部访问。

Client Secret 不写入本文件、仓库或发布包，只能存在于服务器受限环境文件或正式 Secrets 管理器。GitHub 应用页面必须只保留当前验证过的 Secret；任何曾暴露的旧 Secret 要在新 Secret 完成真实 token exchange 后立即删除。

## Google 登录

Google 登录当前停用，登录页不显示 Google 控件，运行时即使误注入 Google 变量也不会启用提供方。恢复 Google 需要单独的产品决策、邀请码规则复用、安全测试和代码变更，不能只添加两个环境变量。

## Passkey（通行密钥）登录

通行密钥是**已有成员的追加登录方式**，不参与首次注册——创建账号仍只走 GitHub / 邮箱验证码 + 邀请码，因此本节没有任何需要配置的 Secret 或第三方控制台。入口：

- 登录页「使用通行密钥登录」（`app/signin/passkey-button.tsx`，discoverable 流程，无需输邮箱）；
- 「编辑个人资料」页的通行密钥管理区（`app/profile/edit/passkey-manager.tsx`）：添加本设备、改名、删除。

运行语义（无需配置，但验收时要知道）：

- RP ID 与合法 origin 唯一推导自 `PUBLIC_APP_ORIGIN`（生产 `https://aetherstudio.top` → RP ID `aetherstudio.top`，`www.` 子域也在放行列表内；本地 dev 自动回落请求 origin，RP ID 即 `localhost`/`127.0.0.1`）。**不同环境的通行密钥互不通用**（RP ID 不同）：本地注册的钥匙在 staging/生产不可用，反之亦然；验收时各环境各注册各的。
- 挑战在服务端原子消费（`webauthn_challenges` 表只存 SHA-256，注册/登录 purpose 隔离），重放同一条断言过不了消费闸；WebAuthn 浏览器 API 需要 HTTPS（生产满足）或 localhost。
- 同步型凭据（iCloud 钥匙串 / Google 密码管理器）的 counter 可恒为 0，克隆判定按凭据的 deviceType 分流，删除凭据不影响 GitHub/邮箱码登录（passkey 永远是追加凭据，不存在锁定风险）。

## 造场作为 OIDC 身份提供方

发现文档：

```text
https://<造场正式域名>/.well-known/openid-configuration
```

生产必须提供固定 ES256 P-256 私钥，不能依赖运行时临时生成：

```text
APP_ENV=production
PUBLIC_APP_ORIGIN=https://<造场正式域名>
OIDC_SIGNING_PRIVATE_JWK=<包含 kty/crv/x/y/d/kid 的私有 JWK secret>
```

轮换密钥时，先把旧公钥放入 `OIDC_PREVIOUS_PUBLIC_JWKS`，再替换 `OIDC_SIGNING_PRIVATE_JWK`。等待已签发 ID Token 的最长有效期结束后，才能移除旧公钥。

第三方应用在 `/developers` 注册后默认为：

```text
review_status=unverified
write_access_approved=0
```

只读 `openid/profile/email/fruit:balance` 可按登记范围授权；`fruit:pay` 与 `fruit:refund` 必须由管理员在 `/admin` 审核通过。公开客户端禁止申请果子写权限。所有授权请求强制 PKCE S256 与精确回调地址匹配。

刷新令牌每次使用都会轮换。已轮换令牌再次出现时，服务端会把同一令牌族和由其产生的访问令牌一并撤销，客户端必须要求用户重新授权。

## 管理员与身份头

管理员采用显式邮箱白名单，空配置等同于无人有权限：

```text
ZAOCHANG_ADMIN_EMAILS=admin1@example.com,admin2@example.com
```

客户端发送的 `oai-authenticated-user-email` 与相关姓名头只在 `APP_ENV` 显式为 `development` 或 `test` 时被信任（fail-closed 白名单，与 dev-login 同口径）；production、staging、未设置或拼写错误的 `APP_ENV` 一律拒绝。原 `TRUST_OAI_IDENTITY_HEADERS` 开关已移除（2026-10 全库审查），设置它不再有任何效果：

```text
APP_ENV=development   # 或 test;仅本地/测试联调
```

## 会话与退出

- 会话 Cookie 为 HttpOnly、SameSite=Lax，数据库只保存 SHA-256 哈希。
- 会话期限为 30 天。
- `/api/auth/logout` 会删除服务端会话并清除 Cookie；旧 Cookie 重放不再恢复登录。
- OAuth state 使用独立的 10 分钟 HttpOnly Cookie，并与具体 provider 绑定。
- 首次注册的邀请码 Cookie 只保存 SHA-256，不保存明文，并在登录成功或任何回调错误后清除。

## 资金语义:退款权优先于卖家风控(设计确认)

外部支付与作品订单的一次解锁退款**不检查卖家钱包状态**(`frozen`/`review` 均不阻断)。这是有意设计:买家在退款窗口(10 分钟)内的退款权优先于卖家侧风控——若退款被卖家钱包状态拦截,卖家被风控会顺带冻结所有买家的正当退款,资金卡死在 `pending`。卖家侧风控由下架/结算拦截兜底(`settleDueExternalFruit` 只结算 `active` 商户钱包)。该语义由 `tests/suites/07-oidc-external.tests.mjs` 钉住:商户钱包置 `frozen` 后退款仍须 200、买家余额回补、待结算归零。(2026-10 全库审查 L1 降级为设计确认)

## 迁移

发布版本必须按顺序应用 `drizzle/0000` 至 journal 当前水位 `drizzle/0019_community_counter_triggers.sql`（共 20 条，forward-only）。与登录/审核直接相关的后段迁移：

- `0009` 阻止可变外部 Demo 获得批准，并约束违规下架退款/补偿分录只能引用真实的一次解锁订单。
- `0010` 增加邀请码原子消耗、OAuth 建号数据库守门和上传扫描状态机。
- `0018` 增加 `email_login_codes` 并把三个 provider CHECK 放宽到 `'email'`；它会 **drop → rebuild → recreate** 邀请相关触发器，应用后必须核对触发器已重建（见 SQL 内注释）。
- `0019` 增加社区计数器触发器、隐藏帖过滤与时区约束。

部署流水线会用 `scripts/check-migrations.mjs` 对生产 `__drizzle_migrations` 做**有序逐条对账**（数量 + 每条账目 + created_at 水位），任一错位即 fail-closed 阻断部署。账目 hash 有三种历史口径，任一命中即通过：SQL 文件 sha256（CRLF 原样或 LF 归一），或迁移 tag 本身（生产 `0013`–`0018` 六条为 tag 入帐，检查器会输出 limited verification 通告；tag 必须与所在位置精确相等，错位仍被拒）。注意该表只由 drizzle migrator 写入：`wrangler d1 execute --file` 应用的 SQL 必须按 `backups/_backfill_drizzle_migrations.sql` 的方式手工回填账目行。

发布前运行：

```bash
npm run db:generate
```

预期输出是 `No schema changes, nothing to migrate`。任何新生成的迁移都必须先审查，不能与正式部署一起盲目应用。

## 真实回调验收

本地集成测试覆盖会话、授权码、PKCE、签名、令牌轮换和支付行为，但不能代替第三方真实网络回调。正式发布前需使用专用测试账号分别验证：

- GitHub 授权后读取 verified email 并回到原路径。
- 已有 GitHub 身份留空邀请码仍可登录；一个新 GitHub 身份只能消耗一次有效邀请码，耗尽邀请码不能创建第二个身份。
- 退出后旧 Cookie 不能重放。
- 未审核应用无法请求果子写权限。
- 已审核应用可完成授权，但每笔支付仍要求造场页面二次确认。
- OAuth 凭据、JWK 私钥和访问令牌未出现在仓库、日志、URL 或错误页中。
