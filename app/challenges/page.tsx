import type { Metadata } from "next";
import { ArrowRight, Beaker, Sparkles } from "lucide-react";
import Link from "next/link";
import { Reveal } from "../components/reveal";
import { challenges } from "../lib/community-data";

export const metadata: Metadata = { title: "造物命题实验" };

export default function ChallengesPage() {
  return <div className="challenges-page">
    <header className="route-hero challenge-hero"><div><span className="deep-eyebrow"><Beaker size={14} /> MAKING PROMPT PREVIEW</span><h1>给创作一个共同起点</h1><p>这里目前是命题预览，不统计虚构参与人数，也不承诺尚未建立规则与资金来源的果子奖励。</p></div><div className="challenge-total"><span>当前状态</span><strong>预览<small>不发果</small></strong></div></header>
    <section className="challenge-stack">{challenges.map((challenge, index) => <Reveal key={challenge.id} delay={index * .08}><article className={`challenge-card ${challenge.color}`}><div className="challenge-card-index">0{index + 1}<small>EDITORIAL PROMPT</small></div><div className="challenge-card-copy"><span>开放命题</span><h2>{challenge.title}</h2><p>{challenge.brief}</p><div><span><Sparkles size={15} /> 可作为独立作品灵感</span></div></div><div className="challenge-progress"><span><b>--</b><small>PREVIEW</small></span><Link href={`/studio/new?prompt=${encodeURIComponent(challenge.id)}`}>以此创建作品 <ArrowRight size={16} /></Link></div></article></Reveal>)}</section>
  </div>;
}
