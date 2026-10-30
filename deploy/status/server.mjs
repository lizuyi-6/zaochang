#!/usr/bin/env node
// zc-status: zero-dependency status page for zaochang, fed by /var/log/zc-mon.jsonl
// (written by /opt/zc-mon/probe.sh every 5 min from this Beijing vantage point).
//
// 视觉规范:X:/myui DESIGN-PREFERENCES.md —— 米白暖橙起步、拒绝黑紫模板、
// 强标题+细线编辑排版、主体动效一个(环境极光)+微反馈、respects reduced-motion。
// 配色沿用 pulsar-site token:cream #f7f6f0 / ink #293d31 / orange #ed714e。
// 部署:systemd zc-status.service,127.0.0.1:8080(STATUS_HOST 可覆盖),CF Tunnel → status.aetherstudio.top。
//
// 事件公告:/opt/zc-status/incidents.json(用 zc-incident CLI 维护),
// 公开页只展示名称与职责描述,不暴露探测 URL。
//
// 仓库源:deploy/status/server.mjs。缓存到期必须重新计算数据新鲜度。
// 语义变更(2026-10-06 用户选择):最后采样 >=10min → unknown;总状态取最高严重度。
import http from 'node:http';
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const LOG = process.env.ZC_MON_LOG || '/var/log/zc-mon.jsonl';
const INCIDENTS = process.env.ZC_INCIDENTS || '/opt/zc-status/incidents.json';
const PORT = Number(process.env.PORT || 8080);
// 源站只应经同机 cloudflared(Tunnel ingress → 127.0.0.1:8080 / localhost:8080)访问;默认只绑回环,
// 避免在公网网卡上暴露源站而绕过边缘缓存与 Cloudflare 防护。确需其他地址时显式设置 STATUS_HOST。
const HOST = process.env.STATUS_HOST || '127.0.0.1';
const DAY = 24 * 3600 * 1000;
const BUCKET = 15 * 60 * 1000; // 15 min
const NB = 96;                  // 24h of buckets
const INTERVAL = 5 * 60 * 1000;
const STALE = 10 * 60 * 1000;
const CACHE_MS = 30 * 1000;
const SEVERITY = { up: 0, unknown: 1, degraded: 2, down: 3 };
const highest = states => states.reduce((worst, state) => SEVERITY[state] > SEVERITY[worst] ? state : worst, 'up');

// desc 是对外展示的「这条探针验证什么」,代替 URL。
const PROBES = [
  { id: 'home',        name: '站点首页',     desc: 'Web 首页服务端渲染',            expect: 200 },
  { id: 'signin',      name: '登录页',       desc: '账号登录入口可达',              expect: 200 },
  { id: 'version',     name: '版本信息页',   desc: 'App 版本与更新信息',            expect: 200 },
  { id: 'app-shell',   name: '应用清单接口', desc: '移动端壳配置下发(纯 Worker)',  expect: 200 },
  { id: 'shell-state', name: '站点状态接口', desc: '数据库连通性验证',              expect: 200 },
  { id: 'community',   name: '社区内容接口', desc: '社区帖子与产品聚合查询',        expect: 200 },
  { id: 'apk',         name: '安卓安装包',   desc: '静态资源下载链路(HEAD)',       expect: 200 },
  { id: 'scanner',     name: '上传扫描隧道', desc: '病毒扫描服务连通性',            expect: 404 }, // GET 对 POST-only 端点返回 404 即隧道存活
  { id: 'lattice-model', name: '见界模型',   desc: '见界学习 Agent 的 LLM 推理上游(真实小补全,流式)', expect: 200 },
];

const esc = s => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function tailRead(path, maxBytes = 2_000_000) {
  try {
    const st = fs.statSync(path);
    const fd = fs.openSync(path, 'r');
    const size = Math.min(st.size, maxBytes);
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, st.size - size);
    fs.closeSync(fd);
    return buf.toString('utf8');
  } catch { return ''; }
}

function loadRows() {
  const rows = [];
  for (const line of tailRead(LOG).split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const row = JSON.parse(t);
      if (row && typeof row === 'object') rows.push(row);
    } catch { /* skip partial tail line; stale gate still applies */ }
  }
  return rows;
}

