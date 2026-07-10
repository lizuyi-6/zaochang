import type { Metadata } from "next";
import { ArrowRight, BarChart3, Eye, Heart, Plus, Radio, Sparkles, Users, Zap } from "lucide-react";
import Link from "next/link";
import { AnimatedNumber } from "../components/animated-number";
import { Reveal } from "../components/reveal";
import { products } from "../lib/community-data";

export const metadata: Metadata = { title: "创作台" };

export default function StudioPage() {
  return (
    <div className="studio-page">
      <header className="route-hero studio-hero"><div><span className="deep-eyebrow"><Sparkles size={14} /> CREATOR STUDIO</span><h1>你的作品，正在怎样生长</h1><p>从发布、被体验到获得支持，所有信号都汇集在这里。</p></div><Link className="primary-action" href="/studio/new"><Plus size={17} /> 创建新作品</Link></header>

      <section className="studio-metrics">
        <div><span><Eye size={16} /> 总体验</span><strong><AnimatedNumber value={18426} /></strong><small>较上周 +18.4%</small><i className="metric-sparkline one" /></div>
        <div><span><Heart size={16} /> 收到喜欢</span><strong><AnimatedNumber value={1328} /></strong><small>较上周 +9.7%</small><i className="metric-sparkline two" /></div>
        <div><span><Users size={16} /> 回访用户</span><strong><AnimatedNumber value={2840} /></strong><small>7 日回访 42%</small><i className="metric-sparkline three" /></div>
        <div><span><Zap size={16} /> 创作收入</span><strong><AnimatedNumber value={684} suffix=" 果" /></strong><small>本月已结算</small><i className="metric-sparkline four" /></div>
      </section>

      <div className="studio-grid">
        <section className="studio-panel analytics-panel">
          <div className="panel-heading"><span><BarChart3 size={17} /> 近 14 天体验趋势</span><div><button className="active">体验</button><button>支持</button></div></div>
          <div className="analytics-chart"><div className="chart-grid">{Array.from({ length: 5 }).map((_, index) => <i key={index} />)}</div><div className="chart-bars">{[28,42,36,58,46,71,64,83,67,92,78,105,96,124].map((height, index) => <span key={index} style={{ height }}><b /></span>)}</div><div className="chart-labels"><span>06.27</span><span>07.01</span><span>07.05</span><span>今天</span></div></div>
        </section>

        <aside className="studio-panel release-panel">
          <div className="panel-heading"><span><Radio size={17} /> 最近版本</span><Link href="/feed">全部</Link></div>
          {[{ version: "v1.7", text: "增加雨天森林声场", time: "2 天前", color: "mint" }, { version: "v1.6", text: "专注结束页重新设计", time: "8 天前", color: "blue" }, { version: "v1.5", text: "修复音频恢复问题", time: "12 天前", color: "yellow" }].map((item) => <div className="release-row" key={item.version}><i className={item.color} /><span><strong>{item.version} · {item.text}</strong><small>{item.time}</small></span></div>)}
        </aside>
      </div>

      <Reveal className="studio-projects">
        <div className="deep-section-heading"><div><span className="deep-eyebrow">YOUR WORKS / 03</span><h2>作品与草稿</h2></div><button>管理顺序</button></div>
        <div className="studio-project-table">
          {products.slice(0, 3).map((product, index) => <Link href={`/product/${product.slug}`} key={product.id}><span className="project-index">0{index + 1}</span><img src={product.image} alt="" /><span className="project-main"><strong>{product.title}</strong><small>{product.release} · {product.category}</small></span><span><Eye size={14} /> {product.plays.toLocaleString()}</span><span><Heart size={14} /> {product.likes}</span><em className={index === 2 ? "draft" : "live"}>{index === 2 ? "草稿" : "已发布"}</em><ArrowRight size={16} /></Link>)}
        </div>
      </Reveal>
    </div>
  );
}
