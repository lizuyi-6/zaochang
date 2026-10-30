"use client";

import { AtSign, Save } from "lucide-react";
import { useState } from "react";
import { NICKNAME_LIMITS, USERNAME_PATTERN } from "../../api/_lib/member-identity-rules";

const ERROR_TEXT: Record<string, string> = {
  invalid_username: "用户名需以小写字母开头，只能用小写字母、数字和下划线，3–20 位。",
  username_reserved: "这个用户名是系统保留的，换一个吧。",
  username_taken: "这个用户名已经有人用了。",
  username_already_set: "用户名已经设定过，不能再修改。",
  invalid_nickname: `昵称需要 ${NICKNAME_LIMITS.min}–${NICKNAME_LIMITS.max} 个字。`,
  nickname_reserved: "昵称里不能包含「官方」「管理员」这类字样。",
  rate_limit_exceeded: "修改太频繁了，请稍后再试。",
};

// 账户身份:昵称随时可改;用户名只能设一次(存量会员在这里认领,之后只读)。
export function IdentityEditor({ initial }: { initial: { username: string | null; nickname: string } }) {
  const [username, setUsername] = useState(initial.username);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [nickname, setNickname] = useState(initial.nickname);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const normalized = usernameDraft.normalize("NFKC").replace(/\s+/g, "").toLowerCase();

  async function save(body: Record<string, string>, success: string) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/profile/identity", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({})) as { error?: string; username?: string | null; nickname?: string };
      if (!response.ok) {
        setNotice(ERROR_TEXT[result.error ?? ""] ?? "保存失败，请稍后重试。");
        return;
      }
      if (result.username) setUsername(result.username);
      if (result.nickname) setNickname(result.nickname);
      setUsernameDraft("");
      setNotice(success);
    } catch {
      setNotice("网络异常，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="passkey-manager identity-editor">
      <header>
        <div>
          <span>ACCOUNT IDENTITY</span>
          <h2>用户名与昵称</h2>
          <p>用户名全站唯一，设定后不可修改；昵称是别人看到的名字，可以重复、随时修改。</p>
        </div>
      </header>
      <div className="identity-editor-grid">
        <label>
          <span>用户名</span>
          {username ? (
            <strong className="identity-username"><AtSign size={14} />{username}<small>已设定，不可修改</small></strong>
          ) : (
            <span className="identity-inline">
              <input value={usernameDraft} maxLength={20} placeholder="小写字母开头，3–20 位" autoCapitalize="none" spellCheck={false} onChange={(event) => setUsernameDraft(event.target.value)} />
              <button className="primary-action" type="button" disabled={busy || !USERNAME_PATTERN.test(normalized)} onClick={() => void save({ username: normalized }, `用户名已设定为 @${normalized}`)}>设定（仅一次）</button>
            </span>
          )}
        </label>
        <label>
          <span>昵称</span>
          <span className="identity-inline">
            <input value={nickname} maxLength={NICKNAME_LIMITS.max * 2} onChange={(event) => setNickname(event.target.value)} />
            <button className="primary-action" type="button" disabled={busy || !nickname.trim() || nickname === initial.nickname} onClick={() => void save({ nickname }, "昵称已保存")}><Save size={15} /> 保存昵称</button>
          </span>
        </label>
      </div>
      {notice && <button className="action-toast" onClick={() => setNotice("")}>{notice}</button>}
    </section>
  );
}
