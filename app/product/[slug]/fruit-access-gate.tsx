"use client";

import { ArrowRight, Coins, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "../../lib/community-data";

type PaymentState = {
  wallet?: { balance: number; pendingBalance: number; status: string } | null;
  access?: { allowed: boolean; reason: string };
};

const errorCopy: Record<string, string> = {
  insufficient_balance: "果子余额不足。果子不能购买，只能通过真实社区贡献获得。",
  wallet_restricted: "钱包正在审核，暂时不能发生交易。",
  account_too_new_for_transfer: "新账号需满 24 小时才能支付，探索金不会被批量账号转移。",
  product_not_found: "这个作品暂时不能交易。",
};

export function FruitAccessGate({ product, children }: { product: Product; children: ReactNode }) {
  const router = useRouter();
  const idempotencyRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(typeof product.id === "number" && product.pricingModel !== "free");
  const [access, setAccess] = useState(product.pricingModel === "free" || typeof product.id !== "number");
  const [signedIn, setSignedIn] = useState(true);
  const [wallet, setWallet] = useState<PaymentState["wallet"]>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof product.id !== "number" || product.pricingModel === "free") return;
    let active = true;
    fetch(`/api/payments?productId=${product.id}`, { cache: "no-store" })
      .then(async (response) => {
        if (!active) return;
        if (response.status === 401) { setSignedIn(false); setLoading(false); return; }
        const data = await response.json() as PaymentState;
        setWallet(data.wallet ?? null);
        setAccess(Boolean(data.access?.allowed));
        setLoading(false);
      })
      .catch(() => { if (active) { setError("支付状态暂时不可用"); setLoading(false); } });
    return () => { active = false; };
  }, [product.id, product.pricingModel]);

  const checkout = async () => {
    if (typeof product.id !== "number") return;
    setPaying(true);
    setError("");
    idempotencyRef.current ??= `checkout_${crypto.randomUUID()}`;
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "checkout", productId: product.id, idempotencyKey: idempotencyRef.current }),
      });
      if (response.status === 401) {
        router.push(`/signin?return_to=${encodeURIComponent(`/product/${product.id}`)}`);
        return;
      }
      const data = await response.json() as PaymentState & { error?: string };
      if (!response.ok) {
        setError(errorCopy[data.error ?? ""] ?? "交易没有生效，请稍后重试。");
        return;
      }
      setWallet(data.wallet ?? null);
      setAccess(true);
      idempotencyRef.current = null;
    } catch {
      setError("网络中断，重试会沿用同一订单，不会重复扣款。");
    } finally {
      setPaying(false);
    }
  };

  if (access) return <>{children}</>;

  return (
    <section className="fruit-paywall" aria-live="polite">
      <div className="fruit-paywall-orbit"><i /><i /><span><LockKeyhole size={22} /></span></div>
      <span className="deep-eyebrow"><ShieldCheck size={14} /> CLOSED-LOOP FRUIT PAYMENT</span>
      <h2>{loading ? "正在读取访问权益" : product.pricingModel === "one_time" ? "一次解锁这件作品" : "开始一次新的体验"}</h2>
      <p>{product.pricingModel === "one_time" ? "支付一次后持续访问；10 分钟内可以在钱包申请退款。" : "每次进入单独结算；作品开始后，本次费用不可退款。"}</p>
      <strong><Coins size={20} /> {product.price}<small>果</small></strong>
      {wallet && <div className="fruit-paywall-balance"><span>当前可用</span><b>{wallet.balance} 果</b><span>待结算</span><b>{wallet.pendingBalance} 果</b></div>}
      {!signedIn ? <button onClick={() => router.push(`/signin?return_to=${encodeURIComponent(`/product/${product.id}`)}`)}>登录后继续 <ArrowRight size={17} /></button> : <button onClick={checkout} disabled={loading || paying}>{paying ? "正在生成订单" : loading ? "读取中" : product.pricingModel === "one_time" ? "确认解锁" : "支付并进入"}<ArrowRight size={17} /></button>}
      {error && <em>{error}</em>}
      <small>果子不能充值、购买或提现。每次扣款都有唯一订单和可审计流水。</small>
    </section>
  );
}
