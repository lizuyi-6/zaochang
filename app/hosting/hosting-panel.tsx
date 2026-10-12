"use client";

import { useEffect, useRef, useState } from "react";
import { isKnownHostingCode, hostingFailureMessage, hostingIssue, type HostingIssue } from "./hosting-copy";

type HostingState = "queued" | "deploying" | "staged" | "promoting" | "live" | "removing" | "removed" | "failed";
type HostingDesired = "staged" | "live" | "removed";
type HostingRecord = {
  id: number;
  state: HostingState;
  desired: HostingDesired;
  failureCode: string | null;
  failureDetail: string | null;
  previewUrl: string | null;
  previewExpiresAt: string | null;
  bundleFileCount: number;
  bundleUncompressedBytes: number;
  bundleSha256: string;
  hostedUrl: string | null;
  createdAt: string;
  updatedAt: string;
};
type HostingStatusResponse = { reviewVersion: number; approvedVersion: number; hosting: HostingRecord | null };
type GrantResponse = { granted: boolean; maxSites: number; usedSites: number };
type PanelProps = { productId: number; productTitle: string };

const maxBundleBytes = 10 * 1024 * 1024;
const progressLabels = ["排队中", "部署中", "待审核预览", "上线中", "已上线", "移除中", "已移除"];

function shouldPollHosting(hosting: HostingRecord | null): hosting is HostingRecord {
  if (!hosting) return false;
  if (hosting.desired === "removed") return hosting.state !== "removed";
  return !["live", "removed", "failed"].includes(hosting.state);
}

function currentProgressStep(hosting: HostingRecord): number {
  if (hosting.state === "removed") return 6;
  if (hosting.desired === "removed" || hosting.state === "removing") return 5;
  if (hosting.state === "queued") return 0;
  if (hosting.state === "deploying") return 1;
  if (hosting.state === "staged" && hosting.desired === "staged") return 2;
  if (hosting.state === "staged" || hosting.state === "promoting") return 3;
  if (hosting.state === "live") return 4;
  return -1;
}

function currentStatusLabel(hosting: HostingRecord): string {
  if (hosting.state === "failed") return "失败";
  if (hosting.state === "removed") return "已移除";
  if (hosting.desired === "removed" || hosting.state === "removing") return "移除中";
  if (hosting.state === "staged" && hosting.desired === "live") return "上线中";
  const labels: Partial<Record<HostingState, string>> = {
    queued: "排队中",
    deploying: "部署中",
    staged: "待审核预览",
    promoting: "上线中",
    live: "已上线",
  };
  return labels[hosting.state] ?? "状态待刷新";
}

function displayTime(value: string | null): string {
  if (!value) return "未提供";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function responseCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const code = (payload as { error?: unknown }).error;
  return typeof code === "string" ? code : undefined;
}

function isHostingIssue(error: unknown): error is HostingIssue {
  return Boolean(error && typeof error === "object" && !(error instanceof Error) && "message" in error && typeof error.message === "string");
}

function validateHostedUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".page.stepcloud.com") ? url.href : null;
  } catch {
    return null;
  }
}