function loadIncidents() {
  try {
    const raw = fs.readFileSync(INCIDENTS, 'utf8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) throw new Error('invalid_incidents');
    let invalidTimestamp = false;
    const items = arr
      .filter(x => x && typeof x === 'object' && x.id && x.title)
      .map(x => {
        const startedMs = Date.parse(x.started);
        const resolvedMs = x.resolved === null || x.resolved === undefined ? null : Date.parse(x.resolved);
        const invalidResolution = resolvedMs !== null && (!Number.isFinite(resolvedMs) || !Number.isFinite(startedMs) || resolvedMs < startedMs || resolvedMs > Date.now());
        const updates = Array.isArray(x.updates) ? x.updates : [];
        if (!Number.isFinite(startedMs) || invalidResolution || updates.some(u => !u || !Number.isFinite(Date.parse(u.ts)))) invalidTimestamp = true;
        return {
        id: String(x.id),
        title: String(x.title).slice(0, 120),
        level: ['info', 'degraded', 'down'].includes(x.level) ? x.level : 'unknown',
        started: String(x.started || ''),
        resolved: resolvedMs !== null && !invalidResolution ? String(x.resolved) : null,
        summary: String(x.summary || '').slice(0, 500),
        updates: updates
          .filter(u => u && Number.isFinite(Date.parse(u.ts)) && u.text)
          .map(u => ({ ts: String(u.ts), text: String(u.text).slice(0, 1000) })),
      }; })
      .sort((a, b) => Date.parse(b.started) - Date.parse(a.started));
    return { items, unavailable: invalidTimestamp || items.length !== arr.length || items.some(i => i.level === 'unknown') };
  } catch { return { items: [], unavailable: true }; }
}

// 0=up 1=degraded 2=down
function classify(r, expect) {
  if (r.rc !== 0 || !Number.isInteger(r.http) || r.http < 100 || r.http > 599 || !Number.isFinite(r.ttfb) || r.ttfb < 0) return 2;
  if (Number(r.http) !== expect || r.ttfb > 10) return 1;
  return 0;
}
const STATUS = ['up', 'degraded', 'down'];

// Explain observed probe outcomes, not an unconfirmed application root cause.
// Keep classify() thresholds/severity unchanged; no business circuit breaker.
function sampleReason(r, expect) {
  const reason = (code, message) => ({ code, message, rootCauseConfirmed: false });
  if (!Number.isInteger(r.rc) || r.rc < 0) return reason('invalid_sample', '探测记录中的结果代码无效，无法确认请求成功。');
  if (r.rc !== 0) {
    const codes = {
      6: ['dns_failure', '探测点域名解析失败。'],
      7: ['connection_failed', '探测点无法连接到服务。'],
      28: ['request_timeout', '探测请求超时，未能确认请求成功。'],
      35: ['tls_failed', '探测点与服务的 TLS 连接建立失败。'],
      52: ['empty_reply', '服务连接未返回 HTTP 响应。'],
      56: ['connection_interrupted', '接收响应时发生错误。'],
      60: ['tls_verification_failed', '探测点未通过服务的 TLS 证书校验。'],
    };
    const known = codes[r.rc];
    return known ? reason(...known) : reason('probe_failed', `探测请求失败，结果代码 ${r.rc}。`);
  }
  if (r.http === 0) return reason('no_response', '探测未取得 HTTP 响应，无法确认服务可达。');
  if (!Number.isInteger(r.http) || r.http < 100 || r.http > 599 || !Number.isFinite(r.ttfb) || r.ttfb < 0)
    return reason('invalid_sample', '探测记录缺少有效 HTTP 状态或响应时间，无法确认请求成功。');
  const slow = r.ttfb > 10 ? `首字节耗时 ${r.ttfb.toFixed(3)} 秒，超过 10 秒阈值。` : '';
  if (r.http !== expect) return reason(r.http >= 500 ? 'http_error' : 'unexpected_http',
    `收到 HTTP ${r.http}${r.http >= 500 ? '（服务端错误）' : ''}，预期 HTTP ${expect}。${slow}`);
  return slow ? reason('slow_response', slow) : null;
}

// Public data is an allowlisted projection. Raw curl errors/extra log fields stay
// in the local log; HTML escaping alone would still disclose URLs or secrets.
function publicSample(r, probe, reason) {
  if (!r) return null;
  const nonnegative = value => Number.isFinite(value) && value >= 0 ? value : null;
  return { ts: new Date(Date.parse(r.ts)).toISOString(), probe,
    http: Number.isInteger(r.http) && r.http >= 0 && r.http <= 599 ? r.http : null,
    dns: nonnegative(r.dns), conn: nonnegative(r.conn), tls: nonnegative(r.tls),
    ttfb: nonnegative(r.ttfb), total: nonnegative(r.total),
    rc: Number.isInteger(r.rc) && r.rc >= 0 ? r.rc : null,
    err: r.rc === 0 ? '' : reason?.message || '探测请求失败。' };
}

// 采样覆盖:探针由 cron */5 在 UTC 整 5 分钟触发(ts 为脚本启动时刻),因此预期时段固定对齐
// epoch 的 5 分钟边界(slot k ↔ k*INTERVAL),每条样本归入最近的计划时段(容差 ±2.5 分钟)。
// 统计最近 288 个"已到期"计划时段中有样本的个数:最新时段若尚无样本且容差窗未关闭,视为待采样
// (窗口整体退一格),容差窗关闭后仍无样本即计为缺失。重复/补跑样本只能填补其所在时段,不能掩盖别处缺口。
// 旧实现按"相对请求时刻 now"分格,探测时刻抖动会使两条样本落入同格、另一格空,把完整采样算成缺口。
const SLOTS = DAY / INTERVAL;
function observedSlotCount(times, now) {
  const covered = new Set();
  for (const t of times) {
    const age = now - t;
    if (Number.isFinite(age) && age >= 0 && age < DAY + 2 * INTERVAL) covered.add(Math.round(t / INTERVAL));
  }
  const nearest = Math.round(now / INTERVAL); // 任何非未来样本的时段号都 <= nearest
  const newest = covered.has(nearest) ? nearest : nearest - 1;
  let observed = 0;
  for (let k = newest - SLOTS + 1; k <= newest; k++) if (covered.has(k)) observed++;
  return observed;
}

function summarize() {
  const rows = loadRows();
  const now = Date.now();
  const incidentSource = loadIncidents();
  const out = { ts: new Date(now).toISOString(), intervalMin: 5, staleAfterMin: 10,
    probes: [], incidents: incidentSource.items, incidentsUnavailable: incidentSource.unavailable };
  for (const p of PROBES) {
    const rs = rows.filter(r => {
      const age = now - Date.parse(r.ts);
      return r.probe === p.id && Number.isFinite(age) && age >= 0 && age < DAY;
    }).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    const latest = rs[rs.length - 1] || null;
    const buckets = new Array(NB).fill(null);
    const bucketDetails = Array.from({ length: NB }, () => ({ samples: 0, abnormalSamples: 0, issues: [], worstIssue: null }));
    let lastAnomaly = null;
    let anomalySamples = 0;
    for (const r of rs) {
      const bi = NB - 1 - Math.floor((now - Date.parse(r.ts)) / BUCKET);
      if (bi < 0) continue;
      const c = classify(r, p.expect);
      buckets[bi] = buckets[bi] === null ? c : Math.max(buckets[bi], c);
      bucketDetails[bi].samples++;
      if (c > 0) {
        const issue = { at: new Date(Date.parse(r.ts)).toISOString(), status: STATUS[c], reason: sampleReason(r, p.expect) };
        anomalySamples++;
        lastAnomaly = { ...issue, recoveredAt: null };
        bucketDetails[bi].abnormalSamples++;
        if (!bucketDetails[bi].worstIssue || SEVERITY[issue.status] >= SEVERITY[bucketDetails[bi].worstIssue.status]) bucketDetails[bi].worstIssue = issue;
        bucketDetails[bi].issues.unshift(issue);
        if (bucketDetails[bi].issues.length > 3) bucketDetails[bi].issues.pop();
      }
    }
    if (lastAnomaly) {
      const recovered = rs.find(r => Date.parse(r.ts) > Date.parse(lastAnomaly.at) && classify(r, p.expect) === 0);
      lastAnomaly.recoveredAt = recovered ? new Date(Date.parse(recovered.ts)).toISOString() : null;
    }
    const ok = rs.filter(r => classify(r, p.expect) === 0).length;
    const ttfbs = rs.map(r => Number(r.ttfb)).filter(x => x > 0).sort((a, b) => a - b);
    const observedSlots = observedSlotCount(rows.filter(r => r.probe === p.id).map(r => Date.parse(r.ts)), now);
    const freshUntil = latest ? Date.parse(latest.ts) + STALE : 0;
    const latestReason = latest ? sampleReason(latest, p.expect) : null;
    const reason = !latest ? { code: 'sample_missing', message: '尚无有效采样，当前状态无法判断。', rootCauseConfirmed: false }
      : now >= freshUntil ? { code: 'sample_stale', message: '最近采样已达 10 分钟，当前状态无法判断。', rootCauseConfirmed: false }
      : latestReason;
    out.probes.push({
      id: p.id, name: p.name, desc: p.desc, expect: p.expect,
      status: latest && now < freshUntil ? STATUS[classify(latest, p.expect)] : 'unknown',
      latest: publicSample(latest, p.id, latestReason),
      reason,
      lastAnomaly,
      anomalySamples24h: anomalySamples,
      freshUntil,
      stale: latest !== null && now >= freshUntil,
      samples24h: rs.length,
      expectedSamples24h: SLOTS,
      observedSlots24h: observedSlots,
      coverage24h: +(100 * observedSlots / SLOTS).toFixed(2),
      uptime24h: rs.length ? +(100 * ok / rs.length).toFixed(2) : null,
      ttfbP50: ttfbs.length ? +ttfbs[Math.floor(ttfbs.length / 2)].toFixed(3) : null,
      buckets,
      bucketDetails,
    });
  }
  out.incidentStatus = highest([
    ...out.incidents.filter(i => !i.resolved && i.level !== 'info').map(i => i.level),
    ...(out.incidentsUnavailable ? ['unknown'] : []),
  ]);
  out.overall = highest([...out.probes.map(p => p.status), out.incidentStatus]);
  return out;
}

const OVERALL_TEXT = { up: '当前探测正常', degraded: '部分服务降级', down: '存在服务故障', unknown: '部分状态未知' };
const STATUS_TEXT = { up: '正常', degraded: '降级', down: '故障', unknown: '状态未知' };
const LEVEL_TEXT = { info: '公告', degraded: '降级', down: '故障', unknown: '未知' };

const bjFull = t => new Date(t).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
const bjHM = ts => { const t = typeof ts === 'number' ? ts : Date.parse(ts); return Number.isNaN(t) ? String(ts) : bjFull(t).slice(5, 16); };

function renderIncidents(incidents, heading = '历史事件与公告') {
  if (!incidents.length) return '';
  const items = incidents.map(i => {
    const open = !i.resolved && i.level !== 'info';
    const updates = i.updates.map(u =>
      `<li><time>${esc(bjHM(u.ts))}</time><p>${esc(u.text)}</p></li>`).join('');
    return `<article class="incident ${open ? 'open' : ''}">
  <div class="inc-head">
    <span class="lv ${i.level}">${LEVEL_TEXT[i.level]}</span>
    <h3>${esc(i.title)}</h3>
    <time>${esc(bjHM(i.started))}</time>
  </div>
  ${i.summary ? `<p class="inc-summary">${esc(i.summary)}</p>` : ''}
  ${updates ? `<ul class="inc-updates">${updates}</ul>` : ''}
  ${i.resolved ? `<p class="inc-resolved">已于 ${esc(bjHM(i.resolved))} 解决</p>` : (open ? '<p class="inc-open">处理中</p>' : '')}
</article>`;
  }).join('\n');
  return `<section class="incidents">
  <h2 class="sec-title">${esc(heading)}</h2>
${items}
</section>`;
}

function renderHtml(s) {
  const stripLabel = `近 24 小时,每格 15 分钟,最新在右 · 数据生成 ${bjHM(s.ts)}`;
  const end = Date.parse(s.ts);
  const bucketStart = end - NB * BUCKET;
  const rows = s.probes.map(p => {
    const periods = p.buckets.map((b, i) => ({
      state: b === null ? '无数据' : STATUS_TEXT[STATUS[b]],
      range: `${bjHM(bucketStart + i * BUCKET)} — ${bjHM(bucketStart + (i + 1) * BUCKET)}`,
      detail: p.bucketDetails[i],
    }));
    const strip = p.buckets.map((b, i) => {
      const cls = b === null ? 'none' : STATUS[b];
      const why = periods[i].detail.worstIssue ? `${bjHM(periods[i].detail.worstIssue.at)} · ${periods[i].detail.worstIssue.reason.message}` : '';
      return `<i class="${cls}" title="${esc(periods[i].range + ' · ' + periods[i].state + (why ? ' · ' + why : ''))}"></i>`;
    }).join('');
    const periodRows = periods.map(v => {
      const worstMissing = v.detail.worstIssue && !v.detail.issues.some(issue => JSON.stringify(issue) === JSON.stringify(v.detail.worstIssue));
      const shown = worstMissing ? [v.detail.worstIssue, ...v.detail.issues] : v.detail.issues;
      const messages = shown.map((issue, i) => `<span class="history-issue">${worstMissing && i === 0 ? '该格最严重异常：' : ''}${esc(bjHM(issue.at))} · ${esc(issue.reason.message)}</span>`).join('');
      const omitted = v.detail.abnormalSamples - shown.length;
      const details = messages ? messages + (omitted > 0 ? `<small>共 ${v.detail.abnormalSamples} 次异常，仅展示最严重记录与最近 3 次。</small>` : '')
        : v.detail.samples ? `${v.detail.samples} 次采样取得预期响应。` : '该时段没有采样。';
      return `<tr><td>${esc(v.range)}</td><td>${v.state}</td><td>${details}</td></tr>`;
    }).reverse().join('');
    const ttfb = p.ttfbP50 != null ? `${(p.ttfbP50 * 1000).toFixed(0)}ms` : '—';
    const up = p.uptime24h != null ? `${p.uptime24h}%` : '—';
    const lastT = p.latest ? bjHM(p.latest.ts) : '—';
    const lastHttp = esc(p.latest ? p.latest.http : '—');
    const aria = `${p.name}:当前${STATUS_TEXT[p.status]}${p.reason ? '，' + p.reason.message : ''},已采样成功率 ${up},采样覆盖率 ${p.coverage24h}%,最近采样 ${lastT}`;
    const currentReason = p.reason ? `<p class="probe-reason${p.status === 'unknown' ? ' stale-note' : ''}" data-reason-code="${p.reason.code}">${esc(p.reason.message)}${p.status !== 'unknown' ? `<small>采样 ${esc(lastT)} · 这是探测现象，根因尚未确认。</small>` : ''}</p>` : '';
    const recent = p.lastAnomaly && p.lastAnomaly.at !== p.latest?.ts ? `<p class="recent-anomaly"><b>最近异常</b> ${esc(bjHM(p.lastAnomaly.at))} · ${esc(p.lastAnomaly.reason.message)}<small>${p.lastAnomaly.recoveredAt ? '后续采样恢复：' + esc(bjHM(p.lastAnomaly.recoveredAt)) + '。' : '尚未观察到后续正常采样。'} 这是历史探测记录，根因尚未确认。</small></p>` : '';

    return `<section class="probe" id="probe-${p.id}" data-status="${p.status}" data-fresh-until="${p.freshUntil}" aria-label="${esc(aria)}">
  <div class="probe-main">
    <div class="probe-heading"><h2>${esc(p.name)}</h2><span class="probe-status ${p.status}">${STATUS_TEXT[p.status]}</span></div>
    <div class="desc">${esc(p.desc)}</div>
    ${currentReason}
    ${recent}
    <div class="strip" role="img" aria-label="${esc(p.name + ' ' + stripLabel)}">${strip}</div>
    <div class="time-axis"><span>${bjHM(bucketStart)}</span><span>12 小时前</span><span>现在</span></div>
    <details class="strip-detail" id="history-${p.id}"><summary>查看时间段详情${p.anomalySamples24h ? ` · ${p.anomalySamples24h} 次异常` : ''}</summary><div class="history-scroll"><table><caption>最近 24 小时 · 每格 15 分钟 · 最新在前；异常为探测现象，根因尚未确认</caption><thead><tr><th scope="col">时间（UTC+8）</th><th scope="col">状态</th><th scope="col">探测记录与原因</th></tr></thead><tbody>${periodRows}</tbody></table></div></details>
  </div>
  <dl class="probe-metrics">
    <div><dt>已采样成功率</dt><dd>${up}</dd></div>
    <div><dt>24h 采样覆盖</dt><dd>${p.coverage24h}%</dd><small>${p.observedSlots24h} / ${p.expectedSamples24h} 个时段</small></div>
    <div><dt>首字节中位</dt><dd>${ttfb}</dd></div>
    <div><dt>最近 HTTP</dt><dd>${lastHttp}</dd></div>
    <div><dt>最近采样</dt><dd>${lastT}</dd></div>
  </dl>
</section>`;
  }).join('\n');

  const liveCls = s.overall === 'down' ? 'bad' : s.overall === 'up' ? '' : 'warn';
  const activeIncidents = s.incidents.filter(i => !i.resolved && i.level !== 'info');
  const historyIncidents = s.incidents.filter(i => i.resolved || i.level === 'info');
  const latestTs = s.probes.map(p => p.latest?.ts).filter(Boolean).sort().at(-1);

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23263d32'/%3E%3Ctext x='32' y='45' font-size='38' text-anchor='middle' fill='%23f7f6f0'%3E%E2%9C%B3%3C/text%3E%3C/svg%3E">
<meta name="description" content="造场 aetherstudio.top 服务状态:可用性、响应速度与事件公告">
<title>造场服务状态</title>
<style>
:root{
  --cream:#f7f6f0; --paper:#fffefb; --ink:#293d31; --deep:#263d32;
  --orange:#ed714e; --amber:#f59e0b; --up:#2e9e6b; --warn:#d99a1f; --down:#d8503f;
  --muted:#778074; --line:#dcded2;
  color-scheme:light;
}
*{box-sizing:border-box;margin:0}
html{-webkit-text-size-adjust:100%}
body{
  background:var(--cream); color:var(--ink);
  font:15px/1.7 -apple-system,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
}
/* 主体动效:暖色环境极光,缓慢漂移;reduced-motion 下静止 */
.aurora{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none}
.aurora i{position:absolute;border-radius:50%;filter:blur(90px);opacity:.5;will-change:transform}
.aurora i:nth-child(1){width:46vw;height:46vw;min-width:340px;min-height:340px;left:-12vw;top:-18vw;background:radial-gradient(circle,#ffd9c4,transparent 65%);animation:drift1 36s ease-in-out infinite alternate}
.aurora i:nth-child(2){width:38vw;height:38vw;min-width:280px;min-height:280px;right:-10vw;top:6vh;background:radial-gradient(circle,#fdeec2,transparent 65%);animation:drift2 44s ease-in-out infinite alternate}
.aurora i:nth-child(3){width:30vw;height:30vw;min-width:220px;min-height:220px;left:24vw;bottom:-16vw;background:radial-gradient(circle,#d8ecd8,transparent 65%);animation:drift1 52s ease-in-out infinite alternate-reverse}
@keyframes drift1{from{transform:translate(0,0) scale(1)}to{transform:translate(6vw,4vh) scale(1.12)}}
@keyframes drift2{from{transform:translate(0,0) scale(1.05)}to{transform:translate(-5vw,7vh) scale(.94)}}
@media (prefers-reduced-motion:reduce){
  .aurora i{animation:none}
  .live{animation:none !important}
  .probe{transition:none}
}

.wrap{max-width:880px;margin:0 auto;padding:0 20px}

/* 顶栏:粗字标 + 细线分隔(pulsar Brand 构成:几何符号/粗字/小角标) */
header.top{display:flex;justify-content:space-between;align-items:center;padding:22px 0 18px;border-bottom:1px solid var(--line)}
.brand{display:inline-flex;align-items:center;gap:9px;font-size:23px;font-weight:800;letter-spacing:-.5px;line-height:1;color:var(--ink)}
.brand-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:var(--deep);color:var(--cream);font-size:20px;line-height:1}
.brand small{font-size:10px;font-weight:600;letter-spacing:.14em;color:var(--muted);align-self:flex-start;margin-top:3px}
.live{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:var(--muted)}
.live i{width:8px;height:8px;border-radius:50%;background:var(--up);animation:pulse 2.4s ease-out infinite}
.live.warn i{background:var(--warn)} .live.bad i{background:var(--down)}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(46,158,107,.45)}70%{box-shadow:0 0 0 9px rgba(46,158,107,0)}100%{box-shadow:0 0 0 0 rgba(46,158,107,0)}}

/* 首屏主角:大标题状态声明 */
.hero{padding:32px 0 24px}
.eyebrow{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;letter-spacing:.22em;color:var(--muted);text-transform:uppercase}
.eyebrow::before{content:'';width:5px;height:5px;background:var(--orange);border-radius:1px}
h1{font-size:clamp(34px,6vw,52px);font-weight:800;letter-spacing:-1.5px;line-height:1.12;margin-top:14px}
h1 .accent{color:var(--orange)}
.hero-sub{margin-top:14px;color:var(--muted);font-size:14px;max-width:56ch}
.hero-figs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin-top:20px;border-top:1px solid var(--line)}
.hero-figs>div{padding:16px 18px 4px;border-right:1px solid var(--line)}
.hero-figs>div:first-child{padding-left:0}
.hero-figs>div:last-child{border-right:0}
.hero-figs b{display:block;font-size:22px;font-weight:800;letter-spacing:-.8px}
.hero-figs span{font-size:11px;letter-spacing:.12em;color:var(--muted)}
.hero-figs b.good{color:var(--up)}

/* 事件与公告 */
.sec-title{font-size:13px;font-weight:700;letter-spacing:.18em;color:var(--muted);padding-top:26px;border-top:1px solid var(--line)}
.incident{padding:18px 0 20px;border-bottom:1px solid var(--line)}
.incident.open{background:linear-gradient(90deg,#fdf3ec00,#fdf3ec 12%,#fdf3ec 88%,#fdf3ec00);margin:0 -12px;padding-left:12px;padding-right:12px}
.inc-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.inc-head h3{font-size:16px;font-weight:700;letter-spacing:-.2px}
.inc-head time{margin-left:auto;font-size:12px;color:var(--muted)}
.lv{font-size:11px;font-weight:700;padding:2px 9px;border-radius:99px;flex:none}
.lv.info{background:#e3ecdf;color:var(--deep)}
.lv.degraded{background:#f9ecc9;color:#8a6210}
.lv.down{background:#fadcd6;color:#a03427}
.inc-summary{margin-top:6px;font-size:13px;color:var(--muted);white-space:pre-line}
.inc-updates{list-style:none;margin-top:10px}
.inc-updates li{display:flex;gap:12px;padding:5px 0;font-size:13px;border-left:1px solid var(--line);padding-left:14px;position:relative}
.inc-updates li::before{content:'';position:absolute;left:-3px;top:12px;width:5px;height:5px;border-radius:50%;background:var(--orange)}
.inc-updates time{flex:none;color:var(--muted);font-size:11px;padding-top:2px;font-variant-numeric:tabular-nums}
.inc-updates p{white-space:pre-line}
.inc-resolved{margin-top:8px;font-size:12px;font-weight:700;color:var(--up)}
.inc-open{margin-top:8px;font-size:12px;font-weight:700;color:var(--warn)}

/* 探针行:编辑排版,行式而非等宽卡 */
.probe{display:grid;grid-template-columns:1fr 300px;gap:24px;padding:24px 0 26px;border-top:1px solid var(--line);transition:background .2s}
.probe:hover{background:#fdf9ef40}
.probe h2{font-size:17px;font-weight:700;letter-spacing:-.2px;display:inline}
.probe .desc{color:var(--muted);font-size:12px;margin:3px 0 14px}
.strip{display:flex;gap:2px;height:30px}
.strip i{flex:1;min-width:0;border-radius:2px;background:#e7e4d8}
.strip i.up{background:var(--up)}
.strip i.degraded{background:var(--warn)}
.strip i.down{background:var(--down)}
.strip-detail{margin-top:8px;font-size:11px;color:var(--muted)}
.strip-detail summary{cursor:pointer;outline-offset:2px}
.strip-detail summary:hover{color:var(--ink)}
.probe-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}
.probe-status{font-size:12px;font-weight:700;white-space:nowrap}
.probe-status.up{color:var(--up)} .probe-status.degraded{color:#8a6210}
.probe-status.down{color:var(--down)} .probe-status.unknown{color:#7d641a}
.time-axis{display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:5px;gap:8px}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--muted);padding:12px 0}
.legend span{display:flex;align-items:center;gap:5px}
.legend i{width:8px;height:8px;border-radius:2px;background:#e7e4d8}
.legend .up{background:var(--up)} .legend .degraded{background:var(--warn)} .legend .down{background:var(--down)}
.history-scroll{max-height:240px;overflow:auto;margin-top:8px}
.history-scroll table{width:100%;border-collapse:collapse;font-size:11px;text-align:left}
.history-scroll caption{text-align:left;padding:5px 0;color:var(--muted)}
.history-scroll td,.history-scroll th{padding:5px 4px;border-bottom:1px solid var(--line)}
.history-scroll td:nth-child(2),.history-scroll th:nth-child(2){white-space:nowrap}
.stale-note,.source-note{font-size:12px;color:#7d641a;margin-top:8px}
.probe-reason{font-size:13px;color:#8a6210;margin:6px 0 12px;overflow-wrap:anywhere}
.probe[data-status="down"] .probe-reason{color:#a03427}
.probe-reason small,.recent-anomaly small{display:block;font-size:11px;color:var(--muted);margin-top:3px}
.recent-anomaly{font-size:12px;margin:6px 0 14px;overflow-wrap:anywhere}
.recent-anomaly b{font-weight:700;margin-right:5px}
.history-issue{display:block;overflow-wrap:anywhere}
.history-scroll td:last-child{min-width:140px}
.refresh-line{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px;font-size:12px;color:var(--muted)}
.refresh-button{font:inherit;color:var(--ink);background:transparent;border:1px solid var(--line);padding:6px 12px;border-radius:5px;cursor:pointer;min-height:36px}
.refresh-button:focus-visible,summary:focus-visible,a:focus-visible{outline:2px solid var(--orange);outline-offset:3px}
.refresh-button[aria-disabled="true"]{opacity:.6;cursor:wait}
.probe-metrics small{display:block;font-size:10px;color:var(--muted)}

.probe-metrics{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;align-content:start;font-size:12px}
.probe-metrics>div{border-left:1px solid var(--line);padding-left:12px}
.probe-metrics dt{color:var(--muted);font-size:10px;letter-spacing:.14em}
.probe-metrics dd{font-weight:700;font-size:14px;margin-top:2px;display:flex;align-items:center;gap:7px}
.dot{width:7px;height:7px;border-radius:50%;flex:none}
.dot.up{background:var(--up)} .dot.degraded{background:var(--warn)}
.dot.down{background:var(--down)} .dot.unknown{background:#b9bcab}

footer{border-top:1px solid var(--line);margin-top:10px;padding:26px 0 40px;color:var(--muted);font-size:12px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
footer a{color:var(--muted)}
footer a:hover{color:var(--orange)}

@media (max-width:640px){
  .probe{grid-template-columns:1fr;gap:14px}
  .probe-metrics{grid-template-columns:repeat(3,1fr)}
  .hero{padding:26px 0 20px}
  h1{font-size:32px}
  .hero-figs>div{padding-left:10px;padding-right:10px}
  .hero-figs span{font-size:10px;letter-spacing:.04em}
  .incident.open{margin:0}
}
@media (max-width:420px){
  .probe-metrics{grid-template-columns:1fr 1fr}
}
</style></head><body>
<div class="aurora" aria-hidden="true"><i></i><i></i><i></i></div>
<div class="wrap" data-incident-status="${s.incidentStatus}" data-generated="${s.ts}">
<header class="top">
  <span class="brand"><span class="brand-mark">✳</span>造场<small>STATUS</small></span>
  <span class="live ${liveCls}"><i></i><span id="header-status">${OVERALL_TEXT[s.overall]}</span></span>
</header>

<main>
<div class="hero">
  <p class="eyebrow">Zaochang Service Status</p>
  <h1><span id="overall-status">${OVERALL_TEXT[s.overall]}</span><span class="accent">.</span></h1>
  <p class="hero-sub">站点、数据库接口、安装包、扫描隧道与见界模型推理上游的可达性。每 5 分钟采样，满 10 分钟未更新会标记为未知。</p>
  <div class="hero-figs">
    <div><b class="good" id="up-count">${s.probes.filter(p => p.status === 'up').length}/${s.probes.length}</b><span>当前探测正常</span></div>
    <div><b>${latestTs ? bjHM(latestTs).slice(-5) : '—'}</b><span>最近采样 · UTC+8</span></div>
    <div><b>5 min</b><span>采样间隔</span></div>
  </div>
  <div class="refresh-line"><button class="refresh-button" id="refresh-status" type="button">刷新状态</button><span id="refresh-note" role="status">每 60 秒自动更新</span></div>
</div>

${s.incidentsUnavailable ? '<p class="source-note">部分事件记录异常或无法读取，公告状态无法完整判断。</p>' : ''}
${renderIncidents(activeIncidents, '正在处理的事件')}

<h2 class="sec-title">服务状态 · 最近 24 小时</h2>
<div class="legend" aria-label="历史状态图例"><span><i class="up"></i>正常</span><span><i class="degraded"></i>降级</span><span><i class="down"></i>故障</span><span><i></i>无数据</span></div>
${rows}
${renderIncidents(historyIncidents)}
</main>

<footer>
  <span>北京探测点 · 每格 15 分钟。成功率仅按收到的样本计算，请结合采样覆盖率阅读。网页可能保守提前最多 30 秒提示未知。</span>
  <span><a href="/api/status.json">JSON API</a> · <a href="https://aetherstudio.top">aetherstudio.top</a></span>
</footer>
</div>
<script>(${statusClient.toString()})();</script>
</body></html>`;
}

// Client rechecks sample age even if refresh requests fail; details/focus survive updates.
function statusClient() {
  const severity = { up: 0, unknown: 1, degraded: 2, down: 3 };
  const labels = { up: '当前探测正常', unknown: '部分状态未知', degraded: '部分服务降级', down: '存在服务故障' };
  let busy = false;
  let serverBase = 0, clockBase = 0;
  function resetClock() {
    // Generated HTML may be cached for up to 30s. Include that upper bound so a
    // slow/changed device wall clock cannot extend a green sample's lifetime.
    serverBase = Date.parse(document.querySelector('.wrap').dataset.generated) + 30000;
    clockBase = performance.now();
  }
  function checkFreshness() {
    const wrap = document.querySelector('.wrap');
    const probes = [...document.querySelectorAll('.probe')];
    let worst = wrap.dataset.incidentStatus;
    let up = 0;
    const now = serverBase + performance.now() - clockBase;
    for (const probe of probes) {
      if (now >= Number(probe.dataset.freshUntil)) {
        probe.dataset.status = 'unknown';
        const status = probe.querySelector('.probe-status');
        status.className = 'probe-status unknown';
        status.textContent = '状态未知';
        probe.setAttribute('aria-label', probe.querySelector('h2').textContent + '：状态未知，采样已过期或缺失');
        let note = probe.querySelector('.probe-reason');
        if (!note) { note = document.createElement('p'); note.className = 'probe-reason stale-note'; probe.querySelector('.probe-main').append(note); }
        note.className = 'probe-reason stale-note';
        note.dataset.reasonCode = Number(probe.dataset.freshUntil) > 0 ? 'sample_stale' : 'sample_missing';
        note.textContent = note.dataset.reasonCode === 'sample_stale'
          ? '数据新鲜度无法确认，按 10 分钟阈值保守核对，当前状态无法判断（网页可能提前最多 30 秒提示）。'
          : '尚无有效采样，当前状态无法判断。';
      }
      const state = probe.dataset.status;
      if (state === 'up') up++;
      if (severity[state] > severity[worst]) worst = state;
    }
    document.getElementById('overall-status').textContent = labels[worst];
    document.getElementById('header-status').textContent = labels[worst];
    document.querySelector('.live').className = 'live ' + (worst === 'down' ? 'bad' : worst === 'up' ? '' : 'warn');
    const count = document.getElementById('up-count');
    count.textContent = up + '/' + probes.length;
    count.className = up ? 'good' : '';
  }
  async function refresh() {
    if (busy) return;
    busy = true;
    // Native disabled blurs a focused button; keep focus while busy blocks repeats.
    document.getElementById('refresh-status').setAttribute('aria-disabled', 'true');
    document.getElementById('refresh-note').textContent = '正在更新…';
    try {
      const response = await fetch('/', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('refresh_failed');
      const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
      const replacement = parsed.querySelector('.wrap');
      if (!replacement?.dataset.generated) throw new Error('invalid_status_page');
      const open = [...document.querySelectorAll('details[open]')].map(el => el.id);
      const focused = document.activeElement;
      const focusId = focused.id || focused.closest('details')?.id;
      const isSummary = focused.tagName === 'SUMMARY';
      const scroll = { top: window.scrollY, left: window.scrollX };
      document.querySelector('.wrap').replaceWith(replacement);
      resetClock();
      for (const id of open) { const detail = document.getElementById(id); if (detail) detail.open = true; }
      const focusTarget = focusId ? document.getElementById(focusId) : null;
      (isSummary ? focusTarget?.querySelector('summary') : focusTarget)?.focus({ preventScroll: true });
      window.scrollTo(scroll);
      document.getElementById('refresh-note').textContent = '刚刚更新 · 每 60 秒自动更新';
    } catch {
      document.getElementById('refresh-note').textContent = '刷新失败，显示上次数据；可重试';
    } finally {
      busy = false;
      document.getElementById('refresh-status').setAttribute('aria-disabled', 'false');
      checkFreshness();
    }
  }
  document.addEventListener('click', event => { if (event.target.closest('#refresh-status')) refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkFreshness(); });
  resetClock();
  checkFreshness();
  setInterval(checkFreshness, 5000);
  setInterval(refresh, 60000);
}

// mtime + bounded expiry; the sample-age boundary can invalidate before 30s.
const mtime = p => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
const rendered = { mLog: -1, mInc: -1, expiresAt: 0, html: '', json: '', etagH: '', etagJ: '', gzH: null, gzJ: null };
function buildRendered() {
  const mLog = mtime(LOG), mInc = mtime(INCIDENTS);
  const now = Date.now();
  if (now < rendered.expiresAt && rendered.html && rendered.mLog === mLog && rendered.mInc === mInc) return;
  const s = summarize();
  rendered.json = JSON.stringify(s);
  rendered.html = renderHtml(s);
  const tag = b => 'W/"' + crypto.createHash('sha1').update(b).digest('hex').slice(0, 16) + '"';
  rendered.etagH = tag(rendered.html);
  rendered.etagJ = tag(rendered.json);
  rendered.gzH = zlib.gzipSync(rendered.html, { level: 6 });
  rendered.gzJ = zlib.gzipSync(rendered.json, { level: 6 });
  rendered.mLog = mLog; rendered.mInc = mInc;
  rendered.expiresAt = Math.min(now + CACHE_MS, ...s.probes.filter(p => p.freshUntil > now).map(p => p.freshUntil));
}

// Never permit serving stale status for five extra minutes. Respect the next expiry.
const cacheControl = () => `public, max-age=${Math.max(0, Math.floor((rendered.expiresAt - Date.now()) / 1000))}, must-revalidate, no-transform`;

http.createServer((req, res) => {
  const u = (req.url || '/').split('?')[0];
  if (u === '/' || u === '/api/status.json') {
    buildRendered();
    const cacheHeader = cacheControl();
    const isHtml = u === '/';
    const etag = isHtml ? rendered.etagH : rendered.etagJ;
    if (String(req.headers['if-none-match'] || '').includes(etag)) {
      res.writeHead(304, { etag, 'cache-control': cacheHeader });
      res.end();
      return;
    }
    const body = isHtml ? rendered.html : rendered.json;
    const headers = {
      'content-type': isHtml ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
      'cache-control': cacheHeader,
      etag,
      vary: 'Accept-Encoding',
    };
    if (/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
      const gz = isHtml ? rendered.gzH : rendered.gzJ;
      headers['content-encoding'] = 'gzip';
      headers['content-length'] = gz.length;
      res.writeHead(200, headers);
      res.end(gz);
    } else {
      headers['content-length'] = Buffer.byteLength(body);
      res.writeHead(200, headers);
      res.end(body);
    }
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
}).listen(PORT, HOST, () => console.log(`zc-status listening on ${HOST}:${PORT}`));
