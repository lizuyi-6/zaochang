import { ArrowLeft, BadgeCheck, Chrome, Github } from "lucide-react";
import Link from "next/link";
import { oauthProviderStatus, safeReturnPath } from "../oauth-session";
import { oaiIdentityHeadersEnabled } from "../chatgpt-auth";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const returnToValue = Array.isArray(query.return_to) ? query.return_to[0] : query.return_to;
  const returnTo = safeReturnPath(returnToValue);
  const status = oauthProviderStatus();
  const chatgptEnabled = oaiIdentityHeadersEnabled();
  const error = Array.isArray(query.error) ? query.error[0] : query.error;
  const provider = Array.isArray(query.provider) ? query.provider[0] : query.provider;
  const errorText = error === "not_configured"
    ? `${provider === "github" ? "GitHub" : "Google"} 登录尚未配置，请先完成 OAuth 应用设置。`
    : error === "access_denied"
      ? "你取消了授权，当前没有登录。"
      : error === "invalid_state"
        ? "登录状态已过期，请重新开始。"
        : error === "provider_error"
          ? "第三方登录没有完成，请检查配置后重试。"
          : null;

  return (
    <main className="auth-page">
      <Link className="auth-brand" href="/" aria-label="返回造场首页">
        <span className="auth-brand-mark"><i /><i /><i /></span>
        <strong>造场</strong>
        <small>ZAOCHANG / ACCOUNT</small>
      </Link>
      <section className="auth-panel">
        <Link className="auth-back" href={returnTo}><ArrowLeft size={15} /> 返回</Link>
        <div className="auth-mark"><BadgeCheck size={18} /> 造场账号</div>
        <h1>进入造场</h1>
        <p className="auth-intro">登录后保存作品、参与讨论，并让你的产品进入造场银河。</p>
        {errorText && <p className="auth-error" role="alert">{errorText}</p>}
        <div className="auth-providers">
          <ProviderButton href={`/api/auth/google/start?return_to=${encodeURIComponent(returnTo)}`} enabled={status.google} className="google" icon={<Chrome size={18} />} label="使用 Google 登录" />
          <ProviderButton href={`/api/auth/github/start?return_to=${encodeURIComponent(returnTo)}`} enabled={status.github} className="github" icon={<Github size={18} />} label="使用 GitHub 登录" />
        </div>
        {chatgptEnabled && <><div className="auth-divider"><span>或者</span></div><a className="auth-chatgpt" href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`}>使用 ChatGPT 登录</a></>}
        <small className="auth-note">Google 和 GitHub 登录只会用于识别你的造场账号，不会公开你的第三方密码。</small>
      </section>
      <span className="auth-context">AUTH GATEWAY / PRIVATE ACCESS</span>
    </main>
  );
}

function ProviderButton({ href, enabled, className, icon, label }: { href: string; enabled: boolean; className: string; icon: React.ReactNode; label: string }) {
  if (!enabled) return <span className={`auth-provider is-disabled ${className}`} aria-disabled="true">{icon}<span>{label}</span><small>待配置</small></span>;
  return <a className={`auth-provider ${className}`} href={href}>{icon}<span>{label}</span></a>;
}
