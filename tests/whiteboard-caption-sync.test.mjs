import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const spa = new URL('../hyperknow-spa/', import.meta.url);
const spaRequire = createRequire(new URL('package.json', spa));
const ts = spaRequire('typescript');

const moduleCache = new Map();
function resolveSpec(fromUrl, spec) {
  if (spec.endsWith('.css')) return new URL(spec, fromUrl);
  const base = new URL(spec, fromUrl);
  for (const candidate of [
    base.href,
    `${base.href}.ts`,
    `${base.href}.tsx`,
    `${base.href}.json`,
    `${base.href}/index.ts`,
    `${base.href}/index.tsx`,
  ]) {
    try {
      const path = fileURLToPath(candidate);
      if (existsSync(path) && !statSync(path).isDirectory()) return new URL(candidate);
    } catch {}
  }
  throw new Error(`cannot resolve ${spec} from ${fromUrl.pathname}`);
}

function loadTsModule(url) {
  if (moduleCache.has(url.href)) return moduleCache.get(url.href);
  if (url.href.endsWith('.css')) return {};
  if (url.href.endsWith('.json')) {
    const parsed = JSON.parse(readFileSync(url, 'utf8'));
    moduleCache.set(url.href, parsed);
    return parsed;
  }
  const source = readFileSync(url, 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: fileURLToPath(url),
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  });
  const fakeModule = { exports: {} };
  moduleCache.set(url.href, fakeModule.exports);
  const localRequire = (spec) => {
    if (spec.endsWith('.css')) return {};
    if (!spec.startsWith('.')) return spaRequire(spec);
    return loadTsModule(resolveSpec(url, spec));
  };
  new Function('require', 'module', 'exports', compiled.outputText)(localRequire, fakeModule, fakeModule.exports);
  return fakeModule.exports;
}

const whiteboardModule = loadTsModule(new URL('src/replica/whiteboard/WhiteboardPage.tsx', spa));
const { runCaptionSync, narrateMs, STARTUP_TIMEOUT_MS, STALL_MS } = whiteboardModule;
const actionsModule = loadTsModule(new URL('src/replica/actions.ts', spa));
const { tts } = actionsModule;

test('Regression 1: delayed start >2.5 sec keeps captions strictly at zero until playing', async () => {
  const plain = '这是一段用来测试起声延迟超过2.5秒的字幕内容';
  const total = plain.length;
  const updates = [];
  let stopped = false;
  let simulatedTimeMs = 0;
  const tickMs = 50;

  let resolveStarted;
  let resolveEnded;
  const started = new Promise((res) => { resolveStarted = res; });
  const ended = new Promise((res) => { resolveEnded = res; });

  let isPlaying = false;
  const handle = {
    started,
    ended,
    getProgress: () => {
      if (!isPlaying) return null;
      const curSec = Math.max(0, (simulatedTimeMs - 3000) / 1000);
      return { currentTime: curSec, duration: 4.0, ratio: curSec / 4.0 };
    },
  };

  const syncPromise = runCaptionSync({
    total,
    plain,
    speed: 1,
    handle,
    wait: async (ms) => {
      simulatedTimeMs += ms;
      // 音频在 3000ms 时才起声(远大于 2500ms 宽限期)
      if (simulatedTimeMs >= 3000 && !isPlaying) {
        isPlaying = true;
        resolveStarted('started');
      }
      if (simulatedTimeMs >= 4500) {
        resolveEnded();
      }
      await Promise.resolve();
    },
    isSkipped: () => false,
    onUpdate: (count) => {
      updates.push({ time: simulatedTimeMs, count });
    },
    stopAudio: () => {
      stopped = true;
    },
    tickMs,
    nowMs: () => simulatedTimeMs,
  });

  await syncPromise;

  // 验证:在 3000ms 起声前(尤其在 >2500ms 的关键空窗),字幕必须绝对为 0
  const beforeStartUpdates = updates.filter((u) => u.time < 3000);
  assert.ok(beforeStartUpdates.length > 0, '起声前应有检查记录');
  for (const u of beforeStartUpdates) {
    assert.equal(u.count, 0, `时刻 ${u.time}ms 起声前字幕必须为 0,不能提前打字`);
  }

  // 验证起声后字幕正常前进至全部展现
  const afterStartUpdates = updates.filter((u) => u.time >= 3000);
  assert.ok(afterStartUpdates.some((u) => u.count > 0), '起声后字幕应开始打字');
  assert.equal(updates[updates.length - 1].count, total, '最终字幕必须完整显示');
  assert.equal(stopped, false, '正常播放不应触发 stopAudio');
});

