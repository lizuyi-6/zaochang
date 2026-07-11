import { ArrowRight, ArrowUpRight, Clock3, Eye, Flame, Heart, Radio, Sparkles, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { AnimatedNumber } from "./components/animated-number";
import { ProductCard } from "./components/product-card";
import { Reveal } from "./components/reveal";
import { challenges, circles, compactNumber, posts, products } from "./lib/community-data";

export default function HomePage() {
  return (
    <div className="home-layout">
      <div className="home-main">
        <section className="home-stage">
          <div className="home-stage-copy">
            <span className="deep-eyebrow"><span className="live-pulse" /> 284 位创作者正在场内</span>
            <h1>今天，大家<br />都在造什么</h1>
            <p>这里没有“等待发布”的作品。每个想法都从一个能被试玩、被讨论的版本开始。</p>
            <div className="home-stage-actions">
              <Link className="primary-action" href="/discover">进入现场 <ArrowRight size={17} /></Link>
              <Link className="text-action" href="/studio/new">带一件作品来</Link>
            </div>
          </div>

          <div className="home-stage-visual" aria-label="社区作品实时预览">
            <div className="stage-grid-lines" />
            <div className="floating-work work-focus">
              <span>MORI / DEEP FOCUS</span><strong>42:18</strong><i><b /></i><small>森林正在生长</small>
            </div>
            <div className="floating-work work-type"><span>字浪</span><strong>呼<br />吸</strong><small>WEIGHT 72 / FLOW 48</small></div>
            <div className="floating-work work-loop"><span>LOOP 04</span><div>{Array.from({ length: 16 }).map((_, index) => <i key={index} style={{ height: `${18 + ((index * 19) % 70)}%` }} />)}</div><small>城市雨棚.wav</small></div>
            <div className="stage-orbit orbit-one" /><div className="stage-orbit orbit-two" />
            <span className="stage-coordinate coordinate-one">X 31.42 / Y 18.07</span>
            <span className="stage-coordinate coordinate-two">SIGNAL 98%</span>
            <Link className="galaxy-gateway" href="/galaxy" aria-label="进入 ASTRA 宇宙记忆">
              <span className="galaxy-gateway-sky" aria-hidden="true"><i /><i /><b /></span>
              <span className="galaxy-gateway-copy">
                <small>COMMUNITY / ELSEWHERE</small>
                <strong>去看星光</strong>
                <em>ASTRA <ArrowUpRight size={13} /></em>
              </span>
            </Link>
          </div>
        </section>

        <section className="home-signal-strip">
          <div><span>今日新增作品</span><strong><AnimatedNumber value={38} /></strong><small><TrendingUp size={12} /> 12%</small></div>
          <div><span>正在被体验</span><strong><AnimatedNumber value={1264} /></strong><small><Eye size={12} /> 实时</small></div>
          <div><span>今天流动的果子</span><strong><AnimatedNumber value={8420} /></strong><small><Sparkles size={12} /> 站内</small></div>
          <div><span>当前在线</span><strong><AnimatedNumber value={284} /></strong><small><Users size={12} /> 创作者</small></div>
        </section>

        <Reveal className="ticker-band">
          <div className="ticker-track">
            {[...products, ...products].map((product, index) => <span key={`${product.id}-${index}`}><i style={{ background: product.accent }} />{product.title}<small>{product.release}</small></span>)}
          </div>
        </Reveal>

        <section className="home-section">
          <div className="deep-section-heading"><div><span className="deep-eyebrow"><Flame size={14} /> 此刻上升</span><h2>值得立刻玩一下</h2></div><Link href="/discover">查看全部 <ArrowRight size={15} /></Link></div>
          <div className="home-product-grid">
            {products.slice(0, 4).map((product, index) => <ProductCard key={product.id} product={product} index={index} large={index === 0} />)}
          </div>
        </section>

        <Reveal className="home-community-band">
          <div className="community-band-copy"><span className="deep-eyebrow"><Radio size={14} /> 社区现场</span><h2>作品发布以后，故事才真正开始。</h2><p>版本反馈、失败记录、共创招募和突然出现的新方向，都发生在作品页之外。</p><Link className="primary-action light" href="/feed">进入动态 <ArrowRight size={16} /></Link></div>
          <div className="community-band-feed">
            {posts.slice(0, 2).map((post) => <article key={post.id}><span className={`deep-avatar ${post.color}`}>{post.ownerInitial}</span><div><strong>{post.ownerName}</strong><small>{post.createdAt}</small><p>{post.content}</p><span><Heart size={13} /> {post.likes} <b>·</b> {post.comments} 条讨论</span></div></article>)}
          </div>
        </Reveal>
      </div>

      <aside className="home-aside">
        <section className="aside-block live-board">
          <div className="aside-title"><span><Flame size={16} /> 今日上升</span><small>LIVE</small></div>
          {products.slice(1, 5).map((product, index) => <Link href={`/product/${product.slug}`} key={product.id} className="live-rank"><b>0{index + 1}</b><img src={product.image} alt="" /><span><strong>{product.title}</strong><small>{product.ownerName} · +{42 - index * 7}%</small></span><ArrowRight size={14} /></Link>)}
        </section>

        <section className="aside-block">
          <div className="aside-title"><span><Users size={16} /> 圈子热议</span><Link href="/circles">全部</Link></div>
          {circles.slice(0, 4).map((circle) => <Link href={`/circles#${circle.slug}`} className="aside-topic" key={circle.slug}><span className={`deep-circle-dot ${circle.color}`} /><span><strong>{circle.name}</strong><small>{circle.topic}</small></span><em>{circle.online}</em></Link>)}
        </section>

        <Link className={`aside-challenge ${challenges[0].color}`} href="/challenges">
          <span><Clock3 size={15} /> 本月命题</span><strong>{challenges[0].title}</strong><p>{challenges[0].brief}</p><div><small>{compactNumber(challenges[0].prize)} 果奖金池</small><b>{challenges[0].daysLeft} 天</b></div>
        </Link>
      </aside>
    </div>
  );
}
