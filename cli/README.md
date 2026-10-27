# zc —— 造场 MCP 客户端 CLI

终端直连造场 `/api/mcp`,与 Claude Code / Codex 走同一接入面(同一批工具、同一套限流与审计),零第三方依赖,只需要 Node ≥ 22。

```bash
npm run cli -- login            # 等价于 node cli/zc.mjs login
npm run cli -- tools list
npm run cli -- call list_my_products
```

## 认证(两条路,二选一)

**OAuth(推荐,默认)**

```bash
node cli/zc.mjs login                       # 拉起浏览器,在造场同意页点「允许」
node cli/zc.mjs login --no-browser          # 无图形环境:手动打开打印出来的 URL
```

流程与 Claude Code 一致:本机随机端口起 loopback 回调 → 动态注册公开客户端(RFC 7591,`token_endpoint_auth_method=none`)→ 授权码 + PKCE S256 → 换 `zca_` 令牌。访问令牌 1 小时、刷新令牌 30 天且轮换(每次刷新立即落盘,重放会全族吊销——CLI 已按此语义实现)。默认客户端名 `zc CLI (<本机名>)`,可用 `--name` 自定义;服务端拒绝冒充平台名的注册。

**个人 API key(免浏览器)**

在造场「密钥管理」创建 `zc_` 前缀的个人 key(每人最多 5 枚):

```bash
echo "$KEY" | node cli/zc.mjs login --api-key    # 或交互粘贴
ZC_API_KEY="$KEY" node cli/zc.mjs tools list     # 临时用,不落盘
```

API key 的能力面只有 `POST /api/mcp`,适合 CI/脚本;OAuth 适合日常本机。

## 命令

| 命令 | 说明 |
| --- | --- |
| `login` / `logout` | 登录 / 吊销服务端令牌族并删除本地凭据 |
| `whoami` | 端点、凭据类型、令牌过期时间、服务端与协议版本 |
| `ping` | 连通性测试 |
| `tools list [--json]` | 列出全部 MCP 工具与必填参数 |
| `call <工具> [--args JSON] [--arg k=v …]` | 调用工具;`--arg` 值先按 JSON 解析(数字/布尔/字符串),失败按原文传 |
| `host upload <product_id> <bundle.zip>` | `begin_hosting_upload` + 一次性 PUT + 回查状态一条龙 |

全局选项:`--origin`(默认 `https://aetherstudio.top`,须与登录 origin 一致)、`--config`(配置文件路径,默认 `~/.zaochang/zc-cli.json`,亦可用 `ZC_CLI_CONFIG` 环境变量)、`--json`。

### 例:静态托管

```bash
node cli/zc.mjs call create_product --arg 'title=我的站' --arg 'description=说明' --arg 'category=web'
node cli/zc.mjs host upload 7 ./dist/bundle.zip      # 需要 hosting 邀请授权,demo_url 须为空
node cli/zc.mjs call get_hosting_status --arg product_id=7   # 轮询;next_step 会给出下一步
node cli/zc.mjs call remove_hosting --arg product_id=7
```

一次性上传地址 15 分钟有效、只能用一次;ZIP 结构/扩展名/密钥扫描全部在服务端复检,失败原因见 `get_hosting_status` 的 `failureCode`。

## 错误与退出码

- 工具执行失败(`isError`):stderr 打印错误码(含 `retryAfterSeconds` 时一并给出),退出码 1;
- 401 会自动刷新一次令牌重试(OAuth 模式);刷新被拒(令牌族已吊销)提示重新 `login`;
- 限流(60/分钟/凭据 + 120/分钟/会员)会原样透传服务端的错误码与 retry-after。

## 测试

`tests/zc-cli.test.mjs` 用假 origin 服务器(node:http)复刻服务端契约,覆盖:登录全流程(含 state 篡改拒绝、access_denied、DCR 被拒)、PKCE 挑战交叉验证、握手与协议头、401 刷新重试、轮换落盘、CLI 子进程(login --api-key / call 参数解析 / host upload / logout / OAuth --no-browser 全程)。

```bash
node --test tests/zc-cli.test.mjs
```

## 安全注意

- 凭据文件含 Bearer 令牌:目录 0700、文件 0600(Windows 上为尽力而为),不要提交或同步到别处;
- `login --api-key` 输入不隐藏,注意肩窥;更稳妥的方式是 `ZC_API_KEY` 环境变量或管道输入;
- 回调绑定 `127.0.0.1` 随机端口且注册时精确匹配,授权码/PKCE/state 均一次性校验。