test('Regression 2: streaming with Infinity duration retains currentTime and finishes naturally', async () => {
  const plain = '流式音频返回未知长度时以媒体当前时间驱动字幕并不提前中断';
  const total = plain.length;
  const updates = [];
  let stopped = false;
  let simulatedTimeMs = 0;
  const tickMs = 50;

  let resolveEnded;
  const ended = new Promise((res) => { resolveEnded = res; });

  const handle = {
    started: Promise.resolve('started'),
    ended,
    getProgress: () => {
      const curSec = simulatedTimeMs / 1000;
      // 流式响应 duration 为 Infinity
      return { currentTime: curSec, duration: Infinity, ratio: -1 };
    },
  };

  const syncPromise = runCaptionSync({
    total,
    plain,
    speed: 1,
    handle,
    wait: async (ms) => {
      simulatedTimeMs += ms;
      if (simulatedTimeMs >= 4200) {
        resolveEnded();
      }
      await Promise.resolve();
    },
    isSkipped: () => false,
    onUpdate: (count) => {
      updates.push({ time: simulatedTimeMs, count });
    },
    stopAudio: () => {
      stopped = true;
    },
    tickMs,
    nowMs: () => simulatedTimeMs,
  });

  await syncPromise;

  assert.equal(stopped, false, 'Infinity duration 且正常播放时不应提前停掉音频');
  assert.ok(updates.some((u) => u.count > 0 && u.count < total), '进度应随 currentTime 平滑增长');
  assert.equal(updates[updates.length - 1].count, total, '最终字幕全部展现');
});

test('Regression 3: buffering freeze stops stalled audio and performs smooth fallback', async () => {
  const plain = '音频播放中途断流冻结超过十二秒后应止损切估算时钟完成剩余字幕';
  const total = plain.length;
  const updates = [];
  let stopCount = 0;
  let simulatedTimeMs = 0;
  const tickMs = 50;

  let resolveEnded;
  const ended = new Promise((res) => { resolveEnded = res; });

  const handle = {
    started: Promise.resolve('started'),
    ended,
    getProgress: () => {
      // 播到 1.0 秒(即 1000ms)后 currentTime 彻底冻结不再增长
      const curSec = Math.min(1.0, simulatedTimeMs / 1000);
      return { currentTime: curSec, duration: 6.0, ratio: curSec / 6.0 };
    },
  };

  const syncPromise = runCaptionSync({
    total,
    plain,
    speed: 1,
    handle,
    wait: async (ms) => {
      simulatedTimeMs += ms;
      await Promise.resolve();
    },
    isSkipped: () => false,
    onUpdate: (count) => {
      updates.push({ time: simulatedTimeMs, count });
    },
    stopAudio: () => {
      stopCount++;
      resolveEnded();
    },
    stallMs: 12000,
    tickMs,
    nowMs: () => simulatedTimeMs,
  });

  await syncPromise;

  assert.ok(stopCount >= 1, '断流超过 stallMs 必须主动调用 stopAudio 止损');
  assert.equal(updates[updates.length - 1].count, total, '断流降级后剩余字幕必须平滑跑完');
  // 验证在断流发生时刻之前已有部分字幕(大于0且小于total)
  const preFreezeUpdates = updates.filter((u) => u.time <= 1000);
  assert.ok(preFreezeUpdates.some((u) => u.count > 0 && u.count < total), '冻结前应有部分字幕显示');
  // 验证 13s 判定断流后启动 fallback 继续递增字幕
  const fallbackUpdates = updates.filter((u) => u.time >= 13000);
  assert.ok(fallbackUpdates.length > 0, '13s 判定断流后应启动 fallback 补完字幕');
  assert.ok(fallbackUpdates.some((u) => u.count > preFreezeUpdates[preFreezeUpdates.length - 1].count), 'fallback 必须从冻结处继续向前推进字幕');
});

