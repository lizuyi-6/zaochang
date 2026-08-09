# 造场 Cloudflare 运行手册(权威生产部署)

> 本文档是当前**生产部署的唯一权威来源**。自 2026-08-09 起,生产跑在 Cloudflare 上;
> 旧的阿里云直host(`RELEASE_RUNBOOK.md` §8)已被取代(见该节顶部标注)。
>
> **目标**:换模型/换会话/换人手,照此文档即可重建、验证、排障整个部署,不依赖记忆。
> **红线**(继承全局/会话安全规则):任何 secret **绝不**进对话/日志/git;不删
> `/var/lib/zaochang/state`;上传病毒扫描不得禁用、fail-closed 不得改 fail-open;schema 只走迁移。

---

## 0. 架构总览(现状)

```
浏览器
  │  https://aetherstudio.top / www.aetherstudio.top
  ▼
Cloudflare 边缘 (proxied DNS + Workers Route 接管)
  │  Worker "zaochang" (dist/server/index.js, assets=dist/client)
  ├─► D1   zaochang-db            (结构化数据)
  ├─► R2   zaochang-uploads       (上传文件)
  └─► 上传扫描:POST https://scanner.aetherstudio.top/scan
        │  (Authorization: Bearer $UPLOAD_SCANNER_TOKEN, x-content-sha256)
        ▼
      Cloudflare Tunnel (cloudflared, 出站, 绕开 ICP/beaver 入站封锁)
        ▼
      阿里云主机 127.0.0.1:3311  zaochang-upload-scanner.service (ClamAV)
```

- **Web/DB/存储/DNS 全部在 Cloudflare**;阿里云主机**只剩一个职责:跑 ClamAV 扫描后端**。
- 旧 workerd(`zaochang.service` :3001)与盒子 nginx Web 入口(443)**已停用**。
- 登录:GitHub OAuth(回调 `https://aetherstudio.top/api/auth/github/callback`)。
- OIDC issuer = `PUBLIC_APP_ORIGIN` = `https://aetherstudio.top`。

## 1. 资源清单(ID 锚点)

| 资源 | 值 |
|---|---|
| CF 账号 | `65ebf2011c45b578d745221c646434fc` |
| Zone `aetherstudio.top` | `33dfddc3466108b7ab8ea3a52a9a7cdf`(ACTIVE, Free) |
| 权威 NS | `ivan.ns.cloudflare.com` / `zita.ns.cloudflare.com` |
| 生产 Worker | `zaochang` |
| Workers Routes | `aetherstudio.top/*`、`www.aetherstudio.top/*` → `zaochang` |
| D1 | `zaochang-db` / `d250a527-1e1e-4b7f-ac27-266c723581e3` |
| R2 | `zaochang-uploads` |
| 生产 Tunnel | `zaochang-scanner-local` / `ddc84c25-2f91-4f68-81b2-66572cc06eb2`(**本地托管**,盒子) |
| Tunnel DNS | `scanner.aetherstudio.top` CNAME → `ddc84c25-...cfargotunnel.com`(proxied) |
| 阿里云主机 | EIP `39.96.196.207`,eth0 `172.27.78.123`,Ubuntu 26.04 x86_64 |
| SSH | `ssh -i ~/.ssh/zaochang-deploy.pem root@39.96.196.207` |
| GitHub OAuth App | `Ov23livgjlLc01RdgmuN` |
| OIDC kid | `ce24416f-65a6-45b5-8c37-3f40779ba53c`(复用盒子密钥 → token 连续) |
| Turnstile widget | `0x4AAAAAAEKsUkDbokWPOZp_`(staging 有,**生产未启用**) |

### 凭证与权限边界(为什么有的步骤必须在哪做)

| 凭证 | 位置 | 能做什么 | 不能 |
|---|---|---|---|
| 本地 `wrangler` OAuth | `X:\zaochang`(`npx wrangler …`,登录 zaherharris65@gmail.com) | deploy Worker、`secret put/list`、建 Workers Route | **DNS write、Workers Domains、tunnel config**(REST 10000) |
| MCP CF token | Claude MCP | D1 query、R2、Workers script+secret **write**、tunnel/DNS **read** | DNS/routes/domains/tunnel **write**(10000/1001) |
| cloudflared `cert.pem` | 盒子 `/root/.cloudflared/cert.pem` | 建 tunnel、写 tunnel 本地配置、`route dns` | — |
| Tunnel connector token | (已弃用,改 cert.pem 本地 tunnel) | — | — |

