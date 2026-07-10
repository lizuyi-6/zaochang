import type { Metadata } from "next";
import { ArrowRight, MessageCircle, Radio, Search, Users } from "lucide-react";
import Link from "next/link";
import { Reveal } from "../components/reveal";
import { circles, compactNumber } from "../lib/community-data";

export const metadata: Metadata = { title: "社区圈子" };

export default function CirclesPage() {
  return (
    <div className="circles-page">
      <header className="route-hero circles-hero"><div><span className="deep-eyebrow"><Users size={14} /> 26 ACTIVE CIRCLES</span><h1>围绕做东西，形成关系</h1><p>圈子不是内容分类。它是持续出现、互相认识和一起把作品推进下去的地方。</p></div><label className="inline-search"><Search size={17} /><input placeholder="搜索圈子或话题" /></label></header>
      <section className="circle-featured-grid">
        {circles.slice(0, 2).map((circle, index) => <Reveal key={circle.slug} delay={index * 0.08}><article id={circle.slug} className={`circle-featured ${circle.color}`}><div className="circle-featured-head"><span><i />{circle.name}</span><small>{circle.online} 人在线</small></div><h2>{circle.topic}</h2><p>{index === 0 ? "分享这一周主动删掉的功能，以及它让核心体验变清楚的瞬间。" : "用一分钟录音回应上一个人，最后拼成一张城市的声音地图。"}</p><div className="circle-member-stack">{["林", "N", "贺", "听", "+"].map((item) => <span key={item}>{item}</span>)}<small>{compactNumber(circle.members)} 位成员</small></div><button>进入圈子 <ArrowRight size={16} /></button><div className="circle-rings"><i /><i /><i /></div></article></Reveal>)}
      </section>
      <section className="all-circles"><div className="deep-section-heading"><div><span className="deep-eyebrow"><Radio size={14} /> DIRECTORY</span><h2>全部圈子</h2></div><button>按活跃排序</button></div><div className="circle-list">{circles.map((circle, index) => <Link href={`#${circle.slug}`} id={index > 1 ? circle.slug : undefined} key={circle.slug}><span className={`circle-number ${circle.color}`}>0{index + 1}</span><span><strong>{circle.name}</strong><small>{circle.topic}</small></span><span><Users size={14} /> {compactNumber(circle.members)}</span><span><MessageCircle size={14} /> {circle.online}</span><ArrowRight size={16} /></Link>)}</div></section>
    </div>
  );
}