test('Regression 4: failed start performs smooth fallback anchored at failure point', async () => {
  const plain = '起声直接报错时以估算时钟平滑打字不卡死';
  const total = plain.length;
  const updates = [];
  let stopped = false;
  let simulatedTimeMs = 0;
  const tickMs = 50;

  const handle = {
    started: Promise.resolve('error'),
    ended: Promise.resolve(),
    getProgress: () => null,
  };

  const syncPromise = runCaptionSync({
    total,
    plain,
    speed: 1,
    handle,
    wait: async (ms) => {
      simulatedTimeMs += ms;
      await Promise.resolve();
    },
    isSkipped: () => false,
    onUpdate: (count) => {
      updates.push({ time: simulatedTimeMs, count });
    },
    stopAudio: () => {
      stopped = true;
    },
    tickMs,
    nowMs: () => simulatedTimeMs,
  });

  await syncPromise;

  assert.ok(stopped, '出错时应调用 stopAudio 确保资源释放');
  assert.ok(updates.length > 1, 'fallback 应该产生逐字递增的平滑进度');
  assert.equal(updates[updates.length - 1].count, total, '最终字幕全部展现');
});

test('Regression 5: cancellation prevents late audio from playing', async () => {
  let playResolve;
  let pauseCalled = false;
  let srcCleared = false;
  let notifiedOn = [];

  class MockAudio {
    constructor(url) {
      this.url = url;
      this.src = url;
      this.currentTime = 0;
      this.duration = 5;
      this.paused = false;
    }
    play() {
      return new Promise((resolve) => {
        playResolve = resolve;
      });
    }
    pause() {
      this.paused = true;
      pauseCalled = true;
    }
    removeAttribute(attr) {
      if (attr === 'src') srcCleared = true;
    }
    load() {}
  }

  const originalAudio = globalThis.Audio;
  globalThis.Audio = MockAudio;

  try {
    const unsub = tts.subscribe((on) => {
      notifiedOn.push(on);
    });

    // 启动一条旁白
    const handle = tts.speakTrack('测试迟到音频拦截');

    // 立即取消/停止(例如起声超时切估算、或者用户跳过/切课)
    tts.stop();
    assert.equal(tts.speaking(), false, 'stop 后 speaking 状态应为 false');

    // 随后迟到的 play() 完成
    assert.ok(playResolve, 'playResolve 必须存在');
    playResolve();
    await Promise.resolve();
    await Promise.resolve();

    // 验证迟到的 play() 没有把 audio 激活，没有通知 listeners(true)，并且调用了 pause/清除了 src
    assert.ok(pauseCalled, '迟到 play 完成时必须立刻被 pause');
    assert.ok(srcCleared, '迟到 play 完成时 src 必须被移除卸载');
    assert.equal(tts.speaking(), false, '迟到音频不得将 speaking 翻为 true');
    assert.ok(!notifiedOn.includes(true), '通知订阅者中不得包含 true');

    unsub();
  } finally {
    globalThis.Audio = originalAudio;
  }
});

