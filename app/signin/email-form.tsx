"use client";

import { useRef, useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";

// 邮箱验证码登录表单(两段式:发码 → 验码)。fetch JSON 交互,错误就地展示;
// 成功后由服务端 setAuthCookies 下发会话,前端拿到 return_to 后整页跳转,
// 与 GitHub 登录殊途同归。Turnstile:每次发码请求都要求一个新鲜 token(widget
// 在本表单内独立渲染),失败后 reset 以便重试。
type Stage = "request" | "verify";

const ERROR_TEXT: Record<string, string> = {
  invalid_email: "邮箱地址格式不正确。",
  invalid_request: "请求格式不正确，请刷新页面后重试。",
  invitation_required: "这是首次注册，请填写邀请码后再发送验证码。",
  invitation_invalid: "邀请码无效、已用完或已过期，请向造场团队获取新邀请码。",
  turnstile_invalid: "人机验证未通过，请重新完成验证后再发送。",
  rate_limited: "发送太频繁了，请稍等几分钟再试。",
  code_invalid: "验证码不正确，请核对后重试。",
  code_locked: "错误次数过多，该验证码已锁定，请重新发送一封新邮件。",
  email_not_configured: "邮件服务尚未配置，邮箱登录暂不可用。",
};

function sendErrorText(code: string) {
  if (code.startsWith("email_send_")) return "验证码邮件暂时发不出去，请稍后重试。";
  return ERROR_TEXT[code] ?? "出了点问题，请稍后重试。";
}

export function EmailLoginForm({ returnTo, turnstileKey }: { returnTo: string; turnstileKey: string | null }) {
  const [stage, setStage] = useState<Stage>("request");
  const [email, setEmail] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);

  function currentTurnstileToken(): string | null {
    const input = turnstileRef.current?.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
    return input?.value ? input.value : null;
  }

  function resetTurnstile() {
    const controller = (window as unknown as { turnstile?: { reset: (el?: HTMLElement) => void } }).turnstile;
    if (controller && turnstileRef.current) controller.reset(turnstileRef.current);
  }

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/email/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          invitation_code: invitationCode.trim() || undefined,
          "cf-turnstile-response": currentTurnstileToken() ?? undefined,
        }),
      });
      const result = await response.json().catch(() => ({ error: "invalid_request" })) as { error?: string };
      if (!response.ok) {
        setError(sendErrorText(result.error ?? "invalid_request"));
        resetTurnstile();
        return;
      }
      setStage("verify");
      resetTurnstile();
    } catch {
      setError("网络异常，请稍后重试。");
      resetTurnstile();
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/email/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code, return_to: returnTo }),
      });
      const result = await response.json().catch(() => ({ error: "invalid_request" })) as { error?: string; return_to?: string };
      if (!response.ok) {
        setError(sendErrorText(result.error ?? "invalid_request"));
        return;
      }
      window.location.assign(result.return_to || returnTo || "/");
    } catch {
      setError("网络异常，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  if (stage === "verify") {
    return (
      <form className="auth-invite-form" onSubmit={verifyCode}>
        <label htmlFor="email-code">
          验证码
          <span>已发送至 {email}</span>
        </label>
        <input
          id="email-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          minLength={6}
          maxLength={6}
          placeholder="6 位数字验证码"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          autoFocus
          required
        />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-provider github" type="submit" disabled={busy}>
          <ShieldCheck size={18} /><span>{busy ? "验证中…" : "验证并登录"}</span>
        </button>
        <button
          type="button"
          className="auth-email-back"
          onClick={() => { setStage("request"); setCode(""); setError(null); }}
        >
          换一个邮箱
        </button>
      </form>
    );
  }

  return (
    <form className="auth-invite-form" onSubmit={requestCode}>
      <label htmlFor="email-address">
        邮箱
        <span>未注册邮箱需邀请码</span>
      </label>
      <input
        id="email-address"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        maxLength={254}
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <label htmlFor="email-invitation-code">
        邀请码
        <span>仅首次注册需要</span>
      </label>
      <input
        id="email-invitation-code"
        name="invitation_code"
        type="text"
        minLength={8}
        maxLength={64}
        placeholder="已有造场账号可留空"
        value={invitationCode}
        onChange={(event) => setInvitationCode(event.target.value)}
      />
      {turnstileKey && <div ref={turnstileRef} className="cf-turnstile auth-turnstile" data-sitekey={turnstileKey} data-appearance="interaction-only" />}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="auth-provider github" type="submit" disabled={busy}>
        <Mail size={18} /><span>{busy ? "发送中…" : "发送验证码"}</span>
      </button>
    </form>
  );
}
