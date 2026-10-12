# 静态托管部署器运行手册

本文覆盖 Ubuntu 盒子上的 `hosting-deployer` 服务。部署器是持有 StepFun Page API key 的唯一组件；Worker 只提供领取、下载和结果上报 API。

## 目录与权限

| 路径 | 所有者/权限 | 用途 |
| --- | --- | --- |
| `/opt/zaochang/current/deploy/hosting/` | 代码发布目录；具体发布用户与权限待确认 | 部署器代码、共享规则回退副本和校验和文件 |
| `/opt/zaochang/hosting/steppage.mjs` | `root:zaochang`, `0750` | 固定版本的 StepFun Page CLI |
| `/var/lib/zaochang/hosting` | `zaochang:zaochang`, `0700` | WAL、作业临时文件和 CLI `HOME`；WAL 文件为 `0600`，上报未确认时暂存 lease |
| `/etc/zaochang/hosting.env` | `root:zaochang`, `0640` | 部署器环境变量；不得写入文档、工单或日志的值 |

先创建运行目录和 CLI 目录：

```sh
sudo install -d -o zaochang -g zaochang -m 0700 /var/lib/zaochang/hosting
sudo install -d -o zaochang -g zaochang -m 0700 /var/lib/zaochang/hosting/home
sudo install -d -o root -g zaochang -m 0750 /opt/zaochang/hosting
```

`hosting.env` 至少配置以下键名，每项的实际值通过受控的密钥录入方式写入，不要把值贴进终端记录：

- `HOSTING_DEPLOYER_TOKEN`
- `STEPFUN_API_KEY`
- `STEPPAGE_CMD`
- `HOSTING_STATE_DIR`
- `HOSTING_WORKER_ID`
- `HOSTING_API_BASE`
- `HOSTING_POLL_IDLE_MS`
- `HOSTING_RULES_PATH`

`STEPPAGE_CMD` 是 JSON 字符串数组；盒子上配置为 `["/usr/bin/node","/opt/zaochang/hosting/steppage.mjs"]`。`HOSTING_STATE_DIR` 应指向 `/var/lib/zaochang/hosting`。未设置 `HOSTING_API_BASE` 时使用 `https://aetherstudio.top`。`HOSTING_RULES_PATH` 未设置时先找部署器同目录的 `hosting-rules.json`，再回退到仓库的 `app/api/_lib/hosting-rules.json`。

```sh
sudo chown root:zaochang /etc/zaochang/hosting.env
sudo chmod 0640 /etc/zaochang/hosting.env
```

## 安装固定版本的 steppage

使用已审核的 StepFun Page CLI `steppage.mjs` 1.0.0 文件副本。不得通过 `curl | bash` 安装，也不得把 CLI 当作 npm 依赖安装。将审核过的文件先复制到临时路径，再从仓库校验和文件读取期望值并比对；不相同就停止安装并拒绝启用服务：

```sh
install -o root -g zaochang -m 0750 /approved/path/steppage.mjs /opt/zaochang/hosting/steppage.mjs.new
expected="$(cat /opt/zaochang/current/deploy/hosting/STEPPAGE_SHA256)"
actual="$(sha256sum /opt/zaochang/hosting/steppage.mjs.new | cut -d ' ' -f 1)"
test "$actual" = "$expected" || { rm -f /opt/zaochang/hosting/steppage.mjs.new; echo 'steppage checksum mismatch; service remains disabled' >&2; exit 1; }
mv /opt/zaochang/hosting/steppage.mjs.new /opt/zaochang/hosting/steppage.mjs
```

部署器启动时，如果 `STEPPAGE_CMD` 指向 `.mjs` 文件，会再次从 `deploy/hosting/STEPPAGE_SHA256` 读取期望 SHA-256 并核验目标文件。校验失败会以非零状态退出。

## 启动、停止与日志

