"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import { parseQrLoginUrl } from "../../../api/_lib/qr-login-core";

// 相机取帧 + jsQR 解码(纯 JS,任何内核可用;不依赖 BarcodeDetector 的
// Play Services 分发)。解码命中即校验同源登录码:合法 → 按方向跳确认/配对页;
// 不合法 → 提示并继续扫。相机资源在离开页面时确定性释放。
// 渲染纪律:<video> 只在真正拿到流之后才挂载——空 <video> 在多数国产
// 浏览器/WebView 内核里会渲染成巨大的播放按钮占位图,必须避免。
type ScannerState = "idle" | "starting" | "scanning" | "failed";

const SCAN_INTERVAL_MS = 150;

/** 造场 App(Android WebView)检测:WebView UA 含 "; wv)" 特征段。 */
function inAppWebview(): boolean {
  return /;\s*wv\)/i.test(navigator.userAgent);
}

function cameraErrorText(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") {
    // WebView 已知行为:页面 Permissions-Policy 允许 + 系统权限已授,
    // 首次授权当次取流仍可能被拒;重启进程后即恢复。
    if (inAppWebview()) {
      return "相机没有打开。请完全退出造场 App 后重新进入,再点一次「打开相机扫码」;或直接用系统相机扫码。";
    }
    return "相机权限被拒绝。请在系统/浏览器设置里允许使用相机;或直接用系统相机扫码后点开链接。";
  }
  if (name === "NotReadableError") return "相机被其它应用占用,请关闭后重试。";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "没有找到可用的摄像头。";
  return "相机启动失败,请重试或改用系统相机扫码。";
}

export function QrScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<ScannerState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const invalidShownRef = useRef(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  // 卸载时确定性释放相机。
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // 流就绪 → 挂载后的 video 元素接上并起播,然后开始解码循环。
  // (canvas/ctx 由 startScanning 在事件处理器里建好放入 ref;effect 体内不 setState。)
  useEffect(() => {
    if (!stream) return;
    const video = videoRef.current;
    const surface = canvasRef.current;
    if (!video || !surface) return;
    video.srcObject = stream;
    video.play().catch(() => {});
    const jsQRReady = import("jsqr").then((mod) => mod.default);
    const timer = window.setInterval(async () => {
      if (streamRef.current !== stream || video.readyState < 2 || !video.videoWidth) return;
      surface.canvas.width = video.videoWidth;
      surface.canvas.height = video.videoHeight;
      surface.ctx.drawImage(video, 0, 0);
      const image = surface.ctx.getImageData(0, 0, surface.canvas.width, surface.canvas.height);
      const jsQR = await jsQRReady;
      const found = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
      if (!found?.data) return;
      const parsed = parseQrLoginUrl(found.data, window.location.origin);
      if (parsed) {
        window.clearInterval(timer);
        stopCamera();
        window.location.assign(parsed.kind === "pair" ? `/signin/qr-pair/${parsed.token}` : `/signin/qr/${parsed.token}`);
        return;
      }
      if (!invalidShownRef.current) {
        invalidShownRef.current = true;
        setInvalid("这不是造场登录码。请扫描桌面端登录页上的二维码。");
      }
    }, SCAN_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [stream, stopCamera]);

  async function startScanning() {
    setState("starting");
    setError(null);
    setInvalid(null);
    invalidShownRef.current = false;
    // 先试后置摄像头;约束过严/无后置的设备回落任意摄像头。
    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      { video: true, audio: false },
    ];
    let stream: MediaStream | null = null;
    let lastError: unknown = null;
    for (const constraints of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (err) {
        lastError = err;
        const name = err instanceof DOMException ? err.name : "";
        if (name === "NotAllowedError") break; // 权限问题,换约束没有意义
      }
    }
    if (!stream) {
      setState("failed");
      setError(cameraErrorText(lastError));
      return;
    }
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      stream.getTracks().forEach((track) => track.stop());
      setState("failed");
      setError("当前环境不支持相机解码,请改用系统相机扫码。");
      return;
    }
    canvasRef.current = { canvas, ctx };
    streamRef.current = stream;
    setStream(stream);
    setState("scanning");
  }

  return (
    <div className="qr-scanner">
      <div className="qr-scanner-view">
        {/* 空 <video> 会渲染出内核默认的巨大播放占位图:只在有流时挂载。 */}
        {stream && <video ref={videoRef} className="qr-scanner-video" playsInline muted />}
        {!stream && (
          <div className="qr-scanner-placeholder">
            <CameraOff size={22} aria-hidden />
            <span>{state === "starting" ? "正在启动相机…" : "相机未开启"}</span>
          </div>
        )}
      </div>
      {state !== "scanning"
        ? (
          <button className="primary-action" type="button" disabled={state === "starting"} onClick={startScanning}>
            <Camera size={16} aria-hidden />
            {state === "starting" ? "正在启动…" : "打开相机扫码"}
          </button>
        )
        : <p className="qr-confirm-note">正在识别…对准二维码即可</p>}
      {error && <p className="qr-confirm-error" role="alert">{error}</p>}
      {invalid && <p className="qr-confirm-error" role="alert">{invalid}</p>}
    </div>
  );
}
