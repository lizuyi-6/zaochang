# 静态托管(StepFun Page)契约 v1

本文件是 Worker、数据库、盒子上的部署器三方共用的**唯一接口约定**。三方并行开发,任何一方想改本文件,必须在交付报告里单列"契约变更"。共享规则(上限/扩展名/密钥模式)见 `app/api/_lib/hosting-rules.json`。

## 0. 目标与边界
- 用户项目是**纯静态**站点(zip),托管在 StepFun Page(`<slug>.page.stepcloud.com`),造场不运行用户代码。
- 项目的 `products.demo_url` 对托管项目**保持为空**,现有外链守卫(`product_review_external_demo_guard`、`moderation.ts` 的 `external_demo_requires_immutable_package`)**一字不改**。托管链接只存在于 `product_hostings`,并且只经视图 `product_hosted_urls` 对外暴露。
- 部署器是唯一持有 StepFun key 的组件(盒子 `/etc/zaochang/hosting.env`);Worker 不持有、不调用 StepFun。

## 1. 数据模型(迁移 0032;表/列名为准)
### 1.1 `hosting_grants`(准入名单)
`member_email TEXT PK → members(email)`;`max_sites INTEGER NOT NULL DEFAULT 3 CHECK (1..20)`;`granted_by TEXT NOT NULL → members(email)`;`note TEXT NOT NULL DEFAULT ''`;`created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`;`revoked_at TEXT`。有效授权 ⇔ `revoked_at IS NULL`。

### 1.2 `product_hostings`(一行 = 一次托管部署 = 远端一个站点)
| 列 | 说明 |
|---|---|
| `id INTEGER PK AUTOINCREMENT` | |
| `product_id INTEGER NOT NULL → products(id)` | |
| `owner_email TEXT NOT NULL → members(email)` | 必须等于 `products.owner_email`(触发器) |
| `bundle_key TEXT NOT NULL → uploaded_files(key)` | 已扫描 clean 的 zip,`purpose='hosting_bundle'`,同属主,`private` |
| `bundle_sha256 TEXT NOT NULL` | 64 位小写十六进制,必须等于 uploaded_files.sha256 |
| `bundle_zip_bytes / bundle_file_count / bundle_uncompressed_bytes INTEGER NOT NULL` | 提交时 Worker 校验得出 |
| `review_version INTEGER NOT NULL` | 提交该包时产品的 review_version(提交批里先 +1 再取值);**仅作信息**,不再参与批准/曝光/live 判定 |
| `hosting_revision INTEGER NOT NULL` | 提交该包时 `products.hosting_revision`(提交批里先 +1 再取值);已绑定列、不可变;**批准覆盖的是「当前最新上传的包」,以它而非 review_version 绑定**(与包无关的编辑不应使批准失效) |
| `approved_version INTEGER NOT NULL DEFAULT 0` | 批准时写入(= 决议的 review_version);重审后可大于行内 review_version |
| `state TEXT NOT NULL DEFAULT 'queued'` | `queued,deploying,staged,promoting,live,removing,removed,failed` |
| `desired TEXT NOT NULL DEFAULT 'staged'` | `staged,live,removed`;Worker 侧意图,部署器据 state≠desired 行动 |
| `provider TEXT NOT NULL DEFAULT 'stepfun_page'` | |
| `site_id / version_id TEXT` | StepFun 数值型 ID 的字符串形式(bigint 安全) |
| `preview_url TEXT`、`preview_expires_at TEXT` | 暂存预览(`https://p-<token>.preview.stepcloud.com`),**持有即可访问**,须 7 天过期 |
| `live_url TEXT` | `https://<slug>.page.stepcloud.com` |
| `failure_code TEXT`、`failure_detail TEXT` | 码 ∈ rules.failureCodes;detail ≤200 字符 |
| `lease_token_hash TEXT`、`lease_expires_at TEXT`、`attempts INTEGER NOT NULL DEFAULT 0` | 部署器租约;令牌只存 SHA-256 |
| `created_at / updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP` | |

索引:唯一 `(product_id) WHERE desired <> 'removed'`(一个产品同一时刻至多一个有效托管);`(state, desired)`;`(owner_email)`。

### 1.3 其他列
- `products.hosting_revision INTEGER NOT NULL DEFAULT 0`:提交新包时 +1。它被加入 `product_material_change_requires_review` 的监控列(语义变更:监控列由 11 列变 12 列)→ 换包自动使 `review_version + 1` 并重新隐藏、回到待审。
- `uploaded_files.purpose` CHECK 增加 `'hosting_bundle'`(SQLite 改 CHECK = 重建表,先例 `drizzle/0014_furry_vapor.sql`;重建后必须原样重建全部索引与三个触发器,最新版本见 0010/0014/0026)。新触发器:`media_type='application/zip'` ⇔ `purpose='hosting_bundle'`,且 hosting_bundle 必须 `visibility='private'`。

