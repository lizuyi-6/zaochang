import { BadgeCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getOAuthSessionUser } from "../oauth-session";
import { WelcomeForm } from "./welcome-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "欢迎来到造场", robots: { index: false } };

// 首次登录引导。新注册(邀请码)与管理员开通的账户在这里设定唯一用户名与昵称后才能进站;
// Worker 入口(worker/onboarding-gate.ts)把这类会员的整页导航 302 到这里并带上 return_to。
// return_to 由表单在浏览器侧读取(vinext 对登录态请求不保证把 searchParams 传给页面)。
export default async function WelcomePage() {
  const user = await getOAuthSessionUser();
  if (!user) redirect("/signin?return_to=%2Fwelcome");
  if (!user.onboardingRequired) redirect("/");
  return (
    <main className="auth-page">
      <Link className="auth-brand" href="/" aria-label="造场">
        <span className="auth-brand-mark"><i /><i /><i /></span>
        <strong>造场</strong>
        <small>ZAOCHANG / ACCOUNT</small>
      </Link>
      <section className="auth-panel">
        <div className="auth-mark"><BadgeCheck size={18} /> 完善资料</div>
        <h1>欢迎来到造场</h1>
        <p className="auth-intro">账户 {user.email} 已就绪。先给自己起一个用户名和昵称，就可以开始了。</p>
        <WelcomeForm initialNickname={user.displayName} />
      </section>
      <span className="auth-context">ACCOUNT SETUP / FIRST SIGN-IN</span>
    </main>
  );
}