test('Regression 6: narration beyond estimate does not stop prematurely and tracks media time', async () => {
  const plain = '超长音频';
  const total = plain.length;
  const updates = [];
  let stopped = false;
  let simulatedTimeMs = 0;
  const tickMs = 50;

  let resolveEnded;
  const ended = new Promise((res) => { resolveEnded = res; });

  // 估算时长通常为 4000ms(下限)，实际音频长达 6000ms
  const actualDurationSec = 6.0;
  const handle = {
    started: Promise.resolve('started'),
    ended,
    getProgress: () => {
      const curSec = simulatedTimeMs / 1000;
      return { currentTime: curSec, duration: actualDurationSec, ratio: curSec / actualDurationSec };
    },
  };

  const syncPromise = runCaptionSync({
    total,
    plain,
    speed: 1,
    handle,
    wait: async (ms) => {
      simulatedTimeMs += ms;
      if (simulatedTimeMs >= 6000) {
        resolveEnded();
      }
      await Promise.resolve();
    },
    isSkipped: () => false,
    onUpdate: (count) => {
      updates.push({ time: simulatedTimeMs, count });
    },
    stopAudio: () => {
      stopped = true;
    },
    tickMs,
    nowMs: () => simulatedTimeMs,
  });

  await syncPromise;

  assert.equal(stopped, false, '旁白超过估算时长时，只要媒体时间前进，绝不能提前 stopAudio 截断');
  assert.ok(simulatedTimeMs >= 6000, '音频必须完整播放到 6000ms');
  assert.equal(updates[updates.length - 1].count, total, '最终字幕必须为 100%');
});

test('Regression 7: startup timeout cancels pending audio and performs smooth fallback', async () => {
  const plain = '起声超时后取消挂起音频并平滑打出字幕';
  const total = plain.length;
  const updates = [];
  let stopCount = 0;
  let simulatedTimeMs = 0;
  const tickMs = 50;
  const startupTimeoutMs = 8000;

  // started 与 ended 在超时前始终挂起未决(模拟冷合成挂起或极慢无响应)
  const started = new Promise(() => {});
  const ended = new Promise(() => {});

  const handle = {
    started,
    ended,
    getProgress: () => null,
  };

  const syncPromise = runCaptionSync({
    total,
    plain,
    speed: 1,
    handle,
    wait: async (ms) => {
      simulatedTimeMs += ms;
      await Promise.resolve();
    },
    isSkipped: () => false,
    onUpdate: (count) => {
      updates.push({ time: simulatedTimeMs, count });
    },
    stopAudio: () => {
      stopCount++;
    },
    startupTimeoutMs,
    tickMs,
    nowMs: () => simulatedTimeMs,
  });

  await syncPromise;

  assert.ok(stopCount >= 1, '起声等待达到 8000ms 超时必须调用 stopAudio 止损取消音频');
  // 超时发生前，字幕必须严格恒为 0 (等待起声期间不抢跑)
  const preTimeoutUpdates = updates.filter((u) => u.time < startupTimeoutMs);
  assert.ok(preTimeoutUpdates.length > 0, '超时前应有检查记录');
  for (const u of preTimeoutUpdates) {
    assert.equal(u.count, 0, `时刻 ${u.time}ms 超时前字幕必须为 0`);
  }
  // 超时后平滑打出字幕并最终全部展现
  const postTimeoutUpdates = updates.filter((u) => u.time >= startupTimeoutMs);
  assert.ok(postTimeoutUpdates.some((u) => u.count > 0), '超时后应启动 fallback 推进字幕');
  assert.equal(updates[updates.length - 1].count, total, '超时降级后最终字幕必须完整展现');
});

test('Regression 8: background-throttled ticks still honor real startup timeout', async () => {
  /* 后台标签页 setInterval 被节流到 ~1Hz:tick 次数失真,但真实流逝时间必须生效——
   * 起声超时不许退化成 ×20 的拍数。模拟:每次 wait(50) 实际过去 1000ms。 */
  const plain = '后台节流期间起声超时仍按真实时间止损并平滑补齐字幕内容';
  const total = plain.length;
  const updates = [];
  let stopCount = 0;
  let simulatedTimeMs = 0;
  let waitCalls = 0;
  const tickMs = 50;

  const handle = {
    started: new Promise(() => {}), // 上游永远不起声
    ended: new Promise(() => {}),
    getProgress: () => null,
  };

  await runCaptionSync({
    total,
    plain,
    speed: 1,
    handle,
    wait: async (ms) => {
      waitCalls++;
      simulatedTimeMs += ms * 20; // 节流:50ms 的拍子实际耗 1000ms
      await Promise.resolve();
    },
    isSkipped: () => false,
    onUpdate: (count) => updates.push({ time: simulatedTimeMs, count }),
    stopAudio: () => { stopCount++; },
    tickMs,
    nowMs: () => simulatedTimeMs,
  });

  assert.equal(stopCount, 1, '起声超时必须止损停掉挂起音频');
  /* 每拍 1000ms:超时拍数 = STARTUP_TIMEOUT_MS/1000,再加降级补齐字幕的少量拍 */
  const maxTicks = Math.ceil(STARTUP_TIMEOUT_MS / 1000) + 15;
  assert.ok(waitCalls <= maxTicks, `真实时间 ${STARTUP_TIMEOUT_MS}ms 超时不应需要 ${maxTicks} 拍(实际 ${waitCalls} 拍)`);
  assert.equal(updates[updates.length - 1].count, total, '降级后字幕必须完整');
});