## 2. 状态机(UPDATE state 由触发器强制,非法跳转 `RAISE(ABORT,'hosting_invalid_transition')`)
```
queued    → deploying | removed(无远端站点时) | failed
deploying → staged | failed
staged    → promoting | removing
promoting → live | staged(提升失败或被移除取代,附 failure_*) | removing
live      → removing
removing  → removed | (停留 removing,记录失败后重试)
failed    → removing | removed(无远端站点时)
removed   终态
```
`desired` 只由 Worker 写:提交=staged;批准决议触发器 → live;下架/驳回/产品被隐藏/用户移除 → removed。

## 3. 不变量(均须有数据库层实现与反例测试)
- **I1 对外曝光**:视图 `product_hosted_urls(product_id, live_url)` 仅当:`state='live'` ∧ `products.status='published' AND review_status='approved' AND approved_version=review_version` ∧ `hosting.approved_version = products.approved_version` ∧ `hosting.hosting_revision = products.hosting_revision` ∧ `live_url` 以 `https://` 开头且主机后缀为 `rules.provider.liveHostSuffix` 时才有行。所有公开页面一律经此视图取托管链接,禁止直接读 `product_hostings.live_url`。
- **I2 批准须绑定已暂存的包**:`BEFORE INSERT ON product_review_decisions WHEN decision='approved'`:若该产品存在 `desired <> 'removed'` 的托管行,则必须有一行 `state IN ('staged','live') AND hosting_revision = products.hosting_revision`(即批准覆盖当前最新上传的包;已 live 的包在编辑后重审也满足,无需重传),否则 `RAISE(ABORT,'hosting_not_staged')`。无托管行的产品行为与现状完全一致。驳回决议:`AFTER INSERT` 把其托管行 `desired` 置 `removed`。
- **I3 live 须有批准**:`UPDATE state→'live'` 的触发器要求 `desired='live'` ∧ 产品当前已批准(同 I1 的产品条件)∧ `hosting.approved_version = products.approved_version` ∧ `hosting.hosting_revision = products.hosting_revision`;否则 `RAISE(ABORT,'hosting_live_requires_approval')`(即使部署器令牌泄露,也无法绕过批准)。
- **I4 提交约束**(`BEFORE INSERT ON product_hostings`):授权有效且未满 `max_sites`(统计 `desired<>'removed'` 的行);`products.owner_email = owner_email`;`products.demo_url` 为空;bundle 行存在、`scan_status='clean'`、`purpose='hosting_bundle'`、同属主、sha 一致。
- **I5 批准时写入**:`AFTER INSERT ON product_review_decisions WHEN decision='approved'` 且存在 staged 或 live 的当前代次行 → `approved_version=NEW.review_version, desired='live'`。
- **I6 外链规则不放宽**:带 `demo_url` 的产品仍不可批准(原守卫不动)。

## 4. 部署器机器 API(Worker 提供,鉴权:`Authorization: Bearer <HOSTING_DEPLOYER_TOKEN>`,常量时间比较,令牌未配置则整组路由 404;worker 入口闸 fail-closed:该令牌只放行下列 4 条路由,其它路径 403 `hosting_worker_scope_forbidden`,且该令牌不得作为任何会员/管理员/agent 身份)
所有响应 `cache-control: no-store`,JSON(bundle 除外)。

1. `GET /api/hosting-worker/health` → `200 {"ok":true}`。
2. `POST /api/hosting-worker/claim` body `{"worker":"<id≤64>"}` → `200 {"job":null}` 或
```json
{"job":{"id":12,"action":"deploy|promote|remove","lease":"<256bit base64url>","leaseExpiresAt":"ISO","productId":5,
 "provider":"stepfun_page","siteName":"zc-p5-h12","previewTtl":"7d",
 "bundleSha256":"…","bundleZipBytes":1234,"bundleFileCount":10,"siteId":null,"versionId":null}}
```
   选取优先级 remove > promote > deploy:remove=`desired='removed'` ∧ state∈(staged,live,failed,removing)(有 site_id);promote=`state='staged' AND desired='live'`;deploy=`state='queued'`。**租约过期的 deploying/promoting 行视为可重领**。原子领取(条件 UPDATE + `meta.changes`),租约 5 分钟,`attempts+1`;`attempts>5` 的行不再领取并置 failed `internal`。`siteId/versionId` 仅 promote/remove 时非空。
