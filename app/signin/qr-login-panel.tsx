"use client";

import { useEffect, useRef, useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import QRCode from "qrcode";

// 桌面端扫码登录面板:发起 QR 会话 → 本地渲染 SVG QR(token 不经过任何第三方
// 图床)→ 2 秒轮询。会话由 poll 响应的 Set-Cookie 下发(与 GitHub/邮箱码/passkey
// 同一管线),拿到 ok 后整页跳 return_to。二维码 2 分钟过期,过期自动换新码;
// "taken" 表示该码已在别处消费(多标签页/重放),提示后停止轮询。
// 生命周期:effect 只按 [returnTo, round] 跑一轮(round +1 = 换新码),phase 是
// 轮内的展示状态,不进依赖——否则 setPhase 会自激重扫。
type Phase = "loading" | "watching" | "done" | "taken" | "unavailable";

const POLL_INTERVAL_MS = 2000;

export function QrLoginPanel({ returnTo }: { returnTo: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [round, setRound] = useState(0);
  const roundRef = useRef(round);

  useEffect(() => {
    roundRef.current = round;
    let cancelled = false;
    let pollTimer: number | null = null;

    async function runSession() {
      setPhase("loading");
      setQrSvg(null);
      const startResponse = await fetch("/api/auth/qr/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ return_to: returnTo }),
      });
      const start = await startResponse.json().catch(() => null) as {
        url?: string;
        token?: string;
        expiresIn?: number;
      } | null;
      if (cancelled || roundRef.current !== round) return;
      if (!startResponse.ok || !start?.url || typeof start.token !== "string") {
        setPhase("unavailable");
        return;
      }
      const svg = await QRCode.toString(start.url, {
        type: "svg",
        margin: 1,
        width: 208,
        color: { dark: "#171816", light: "#0000" },
      });
      if (cancelled || roundRef.current !== round) return;
      setQrSvg(svg);
      setSecondsLeft(start.expiresIn ?? 120);
      setPhase("watching");

      pollTimer = window.setInterval(async () => {
        const pollResponse = await fetch("/api/auth/qr/poll", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: start.token }),
        });
        const poll = await pollResponse.json().catch(() => null) as {
          status?: string;
          return_to?: string;
          expiresIn?: number;
        } | null;
        if (cancelled || roundRef.current !== round || !poll?.status) return;
        if (poll.status === "pending") {
          setSecondsLeft(poll.expiresIn ?? 0);
          return;
        }
        if (pollTimer !== null) window.clearInterval(pollTimer);
        if (poll.status === "ok") {
          setPhase("done");
          window.location.assign(poll.return_to || returnTo || "/");
        } else if (poll.status === "expired") {
          setRound((value) => value + 1);
        } else {
          setPhase("taken");
        }
      }, POLL_INTERVAL_MS);
    }

    runSession();
    return () => {
      cancelled = true;
      if (pollTimer !== null) window.clearInterval(pollTimer);
    };
  }, [returnTo, round]);

  if (phase === "loading") {
    return (
      <div className="auth-qr-panel">
        <div className="auth-qr-frame"><div className="auth-qr-placeholder">正在生成…</div></div>
      </div>
    );
  }
  if (phase === "done") {
    return (
      <div className="auth-qr-panel is-done">
        <MonitorSmartphone size={22} aria-hidden />
        <p>已确认，正在进入造场…</p>
      </div>
    );
  }
  if (phase === "taken") {
    return (
      <div className="auth-qr-panel is-done">
        <MonitorSmartphone size={22} aria-hidden />
        <p>这个码已被使用。如果这不是你的操作，请忽略。</p>
        <button className="text-action" type="button" onClick={() => setRound((value) => value + 1)}>重新生成二维码</button>
      </div>
    );
  }
  if (phase === "unavailable") {
    return (
      <div className="auth-qr-panel is-done">
        <MonitorSmartphone size={22} aria-hidden />
        <p>扫码登录暂时不可用（可能发起太频繁），请稍后再试或改用其它登录方式。</p>
        <button className="text-action" type="button" onClick={() => setRound((value) => value + 1)}>重试</button>
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
      <p className="auth-qr-caption">
        {secondsLeft > 0 ? `用造场 App 或系统相机扫一扫 · ${secondsLeft}s 后自动刷新` : "即将刷新…"}
      </p>
    </div>
  );
}
