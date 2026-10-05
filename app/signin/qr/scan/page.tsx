import { QrScanner } from "./qr-scanner";

export const dynamic = "force-dynamic";

// 扫一扫(手机端,App 内或移动浏览器):桌面端登录页展示 QR,这里开相机解码,
// 只认本站两类登录码(解析在 qr-login-core,单测钉死),按路径分流到确认页
// (正向:手机已登录)或配对页(反向:手机未登录,扫码后输配对码)。页面本身
// 公开可访——扫码动作不泄露任何信息,两种落点各自有自己的验证;相机走
// getUserMedia,App 壳在 onPermissionRequest 里只对本站放行视频捕获。
export default async function QrScanPage() {
  return (
    <main className="qr-scan-page">
      <section className="qr-confirm-panel">
        <h1>扫一扫</h1>
        <p className="qr-confirm-note">
          扫桌面端登录页的码,在这里确认后桌面即登录;扫「让手机扫码登录」的码,
          输入配对码后本机即登录。只认本站生成的登录码,其它内容一律拒绝。
        </p>
        <QrScanner />
      </section>
    </main>
  );
}
