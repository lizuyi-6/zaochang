"use client";

import { Fingerprint } from "lucide-react";
import { useEffect, useState } from "react";
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
} from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server";

const ERROR_TEXT: Record<string, string> = {
  rate_limited: "尝试太频繁了，请稍等几分钟再试。",
  challenge_invalid: "登录状态已过期，请再点一次通行密钥按钮。",
  passkey_invalid: "通行密钥验证没有通过，请重试或改用其他登录方式。",
  invalid_request: "请求格式不正确，请刷新页面后重试。",
};

// WebAuthn 可用性检测:仅看 window.PublicKeyCredential 存在还不够——Android
// WebView 等"有 API 面但无实现"的环境(WebView 至今不支持 WebAuthn/passkey,
// 见 passkeys.dev)仪式必然失败,按钮不能渲染出来骗点击。故以
// platformAuthenticatorIsAvailable()(平台认证器探测,WebView 返回 false;
// 无锁屏凭据的桌面同样返回 false,这类环境仪式本就不可完成)为准,并叠加
// browserSupportsWebAuthn。探测异步:unknown 期间不渲染,避免"闪现后消失",
// 初始 false 与 SSR 一致,无 hydration 抖动。
function useWebauthnAvailable() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const isAvailable = browserSupportsWebAuthn()
        && await platformAuthenticatorIsAvailable().catch(() => false);
      if (alive) setAvailable(Boolean(isAvailable));
    })();
    return () => {
      alive = false;
    };
  }, []);
  return available;
}

// 登录页通行密钥按钮(discoverable/usernameless:不输邮箱,直接弹系统凭据选择器,
// 认得哪把钥匙就进哪个账号)。特性检测:浏览器/环境不支持 WebAuthn(非 HTTPS、
// 过旧内核)时整个按钮不渲染,登录页回落 GitHub/邮箱码。
export function PasskeyLoginButton({ returnTo }: { returnTo: string }) {
  const supported = useWebauthnAvailable();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const optionsResponse = await fetch("/api/auth/passkey/login/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const options = await optionsResponse.json().catch(() => null) as PublicKeyCredentialRequestOptionsJSON | null;
      if (!optionsResponse.ok || !options) {
        setError(ERROR_TEXT[(options as { error?: string } | null)?.error ?? ""] ?? "通行密钥暂时用不了，请稍后重试。");
        return;
      }
      const credential = await startAuthentication({ optionsJSON: options });
      const verify = await fetch("/api/auth/passkey/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credential, return_to: returnTo }),
      });
      const result = await verify.json().catch(() => null) as { return_to?: string; error?: string } | null;
      if (!verify.ok) {
        setError(ERROR_TEXT[result?.error ?? ""] ?? "通行密钥验证没有通过，请重试。");
        return;
      }
      window.location.assign(result?.return_to || returnTo || "/");
    } catch {
      // startAuthentication 的 NotAllowedError 多为用户取消仪式,不作错误呈现。
      setError("通行密钥没有完成，请重试或改用其他登录方式。");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;
  return (
    <>
      <button className="auth-provider passkey" type="button" onClick={signIn} disabled={busy}>
        <Fingerprint size={18} /><span>{busy ? "等待通行密钥…" : "使用通行密钥登录"}</span>
      </button>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </>
  );
}
