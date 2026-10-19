// 评审进度 PNG 渲染器 + 状态归一化的纯函数测试(无 D1/网络)。
// PNG 必须能被标准解码器读回:这里用 node:zlib inflate 还原原始位图,
// 校验尺寸/签名/CRC 之外的实质内容——像素确实画上去了。
import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import {
  MAIL_STATUS_PANEL,
  renderMailStatusPanelPng,
  renderMailStatusPanelRgba,
} from "../app/api/_lib/status-panel-png.ts";
import {
  mailStatusPercent,
  mailStatusSummary,
  mergeMailStatusState,
  newMailStatusToken,
  normalizeMailStatusState,
  MAIL_STATUS_TOKEN_PATTERN,
} from "../app/api/_lib/mail-status.ts";

function pngChunks(png) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const signature = png.subarray(0, 8);
  assert.deepEqual([...signature], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "PNG 签名");
  const chunks = [];
  let cursor = 8;
  while (cursor < png.length) {
    const length = view.getUint32(cursor);
    const type = new TextDecoder().decode(png.subarray(cursor + 4, cursor + 8));
    chunks.push({ type, data: png.subarray(cursor + 8, cursor + 8 + length) });
    cursor += 12 + length;
  }
  return chunks;
}

function decodeIdat(idat) {
  const raw = inflateSync(idat);
  const width = MAIL_STATUS_PANEL.width;
  const stride = width * 4 + 1;
  assert.equal(raw.length, stride * MAIL_STATUS_PANEL.height, "解压后应等于 (w*4+1)*h");
  for (let y = 0; y < MAIL_STATUS_PANEL.height; y++) {
    assert.equal(raw[y * stride], 0, `第 ${y} 行 filter 应为 none`);
  }
  return raw;
}

function opaquePixels(raw) {
  const width = MAIL_STATUS_PANEL.width;
  const stride = width * 4 + 1;
  let count = 0;
  for (let y = 0; y < MAIL_STATUS_PANEL.height; y++) {
    for (let x = 0; x < width; x++) {
      if (raw[y * stride + 1 + x * 4 + 3] > 0) count++;
    }
  }
  return count;
}

test("PNG:结构合法(IHDR/IDAT/IEND + 尺寸 + zlib 可解)", async () => {
  const png = await renderMailStatusPanelPng({ stage: "作业评审", total: 5, done: 3 });
  const chunks = pngChunks(png);
  assert.deepEqual(chunks.map((c) => c.type), ["IHDR", "IDAT", "IEND"]);
  const ihdr = chunks[0].data;
  const view = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
  assert.equal(view.getUint32(0), MAIL_STATUS_PANEL.width);
  assert.equal(view.getUint32(4), MAIL_STATUS_PANEL.height);
  assert.equal(ihdr[8], 8, "bit depth");
  assert.equal(ihdr[9], 6, "color type RGBA");
  const raw = decodeIdat(chunks[1].data);
  assert.ok(opaquePixels(raw) > 5000, "进度条+数字应占据足够像素");
});

test("PNG:完成度越高,进度条填充越宽(只统计条区,避开字数差异)", () => {
  // 只数进度条那一横带的墨绿像素:数字文案("1/10" vs "9/10")着墨数不同,
  // 全图统计会把文案差异算进进度差异里。
  const barGreen = (state) => {
    const { rgba } = renderMailStatusPanelRgba(state);
    const width = MAIL_STATUS_PANEL.width;
    let count = 0;
    for (let y = 196; y < 196 + 48; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (rgba[i + 3] > 200 && rgba[i] < 60 && rgba[i + 1] > 60 && rgba[i + 1] < 110) count++;
      }
    }
    return count;
  };
  const low = barGreen({ total: 10, done: 1 });
  const high = barGreen({ total: 10, done: 9 });
  assert.ok(low > 3000, `10% 应有约一条最小宽度的填充 (${low})`);
  assert.ok(high > low * 5, `90% 的填充应远宽于 10% (${high} vs ${low})`);
});

test("PNG:无数字状态只画空轨(percent 为 null 时不画填充也不画数字)", () => {
  const { rgba } = renderMailStatusPanelRgba({ stage: "作业评审" });
  let green = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] > 200 && rgba[i] < 60) green++;
  }
  assert.equal(green, 0, "缺 total/done 时不得出现进度填充或数字");
});

test("PNG:透明底(邮件卡片上可直接叠放)", async () => {
  const png = await renderMailStatusPanelPng({ total: 4, done: 4 });
  const raw = decodeIdat(pngChunks(png)[1].data);
  const width = MAIL_STATUS_PANEL.width;
  const stride = width * 4 + 1;
  // 顶部留白区(进度条之上、数字之下)必须全透明
  let transparent = 0;
  for (let x = 0; x < width; x++) {
    if (raw[180 * stride + 1 + x * 4 + 3] === 0) transparent++;
  }
  assert.equal(transparent, width, "数字与进度条之间应整行透明");
});

