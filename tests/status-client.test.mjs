import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Runs the exact shipped client function in a VM. DOM, requests and timer firing
// are simulated; this is not browser layout / throttling / transport evidence.
const source = process.env.STATUS_SERVER_SOURCE || fileURLToPath(new URL('../deploy/status/server.mjs', import.meta.url));
const text = fs.readFileSync(source, 'utf8');
const begin = text.indexOf('function statusClient()');
const end = text.indexOf('// mtime', begin);
assert.ok(begin >= 0 && end > begin, 'production statusClient entry must be identifiable');
const client = text.slice(begin, end);
const initial = Date.parse('2026-10-06T02:00:00.000Z');
const probeIds = ['home', 'signin', 'version', 'app-shell', 'shell-state', 'community', 'apk', 'scanner'];

function page(options = {}) {
  let elapsed = 0;
  let wallClockOffset = options.wallOffset ?? 0;
  let activeElement;
  let current;
  let nextPage = null;
  let fetchCalls = 0;
  let requestMode = options.requestMode || 'failure';
  let pendingRequest;
  let lastScroll;
  const listeners = new Map(), intervals = new Map();
  const document = {
    hidden: false,
    body: { id: '', tagName: 'BODY', closest: () => null },
    get activeElement() { return activeElement; },
    querySelector(selector) { return selector === '.wrap' ? current.wrap : selector === '.live' ? current.live : null; },
    querySelectorAll(selector) {
      return selector === '.probe' ? current.probes : selector === 'details[open]' ? current.details.filter(detail => detail.open) : [];
    },
    getElementById(id) { return current.elements.get(id); },
    createElement() { return { className: '', textContent: '', dataset: {} }; },
    addEventListener(event, callback) { listeners.set(event, callback); },
  };
  function createState({ generated = initial, sampled = generated, incidentStatus = 'up', states } = {}) {
    const elements = new Map();
    for (const id of ['overall-status', 'header-status', 'up-count', 'refresh-status', 'refresh-note']) {
      const attributes = new Map();
      const element = { id, textContent: '', className: '', tagName: id === 'refresh-status' ? 'BUTTON' : 'SPAN',
        closest: () => null, focus: () => { activeElement = element; },
        setAttribute: (name, value) => attributes.set(name, String(value)), getAttribute: name => attributes.get(name) ?? null };
      let disabled = false;
      Object.defineProperty(element, 'disabled', {
        get: () => disabled,
        set(value) {
          disabled = Boolean(value);
          // Real Chromium blurs a focused native button when it is disabled.
          if (disabled && activeElement === element) activeElement = document.body;
        },
      });
      elements.set(id, element);
    }
    const details = ['home', 'signin'].map(id => {
      const detail = { id: `history-${id}`, open: false, querySelector: selector => selector === 'summary' ? summary : null };
      const summary = { id: '', tagName: 'SUMMARY', closest: selector => selector === 'details' ? detail : null,
        focus: () => { activeElement = summary; } };
      elements.set(detail.id, detail);
      return detail;
    });
    const probes = probeIds.map((id, i) => {
      const state = states?.[i] || 'up';
      const nodes = { '.probe-status': { className: `probe-status ${state}`, textContent: state }, h2: { textContent: `Probe ${id}` } };
      if (state === 'degraded' || state === 'down') nodes['.probe-reason'] = { className: 'probe-reason', textContent: '收到 HTTP 500', dataset: { reasonCode: 'http_error' } };
      nodes['.probe-main'] = { append: note => {
        if (note.className.includes('stale-note')) nodes['.stale-note'] = note;
        if (note.className.includes('probe-reason')) nodes['.probe-reason'] = note;
      } };
      return { dataset: { status: state, freshUntil: sampled === null ? '0' : String(sampled + 600_000) }, querySelector: selector => nodes[selector], setAttribute: () => {} };
    });
    const state = { elements, details, probes, live: { className: 'live ' }, wrap: null };
    state.wrap = { dataset: { generated: new Date(generated).toISOString(), incidentStatus }, replaceWith: () => { current = nextPage; activeElement = document.body; } };
    return state;
  }
  current = createState(options);
  activeElement = document.body;
  class FakeDate extends Date { static now() { return initial + wallClockOffset + elapsed; } }
  const response = () => ({ ok: requestMode !== 'http-error', text: async () => 'simulated replacement DOM' });
  const context = vm.createContext({ document, Date: FakeDate, performance: { now: () => elapsed }, AbortSignal,
    fetch: async () => {
      fetchCalls++;
      if (requestMode === 'failure') throw new Error('simulated network failure');
      if (requestMode === 'deferred') return new Promise(resolve => { pendingRequest = () => resolve(response()); });
      return response();
    },
    DOMParser: class { parseFromString() { return { querySelector: selector => selector === '.wrap' ? nextPage?.wrap : null }; } },
    window: { scrollY: 123, scrollX: 7, scrollTo: position => { lastScroll = position; } },
    setInterval: (callback, interval) => intervals.set(interval, callback),
  });
  vm.runInContext(client + '\nstatusClient();', context);
  const settle = async () => { await new Promise(resolve => setImmediate(resolve)); };
  return {
    state: () => current, active: () => activeElement, scroll: () => lastScroll, requests: () => fetchCalls,
    advance(ms) { elapsed = ms; intervals.get(5000)(); },
    elapseWithoutTimer(ms) { elapsed = ms; },
    wallJump(ms) { wallClockOffset += ms; intervals.get(5000)(); },
    openHistory(id = 'history-home') { const detail = current.elements.get(id); detail.open = true; activeElement = detail.querySelector('summary'); return detail; },
    focusRefresh() { activeElement = current.elements.get('refresh-status'); },
    setReplacement(opts = {}) { nextPage = createState(opts); },
    setMode(mode) { requestMode = mode; },
    async refresh() { listeners.get('click')({ target: { closest: selector => selector === '#refresh-status' ? current.elements.get('refresh-status') : null } }); await settle(); },
    async resolveRequest() { pendingRequest(); await settle(); },
    visibility(hidden) { document.hidden = hidden; listeners.get('visibilitychange')(); },
    async autoRefresh() { intervals.get(60000)(); await settle(); },
  };
}

