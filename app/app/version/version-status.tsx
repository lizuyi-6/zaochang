"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import { BadgeCheck, Download, Loader, MonitorSmartphone, Smartphone } from "lucide-react";
import { compareVersionNames, parseShellUserAgent, type ShellUaInfo } from "../../lib/app-shell-ua";

// SSR 与 hydration 首帧的统一占位;挂载后 useSyncExternalStore 自动换读真实 UA,
// 不需要 effect 内 setState(仓库 lint 已禁止该模式)。
type Detection = ShellUaInfo | { kind: "detecting" };
const SERVER_SNAPSHOT: Detection = { kind: "detecting" };

export function AppVersionStatus({ latestVersionName, downloadPath }: { latestVersionName: string; downloadPath: string }) {
  const cacheRef = useRef<ShellUaInfo | null>(null);
  // getSnapshot 必须返回稳定引用:解析结果缓存进 ref,避免每次调用新对象触发死循环重渲染。
  const getSnapshot = useCallback(() => {
    if (cacheRef.current === null) cacheRef.current = parseShellUserAgent(navigator.userAgent);
    return cacheRef.current;
  }, []);
  const info = useSyncExternalStore(() => () => {}, getSnapshot, () => SERVER_SNAPSHOT);

  if (info.kind === "detecting") {
    return <div className="app-version-status"><span className="verdict"><Loader size={15} /> 正在识别运行环境…</span></div>;
  }

  if (info.kind === "browser") {
    return (
      <div className="app-version-status">
        <span className="verdict"><MonitorSmartphone size={15} /> 你正在浏览器中访问</span>
        <p>安装造场 App 后,本页会显示你当前安装的版本,并在有新版时给出更新入口。</p>
        <a className="primary-action app-version-cta" href={downloadPath}><Download size={15} /> 下载造场 App(v{latestVersionName})</a>
      </div>
    );
  }

  if (info.kind === "legacy-shell") {
    return (
      <div className="app-version-status">
        <span className="verdict warn"><Smartphone size={15} /> 造场 App 内 · 版本号未上报</span>
        <p>当前安装的是 v1.2.1 或更早的壳,它不会把版本号告诉页面。更新到 v{latestVersionName} 后,这里会显示具体版本。</p>
        <a className="primary-action app-version-cta" href={downloadPath}><Download size={15} /> 更新到 v{latestVersionName}</a>
      </div>
    );
  }

  const diff = compareVersionNames(info.versionName, latestVersionName);
  if (diff === 0) {
    return (
      <div className="app-version-status">
        <span className="verdict ok"><BadgeCheck size={15} /> 当前已是最新版</span>
        <p>造场 App v{info.versionName},与线上最新版一致。站点功能更新会自动生效,无需操作。</p>
      </div>
    );
  }
  if (diff < 0) {
    return (
      <div className="app-version-status">
        <span className="verdict warn"><Smartphone size={15} /> 当前 v{info.versionName} · 可更新到 v{latestVersionName}</span>
        <p>新版本包含壳能力改进。下载后系统会引导覆盖安装,账号与数据不受影响。</p>
        <a className="primary-action app-version-cta" href={downloadPath}><Download size={15} /> 更新到 v{latestVersionName}</a>
      </div>
    );
  }
  return (
    <div className="app-version-status">
      <span className="verdict"><Smartphone size={15} /> 当前 v{info.versionName} · 高于线上最新版</span>
      <p>你安装的版本领先于站点发布的最新版(可能是测试构建或站点回滚过)。</p>
    </div>
  );
}