> **教训**:CF 的写权限分散。DNS/tunnel 改动要么用盒子 cert.pem,要么人在控制台点。
> apex/www 的 A 记录至今仍指盒子 IP(见 §6 残留),因为本地/MCP 都没有 DNS write。

## 2. 密钥(名称清单,值永不入库/不入对话)

生产 Worker `zaochang` 的 10 个 secret(`npx wrangler secret list --config wrangler.prod.jsonc`):

```
PUBLIC_APP_ORIGIN            APP_ENV
GITHUB_OAUTH_CLIENT_ID       GITHUB_OAUTH_CLIENT_SECRET
OIDC_SIGNING_PRIVATE_JWK     ZAOCHANG_ADMIN_EMAILS
ZAOCHANG_FOUNDER_EMAIL       UPLOAD_SCANNER_URL
UPLOAD_SCANNER_TOKEN         (TURNSTILE_* 仅 staging)
```

- **唯一权威来源** = 盒子 `/etc/zaochang/zaochang.env`(app secrets)+ `/etc/zaochang/scanner.env`(`SCANNER_TOKEN`)。
- **`UPLOAD_SCANNER_TOKEN` 必须 == 盒子的 `SCANNER_TOKEN`**(扫描器 Bearer 鉴权;不等 → 上传 401/503)。
- 管道注入(值不打印):
  ```bash
  # 单个值(盒子 env -> Worker secret)
  ssh -i ~/.ssh/zaochang-deploy.pem root@39.96.196.207 \
    'bash /tmp/extract_token.sh' | npx wrangler secret put UPLOAD_SCANNER_TOKEN --config wrangler.prod.jsonc
  ```
  `/tmp/extract_token.sh` 逻辑(重建见 §5):取 `KEY=`,`tr -d '\r'`,剥一层外层匹配引号。
  **env 文件是混合行尾(2 行 CRLF)且 OIDC 值带单引号包裹 —— 不归一化会导致 OIDC「配置无效」。**

## 3. 重新部署 Worker(代码或绑定变更)

```bash
cd X:/zaochang
npm test                       # 必须 75/75(改 dist 前先跑)
npm run build                  # 产出 dist/server/index.js + dist/client
npx wrangler deploy --config wrangler.prod.jsonc
```

- `wrangler.prod.jsonc`(生产):`name=zaochang`、`routes=[apex/*, www/*]`、D1/R2/ASSETS 绑定。
- `wrangler.staging.jsonc`(预发):`name=zaochang-staging`,无 routes。
- **两个文件名都非标准**,是故意的:防止 `@cloudflare/vite-plugin` 自动发现并把 DB/UPLOADS
  绑定重复合并,导致 `npm test` 报「binding 重名」。**不要改名成 `wrangler.toml/jsonc`。**
- 改 secret 会触发新版本部署(version id 变)。当前版本以 `wrangler deployments list` 为准。

## 4. 上传扫描链路(Tunnel)

盒子侧三件套(全部 `enabled` 自启,`zaochang.service` 已 `disabled`):

```
zaochang-upload-scanner.service  active  enabled   # ClamAV :3311
cloudflared-zaochang.service     active  enabled   # tunnel
zaochang.service                 inactive disabled # 旧 workerd(已退役)
```

**重建 tunnel(若丢)**:
```bash
ssh -i ~/.ssh/zaochang-deploy.pem root@39.96.196.207
cloudflared tunnel login                       # 浏览器授权 -> /root/.cloudflared/cert.pem
cloudflared tunnel create zaochang-scanner-local   # -> <TUNNEL_ID> + 凭证 json
cat > /root/.cloudflared/config.yml <<YML
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: scanner.aetherstudio.top
    service: http://127.0.0.1:3311
    originRequest: { connectTimeout: 10s, noTLSVerify: true }
  - service: http_status:404
YML
cloudflared tunnel route dns --overwrite-dns zaochang-scanner-local scanner.aetherstudio.top
# systemd: ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate --config /root/.cloudflared/config.yml run
```
> cloudflared 的 `originRequest` **不支持注入自定义 header**(没有 `headers` 字段),
> 所以 Bearer token 由 **Worker 侧**(`UPLOAD_SCANNER_TOKEN`)加,不在 tunnel 配。

## 5. 验证清单(改完必跑;一律经 CF 边缘,别信本地直连)