// ---- 状态归一化/合并 ----

test("token:32 位十六进制、每次不同、过形状校验", () => {
  const tokens = new Set(Array.from({ length: 50 }, () => newMailStatusToken()));
  assert.equal(tokens.size, 50);
  for (const token of tokens) {
    assert.match(token, /^[a-f0-9]{32}$/);
    assert.equal(MAIL_STATUS_TOKEN_PATTERN.test(token), true);
  }
  assert.equal(MAIL_STATUS_TOKEN_PATTERN.test("xyz"), false);
  assert.equal(MAIL_STATUS_TOKEN_PATTERN.test("a".repeat(31)), false);
  assert.equal(MAIL_STATUS_TOKEN_PATTERN.test("a".repeat(33)), false);
});

test("normalize:白名单字段、超长截断、非法类型丢弃、total 至少为 1", () => {
  const state = normalizeMailStatusState({
    stage: "作业评审",
    eta: "10月25日",
    note: "备注".repeat(400),
    total: 0,
    done: 99,
    evil: "<script>",
    extra: true,
  });
  assert.equal(state.stage, "作业评审");
  assert.equal(state.total, 1, "total=0 被钳到 1");
  assert.equal(state.done, 1, "done 超过 total 时钳到 total");
  assert.equal(state.note.length, 500, "note 截到 500");
  assert.equal(state.evil, undefined, "白名单外字段一律丢弃");
});

test("merge:DB 字符串必须先 parse——store 路径回归(total 不得被局部更新清空)", () => {
  // 生产 bug 复现:upsert 把 state_json 字符串直接喂 merge,normalize 对非对象
  // 返回空状态,于是 set --done 5 之后 total/stage 全部消失。
  const stored = JSON.stringify({ stage: "作业评审", total: 5, done: 2 });
  assert.deepEqual(mergeMailStatusState(stored, { done: 5 }), { done: 5 }, "字符串直接喂 = 清空(反面对照)");
  assert.deepEqual(mergeMailStatusState(JSON.parse(stored), { done: 5 }), { stage: "作业评审", total: 5, done: 5 });
  assert.deepEqual(mergeMailStatusState(JSON.parse(stored), { stage: "群面" }), { stage: "群面", total: 5, done: 2 });
});

test("merge:局部更新只改带来的字段,空串清除,数字跨字段重钳", () => {
  const base = { stage: "作业评审", total: 5, done: 2, eta: "10月20日", note: "顺利" };
  assert.deepEqual(mergeMailStatusState(base, { done: 4 }), { stage: "作业评审", total: 5, done: 4, eta: "10月20日", note: "顺利" });
  assert.deepEqual(mergeMailStatusState(base, { note: "" }), { stage: "作业评审", total: 5, done: 2, eta: "10月20日" });
  assert.deepEqual(mergeMailStatusState(base, { total: 3 }), { stage: "作业评审", total: 3, done: 2, eta: "10月20日", note: "顺利" });
  assert.deepEqual(mergeMailStatusState(base, { done: 99 }), { stage: "作业评审", total: 5, done: 5, eta: "10月20日", note: "顺利" });
  assert.deepEqual(mergeMailStatusState({}, { stage: "群面" }), { stage: "群面" });
  assert.deepEqual(mergeMailStatusState("{ broken json", { done: 1 }), { done: 1 }, "坏 JSON 按空状态起步");
});

test("percent/summary:边界与文案(不暴露评委身份)", () => {
  assert.equal(mailStatusPercent({ total: 5, done: 0 }), 0);
  assert.equal(mailStatusPercent({ total: 5, done: 3 }), 60);
  assert.equal(mailStatusPercent({ total: 5, done: 99 }), 100, "超额完成钳到 100%");
  assert.equal(mailStatusPercent({}), null);
  assert.equal(mailStatusSummary({ stage: "作业评审", total: 5, done: 3, eta: "10月25日" }), "作业评审 · 3/5 位评委已完成 · 预计 10月25日 前通知结果");
  assert.equal(mailStatusSummary({}), "评审正在进行");
  for (const state of [{ total: 5, done: 3, note: "张评委已评,李评委进行中" }]) {
    // note 是运营写给候选人的话,可以提评审进展;但 summary 的聚合文案不得带评委姓名
    assert.ok(!mailStatusSummary(state).includes("张评委"), "摘要不得携带评委个人身份");
  }
});
