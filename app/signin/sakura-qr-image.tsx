"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import QRCode from "qrcode";
import {
  SAKURA_QR_ERROR_CORRECTION,
  buildSakuraScene,
  drawSakuraQr,
  sakuraPetals,
  type SakuraPetal,
  type SakuraScene,
} from "../lib/sakura-qr";

// 登录二维码(正向桌面面板 + 反向邀请面板)共用:本地生成模块矩阵 → 体素樱花树场景,
// token 不经过任何第三方图床。默认是一棵树;点一下相机转到正上方,树顶拼成可扫的平面码。
export type SakuraQrArt = { scene: SakuraScene; petals: SakuraPetal[] };

export function sakuraQrArt(url: string): SakuraQrArt {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: SAKURA_QR_ERROR_CORRECTION });
  const scene = buildSakuraScene(modules);
  return { scene, petals: sakuraPetals(scene) };
}

type View = "tree" | "flat" | "plain";

// 只记本机偏好(选过平面码/普通码的人刷新后不用再点一次);读写失败按默认的树处理。
const VIEW_KEY = "zaochang.qr-view";
const TURN_MS = 1100;

function savedView(): View {
  try {
    const value = window.localStorage.getItem(VIEW_KEY);
    return value === "flat" || value === "plain" ? value : "tree";
  } catch {
    return "tree";
  }
}

export function SakuraQrImage({ art }: { art: SakuraQrArt }) {
  const [view, setView] = useState<View>(savedView);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 相机进度:0 = 树,1 = 正上方。跨渲染保留,反向点击时从当前位置折返。
  const progressRef = useRef(view === "tree" ? 0 : 1);
  const lastViewRef = useRef(view);

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_KEY, view);
    } catch {
      // 隐私模式等:不记偏好
    }
  }, [view]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const palette = view === "plain" ? "plain" : "sakura";
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const width = Math.round(canvas.clientWidth * dpr);
      const height = Math.round(canvas.clientHeight * dpr);
      if (!width || !height) return;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      drawSakuraQr(ctx, art.scene, progressRef.current, width, height, palette);
    };

    const target = view === "tree" ? 0 : 1;
    const from = progressRef.current;
    const jump = view === "plain" || lastViewRef.current === "plain"
      || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    lastViewRef.current = view;
    let frame = 0;
    if (jump || from === target) {
      progressRef.current = target;
      draw();
    } else {
      const start = performance.now();
      const duration = TURN_MS * Math.abs(target - from);
      const step = (now: number) => {
        const u = Math.min(1, (now - start) / duration);
        progressRef.current = from + (target - from) * u;
        draw();
        if (u < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }

    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [art, view]);

  const turn = () => setView((value) => (value === "tree" ? "flat" : "tree"));
  const label = view === "tree" ? "樱花树二维码,点击查看平面码" : view === "flat" ? "平面二维码,点击变回一棵树" : "普通二维码";
  const canvas = <canvas ref={canvasRef} className="sakura-qr-canvas" role="img" aria-label={label} />;

  return (
    <div className={`auth-qr-image sakura-qr is-${view}`}>
      {view === "plain" ? (
        <div className="sakura-qr-stage">{canvas}</div>
      ) : (
        <button type="button" className="sakura-qr-stage" onClick={turn} aria-label={label}>
          {canvas}
          {view === "tree" && art.petals.map((petal, index) => (
            <i
              key={index}
              aria-hidden
              className={`sakura-qr-petal is-tone-${petal.tone}`}
              style={{
                animationDelay: `${petal.delay.toFixed(2)}s`,
                animationDuration: `${petal.duration.toFixed(2)}s`,
                left: `${petal.left.toFixed(2)}%`,
                top: `${petal.top.toFixed(2)}%`,
                "--drift": `${petal.drift.toFixed(2)}cqw`,
                "--fall": `${petal.fall.toFixed(2)}cqw`,
              } as CSSProperties}
            />
          ))}
        </button>
      )}
      <div className="sakura-qr-switch">
        {view !== "plain" && (
          <button type="button" onClick={turn}>{view === "tree" ? "点击查看平面码" : "点击变回一棵树"}</button>
        )}
        <button type="button" onClick={() => setView((value) => (value === "plain" ? "tree" : "plain"))}>
          {view === "plain" ? "改回樱花树" : "改用普通二维码"}
        </button>
      </div>
    </div>
  );
}
