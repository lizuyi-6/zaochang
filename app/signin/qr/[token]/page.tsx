import Link from "next/link";
import { getOAuthSessionUser, safeReturnPath } from "../../../oauth-session";
import { QR_LOGIN_TOKEN_PATTERN } from "../../../api/_lib/qr-login-core";
import { QrConfirmForm } from "./qr-confirm-form";

type PageProps = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

// 扫码登录 · 手机端确认页(/signin/qr/<token>,QR 码内容即本页)。
// 必须是已登录成员:未登录先去登录(登录后 return_to 回到本页);
// token 形态不对直接给无效页,不进确认表单。
export default async function QrConfirmPage({ params }: PageProps) {
  const { token } = await params;
  if (!QR_LOGIN_TOKEN_PATTERN.test(token)) {
    return (
      <main className="qr-confirm-page">
        <section className="qr-confirm-panel">
          <h1>链接无效</h1>
          <p className="qr-confirm-note">这不是有效的造场登录二维码内容。请只扫描桌面端登录页展示的二维码。</p>
        </section>
      </main>
    );
  }
  const user = await getOAuthSessionUser();
  if (!user) {
    const back = `/signin/qr/${token}`;
    return (
      <main className="qr-confirm-page">
        <section className="qr-confirm-panel">
          <h1>先登录，再确认</h1>
          <p className="qr-confirm-note">
            扫码登录需要手机端已是造场成员。请先登录本页面所属的账号，登录后会自动回到这里。
          </p>
          <Link className="primary-action" href={`/signin?return_to=${encodeURIComponent(safeReturnPath(back))}`}>
            去登录
          </Link>
        </section>
      </main>
    );
  }
  return (
    <main className="qr-confirm-page">
      <section className="qr-confirm-panel">
        <h1>确认桌面端登录？</h1>
        <p className="qr-confirm-note">
          桌面端请求登录你的造场账号 <strong>{user.email}</strong>。
          只确认你亲自发起的扫码；二维码 2 分钟内有效，且一次一码。
        </p>
        <QrConfirmForm token={token} />
      </section>
    </main>
  );
}
