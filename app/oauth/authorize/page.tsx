import { AlertTriangle, ArrowRight, BadgeCheck, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { optionalMember } from "../../api/_lib/access-control";
import { ensureMember } from "../../api/_lib/community";
import { createAuthorizationRequest, OAUTH_SCOPES, OAuthProviderError } from "../../api/_lib/oauth-provider";
import { isLoopbackHttpRedirect } from "../../api/_lib/loopback-redirect";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export const dynamic = "force-dynamic";

function queryString(query: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  }
  return params.toString();
}

export default async function OAuthAuthorizePage({ searchParams }: PageProps) {
  const query = await searchParams;
  const currentPath = `/oauth/authorize?${queryString(query)}`;
  const member = await optionalMember();
  if (!member) {
    return <main className="oauth-gateway"><section className="oauth-consent-card"><span className="oauth-gateway-mark"><BadgeCheck size={17} /> 造场账号</span><h1>登录后继续授权</h1><p>第三方应用正在请求使用你的造场账号。登录前不会共享任何资料，也不会产生果子交易。</p><Link className="oauth-primary" href={`/signin?return_to=${encodeURIComponent(currentPath)}`}>进入造场登录 <ArrowRight size={17} /></Link></section></main>;
  }
  await ensureMember(member);
  let prepared: Awaited<ReturnType<typeof createAuthorizationRequest>> | null = null;
  let errorMessage = "";
  try {
    const requestHeaders = await headers();
    const host = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "zaochang.local").split(",")[0].trim();
    const protocol = (requestHeaders.get("x-forwarded-proto") ?? (host === "zaochang.local" ? "https" : "http")).split(",")[0].trim();
    const url = new URL(currentPath, `${protocol}://${host}`);
    prepared = await createAuthorizationRequest(url, member.email);
  } catch (error) {
    errorMessage = error instanceof OAuthProviderError ? error.description || error.code : "授权请求无法识别";
  }
  if (!prepared) return <main className="oauth-gateway"><section className="oauth-consent-card"><span className="oauth-gateway-mark"><BadgeCheck size={17} /> 造场账号</span><h1>无法继续授权</h1><p>{errorMessage}</p><Link className="oauth-secondary oauth-error-back" href="/">返回造场</Link></section></main>;
  const hasFruitWrite = prepared.scopes.some((scope) => scope === "fruit:pay" || scope === "fruit:refund");
  const dynamicClient = prepared.client.registrationSource === "dynamic";
  const loopbackRedirect = isLoopbackHttpRedirect(prepared.redirectUri);
  const redirectHost = new URL(prepared.redirectUri).host;
  return (
    <main className="oauth-gateway">
      <section className="oauth-consent-card">
        <span className="oauth-gateway-mark"><BadgeCheck size={17} /> 使用造场登录</span>
        <div className="oauth-app-identity"><span>{prepared.client.name.slice(0, 1).toUpperCase()}</span><div><small>{dynamicClient ? "未经验证的 AI 客户端（自动注册）" : prepared.client.reviewStatus === "verified" ? "已验证第三方应用" : "未验证第三方应用"}</small><h1>{dynamicClient && <small>自称：</small>}{prepared.client.name}</h1>{prepared.client.websiteUrl && <a href={prepared.client.websiteUrl} target="_blank" rel="noreferrer">{new URL(prepared.client.websiteUrl).hostname}</a>}</div></div>
        {dynamicClient && <p className="oauth-payment-warning"><AlertTriangle size={16} /><span>未经验证的应用。授权完成后会跳转到 <strong>{redirectHost}</strong>：<code className="oauth-redirect-uri">{prepared.redirectUri}</code></span></p>}
        {!dynamicClient && prepared.client.reviewStatus !== "verified" && <p className="oauth-payment-warning"><AlertTriangle size={16} /><span>此应用尚未通过造场验证。授权完成后将返回 <strong>{redirectHost}</strong>，请确认这是你信任的域名。</span></p>}
        {dynamicClient && loopbackRedirect && <p className="oauth-payment-warning">授权后会跳回你这台电脑上的程序。如果你此刻没有在用 AI 客户端连接造场，请拒绝。</p>}
        <p className="oauth-consent-lead">此应用希望连接你的造场账号。请逐项确认它能够访问的范围。</p>
        <div className="oauth-scope-list">
          {prepared.scopes.map((scope) => <div key={scope}><span>{scope.startsWith("fruit:") ? <LockKeyhole size={17} /> : <ShieldCheck size={17} />}</span><div><strong>{OAUTH_SCOPES[scope].label}</strong><small>{OAUTH_SCOPES[scope].description}</small></div><code>{scope}</code></div>)}
        </div>
        {hasFruitWrite && <p className="oauth-payment-warning"><LockKeyhole size={16} /> 允许发起不等于允许扣款。每一笔果子支付仍会回到造场，由你再次确认金额。</p>}
        <form method="post" action="/api/oauth/authorize" className="oauth-consent-actions">
          <input type="hidden" name="request_token" value={prepared.requestToken} />
          <button type="submit" name="decision" value="deny" className="oauth-secondary">拒绝</button>
          <button type="submit" name="decision" value="allow" className="oauth-primary">允许并继续 <ArrowRight size={17} /></button>
        </form>
        <small className="oauth-gateway-note">回调地址：{prepared.redirectUri}。你可以随时在开发者与授权设置中撤销访问。<Link href="/developers#authorized-apps">查看已授权应用</Link></small>
      </section>
    </main>
  );
}
