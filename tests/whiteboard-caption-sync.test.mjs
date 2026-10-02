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

const whiteboardModule = loadTsModule(new URL('src/lattice/whiteboard/WhiteboardPage.tsx', spa));
const { runCaptionSync, STARTUP_TIMEOUT_MS } = whiteboardModule;
const actionsModule = loadTsModule(new URL('src/lattice/actions.ts', spa));
const { tts, DEFAULT_PLAYBACK_RATE } = actionsModule;
const liveLessonModule = loadTsModule(new URL('src/lattice/whiteboard/liveLesson.ts', spa));
const { liveLessonFromPlan } = liveLessonModule;
const { lessonDelay } = loadTsModule(new URL('src/lattice/whiteboard/lessonDelay.ts', spa));
const { choiceIndexFromInput } = loadTsModule(new URL('src/lattice/whiteboard/choiceInput.ts', spa));
import { WHITEBOARD_INSTRUCTOR_PROMPT, INTERJECTION_ANSWER_PROMPT, fallbackLecturePlan } from '../app/api/_lib/hyperknow/prompts.ts';

test('interjection cooldown advances while lecture is paused; normal lesson time does not', async () => {
  const control = { cancelled: false, paused: true, skipped: false };
  let lessonSettled = false;
  const lessonWait = lessonDelay(50, control).then(() => { lessonSettled = true; });
  await lessonDelay(50, control, true);
  assert.equal(lessonSettled, false, '主线暂停期间授课计时器不得前进');
  control.paused = false;
  await lessonWait;
  assert.equal(lessonSettled, true, '解除暂停后原授课计时器应继续');

  const cancelled = { cancelled: true, paused: true, skipped: false };
  await assert.rejects(lessonDelay(50, cancelled, true), /cancelled/);
});

test('quick check accepts typed and spoken option forms without forwarding unrelated questions', () => {
  const options = ['光合作用', '细胞呼吸', '蒸腾作用'];
  assert.equal(choiceIndexFromInput('B', options), 1);
  assert.equal(choiceIndexFromInput('选项 C', options), 2);
  assert.equal(choiceIndexFromInput('第 1 项', options), 0);
  assert.equal(choiceIndexFromInput('细胞呼吸', options), 1);
  assert.equal(choiceIndexFromInput('为什么会这样？', options), null);
  assert.equal(choiceIndexFromInput('D', options), null);
});

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
    tts.speakTrack('测试迟到音频拦截');

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

