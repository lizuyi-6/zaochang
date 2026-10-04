"use client";

import { Fingerprint, Trash2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/server";

export type PasskeyItem = {
  credential_id: string;
  name: string;
  device_type: string;
  backed_up: boolean;
  transports: string[];
  created_at: string;
  last_used_at: string | null;
};

const ERRORS: Record<string, string> = {
  rate_limited: "尝试太频繁了，请稍等几分钟再试。",
  challenge_invalid: "注册会话已过期，请重新点击添加。",
  verification_failed: "通行密钥注册没有通过验证，请重试。",
  credential_exists: "这把通行密钥已经添加过了。",
  credential_not_found: "这把通行密钥已不存在，列表已刷新。",
};

function errorText(code: string | undefined) {
  return ERRORS[code ?? ""] ?? "出了点问题，请稍后重试。";
}

// 与登录页同款特性检测(useSyncExternalStore,SSR snapshot=false 无 hydration 抖动)。
const noopSubscribe = () => () => {};

// 通行密钥管理(编辑资料页):列出当前成员的凭据,支持添加本设备、就地改名、删除。
// 添加走与登录页同构的 options → startRegistration → verify 三步;passkey 是追加
// 凭据,删除不影响 GitHub/邮箱码登录。
export function PasskeyManager({ initial }: { initial: PasskeyItem[] }) {
  const [items, setItems] = useState(initial);
  const supported = useSyncExternalStore(noopSubscribe, () => browserSupportsWebAuthn(), () => false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.map((item) => [item.credential_id, item.name])),
  );

  async function register() {
    setBusy(true);
    setNotice("");
    try {
      const optionsResponse = await fetch("/api/auth/passkey/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const options = await optionsResponse.json().catch(() => null) as PublicKeyCredentialCreationOptionsJSON | null;
      if (!optionsResponse.ok || !options) {
        setNotice(errorText((options as { error?: string } | null)?.error));
        return;
      }
      const credential = await startRegistration({ optionsJSON: options });
      const verify = await fetch("/api/auth/passkey/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const result = await verify.json().catch(() => null) as { credential_id?: string; name?: string; error?: string } | null;
      if (!verify.ok || !result?.credential_id) {
        setNotice(errorText(result?.error));
        return;
      }
      const created = { credential_id: result.credential_id as string, name: (result.name ?? "").trim() || "通行密钥" };
      setItems((prev) => [{
        credential_id: created.credential_id,
        name: created.name,
        device_type: "singleDevice",
        backed_up: false,
        transports: [],
        created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
        last_used_at: null,
      }, ...prev]);
      setDrafts((prev) => ({ ...prev, [created.credential_id]: created.name }));
      setNotice("通行密钥已添加，下次登录可以直接使用。");
    } catch {
      // startRegistration 的 NotAllowedError 多为用户取消仪式。
      setNotice("通行密钥没有完成注册，请重试。");
    } finally {
      setBusy(false);
    }
  }

  async function saveName(item: PasskeyItem) {
    const name = (drafts[item.credential_id] ?? "").trim();
    if (!name || name === item.name) return;
    const response = await fetch("/api/auth/passkey/credentials/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential_id: item.credential_id, name }),
    });
    if (response.ok) {
      setItems((prev) => prev.map((row) => (row.credential_id === item.credential_id ? { ...row, name } : row)));
    } else {
      setNotice(errorText(((await response.json().catch(() => null)) as { error?: string })?.error));
    }
  }

  async function remove(item: PasskeyItem) {
    if (!window.confirm(`删除「${item.name}」？删除后这台设备将不能再用通行密钥登录。`)) return;
    const response = await fetch("/api/auth/passkey/credentials/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential_id: item.credential_id }),
    });
    if (response.ok) {
      setItems((prev) => prev.filter((row) => row.credential_id !== item.credential_id));
      setNotice("通行密钥已删除。");
    } else {
      setNotice(errorText(((await response.json().catch(() => null)) as { error?: string })?.error));
    }
  }

  return (
    <section className="passkey-manager">
      <header>
        <div>
          <span>PASSKEYS / {String(items.length).padStart(2, "0")}</span>
          <h2>通行密钥</h2>
          <p>用指纹、面容或设备 PIN 登录造场，无需邮箱验证码。密钥保存在你的设备里，服务器只存公钥。</p>
        </div>
        {supported && (
          <button className="primary-action" type="button" onClick={register} disabled={busy}>
            <Fingerprint size={16} /> {busy ? "等待通行密钥…" : "添加此设备的通行密钥"}
          </button>
        )}
      </header>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.credential_id}>
              <Fingerprint size={16} />
              <div>
                <input
                  value={drafts[item.credential_id] ?? item.name}
                  maxLength={60}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [item.credential_id]: event.target.value }))}
                  onBlur={() => void saveName(item)}
                  onKeyDown={(event) => { if (event.key === "Enter") void saveName(item); }}
                  aria-label="通行密钥名称"
                />
                <small>
                  {item.device_type === "multiDevice" ? "可在设备间同步" : "仅限当前设备"}
                  {item.backed_up ? " · 已备份" : ""}
                  {item.last_used_at ? ` · 最近使用 ${item.last_used_at.slice(0, 10)}` : " · 从未使用"}
                </small>
              </div>
              <button type="button" onClick={() => void remove(item)} aria-label={`删除 ${item.name}`}>
                <Trash2 size={14} /> 删除
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="passkey-empty">还没有通行密钥。添加后登录页会出现「使用通行密钥登录」按钮，一键进入造场。</p>
      )}
      {notice && <button className="action-toast" onClick={() => setNotice("")}>{notice}</button>}
    </section>
  );
}
