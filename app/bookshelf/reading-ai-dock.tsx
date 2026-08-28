"use client";

// 「问 AI」dock:桌面(≥1100px)为非模态右侧面板,移动端(<1100px)为底部抽屉,
// 同一 DOM 由 CSS 形态切换。入口三处:右栏按钮(≥1440px)、右缘竖排 rail(1100~1439px)、
// 浮动胶囊(<1100px)——rail/pill 由本组件渲染,右栏按钮在 chapter-aside.tsx。
//
// 流式协议:POST /api/ai/reading → SSE(delta/done/error 事件,见路由注释)。
// 客户端用 fetch + reader 手解帧(EventSource 不能 POST);TextDecoder(stream:true)
// + 半帧缓冲处理跨 chunk 断行/断多字节。

import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, Loader2, Send, Sparkles, Trash2, X } from "lucide-react";
import type { ReadingAiAction, ReadingAiMode } from "../api/_lib/reading-ai-prompts";
import { renderMarkdownKatexHtml } from "@/app/lib/markdown-katex";
import {
  abortRunning,
  appendReadingAiDelta,
  closeReadingAi,
  failReadingAiItem,
  finishReadingAiItem,
  getReadingAiServerSnapshot,
  getReadingAiSnapshot,
  registerAbortController,
  removeReadingAiItem,
  setReadingAiMode,
  startReadingAiItem,
  subscribeReadingAi,
  toggleReadingAi,
} from "./reading-ai-store";

type Props = {
  bookSlug: string;
  path: string[];
  bookTitle: string;
  chapterTitle: string;
  docId: string;
  updatedAt: string;
};

const ACTION_LABELS: Record<ReadingAiAction, string> = {
  explain: "解释",
  translate: "翻译",
  summary: "本章小结",
  ask: "提问",
};

// 模式只向用户展示这两个标签;真实模型名在服务端 env,客户端拿不到也渲染不出。
const MODE_LABELS: Record<ReadingAiMode, string> = { fast: "快速", expert: "专家" };
const MODE_HINTS: Record<ReadingAiMode, string> = { fast: "秒回,适合随手查", expert: "更深,适合啃难点" };

// 回答正文:markdown + KaTeX(与书籍正文同一条渲染管线,见 @/app/lib/markdown-katex)。
// 流式期间每 60ms flush 触发一次全量重渲染——回答 ≤ 几 KB,开销可忽略;未闭合的 $
// 保持字面显示(KaTeX throwOnError:false 容错)。memo 化避免面板开合时重渲染全部历史项。
const AnswerHtml = memo(function AnswerHtml({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdownKatexHtml(text), [text]);
  // 管线已做 sanitize 白名单消毒(禁行内原始 HTML/脚本),与书籍正文同一安全边界。
  return <div className="reading-ai-item-text" dangerouslySetInnerHTML={{ __html: html }} />;
});

// 提问附图:客户端 canvas 压缩(长边 ≤1600、webp q0.85)后以 data URL 内联随提问发送,
// 不经 /api/uploads 存储管道——附图是瞬态输入,只回显给提问者本人。
const IMAGE_MAX_EDGE = 1600;
const IMAGE_MAX_DATAURL_CHARS = 4_700_000; // ≈3.5 MiB base64,留足服务端 4 MiB 解码上限余量

async function prepareImageDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("unsupported_type");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no_canvas");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/webp", 0.85);
    if (!dataUrl.startsWith("data:image/")) throw new Error("encode_failed");
    if (dataUrl.length > IMAGE_MAX_DATAURL_CHARS) throw new Error("too_large");
    return dataUrl;
  } finally {
    bitmap.close();
  }
}

// summary 的会话级缓存:同章节同模式未重编辑(updatedAt 键)直接复用,零后端。
function summaryCacheKey(docId: string, updatedAt: string, mode: ReadingAiMode) {
  return `reading-ai:s:${mode}:${docId}:${updatedAt}`;
}

function readSummaryCache(docId: string, updatedAt: string, mode: ReadingAiMode): string | null {
  try {
    const value = sessionStorage.getItem(summaryCacheKey(docId, updatedAt, mode));
    return value && value.length > 0 ? value : null;
  } catch {
    return null; // sessionStorage 不可用(隐私模式等)时静默降级为不缓存
  }
}

function writeSummaryCache(docId: string, updatedAt: string, mode: ReadingAiMode, text: string) {
  try {
    sessionStorage.setItem(summaryCacheKey(docId, updatedAt, mode), text);
  } catch {
    /* 配额满/不可用,忽略 */
  }
}

