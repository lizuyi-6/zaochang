import { ArrowLeft, BadgeCheck, Github } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getOAuthSessionUser, oauthProviderStatus, safeReturnPath, turnstileSiteKey } from "../oauth-session";
import { EmailLoginForm } from "./email-form";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const returnToValue = Array.isArray(query.return_to) ? query.return_to[0] : query.return_to;
  const returnTo = safeReturnPath(returnToValue);
  // 已持有有效主站会话 → 不再渲染登录表单,直接回到目标页(主站 SSO:登录态全站通用,
  // /lattice/ 门禁认的也是同一个会话 cookie)。换账号需先走 /signout 登出。
  // 兜底层:Worker 入口已对 GET /signin 做同样判定(登录态下 vinext 传给页面的
  // searchParams 为空,所以此处的 returnTo 实际会回落 "/",也满足"不再重复登录")。
  if (await getOAuthSessionUser()) {
    redirect(returnTo);
  }
  const loginHref = `/api/auth/github/start?return_to=${encodeURIComponent(returnTo)}`;
  const status = oauthProviderStatus();
  const turnstileKey = turnstileSiteKey();
  const via = Array.isArray(query.via) ? query.via[0] : query.via;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;
  const errorText = error === "not_configured"
    ? "GitHub 登录尚未配置，请先完成 OAuth 应用设置。"
    : error === "access_denied"
      ? "你取消了授权，当前没有登录。"
      : error === "invalid_state"
        ? "登录状态已过期，请重新开始。"
          : error === "provider_error"
            ? "第三方登录没有完成，请检查配置后重试。"
          : error === "github_unreachable"
            ? "当前网络暂时无法连接 GitHub，请检查网络后重新登录。"
          : error === "invitation_required"
            ? "这是首次注册，请输入邀请码后重新使用 GitHub 登录。"
            : error === "invitation_invalid"
              ? "邀请码无效、已用完或已经过期，请向造场团队获取新邀请码。"
          : error === "turnstile_invalid"
            ? "人机验证未通过，请稍后在登录页重新完成验证后再注册。"
          : null;

  // 登录方式区块:GitHub 登录 + 邮箱验证码 + 首次注册(邀请码)。主站与 /lattice/* 门禁
  // 变体共用同一份——两条路都必须能走 GitHub 登录,差异只在标题/说明文案。
  const providers = (
    <>
      {status.github ? (
        <a className="auth-provider github" href={loginHref}>
          <Github size={18} /><span>使用 GitHub 登录</span>
        </a>
      ) : (
        <span className="auth-provider github is-disabled" aria-disabled="true">
          <Github size={18} /><span>使用 GitHub 登录</span><small>待配置</small>
        </span>
      )}
      <div className="auth-divider">或邮箱验证码</div>
      <EmailLoginForm returnTo={returnTo} turnstileKey={turnstileKey} />
      <div className="auth-divider">首次注册（GitHub）</div>
      <form className="auth-invite-form" action="/api/auth/github/start" method="post">
        <input type="hidden" name="return_to" value={returnTo} />
        <label htmlFor="invitation_code">
          邀请码
          <span>首次注册必填</span>
        </label>
        <input id="invitation_code" name="invitation_code" type="text" inputMode="text" autoComplete="one-time-code" autoCapitalize="characters" autoCorrect="off" spellCheck={false} minLength={8} maxLength={64} placeholder="ZC- 开头，不区分大小写" required />
        {turnstileKey && <div className="cf-turnstile auth-turnstile" data-sitekey={turnstileKey} data-appearance="interaction-only" />}
        <button className="auth-provider github" type="submit" disabled={!status.github}>
          <Github size={18} /><span>使用邀请码注册</span>{!status.github && <small>待配置</small>}
        </button>
      </form>
      <small className="auth-note">邀请码只在首次创建造场账号时原子消耗；后续登录不再需要。GitHub 登录不会获得你的 GitHub 密码；邮箱登录只用于接收验证码，我们会往你的邮箱发送登录验证码邮件。</small>
    </>
  );

  // /lattice/* 门禁专用变体(via=lattice):身份锚点是 members.email——GitHub 注册过的
  // 账号同样可用 GitHub 登录,或用注册邮箱收验证码登进同一账户;全新邮箱首次注册需邀请码。
  if (via === "lattice") {
    return (
      <main className="auth-page">
        <Link className="auth-brand" href="/" aria-label="返回造场首页">
          <span className="auth-brand-mark"><i /><i /><i /></span>
          <strong>造场</strong>
          <small>ZAOCHANG / ACCOUNT</small>
        </Link>
        <section className="auth-panel">
          <Link className="auth-back" href={returnTo}><ArrowLeft size={15} /> 返回</Link>
          <div className="auth-mark"><BadgeCheck size={18} /> 造场账户</div>
          <h1>使用造场账户登录</h1>
          <p className="auth-intro">此功能仅对造场账户开放。支持 GitHub 或邮箱验证码登录，首次注册需要邀请码。</p>
          {errorText && <p className="auth-error" role="alert">{errorText}</p>}
          {turnstileKey && <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />}
          {providers}
        </section>
        <span className="auth-context">ZAOCHANG ACCOUNT / LATTICE</span>
      </main>
    );
  }

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
        <p className="auth-intro">公开测试期间支持 GitHub 或邮箱验证码登录。已有账号直接登录，首次注册需要邀请码。</p>
        {errorText && <p className="auth-error" role="alert">{errorText}</p>}
        {turnstileKey && <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />}
        {providers}
      </section>
      <span className="auth-context">AUTH GATEWAY / INVITE BETA</span>
    </main>
  );
}
