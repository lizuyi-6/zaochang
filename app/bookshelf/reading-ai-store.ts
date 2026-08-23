"use client";

// 「问 AI」面板的全局状态:模块级单例 store + useSyncExternalStore。
// 为什么不用组件 state:「问 AI」按钮在 ChapterAside 子树,dock 挂在 page.tsx 另一子树,
// 中间隔着服务端组件,prop-drill 不现实;模块 store 还让开关状态存活于卸载周期。
//
// 快照纪律:每次变更整体替换 state 对象(items 数组同样新建),保证 useSyncExternalStore
// 引用比较生效;流式 delta 经 60ms 节流批量 flush,避免每 token 一次重渲染。

import type { ReadingAiAction, ReadingAiMode } from "../api/_lib/reading-ai-prompts";

export type ReadingAiItem = {
  id: string;
  kind: ReadingAiAction;
  label: string;
  quote?: string; // 选中文本摘录或用户提问,展示在答案上方
  text: string;
  status: "streaming" | "done" | "error";
  errorCode?: string;
  cached?: boolean; // summary 命中 sessionStorage 缓存时为 true
};

export type ReadingAiState = {
  open: boolean;
  items: ReadingAiItem[]; // 新的在前
  running: boolean;
  unconfigured: boolean;
  mode: ReadingAiMode; // 快速/专家;客户端只见标签,模型名在服务端 env 里
};

type Listener = () => void;

const MODE_STORAGE_KEY = "reading-ai:mode";

// localStorage 水合只在客户端做;SSR/水合首帧恒为 "fast",useSyncExternalStore 会在
// 水合完成后用客户端快照重渲染,不产生 hydration mismatch。
function initialMode(): ReadingAiMode {
  if (typeof window === "undefined") return "fast";
  try {
    return window.localStorage.getItem(MODE_STORAGE_KEY) === "expert" ? "expert" : "fast";
  } catch {
    return "fast"; // 隐私模式/禁用存储:回落默认
  }
}

let state: ReadingAiState = { open: false, items: [], running: false, unconfigured: false, mode: initialMode() };
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<ReadingAiState>) {
  state = { ...state, ...patch };
  notify();
}

export function subscribeReadingAi(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getReadingAiSnapshot(): ReadingAiState {
  return state;
}

// 服务端快照:useSyncExternalStore 在 SSR 下必须有 getServerSnapshot,否则整树回退
// 客户端渲染(报 "Missing getServerSnapshot")。面板初始关闭、无历史,直接返回同一
// 模块级 state 即可(服务端永不变更它)。
export function getReadingAiServerSnapshot(): ReadingAiState {
  return state;
}

// 打开面板的同时收起移动端目录抽屉(两者都是全屏浮层,不允许叠开)。
function dismissTocDrawer() {
  document.body.classList.remove("book-toc-open");
}

let lastInvoker: HTMLElement | null = null;

export function openReadingAi(invoker?: HTMLElement | null) {
  if (invoker) lastInvoker = invoker;
  if (state.open) return;
  dismissTocDrawer();
  setState({ open: true });
}

export function closeReadingAi() {
  abortRunning();
  setState({ open: false });
  // 焦点还给触发按钮(无障碍);元素可能已随路由卸载,判空。
  if (lastInvoker?.isConnected) lastInvoker.focus();
  lastInvoker = null;
}

export function toggleReadingAi(invoker?: HTMLElement | null) {
  if (state.open) closeReadingAi();
  else openReadingAi(invoker);
}

// —— 流式请求状态机(dock 组件调用) ——

let itemSeq = 0;

export function startReadingAiItem(input: { kind: ReadingAiAction; label: string; quote?: string; cachedText?: string }): ReadingAiItem {
  itemSeq += 1;
  const item: ReadingAiItem = {
    id: `ai-${Date.now()}-${itemSeq}`,
    kind: input.kind,
    label: input.label,
    quote: input.quote,
    text: input.cachedText ?? "",
    status: input.cachedText ? "done" : "streaming",
    cached: Boolean(input.cachedText),
  };
  setState({ items: [item, ...state.items], running: !input.cachedText });
  return item;
}

let pendingDeltas = new Map<string, string>();
let flushTimer: number | undefined;

function scheduleFlush() {
  if (flushTimer !== undefined) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = undefined;
    const updates = pendingDeltas;
    pendingDeltas = new Map();
    if (updates.size === 0) return;
    setState({
      items: state.items.map((item) => {
        const chunk = updates.get(item.id);
        return chunk ? { ...item, text: item.text + chunk } : item;
      }),
    });
  }, 60);
}

export function appendReadingAiDelta(id: string, delta: string) {
  pendingDeltas.set(id, (pendingDeltas.get(id) ?? "") + delta);
  scheduleFlush();
}

export function finishReadingAiItem(id: string) {
  // 把尚未 flush 的尾巴并入,再落定状态。
  const tail = pendingDeltas.get(id);
  pendingDeltas.delete(id);
  setState({
    running: false,
    items: state.items.map((item) =>
      item.id === id ? { ...item, text: item.text + (tail ?? ""), status: "done" as const } : item,
    ),
  });
}

export function failReadingAiItem(id: string, errorCode: string) {
  const tail = pendingDeltas.get(id);
  pendingDeltas.delete(id);
  if (errorCode === "ai_not_configured") setUnconfigured();
  setState({
    running: false,
    items: state.items.map((item) =>
      item.id === id
        ? { ...item, text: item.text + (tail ?? ""), status: "error" as const, errorCode }
        : item,
    ),
  });
}

export function removeReadingAiItem(id: string) {
  setState({ items: state.items.filter((item) => item.id !== id) });
}

export function clearReadingAiItems() {
  setState({ items: [] });
}

export function setUnconfigured() {
  if (!state.unconfigured) setState({ unconfigured: true });
}

export function setReadingAiMode(mode: ReadingAiMode) {
  if (state.mode === mode) return;
  setState({ mode });
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    /* 存储不可用:仅本次会话内生效 */
  }
}

// —— 单飞 abort:新请求顶掉旧请求 / 关面板中止在途请求 ——

let activeController: AbortController | null = null;

export function registerAbortController(controller: AbortController) {
  activeController?.abort();
  activeController = controller;
}

export function abortRunning() {
  activeController?.abort();
  activeController = null;
}