export function ReadingAiDock(props: Props) {
  const state = useSyncExternalStore(subscribeReadingAi, getReadingAiSnapshot, getReadingAiServerSnapshot);
  const [bubble, setBubble] = useState<{ top: number; left: number; selection: string } | null>(null);
  const [question, setQuestion] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const invokerRef = useRef<HTMLElement | null>(null);
  const bubbleAnchorRef = useRef<HTMLElement | null>(null);

  // —— 划词气泡(桌面):mouseup 后 selection 落在 .docs-body 内则在选区上方弹出 ——

  const dismissBubble = useCallback(() => setBubble(null), []);

  useEffect(() => {
    if (window.matchMedia("(max-width: 1099px)").matches) return; // 移动端无气泡
    const onSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) setBubble(null);
    };
    const onMouseUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      const text = selection.toString().trim();
      if (text.length < 2) return;
      const anchor = selection.anchorNode;
      const body = document.querySelector(".docs-body");
      if (!anchor || !body || !(anchor.nodeType === 1 ? (anchor as Element) : anchor.parentElement)?.closest(".docs-body")) return;
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      bubbleAnchorRef.current = body as HTMLElement;
      setBubble({
        top: Math.max(64, rect.top - 44 + window.scrollY),
        left: Math.min(Math.max(12, rect.left + rect.width / 2 - 70), window.innerWidth - 152) + window.scrollX,
        selection: text,
      });
    };
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("scroll", dismissBubble, { passive: true });
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("scroll", dismissBubble);
    };
  }, [dismissBubble]);

  // —— Escape 关闭(克隆 book-side-toggle 模式)——

  useEffect(() => {
    if (!state.open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeReadingAi();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.open]);

  // 开面板时焦点入面板;关闭时 store 已把焦点还给触发按钮。
  useEffect(() => {
    if (state.open) headingRef.current?.focus();
  }, [state.open]);

  // 卸载(路由切换)时中止在途流,避免跨页面的孤儿请求继续烧 token。
  useEffect(() => () => abortRunning(), []);

  // —— 请求生命周期 ——

  const runAction = useCallback(
    async (kind: ReadingAiAction, payload: { selection?: string; question?: string; image?: string }) => {
      setHint("");
      const mode = state.mode;
      if (kind === "summary") {
        const cached = readSummaryCache(props.docId, props.updatedAt, mode);
        if (cached) {
          startReadingAiItem({ kind, label: ACTION_LABELS[kind], cachedText: cached });
          if (!state.open) toggleReadingAi();
          return;
        }
      }
      const item = startReadingAiItem({
        kind,
        label: ACTION_LABELS[kind],
        quote: payload.selection ? payload.selection.slice(0, 120) : payload.question?.slice(0, 120),
        // 完整原文单独留存:重试必须按原始输入重发,截断的 quote 只用于展示。
        selection: payload.selection,
        question: payload.question,
        image: payload.image,
      });
      if (!state.open) toggleReadingAi();
      const controller = new AbortController();
      registerAbortController(controller);
      try {
        const response = await fetch("/api/ai/reading", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: kind,
            bookSlug: props.bookSlug,
            path: props.path,
            selection: payload.selection,
            question: payload.question,
            image: payload.image,
            mode,
          }),
          signal: controller.signal,
        });
        if (response.status === 401) {
          failReadingAiItem(item.id, "auth_required");
          window.location.assign(`/signin?return_to=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          failReadingAiItem(item.id, body?.error ?? `http_${response.status}`);
          return;
        }
        const reader = response.body?.getReader();
        if (!reader) {
          failReadingAiItem(item.id, "ai_upstream_error");
          return;
        }
        const decoder = new TextDecoder();
        let buffer = "";
        let assembled = "";
        // 帧分隔容错 CRLF:中间代理可能把 LF 归一成 CRLF,只认 "\n\n" 会整体丢帧。
        const FRAME_SEPARATOR = /(?:\r?\n){2}/;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let split = FRAME_SEPARATOR.exec(buffer);
          while (split) {
            const frame = buffer.slice(0, split.index);
            buffer = buffer.slice(split.index + split[0].length);
            split = FRAME_SEPARATOR.exec(buffer);
            const eventLine = frame.split(/\r?\n/).find((line) => line.startsWith("event:"));
            const dataLine = frame.split(/\r?\n/).find((line) => line.startsWith("data:"));
            if (!eventLine || !dataLine) continue;
            const event = eventLine.slice(6).trim();
            let data: Record<string, unknown> = {};
            try {
              data = JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>;
            } catch {
              continue;
            }
            if (event === "delta" && typeof data.t === "string") {
              assembled += data.t;
              appendReadingAiDelta(item.id, data.t);
            } else if (event === "done") {
              if (kind === "summary" && assembled) writeSummaryCache(props.docId, props.updatedAt, mode, assembled);
              finishReadingAiItem(item.id);
              return;
            } else if (event === "error") {
              failReadingAiItem(item.id, typeof data.error === "string" ? data.error : "ai_upstream_error");
              return;
            }
          }
        }
        // 流意外收尾(无 done 帧):有内容则视为完成,否则报错。
        if (assembled) finishReadingAiItem(item.id);
        else failReadingAiItem(item.id, "ai_upstream_error");
      } catch (error) {
        if (controller.signal.aborted) {
          removeReadingAiItem(item.id); // 用户主动关闭/新请求顶掉:静默撤下
          return;
        }
        failReadingAiItem(item.id, error instanceof Error ? "network_error" : "ai_upstream_error");
      }
    },
    [props.bookSlug, props.path, props.docId, props.updatedAt, state.open, state.mode],
  );

  const submitQuestion = useCallback(() => {
    const text = question.trim().slice(0, 500);
    if (text.length < 2) {
      setHint("问题太短,再补充一些");
      return;
    }
    const attached = image ?? undefined;
    setQuestion("");
    setImage(null);
    void runAction("ask", { question: text, image: attached });
  }, [question, image, runAction]);

  const attachImage = useCallback(async (file: File) => {
    setHint("");
    try {
      setImage(await prepareImageDataUrl(file));
    } catch {
      setHint("仅支持 PNG/JPEG/WebP 图片,体积不能太大");
    }
  }, []);

  const handleSelectionAction = useCallback(
    (kind: ReadingAiAction) => {
      // 使用气泡创建时捕获的选区文本(bubble.selection),不重读 live selection:
      // 按下气泡按钮的 mousedown 默认行为会清除文档选区(Chrome/Edge/Firefox),
      // 点击瞬间重读必得空串——划词功能因此在主流桌面浏览器上整体失效。
      const text = bubble?.selection ?? "";
      if (text.length < 2) {
        setHint("先选中一段文字");
        dismissBubble();
        return;
      }
      dismissBubble();
      window.getSelection()?.removeAllRanges();
      void runAction(kind, { selection: text.slice(0, 2000) });
    },
    [bubble, runAction, dismissBubble],
  );

  const openPanel = (event: React.MouseEvent<HTMLButtonElement>) => {
    invokerRef.current = event.currentTarget;
    toggleReadingAi(event.currentTarget);
  };

  // 浮层经 portal 挂到 body:.deep-route-content 的路由过渡动画会残留 filter:blur(0px)
  // (framer-motion 终态),任何非 none 的 filter 都会成为 fixed 后代的 containing block,
  // 把 rail/panel 困在正文容器里(site-shell.tsx:294;目录抽屉注释记录过同类陷阱)。
  // SSR 阶段(portalHost 为 null)渲染一个隐藏占位:既是挂载锚点,也让 SSR HTML 含
  // reading-ai-dock 标记(集成测试用它断言 dock 已随章节页挂载)。
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const host = document.body;
    // effect 内异步一帧 setState:避开 react-hooks/set-state-in-effect 的级联渲染警告
    const id = window.setTimeout(() => setPortalHost(host), 0);
    return () => window.clearTimeout(id);
  }, []);

  if (!portalHost) {
    return <span className="reading-ai-dock" style={{ display: "none" }} aria-hidden="true" />;
  }
  return createPortal(
    <>
      {/* 1100~1439px:右栏隐藏,右缘竖排 rail 作为入口 */}
      <button type="button" className="reading-ai-rail" onClick={openPanel} aria-label="问 AI">
        ✦ 问 AI
      </button>
      {/* <1100px:浮动胶囊入口(避开底部导航) */}
      <button type="button" className="reading-ai-pill" onClick={openPanel} aria-label="问 AI">
        <Sparkles size={14} /> 问 AI
      </button>

      {state.open && <button type="button" className="reading-ai-backdrop" onClick={() => closeReadingAi()} aria-label="关闭问 AI" />}

      <div className={`reading-ai-panel${state.open ? " open" : ""}`} ref={panelRef} role="complementary" aria-label="问 AI 助手">
        <header className="reading-ai-head">
          <h2 ref={headingRef} tabIndex={-1}>✦ 问 AI</h2>
          <button type="button" className="reading-ai-close" onClick={() => closeReadingAi()} aria-label="关闭">
            <X size={15} />
          </button>
        </header>

        {state.unconfigured && (
          <p className="reading-ai-unconfigured">阅读助手尚未配置,暂时不可用。</p>
        )}

        <div className="reading-ai-items">
          {state.items.length === 0 && !state.unconfigured && (
            <p className="reading-ai-empty">选中正文可解释或翻译;也可以直接提问。</p>
          )}
          {state.items.map((item) => (
            <article key={item.id} className={`reading-ai-item ${item.status}`}>
              <header className="reading-ai-item-head">
                <span className="reading-ai-item-label">{item.label}</span>
                {item.cached && <span className="reading-ai-item-chip">本次会话缓存</span>}
                <button
                  type="button"
                  className="reading-ai-item-retry"
                  onClick={() => {
                    removeReadingAiItem(item.id);
                    // 重试按原始输入重发:ask 带完整问题(发 selection 会被路由以
                    // missing_question 拒绝),划词类带完整选区。
                    if (item.kind === "summary") void runAction("summary", {});
                    else if (item.kind === "ask" && item.question) void runAction("ask", { question: item.question });
                    else if (item.selection) void runAction(item.kind, { selection: item.selection });
                    else setHint("原始输入已缺失，请重新发起");
                  }}
                  aria-label="重试"
                >
                  重试
                </button>
                <button type="button" className="reading-ai-item-remove" onClick={() => removeReadingAiItem(item.id)} aria-label="删除">
                  <Trash2 size={12} />
                </button>
              </header>
              {item.quote && <blockquote className="reading-ai-item-quote">{item.quote}</blockquote>}
              {item.image && <img className="reading-ai-item-image" src={item.image} alt="提问附图" />}
              <AnswerHtml text={item.text} />
              {item.status === "streaming" && <span className="reading-ai-cursor" aria-hidden="true" />}
              {item.status === "error" && (
                <p className="reading-ai-item-error">
                  {item.errorCode === "rate_limit_exceeded"
                    ? "请求太频繁,稍后再试"
                    : item.errorCode === "ai_not_configured"
                      ? "助手尚未配置"
                      : item.errorCode === "auth_required"
                        ? "请先登录"
                        : item.errorCode === "vision_not_supported"
                          ? "当前模型不支持看图"
                          : item.errorCode === "invalid_image"
                            ? "图片格式或体积不支持"
                            : "生成失败,请重试"}
                </p>
              )}
            </article>
          ))}
        </div>

        <footer className="reading-ai-foot">
          {hint && <p className="reading-ai-hint">{hint}</p>}
          <div className="reading-ai-toolbar">
            <div className="reading-ai-mode" role="group" aria-label="回答模式">
              {(Object.keys(MODE_LABELS) as ReadingAiMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={state.mode === m ? "on" : ""}
                  aria-pressed={state.mode === m}
                  title={MODE_HINTS[m]}
                  onClick={() => setReadingAiMode(m)}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
            <div className="reading-ai-quick">
              <button type="button" disabled={state.running || state.unconfigured} onClick={() => void runAction("summary", {})}>
                本章小结
              </button>
            </div>
          </div>
          <div className="reading-ai-ask">
            {image && (
              <div className="reading-ai-attach">
                <img src={image} alt="附图预览" />
                <button type="button" onClick={() => setImage(null)} aria-label="移除附图">
                  <X size={12} />
                </button>
              </div>
            )}
            <div className="reading-ai-ask-row">
              <textarea
                value={question}
                maxLength={500}
                rows={2}
                placeholder="针对本章提问…"
                onChange={(event) => setQuestion(event.target.value)}
                onPaste={(event) => {
                  const items = event.clipboardData?.items;
                  if (!items) return;
                  for (const clipItem of items) {
                    if (clipItem.type.startsWith("image/")) {
                      const file = clipItem.getAsFile();
                      if (file) {
                        event.preventDefault();
                        void attachImage(file);
                      }
                      return;
                    }
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    submitQuestion();
                  }
                }}
              />
              <button type="button" disabled={state.running || state.unconfigured} onClick={submitQuestion} aria-label="发送提问">
                {state.running ? <Loader2 size={15} className="reading-ai-spin" /> : <Send size={15} />}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void attachImage(file);
              }}
            />
            <button
              type="button"
              className="reading-ai-attach-btn"
              disabled={state.running || state.unconfigured}
              onClick={() => fileInputRef.current?.click()}
              title="附加图片(也可直接粘贴截图)"
            >
              <ImagePlus size={13} /> 附加图片
            </button>
          </div>
        </footer>
      </div>

      {bubble && (
        <div
          className="reading-ai-bubble"
          style={{ top: bubble.top, left: bubble.left }}
          // preventDefault:挡住按下按钮时浏览器清除文档选区的默认行为,
          // 保住选区(selectionchange 不再把气泡卸载)。
          onMouseDown={(event) => event.preventDefault()}
        >
          <button type="button" onClick={() => handleSelectionAction("explain")}>解释</button>
          <button type="button" onClick={() => handleSelectionAction("translate")}>翻译</button>
        </div>
      )}
    </>,
    portalHost,
  );
}
