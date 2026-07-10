import type { Metadata } from "next";
import { ArrowRight, Clock3, Coins, Sparkles, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { AnimatedNumber } from "../components/animated-number";
import { Reveal } from "../components/reveal";
import { challenges, compactNumber } from "../lib/community-data";

export const metadata: Metadata = { title: "造物挑战" };

export default function ChallengesPage() {
  return (
    <div className="challenges-page">
      <header className="route-hero challenge-hero"><div><span className="deep-eyebrow"><Trophy size={14} /> MONTHLY MAKING PROMPTS</span><h1>给创作一个共同起点</h1><p>同一个命题，不同的答案。挑战结束后，所有作品仍然留在社区继续生长。</p></div><div className="challenge-total"><span>本月奖金池</span><strong><AnimatedNumber value={33200} /><small>果</small></strong></div></header>
      <section className="challenge-stack">{challenges.map((challenge, index) => <Reveal key={challenge.id} delay={index * 0.08}><article className={`challenge-card ${challenge.color}`}><div className="challenge-card-index">0{index + 1}<small>OPEN PROMPT</small></div><div className="challenge-card-copy"><span>{index === 0 ? "本月主命题" : "开放命题"}</span><h2>{challenge.title}</h2><p>{challenge.brief}</p><div><span><Users size={15} /> {challenge.participants} 人参与</span><span><Coins size={15} /> {compactNumber(challenge.prize)} 果</span><span><Clock3 size={15} /> 还剩 {challenge.daysLeft} 天</span></div></div><div className="challenge-progress"><span style={{ "--progress": `${Math.max(18, 100 - challenge.daysLeft * 4)}%` } as React.CSSProperties}><b>{challenge.daysLeft}</b><small>DAYS</small></span><Link href="/studio/new">参加挑战 <ArrowRight size={16} /></Link></div></article></Reveal>)}</section>
      <section className="challenge-leaderboard"><div className="deep-section-heading"><div><span className="deep-eyebrow"><Sparkles size={14} /> EARLY SIGNALS</span><h2>正在获得反馈的参赛作品</h2></div></div>{["候车亭气象", "请稍后花园", "一封延迟送达的信"].map((title, index) => <div key={title}><b>0{index + 1}</b><span><strong>{title}</strong><small>{["Kiko Wu", "松果工作室", "王不慢"][index]}</small></span><em>{[386, 291, 248][index]} 次体验</em><span className="leader-progress"><i style={{ width: `${92 - index * 16}%` }} /></span><button>试玩</button></div>)}</section>
    </div>
  );
}
