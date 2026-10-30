import { ArrowLeft, BadgeCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getOAuthSessionUser, turnstileSiteKey } from "../oauth-session";
import { ApplyForm } from "./apply-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "申请造场账户",
  description: "造场目前是邀请制。提交申请，审核通过后邀请码会发到你的邮箱。",
};

// 造场账户申请页。提交 → /api/account-applications(统一 202,不回信);
// 审核在管理台「账户申请」分区,通过后服务端发邀请码邮件(模板 _lib/invite-mail.ts)。
export default async function ApplyPage() {
  const signedIn = Boolean(await getOAuthSessionUser());
  const turnstileKey = turnstileSiteKey();
  return (
    <main className="auth-page">
      <Link className="auth-brand" href="/" aria-label="返回造场首页">
        <span className="auth-brand-mark"><i /><i /><i /></span>
        <strong>造场</strong>
        <small>ZAOCHANG / ACCOUNT</small>
      </Link>
      <section className="auth-panel">
        <Link className="auth-back" href="/signin"><ArrowLeft size={15} /> 返回登录</Link>
        <div className="auth-mark"><BadgeCheck size={18} /> 账户申请</div>
        <h1>申请造场账户</h1>
        {signedIn ? (
          <>
            <p className="auth-intro">你已经登录了造场账户，不需要再申请。</p>
            <Link className="auth-provider github" href="/">回到造场首页</Link>
          </>
        ) : (
          <>
            <p className="auth-intro">造场目前是邀请制。填写下面的申请，审核通过后，一张只属于你的邀请码会发到你填写的邮箱，用它就能注册。</p>
            {turnstileKey && <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />}
            <ApplyForm turnstileKey={turnstileKey} />
          </>
        )}
      </section>
      <span className="auth-context">ACCOUNT APPLICATION / INVITE BETA</span>
    </main>
  );
}
