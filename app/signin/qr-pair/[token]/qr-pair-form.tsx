"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";

// 反向配对三拍:输配对码 → pair ok → claim 轮询等桌面端「允许」→ ok 后本响应
// 已 Set-Cookie,整页进造场。错码/过期/被拒都有确定性文案。
const CLAIM_INTERVAL_MS = 2000;

const PAIR_ERROR: Record<string, string> = {
  pair_code_invalid: "配对码不对。请对照桌面端屏幕上的 6 位数字。",
  qr_expired: "邀请已过期。请在桌面端重新生成二维码。",
  qr_invalid: "这个邀请无效或已被使用,请在桌面端重新生成。",
  rate_limited: "操作太频繁,请稍等几分钟再试。",
};

export function QrPairForm({ token }: { token: string }) {
  const [stage, setStage] = useState<"code" | "waiting" | "ok">("code");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const roundRef = useRef(0);

  // claim 轮询:仅 waiting 阶段跑;组件卸载或换轮即停。
  useEffect(() => {
    if (stage !== "waiting") return;
    const round = roundRef.current;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      const response = await fetch("/api/auth/qr/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json().catch(() => null) as { status?: string } | null;
      if (cancelled || roundRef.current !== round || !result?.status) return;
      if (result.status === "ok") {
        setStage("ok");
        window.location.assign("/");
      } else if (result.status === "pairing" || result.status === "pair_requested") {
        // 继续等桌面端
      } else {
        setStage("code");
        setError(PAIR_ERROR[result.status === "taken" ? "qr_invalid" : result.status] ?? PAIR_ERROR.qr_invalid);
      }
    }, CLAIM_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [stage, token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/qr/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, code: code.replace(/\D/g, "") }),
      });
      const result = await response.json().catch(() => null) as { status?: string; error?: string } | null;
      if (response.ok && result?.status === "ok") {
        roundRef.current += 1;
        setStage("waiting");
        return;
      }
      setError(PAIR_ERROR[result?.error ?? ""] ?? "验证没有完成,请重试。");
    } catch {
      setError("网络异常,请重试。");
    } finally {
      setBusy(false);
    }
  }

  if (stage === "ok") {
    return (
      <div className="qr-confirm-done">
        <ShieldCheck size={26} aria-hidden />
        <p>桌面端已允许,正在进入造场…</p>
      </div>
    );
  }
  if (stage === "waiting") {
    return (
      <div className="qr-confirm-done">
        <ShieldCheck size={26} aria-hidden />
        <p>配对码正确。桌面端确认后这里会自动进入造场。</p>
        <button
          className="text-action"
          type="button"
          onClick={() => {
            roundRef.current += 1;
            setStage("code");
          }}
        >
          返回重输
        </button>
      </div>
    );
  }
  return (
    <form className="qr-pair-form" onSubmit={submit}>
      <input
        className="qr-pair-input"
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        placeholder="000 000"
        aria-label="桌面端配对码"
        required
      />
      <button className="primary-action" type="submit" disabled={busy || code.length !== 6}>
        {busy ? "验证中…" : "验证配对码"}
      </button>
      {error && <p className="qr-confirm-error" role="alert">{error}</p>}
    </form>
  );
}
