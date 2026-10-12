import assert from "node:assert/strict";
import test from "node:test";
import { WorkerApi, WorkerApiError } from "../deploy/hosting/lib/api.mjs";

// 盒子到 Cloudflare 的链路实测丢包(2026-10-12);部署器 API 客户端只对「网络错误/超时/5xx」做有界重试,
// 4xx 是确定性答复绝不重试(尤其 409 lease_mismatch / 401 令牌错误)。

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function makeApi(script, retry) {
  const calls = [];
  const sleeps = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), method: init?.method, timeoutSignal: init?.signal instanceof AbortSignal });
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    if (step instanceof Error) throw step;
    return step();
  };
  const api = new WorkerApi({ baseUrl: "https://example.test", token: "zch_test_token_value", fetchImpl, retry, sleep: async (ms) => { sleeps.push(ms); } });
  return { api, calls, sleeps };
}

test("claim retries network errors with exponential backoff and then succeeds", async () => {
  const { api, calls, sleeps } = makeApi([
    new TypeError("fetch failed"),
    Object.assign(new Error("timeout"), { name: "TimeoutError" }),
    () => jsonResponse(200, { job: { id: 7 } }),
  ], { tries: 4, baseMs: 1000 });
  const job = await api.claim("w");
  assert.equal(job.id, 7);
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [1000, 2000]);
  assert.ok(calls.every((call) => call.timeoutSignal), "every attempt carries its own timeout signal");
});

test("5xx responses are retried, 4xx responses never are", async () => {
  const flaky = makeApi([() => jsonResponse(503, { error: "x" }), () => jsonResponse(200, { job: null })], { tries: 3, baseMs: 10 });
  assert.equal(await flaky.api.claim("w"), null);
  assert.equal(flaky.calls.length, 2);

  for (const status of [401, 403, 404, 409, 429]) {
    const definite = makeApi([() => jsonResponse(status, { error: "lease_mismatch" })], { tries: 4, baseMs: 10 });
    await assert.rejects(() => definite.api.report(1, "lease", { outcome: "staged" }), (error) => error instanceof WorkerApiError && error.status === status && error.code === "lease_mismatch");
    assert.equal(definite.calls.length, 1, `status ${status} must not be retried`);
    assert.deepEqual(definite.sleeps, []);
  }
});

test("retries are bounded: the last network error or the last 5xx surfaces after `tries` attempts", async () => {
  const dead = makeApi([new TypeError("fetch failed")], { tries: 3, baseMs: 5 });
  await assert.rejects(() => dead.api.claim("w"), /fetch failed/);
  assert.equal(dead.calls.length, 3);
  assert.deepEqual(dead.sleeps, [5, 10]);

  const down = makeApi([() => jsonResponse(502, { error: "bad_gateway" })], { tries: 2, baseMs: 5 });
  await assert.rejects(() => down.api.claim("w"), (error) => error instanceof WorkerApiError && error.status === 502);
  assert.equal(down.calls.length, 2);
});

test("the class default does not retry at all", async () => {
  const { api, calls } = makeApi([new TypeError("fetch failed")], undefined);
  await assert.rejects(() => api.claim("w"), /fetch failed/);
  assert.equal(calls.length, 1);
});

test("report is retried on timeouts and replays are accepted as success", async () => {
  const { api, calls } = makeApi([
    Object.assign(new Error("timeout"), { name: "TimeoutError" }),
    () => jsonResponse(200, { ok: true, replayed: true }),
  ], { tries: 4, baseMs: 1 });
  const result = await api.report(3, "lease", { outcome: "live", liveUrl: "https://a.page.stepcloud.com" });
  assert.deepEqual(result, { ok: true, replayed: true });
  assert.equal(calls.length, 2);
});
