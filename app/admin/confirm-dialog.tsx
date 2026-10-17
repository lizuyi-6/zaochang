"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export type ConfirmRequest = {
  title: string;
  target: string;
  consequence: string;
  submit: (reason: string) => Promise<void>;
};

export function AdminConfirmDialog({ request, busy, onClose }: {
  request: ConfirmRequest | null;
  busy: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!request) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    reasonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), textarea:not(:disabled)");
      if (!items?.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus.current?.focus();
      setReason("");
    };
  }, [request, busy, onClose]);

  if (!request) return null;
  const validReason = reason.trim().length >= 4;
  return (
    <div className="admin-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div className="admin-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-confirm-title" ref={dialogRef}>
        <header>
          <h2 id="admin-confirm-title">{request.title}</h2>
          <button type="button" className="admin-icon-button" onClick={onClose} disabled={busy} aria-label="关闭确认框"><X size={17} /></button>
        </header>
        <dl>
          <div><dt>目标</dt><dd>{request.target}</dd></div>
          <div><dt>后果</dt><dd>{request.consequence}</dd></div>
        </dl>
        <label className="admin-confirm-reason">
          操作理由（至少 4 个字）
          <textarea ref={reasonRef} value={reason} onChange={(event) => setReason(event.target.value)} minLength={4} maxLength={500} required />
        </label>
        <footer className="admin-confirm-actions">
          <button type="button" onClick={onClose} disabled={busy}>取消</button>
          <button type="button" className="admin-danger-button" onClick={() => { if (validReason) void request.submit(reason.trim()); }} disabled={!validReason || busy}>
            {busy ? "正在提交…" : "确认操作"}
          </button>
        </footer>
      </div>
    </div>
  );
}
