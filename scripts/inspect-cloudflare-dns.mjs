// Read-only inventory. Capture Wrangler credentials in memory; never print/store them.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'auth', 'token', '--json'], {
  encoding: 'utf8', windowsHide: true, timeout: 30_000,
});
if (result.status !== 0) throw new Error('Wrangler auth lookup failed; credential output suppressed');
let credentials;
try { credentials = JSON.parse(result.stdout); } catch { throw new Error('Wrangler credential format not recognized; output suppressed'); }
if (!credentials.token) throw new Error('Bearer credential unavailable');
const report = { ts: new Date().toISOString(), authType: credentials.type, results: [] };
async function read(label, endpoint) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${endpoint}`, {
    headers: { Authorization: `Bearer ${credentials.token}` }, signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json();
  const entry = { label, http: response.status, success: body.success === true,
    errors: body.errors?.map(e => ({ code: e.code, message: e.message })), result: body.result,
    resultInfo: body.result_info };
  report.results.push(entry);
  console.log(JSON.stringify({ label, http: entry.http, success: entry.success,
    errors: entry.errors, count: Array.isArray(entry.result) ? entry.result.length : undefined }));
  return entry;
}
const zoneLookup = await read('zone', '/zones?name=aetherstudio.top');
const zone = zoneLookup.result?.find(z => z.name === 'aetherstudio.top');
if (zone) {
  await read('dns_records', `/zones/${zone.id}/dns_records?per_page=100`);
  await read('worker_routes', `/zones/${zone.id}/workers/routes`);
  await read('worker_custom_domains', `/accounts/${zone.account.id}/workers/domains`);
}
const output = path.join(root, 'output/status-fix-2026-10-06');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'cloudflare-inventory.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`inventory=${path.join(output, 'cloudflare-inventory.json')}`);
if (report.results.some(r => !r.success)) process.exitCode = 2;
