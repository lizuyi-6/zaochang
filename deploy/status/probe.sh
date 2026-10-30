#!/usr/bin/env bash
# zc-mon: production reachability probe (CN vantage). Appends one JSONL line per endpoint.
# 仓库源:deploy/status/probe.sh,部署到北京盒子 /opt/zc-mon/probe.sh(/etc/cron.d/zc-mon,*/5 root)。
set -u
LOG=/var/log/zc-mon.jsonl
ts=$(date -u +%FT%TZ)
# 见界模型上游密钥(/opt/zc-mon/stepfun.env,root 600)。缺文件或缺 key 时跳过该探针:
# 状态页对无样本显式 unknown(fail-closed),不伪造绿色。
STEPFUN_BASE_URL=${STEPFUN_BASE_URL:-https://api.stepfun.com/step_plan/v1}
STEPFUN_MODEL=${STEPFUN_MODEL:-step-5-preview}
. /opt/zc-mon/stepfun.env 2>/dev/null || true
probe() {
  local name="$1" url="$2" method="GET" line rc err http dns conn tls ttfb total
  if [ $# -ge 3 ]; then method="$3"; shift 3; else shift 2; fi
  local args=(-sS -o /dev/null --max-time 20
    -w '%{http_code} %{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer} %{time_total}')
  [ "$method" = HEAD ] && args+=(-I)
  [ $# -gt 0 ] && args+=("$@")
  line=$(curl "${args[@]}" "$url" 2>/tmp/zc-mon-err) && rc=0 || rc=$?
  err=""
  if [ "$rc" -ne 0 ]; then
    err=$(tr '\n' ' ' </tmp/zc-mon-err | tr -d '"\\' | head -c 180)
    line="000 0 0 0 0 0"
  fi
  read -r http dns conn tls ttfb total <<<"$line"
  printf '{"ts":"%s","probe":"%s","http":%s,"dns":%s,"conn":%s,"tls":%s,"ttfb":%s,"total":%s,"rc":%d,"err":"%s"}\n' \
    "$ts" "$name" "$http" "$dns" "$conn" "$tls" "$ttfb" "$total" "$rc" "$err" >> "$LOG"
}

# APK 探测目标从应用清单动态解析(发新版路径随版本变化),解析失败回退到当前版本路径
apk_url=$(curl -sS --max-time 10 https://aetherstudio.top/api/app-shell 2>/dev/null \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(JSON.parse(d).android.downloadUrl)}catch{}})')
[ -z "$apk_url" ] && apk_url="https://aetherstudio.top/downloads/zaochang-1.2.2.apk"

probe home        "https://aetherstudio.top/"
probe signin      "https://aetherstudio.top/signin"
probe version     "https://aetherstudio.top/app/version"
probe app-shell   "https://aetherstudio.top/api/app-shell"
probe shell-state "https://aetherstudio.top/api/shell-state"
probe community   "https://aetherstudio.top/api/community"
probe apk         "$apk_url" HEAD
probe scanner     "https://scanner.aetherstudio.top/scan"

# 见界模型:真实小补全探针(Anthropic Messages 流式,tokens 上限 64)。
# TTFB 反映上游受理延迟;生成耗时只落在 total,不会把健康慢响应顶进 10s 降级阈值。
# key 失效→401(降级),模型下线→404(降级),服务不可达→rc!=0(故障)。
[ -n "${STEPFUN_API_KEY:-}" ] && probe lattice-model "$STEPFUN_BASE_URL/messages" POST \
  -H "Authorization: Bearer $STEPFUN_API_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"model":"'"$STEPFUN_MODEL"'","messages":[{"role":"user","content":"ping"}],"max_tokens":64,"stream":true}'
