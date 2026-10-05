"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";

// 确认/拒绝两键。confirm 成功后桌面端下一次轮询(≤2s)即拿到会话并自动进入,
// 本页只负责把状态讲清楚;qr_expired 提示重扫,其余错误统一模糊文案。
const ERROR_TEXT: Record<string, string> = {
  qr_expired: "二维码已过期。请在桌面端刷新登录页后重新扫码。",
  qr_invalid: "这个登录请求无效或已被使用，请重新扫码。",
  login_required: "登录状态已变化，请刷新本页后再试。",
  rate_limited: "操作太频繁，请稍等几分钟再试。",
};

export function QrConfirmForm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "ok">("idle");
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setState("busy");
    setError(null);
    try {
      const response = await fetch("/api/auth/qr/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json().catch(() => null) as { status?: string; error?: string } | null;
      if (response.ok && result?.status === "ok") {
        setState("ok");
        return;
      }
      setError(ERROR_TEXT[result?.error ?? ""] ?? "确认没有完成，请重试。");
      setState("idle");
    } catch {
      setError("网络异常，请重试。");
      setState("idle");
    }
  }

  if (state === "ok") {
    return (
      <div className="qr-confirm-done">
        <ShieldCheck size={26} aria-hidden />
        <p>已确认。回到桌面端，它会自动进入造场。</p>
      </div>
    );
  }
  return (
    <div className="qr-confirm-actions">
      <button className="primary-action" type="button" disabled={state === "busy"} onClick={confirm}>
        {state === "busy" ? "确认中…" : "确认登录"}
      </button>
      <button className="text-action" type="button" disabled={state === "busy"} onClick={() => window.history.back()}>
        取消
      </button>
      {error && <p className="qr-confirm-error" role="alert">{error}</p>}
    </div>
  );
}
