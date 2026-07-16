"use client";

import { AlertTriangle, BookOpen, Check, Code2, Copy, KeyRound, Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type ClientRecord = {
  clientId: string;
  name: string;
  description: string;
  websiteUrl: string;
  clientType: "public" | "confidential";
  allowedScopes: string;
  status: "active" | "revoked";
  reviewStatus: "unverified" | "verified" | "rejected";
  writeAccessApproved: number;
  redirectUris: string[];
  createdAt: string;
};

type SecretReveal = { clientId: string; clientSecret: string | null };
type ConsentRecord = { clientId: string; name: string; websiteUrl: string; scope: string; grantedAt: string };

const DEFAULT_SCOPES = ["openid", "profile", "email", "fruit:balance", "fruit:pay", "fruit:refund"];

export function DeveloperConsole() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [secret, setSecret] = useState<SecretReveal | null>(null);
  const [form, setForm] = useState({ name: "", description: "", websiteUrl: "", redirectUris: "", clientType: "confidential", scopes: DEFAULT_SCOPES });

  const load = async () => {
    const [clientResponse, consentResponse] = await Promise.all([
      fetch("/api/developer/clients", { cache: "no-store" }),
      fetch("/api/oauth/consents", { cache: "no-store" }),
    ]);
    if (clientResponse.ok) setClients(((await clientResponse.json()) as { clients: ClientRecord[] }).clients);
    if (consentResponse.ok) setConsents(((await consentResponse.json()) as { consents: ConsentRecord[] }).consents);
    setLoading(false);
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const toggleScope = (scope: string) => {
    if (scope === "openid") return;
    setForm((current) => ({ ...current, scopes: current.scopes.includes(scope) ? current.scopes.filter((item) => item !== scope) : [...current.scopes, scope] }));
  };

  const createClient = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setNotice("");
    const response = await fetch("/api/developer/clients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, allowedScopes: form.scopes.join(" ") }) });
    const data = await response.json() as { client?: ClientRecord & { clientSecret: string | null }; error?: string; error_description?: string };
    if (response.ok && data.client) {
      setSecret({ clientId: data.client.clientId, clientSecret: data.client.clientSecret });
      setForm({ name: "", description: "", websiteUrl: "", redirectUris: "", clientType: "confidential", scopes: DEFAULT_SCOPES });
      await load();
    } else {
      setNotice(data.error_description ?? (data.error === "public_client_write_scope_forbidden" ? "公开客户端不能申请支付或退款权限。" : "应用资料不符合要求，请检查网址、回调地址和权限。"));
    }
    setCreating(false);
  };

  const clientAction = async (clientId: string, action: "rotate_secret" | "revoke") => {
    const response = await fetch("/api/developer/clients", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId, action }) });
    const data = await response.json() as { clientSecret?: string };
    if (response.ok) {
      if (data.clientSecret) setSecret({ clientId, clientSecret: data.clientSecret });
      await load();
    } else setNotice("操作没有生效，请刷新后重试。");
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("已复制到剪贴板");
    } catch {
      setNotice("浏览器未允许复制，请手动选择并复制 Client ID。");
    }
  };

  const revokeConsent = async (clientId: string) => {
    const response = await fetch("/api/oauth/consents", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId }) });
    if (response.ok) { setNotice("应用授权与现有令牌已经撤销"); await load(); }
    else setNotice("授权撤销没有生效，请刷新后重试。");
  };

  return (
    <div className="developers-page">
      <header className="route-hero developer-hero"><div><span className="deep-eyebrow"><Code2 size={14} /> ZAOCHANG IDENTITY PLATFORM</span><h1>开发者接入中心</h1><p>让外部产品使用造场账号登录，并通过用户逐笔确认的方式接入果子支付。</p></div><Link href="/developers/docs"><BookOpen size={17} /> 查看 API 文档</Link></header>
      <section className="developer-security-strip"><span><ShieldCheck size={20} /></span><div><strong>默认拒绝，按范围授权</strong><small>没有充值、铸果、提现 API；支付权限不能直接扣款，每笔订单都要回到造场确认。</small></div></section>
      {notice && <p className="developer-notice">{notice}</p>}
      {secret && <section className="developer-secret" role="alert"><AlertTriangle size={20} /><div><strong>{secret.clientSecret ? "客户端密钥只显示这一次" : "公开客户端已创建"}</strong><p>{secret.clientSecret ? "关闭后无法找回，只能重新生成。不要放进网页、移动端安装包或公开仓库。" : "公开客户端不生成客户端密钥；请保存 Client ID，并始终使用 PKCE 完成授权。"}</p><code>{secret.clientId}</code>{secret.clientSecret && <code>{secret.clientSecret}</code>}</div><button onClick={() => setSecret(null)}><Check size={16} /> {secret.clientSecret ? "我已安全保存" : "我已记录 Client ID"}</button></section>}
      <div className="developer-grid">
        <section className="developer-app-list"><div className="panel-heading"><span><KeyRound size={17} /> 我的应用</span><small>{clients.length} 个</small></div>{loading ? <p className="developer-empty">正在读取应用</p> : clients.length ? clients.map((client) => <article className="developer-app" key={client.clientId}><div className="developer-app-head"><span>{client.name.slice(0, 1).toUpperCase()}</span><div><strong>{client.name}</strong><small>{client.clientType === "confidential" ? "保密客户端" : "公开客户端"} · {client.status === "active" ? "运行中" : "已撤销"}</small></div></div><p>{client.description || "暂无描述"}</p><p>{client.reviewStatus === "verified" ? "应用身份已验证" : client.reviewStatus === "rejected" ? "应用审核未通过" : "应用身份未验证"}{client.allowedScopes.includes("fruit:pay") ? client.writeAccessApproved === 1 ? " · 果子写权限已批准" : " · 果子写权限审核中" : ""}</p><label>CLIENT ID <button onClick={() => copy(client.clientId)} aria-label="复制 Client ID"><Copy size={13} /></button></label><code>{client.clientId}</code><label>回调地址</label>{client.redirectUris.map((uri) => <code key={uri}>{uri}</code>)}<label>授权范围</label><div className="developer-scope-chips">{client.allowedScopes.split(" ").map((scope) => <span key={scope}>{scope}</span>)}</div>{client.status === "active" && <div className="developer-app-actions">{client.clientType === "confidential" && <button onClick={() => clientAction(client.clientId, "rotate_secret")}><RotateCcw size={14} /> 重置密钥</button>}<button className="danger" onClick={() => clientAction(client.clientId, "revoke")}><Trash2 size={14} /> 撤销应用</button></div>}</article>) : <p className="developer-empty">还没有第三方应用</p>}</section>
        <form className="developer-create" onSubmit={createClient}><div className="panel-heading"><span><Plus size={17} /> 注册应用</span><small>{form.clientType === "public" ? "公开客户端不生成密钥" : "密钥仅显示一次"}</small></div><label>应用名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={2} maxLength={60} /></label><label>一句介绍<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={240} /></label><label>应用主页<input type="url" placeholder="https://example.com" value={form.websiteUrl} onChange={(event) => setForm({ ...form, websiteUrl: event.target.value })} required /></label><label>精确回调地址<textarea placeholder={"https://example.com/oauth/callback\nhttp://localhost:3000/callback"} value={form.redirectUris} onChange={(event) => setForm({ ...form, redirectUris: event.target.value })} required /></label><label>客户端类型<select value={form.clientType} onChange={(event) => { const clientType = event.target.value; setForm((current) => ({ ...current, clientType, scopes: clientType === "public" ? current.scopes.filter((scope) => !scope.startsWith("fruit:p") && scope !== "fruit:refund") : current.scopes })); }}><option value="confidential">保密客户端 · 服务端应用</option><option value="public">公开客户端 · SPA / 移动端</option></select></label><fieldset><legend>授权范围</legend>{DEFAULT_SCOPES.map((scope) => { const disabled = scope === "openid" || (form.clientType === "public" && (scope === "fruit:pay" || scope === "fruit:refund")); return <label key={scope} className={disabled && scope !== "openid" ? "disabled" : ""}><input type="checkbox" checked={form.scopes.includes(scope)} disabled={disabled} onChange={() => toggleScope(scope)} /><span>{scope}</span></label>; })}</fieldset><button className="developer-submit" disabled={creating}>{creating ? "正在注册" : "创建应用"} <Plus size={16} /></button></form>
      </div>
      <section className="developer-consents"><div className="panel-heading"><span><ShieldCheck size={17} /> 已授权应用</span><small>撤销后令牌立即失效</small></div>{consents.length ? consents.map((consent) => <article key={consent.clientId}><div><strong>{consent.name}</strong><a href={consent.websiteUrl} target="_blank" rel="noreferrer">{new URL(consent.websiteUrl).hostname}</a><small>{consent.scope}</small></div><button onClick={() => revokeConsent(consent.clientId)}><Trash2 size={14} /> 撤销授权</button></article>) : <p className="developer-empty">还没有授权任何第三方应用</p>}</section>
    </div>
  );
}
