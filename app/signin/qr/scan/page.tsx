import { redirect } from "next/navigation";
import { getOAuthSessionUser } from "../../../oauth-session";
import { QrScanner } from "./qr-scanner";

export const dynamic = "force-dynamic";

// 扫一扫(手机端,App 内或移动浏览器):桌面端登录页展示 QR,这里开相机解码,
// 只认本站 /signin/qr/<token> 形态(解析在 qr-login-core,单测钉死),命中后
// 跳确认页。未登录先去登录(登录后回到本页)。相机走 getUserMedia,App 壳在
// onPermissionRequest 里只对本站放行视频捕获。
export default async function QrScanPage() {
  if (!(await getOAuthSessionUser())) {
    redirect("/signin?return_to=%2Fsignin%2Fqr%2Fscan");
  }
  return (
    <main className="qr-scan-page">
      <section className="qr-confirm-panel">
        <h1>扫一扫，在桌面端登录</h1>
        <p className="qr-confirm-note">对准桌面端登录页上的二维码。只认本站生成的登录码，其它内容一律拒绝。</p>
        <QrScanner />
      </section>
    </main>
  );
}
