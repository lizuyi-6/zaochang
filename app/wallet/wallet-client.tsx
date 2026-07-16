"use client";

import { motion } from "framer-motion";
import { ArrowDownLeft, Coins, Heart, History, LockKeyhole, RotateCcw, ShieldCheck, Sparkles, TrendingUp, WalletCards, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "../components/animated-number";

type Transaction = { id: number; delta: number; type: string; description: string; createdAt: string };
type Wallet = { balance: number; pendingBalance: number; lifetimeEarned: number; lifetimeSpent: number; status: string };
type Order = { id: string; productId: number | null; productTitle: string; pricingModel: "one_time" | "per_use"; amount: number; status: "pending" | "paid" | "settled" | "refunded" | "cancelled" | "expired"; purchasedAt: string; refundable: number; source: "internal" | "external"; clientName: string | null };

export function WalletClient() {
  const [wallet, setWallet] = useState<Wallet>({ balance: 0, pendingBalance: 0, lifetimeEarned: 0, lifetimeSpent: 0, status: "active" });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [notice, setNotice] = useState("");
  const [refunding, setRefunding] = useState("");
  const refundKeys = useRef(new Map<string, string>());

  const load = async () => {
    const response = await fetch("/api/community", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as { wallet?: Wallet | null; transactions?: Transaction[]; orders?: Order[] };
    if (data.wallet) setWallet(data.wallet);
    setTransactions(data.transactions ?? []);
    setOrders(data.orders ?? []);
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const exportTransactions = () => {
    const csv = ["时间,类型,说明,变动", ...transactions.map((item) => [item.createdAt, item.type, item.description, item.delta].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `zaochang-wallet-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("流水 CSV 已导出");
  };

  const refund = async (order: Order) => {
    setRefunding(order.id);
    const key = refundKeys.current.get(order.id) ?? `refund_${crypto.randomUUID()}`;
    refundKeys.current.set(order.id, key);
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(order.source === "external" ? { action: "external_refund", paymentId: order.id, idempotencyKey: key } : { action: "refund", orderId: order.id, idempotencyKey: key }),
      });
      const data = await response.json() as { error?: string };
      if (response.ok) {
        refundKeys.current.delete(order.id);
        setNotice(`${order.productTitle} 已退款，解锁权益同时撤销`);
        await load();
      } else {
        setNotice(data.error === "refund_window_closed" ? "退款窗口已经关闭" : data.error === "per_use_not_refundable" ? "按次体验在进入后不可退款" : "退款没有生效");
      }
    } catch {
      setNotice("网络中断；再次点击会沿用同一退款请求，不会重复退款");
    } finally {
      setRefunding("");
    }
  };

  return (
    <div className="wallet-page">
      <header className="route-hero wallet-hero"><div><span className="deep-eyebrow"><WalletCards size={14} /> CLOSED-LOOP COMMUNITY CURRENCY</span><h1>果子只从真实贡献中生长</h1><p>它不能充值、购买、提现或兑换法币。每次发行、支付、退款与结算都留下不可改写的账本记录。</p></div><div className="wallet-coin-stack"><i /><i /><i /><span>果</span></div></header>

      <section className="wallet-overview">
        <div className="wallet-main-card"><span>可用余额 · {wallet.status === "active" ? "正常" : "审核中"}</span><strong><AnimatedNumber value={wallet.balance} /><small>果</small></strong><div><span>待结算 <b>{wallet.pendingBalance}</b></span><span>累计获得 <b>{wallet.lifetimeEarned}</b></span><span>累计支出 <b>{wallet.lifetimeSpent}</b></span></div><motion.i className="wallet-orbit-ring" animate={{ rotate: 360 }} transition={{ duration: 18, repeat: Infinity, ease: "linear" }} /></div>
        <div className="wallet-rule-card"><span><ShieldCheck size={22} /><small>ISSUANCE RULES</small></span><h2>没有充值入口</h2><p>新成员余额从 0 开始。创作者只通过不同真实用户的首次有效点赞获得新发行的果子。</p><ul><li>账号满 24 小时才产生点赞奖励和付费转移</li><li>自赞、重复赞、快速连赞不发行</li><li>单人每日 10 次、创作者每日 20 果上限</li></ul></div>
      </section>

      {notice && <motion.div className="wallet-notice" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}><Sparkles size={16} /> {notice}</motion.div>}

      <section className="currency-flow">
        <div className="deep-section-heading"><div><span className="deep-eyebrow"><TrendingUp size={14} /> HOW IT FLOWS</span><h2>果子的三条真实路径</h2></div></div>
        <div className="flow-diagram">
          {[{ icon: Heart, title: "有效喜欢", value: "+1", text: "唯一真实用户首次点赞" }, { icon: ArrowDownLeft, title: "收到支持", value: "+5~25", text: "其他用户直接支持" }, { icon: LockKeyhole, title: "解锁作品", value: "−1~99", text: "一次解锁或按次体验" }].map((item, index) => { const Icon = item.icon; return <motion.div key={item.title} initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.12 }}><span><Icon size={20} /></span><strong>{item.title}</strong><b>{item.value}</b><small>{item.text}</small>{index < 2 && <i><em /></i>}</motion.div>; })}
        </div>
      </section>

      <div className="wallet-lower-grid">
        <div className="wallet-ledger-stack">
          <section className="wallet-orders">
            <div className="panel-heading"><span><LockKeyhole size={17} /> 访问订单</span><small>全部创作者收入冻结 24 小时</small></div>
            {orders.length ? orders.map((order) => <div className="wallet-order" key={order.id}><span><strong>{order.productTitle}</strong><small>{order.source === "external" ? `${order.clientName} · ` : ""}{order.pricingModel === "one_time" ? "一次解锁" : "按次体验"} · {order.purchasedAt}</small></span><b>{order.amount} 果</b><em className={order.status}>{order.status === "pending" ? "待确认" : order.status === "paid" ? "待结算" : order.status === "settled" ? "已结算" : order.status === "refunded" ? "已退款" : order.status === "cancelled" ? "已取消" : "已过期"}</em>{order.source === "external" && order.status === "pending" && <a href={`/oauth/payment/${order.id}`}>确认</a>}{order.refundable === 1 && <button onClick={() => refund(order)} disabled={refunding === order.id}><RotateCcw size={14} />{refunding === order.id ? "处理中" : "退款"}</button>}</div>) : <div className="wallet-empty-order">还没有访问订单</div>}
          </section>
          <section className="transaction-panel">
            <div className="panel-heading"><span><History size={17} /> 最近流水</span><button onClick={exportTransactions}>导出</button></div>
            {transactions.length ? transactions.map((item, index) => <motion.div className="wallet-transaction" key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}><span className={item.delta > 0 ? "positive" : item.delta < 0 ? "negative" : "pending"}>{item.delta > 0 ? "+" : ""}{item.delta}</span><span><strong>{item.description}</strong><small>{item.createdAt}</small></span><em>{item.type}</em></motion.div>) : <div className="wallet-transaction"><span className="positive">+20</span><span><strong>新成员探索金</strong><small>加入社区时</small></span><em>welcome</em></div>}
          </section>
        </div>
        <aside className="wallet-principles"><span className="deep-eyebrow"><Coins size={14} /> PRINCIPLES</span><h3>价值不能靠刷量制造</h3><p>果子只表达社区内部的贡献与选择，不购买排名，也不承诺任何法币价值。</p><ul><li>无充值、购买、提现接口</li><li>订单请求必须幂等，余额不能为负</li><li>退款使用反向分录，不删除原流水</li><li>异常奖励被抑制并进入风险记录</li></ul><span className="wallet-audit-note"><Zap size={14} /> 账本分录禁止更新或删除</span></aside>
      </div>
    </div>
  );
}
