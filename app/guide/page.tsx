import type { Metadata } from "next";
import { ArrowRight, BookOpen, CheckCircle2, Flag, HeartHandshake, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = { title: "社区公约与创作者指南" };

export default function GuidePage() {
  return (
    <div className="guide-page">
      <header className="route-hero compact"><div><span className="deep-eyebrow"><BookOpen size={14} /> COMMUNITY HANDBOOK</span><h1>让作品被认真对待，也让人被认真对待</h1><p>造场鼓励公开过程、具体反馈和有边界的合作。以下规则同时适用于作品、动态、圈子与孵化项目。</p></div></header>
      <section id="covenant" className="guide-section"><span className="deep-eyebrow"><ShieldCheck size={14} /> COMMUNITY COVENANT</span><h2>社区公约</h2><div className="guide-grid">{[
        ["具体胜过嘲讽", "指出问题时说明发生了什么、影响是什么，以及你期待怎样改变。"],
        ["尊重原创与署名", "转载、改编和共创必须保留来源，不把他人的过程包装成自己的成果。"],
        ["不操纵社区货币", "禁止刷量、互刷、虚假账号和以果子交换排名或外部利益。"],
        ["保护隐私与边界", "不得公开他人的联系方式、未发布资料、会议记录和私密对话。"],
      ].map(([title, text]) => <article key={title}><CheckCircle2 size={19} /><h3>{title}</h3><p>{text}</p></article>)}</div></section>
      <section id="creator" className="guide-section"><span className="deep-eyebrow"><Sparkles size={14} /> CREATOR GUIDE</span><h2>创作者指南</h2><div className="guide-steps">{[
        ["01", "先发布能被体验的最小版本", "不等功能齐全，让用户先触碰核心价值。"],
        ["02", "写下版本为什么变化", "把反馈、取舍和失败留在动态与版本记录里。"],
        ["03", "把反馈变成下一步", "回应具体建议，公开哪些会做、哪些暂时不做。"],
        ["04", "需要更长协作时进入孵化", "用产品信号说明问题、团队进度和需要的支持。"],
      ].map(([index, title, text]) => <article key={index}><b>{index}</b><div><h3>{title}</h3><p>{text}</p></div></article>)}</div></section>
      <section className="guide-actions"><div><HeartHandshake size={24} /><h2>开始参与</h2><p>体验一件作品、留下具体反馈，或者带着自己的项目进入造场。</p></div><div><Link className="primary-action" href="/discover">探索作品 <ArrowRight size={16} /></Link><Link className="text-action" href="/galaxy/apply"><Flag size={15} /> 发射产品信号</Link></div></section>
    </div>
  );
}