将 `zaochang-hosting-deployer.service` 安装到 systemd 的 unit 目录后，执行：

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now zaochang-hosting-deployer.service
sudo systemctl status zaochang-hosting-deployer.service
sudo journalctl -u zaochang-hosting-deployer.service -n 100 --no-pager
sudo systemctl stop zaochang-hosting-deployer.service
```

服务以 `zaochang` 用户运行；`SIGTERM` 会等当前作业步骤结束后退出。单次只领取一个作业，空闲轮询默认 10 秒，API/作业错误按 1 秒起步指数退避、最多 60 秒。启动日志只包含规则路径和是否检查了固定版本脚本，不包含凭据。

## 凭据轮换

### Worker 部署器 token

1. 暂停服务：`sudo systemctl stop zaochang-hosting-deployer.service`。
2. 按 Worker 的密钥轮换流程更新 `HOSTING_DEPLOYER_TOKEN`，再通过受控录入方式更新 `/etc/zaochang/hosting.env`；不要在命令参数、终端回显或日志中放入值。
3. 确认文件仍为 `root:zaochang`、`0640`，再启动服务并查看状态与日志。
4. 确认旧 token 已在 Worker 端失效。Worker 端具体轮换入口待确认。

### StepFun API key

1. 从 StepFun 管理端按其密钥轮换流程签发新 key（管理端操作步骤待确认）。
2. 通过受控录入方式替换 `STEPFUN_API_KEY`，不要把 key 放入 `STEPPAGE_CMD`、命令参数、WAL 或日志。
3. 重启服务并查看 `provider_auth` 相关日志；必要时撤销旧 key。

## 回滚

停止 `zaochang-hosting-deployer.service`，再回滚代码与 CLI 文件到上一份经过校验的版本。停服务只会停止新的托管作业，不会撤下已经上线的站点。回滚期间保留 `/var/lib/zaochang/hosting/jobs/*.json` WAL，人工对账后再处理；不要批量删除 StepFun 账号下的站点。

## 故障排查

| 现象 | 检查与处理 |
| --- | --- |
| 启动失败 / `provider_auth` | 检查环境文件权限、StepFun key 是否轮换或失效；不要输出 key 值。确认 `STEPFUN_API_KEY` 仅通过子进程环境传入。 |
| `ambiguous` | WAL 保留站点名、预期文件数/字节数和已知远端 ID。用 StepFun 控制台或只读 `list` / `versions --site` 对账站点名 `zc-p<product>-h<hosting>`、`fileCount`、`totalBytes` 和版本 ID。唯一匹配后由运维按 Worker 状态处理；没有唯一匹配时不要重发 deploy、不要执行批量删除。 |
| `validation_bundle` | 核对上传包的 sha256、ZIP 中央目录、路径、扩展名、条目数和未压缩大小；本地拒绝发生在 StepFun CLI 调用前。 |
| 预览过期设置失败并上报 `ambiguous` | detail 含待人工处理的站点 ID。先核对站点名称确为 `zc-p` 前缀，再人工清理或设置预览过期；部署器只会在 `get` 确认名称前缀后尝试单站点删除。 |
| WAL `result` 尚未上报 | 重启后部署器仅重试 Worker 上报，不重复已记录的 deploy/promote/remove。`lease_mismatch` 会放弃该作业并保留 WAL 的 abandoned 标记。 |

## 与 Worker 契约的映射

| Worker 契约 | 部署器处理 |
| --- | --- |
| `POST /api/hosting-worker/claim`，worker ID | `WorkerApi.claim()`；一个循环最多处理一个作业，空闲按配置等待 |
| `job.action=deploy` 与 bundle SHA/字节数/文件数 | 下载到 `jobs/<id>/bundle.zip`，边下载边计数和 SHA-256，再按共享 rules 校验 ZIP、路径、扩展名、比例、根 `index.html` 和文本密钥模式 |
| `GET /api/hosting-worker/jobs/{id}/bundle` + `x-hosting-lease` | Worker API 客户端同时发送 bearer token 与 lease；响应流直接落盘 |
| `deploy` → `staged` | WAL intent、CLI deploy、WAL result、`preview expiry --expires 7d`，然后上报站点/版本 ID、预览 URL 和 ISO 到期时间；deploy 参数永不包含 `--go-live` 或 `--site` |
| `job.action=promote` | 先 `get` 检查 `zc-p` 前缀；按退出码执行 promote，再 `get` 核对 live 版本和 HTTPS 主机后缀；预览撤销失败只记通用日志 |
| `job.action=remove` | 先 `get` 检查 `zc-p` 前缀，再按 site ID 单站点删除；明确 not found 作为已移除；不执行 list-delete |
| `POST /api/hosting-worker/jobs/{id}/report` | 携带 lease 上报；成功与 `replayed:true` 都记为已报告；网络失败保留 WAL；`lease_mismatch` 标记放弃且不回滚远端 |
| `failure_code` 与 `retryable` | 本地包拒绝使用 `validation_bundle` / `validation_secret`；CLI 错误映射到 `provider_auth`、`provider_quota`、`provider_audit_rejected`、`provider_error`；deploy 通用错误可能发生在远端创建之后，按 fail-closed 报 `ambiguous` 并保留站点名/文件数/字节数对账信息 |

## 待确认项

- 盒子上 systemd unit 目录与发布用户/发布流程待确认。
- Worker token 轮换入口和 StepFun 管理端 key 轮换步骤待确认。
- `HOSTING_API_BASE` 在生产的最终域名确认前保持默认值。
- `steppage promote` 的 stdout 形态未实测；部署器不解析该 stdout，只以进程退出码判断命令是否成功，再用 `get` 校验 `liveVersionId` 和 live URL。
- 部署器任务书的一般 CLI 错误映射要求 `provider_error, retryable=true`；本实现对 deploy 通用错误保留 WAL `intent` 并进入恢复对账，匹配唯一远端版本时采用真实 ID、设置预览过期并上报 staged；无唯一匹配时上报 `ambiguous, retryable=false`，不重发 deploy。当前轮次（工作包 D）的依据是任务书“远端已生效后失败必须报告真实 ID 或 ambiguous，禁止静默丢失”；该差异已由“deploy may create a remote site before a timeout”场景断言。契约与共享 rules 未改。

## 开发留痕

- 2026-10-11，工作包 D，状态：部分完成。新增部署器、WAL、ZIP 校验、假 Worker/假 CLI 场景、systemd unit 与本手册；契约文件和共享 rules 未改。
- 首次出现的场景产物：`tests/hosting-deployer.test.mjs`，SHA-256 `48B4839B051102112A54B5EAB08C98061936AB1E332B79705FC1A1AC3F399324`；本轮纯 Node 场景命令 `node --experimental-strip-types --test --test-isolation=none tests/hosting-deployer.test.mjs`，Node v24.13.1，退出码 0，`tests=22 / pass=22 / fail=0 / skipped=0 / todo=0`。本机测试 runner/子进程均遇到 `spawn EPERM`，因此该命令中的假 CLI adapter 在 EPERM 时调用共享 fake CLI 核心逻辑；没有证明本机 `execFile` 子进程边界。
- 原始命令 `node --experimental-strip-types --test tests/hosting-deployer.test.mjs` 在加载测试文件前以 `spawn EPERM` 退出，统计 `tests=1 / pass=0 / fail=1 / skipped=0 / todo=0`。
- 工作包 D 当前轮：通用 deploy CLI 错误保留 WAL `intent` 并走恢复对账，不重发 deploy；唯一匹配时采用远端 ID 并设置预览过期，无匹配或 list 不可用时报告 `ambiguous` 并附站点名、文件数和字节数。场景 `deploy may create a remote site before a timeout; recovery adopts it and sets expiry without redeploy` 覆盖唯一匹配；`deploy timeout with unavailable list reports ambiguous reconciliation data and does not retry` 覆盖无法对账时保留远端状态与人工对账信息。
- 未覆盖：真实 StepFun/Worker/生产 API、Ubuntu systemd 启停、Node v22.23.0 目标环境、`promote` stdout 形态、进程级 SIGTERM 投递，以及常驻 RSS 实测。