3. `GET /api/hosting-worker/jobs/{id}/bundle`(头 `x-hosting-lease: <lease>`)→ `200 application/zip`,头 `x-bundle-sha256`;仅 deploy 作业且租约有效;R2 缺失 → `404 {"error":"bundle_missing"}`。
4. `POST /api/hosting-worker/jobs/{id}/report`(头 `x-hosting-lease`)body 之一(幂等,重复上报同结果 `200 {"ok":true,"replayed":true}`;租约不符 `409 lease_mismatch`;非法跳转 `409 hosting_invalid_transition`):
   - deploy 成功:`{"outcome":"staged","siteId":"…","versionId":"…","previewUrl":"https://p-….preview.stepcloud.com","previewExpiresAt":"ISO"}`
   - promote 成功:`{"outcome":"live","liveUrl":"https://<slug>.page.stepcloud.com"}`(Worker 校验 URL 后缀;I3 在 DB 层再兜一次)
   - remove 成功:`{"outcome":"removed"}`
   - 失败:`{"outcome":"failed","code":"<rules.failureCodes>","detail":"≤200字","retryable":true|false}`;deploy 失败且 retryable=true 且 attempts<5 → 回到可领取;promote 失败 → state 回 `staged` 并记 failure_*;**promote 成功回报 live 但此时 desired≠live(被移除取代)→ Worker 按 `promoting→staged` 处理(failure_code=internal,detail='promote superseded'),返回 `200 {"ok":true,"applied":"staged"}`,随后由 remove 作业删除远端站点**;remove 失败 → 保持 removing 记 failure_* 待重领。`deploying` 租约过期且 `desired='removed'` 的行**不得**重领为 deploy(远端可能已存在):置 `failed`/`ambiguous` 待人工对账。

## 5. StepFun Page CLI 观测形态(2026-10-12 实测,`steppage` 1.0.0;部署器据此实现,测试用假 CLI 复现)
- 鉴权:环境变量 `STEPFUN_API_KEY`。失败:stderr `Error: [unauthenticated] API Key 无效或已失效…`,退出码非 0。
- `steppage --json deploy <zip|dir> --name <≤64> [--site <id>]`(**不加 --go-live**)→ stdout `{"siteId":"298…","versionId":"298…","previewUrl":"https://p-<32hex>.preview.stepcloud.com","headerRuleCount":2}`。含禁止扩展名 → 退出码非 0,stderr `Error: [invalid_argument] type:business, code:503, msg:bundle rejected: 2 file(s) with forbidden extension: "evil.php", "run.sh"`(CLI 对目录另有客户端拦截:`Error: 产物无效（不支持的文件）：evil.php`)。
- `steppage --json preview expiry --site S --version V --expires 7d` → `{"token":"p-…","expiresAt":"<unix ms 字符串>"}`;`preview revoke` → `{"token":"p-…","revoked":true}`(撤销后预览 404);`preview mint` → `{"previewUrl":…,"token":…,"expiresAt":"0","revoked":false}`(**默认永不过期,必须随即设过期**)。
- `steppage --json promote --site S --version V` 的 stdout 形态**未实测**:部署器以退出码判成败,随后用 `get` 校验。
- `steppage --json get --site S` → `{"siteId":"…","name":"…","slug":"warm-cedar-df1c","liveUrl":"https://warm-cedar-df1c.page.stepcloud.com","status":1,"liveVersionId":"…","createdAt":"…","updatedAt":"…","servingMode":""}`(未上线站点 `liveUrl:""`、`liveVersionId:"0"`)。
- `steppage --json versions --site S` → `{"versions":[{"versionId","siteId","label":"v1","status":0,"fileCount":3,"totalBytes":"406","isLive":false,"createdAt","previewToken","previewUrl","expiresAt","revoked":false,"auditStatus":2,"headerRules":[…],"headerRuleCount":2,"configRejected":false}]}`
- `steppage --json list` → `{"sites":[{siteId,name,slug,liveUrl,status,liveVersionId,createdAt,updatedAt,servingMode}…],"total":"2"}`(账号下可能有与造场无关的站点,**部署器只许操作名称以 `zc-p` 开头且 siteId 记录在 product_hostings 里的站点**,绝不 list-delete)。
  **唯一例外(2026-10-12 契约修订,依据 D2 审核)**:失败的首次 deploy 可能在 StepFun 侧留下尚未登记 site_id 的孤儿站点。部署器仅在同时满足 ①站点名与**当前已领取作业的 `siteName` 逐字相等**(且以 `zc-p` 开头)②`list` 中恰好一个同名站点 ③`get` 再次确认 ID 与名称 ④该站点无可信版本(`versions` 为空或文件数/字节数不符)时,才可 `delete --yes` 该站点 ID;任何其它情形(多个同名、名称不符、有可信版本)一律保留并上报 `ambiguous`。绝不按前缀批量清理。
