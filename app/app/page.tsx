import type { Metadata } from "next";
import { APP_DOWNLOAD } from "../api/_lib/app-download";

export const metadata: Metadata = {
  title: "App 下载",
  description: "造场安卓 App:与网站同源的轻量安装包,站点更新无需重装。",
};

export default function AppDownloadPage() {
  const sizeMb = (APP_DOWNLOAD.sizeBytes / 1024 / 1024).toFixed(1);
  return (
    <main className="app-download">
      <section className="app-download-panel">
        <div className="app-download-mark">ZAOCHANG / ANDROID</div>
        <h1>造场 App(安卓)</h1>
        <p className="app-download-intro">
          造场 App 是网站的安卓安装版:打开即进入完整的造场社区,账号与网站通用。
          网站内容更新无需重装 App,启动时自动保持最新。
        </p>
        <a className="primary-action app-download-cta" href={`/${APP_DOWNLOAD.filePath}`} download={APP_DOWNLOAD.fileName}>
          下载安装包(v{APP_DOWNLOAD.versionName})
        </a>
        <dl className="app-download-facts">
          <div><dt>版本</dt><dd>{APP_DOWNLOAD.versionName}(versionCode {APP_DOWNLOAD.versionCode})</dd></div>
          <div><dt>大小</dt><dd>{sizeMb} MB</dd></div>
          <div><dt>系统要求</dt><dd>Android {APP_DOWNLOAD.minAndroid} 及以上</dd></div>
          <div><dt>SHA-256</dt><dd className="app-download-hash">{APP_DOWNLOAD.sha256}</dd></div>
        </dl>
        <ol className="app-download-steps">
          <li>点击上方按钮下载 APK 安装包。</li>
          <li>打开系统通知或「下载」里的安装包;首次安装会提示「未知来源应用」,允许安装造场即可。</li>
          <li>安装完成后的登录方式与网站一致(GitHub / 邮箱验证码),首次注册仍需邀请码。</li>
        </ol>
        <small className="app-download-note">
          安装包由造场官方签名,上方 SHA-256 可用于校验完整性。App 只申请网络权限,
          不读取通讯录、定位、存储等任何其它数据。站点新功能直接生效,只有壳本身变化时才需要重新下载。
        </small>
      </section>
    </main>
  );
}