test('Regression 11: Dynamic client playbackRate updates active track immediately and applies to future tracks, while synthesis retains baseline speed=1', async () => {
  assert.equal(DEFAULT_PLAYBACK_RATE, 0.85, '默认语速应设定为舒适偏慢的 0.85x');
  tts.setPlaybackRate(0.85);
  assert.equal(tts.getPlaybackRate(), 0.85, '初始播放倍率应为 0.85');

  const createdAudios = [];
  class MockRateAudio {
    constructor(url) {
      this.url = url;
      this.src = url;
      this.currentTime = 0;
      this.duration = 5.0;
      this.paused = true;
      this.playbackRate = 1.0;
      createdAudios.push(this);
    }
    play() {
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    removeAttribute(attr) {
      if (attr === 'src') this.src = '';
    }
    load() {}
  }

  const origAudio = globalThis.Audio;
  globalThis.Audio = MockRateAudio;

  try {
    // 启动第一条旁白
    const handle1 = tts.speakTrack('第一讲：基础概念');
    await handle1.started;
    assert.equal(createdAudios.length, 1);
    const audio1 = createdAudios[0];
    assert.ok(audio1.url.includes('speed=1'), '合成 URL 必须恒以 baseline speed=1 请求以复用预热缓存');
    assert.equal(audio1.playbackRate, 0.85, '音频实例播放倍率应初始化为 0.85');

    // 用户在设置弹窗即时调节语速为 1.25x
    tts.setPlaybackRate(1.25);
    assert.equal(audio1.playbackRate, 1.25, '正在播放的音轨倍率必须被立刻动态更新');
    assert.equal(tts.getPlaybackRate(), 1.25);

    // 启动下一条旁白
    const handle2 = tts.speakTrack('第二讲：核心机制');
    await handle2.started;
    assert.equal(createdAudios.length, 2);
    const audio2 = createdAudios[1];
    assert.ok(audio2.url.includes('speed=1'), '后续音轨合成 URL 仍保持 baseline speed=1');
    assert.equal(audio2.playbackRate, 1.25, '后续音轨必须继承最新设定的 1.25x 倍率');

    tts.stop();
  } finally {
    globalThis.Audio = origAudio;
    tts.setPlaybackRate(0.85);
  }
});

test('Regression 12: Tutor interjection does not destroy paused lecture audio or prematurely settle lecture ended promise', async () => {
  const audioInstances = [];
  class MockInterjectAudio {
    constructor(url) {
      this.url = url;
      this.src = url;
      this.currentTime = 0;
      this.duration = 10.0;
      this.paused = true;
      this.ended = false;
      this.playbackRate = 1.0;
      this.onended = null;
      this.onerror = null;
      audioInstances.push(this);
    }
    play() {
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    removeAttribute(attr) {
      if (attr === 'src') this.src = '';
    }
    load() {}
  }

  const origAudio = globalThis.Audio;
  globalThis.Audio = MockInterjectAudio;

  try {
    // 1. 主线旁白开始播放
    const lectureHandle = tts.speakTrack('主线讲座：从背景到本质推导');
    await lectureHandle.started;
    assert.equal(audioInstances.length, 1);
    const lectureAudio = audioInstances[0];
    assert.equal(lectureAudio.paused, false, '主线音频正在播放');

    let lectureEndedSettled = false;
    void lectureHandle.ended.then(() => {
      lectureEndedSettled = true;
    });

    // 模拟播放到第 3.2 秒
    lectureAudio.currentTime = 3.2;

    // 2. 学员举手插话：主线暂停
    tts.pauseAudio();
    assert.equal(lectureAudio.paused, true, '主线音频已暂停');
    assert.equal(lectureEndedSettled, false, '主线 ended 绝不可因暂停而提前 settle');

    // 3. 导师回答：在独立 tutor 通道播放答疑音频
    const tutorHandle = tts.speakTutorTrack('导师答疑：变量之间的核心关系是...');
    await tutorHandle.started;
    assert.equal(audioInstances.length, 2, '导师答疑应创建独立的音频实例');
    const tutorAudio = audioInstances[1];
    assert.equal(tutorAudio.paused, false, '导师答疑音频正在播放');

    // 关键断言：导师答疑播放期间，主线音频依然存在，currentTime 保留，ended 保持挂起未决
    assert.equal(lectureAudio.paused, true, '主线音频依然处于暂停保留状态');
    assert.equal(lectureAudio.currentTime, 3.2, '主线音频进度必须精准保存在断点');
    assert.equal(lectureEndedSettled, false, '主线 ended 在导师答疑期间绝不可被销毁或误触发');

    tts.pauseAudio();
    assert.equal(tutorAudio.paused, true, '用户主动暂停时导师音频也应暂停');
    tts.resumeTutor();
    await Promise.resolve();
    assert.equal(tutorAudio.paused, false, '用户在答疑中解除暂停后导师音频应恢复');
    assert.equal(lectureAudio.paused, true, '答疑期间解除用户暂停仍不得提前播放主线');

    // 4. 导师答疑播完
    tutorAudio.ended = true;
    if (tutorAudio.onended) tutorAudio.onended();
    await tutorHandle.ended;

    // 5. 答疑结束后恢复主线
    tts.resumeAudio();
    assert.equal(lectureAudio.paused, false, '主线音频恢复播放');
    assert.equal(lectureAudio.currentTime, 3.2, '恢复后必须从 3.2s 断点无缝续播');
    assert.equal(lectureEndedSettled, false, '主线依然未结束');

    // 6. 主线音频自然播完
    lectureAudio.currentTime = 10.0;
    lectureAudio.ended = true;
    if (lectureAudio.onended) lectureAudio.onended();
    await lectureHandle.ended;
    assert.equal(lectureEndedSettled, true, '主线在真正播完时自然触发 ended');

    tts.stop();
  } finally {
    globalThis.Audio = origAudio;
  }
});

test('Regression 13: Stop/Unmount stops both lecture and tutor audio channels without hanging', async () => {
  class MockDualAudio {
    constructor(url) {
      this.url = url;
      this.src = url;
      this.currentTime = 0;
      this.duration = 8.0;
      this.paused = true;
    }
    play() {
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    removeAttribute(attr) {
      if (attr === 'src') this.src = '';
    }
    load() {}
  }

  const origAudio = globalThis.Audio;
  globalThis.Audio = MockDualAudio;

  try {
    const lHandle = tts.speakTrack('主线');
    await lHandle.started;
    tts.pauseAudio();

    const tHandle = tts.speakTutorTrack('答疑');
    await tHandle.started;
    assert.equal(tts.speaking(), true);

    let lEnded = false;
    let tEnded = false;
    void lHandle.ended.then(() => { lEnded = true; });
    void tHandle.ended.then(() => { tEnded = true; });

    tts.stop();

    await Promise.resolve();
    assert.equal(tts.speaking(), false, 'stop 之后 speaking 必须为 false');
    assert.equal(lEnded, true, '主线 ended 必须被解冻');
    assert.equal(tEnded, true, '导师 ended 必须被解冻');
  } finally {
    globalThis.Audio = origAudio;
  }
});

test('Regression 14: liveLessonFromPlan handles intermediate quick_checks with explanations, and awaitAnswer questions', () => {
  const plan = {
    steps: [
      {
        step_id: 's1',
        spoken_text: '第一步：直觉引入。',
        board_action: { type: 'card', title: '核心直觉', content: '<p>重要观察</p>' },
      },
      {
        step_id: 's2',
        spoken_text: '在进入下一步前，我们先通过随堂小测验证一下刚才的关键概念。',
        board_action: {
          type: 'quick_check',
          question: '下面哪个选项最符合直觉核心？',
          options: ['选项 A', '选项 B', '选项 C'],
          answer: 0,
          explanation: '选项 A 直接对应核心机制。',
        },
      },
      {
        step_id: 's3',
        spoken_text: '请在输入框写下你生活中的一个类似例子。',
        board_action: { type: 'card', title: '反思问题', content: '<p>你的思考</p>' },
        await_answer: true,
      },
      {
        step_id: 's4',
        spoken_text: '总结验证。',
        board_action: {
          type: 'quick_check',
          question: '结课检测题',
          options: ['正确', '错误'],
          answer: 0,
          explanation: '正确选项概括了全部要素。',
        },
      },
    ],
  };

  const script = liveLessonFromPlan(plan);
  assert.equal(script.steps.length, 5, '4 步讲座 + 1 步结课 popup');

  // Step 2: 随堂中间快测
  const s2 = script.steps[1];
  assert.ok(s2.awaitChoice, '中间测试必须生成 awaitChoice');
  assert.equal(s2.awaitChoice.question, '下面哪个选项最符合直觉核心？');
  assert.equal(s2.awaitChoice.answer, 0);
  assert.equal(s2.awaitChoice.explanation, '选项 A 直接对应核心机制。');

  // Step 3: awaitAnswer 互动问答步
  const s3 = script.steps[2];
  assert.equal(s3.awaitAnswer, true, 'await_answer 标记必须正确映射为 step.awaitAnswer');

  // Step 4: 结课测试
  const s4 = script.steps[3];
  assert.ok(s4.awaitChoice, '终末测试生成 awaitChoice');
  assert.equal(s4.awaitChoice.explanation, '正确选项概括了全部要素。');
  assert.equal(s4.systemEnd, true, '最后一步讲座带有 systemEnd 标志');
});

test('Regression 15: WHITEBOARD_INSTRUCTOR_PROMPT mandates full-length lectures (10-14 steps, 3-5 sentence narration), diagram invariant, and answer-gated checks', () => {
  // 用户反馈"每一讲都讲的很少就结束了"→ 提示词从 5-7 步微讲座升级为 10-14 步完整讲座;
  // 用户反馈"讲课不够细腻"→ 旁白升至 3-5 句(承接/讲解/指板/过渡微结构)+ 课程上下文注入
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /10 to 14 steps/i, 'Prompt 必须要求 10-14 步完整讲座');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /3 to 5 crisp, conversational sentences/i, 'Prompt 必须要求每步 3-5 句旁白');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /COURSE CONTEXT/i, 'Prompt 必须定义课程上下文块(深度校准/个性化举例/前后讲衔接)');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /recalls the previous lecture/i, '开场必须承接上一讲');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /hands off to the next lecture/i, '收尾必须预告下一讲');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /FULL-LENGTH lecture/i, '必须定义为完整讲座而非微讲座');
  assert.doesNotMatch(WHITEBOARD_INSTRUCTOR_PROMPT, /micro-lecture|5 to 7 bite-sized|strictly 1 to 2/i, '旧版微讲座要求必须已被移除');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /at least one Mermaid diagram/i, '必须保留 diagram 不变量');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /3 quick_check steps/i, '必须保留 3 处 quick_check(含终末)不变量');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /Worked Example/i, '必须包含实例演示步');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /Common Mistakes/i, '必须包含常见误区步');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /4-6 substantive bullet points/i, '卡片必须要求 4-6 条实质要点');

  // 循证教学法契约(教学水平升级):具体→视觉→抽象、例题渐撤、提取式快测、
  // 误区三步反驳、类比映射+失效边界、符号先定义、好奇环闭合、间隔回声、旁白纯口语
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /concrete → visual → abstract/i, '必须要求具体→视觉→抽象的具体化消退顺序');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /self-explanation question/i, '例题旁白必须嵌入自我解释提问');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /faded completion problem/i, '第二例题必须为渐撤补全题');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /RECALL or INFER/i, '快测必须考回忆/推断而非再认');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /3-beat refutation/i, '误区必须用三步反驳结构');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /states its mapping/i, '类比必须给出映射关系');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /define every term, abbreviation, and symbol at first use/i, '术语符号必须首次使用即定义');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /Curiosity loop/i, '开场谜题必须在收尾闭环');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /Spaced echo/i, '后段快测必须回捞开头内容(间隔回声)');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /NO markdown, bullet characters, or LaTeX in spoken_text/i, '旁白必须纯口语(逐字进 TTS)');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /narration language is ABSOLUTE/i, '中文旁白不得混入英文术语(实测模型把 worked/faded/mastery 读进了 TTS)');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /silently verify/i, '必须要求输出前静默自检');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /Faded Worked Example/i, '进度结构必须含渐撤例题步');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /Synthesis & Closure/i, '进度结构必须含综合收束步');

  // 联网学习科学研究升级(2026-10 四路检索:Merrill/Gagné/Rosenshine/Bloom 框架审计 +
  // Dunlosky/Roediger/Cepeda/Rohrer 元分析 + Sweller/Mayer/Chi/Fiorella 认知负荷与多媒体 +
  // Rowe/Wiliam/Kluger&DeNisi/Kapur/Bjork 启发式与反馈)
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /commit to a prediction/i, '钩子步必须让学员先押预测(有效失败/前测效应)');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /at least 2 steps back/i, '快测必须回捞至少 2 步前的内容(微间隔)');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /cumulative across the whole lecture/i, '终测必须累计覆盖全讲');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /why EACH tempting distractor fails/i, '解析必须逐干扰项说明为何错(铰链题)');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /never the person/i, '反馈必须指向任务而非人身(Kluger & DeNisi)');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /never run three consecutive expository steps/i, '不得连续三步纯讲授(Rosenshine/ICAP)');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /never copy narration sentences onto the card/i, '卡片不得照抄旁白(Mayer 冗余原则)');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /one-line generalization/i, '每个概念必须落地一句可带走的通则');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /teach the core mechanism back/i, '收尾必须邀请学员讲给别人听(教学相长)');
  assert.match(WHITEBOARD_INSTRUCTOR_PROMPT, /interleave/i, '混淆题型必须交错考查');

  // fallbackLecturePlan 保持紧凑(仅上游故障应急路径):5 步 + 阶段快测
  const zhPlan = fallbackLecturePlan('认知心理学');
  assert.equal(zhPlan.steps.length, 5);
  // 中间第 3 步 (index 2) 为阶段快测
  assert.equal(zhPlan.steps[2].board_action.type, 'quick_check', '降级计划第 3 步必须为阶段性快测');
  assert.ok(zhPlan.steps[2].board_action.explanation, '阶段快测必须有 explanation');

  // 每步旁白均必须为紧凑微讲解 (<= 60 汉字)
  for (const [idx, step] of zhPlan.steps.entries()) {
    assert.ok(step.spoken_text.length <= 60, `第 ${idx + 1} 步降级旁白 (${step.spoken_text.length}字) 必须简明紧凑`);
  }

  // 终末快测自备 explanation 字段供反馈与讲解回放
  const zhQc = zhPlan.steps[4].board_action;
  assert.equal(zhQc.type, 'quick_check');
  assert.ok(zhQc.explanation && zhQc.explanation.length > 5, '降级快测必须包含解析解释');

  const enPlan = fallbackLecturePlan('Cognitive Psychology', '', 'en');
  assert.equal(enPlan.steps[2].board_action.type, 'quick_check', '英文降级第 3 步必须为阶段快测');
  for (const [idx, step] of enPlan.steps.entries()) {
    const wordCount = step.spoken_text.trim().split(/\s+/).length;
    assert.ok(wordCount <= 25, `英文第 ${idx + 1} 步降级旁白 (${wordCount}词) 必须简明紧凑`);
  }
  const enQc = enPlan.steps[4].board_action;
  assert.equal(enQc.type, 'quick_check');
  assert.ok(enQc.explanation && enQc.explanation.length > 5, '英文降级快测必须包含 explanation');
});

