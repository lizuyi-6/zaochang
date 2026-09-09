// Run: node --experimental-strip-types --test tests/lattice-backend.test.mjs
// No server, build, or new dependencies; exercise the public client API with real streams.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatLive, translateLive, generateCourseLive, fetchCourseDetail } from '../hyperknow-spa/src/replica/backend.ts';
import { normalizeBackendCourse } from '../hyperknow-spa/src/replica/backend-course.ts';

const error = { ok: false, reason: 'error' };
const chunk = { type: 'content_chunk', chunk: '中文🙂' };
const complete = { type: 'complete' };
const failure = { type: 'error', message: 'Failed to process message' };
const credit = { type: 'credit_status', credit_info: { remaining: 18, max: 20 } };
const course = {
  courseUuid: 'course-1', courseTitle: '课程', courseDescription: '说明', targetLearner: '初学者', tags: ['数学'],
  units: [{ unitId: 'u1', title: '单元', lectures: [{ lectureId: 'l1', title: '讲座', sessions: [
    { sessionId: 's1', sessionIndex: 1, title: '课节', sessionTime: 10, depthTags: ['基础'] },
  ] }] }],
};

function streamResponse(frames, { bytewise = false, broken = false, crlf = false } = {}) {
  const text = frames.map(frame => typeof frame === 'string' ? frame : `event: frame\ndata: ${JSON.stringify(frame)}\n\n`).join('');
  const bytes = new TextEncoder().encode(crlf ? text.replaceAll('\n', '\r\n') : text);
  let index = 0;
  return new Response(new ReadableStream({
    pull(controller) {
      if (index < bytes.length) {
        const end = bytewise ? index + 1 : bytes.length;
        controller.enqueue(bytes.slice(index, end));
        index = end;
      } else if (broken) controller.error(new Error('connection reset'));
      else controller.close();
    },
  }), { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
}

const clients = {
  chat: (handlers, signal) => chatLive('问题', handlers, { conversationId: 'c1', mode: 'fast', signal }),
  translate: (handlers, signal) => translateLive('原文', 'English', handlers, signal),
};

for (const [name, call] of Object.entries(clients)) {
  test(`${name}: server protocol, chunk boundaries, metadata and request API`, async (t) => {
    const controller = new AbortController();
    const seen = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url, `/api/hyperknow/${name}`);
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['content-type'], 'application/json');
      assert.equal(options.signal, controller.signal);
      assert.deepEqual(JSON.parse(options.body), name === 'chat'
        ? { message: '问题', conversation_id: 'c1', mode: 'fast' }
        : { text: '原文', target_language: 'English' });
      return streamResponse([
        ': keepalive\n\ndata: {bad}\ndata: null\ndata: []\ndata: 42\n',
        { type: 'tool_execution', tool_status: 'completed' }, credit,
        { type: 'conversation_created', conversation_id: 'c1' }, chunk,
        { type: 'content_chunk', chunk: '答案' },
        // Valid JSON terminal frame without a final newline.
        `event: frame\ndata: ${JSON.stringify(complete)}`,
      ], { bytewise: true, crlf: true });
    });
    const result = await call({
      onChunk: value => seen.push(['chunk', value]),
      onRemaining: (...values) => seen.push(['credit', ...values]),
      onConversationId: value => seen.push(['id', value]),
    }, controller.signal);
    assert.deepEqual(result, { ok: true, text: '中文🙂答案' });
    assert.deepEqual(seen, [
      ['credit', 18, 20], ...(name === 'chat' ? [['id', 'c1']] : []),
      ['chunk', '中文🙂'], ['chunk', '答案'],
    ]);
  });

  const cases = [
    ['empty stream', []], ['empty completion', [complete]],
    ['error only', [failure]], ['partial then error', [chunk, failure]],
    ['missing complete', [chunk]],
    ['tool completion is not complete', [chunk, { type: 'tool_execution', tool_status: 'completed' }]],
    ['DONE is not complete', [chunk, 'data: [DONE]\n\n']],
    ['error cannot recover', [chunk, failure, complete]],
    ['late error wins', [chunk, complete, failure]],
    ['read failure', [chunk], { broken: true }],
  ];
  for (const [label, frames, options] of cases) {
    test(`${name}: rejects ${label}`, async (t) => {
      t.mock.method(globalThis, 'fetch', async () => streamResponse(frames, options));
      assert.deepEqual(await call({}), error);
    });
  }

  test(`${name}: suppresses chunks after terminal frames`, async (t) => {
    const seen = [];
    t.mock.method(globalThis, 'fetch', async () => streamResponse([chunk, failure, chunk, complete]));
    assert.deepEqual(await call({ onChunk: text => seen.push(text) }), error);
    assert.deepEqual(seen, [chunk.chunk]);
    seen.length = 0;
    t.mock.method(globalThis, 'fetch', async () => streamResponse([chunk, complete, chunk]));
    assert.deepEqual(await call({ onChunk: text => seen.push(text) }), { ok: true, text: chunk.chunk });
    assert.deepEqual(seen, [chunk.chunk]);
  });

  test(`${name}: existing HTTP and transport failure categories`, async (t) => {
    for (const [response, expected] of [
      [() => Response.json({ error: 'insufficient_credits' }, { status: 402 }), 'insufficient'],
      [() => Response.json({ error: 'unauthorized' }, { status: 401 }), 'error'],
      [() => new Response('bad gateway', { status: 502 }), 'error'],
      [() => new Response('<html>static host</html>'), 'error'],
      [() => new Response(null, { headers: { 'content-type': 'text/event-stream' } }), 'error'],
      [() => { throw new TypeError('network down'); }, 'offline'],
    ]) {
      t.mock.method(globalThis, 'fetch', async () => response());
      assert.deepEqual(await call({}), { ok: false, reason: expected });
    }
  });
}