const overall = harness => harness.state().elements.get('overall-status').textContent;
const unknownAll = harness => harness.state().probes.every(probe => probe.dataset.status === 'unknown');

test('status client VM: a device clock 20 minutes behind expires green within the sample deadline', () => {
  const harness = page({ wallOffset: -20 * 60_000 });
  assert.equal(overall(harness), '当前探测正常');
  harness.advance(600_000);
  assert.equal(overall(harness), '部分状态未知');
  assert.equal(unknownAll(harness), true);
});

test('status client VM: wall-clock jumps backward and forward cannot replace monotonic sample age', () => {
  const harness = page();
  harness.advance(300_000);
  harness.wallJump(-24 * 3600_000);
  assert.equal(overall(harness), '当前探测正常');
  harness.wallJump(48 * 3600_000);
  assert.equal(overall(harness), '当前探测正常');
  harness.advance(600_000);
  assert.equal(overall(harness), '部分状态未知');
  assert.equal(unknownAll(harness), true);
});

test('status client VM: conservative 30-second cache allowance does not extend green beyond 10 minutes', () => {
  const harness = page();
  harness.advance(569_999);
  assert.equal(overall(harness), '当前探测正常');
  harness.advance(570_000);
  assert.equal(overall(harness), '部分状态未知');
  assert.equal(harness.state().elements.get('up-count').textContent, '0/8');
});

test('status client VM: failed refresh keeps content and expires the last green sample', async () => {
  const harness = page();
  const opened = harness.openHistory();
  const oldState = harness.state();
  harness.advance(600_000);
  await harness.refresh();
  assert.equal(harness.state(), oldState);
  assert.equal(opened.open, true);
  assert.equal(unknownAll(harness), true);
  assert.equal(overall(harness), '部分状态未知');
  assert.match(oldState.elements.get('refresh-note').textContent, /刷新失败/);
  assert.equal(oldState.elements.get('refresh-status').disabled, false);
});

test('status client VM: HTTP rejection retains the original page and enables retry', async () => {
  const harness = page({ requestMode: 'http-error' });
  const oldState = harness.state();
  await harness.refresh();
  assert.equal(harness.state(), oldState);
  assert.match(oldState.elements.get('refresh-note').textContent, /刷新失败/);
  assert.equal(oldState.elements.get('refresh-status').disabled, false);
  assert.equal(harness.requests(), 1);
});

test('status client VM: refresh preserves open histories, summary focus and scroll position', async () => {
  const harness = page({ requestMode: 'success' });
  harness.openHistory('history-signin');
  harness.openHistory('history-home');
  const oldState = harness.state();
  harness.setReplacement({ generated: initial + 60_000 });
  harness.advance(60_000);
  await harness.refresh();
  const newState = harness.state();
  assert.notEqual(newState, oldState);
  assert.equal(newState.elements.get('history-home').open, true);
  assert.equal(newState.elements.get('history-signin').open, true);
  assert.equal(harness.active(), newState.elements.get('history-home').querySelector('summary'));
  assert.deepEqual({ ...harness.scroll() }, { top: 123, left: 7 });
  assert.match(newState.elements.get('refresh-note').textContent, /刚刚更新/);
});

test('status client VM: refresh button focus survives page replacement', async () => {
  const harness = page({ requestMode: 'success' });
  harness.focusRefresh();
  harness.setReplacement({ generated: initial + 60_000 });
  await harness.refresh();
  assert.equal(harness.active(), harness.state().elements.get('refresh-status'));
  assert.equal(harness.state().elements.get('refresh-status').disabled, false);
});

