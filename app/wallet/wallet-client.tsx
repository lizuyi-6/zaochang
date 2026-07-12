"use client";

import { motion } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, Coins, Gift, History, Sparkles, TrendingUp, WalletCards, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { AnimatedNumber } from "../components/animated-number";

type Transaction = { id: number; delta: number; type: string; description: string; createdAt: string };
type Wallet = { balance: number; lifetimeEarned: number; lifetimeSpent: number };

export function WalletClient() {
  const [wallet, setWallet] = useState<Wallet>({ balance: 120, lifetimeEarned: 120, lifetimeSpent: 0 });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => {
    const response = await fetch("/api/community", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as { wallet?: Wallet | null; transactions?: Transaction[] };
    if (data.wallet) setWallet(data.wallet);
    setTransactions(data.transactions ?? []);
  };

  useEffect(() => { load().catch(() => undefined); }, []);

  const claim = async () => {
    setClaiming(true);
    const response = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "check_in" }) });
    if (response.status === 401) {
      window.location.href = "/signin?return_to=%2Fwallet";
      return;
    }
    setNotice(response.ok ? "今日灵感补给 +8 果" : "今天已经领取过了");
    if (response.ok) await load();
    setClaiming(false);
  };

  return (
    <div className="wallet-page">
      <header className="route-hero wallet-hero"><div><span className="deep-eyebrow"><WalletCards size={14} /> COMMUNITY CURRENCY</span><h1>果子在作品之间流动</h1><p>它不对应法币。发布、反馈和支持，让社区里的注意力变成可见的流动。</p></div><div className="wallet-coin-stack"><i /><i /><i /><span>果</span></div></header>

      <section className="wallet-overview">
        <div className="wallet-main-card"><span>可用余额</span><strong><AnimatedNumber value={wallet.balance} /><small>果</small></strong><div><span>累计获得 <b>{wallet.lifetimeEarned}</b></span><span>累计支持 <b>{wallet.lifetimeSpent}</b></span></div><motion.i className="wallet-orbit-ring" animate={{ rotate: 360 }} transition={{ duration: 18, repeat: Infinity, ease: "linear" }} /></div>
        <button className="wallet-claim-card" onClick={claim} disabled={claiming}><span><Gift size={24} /><span><small>DAILY SUPPLY</small><strong>每日灵感补给</strong><p>今天可领取 8 果</p></span></span><b>{claiming ? "领取中" : "领取"}</b></button>
      </section>

      {notice && <motion.div className="wallet-notice" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}><Sparkles size={16} /> {notice}</motion.div>}

      <section className="currency-flow">
        <div className="deep-section-heading"><div><span className="deep-eyebrow"><TrendingUp size={14} /> HOW IT FLOWS</span><h2>社区经济的三个入口</h2></div></div>
        <div className="flow-diagram">
          {[{ icon: Zap, title: "发布作品", value: "+20", text: "每个首次发布版本" }, { icon: ArrowDownLeft, title: "收到支持", value: "+5~25", text: "其他用户直接支持" }, { icon: ArrowUpRight, title: "体验作品", value: "−0~12", text: "由创作者设定价格" }].map((item, index) => { const Icon = item.icon; return <motion.div key={item.title} initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.12 }}><span><Icon size={20} /></span><strong>{item.title}</strong><b>{item.value}</b><small>{item.text}</small>{index < 2 && <i><em /></i>}</motion.div>; })}
        </div>
      </section>

      <div className="wallet-lower-grid">
        <section className="transaction-panel">
          <div className="panel-heading"><span><History size={17} /> 最近流水</span><button>导出</button></div>
          {transactions.length ? transactions.map((item, index) => <motion.div className="wallet-transaction" key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}><span className={item.delta > 0 ? "positive" : "negative"}>{item.delta > 0 ? "+" : ""}{item.delta}</span><span><strong>{item.description}</strong><small>{item.createdAt}</small></span><em>{item.type}</em></motion.div>) : [{ delta: 120, description: "新成员起步金", type: "welcome", createdAt: "加入社区时" }].map((item) => <div className="wallet-transaction" key={item.type}><span className="positive">+{item.delta}</span><span><strong>{item.description}</strong><small>{item.createdAt}</small></span><em>{item.type}</em></div>)}
        </section>
        <aside className="wallet-principles"><span className="deep-eyebrow"><Coins size={14} /> PRINCIPLES</span><h3>果子不购买排名</h3><p>所有推荐仍由真实体验、回访和讨论质量决定。果子只让支持行为更明确。</p><ul><li>不可提现或兑换法币</li><li>不出售社区曝光位置</li><li>异常交易会进入审核</li></ul></aside>
      </div>
    </div>
  );
}
