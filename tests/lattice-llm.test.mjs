import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as protocol from '../app/api/_lib/hyperknow/protocol.ts';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../app/api/_lib/hyperknow/llm.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function client(baseUrl, fetch) {
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'fetch', compiled)((spec) => {
    if (spec === './protocol') return protocol;
    if (spec === './config') return { resolveConfigOrThrow: () => ({ baseUrl, apiKey: 'test', model: 'test' }), HyperknowNotConfiguredError: class extends Error {} };
    throw new Error(spec);
  }, mod, mod.exports, fetch);
  return mod.exports;
}
const messages = [{ role: 'user', content: '你好' }];
const frame = (delta, finish_reason = null) => `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
const wire = frame({ reasoning_content: '思考' }) + frame({ content: '你好' }) + frame({}, 'stop') + 'data: [DONE]';
const collect = async (generator) => { const out = []; for await (const chunk of generator) out.push(chunk); return out; };
const expected = [{ type: 'thinking', text: '思考' }, { type: 'text', text: '你好' }];
function response(text) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(Uint8Array.of(byte)); c.close(); } }));
}
test('LLM: explicit Chat Completions endpoint streams UTF-8 across chunks and tail without newline', async () => {
  const api = client('https://test/v1/chat/completions', async (url, init) => {
    assert.equal(url, 'https://test/v1/chat/completions');
    const body = JSON.parse(init.body);
    assert.equal(body.stream, true);
    assert.deepEqual(body.messages, messages);
    assert.equal(body.thinking, undefined);
    return response(wire);
  });
  assert.deepEqual(await collect(api.streamChat(messages)), expected);
});
test('LLM: Messages 404 falls back once to Chat Completions', async () => {
  const urls = [];
  const api = client('https://test/v1', async (url) => { urls.push(url); return urls.length === 1 ? new Response('', { status: 404 }) : response(wire); });
  assert.deepEqual(await collect(api.streamChat(messages)), expected);
  assert.deepEqual(urls, ['https://test/v1/messages', 'https://test/v1/chat/completions']);
});
test('LLM: Messages success preserves its native parser', async () => {
  let calls = 0;
  const api = client('https://test/v1', async () => { calls++; return response('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你好"}}\n'); });
  assert.deepEqual(await collect(api.streamChat(messages)), [{ type: 'text', text: '你好' }]);
  assert.equal(calls, 1);
});
for (const status of [401, 403, 429]) {
  test(`LLM: ${status} does not fall back`, async () => {
    let calls = 0;
    const api = client('https://test/v1', async () => { calls++; return new Response('', { status }); });
    await assert.rejects(collect(api.streamChat(messages)), { code: status === 429 ? 'ai_rate_limited' : 'ai_auth_failed' });
    assert.equal(calls, 1);
  });
}
test('LLM: pre-aborted request never fetches', async () => {
  const c = new AbortController(); c.abort();
  const api = client('https://test/v1', () => assert.fail('unexpected fetch'));
  await assert.rejects(collect(api.streamChat(messages, { signal: c.signal })), { name: 'AbortError' });
});
test('LLM: body failure after Messages output does not replay through another protocol', async () => {
  let calls = 0;
  const api = client('https://test/v1', async () => {
    calls++;
    let pulls = 0;
    return new Response(new ReadableStream({ pull(c) { if (pulls++ === 0) c.enqueue(new TextEncoder().encode('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}\n')); else c.error(new Error('disconnected')); } }));
  });
  await assert.rejects(collect(api.streamChat(messages)), /disconnected/);
  assert.equal(calls, 1);
});
for (const [label, text] of [
  ['missing terminal', frame({ content: 'partial' })],
  ['upstream error', frame({ content: 'partial' }) + 'data: {"error":{"message":"failed"}}\n'],
  ['token limit', frame({ content: 'partial' }, 'length')],
]) {
  test(`LLM: OpenAI ${label} fails rather than reporting completion`, async () => {
    const api = client('https://test/v1/chat/completions', async () => response(text));
    await assert.rejects(collect(api.streamChat(messages)));
  });
}
test('LLM: OpenAI suppresses content after finish_reason but still rejects late errors', async () => {
  const stopped = frame({ content: 'done' }, 'stop');
  const api = client('https://test/v1/chat/completions', async () => response(stopped + frame({ content: 'late' }) + 'data: [DONE]'));
  assert.deepEqual(await collect(api.streamChat(messages)), [{ type: 'text', text: 'done' }]);
  const failed = client('https://test/v1/chat/completions', async () => response(stopped + 'data: {"error":"late failure"}\n'));
  await assert.rejects(collect(failed.streamChat(messages)), /ai_upstream_stream_error/);
});
test('LLM: cancellation interrupts an idle OpenAI stream', async () => {
  const c = new AbortController();
  const api = client('https://test/v1/chat/completions', async () => new Response(new ReadableStream()));
  const pending = collect(api.streamChat(messages, { signal: c.signal }));
  setTimeout(() => c.abort(), 10);
  await assert.rejects(pending, { name: 'AbortError' });
});
