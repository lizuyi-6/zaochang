import type { Metadata } from "next";
import { APP_DOWNLOAD } from "../../api/_lib/app-download";
import { SHELL_MANIFEST } from "../../api/_lib/shell-manifest";
import { AppVersionStatus } from "./version-status";

export const metadata: Metadata = {
  title: "App 版本与信息",
  description: "查看当前安装的造场 App 版本、线上最新版本与更新方式。",
};

export default function AppVersionPage() {
  const sizeMb = (APP_DOWNLOAD.sizeBytes / 1024 / 1024).toFixed(1);
  return (
    <main className="app-download">
      <section className="app-download-panel">
        <div className="app-download-mark">ZAOCHANG APP / VERSION</div>
        <h1>App 版本与信息</h1>
        <p className="app-download-intro">
          这里展示你当前安装的造场 App 版本与线上最新版本。站点功能更新无需重装 App,打开即最新;只有壳本身变化时才需要按下方方式更新。
        </p>
        <AppVersionStatus latestVersionName={APP_DOWNLOAD.versionName} downloadPath={`/${APP_DOWNLOAD.filePath}`} />
        <dl className="app-download-facts">
          <div><dt>线上最新版</dt><dd>v{APP_DOWNLOAD.versionName}(versionCode {APP_DOWNLOAD.versionCode})</dd></div>
          <div><dt>站点构建号</dt><dd>{SHELL_MANIFEST.web.buildId}</dd></div>
          <div><dt>安装包大小</dt><dd>{sizeMb} MB</dd></div>
          <div><dt>系统要求</dt><dd>Android {APP_DOWNLOAD.minAndroid} 及以上</dd></div>
          <div><dt>SHA-256</dt><dd className="app-download-hash">{APP_DOWNLOAD.sha256}</dd></div>
        </dl>
        <ol className="app-download-steps">
          <li>App 每次启动会自动检查新版本;有新版时首页顶部会出现「新版可用」横幅。</li>
          <li>点横幅或本页下载按钮即可更新;首次安装会经系统「安装未知应用」确认,账号与登录态不受影响。</li>
          <li>更新后回到本页可核对新版本号;历史版本安装包保留,可按版本号回滚。</li>
        </ol>
        <small className="app-download-note">
          造场 App 只申请网络、相机(扫一扫)与安装自身更新三类权限,不读取通讯录、定位、文件存储等其它数据。
          本站账号在 App 与浏览器间通用。完整安装说明与校验信息见 <a href="/app">App 下载页</a>。
        </small>
      </section>
    </main>
  );
}