test('status client VM: updated sample resets the freshness clock after the old page expired', async () => {
  const harness = page({ requestMode: 'success', wallOffset: -20 * 60_000 });
  harness.advance(600_000);
  assert.equal(unknownAll(harness), true);
  harness.setReplacement({ generated: initial + 600_000 });
  await harness.refresh();
  assert.equal(overall(harness), '当前探测正常');
  assert.equal(harness.state().probes.every(probe => probe.dataset.status === 'up'), true);
  harness.advance(1_200_000);
  assert.equal(unknownAll(harness), true);
});

test('status client VM: an unresolved down incident outranks all stale unknown probes', () => {
  const harness = page({ incidentStatus: 'down' });
  harness.advance(600_000);
  assert.equal(unknownAll(harness), true);
  assert.equal(overall(harness), '存在服务故障');
  assert.equal(harness.state().live.className, 'live bad');
});

test('status client VM: concurrent refresh clicks use a single request and restore the button', async () => {
  const harness = page({ requestMode: 'deferred' });
  harness.focusRefresh();
  harness.setReplacement({ generated: initial + 60_000 });
  await harness.refresh();
  await harness.refresh();
  assert.equal(harness.requests(), 1);
  assert.equal(harness.state().elements.get('refresh-status').getAttribute('aria-disabled'), 'true');
  assert.equal(harness.state().elements.get('refresh-status').disabled, false);
  assert.equal(harness.active(), harness.state().elements.get('refresh-status'));
  await harness.resolveRequest();
  assert.equal(harness.requests(), 1);
  assert.equal(harness.state().elements.get('refresh-status').disabled, false);
  assert.equal(harness.state().elements.get('refresh-status').getAttribute('aria-disabled'), 'false');
});

test('status client VM: the automatic refresh invokes the same update path', async () => {
  const harness = page({ requestMode: 'success' });
  harness.setReplacement({ generated: initial + 60_000 });
  await harness.autoRefresh();
  assert.equal(harness.requests(), 1);
  assert.match(harness.state().elements.get('refresh-note').textContent, /刚刚更新/);
});

test('status client VM: returning to a hidden page rechecks expiry before any network refresh', () => {
  const harness = page({ wallOffset: -20 * 60_000 });
  harness.visibility(true);
  harness.elapseWithoutTimer(600_000);
  harness.visibility(false);
  assert.equal(unknownAll(harness), true);
  assert.equal(overall(harness), '部分状态未知');
  assert.equal(harness.requests(), 0);
});

test('status client VM: natural expiry replaces the current HTTP error reason with sample-stale evidence', () => {
  const harness = page({ states: ['degraded'] }); const probe=harness.state().probes[0];
  assert.equal(probe.querySelector('.probe-reason').dataset.reasonCode, 'http_error');
  harness.advance(600_000);
  assert.equal(probe.dataset.status, 'unknown');
  assert.equal(probe.querySelector('.probe-reason').dataset.reasonCode, 'sample_stale');
  assert.match(probe.querySelector('.probe-reason').textContent, /10 分钟/);
  assert.doesNotMatch(probe.querySelector('.probe-reason').textContent, /HTTP 500/);
});
test('status client VM: an initially missing sample exposes sample-missing rather than an expired sample', () => {
  const harness = page({ sampled: null });
  const probe = harness.state().probes[0];
  assert.equal(probe.dataset.status, 'unknown');
  assert.equal(probe.querySelector('.probe-reason')?.dataset.reasonCode, 'sample_missing');
  assert.match(probe.querySelector('.probe-reason').textContent, /尚无有效采样/);
});
test('status client VM: failed refresh creates a visible reason when a previously healthy sample expires', async () => {
  const harness = page(); const probe=harness.state().probes[0];
  harness.advance(600_000); await harness.refresh();
  assert.equal(probe.querySelector('.probe-reason')?.dataset.reasonCode, 'sample_stale');
  assert.match(probe.querySelector('.probe-reason').textContent, /当前状态无法判断/);
});
test('status client VM: conservative early unknown does not claim the sample is already 10 minutes old', () => {
  const harness=page(); harness.advance(570_000); const probe=harness.state().probes[0];
  assert.equal(probe.dataset.status, 'unknown'); assert.equal(probe.querySelector('.probe-reason').dataset.reasonCode, 'sample_stale');
  assert.doesNotMatch(probe.querySelector('.probe-reason').textContent, /最近采样已达 10 分钟/);
  assert.match(probe.querySelector('.probe-reason').textContent, /保守核对/);
  assert.match(probe.querySelector('.probe-reason').textContent, /提前最多 30 秒/);
});