const malformedCourses = [
  null, [], 'course', {}, { ...course, courseTitle: {} },
  { ...course, units: null }, { ...course, units: [] }, { ...course, units: {} },
  { ...course, units: [null] }, { ...course, units: ['unit'] },
  { ...course, units: [{ title: {} }] },
  { ...course, units: [{ title: 'u', lectures: {} }] },
  { ...course, units: [{ title: 'u', lectures: [null] }] },
  { ...course, units: [{ title: 'u', lectures: [{ title: [] }] }] },
  { ...course, units: [{ title: 'u', lectures: [{ title: 'l', sessions: 'bad' }] }] },
  { ...course, units: [{ title: 'u', lectures: [{ title: 'l', sessions: [null] }] }] },
  { ...course, units: [{ title: 'u', lectures: [{ title: 'l', sessions: [{ title: 42 }] }] }] },
];

test('course: both public entrypoints reject malformed nested trees', async (t) => {
  for (const value of malformedCourses) {
    assert.equal(normalizeBackendCourse(value), null);
    t.mock.method(globalThis, 'fetch', async () => streamResponse([{ type: 'course_structure_ready', course: value }]));
    assert.deepEqual(await generateCourseLive('topic', {}), error);
    t.mock.method(globalThis, 'fetch', async () => Response.json({ success: true, data: value }));
    assert.equal(await fetchCourseDetail('id'), null);
  }
});

test('course: valid metadata preserved and ready (not complete) is the generation terminal', async (t) => {
  assert.deepEqual(normalizeBackendCourse(course), course);
  const seen = [];
  const signal = new AbortController().signal;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/hyperknow/course-generation');
    assert.equal(options.signal, signal);
    assert.deepEqual(JSON.parse(options.body), { query: 'topic' });
    return streamResponse([
      credit, { type: 'course_generation_step', step_id: 'boot', status: 'loading' },
      { type: 'course_generation_progress', message: 'research' },
      { type: 'course_structure_ready', course },
    ], { bytewise: true });
  });
  assert.deepEqual(await generateCourseLive('topic', {
    onStep: (...args) => seen.push(args), onProgress: text => seen.push(text),
    onRemaining: (...args) => seen.push(args),
  }, signal), { ok: true, course });
  assert.deepEqual(seen, [[18, 20], ['boot', 'loading'], 'research']);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/hyperknow/courses/a%2Fb');
    assert.equal(options.signal, signal);
    return Response.json({ success: true, data: course });
  });
  assert.deepEqual(await fetchCourseDetail('a/b', signal), course);
});

test('course: optional fields normalize without modifying input', async (t) => {
  const raw = {
    ...course, courseUuid: 123, courseDescription: {}, targetLearner: [], tags: ['valid', null, 2],
    units: [{ title: 'u' }, { title: 'v', lectures: [{ title: 'l', sessions: null }, {
      title: 'm', sessions: [{ title: 's', sessionTime: '10', depthTags: [null, 'tag'], sessionIndex: Infinity }],
    }] }],
  };
  const before = structuredClone(raw);
  const normalized = normalizeBackendCourse(raw);
  assert.deepEqual(raw, before);
  assert.equal(normalized.courseUuid, undefined);
  assert.equal(normalized.courseDescription, undefined);
  assert.equal(normalized.targetLearner, undefined);
  assert.deepEqual(normalized.tags, ['valid']);
  assert.deepEqual(normalized.units[0].lectures, []);
  assert.deepEqual(normalized.units[1].lectures[0].sessions, []);
  const session = normalized.units[1].lectures[1].sessions[0];
  assert.equal(session.sessionTime, undefined);
  assert.equal(session.sessionIndex, undefined);
  assert.deepEqual(session.depthTags, ['tag']);
  t.mock.method(globalThis, 'fetch', async () => streamResponse([{ type: 'course_structure_ready', course: raw }]));
  assert.deepEqual(await generateCourseLive('topic', {}), { ok: true, course: normalized });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ success: true, data: raw }));
  assert.deepEqual(await fetchCourseDetail('id'), normalized);
});

test('course: errors stay terminal and incomplete streams fail', async (t) => {
  const ready = { type: 'course_structure_ready', course };
  const failed = { type: 'course_generation_error', message: 'Course generation failed' };
  for (const frames of [[], [credit], [complete], [ready, failed], [failed, ready]]) {
    t.mock.method(globalThis, 'fetch', async () => streamResponse(frames));
    assert.deepEqual(await generateCourseLive('topic', {}), error);
  }
  for (const body of [null, {}, { success: false, data: course }]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(body));
    assert.equal(await fetchCourseDetail('id'), null);
  }
});