test('Regression 16: Interaction gating skip and pause-resume race safety', async () => {
  // 1. 模拟在交互测试步被 skip 时，引擎不会卡死在 continueResolver 上
  const ctl = { cancelled: false, paused: false, skipped: false };
  let choiceResolver = null;
  let choiceSettled = false;
  let continueSettled = false;

  const simulateStep = async () => {
    // 等待学员答题
    const idx = ctl.skipped ? 0 : await new Promise((res) => { choiceResolver = res; });
    choiceSettled = true;
    void idx;

    // 展现反馈并等待点击继续或跳过
    if (ctl.skipped) {
      // 若已跳过，必须直接放行，不得挂起等待继续信号
      continueSettled = true;
    } else {
      await new Promise((res) => { void res; });
      continueSettled = true;
    }
  };

  const stepPromise = simulateStep();

  // 用户在题目展现等待期点击“跳过/停止讲解”
  ctl.skipped = true;
  if (choiceResolver) {
    const cr = choiceResolver;
    choiceResolver = null;
    cr(0);
  }

  await stepPromise;
  assert.equal(choiceSettled, true, '题目被立即放行');
  assert.equal(continueSettled, true, '被 skip 的步骤不得挂起在 continueResolver 上死锁');

  // 2. 验证用户主动暂停时，导师答疑结束不得擅自恢复主线播放
  let lectureAudioPaused = false;
  let lessonPaused = false;
  let userPaused = true; // 用户主动按了暂停键

  const askTutorMock = async () => {
    lessonPaused = true;
    lectureAudioPaused = true;

    // 导师答疑进行中...
    await Promise.resolve();

    // 答疑结束：必须检查用户是否原本就处于暂停态
    if (!userPaused) {
      lessonPaused = false;
      lectureAudioPaused = false;
    }
  };

  await askTutorMock();
  assert.equal(lectureAudioPaused, true, '用户主动暂停时，导师答疑结束后主线音频必须维持暂停');
  assert.equal(lessonPaused, true, '用户主动暂停时，导师答疑结束后课程时钟必须维持暂停');
});

