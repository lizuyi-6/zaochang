"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { NICKNAME_LIMITS, PROFILE_LIMITS, USERNAME_PATTERN } from "../api/_lib/member-identity-rules";

const ERROR_TEXT: Record<string, string> = {
  invalid_username: "用户名需以小写字母开头，只能用小写字母、数字和下划线，3–20 位。",
  username_reserved: "这个用户名是系统保留的，换一个吧。",
  username_taken: "这个用户名已经有人用了，换一个吧。",
  invalid_nickname: `昵称需要 ${NICKNAME_LIMITS.min}–${NICKNAME_LIMITS.max} 个字。`,
  nickname_reserved: "昵称里不能包含「官方」「管理员」这类字样。",
  invalid_bio: `简介需要 ${PROFILE_LIMITS.bioMin}–${PROFILE_LIMITS.bioMax} 个字，不想写可以留空。`,
  invalid_location: `所在地最多 ${PROFILE_LIMITS.location} 个字。`,
  invalid_website: "个人主页需要是 https:// 开头的链接，或形如 example.com 的地址。",
  onboarding_not_required: "资料已经完善过了，正在带你进站。",
  rate_limit_exceeded: "提交太频繁了，请稍后再试。",
  invalid_origin: "请求来源校验失败，请刷新页面后重试。",
};

// 用户名在输入时即归一成服务端口径(全角转半角、去空白、转小写),所见即所存。
const previewUsername = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();

export function WelcomeForm({ initialNickname }: { initialNickname: string }) {
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState(initialNickname.slice(0, NICKNAME_LIMITS.max));
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const normalized = previewUsername(username);
  const usernameLooksValid = USERNAME_PATTERN.test(normalized);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const returnTo = new URLSearchParams(window.location.search).get("return_to") ?? "/";
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: normalized, nickname, bio, location, website, return_to: returnTo }),
      });
      const result = await response.json().catch(() => ({ error: "invalid_request" })) as { error?: string; return_to?: string };
      if (!response.ok) {
        if (result.error === "onboarding_not_required") {
          // 只回站内路径:"//host"、"/\host" 会被浏览器当成跨站地址。
          window.location.assign(/^\/(?![/\\])/.test(returnTo) ? returnTo : "/");
          return;
        }
        setError(ERROR_TEXT[result.error ?? ""] ?? "出了点问题，请稍后重试。");
        return;
      }
      window.location.assign(result.return_to || "/");
    } catch {
      setError("网络异常，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-invite-form" onSubmit={submit}>
      <label htmlFor="welcome-username">用户名<span>必填 · 设定后不可修改</span></label>
      <input id="welcome-username" name="username" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={20} placeholder="例如 lin_xiaoman" value={username} onChange={(event) => setUsername(event.target.value)} required />
      <small className="welcome-hint">{username ? (usernameLooksValid ? `将保存为 @${normalized}` : "小写字母开头，可用小写字母、数字、下划线，3–20 位") : "全站唯一，用来标识你；小写字母开头，可用小写字母、数字、下划线，3–20 位"}</small>
      <label htmlFor="welcome-nickname">昵称<span>必填 · 可重复，之后可在资料页修改</span></label>
      <input id="welcome-nickname" name="nickname" type="text" autoComplete="nickname" maxLength={NICKNAME_LIMITS.max * 2} placeholder="别人看到的名字" value={nickname} onChange={(event) => setNickname(event.target.value)} required />
      <label htmlFor="welcome-bio">个人简介<span>选填 · {[...bio].length}/{PROFILE_LIMITS.bioMax}</span></label>
      <textarea id="welcome-bio" name="bio" rows={3} maxLength={PROFILE_LIMITS.bioMax * 2} placeholder="一句话介绍你自己，或你想在造场做的事" value={bio} onChange={(event) => setBio(event.target.value)} />
      <label htmlFor="welcome-location">所在地<span>选填</span></label>
      <input id="welcome-location" name="location" type="text" maxLength={PROFILE_LIMITS.location} placeholder="例如 上海" value={location} onChange={(event) => setLocation(event.target.value)} />
      <label htmlFor="welcome-website">个人主页<span>选填</span></label>
      <input id="welcome-website" name="website" type="text" inputMode="url" maxLength={PROFILE_LIMITS.website} placeholder="https://" value={website} onChange={(event) => setWebsite(event.target.value)} />
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="auth-provider github" type="submit" disabled={busy || !usernameLooksValid || !nickname.trim()}>
        <ArrowRight size={18} /><span>{busy ? "保存中…" : "完成，进入造场"}</span>
      </button>
    </form>
  );
}
