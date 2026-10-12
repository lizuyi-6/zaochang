"use client";

import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

export type ApiKeyItem = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  status: "active" | "expired" | "revoked";
};

function configText(kind: "claude" | "codex" | "cursor", origin: string, token: string) {
  const endpoint = `${origin}/api/mcp`;
  if (kind === "claude") return `claude mcp add --transport http zaochang ${endpoint} --header "Authorization: Bearer ${token}"`;
  if (kind === "codex") return `codex mcp add zaochang --url "${endpoint}" --bearer-token-env-var ZAOCHANG_API_KEY`;
  return JSON.stringify({ mcpServers: { zaochang: { url: endpoint, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);
}

function oauthConfigText(kind: "claude" | "codex", origin: string) {
  const endpoint = `${origin}/api/mcp`;
  // 片段只放可直接粘进终端执行的命令；说明文字放在代码块外，否则「复制接入命令」会把中文句子一起复制进终端。
  if (kind === "claude") return `claude mcp add --transport http zaochang "${endpoint}"\nclaude mcp login zaochang`;
  return `codex mcp add zaochang --url "${endpoint}"\ncodex mcp login zaochang --oauth-client-registration dcr`;
}

export function ApiKeyManager({ initial, publicOrigin }: { initial: ApiKeyItem[]; publicOrigin: string }) {
  const [items, setItems] = useState(initial);
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [createdToken, setCreatedToken] = useState("");
  const [createdName, setCreatedName] = useState("");
  const [copied, setCopied] = useState("");
  const origin = publicOrigin || (typeof window === "undefined" ? "" : window.location.origin);

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setNotice("复制失败，请手动选择并复制文本。");
    }
  }

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const response = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, expires_in_days: expiresInDays }),
    });
    const result = await response.json().catch(() => null) as { token?: string; key?: ApiKeyItem; error?: string } | null;
    setBusy(false);
    if (!response.ok || !result?.token || !result.key) {
      setNotice(result?.error === "api_key_limit_reached" ? "最多保留 5 把有效 API key。" : "创建失败，请稍后重试。");
      return;
    }
    setItems((current) => [result.key!, ...current]);
    setCreatedToken(result.token);
    setCreatedName(result.key.name);
    setName("");
    setNotice("明文只显示这一次。请先复制并保存到本地环境变量。");
  }

  async function revoke(item: ApiKeyItem) {
    if (!window.confirm(`吊销「${item.name}」？使用这把 key 的 agent 将立即失去访问权限。`)) return;
    const response = await fetch("/api/api-keys", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });
    if (!response.ok) {
      setNotice("吊销失败，请刷新后重试。");
      return;
    }
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: "revoked", revokedAt: new Date().toISOString() } : row));
    if (createdToken && item.prefix === createdToken.slice(0, item.prefix.length)) setCreatedToken("");
    setNotice("API key 已吊销。");
  }

  return (
    <section className="api-key-manager">
      <header>
        <div>
          <span>AGENT CONNECT / {String(items.length).padStart(2, "0")}</span>
          <h2>Agent API key</h2>
          <p>首选 OAuth 浏览器授权：Claude Code 或 Codex CLI 自动注册后，会打开造场登录与同意页；令牌只能管理你自己的项目。个人 API key 作为无浏览器环境与 CI 的备选，并继续进入造场审核。</p>
          <p>OAuth 授权单独管理：<a href="/developers#authorized-apps">查看或撤销已授权应用</a>。</p>
        </div>
        <a className="api-key-skill-link" href="/skills/zaochang/SKILL.md" download>下载造场 Skill</a>
      </header>

      <div className="api-key-configs api-key-oauth-configs">
        <strong>OAuth 一键接入（推荐）</strong>
        {(["claude", "codex"] as const).map((kind) => {
          const label = kind === "claude" ? "Claude Code" : "Codex CLI";
          const value = oauthConfigText(kind, origin);
          return <div key={kind}><span>{label}</span><pre><code>{value}</code></pre><button type="button" onClick={() => void copy(`oauth-${kind}`, value)}><Copy size={13} />{copied === `oauth-${kind}` ? "已复制" : "复制接入命令"}</button></div>;
        })}
        <p>两条命令依次执行；第二条会打开浏览器，在造场登录并同意后即可使用。也可以在 Claude Code 会话里运行 <code>/mcp</code> 完成授权。<a href="/developers#authorized-apps">查看或撤销「已授权应用」</a></p>
      </div>

      <form className="api-key-create" onSubmit={(event) => void createKey(event)}>
        <label>
          <span>名称</span>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required placeholder="例如：我的 Codex" />
        </label>
        <label>
          <span>有效期</span>
          <select value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value))}>
            <option value={30}>30 天</option>
            <option value={90}>90 天</option>
            <option value={365}>365 天</option>
          </select>
        </label>
        <button className="primary-action" type="submit" disabled={busy || !name.trim()}>
          <KeyRound size={15} /> {busy ? "创建中…" : "创建 API key"}
        </button>
      </form>

      {createdToken && (
        <div className="api-key-created">
          <strong>「{createdName}」的明文 key（仅此一次）</strong>
          <div className="api-key-secret-line">
            <code>{createdToken}</code>
            <button type="button" onClick={() => void copy("key", createdToken)}><Copy size={14} />{copied === "key" ? "已复制" : "复制 key"}</button>
          </div>
          <p>API key 仅作为无浏览器环境与 CI 的备选。建议写入本机环境变量 <code>ZAOCHANG_API_KEY</code>，不要粘贴进项目仓库文件。</p>
          <div className="api-key-configs">
            <strong>个人 API key 备选配置</strong>
            {(["claude", "codex", "cursor"] as const).map((kind) => {
              const label = kind === "claude" ? "Claude Code" : kind === "codex" ? "Codex CLI" : "Cursor / 通用 JSON";
              const value = configText(kind, origin, createdToken);
              return <div key={kind}><span>{label}</span><pre><code>{value}</code></pre><button type="button" onClick={() => void copy(kind, value)}><Copy size={13} />{copied === kind ? "已复制" : "复制配置"}</button></div>;
            })}
          </div>
        </div>
      )}

      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <KeyRound size={16} />
              <div className="api-key-metadata">
                <strong>{item.name}</strong>
                <code>{item.prefix}…</code>
                <small>创建 {item.createdAt} · 到期 {item.expiresAt} · 最近使用 {item.lastUsedAt ?? "从未使用"}</small>
              </div>
              <span className={`api-key-status api-key-status-${item.status}`}>{item.status === "active" ? "有效" : item.status === "expired" ? "已过期" : "已吊销"}</span>
              {item.status === "active" && <button type="button" onClick={() => void revoke(item)} aria-label={`吊销 ${item.name}`}><Trash2 size={14} />吊销</button>}
            </li>
          ))}
        </ul>
      ) : <p className="api-key-empty">还没有个人 API key。创建后可在这里查看有效期、使用时间并随时吊销。</p>}
      {notice && <p className="api-key-notice" role="status">{copied && notice.includes("复制") ? <Check size={14} /> : null}{notice}</p>}
    </section>
  );
}
