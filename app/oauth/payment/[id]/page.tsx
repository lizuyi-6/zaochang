import { ArrowRight, BadgeCheck, Coins, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { ensureMember, optionalMember } from "../../../api/_lib/community";
import { ExternalFruitError, prepareExternalPaymentApproval } from "../../../api/_lib/external-fruit";

type PageProps = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export default async function ExternalPaymentPage({ params }: PageProps) {
  const { id } = await params;
  const member = await optionalMember();
  if (!member) return <main className="oauth-gateway"><section className="oauth-consent-card"><span className="oauth-gateway-mark"><Coins size={17} /> 果子支付</span><h1>登录后确认支付</h1><p>只有支付意图对应的造场账号能够查看并确认这笔订单。</p><Link className="oauth-primary" href={`/signin?return_to=${encodeURIComponent(`/oauth/payment/${id}`)}`}>登录造场 <ArrowRight size={17} /></Link></section></main>;
  await ensureMember(member);
  let prepared: Awaited<ReturnType<typeof prepareExternalPaymentApproval>> | null = null;
  let errorMessage = "";
  try {
    prepared = await prepareExternalPaymentApproval(id, member.email);
  } catch (error) {
    errorMessage = error instanceof ExternalFruitError && error.code === "payment_not_found" ? "订单不存在，或它不属于当前账号。" : "订单暂时无法读取。";
  }
  if (!prepared) return <main className="oauth-gateway"><section className="oauth-consent-card"><span className="oauth-gateway-mark"><Coins size={17} /> 果子支付</span><h1>无法确认订单</h1><p>{errorMessage}</p><Link className="oauth-secondary oauth-error-back" href="/">返回造场</Link></section></main>;
  const payment = prepared.payment;
  if (payment.status !== "pending" || !prepared.challenge) {
    return <main className="oauth-gateway"><section className="oauth-consent-card"><span className="oauth-gateway-mark"><BadgeCheck size={17} /> 果子支付</span><h1>{payment.status === "paid" || payment.status === "settled" ? "这笔订单已经支付" : payment.status === "refunded" ? "这笔订单已经退款" : "这笔订单已经结束"}</h1><p>{payment.clientName} · {payment.title} · {payment.amount} 果</p><small className="oauth-gateway-note">订单状态以造场 API 查询结果为准，回跳参数不构成支付凭证。</small></section></main>;
  }
  return <main className="oauth-gateway"><section className="oauth-consent-card payment-confirm-card"><span className="oauth-gateway-mark"><Coins size={17} /> 造场果子支付</span><div className="oauth-app-identity"><span>{payment.clientName.slice(0, 1).toUpperCase()}</span><div><small>收款应用</small><h1>{payment.clientName}</h1><p>{payment.title}</p></div></div><div className="payment-confirm-amount"><small>本次支付</small><strong>{payment.amount}<span>果</span></strong><em>{payment.pricingModel === "one_time" ? "一次解锁" : "按次体验"}</em></div><p className="oauth-consent-lead">{payment.description || "该应用没有补充订单说明。"}</p><div className="payment-balance-row"><span>支付前可用余额</span><strong>{prepared.wallet.balance} 果</strong><span>支付后</span><strong>{prepared.wallet.balance - payment.amount} 果</strong></div>{prepared.wallet.balance < payment.amount && <p className="oauth-payment-warning"><LockKeyhole size={16} /> 果子余额不足。这笔订单不会改变任何一方余额。</p>}<div className="payment-terms"><ShieldCheck size={16} /><span>{payment.pricingModel === "one_time" ? "10 分钟内可在 API 或钱包发起退款；收入 24 小时后结算。" : "确认进入后不可退款；收入 24 小时后结算。"}</span></div><form method="post" action="/api/v1/fruit/payments/approve" className="oauth-consent-actions"><input type="hidden" name="payment_id" value={payment.id} /><input type="hidden" name="challenge" value={prepared.challenge} /><button type="submit" name="decision" value="deny" className="oauth-secondary">取消</button><button type="submit" name="decision" value="allow" className="oauth-primary" disabled={prepared.wallet.balance < payment.amount}>确认支付 {payment.amount} 果 <ArrowRight size={17} /></button></form><small className="oauth-gateway-note">果子不能购买、充值、提现或兑换法币。第三方应用不能跳过本页直接扣果。</small></section></main>;
}
