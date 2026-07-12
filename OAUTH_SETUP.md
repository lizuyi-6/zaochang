# Google / GitHub 登录配置

代码已经提供统一登录页和 OAuth 回调。没有配置凭据时，登录页会显示“待配置”，不会把用户误导到第三方授权页。

## 1. 回调地址

线上站点：

```text
https://zaochang-product-galaxy-20260712.shijieqid-8361.chatgpt.site
```

Google 回调地址：

```text
https://zaochang-product-galaxy-20260712.shijieqid-8361.chatgpt.site/api/auth/google/callback
```

GitHub 回调地址：

```text
https://zaochang-product-galaxy-20260712.shijieqid-8361.chatgpt.site/api/auth/github/callback
```

本地开发回调地址：

```text
http://localhost:3001/api/auth/google/callback
http://localhost:3001/api/auth/github/callback
```

建议线上和本地使用不同的 OAuth 应用，避免回调地址和密钥混用。

## 2. 创建 Google OAuth 应用

1. 打开 Google Cloud Console。
2. 创建或选择一个项目。
3. 在“API 和服务”中配置 OAuth consent screen。
4. 用户类型选择 External；开发阶段可以先加入你的测试账号。
5. 创建 OAuth Client ID，应用类型选择 Web application。
6. 在 Authorized redirect URIs 中加入线上 Google 回调地址。
7. 复制 Client ID 和 Client Secret。

需要配置的环境变量：

```text
GOOGLE_OAUTH_CLIENT_ID=你的 Google Client ID
GOOGLE_OAUTH_CLIENT_SECRET=你的 Google Client Secret
```

Google 只需要 `openid email profile` 权限，不需要 Gmail、Drive 或其他 API 权限。

## 3. 创建 GitHub OAuth App

1. 打开 GitHub Settings > Developer settings > OAuth Apps。
2. 点击 New OAuth App。
3. Application name 填写“造场”。
4. Homepage URL 填写线上站点地址。
5. Authorization callback URL 填写 GitHub 回调地址。
6. 创建后复制 Client ID。
7. 点击 Generate a new client secret，并只保存一次显示的 Secret。

需要配置的环境变量：

```text
GITHUB_OAUTH_CLIENT_ID=你的 GitHub Client ID
GITHUB_OAUTH_CLIENT_SECRET=你的 GitHub Client Secret
```

代码申请 `read:user user:email`，只读取 GitHub 用户身份和邮箱，不读取仓库内容。

## 4. 写入 Sites 运行时环境

不要把 Client Secret 写进 GitHub、`.openai/hosting.json` 或 `.env` 后提交。

在 Sites 环境变量中写入以下四项：

```text
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GITHUB_OAUTH_CLIENT_ID
GITHUB_OAUTH_CLIENT_SECRET
```

其中两个 `CLIENT_SECRET` 必须标记为 secret。设置环境变量后，需要重新部署一个已保存版本，运行时才会读取新配置。

## 5. 数据库迁移

新增迁移文件：

```text
drizzle/0001_oauth_accounts.sql
```

它会创建：

- `oauth_accounts`：第三方账号与造场邮箱的绑定。
- `auth_sessions`：只保存 SHA-256 后的会话 token，不保存明文 token。

部署新版本时需要让 Sites 应用这份 D1 migration。若平台提示迁移未应用，先执行该 migration，再重新部署版本。

## 6. 用户登录流程

```text
登录页
  -> Google / GitHub 授权
  -> OAuth callback
  -> 读取第三方 verified email
  -> 创建或更新 members
  -> 初始化钱包和欢迎交易
  -> 创建 30 天 HttpOnly 会话
  -> 回到原页面
```

现有 ChatGPT 登录仍然保留。三种登录方式最终都通过统一的 `getChatGPTUser()` / `optionalMember()` 进入现有作品、评论和钱包逻辑。

## 7. 本地验证

没有配置凭据时可以验证骨架：

```text
http://localhost:3001/signin
```

预期结果：

- Google 显示“待配置”。
- GitHub 显示“待配置”。
- ChatGPT 登录仍然可用。
- 访问 `/api/auth/google/start` 会回到登录页并提示未配置。

配置真实凭据后，再使用一个真实 Google 或 GitHub 测试账号完整走一遍授权回调。

## 8. 安全注意事项

- 不要把 Client Secret 发到聊天、提交信息或 GitHub issue。
- 不要使用 `*` 作为 OAuth 回调允许来源。
- 生产环境必须使用 HTTPS。
- 只接受 Google verified email 和 GitHub verified email。
- 不要根据 GitHub 昵称或 Google display name 判断账号唯一性。
- 账号唯一绑定使用 `provider + provider_account_id`。
- 如需解绑账号，需要后续增加已登录用户的账号管理页面。