export function HostingPanel({ productId, productTitle }: PanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const removeLock = useRef(false);
  const [grant, setGrant] = useState<GrantResponse | null>(null);
  const [hosting, setHosting] = useState<HostingRecord | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [issue, setIssue] = useState<HostingIssue | null>(null);
  const [notice, setNotice] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let controller: AbortController | null = null;

    const load = async (showRefresh: boolean) => {
      controller?.abort();
      controller = new AbortController();
      if (showRefresh) setRefreshing(true);
      try {
        const [grantResult, productResult] = await Promise.allSettled([
          fetch("/api/hosting/grant", { cache: "no-store", signal: controller.signal }),
          fetch(`/api/hosting/products/${productId}`, { cache: "no-store", signal: controller.signal }),
        ]);
        if (!active) return;
        if (grantResult.status === "rejected") throw new Error("network");
        const grantPayload = await grantResult.value.json().catch(() => null) as { granted?: unknown; maxSites?: unknown; usedSites?: unknown; error?: unknown } | null;
        if (!grantResult.value.ok) throw hostingIssue(grantResult.value.status, responseCode(grantPayload));
        if (!grantPayload || typeof grantPayload.granted !== "boolean" || typeof grantPayload.maxSites !== "number" || typeof grantPayload.usedSites !== "number") throw new Error("invalid_grant_response");
        setGrant({ granted: grantPayload.granted, maxSites: grantPayload.maxSites, usedSites: grantPayload.usedSites });
        setIssue(null);
        if (!grantPayload.granted) {
          setHosting(null);
          setStatusLoaded(false);
          return;
        }
        if (productResult.status === "rejected") throw new Error("network");
        const productPayload = await productResult.value.json().catch(() => null) as Partial<HostingStatusResponse> & { error?: unknown } | null;
        if (!productResult.value.ok) throw hostingIssue(productResult.value.status, responseCode(productPayload));
        if (!productPayload || typeof productPayload.reviewVersion !== "number" || typeof productPayload.approvedVersion !== "number" || !("hosting" in productPayload)) throw new Error("invalid_hosting_response");
        const nextHosting = productPayload.hosting as HostingRecord | null;
        setHosting(nextHosting);
        setStatusLoaded(true);
        if (shouldPollHosting(nextHosting)) {
          timer = window.setTimeout(() => { void load(false); }, 5000);
        }
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        const nextIssue = isHostingIssue(error)
          ? error
          : { message: "暂时无法读取托管状态，请检查网络后重试。" };
        setIssue(nextIssue);
      } finally {
        if (active) {
          setInitialLoading(false);
          setRefreshing(false);
        }
      }
    };

    void load(true);
    return () => {
      active = false;
      controller?.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [productId, refreshKey]);

  const retry = () => {
    setIssue(null);
    setInitialLoading(true);
    setRefreshKey((value) => value + 1);
  };

  const chooseFile = (file: File | undefined) => {
    setIssue(null);
    setNotice("");
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setSelectedFile(null);
      setIssue({ message: "请选择 .zip 压缩包。" });
      return;
    }
    if (file.size > maxBundleBytes) {
      setSelectedFile(null);
      setIssue({ message: "压缩包不能超过 10 MiB，请缩小后重试。" });
      return;
    }
    setSelectedFile(file);
  };

  const uploadBundle = async () => {
    if (!selectedFile || uploadLock.current || uploading) return;
    uploadLock.current = true;
    setUploading(true);
    setIssue(null);
    setNotice("");
    try {
      const form = new FormData();
      form.set("productId", String(productId));
      form.set("file", selectedFile);
      const response = await fetch("/api/hosting/bundles", { method: "POST", body: form });
      const payload = await response.json().catch(() => null) as { error?: string; hosting?: { id: number; state: HostingState; desired: HostingDesired } } | null;
      if (!response.ok) throw hostingIssue(response.status, responseCode(payload));
      if (response.status !== 201 || !payload?.hosting) throw new Error("invalid_upload_response");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setNotice("压缩包已提交，正在读取新的托管状态。未通过服务端校验的内容不会进入部署。 ");
      setInitialLoading(true);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setIssue(isHostingIssue(error)
        ? error
        : { message: "上传未成功，请检查网络后重试。" });
    } finally {
      uploadLock.current = false;
      setUploading(false);
    }
  };

  const removeHosting = async () => {
    if (!window.confirm("移除托管会下架站点并请求清理第三方站点。确认继续吗？")) return;
    if (removeLock.current || removing) return;
    removeLock.current = true;
    setRemoving(true);
    setIssue(null);
    setNotice("");
    try {
      const response = await fetch(`/api/hosting/products/${productId}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null) as { error?: string; ok?: boolean } | null;
      if (!response.ok) throw hostingIssue(response.status, responseCode(payload));
      if (!payload?.ok) throw new Error("invalid_remove_response");
      setNotice("移除请求已提交，正在读取最新托管状态。 ");
      setInitialLoading(true);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setIssue(isHostingIssue(error)
        ? error
        : { message: "移除请求未成功，请检查网络后重试。" });
    } finally {
      removeLock.current = false;
      setRemoving(false);
    }
  };

  if (grant?.granted === false) {
    return <p className="hosting-panel-invitation">静态托管目前仅对受邀成员开放</p>;
  }

  const progressStep = hosting ? currentProgressStep(hosting) : -1;
  const hostedUrl = validateHostedUrl(hosting?.hostedUrl ?? null);
  const unknownIssueCode = issue?.code && !isKnownHostingCode(issue.code) ? issue.code : null;
  const unknownFailureCode = hosting?.state === "failed" && hosting.failureCode && !isKnownHostingCode(hosting.failureCode) ? hosting.failureCode : null;

  return <section className="hosting-panel" aria-label={`${productTitle} 静态托管`}>
    <header className="hosting-panel-header"><div><span className="deep-eyebrow">STATIC HOSTING</span><h3>静态托管</h3></div>{grant && <small>已用 {grant.usedSites}/{grant.maxSites} 个站点</small>}</header>
    {initialLoading && !statusLoaded && <p className="hosting-panel-state" role="status">正在读取托管状态…</p>}
    {issue && <div className="hosting-panel-error" role="alert"><p>{issue.message}</p>{unknownIssueCode && <small>错误码：{unknownIssueCode}</small>}<button type="button" onClick={retry} disabled={refreshing || uploading || removing}>{refreshing ? "正在重试…" : "重试读取"}</button></div>}
    {notice && <p className="hosting-panel-notice" role="status">{notice}</p>}
    {statusLoaded && hosting && <div className="hosting-panel-status">
      <div className="hosting-panel-current"><strong>{currentStatusLabel(hosting)}</strong><small>最近更新：{displayTime(hosting.updatedAt)}</small></div>
      {hosting.state === "failed" ? <div className="hosting-panel-error" role="status"><p>{hostingFailureMessage(hosting.failureCode)}</p>{unknownFailureCode && <small>错误码：{unknownFailureCode}</small>}</div> : <ol className="hosting-timeline" aria-label="托管状态进度">{progressLabels.map((label, index) => <li key={label} className={index < progressStep ? "is-done" : index === progressStep ? "is-current" : ""} aria-current={index === progressStep ? "step" : undefined}><span>{index + 1}</span><small>{label}</small></li>)}</ol>}
      {hosting.previewUrl && <div className="hosting-panel-preview"><a href={hosting.previewUrl} target="_blank" rel="noreferrer noopener">打开审核预览</a><small>预览链接持有者可访问，仅用于你和审核员审阅；到期自动失效。</small><small>过期时间：{displayTime(hosting.previewExpiresAt)}</small></div>}
      {hostedUrl && <a className="hosting-panel-live-link" href={hostedUrl} target="_blank" rel="noopener noreferrer nofollow">访问托管站点</a>}
      {hosting.state !== "removed" && <button type="button" className="hosting-remove-button" onClick={() => void removeHosting()} disabled={removing || uploading}>{removing ? "正在提交移除…" : "移除托管"}</button>}
    </div>}
    {statusLoaded && !hosting && <p className="hosting-panel-state">这个项目目前没有托管版本。</p>}
    {statusLoaded && <div className="hosting-upload">
      <div><strong>上传静态站点包</strong><p>仅接受 .zip，文件不能超过 10 MiB；压缩包根目录需有 index.html，不得含 .php/.sh/.exe、.env 或私钥。</p><small>提交后服务端会检查包结构与敏感内容；未通过校验的包不会进入部署。</small></div>
      <input ref={fileInputRef} type="file" accept=".zip,application/zip" aria-label="选择 ZIP 压缩包" onChange={(event) => chooseFile(event.currentTarget.files?.[0])} />
      {selectedFile && <small className="hosting-selected-file">已选择：{selectedFile.name} · {formatBytes(selectedFile.size)}</small>}
      <div className="hosting-upload-actions"><button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading || removing}>{selectedFile ? "更换 ZIP 文件" : "选择 ZIP 文件"}</button><button type="button" className="primary-action" onClick={() => void uploadBundle()} disabled={!selectedFile || uploading || removing}>{uploading ? "正在上传…" : "提交托管包"}</button><button type="button" onClick={retry} disabled={refreshing || uploading || removing}>{refreshing ? "正在刷新…" : "刷新状态"}</button></div>
    </div>}
  </section>;
}
