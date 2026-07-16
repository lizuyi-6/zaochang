import { ArrowRight, ArrowUpRight, Eye, Flame, Heart, Radio, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { loadPublicCommunityState } from "./api/_lib/public-community";
import { AnimatedNumber } from "./components/animated-number";
import { ProductCard } from "./components/product-card";
import { Reveal } from "./components/reveal";
import { challenges, circles, products } from "./lib/community-data";

export const dynamic = "force-dynamic";

function displayDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "时间未记录";
  const parsed = new Date(raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(parsed);
}

function Metric({ value }: { value: number | null }) {
  return value === null ? <span aria-label="数据暂不可用">--</span> : <AnimatedNumber value={value} />;
}

async function publicSnapshot() {
  try {
    return await loadPublicCommunityState();
  } catch (error) {
    console.error("Unable to load the public community snapshot", error);
    return null;
  }
}

export default async function HomePage() {
  const community = await publicSnapshot();
  const stats = community?.platformStats;
  const circleStats = new Map((community?.circleStats ?? []).map((item) => [item.slug, item]));
  const recentPosts = (community?.posts ?? []).slice(0, 2).map((post, index) => {
    const ownerName = String(post.ownerName ?? "社区成员");
    return {
      id: String(post.id ?? `post-${index}`),
      ownerName,
      ownerInitial: ownerName.trim()[0] || "造",
      createdAt: displayDate(post.createdAt),
      content: String(post.content ?? ""),
      likes: Number(post.likes ?? 0),
      comments: Number(post.comments ?? 0),
      color: ["coral", "blue", "yellow", "mint"][index % 4],
    };
  });

  return (
    <div className="home-layout">
      <div className="home-main">
        <section className="home-stage">
          <div className="home-stage-copy">
            <span className="deep-eyebrow"><Users size={14} /> {stats ? `${stats.members} 位社区成员` : "社区数据暂不可用"}</span>
            <h1>今天，大家<br />都在造什么</h1>
            <p>这里没有“等待发布”的作品。每个想法都从一个能被试玩、被讨论的版本开始。</p>
            <div className="home-stage-actions">
              <Link className="primary-action" href="/discover">进入现场 <ArrowRight size={17} /></Link>
              <Link className="text-action" href="/studio/new">带一件作品来</Link>
            </div>
          </div>

          <div className="home-stage-visual" aria-label="社区作品预览">
            <div className="stage-grid-lines" />
            <div className="floating-work work-focus">
              <span>MORI / DEEP FOCUS</span><strong>42:18</strong><i><b /></i><small>森林正在生长</small>
            </div>
            <div className="floating-work work-type"><span>字浪</span><strong>呼<br />吸</strong><small>WEIGHT 72 / FLOW 48</small></div>
            <div className="floating-work work-loop"><span>LOOP 04</span><div>{Array.from({ length: 16 }).map((_, index) => <i key={index} style={{ height: `${18 + ((index * 19) % 70)}%` }} />)}</div><small>城市雨棚.wav</small></div>
            <div className="stage-orbit orbit-one" /><div className="stage-orbit orbit-two" />
            <span className="stage-coordinate coordinate-one">X 31.42 / Y 18.07</span>
            <span className="stage-coordinate coordinate-two">SIGNAL / OPEN</span>
            <Link className="galaxy-gateway" href="/galaxy" aria-label="进入造场产品银河">
              <span className="galaxy-gateway-sky" aria-hidden="true"><i /><i /><b /></span>
              <span className="galaxy-gateway-copy">
                <small>PRODUCT / ECOSYSTEM</small>
                <strong>产品银河</strong>
                <em>EXPLORE <ArrowUpRight size={13} /></em>
              </span>
            </Link>
          </div>
        </section>

        <section className="home-signal-strip">
          <div><span>社区成员</span><strong><Metric value={stats?.members ?? null} /></strong><small><Users size={12} /> 账号记录</small></div>
          <div><span>公开社区作品</span><strong><Metric value={stats?.products ?? null} /></strong><small><Sparkles size={12} /> 可见发布</small></div>
          <div><span>累计体验记录</span><strong><Metric value={stats?.productPlays ?? null} /></strong><small><Eye size={12} /> 社区作品</small></div>
          <div><span>今日果子分录量</span><strong><Metric value={stats?.todayFruitMovement ?? null} /></strong><small><Sparkles size={12} /> 绝对值合计</small></div>
        </section>

        <Reveal className="ticker-band">
          <div className="ticker-track">
            {[...products, ...products].map((product, index) => <span key={`${product.id}-${index}`}><i style={{ background: product.accent }} />{product.title}<small>{product.release}</small></span>)}
          </div>
        </Reveal>

        <section className="home-section">
          <div className="deep-section-heading"><div><span className="deep-eyebrow"><Flame size={14} /> 产品精选</span><h2>现在可以直接体验</h2></div><Link href="/discover">查看全部 <ArrowRight size={15} /></Link></div>
          <div className="home-product-grid">
            {products.slice(0, 4).map((product, index) => <ProductCard key={product.id} product={product} index={index} large={index === 0} />)}
          </div>
        </section>

        <Reveal className="home-community-band">
          <div className="community-band-copy"><span className="deep-eyebrow"><Radio size={14} /> 社区现场</span><h2>作品发布以后，故事才真正开始。</h2><p>版本反馈、失败记录、共创招募和突然出现的新方向，都发生在作品页之外。</p><Link className="primary-action light" href="/feed">进入动态 <ArrowRight size={16} /></Link></div>
          <div className="community-band-feed">
            {recentPosts.map((post) => <article key={post.id}><span className={`deep-avatar ${post.color}`}>{post.ownerInitial}</span><div><strong>{post.ownerName}</strong><small>{post.createdAt}</small><p>{post.content}</p><span><Heart size={13} /> {post.likes} <b>·</b> {post.comments} 条讨论</span></div></article>)}
            {recentPosts.length === 0 && <div className="community-band-empty"><Radio size={19} /><strong>还没有公开动态</strong><span>第一条真实过程记录发布后会出现在这里。</span></div>}
          </div>
        </Reveal>
      </div>

      <aside className="home-aside">
        <section className="aside-block live-board">
          <div className="aside-title"><span><Flame size={16} /> 产品目录</span><small>OPEN</small></div>
          {products.slice(1, 5).map((product, index) => <Link href={`/product/${product.slug}`} key={product.id} className="live-rank"><b>0{index + 1}</b><img src={product.image} alt="" /><span><strong>{product.title}</strong><small>{product.category} · {product.release}</small></span><ArrowRight size={14} /></Link>)}
        </section>

        <section className="aside-block">
          <div className="aside-title"><span><Users size={16} /> 圈子近况</span><Link href="/circles">全部</Link></div>
          {circles.slice(0, 4).map((circle) => { const current = circleStats.get(circle.slug); return <Link href={`/circles#${circle.slug}`} className="aside-topic" key={circle.slug}><span className={`deep-circle-dot ${circle.color}`} /><span><strong>{circle.name}</strong><small>{circle.topic}</small></span><em>{current?.members ?? 0} 人 · {current?.recentDiscussions ?? 0} 讨论</em></Link>; })}
        </section>

        <Link className={`aside-challenge ${challenges[0].color}`} href="/challenges">
          <span><Sparkles size={15} /> 开放命题</span><strong>{challenges[0].title}</strong><p>{challenges[0].brief}</p><div><small>创作灵感预览</small><b>无截止日期</b></div>
        </Link>
      </aside>
    </div>
  );
}
