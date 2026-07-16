import { ArrowLeft, BookOpen, KeyRound, LockKeyhole, RefreshCcw, WalletCards } from "lucide-react";
import Link from "next/link";

const authorizeExample = `GET /oauth/authorize?\
response_type=code&\
client_id=zc_your_client_id&\
redirect_uri=https%3A%2F%2Fexample.com%2Foauth%2Fcallback&\
scope=openid%20profile%20email%20fruit%3Abalance&\
state=your_random_state&\
nonce=your_random_nonce&\
code_challenge=BASE64URL_SHA256_VERIFIER&\
code_challenge_method=S256`;

const tokenExample = `curl -X POST https://YOUR_ZAOCHANG_HOST/api/oauth/token \\
  -u 'zc_client_id:zcs_client_secret' \\
  -H 'Content-Type: application/x-www-form-urlencoded' \\
  --data-urlencode 'grant_type=authorization_code' \\
  --data-urlencode 'code=zcc_returned_code' \\
  --data-urlencode 'redirect_uri=https://example.com/oauth/callback' \\
  --data-urlencode 'code_verifier=ORIGINAL_PKCE_VERIFIER'`;

const paymentExample = `curl -X POST https://YOUR_ZAOCHANG_HOST/api/v1/fruit/payments \\
  -H 'Authorization: Bearer zca_access_token' \\
  -H 'Idempotency-Key: order_20260713_001' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "externalReference": "pro_plan",
    "title": "专业版一次解锁",
    "description": "解锁团队协作能力",
    "pricingModel": "one_time",
    "amount": 8,
    "returnUri": "https://example.com/payment/callback"
  }'`;

export default function DeveloperDocsPage() {
  return (
    <div className="developer-docs">
      <header>
        <Link href="/developers"><ArrowLeft size={16} /> 返回开发者中心</Link>
        <span className="deep-eyebrow"><BookOpen size={14} /> API REFERENCE / V1</span>
        <h1>造场身份与果子 API</h1>
        <p>OAuth 2.1 Authorization Code + PKCE、OIDC ES256 ID Token，以及必须逐笔确认的果子支付。</p>
      </header>
      <nav>
        <a href="#discovery">服务发现</a>
        <a href="#login">登录</a>
        <a href="#tokens">令牌</a>
        <a href="#fruit">果子 API</a>
        <a href="#errors">错误与安全</a>
      </nav>
      <main>
        <section id="discovery">
          <h2><KeyRound size={20} /> 服务发现</h2>
          <p>OIDC 客户端应先读取发现文档，不要硬编码签名公钥。</p>
          <code className="doc-endpoint">GET /.well-known/openid-configuration</code>
          <code className="doc-endpoint">GET /api/oauth/jwks</code>
        </section>
        <section id="login">
          <h2><LockKeyhole size={20} /> 使用造场登录</h2>
          <p>仅支持授权码模式并强制 PKCE S256。回调地址必须与控制台登记值逐字一致；<code>state</code> 必须由客户端校验。</p>
          <p>应用注册后默认为未验证。<code>fruit:pay</code> 与 <code>fruit:refund</code> 必须等待造场人工审核；公开客户端不能申请这两项权限。</p>
          <pre>{authorizeExample}</pre>
        </section>
        <section id="tokens">
          <h2><RefreshCcw size={20} /> 交换与轮换令牌</h2>
          <p>访问令牌有效 1 小时；刷新令牌有效 30 天且每次使用后立即轮换。旧令牌重放会撤销整个令牌族及其派生访问令牌，客户端应要求用户重新授权。</p>
          <pre>{tokenExample}</pre>
          <code className="doc-endpoint">GET /api/oauth/userinfo</code>
          <code className="doc-endpoint">POST /api/oauth/revoke</code>
        </section>
        <section id="fruit">
          <h2><WalletCards size={20} /> 果子支付</h2>
          <p><code>fruit:balance</code> 只读余额；<code>fruit:pay</code> 只能创建支付意图。接口返回 <code>approvalUrl</code> 后，必须把用户带回造场逐笔确认，创建意图本身不会扣果。</p>
          <code className="doc-endpoint">GET /api/v1/fruit/wallet</code>
          <code className="doc-endpoint">POST /api/v1/fruit/payments</code>
          <code className="doc-endpoint">GET /api/v1/fruit/payments/:id</code>
          <code className="doc-endpoint">POST /api/v1/fruit/payments/:id/refund</code>
          <pre>{paymentExample}</pre>
          <p>新账户余额为 0。账号注册满 24 小时后才可发生付费转移；一次解锁在 10 分钟内可退款，按次体验确认后不可退款，创作者收入进入 24 小时待结算余额。</p>
        </section>
        <section id="errors">
          <h2>错误与安全边界</h2>
          <ul>
            <li><code>unauthorized_client</code>：应用尚未通过写权限审核。</li>
            <li><code>invalid_token</code>：令牌无效、过期、已撤销或令牌族发生重放。</li>
            <li><code>insufficient_scope</code>：令牌没有所需范围。</li>
            <li><code>idempotency_conflict</code>：同一幂等键被用于不同请求。</li>
            <li><code>account_too_new_for_transfer</code>：账号未满 24 小时。</li>
            <li><code>insufficient_balance</code>：余额不足，买卖双方均不发生变化。</li>
            <li><code>wallet_ledger_mismatch</code>：钱包与账本不一致，交易被阻止并进入人工复核。</li>
            <li><code>payment_expired</code>：15 分钟内未确认，支付意图失效。</li>
          </ul>
          <p>平台没有充值、购买果子、铸果、提现或法币兑换接口。外部应用也不能获得这些能力。</p>
        </section>
      </main>
    </div>
  );
}