```bash
BOX='ssh -i ~/.ssh/zaochang-deploy.pem root@39.96.196.207'
EDGE=104.21.48.47
# 应用(经边缘)
$BOX "curl -fsS -o /dev/null -w '%{http_code}\n' --resolve aetherstudio.top:443:$EDGE https://aetherstudio.top/api/community"   # 200
# 扫描器:health / 未授权 401 / clean / EICAR infected
$BOX "curl -fsS --resolve scanner.aetherstudio.top:443:$EDGE https://scanner.aetherstudio.top/health"                            # {"status":"ok",...}
$BOX "curl -fsS -o /dev/null -w '%{http_code}\n' -X POST --resolve scanner.aetherstudio.top:443:$EDGE https://scanner.aetherstudio.top/scan"  # 401
```

**端到端上传(需登录浏览器)**:DevTools Console 粘:
```js
(async()=>{const i=document.createElement("input");i.type="file";i.onchange=async()=>{
const fd=new FormData();fd.append("file",i.files[0]);fd.append("visibility","private");fd.append("purpose","general");
const r=await fetch("/api/uploads",{method:"POST",body:fd});console.log("UPLOAD",r.status,await r.text());};i.click();})();
```
干净文件 → `201` `scanStatus:"clean"`。**然后必须交叉核验真的落库**(不能只看 201):
- D1 有该行(`scan_status=clean`)、R2 有该对象、未授权读该对象 → `403`。
- ⚠️ **历史坑**:曾出现「返回 201 但 CF D1/R2 无记录」—— 原因是流量打到了**阿里云盒子的旧应用**
  (apex DNS 仍指盒子 IP + 盒子 443 当时对外)。判据:CF Worker observability 里**没有**对应
  `POST /api/uploads`。已靠关盒子 nginx 443 修复;若复发,先查盒子 `journalctl -u zaochang.service`。

## 6. 排障速查

| 症状 | 查 | 多半原因 |
|---|---|---|
| 上传 503 | `wrangler secret list` 有没有 `UPLOAD_SCANNER_URL/TOKEN`;token 是否==盒子 `SCANNER_TOKEN` | secret 缺失/不等 |
| 上传 503 + tunnel 健康 | 盒子 `systemctl status zaochang-upload-scanner.service`、手动 `clamscan` 计时 | clamscan 慢(~10-13s/次,Worker 超时 112s 够) |
| `scanner.aetherstudio.top` 530 | 盒子 `journalctl -u cloudflared-zaochang.service` 看 Registered | connector 没连上 |
| 浏览器登录 GitHub 报「redirect_uri 无关联」 | 地址栏是 apex 还是 `*.workers.dev` | **在 staging 登录**(回调没注册);或 OAuth app 回调字符串不精确匹配 |
| 本地 `curl aetherstudio.top` 怪(198.18.x.x / schannel 失败) | — | 本机 VPN 拦截,**别信**;一律用盒子 `--resolve` 到边缘 |
| 201 但 D1/R2 无 | 见 §5 历史坑 | 打到盒子旧应用 |

## 7. 回滚

- **Worker 回滚**:`npx wrangler rollback --config wrangler.prod.jsonc`(或 deploy 上一 version)。
- **盒子旧应用**(应急,已 disable):`systemctl enable --now zaochang.service`;要对外还需恢复
  nginx `zaochang-preview`(备份在 `/etc/nginx/sites-available/zaochang-preview.bak-20260809`)+ 把 apex/www DNS 指回 `39.96.196.207`。
- **scanner/tunnel 不动**:回滚 Web 不影响上传扫描。

## 8. 残留 / 待办(不阻断)

1. apex/www 的 **A 记录仍指盒子 IP `39.96.196.207`**(proxied;route 边缘接管故可用)。建议在 CF 控制台改成占位 `192.0.2.1`(proxied),彻底摘掉盒子 IP 暴露。需 DNS write 权限(本地/MCP 都没有 → 控制台)。
2. CF 控制台删未用的旧 dashboard tunnel `e617e40b-2a9a-48f7-8cb4-98c0fc4837da`(先删其 private route 才能删 tunnel)。
3. 盒子那次误传文件 `02207791-....png` 在盒子本地 state(`/var/lib/zaochang/state/v3/r2`),可忽略。
4. **Turnstile 未上生产**(仅影响邀请码兑换路径);staging 已验证。
5. 想彻底退阿里云:需先把扫描器迁到任意小 VPS(装 ClamAV + cloudflared,tunnel 重指),退前**先备份 `/var/lib/zaochang/state`**。

---
*最后更新:2026-08-09 —— 切换至 Cloudflare 生产、上传经 Tunnel 扫描端到端验证通过、旧 workerd 退役。*
