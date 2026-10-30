"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";
import Link from "next/link";
import { ACCOUNT_APPLICATION_LIMITS } from "../api/_lib/account-application-rules";

const ERROR_TEXT: Record<string, string> = {
  invalid_name: "请填写称呼（最多 40 个字）。",
  invalid_email: "邮箱地址格式不正确。",
  invalid_intro: `请用 ${ACCOUNT_APPLICATION_LIMITS.introMin}–${ACCOUNT_APPLICATION_LIMITS.introMax} 个字介绍一下你想在造场做什么。`,
  invalid_link: "链接需要是 http:// 或 https:// 开头的完整地址，没有可以不填。",
  turnstile_invalid: "人机验证未通过，请重新完成验证后再提交。",
  rate_limited: "提交太频繁了，请过一会儿再试。",
  invalid_origin: "请求来源校验失败，请刷新页面后重试。",
  invalid_request: "请求格式不正确，请刷新页面后重试。",
};

// 账户申请表单。成功后只显示「已收到」——服务端对新申请、重复申请、已是会员三种情况
// 回同一个 202,前端也不区分,所以文案里直接提示已是会员的去登录。
export function ApplyForm({ turnstileKey }: { turnstileKey: string | null }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [intro, setIntro] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);

  function currentTurnstileToken(): string | null {
    const input = turnstileRef.current?.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
    return input?.value ? input.value : null;
  }

  function resetTurnstile() {
    const controller = (window as unknown as { turnstile?: { reset: (el?: HTMLElement) => void } }).turnstile;
    if (controller && turnstileRef.current) controller.reset(turnstileRef.current);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account-applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          intro,
          link: link.trim() || undefined,
          "cf-turnstile-response": currentTurnstileToken() ?? undefined,
        }),
      });
      const result = await response.json().catch(() => ({ error: "invalid_request" })) as { error?: string };
      if (!response.ok) {
        setError(ERROR_TEXT[result.error ?? ""] ?? "出了点问题，请稍后重试。");
        resetTurnstile();
        return;
      }
      setSubmittedEmail(email.trim().toLowerCase());
    } catch {
      setError("网络异常，请稍后重试。");
      resetTurnstile();
    } finally {
      setBusy(false);
    }
  }

  if (submittedEmail) {
    return (
      <div className="apply-done" role="status">
        <strong>申请已收到</strong>
        <p>审核通过后，邀请码会发到 <b>{submittedEmail}</b>。邮件来自 zaochang@aetherstudio.top，没看到的话请翻一下垃圾邮件箱。</p>
        <p>如果这个邮箱已经是造场会员，不用等审核，直接用它登录即可。</p>
        <Link className="auth-provider github" href="/signin">去登录页</Link>
      </div>
    );
  }

  return (
    <form className="auth-invite-form" onSubmit={submit}>
      <label htmlFor="apply-name">称呼<span>必填</span></label>
      <input id="apply-name" name="name" type="text" autoComplete="name" maxLength={ACCOUNT_APPLICATION_LIMITS.name} placeholder="怎么称呼你" value={name} onChange={(event) => setName(event.target.value)} required />
      <label htmlFor="apply-email">邮箱<span>邀请码会发到这里，也是日后登录用的邮箱</span></label>
      <input id="apply-email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={ACCOUNT_APPLICATION_LIMITS.email} placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
      <label htmlFor="apply-intro">想在造场做什么<span>{intro.trim().length}/{ACCOUNT_APPLICATION_LIMITS.introMax}</span></label>
      <textarea id="apply-intro" name="intro" minLength={ACCOUNT_APPLICATION_LIMITS.introMin} maxLength={ACCOUNT_APPLICATION_LIMITS.introMax} rows={5} placeholder="简单介绍一下你自己，以及想在造场发布或体验什么作品" value={intro} onChange={(event) => setIntro(event.target.value)} required />
      <label htmlFor="apply-link">作品或主页链接<span>选填</span></label>
      <input id="apply-link" name="link" type="url" inputMode="url" maxLength={ACCOUNT_APPLICATION_LIMITS.link} placeholder="https://" value={link} onChange={(event) => setLink(event.target.value)} />
      {turnstileKey && <div ref={turnstileRef} className="cf-turnstile auth-turnstile" data-sitekey={turnstileKey} data-appearance="interaction-only" />}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="auth-provider github" type="submit" disabled={busy}>
        <Send size={18} /><span>{busy ? "提交中…" : "提交申请"}</span>
      </button>
      <small className="auth-note">我们只用这些信息审核申请，不会公开。提交不会立刻发邮件，审核通过后才会收到邀请码。</small>
    </form>
  );
}
