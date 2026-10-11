import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';

const source = process.env.STATUS_SERVER_SOURCE || fileURLToPath(new URL('../deploy/status/server.mjs', import.meta.url));
const ids = ['home', 'signin', 'version', 'app-shell', 'shell-state', 'community', 'apk', 'scanner'];
const clockStart = Date.parse('2026-10-06T02:00:00Z');
const samples = (ts, failure = null) => ids.map(probe => ({
  ts: new Date(ts).toISOString(), probe, http: probe === failure ? 0 : probe === 'scanner' ? 404 : 200,
  rc: probe === failure ? 28 : 0, dns: 0.001, conn: 0.18, tls: 0.38, ttfb: 0.8, total: 0.9,
  err: probe === failure ? 'fixture timeout' : '',
}));
const event = (level, started = clockStart) => ({ id: `${level}-${started}`, title: `${level} fixture`, level,
  started: new Date(started).toISOString(), resolved: null, summary: 'local fixture', updates: [] });

async function start(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zc-status-test-'));
  const log = path.join(dir, 'probe.jsonl'), incidents = path.join(dir, 'incidents.json'), clock = path.join(dir, 'clock.txt');
  const initial = options.clock ? clockStart : Date.now();
  const rows = options.rows || samples(initial - (options.ageMs || 0), options.failure);
  fs.writeFileSync(log, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(incidents, options.incidentText ?? JSON.stringify(options.incidents || []));
  fs.writeFileSync(clock, String(initial));
  const preloader = path.join(dir, 'clock.mjs');
  // Test-only clock injection. Normal cases execute the unmodified source with real time.
  fs.writeFileSync(preloader, `import fs from 'node:fs';const Original=Date;globalThis.Date=class extends Original{constructor(...a){a.length?super(...a):super(Number(fs.readFileSync(process.env.REVIEW_CLOCK,'utf8')))}static now(){return Number(fs.readFileSync(process.env.REVIEW_CLOCK,'utf8'))}};`);
  if (options.missingLog) fs.unlinkSync(log);
  const reserve = http.createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const env = { ...process.env, PORT: String(port), ZC_MON_LOG: log, ZC_INCIDENTS: incidents, REVIEW_CLOCK: clock };
  // Default runs must exercise the production default bind, never an inherited override.
  delete env.STATUS_HOST;
  if (options.host) env.STATUS_HOST = options.host;
  const child = spawn(process.execPath, [...(options.clock ? ['--import', pathToFileURL(preloader).href] : []), source], {
    env,
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    // Only this test-owned os.tmpdir subtree; no workspace or production paths.
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('zc-status-test-'));
    fs.rmSync(dir, { recursive: true });
  });
  let stderr = '', stdout = '';
  child.stderr.on('data', d => { stderr += d; });
  child.stdout.on('data', d => { stdout += d; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`status startup timeout: ${stderr}`)), 5000);
    child.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`status server exit ${code}: ${stderr}`)); });
  });
  const base = `http://${options.host || '127.0.0.1'}:${port}`;
  return { log, incidents, base, port, stdout: () => stdout, advance: ms => fs.writeFileSync(clock, String(initial + ms)),
    json: async () => (await fetch(`${base}/api/status.json`)).json(), html: async () => (await fetch(base)).text() };
}

