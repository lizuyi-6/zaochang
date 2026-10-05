import { redirect } from "next/navigation";
import { getOAuthSessionUser } from "../../oauth-session";
import { QrHostPanel } from "./qr-host-panel";

export const dynamic = "force-dynamic";

// 扫码登录(反向)· 桌面端宿主页(/profile/qr-host):已登录成员展示二维码 +
// 6 位配对码,邀请未登录手机登录同一账号。手机侧要多两道验证:输配对码(接近
// 性)+ 本页显式「允许」(设备主人在场)。
export default async function QrHostPage() {
  const user = await getOAuthSessionUser();
  if (!user) {
    redirect("/signin?return_to=%2Fprofile%2Fqr-host");
  }
  return (
    <main className="qr-confirm-page">
      <section className="qr-confirm-panel">
        <h1>让手机扫码登录</h1>
        <p className="qr-confirm-note">
          用手机(造场 App 或系统相机)扫描下方二维码;手机输入这里的
          <strong> 6 位配对码</strong>,你在下一步点「允许」后即登录完成。全程 2 分钟有效、一次一码。
        </p>
        <QrHostPanel />
      </section>
    </main>
  );
}