- `steppage --json delete --site S --yes` → `{"siteId":"…","name":"…","deleted":true}`。
- 预览/线上域名解析到阿里云上海 ALB;预览响应带 `cache-control: no-store`;`page.config.json` 的自定义响应头在**预览上未生效**(线上未测,不得依赖)。

## 6. 部署器行为要点(详见部署器任务书)
- 写前日志(WAL,`HOSTING_STATE_DIR`,默认 `/var/lib/zaochang/hosting`):任何远端副作用调用前写 `intent`,调用后写 `result`;重启后对账——有 result 未上报则补报;只有 intent 则 `versions --site`/`list` 比对(site 名 `zc-p<product>-h<hosting>` + 文件数/字节数)后补报或上报 `failed/ambiguous`,**绝不盲目重发 deploy**。promote/remove 幂等(先 `get`)。
- 远端已生效后失败 ≠ 远端未生效:两类各自有明确最终状态(见任务书断言)。
- 部署前本地复核:sha256 == 作业给定值;包结构按 rules(含 `maxEntries`/`maxUncompressedBytes`/`maxCompressionRatio`/路径规则);对 `textScannable` 文件做 `secretPatterns` 扫描,命中 → `failed validation_secret`(不泄露命中内容,只报 pattern id 与文件路径);失败不触达 StepFun。

---
## 7. 增补(2026-10-12,Stage 2 前补充;S/B/D 三个工作包不依赖本节)
### 7.1 `hosting_upload_tokens`(agent 一次性上传令牌,迁移 0032 由 Claude 在合并时补入)
`token_hash TEXT PK`(SHA-256(256 位随机令牌 base64url),明文只返回一次);`member_email TEXT NOT NULL → members(email)`;`product_id INTEGER NOT NULL → products(id)`;`expires_at TEXT NOT NULL`(15 分钟);`used_at TEXT`;`created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`。消费必须原子:`UPDATE … SET used_at=CURRENT_TIMESTAMP WHERE token_hash=? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP` 且 `meta.changes==1`;令牌一经消费即作废(无论后续校验/扫描是否成功,防重放)。每会员未使用的有效令牌 ≤3 个。

### 7.2 机器令牌格式(修订 §4 的未配置语义)
`HOSTING_DEPLOYER_TOKEN` 必须以 `zch_` 开头、总长 ≥48。Worker 入口(`worker/index.ts`,在 `isUserApiKeyBearer` 闸旁、先于公开 origin 解析与任何路由):任何以 `zch_` 开头的 Bearer ——未配置令牌或不匹配 → `401 invalid_hosting_token`(不回落 Cookie);匹配 → 仅放行 §4 的 4 条路由,其余一律 `403 hosting_worker_scope_forbidden`(并排空请求体)。该令牌不构成任何会员/管理员/agent 身份。

### 7.3 成员侧接口(Stage 2 实现)
- `POST /api/hosting/bundles`(会话 Cookie + 同源,multipart:`productId`、`file`)→ 校验(授权/属主/无 demo_url)→ `inspectBundleZip` → 全局/会员限流 → `storeScannedUpload(purpose='hosting_bundle', allowArchive)` → **扫描通过后**在**一个 batch** 里:`UPDATE products SET hosting_revision=hosting_revision+1`、旧有效托管行 `desired='removed'`、`INSERT product_hostings`(review_version 取更新后的产品值)。扫描失败**不得**触碰产品(不 bump、不隐藏已批准产品)。
- `PUT /api/hosting/bundles/{token}`(原始 zip 体,`content-type: application/zip`;**不读取任何 Cookie/Key,仅凭令牌**)→ 原子消费令牌 → 同上流程。IP 限流 20/小时。
- `GET /api/hosting/products/{id}`(属主)→ `{state,desired,reviewVersion,approvedVersion,failureCode,failureDetail,previewUrl,previewExpiresAt,hostedUrl}`(`hostedUrl` 只来自视图 `product_hosted_urls`);`DELETE` 同路径 → `desired='removed'`。
- 管理员:`GET/POST/DELETE /api/admin/hosting-grants`(`requireAdmin`,写入 `adminAuditStatement`);审核队列载荷附 `hosting` 对象;`PATCH /api/admin/moderation` 新增动作 `remove_hosting`;批准遇 `hosting_not_staged` → 409 `{error:"hosting_not_staged"}`。以上**不加入** `AGENT_ADMIN_CAPABILITIES`。
- MCP(P3):`begin_hosting_upload(product_id)` / `get_hosting_status(product_id)` / `remove_hosting(product_id)`;写类调用进 `mcp_write_audit`。
