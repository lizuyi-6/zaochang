# 造场 Cloudflare Staging 验证报告

- 日期: 2026-08-09
- 分支: `codex/public-beta-invites-scanning`
- Staging URL: `https://zaochang-staging.zaherharris65.workers.dev`
- Worker 版本: `e43a567c-e85e-4c10-94c0-e1c3c15c3998`(Turnstile 部署)
- CF 账号: `65ebf2011c45b578d745221c646434fc`
- 部署配置: `wrangler.staging.jsonc`(根目录;非标准名以防被 @cloudflare/vite-plugin 自动发现)
- 阶段: **Phase 1 staging — DNS 未切换,阿里云生产未改动**

## 资源清单

| 资源 | 名称/ID | 区域 | 状态 |
|---|---|---|---|
| Worker | `zaochang-staging` | — | 已部署,11 secret 已设 |
| D1 | `zaochang-db` / `d250a527-1e1e-4b7f-ac27-266c723581e3` | APAC/SIN | schema+data 已导入并校验 |
| R2 | `zaochang-uploads` | WNAM | 0 对象(生产 blobs 为空) |
| Turnstile | widget `0x4AAAAAAEKsUkDbokWPOZp_`(managed,域名=staging URL) | — | 已建,sitekey+secret 已设为 Worker secret |
| 绑定 | `DB`→D1, `UPLOADS`→R2, `ASSETS`→静态 | — | deploy 输出确认解析 |

## PASS(带证据,已验证)

1. **Worker 部署** — `wrangler deploy --config wrangler.staging.jsonc` EXIT=0,bindings env.DB/env.UPLOADS/env.ASSETS 解析,Worker Startup 17ms。
2. **11 个 secret 全部就位** — `wrangler secret list` 确认名称:PUBLIC_APP_ORIGIN、APP_ENV、GITHUB_OAUTH_CLIENT_ID、GITHUB_OAUTH_CLIENT_SECRET、OIDC_SIGNING_PRIVATE_JWK、ZAOCHANG_ADMIN_EMAILS、ZAOCHANG_FOUNDER_EMAIL、UPLOAD_SCANNER_URL、UPLOAD_SCANNER_TOKEN、TURNSTILE_SITE_KEY、TURNSTILE_SECRET_KEY(值经管道喂入,未回显)。
3. **Web 服务** — `GET /` HTTP 200,`<title>造场 | 创作者的试玩社区</title>`;`GET /galaxy` 200。
4. **ASSETS 绑定** — CSS/JS 200 + immutable 缓存;favicon 200。
5. **D1 绑定 + 真实数据** — `GET /api/community` 返回迁移的 post id=2 "哈喽,哈喽!"、members=1。
6. **D1 uploaded_files 查询路径** — hex-format key 探针 → 404(record-not-found),运行时查询打通。
7. **OIDC 全新密钥** — `GET /api/oauth/jwks` 返回全新 ES256 key(kid fbc5f783)。
8. **OIDC issuer == PUBLIC_APP_ORIGIN** — MATCH ✅。
9. **安全头** — 普通页 `X-Frame-Options: DENY`;`/product-apps/` `SAMEORIGIN`。
10. **GitHub 登录起点** — redirect_uri == PUBLIC_APP_ORIGIN,client_id 正确,provider 已配置。
11. **扫描器存活(阿里云)** — `POST /scan` 无 token → 401;service active+running。
12. **上传 fail-closed 代码路径** — `upload-security.ts:54-101` 每个失败分支→503,无接受分支。
13. **R2 读路径代码** — `app/api/uploads/[key]/route.ts:21-27` DB+R2 metadata 双校验。
14. **Turnstile 机器人防护(账号创建路径)** — 见下专节。

## Turnstile 验证(本轮新增)

