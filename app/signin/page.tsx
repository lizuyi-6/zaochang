import { ArrowLeft, BadgeCheck, Github } from "lucide-react";
import Link from "next/link";
import { oauthProviderStatus, safeReturnPath } from "../oauth-session";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const returnToValue = Array.isArray(query.return_to) ? query.return_to[0] : query.return_to;
  const returnTo = safeReturnPath(returnToValue);
  const status = oauthProviderStatus();
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
          : error === "invitation_required"
            ? "这是首次注册，请输入邀请码后重新使用 GitHub 登录。"
            : error === "invitation_invalid"
              ? "邀请码无效、已用完或已经过期，请向造场团队获取新邀请码。"
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
        <p className="auth-intro">公开测试期间统一使用 GitHub。已有账号直接登录，首次注册需要邀请码。</p>
        {errorText && <p className="auth-error" role="alert">{errorText}</p>}
        <form className="auth-invite-form" action="/api/auth/github/start" method="post">
          <input type="hidden" name="return_to" value={returnTo} />
          <label htmlFor="invitation_code">
            邀请码
            <span>已有账号可留空</span>
          </label>
          <input id="invitation_code" name="invitation_code" type="text" inputMode="text" autoComplete="one-time-code" minLength={8} maxLength={64} placeholder="首次注册时填写" />
          <button className="auth-provider github" type="submit" disabled={!status.github}>
            <Github size={18} /><span>使用 GitHub 登录</span>{!status.github && <small>待配置</small>}
          </button>
        </form>
        <small className="auth-note">邀请码只在首次创建造场账号时原子消耗；后续登录不再需要。造场不会获得你的 GitHub 密码。</small>
      </section>
      <span className="auth-context">AUTH GATEWAY / INVITE BETA</span>
    </main>
  );
}
