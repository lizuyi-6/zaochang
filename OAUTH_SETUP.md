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
Authorization callback URL=https://aetherstudio.top/api/auth/github/callback
```

Client Secret 不写入本文件、仓库或发布包，只能存在于服务器受限环境文件或正式 Secrets 管理器。GitHub 应用页面必须只保留当前验证过的 Secret；任何曾暴露的旧 Secret 要在新 Secret 完成真实 token exchange 后立即删除。

## Google 登录

Google 登录当前停用，登录页不显示 Google 控件，运行时即使误注入 Google 变量也不会启用提供方。恢复 Google 需要单独的产品决策、邀请码规则复用、安全测试和代码变更，不能只添加两个环境变量。

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

生产环境默认拒绝客户端自行发送的 `oai-authenticated-user-email` 与相关姓名头。仅当部署平台保证剥离外部同名头并可信注入身份时，才设置：

```text
TRUST_OAI_IDENTITY_HEADERS=true
```

无法证明上述前置条件时必须保持未设置。

## 会话与退出

- 会话 Cookie 为 HttpOnly、SameSite=Lax，数据库只保存 SHA-256 哈希。
- 会话期限为 30 天。
- `/api/auth/logout` 会删除服务端会话并清除 Cookie；旧 Cookie 重放不再恢复登录。
- OAuth state 使用独立的 10 分钟 HttpOnly Cookie，并与具体 provider 绑定。
- 首次注册的邀请码 Cookie 只保存 SHA-256，不保存明文，并在登录成功或任何回调错误后清除。

## 迁移

发布版本必须按顺序应用 `drizzle/0000` 至 `drizzle/0010_invite_upload_security.sql`。`0009` 阻止可变外部 Demo 获得批准，并约束违规下架退款/补偿分录只能引用真实的一次解锁订单；`0010` 增加邀请码原子消耗、OAuth 建号数据库守门和上传扫描状态机。

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
