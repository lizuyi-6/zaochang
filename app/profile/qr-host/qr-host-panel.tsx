"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { formatPairCode } from "../../api/_lib/qr-login-core";

// 宿主面板:发起 host 拿到 QR URL + 配对码 → 本地渲染 SVG → 轮询 host-state。
// pair_requested 时亮出「允许 / 拒绝」;允许后等手机 claim 完成(consumed→ok)。
// 两分钟过期自动换新码;hierarchy 与正向 QrLoginPanel 同纪律:effect 只按
// [round] 跑一轮,phase 不进依赖。
type Phase = "loading" | "watching" | "pairing" | "approved" | "done" | "unavailable";

const HOST_POLL_INTERVAL_MS = 2000;

export function QrHostPanel() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [round, setRound] = useState(0);
  const roundRef = useRef(round);
  // 当前会话 token(approve/deny 用);host 响应的 url 里含 token,存 ref 避免额外 state。
  const currentTokenRef = useRef("");

  useEffect(() => {
    roundRef.current = round;
    let cancelled = false;
    let pollTimer: number | null = null;

    async function runSession() {
      setPhase("loading");
      setQrSvg(null);
      setPairCode("");
      const hostResponse = await fetch("/api/auth/qr/host", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const host = await hostResponse.json().catch(() => null) as {
        url?: string;
        token?: string;
        pairCode?: string;
        expiresIn?: number;
      } | null;
      if (cancelled || roundRef.current !== round) return;
      if (!hostResponse.ok || !host?.url || typeof host.token !== "string" || typeof host.pairCode !== "string") {
        setPhase("unavailable");
        return;
      }
      currentTokenRef.current = host.token;
      const svg = await QRCode.toString(host.url, {
        type: "svg",
        margin: 1,
        width: 208,
        color: { dark: "#171816", light: "#0000" },
      });
      if (cancelled || roundRef.current !== round) return;
      setQrSvg(svg);
      setPairCode(host.pairCode);
      setSecondsLeft(host.expiresIn ?? 120);
      setPhase("watching");

      pollTimer = window.setInterval(async () => {
        const stateResponse = await fetch("/api/auth/qr/host-state", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: host.token }),
        });
        const state = await stateResponse.json().catch(() => null) as { status?: string } | null;
        if (cancelled || roundRef.current !== round || !state?.status) return;
        if (state.status === "pending") {
          setSecondsLeft((value) => Math.max(0, value - HOST_POLL_INTERVAL_MS / 1000));
          return;
        }
        if (state.status === "pair_requested") {
          setPhase((value) => (value === "pairing" ? value : "pairing"));
          return;
        }
        if (state.status === "ok") {
          if (pollTimer !== null) window.clearInterval(pollTimer);
          setPhase("done");
        } else {
          // expired:换个新码继续
          if (pollTimer !== null) window.clearInterval(pollTimer);
          setRound((value) => value + 1);
        }
      }, HOST_POLL_INTERVAL_MS);
    }

    runSession();
    return () => {
      cancelled = true;
      if (pollTimer !== null) window.clearInterval(pollTimer);
    };
  }, [round]);

  async function decide(decision: "allow" | "deny") {
    setPhase("loading");
    await fetch("/api/auth/qr/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: currentTokenRef.current, decision }),
    }).catch(() => null);
    if (decision === "deny") setRound((value) => value + 1);
    // allow 后 host-state 会轮询到 ok(done);立即置 approved 给出反馈。
    else setPhase("approved");
  }

  if (phase === "done") {
    return (
      <div className="auth-qr-panel is-done">
        <p>手机已进入造场。这条邀请已完成。</p>
        <button className="text-action" type="button" onClick={() => setRound((value) => value + 1)}>再邀请一台</button>
      </div>
    );
  }
  if (phase === "unavailable") {
    return (
      <div className="auth-qr-panel is-done">
        <p>发起太频繁,请几分钟后再试。</p>
        <button className="text-action" type="button" onClick={() => setRound((value) => value + 1)}>重试</button>
      </div>
    );
  }
  if (phase === "pairing") {
    return (
      <div className="auth-qr-panel is-done">
        <p>有手机已完成配对,请求登录你的账号。</p>
        <div className="qr-host-decide">
          <button className="primary-action" type="button" onClick={() => decide("allow")}>允许登录</button>
          <button className="text-action" type="button" onClick={() => decide("deny")}>拒绝</button>
        </div>
      </div>
    );
  }
  if (phase === "approved") {
    return (
      <div className="auth-qr-panel is-done">
        <p>已允许。手机确认后会自动进入造场。</p>
      </div>
    );
  }
  return (
    <div className="auth-qr-panel">
      <div className="auth-qr-frame" aria-live="polite">
        {qrSvg
          ? <div className="auth-qr-image" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          : <div className="auth-qr-placeholder">正在生成…</div>}
      </div>
      <div className="qr-host-code" aria-label="配对码">
        {phase === "watching" ? formatPairCode(pairCode) : "· · ·"}
      </div>
      <p className="auth-qr-caption">
        {phase === "watching"
          ? secondsLeft > 0 ? `手机扫码后输入此配对码 · ${secondsLeft}s 后自动刷新` : "即将刷新…"
          : "正在发起…"}
      </p>
    </div>
  );
}