test('status: fresh expected responses are up with explicit observed coverage', async t => {
  const server = await start(t); const data = await server.json();
  assert.equal(data.overall, 'up'); assert.equal(data.probes.length, 8);
  assert.equal(data.probes.every(p => p.status === 'up'), true);
  assert.equal(data.staleAfterMin, 10);
  assert.equal(data.probes[0].observedSlots24h, 1); assert.equal(data.probes[0].expectedSamples24h, 288);
});
test('status: stopped producer cannot show green after 20 minutes', async t => {
  const server = await start(t, { ageMs: 20 * 60_000 }); const data = await server.json();
  assert.equal(data.overall, 'unknown'); assert.equal(data.probes.every(p => p.status === 'unknown' && p.stale), true);
  assert.match(await server.html(), /最近采样已达 10 分钟/);
});
test('status: freshness expires at exactly 10 minutes even inside the 30-second cache', async t => {
  const server = await start(t, { clock: true, ageMs: 600_000 - 1 });
  assert.equal((await server.json()).overall, 'up'); server.advance(1);
  assert.equal((await server.json()).overall, 'unknown');
});
test('status: degraded incident cannot mask a down probe', async t => {
  const server = await start(t, { failure: 'home', incidents: [event('degraded')] }); const data = await server.json();
  assert.equal(data.probes[0].status, 'down'); assert.equal(data.overall, 'down');
});
test('status: newer degraded incident cannot mask older unresolved down', async t => {
  const server = await start(t, { incidents: [event('down', clockStart - 3600_000), event('degraded')] }); const data = await server.json();
  assert.equal(data.incidentStatus, 'down'); assert.equal(data.overall, 'down');
});
test('status: resolved down and info announcements do not invent a current outage', async t => {
  const down = { ...event('down'), resolved: new Date(clockStart + 1000).toISOString() };
  const server = await start(t, { incidents: [down, event('info')] });
  assert.equal((await server.json()).overall, 'up');
});
test('status: unreadable incident JSON is unknown rather than silently green', async t => {
  const server = await start(t, { incidentText: '{broken' }); const data = await server.json();
  assert.equal(data.incidentsUnavailable, true); assert.equal(data.overall, 'unknown');
  assert.match(await server.html(), /事件记录异常或无法读取/);
});
test('status: partial invalid event data preserves down and exposes unavailable records', async t => {
  const server = await start(t, { incidents: [event('down'), null] }); const data = await server.json();
  assert.equal(data.incidentsUnavailable, true); assert.equal(data.overall, 'down');
});
test('status: invalid resolution timestamp cannot hide an unresolved down event', async t => {
  const server = await start(t, { incidents: [{ ...event('down'), resolved: 'not-a-date' }] }); const data = await server.json();
  assert.equal(data.incidentsUnavailable, true); assert.equal(data.incidents[0].resolved, null);
  assert.equal(data.incidentStatus, 'down'); assert.equal(data.overall, 'down');
});
test('status: future resolution cannot resolve a current outage', async t => {
  const server = await start(t, { clock: true, incidents: [{ ...event('down'), resolved: new Date(clockStart + 60_000).toISOString() }] });
  const data = await server.json(); assert.equal(data.incidentsUnavailable, true); assert.equal(data.overall, 'down');
});
test('status: unknown incident level cannot be converted to an informational announcement', async t => {
  const server = await start(t, { incidents: [event('unexpected')] }); const data = await server.json();
  assert.equal(data.incidents[0].level, 'unknown'); assert.equal(data.overall, 'unknown');
});
test('status: missing probe log gives unknown with zero observed slots', async t => {
  const server = await start(t, { missingLog: true }); const data = await server.json();
  assert.equal(data.overall, 'unknown'); assert.equal(data.probes[0].coverage24h, 0);
  assert.equal(data.probes[0].uptime24h, null);
});
test('status: future-only timestamps are excluded and cannot create green status', async t => {
  const server = await start(t, { clock: true, rows: samples(clockStart + 60_000) }); const data = await server.json();
  assert.equal(data.overall, 'unknown'); assert.equal(data.probes[0].samples24h, 0);
  assert.equal(data.probes[0].buckets.length, 96);
});
test('status: out-of-order log records use actual newest timestamp', async t => {
  const server = await start(t, { clock: true, rows: [...samples(clockStart, 'home'), ...samples(clockStart - 60_000)] });
  assert.equal((await server.json()).probes[0].status, 'down');
});
test('status: unchanged file mtimes cannot retain green through 25 hours', async t => {
  const server = await start(t, { clock: true }); const before = await server.json(); server.advance(25 * 3600_000);
  const after = await server.json(); assert.notEqual(after.ts, before.ts); assert.equal(after.overall, 'unknown');
  assert.equal(after.probes.every(p => p.status === 'unknown' && p.samples24h === 0), true);
});
test('status: time-based cache refreshes without a producer write', async t => {
  const server = await start(t, { clock: true }); const before = await server.json(); server.advance(31_000);
  const after = await server.json(); assert.notEqual(after.ts, before.ts); assert.equal(after.overall, 'up');
});
test('status: one sample is explicitly 0.35 percent observed coverage, not 24h availability', async t => {
  const server = await start(t); const data = await server.json(); const html = await server.html();
  assert.equal(data.probes[0].uptime24h, 100); assert.equal(data.probes[0].coverage24h, 0.35);
  assert.equal(data.probes[0].buckets.filter(b => b === null).length, 95);
  assert.match(html, /已采样成功率/); assert.match(html, /24h 采样覆盖/); assert.doesNotMatch(html, /24h 可用率/);
});
test('status: duplicate samples cannot inflate observed coverage', async t => {
  const rs = samples(clockStart); const server = await start(t, { clock: true, rows: [...rs, ...rs, ...rs] });
  const home = (await server.json()).probes[0]; assert.equal(home.samples24h, 3); assert.equal(home.observedSlots24h, 1);
  assert.equal(home.coverage24h, 0.35);
});
test('status: missing timing data cannot be classified up', async t => {
  const rs = samples(clockStart); delete rs[0].ttfb;
  const server = await start(t, { clock: true, rows: rs }); assert.equal((await server.json()).probes[0].status, 'down');
});
test('status: service list precedes normal announcements with a persistent legend and timestamp table', async t => {
  const server = await start(t, { incidents: [event('info')] }); const html = await server.html();
  assert.ok(html.indexOf('id="probe-home"') < html.indexOf('<h2 class="sec-title">历史事件与公告'));
  assert.match(html, /aria-label="历史状态图例"/); assert.match(html, /<th scope="col">时间（UTC\+8）/);
  assert.match(html, /title="10-/); assert.match(html, /id="refresh-status"/); assert.doesNotMatch(html, /http-equiv="refresh"/);
});
test('status: active outages appear above service list and user text is escaped', async t => {
  const e = event('down'); e.title = '<script>alert(1)</script>'; e.summary = '<img src=x onerror=alert(2)>';
  const server = await start(t, { incidents: [e] }); const html = await server.html();
  assert.ok(html.indexOf('<h2 class="sec-title">正在处理的事件') < html.indexOf('id="probe-home"'));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/); assert.doesNotMatch(html, /<img src=x/);
});
test('status: malformed HTTP field remains down and raw data is absent from the public projection', async t => {
  const rs = samples(clockStart); rs[0].http = '<img src=x onerror=alert(2)>';
  const server = await start(t, { clock: true, rows: rs }); const html = await server.html();
  const home = (await server.json()).probes[0];
  assert.equal(home.status, 'down'); assert.equal(home.latest.http, null);
  assert.doesNotMatch(html, /<img src=x|onerror=alert/);
});
test('status: cache headers require revalidation and bound age at freshness deadline', async t => {
  const server = await start(t, { clock: true, ageMs: 600_000 - 2000 }); const response = await fetch(server.base);
  assert.match(response.headers.get('cache-control'), /max-age=2, must-revalidate/);
  assert.doesNotMatch(response.headers.get('cache-control'), /stale-while-revalidate/);
});
test('status: unchanged fresh data supports ETag 304 and gzip carries the same JSON', async t => {
  const server = await start(t, { clock: true }); const response = await fetch(`${server.base}/api/status.json`);
  const data = await response.json();
  const conditional = await fetch(`${server.base}/api/status.json`, { headers: { 'if-none-match': response.headers.get('etag') } });
  assert.equal(conditional.status, 304);
  const raw = await new Promise((resolve, reject) => {
    http.get(`${server.base}/api/status.json`, { headers: { 'accept-encoding': 'gzip' } }, res => {
      const chunks = []; res.on('data', d => chunks.push(d)); res.on('end', () => resolve({ encoding: res.headers['content-encoding'], body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
  assert.equal(raw.encoding, 'gzip'); assert.deepEqual(JSON.parse(zlib.gunzipSync(raw.body)), data);
});

for (const [name, fields, expectedStatus, expectedCode, message] of [
  ['request timeout', { rc: 28, http: 0 }, 'down', 'request_timeout', /超时/],
  ['no HTTP response', { rc: 0, http: 0 }, 'down', 'no_response', /未取得 HTTP 响应/],
  ['DNS failure', { rc: 6, http: 0 }, 'down', 'dns_failure', /域名解析/],
  ['connection failure', { rc: 7, http: 0 }, 'down', 'connection_failed', /无法连接/],
  ['TLS connection failure', { rc: 35, http: 0 }, 'down', 'tls_failed', /TLS/],
  ['TLS verification failure', { rc: 60, http: 0 }, 'down', 'tls_verification_failed', /证书校验/],
  ['empty server reply', { rc: 52, http: 0 }, 'down', 'empty_reply', /未返回 HTTP 响应/],
  ['HTTP 500 preserves existing degraded policy', { rc: 0, http: 500 }, 'degraded', 'http_error', /HTTP 500.*HTTP 200/],
  ['unexpected HTTP 302', { rc: 0, http: 302 }, 'degraded', 'unexpected_http', /HTTP 302.*HTTP 200/],
  ['slow first byte', { rc: 0, http: 200, ttfb: 10.001 }, 'degraded', 'slow_response', /10\.001 秒.*10 秒/],
]) {
  test(`status diagnosis: ${name} exposes an observed reason without inventing a root cause`, async t => {
    const rs = samples(clockStart); Object.assign(rs[0], fields);
    const server = await start(t, { clock: true, rows: rs }); const home = (await server.json()).probes[0];
    assert.equal(home.status, expectedStatus); assert.equal(home.reason.code, expectedCode);
    assert.match(home.reason.message, message); assert.equal(home.reason.rootCauseConfirmed, false);
    const html = await server.html(); assert.ok(html.includes(`data-reason-code="${expectedCode}"`));
    assert.match(html, /根因尚未确认/);
  });
}
test('status diagnosis: exactly 10 seconds keeps the unchanged healthy boundary and no current reason', async t => {
  const rs = samples(clockStart); rs[0].ttfb = 10;
  const home = (await (await start(t, { clock: true, rows: rs })).json()).probes[0];
  assert.equal(home.status, 'up'); assert.equal(home.reason, null); assert.equal(home.lastAnomaly, null);
});
test('status diagnosis: expired timeout is unknown now while its observed timeout remains in history', async t => {
  const server = await start(t, { clock: true, ageMs: 600_000, failure: 'home' });
  const home = (await server.json()).probes[0];
  assert.equal(home.status, 'unknown'); assert.equal(home.reason.code, 'sample_stale');
  assert.equal(home.lastAnomaly.reason.code, 'request_timeout'); assert.equal(home.lastAnomaly.recoveredAt, null);
});
test('status diagnosis: missing samples have a different reason from known expired samples', async t => {
  const home = (await (await start(t, { clock: true, missingLog: true })).json()).probes[0];
  assert.equal(home.status, 'unknown'); assert.equal(home.reason.code, 'sample_missing');
  assert.equal(home.lastAnomaly, null); assert.equal(home.bucketDetails.every(b=>b.samples===0), true);
});
test('status diagnosis: recovered HTTP error keeps its timestamp and reason without a current outage', async t => {
  const old = samples(clockStart - 300_000); old[0].http = 500;
  const server = await start(t, { clock: true, rows: [...old, ...samples(clockStart)] });
  const home = (await server.json()).probes[0];
  assert.equal(home.status, 'up'); assert.equal(home.reason, null);
  assert.equal(home.lastAnomaly.at, new Date(clockStart - 300_000).toISOString());
  assert.equal(home.lastAnomaly.reason.code, 'http_error'); assert.equal(home.lastAnomaly.reason.rootCauseConfirmed, false);
  assert.equal(home.lastAnomaly.recoveredAt, new Date(clockStart).toISOString());
  const bucket = home.bucketDetails.find(b=>b.abnormalSamples);
  assert.equal(bucket.abnormalSamples, 1); assert.equal(bucket.issues[0].reason.code, 'http_error');
  const html = await server.html(); assert.match(html, /最近异常/); assert.match(html, /后续采样恢复/);
  assert.match(html, /<th scope="col">探测记录与原因/); assert.match(html, /HTTP 500/);
});
test('status diagnosis: historical issue list is bounded while total abnormal sample count remains exact', async t => {
  const rs = Array.from({ length: 8 }, (_, i) => ({ ...samples(clockStart - (8-i)*1000)[0], http: 500 }));
  const server = await start(t, { clock: true, rows: [...rs, ...samples(clockStart)] });
  const home = (await server.json()).probes[0]; const bucket = home.bucketDetails.find(b=>b.abnormalSamples);
  assert.equal(bucket.abnormalSamples, 8); assert.equal(bucket.issues.length, 3);
  assert.equal(bucket.issues[0].at, new Date(clockStart - 1000).toISOString());
  assert.equal(home.anomalySamples24h, 8); assert.equal(home.lastAnomaly.recoveredAt, new Date(clockStart).toISOString());
});
test('status diagnosis: public JSON and HTML omit raw curl secrets and unexpected log fields', async t => {
  const rs = samples(clockStart, 'home');
  Object.assign(rs[0], { err: 'https://private.invalid/?token=LOCAL_FAKE_SECRET <img src=x onerror=alert(1)>',
    url: 'https://private.invalid/?password=LOCAL_FAKE_SECRET', extraAuthorization: 'Bearer LOCAL_FAKE_SECRET' });
  const server = await start(t, { clock: true, rows: rs }); const data = await server.json(); const home=data.probes[0];
  assert.equal(home.status, 'down'); assert.equal(home.reason.code, 'request_timeout');
  assert.equal(Object.hasOwn(home.latest,'url'), false); assert.equal(Object.hasOwn(home.latest,'extraAuthorization'), false);
  assert.doesNotMatch(JSON.stringify(data), /LOCAL_FAKE_SECRET|private\.invalid|onerror/);
  assert.doesNotMatch(await server.html(), /LOCAL_FAKE_SECRET|private\.invalid|onerror/);
});
test('status diagnosis: later degraded samples cannot remove the cause of a worst down bucket', async t => {
  const rows = [
    { ...samples(clockStart - 5000)[0], http: 0, rc: 28 },
    ...[4000,3000,2000].map(age=>({ ...samples(clockStart-age)[0], http: 500 })),
    ...samples(clockStart),
  ];
  const server = await start(t, { clock: true, rows }); const home=(await server.json()).probes[0];
  const index=home.buckets.findIndex(b=>b===2); const detail=home.bucketDetails[index];
  assert.equal(home.status, 'up'); assert.equal(detail.issues.length, 3);
  assert.equal(detail.issues.every(i=>i.status==='degraded'), true);
  assert.equal(detail.worstIssue.status, 'down'); assert.equal(detail.worstIssue.reason.code, 'request_timeout');
  const html=await server.html(); assert.match(html, /该格最严重异常：/);
  assert.match(html, /探测请求超时，未能确认请求成功/);
});

// --- origin bind: reached only through the same-host cloudflared Tunnel ---
const connectResult = (host, port) => new Promise(resolve => {
  const socket = net.connect(port, host);
  socket.once('connect', () => { socket.destroy(); resolve('connected'); });
  socket.once('error', error => resolve(error.code));
});
test('status bind: default listens on loopback only (another loopback alias is refused)', async t => {
  const server = await start(t, { clock: true });
  assert.equal((await fetch(`${server.base}/api/status.json`)).status, 200);
  // 0.0.0.0 would accept this connection; a 127.0.0.1 bind refuses it on Linux and Windows.
  assert.equal(await connectResult('127.0.0.2', server.port), 'ECONNREFUSED');
  assert.deepEqual(server.stdout().trim().split(/\r?\n/), [`zc-status listening on 127.0.0.1:${server.port}`]);
});
test('status bind: STATUS_HOST explicitly overrides the bind address', async t => {
  const server = await start(t, { clock: true, host: '127.0.0.2' });
  assert.equal((await fetch(`${server.base}/api/status.json`)).status, 200);
  assert.equal(await connectResult('127.0.0.1', server.port), 'ECONNREFUSED');
  assert.deepEqual(server.stdout().trim().split(/\r?\n/), [`zc-status listening on 127.0.0.2:${server.port}`]);
});

// --- coverage: 288 scheduled */5 slots, each matched to a sample within +/-2.5 min ---
const SLOT = 300_000;
// Deterministic jitter in [-30s, +30s]; slot 0 (newest) must not be in the future relative to the clock.
const jitter = k => k === 0 ? 0 : ((k * 7919) % 61 - 30) * 1000;
const jitteredRows = (ks, offset = 0) => ks.flatMap(k => samples(clockStart - k * SLOT + jitter(k) + offset));
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
test('status coverage: 288 samples with +/-30s jitter are 288/288 (100%) coverage', async t => {
  assert.ok(range(1, 287).some(k => jitter(k) === 30_000) && range(1, 287).some(k => jitter(k) === -30_000));
  const server = await start(t, { clock: true, rows: jitteredRows(range(0, 287)) }); server.advance(1000);
  const data = await server.json();
  for (const p of data.probes) {
    assert.equal(p.samples24h, 288); assert.equal(p.observedSlots24h, 288); assert.equal(p.coverage24h, 100);
  }
});
test('status coverage: a real 15-minute hole (3 missed probes) drops coverage by exactly 3 slots', async t => {
  const rows = jitteredRows(range(0, 287).filter(k => k < 100 || k > 102));
  const server = await start(t, { clock: true, rows }); server.advance(1000);
  const home = (await server.json()).probes[0];
  assert.equal(home.samples24h, 285); assert.equal(home.observedSlots24h, 285);
  assert.equal(home.coverage24h, +(100 * 285 / 288).toFixed(2)); assert.equal(home.coverage24h, 98.96);
});
test('status coverage: a single missed probe cannot be masked by extra samples in other slots', async t => {
  // Two extra manual runs 40s after neighbouring cron runs land in already-covered slots.
  const rows = [...jitteredRows(range(0, 287).filter(k => k !== 50)), ...samples(clockStart - 49 * SLOT + 40_000), ...samples(clockStart - 51 * SLOT + 40_000)];
  const server = await start(t, { clock: true, rows }); server.advance(1000);
  const home = (await server.json()).probes[0];
  assert.equal(home.samples24h, 289); assert.equal(home.observedSlots24h, 287); assert.equal(home.coverage24h, 99.65);
});
test('status coverage: window boundary counts the oldest due slot and excludes the slot before it', async t => {
  // now = slot 0 + 1s: window = slots 0..287; slot 288 lies 24h+1s back and is outside.
  const server = await start(t, { clock: true, rows: [...samples(clockStart), ...samples(clockStart - 287 * SLOT), ...samples(clockStart - 288 * SLOT)] });
  server.advance(1000);
  const home = (await server.json()).probes[0];
  assert.equal(home.samples24h, 2); assert.equal(home.observedSlots24h, 2); assert.equal(home.coverage24h, 0.69);
});
test('status coverage: the not-yet-due newest slot is pending, and becomes a gap once its tolerance closes', async t => {
  // Cron for slot 0 has not produced a sample yet; the previous 288 slots are complete.
  const server = await start(t, { clock: true, rows: jitteredRows(range(1, 288)) });
  server.advance(119_000);
  const pending = (await server.json()).probes[0];
  assert.equal(pending.observedSlots24h, 288); assert.equal(pending.coverage24h, 100);
  // Slot 288's sample is older than 24h, so it is outside samples24h but still the oldest due slot.
  assert.equal(pending.samples24h, 287);
  server.advance(151_000); // slot 0's +/-150s tolerance has closed with no sample: a real miss
  const missed = (await server.json()).probes[0];
  assert.equal(missed.observedSlots24h, 287); assert.equal(missed.coverage24h, 99.65);
});
