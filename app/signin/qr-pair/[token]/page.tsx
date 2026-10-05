import { QR_PAIR_PATH_PATTERN } from "../../../api/_lib/qr-login-core";
import { QrPairForm } from "./qr-pair-form";

type PageProps = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

// 扫码登录(反向)· 手机端配对页(/signin/qr-pair/<token>,桌面端"让手机扫码
// 登录"展示的 QR 内容即本页)。无需登录;两道验证:输入桌面端展示的 6 位配对码
// (接近性),随后桌面端显式「允许」(设备主人在场)。token 形态不对直接给无效页。
export default async function QrPairPage({ params }: PageProps) {
  const { token } = await params;
  if (!QR_PAIR_PATH_PATTERN.test(`/signin/qr-pair/${token}`)) {
    return (
      <main className="qr-confirm-page">
        <section className="qr-confirm-panel">
          <h1>链接无效</h1>
          <p className="qr-confirm-note">这不是有效的造场登录邀请。请只扫描桌面端「让手机扫码登录」页面展示的二维码。</p>
        </section>
      </main>
    );
  }
  return (
    <main className="qr-confirm-page">
      <section className="qr-confirm-panel">
        <h1>登录桌面端的账号?</h1>
        <p className="qr-confirm-note">
          桌面端已登录造场并邀请你在此登录同一账号。输入桌面端屏幕上展示的
          <strong> 6 位配对码</strong>,随后还需要桌面端点击「允许」。二维码 2 分钟内有效,一次一码。
        </p>
        <QrPairForm token={token} />
      </section>
    </main>
  );
}
