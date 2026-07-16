# 造场

造场是一个面向创作者的产品社区与开放产品生态。用户可以发布和体验产品、参与讨论与收藏；公司产品通过“造场产品银河”展示；外部团队可以提交项目并在孵化控制台查看真实阶段、任务、负责人和反馈。

## 产品范围

- 社区：发现、动态、圈子、挑战预览、收藏、创作台、通知、个人资料与内容举报。
- 产品：免费、一次解锁、按次体验三种模式，以及六个嵌入式产品应用。
- 果子：不可购买、提现或兑换法币的站内记账单位。
- 产品银河：公司中心、业务星系、产品目录、项目申请与孵化控制台。
- 开发者生态：造场 OAuth 2.1 / OIDC 登录，以及需要用户逐笔确认的外部果子支付 API。
- 运营后台：OAuth 客户端审核、内容举报处置、果子风险事件和孵化阶段管理。

## 产品预审

- 所有用户或卖家提交的产品都进入平台预审，免费、一次解锁和按次体验没有例外。
- 审核前产品只对作者和审核队列可见，不进入公开列表、详情、体验、点赞、评论、打赏或果子支付。
- 管理员的批准/驳回决定按产品版本留痕；没有当前版本审核决定时，数据库拒绝把产品改成公开终态。
- 已批准产品修改所有权、名称、说明、分类、体验地址、封面、主题或定价后，自动生成下一审核版本并重新隐藏。
- 造场官方内置展示应用不是卖家上传记录，继续按受信任的一方静态代码发布；若未来开放其运营编辑入口，也应接入同一版本审核模型。

## 果子规则

- 新账户余额为 `0`，没有签到、注册或发布作品赠送。
- 符合账号年龄、唯一性、频率和每日上限规则的作品点赞，可为创作者产生 `1` 果待结算奖励。
- 点赞奖励在 `24h` 后进入可用余额；结算前取消点赞会撤销待结算奖励。
- 付费转移要求账号注册满 `24h`。
- 买家扣款与卖家待结算收入使用不可更新、不可删除的双边账本分录。
- 一次解锁可在 `10min` 内退款；按次体验确认后不可退款；创作者收入在 `24h` 后结算。
- 钱包物化余额与不可变账本不一致时，交易返回 `wallet_ledger_mismatch`，钱包进入人工复核状态。

## 本地运行

要求 Node.js `>=22.13.0`。

```bash
npm ci
npm run dev
```

本地默认地址由开发服务器输出。D1 与 R2 的逻辑绑定分别为 `DB` 和 `UPLOADS`，声明在 `.openai/hosting.json`。

## 质量命令

```bash
npx tsc --noEmit
npm run lint
npm test
npm run db:generate
git diff --check
npm audit --omit=dev --audit-level=high
```

`npm test` 会先构建站点，再在全新本地 D1 上依次执行全部迁移并运行集成测试。`npm run db:generate` 后不应产生新的迁移；若产生，说明 `db/schema.ts`、迁移 SQL 与 Drizzle 快照尚未同步。

## 生产配置

生产运行至少需要以下 Sites 运行时配置：

```text
APP_ENV=production
PUBLIC_APP_ORIGIN=https://<造场正式域名>
GITHUB_OAUTH_CLIENT_ID
GITHUB_OAUTH_CLIENT_SECRET
OIDC_SIGNING_PRIVATE_JWK
ZAOCHANG_ADMIN_EMAILS
```

`PUBLIC_APP_ORIGIN` 必须是没有路径、查询参数或凭据的 HTTPS origin；生产缺失或使用 HTTP 时 OAuth/OIDC 请求会失败闭锁。`GITHUB_OAUTH_CLIENT_SECRET` 与 `OIDC_SIGNING_PRIVATE_JWK` 必须作为 secret 保存。Google 登录当前暂停，可不配置。生产环境默认不信任 `oai-authenticated-user-*` 请求头；只有部署平台能够可信地剥离外部同名头并重新注入身份时，才允许设置 `TRUST_OAI_IDENTITY_HEADERS=true`。

详细配置见 [OAUTH_SETUP.md](./OAUTH_SETUP.md)，发布顺序与回滚条件见 [RELEASE_RUNBOOK.md](./RELEASE_RUNBOOK.md)，历次范围与缺口见 [PROJECT_STATUS.md](./PROJECT_STATUS.md)。

## 外部接入

- `/.well-known/openid-configuration`：OIDC 服务发现。
- `/oauth/authorize`：Authorization Code + PKCE S256。
- `/api/oauth/token`：授权码交换与刷新令牌轮换。
- `/api/oauth/userinfo`：按范围返回用户资料。
- `/api/v1/fruit/*`：余额、支付意图、查询与退款。

第三方应用先在 `/developers` 注册。`fruit:pay` 与 `fruit:refund` 只有在应用验证和人工审核均通过后才能授权；支付意图本身不扣果，用户必须回到造场批准每一笔金额。