- **门语义**:`TURNSTILE_SECRET_KEY` 已设 且 `invitation_code` 存在(账号创建)时,强制 server-side siteverify;fail-closed。无邀请码的普通登录链接不受影响(仅重定向到 GitHub,且账号创建仍由下游邀请码门控)。secret 未设→门关闭(test 环境→集成测试不受影响,75/75 通过)。
- **widget 渲染** — `GET /signin` HTML 含 `<div class="cf-turnstile" data-sitekey="0x4AAAAAAEKsUkDbokWPOZp_">` + api.js 脚本。
- **CSP 限定** — `/signin` 的 `script-src`/`frame-src` 含 `https://challenges.cloudflare.com`;首页对照**不含**(仅 /signin 放宽)。
- **fail-closed 负路径 1** — POST `/api/auth/github/start` 带 invitation_code、**无** `cf-turnstile-response` → HTTP 303,location `…/signin?error=turnstile_invalid&return_to=%2F`。
- **fail-closed 负路径 2** — POST 带 invitation_code + **垃圾** token → 同上 303 `turnstile_invalid`。
- **正向对照** — POST 无 invitation_code → HTTP 200 GitHub 连接页(门正确跳过)。
- **代码** — `app/api/_lib/turnstile.ts`(siteverify:仅 success=true 且 hostname 匹配才放行,fetch 异常→false);门在 `start/route.ts` providerConfig 检查之后、邀请码可用性检查之前。
- **未覆盖(§2.7)**:真实浏览器解挑战→有效 token→放行的正向 live 路径未测(需人在浏览器解挑战);依赖 CF siteverify API 标准行为 + hostname 校验。fail-closed(安全关键不变量)已由两条负路径证明。

## WARN(已配置,受 staging 状态限制未全运行时验证)

1. **R2 `bucket.get()` 运行时未触达** — staging 0 个 clean 对象,服务路径(L23)未 live 执行。绑定平台级解析 + 代码正确。
2. **上传 live 503** — 代码路径已验证;live 已认证上传→503 被 auth 回调阻塞。
3. **Auth 完整往返** — 起点已验证;回调阻塞,直至 GitHub OAuth app 注册 staging callback URL。
4. **完整认证冒烟(RELEASE_RUNBOOK §5 行为层项)** — 全部被 auth 回调阻塞。

## FAIL

无。

## 生产切换(cutover)前置条件 — 均未满足,需显式批准

1. **扫描器 HTTPS 暴露** — `UPLOAD_SCANNER_URL=loopback`,CF 边缘不可达 → 上传正确 503 fail-closed。
2. **GitHub OAuth app 回调 URL** — 须注册目标正式域名 callback。
3. **DNS 切换** — 需用户显式批准(未给予)。

## 性能(操作者位置 → CF 边缘,暖态,n=6)

| 端点 | min | max | 码 |
|---|---|---|---|
| `/` | 1.16s | 1.93s | 6×200 |
| `/api/community` | 0.78s | 0.91s | 6×200 |
| CSS asset | 0.61s | 0.83s | 6×200 |

## 回滚计划

**Staging 是纯增量,生产零改动:**
- Worker/D1/R2/Turnstile widget 均为**新建**资源。
- 阿里云生产(39.96.196.207,`/var/lib/zaochang/state`)未改动;DNS 未改;state 完整。
- 回滚 = 弃用 staging:`npx wrangler delete --config wrangler.staging.jsonc`(或留 idle);Turnstile widget 可经 `wrangler turnstile widget delete 0x4AAAAAAEKsUkDbokWPOZp_ -y` 删除。
- 若 secret 曾进入对话/日志/回显,按 §7 须轮换(本轮值全程走管道未回显)。

## 跟进项(不阻断 staging,阻断 cutover)

1. 在阿里云把 ClamAV 扫描器经 HTTPS 暴露给 CF 边缘,更新 `UPLOAD_SCANNER_URL`。
2. 在 GitHub OAuth app `Ov23livgjlLc01RdgmuN` 添加 staging callback URL。
3. cutover 前完成 §5 全部行为层认证冒烟 + Turnstile 真实浏览器正向验证。
