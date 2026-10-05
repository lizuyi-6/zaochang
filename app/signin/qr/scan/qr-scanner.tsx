"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import { parseQrLoginUrl } from "../../../api/_lib/qr-login-core";

// 相机取帧 + jsQR 解码(纯 JS,任何内核可用;不依赖 BarcodeDetector 的
// Play Services 分发)。解码命中即校验同源登录码:合法 → 跳确认页;不合法
// → 提示并继续扫。相机资源在离开页面时确定性释放。
type ScannerState = "idle" | "starting" | "scanning" | "failed";

const SCAN_INTERVAL_MS = 150;

export function QrScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<ScannerState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const invalidShownRef = useRef(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  async function startScanning() {
    setState("starting");
    setError(null);
    setInvalid(null);
    invalidShownRef.current = false;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (error) {
      setState("failed");
      setError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "相机权限被拒绝。请在系统/浏览器设置里允许造场使用相机，然后重试。"
          : "相机启动失败，请确认设备有可用摄像头后重试。",
      );
      return;
    }
    const video = videoRef.current;
    if (!video) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    streamRef.current = stream;
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      // play() 竞态(组件卸载)由 cleanup 收尾,这里不视作失败。
    }
    setState("scanning");

    const jsQR = (await import("jsqr")).default;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      setState("failed");
      setError("当前环境不支持相机解码。");
      stopCamera();
      return;
    }
    const timer = window.setInterval(() => {
      if (streamRef.current !== stream || video.readyState < 2 || !video.videoWidth) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
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
  }

  return (
    <div className="qr-scanner">
      <div className="qr-scanner-view">
        <video ref={videoRef} className="qr-scanner-video" playsInline muted />
        {state !== "scanning" && (
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