test('Regression 9: underestimated duration never completes captions before audio ends', async () => {
  /* 估算 4s、真实 12s:字幕在 ended 前不得超过 97% 上限,收尾由播完驱动 */
  const plain = '这段旁白的真实音频时长远超估算窗口字幕绝不能提前讲完';
  const total = plain.length;
  const updates = [];
  let simulatedTimeMs = 0;
  const tickMs = 50;

  let resolveEnded;
  const ended = new Promise((res) => { resolveEnded = res; });
  const handle = {
    started: Promise.resolve('started'),
    ended,
    getProgress: () => {
      const curSec = simulatedTimeMs / 1000;
      return { currentTime: curSec, duration: Infinity, ratio: -1 };
    },
  };

  await runCaptionSync({
    total,
    plain,
    speed: 1,
    handle,
    wait: async (ms) => {
      simulatedTimeMs += ms;
      if (simulatedTimeMs >= 12000) resolveEnded();
      await Promise.resolve();
    },
    isSkipped: () => false,
    onUpdate: (count) => updates.push({ time: simulatedTimeMs, count }),
    stopAudio: () => {},
    tickMs,
    nowMs: () => simulatedTimeMs,
  });

  const cap = Math.floor(0.97 * total);
  const premature = updates.filter((u) => u.time < 12000 && u.count > cap);
  assert.equal(premature.length, 0, `ended 前字幕不得超过 97% 上限: ${JSON.stringify(premature[0] ?? '')}`);
  const preEnd = updates.filter((u) => u.time < 12000);
  assert.ok(preEnd.some((u) => u.count > 0), '播放中字幕应随媒体时间推进');
  assert.equal(updates[updates.length - 1].count, total, '播完后字幕必须完整');
});

test('Regression 10: paused lesson clock never false-triggers stall fallback', async () => {
  /* 暂停 20s(超过 12s 止损线):授课时钟冻结,恢复后不得误判断流杀音频 */
  const plain = '暂停再恢复不应该被误判成断流冻结音频必须继续正常播放';
  const total = plain.length;
  let stopCount = 0;
  let wallMs = 0;
  let lessonMs = 0;
  let paused = false;
  const tickMs = 50;

  let resolveEnded;
  const ended = new Promise((res) => { resolveEnded = res; });
  const handle = {
    started: Promise.resolve('started'),
    ended,
    getProgress: () => {
      // 暂停期间媒体时间冻结,恢复后继续
      const curSec = lessonMs / 1000;
      return { currentTime: curSec, duration: 30.0, ratio: curSec / 30.0 };
    },
  };

  await runCaptionSync({
    total,
    plain,
    speed: 1,
    handle,
    wait: async (ms) => {
      wallMs += ms;
      if (!paused) lessonMs += ms;
      // 2000ms 起暂停 20s(墙钟),随后恢复,12s 媒体时间处播完
      if (wallMs === 2000) paused = true;
      if (wallMs === 22000) paused = false;
      if (lessonMs >= 12000) resolveEnded();
      await Promise.resolve();
    },
    isSkipped: () => false,
    onUpdate: () => {},
    stopAudio: () => { stopCount++; },
    tickMs,
    nowMs: () => lessonMs,
  });

  assert.equal(stopCount, 0, '暂停 20s 不得触发断流止损');
});
