// 用 CLOUDFLARE_API_TOKEN(需 Zone → Cache Rules → Edit + Zone → Read)为
// status.aetherstudio.top 建边缘缓存规则:Eligible for cache + Edge TTL respect origin
// (源站响应头 Cache-Control: public, max-age=30)。Rulesets API 拒绝 OAuth 认证方案,
// 只能 API Token;token 存 GitHub Secrets,仅 CI 注入,不落本地与自托管机器。
// 幂等:已存在同 host 表达式的规则则跳过,可重复执行。
const tok = process.env.CLOUDFLARE_API_TOKEN;
if (!tok) { console.error('CLOUDFLARE_API_TOKEN is not set'); process.exit(1); }

const ZONE_NAME = 'aetherstudio.top';
const EXPR = '(http.host eq "status.aetherstudio.top")';
const api = 'https://api.cloudflare.com/client/v4';
const j = async (method, url, body) => {
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch { /* non-JSON error body */ }
  return { status: r.status, data };
};

const z = await j('GET', `${api}/zones?name=${ZONE_NAME}`);
const zone = z.data?.result?.[0];
if (!zone) {
  console.error(`zone lookup failed: HTTP ${z.status}`, JSON.stringify(z.data?.errors ?? null));
  process.exit(1);
}
console.log(`zone ${zone.id} ${zone.name} plan=${zone.plan?.name ?? '?'}`);

const rule = {
  action: 'set_cache_settings',
  action_parameters: { cache: true, edge_ttl: { mode: 'respect_origin' } },
  expression: EXPR,
  description: 'zc-status: edge cache per origin max-age (respect origin)',
  enabled: true,
};
// GET 返回的规则带 version/last_updated 等只读字段,PUT 前裁掉
const sanitize = r => ({
  ...(r.id ? { id: r.id } : {}),
  action: r.action,
  action_parameters: r.action_parameters,
  expression: r.expression,
  description: r.description,
  enabled: r.enabled !== false,
});

const phase = 'http_request_cache_settings';
const entry = `${api}/zones/${zone.id}/rulesets/phases/${phase}/entrypoint`;
const get = await j('GET', entry);
if (get.status === 200 && get.data?.success) {
  const rules = (get.data.result.rules ?? []).map(sanitize);
  if (rules.some(r => r.expression === EXPR)) {
    console.log('cache rule already present, nothing to do');
    process.exit(0);
  }
  const put = await j('PUT', entry, { rules: [...rules, rule] });
  if (!put.data?.success) {
    console.error(`PUT failed: HTTP ${put.status}`, JSON.stringify(put.data?.errors ?? put.data ?? null));
    process.exit(1);
  }
  console.log(`cache rule appended, total rules=${put.data.result.rules.length}`);
} else {
  // 404 = 该 phase 还没有 entrypoint ruleset,直接创建
  const post = await j('POST', `${entry}/rulesets`, { rules: [rule] });
  if (!post.data?.success) {
    console.error(`POST failed: HTTP ${post.status}`, JSON.stringify(post.data?.errors ?? post.data ?? null));
    process.exit(1);
  }
  console.log(`cache ruleset created: ${post.data.result?.id}`);
}