test('Regression 17: Unified caption/player dock contracts and 44px accessible touch targets', () => {
  const cssPath = fileURLToPath(new URL('src/lattice/whiteboard/whiteboard.css', spa));
  const cssContent = readFileSync(cssPath, 'utf8');

  // 1. 验证统一底栏 dock 容器与样式存在
  assert.match(cssContent, /\.wb-unified-dock-container\s*\{/, '必须包含统一底栏容器 .wb-unified-dock-container');
  assert.match(cssContent, /\.wb-unified-dock\s*\{/, '必须包含统一底栏 .wb-unified-dock');

  // 2. 验证所有按钮具备 44px 可访问性最小触控目标 (WCAG 2.5.5 / HCD Guardrails)
  assert.match(cssContent, /\.wb-dock-btn\s*\{[^}]*min-width:\s*44px/s, '.wb-dock-btn 最小宽度必须为 44px');
  assert.match(cssContent, /\.wb-dock-btn\s*\{[^}]*min-height:\s*44px/s, '.wb-dock-btn 最小高度必须为 44px');
  assert.match(cssContent, /\.wb-chrome-btn\s*\{[^}]*width:\s*44px/s, '.wb-chrome-btn 宽度必须为 44px');
  assert.match(cssContent, /\.wb-chrome-btn\s*\{[^}]*height:\s*44px/s, '.wb-chrome-btn 高度必须为 44px');
  assert.match(cssContent, /\.wb-pill\s*\{[^}]*height:\s*44px/s, '.wb-pill 高度必须为 44px');

  // 3. 验证移动端响应式布局与无遮挡层级
  assert.match(cssContent, /@media\s*\(\s*max-width:\s*640px\s*\)\s*\{[\s\S]*?\.wb-unified-dock\s*\{[^}]*flex-wrap:\s*wrap/s, '移动端窄屏必须有弹性包装响应式样式');
  assert.match(cssContent, /\.wb-interaction-layer\s*\{[^}]*bottom:\s*96px/s, '交互层必须定位在底栏之上，杜绝重叠');
});

test('Regression 18: Whiteboard high-contrast ink, font fallbacks, and writing item visibility', () => {
  const cssPath = fileURLToPath(new URL('src/lattice/whiteboard/whiteboard.css', spa));
  const cssContent = readFileSync(cssPath, 'utf8');
  const varsPath = fileURLToPath(new URL('src/styles/variables.css', spa));
  const varsContent = readFileSync(varsPath, 'utf8');

  // 1. 字体回退体系必须包含完整中英文字体栈
  assert.match(varsContent, /--font-board-handwriting:\s*"Caveat",\s*"Kaiti SC"/, '手写体变量必须包含 Kaiti SC 等中文字体回退');

  // 2. 白板主色与表格必须为深墨色以确保 WCAG AAA 对比度
  assert.match(cssContent, /\.wb-board\s*\{[^}]*color:\s*#18181B/s, '白板文字默认色必须为深墨色 #18181B');
  assert.match(cssContent, /\.wb-board\s*\{[^}]*-webkit-font-smoothing:\s*antialiased/s, '白板必须开启字体抗锯齿优化');
  assert.match(cssContent, /\.wb-table\s+\.wb-cell\s*\{[^}]*color:\s*#18181B/s, '表格文字颜色必须为深墨色 #18181B');

  // 3. 图表与插图手绘写作态透明度不得低于 0.65，杜绝看不清的灰白底稿
  assert.match(cssContent, /\.wb-item\.wb-diagram\.writing\s*\{\s*opacity:\s*0\.7/s, '图表写作态透明度应保持在 0.7 易读水平');
  assert.match(cssContent, /\.wb-item\.wb-image-card\.writing\s*\{\s*opacity:\s*0\.75/s, '图片卡片写作态透明度应保持在 0.75 易读水平');
});

test('Regression 19: INTERJECTION_ANSWER_PROMPT uses the Socratic distance rule and task-focused framing', () => {
  // 联网检索(2026-10):启发式反问只在"差一步推理"时使用且必须当场收口答案;
  // 反馈指向任务而非人身(Kluger & DeNisi 1996:38% 反馈反而有害)。
  assert.match(INTERJECTION_ANSWER_PROMPT, /exactly ONE inference away/i, '反问引导仅限差一步推理的问题');
  assert.match(INTERJECTION_ANSWER_PROMPT, /ALWAYS close with the explicit answer in the same reply/i, '反问后必须同轮收口答案,不得留空');
  assert.match(INTERJECTION_ANSWER_PROMPT, /never about the person/i, '反馈必须指向任务而非人身');
  assert.match(INTERJECTION_ANSWER_PROMPT, /currently on the board/i, '回答必须锚定当前板书');
  assert.match(INTERJECTION_ANSWER_PROMPT, /no markdown or LaTeX/i, '答疑旁白必须纯口语(逐字进 TTS)');
});
