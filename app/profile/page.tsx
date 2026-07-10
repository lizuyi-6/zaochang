import type { Metadata } from "next";
import { Award, Eye, Heart, Link2, MapPin, Settings, Sparkles, Users } from "lucide-react";
import { getChatGPTUser } from "../chatgpt-auth";
import { AnimatedNumber } from "../components/animated-number";
import { ProductCard } from "../components/product-card";
import { products } from "../lib/community-data";

export const metadata: Metadata = { title: "创作者主页" };

export default async function ProfilePage() {
  const user = await getChatGPTUser();
  const name = user?.displayName ?? "林一";
  return (
    <div className="profile-page">
      <section className="profile-cover"><div className="profile-cover-grid" /><div className="profile-signal signal-a" /><div className="profile-signal signal-b" /><span>CREATOR PROFILE / 2026</span></section>
      <section className="profile-identity"><span className="profile-large-avatar">{name[0]}</span><div><span className="deep-eyebrow"><Sparkles size={14} /> MAKER SINCE 2024</span><h1>{name}</h1><p>做关于注意力、声音和缓慢变化的小产品。希望工具不是催促，而是让人更愿意停留。</p><div><span><MapPin size={14} /> 杭州</span><span><Link2 size={14} /> maker.page/linyi</span></div></div><button><Settings size={16} /> 编辑主页</button></section>
      <section className="profile-stats"><div><span>作品体验</span><strong><AnimatedNumber value={18426} /></strong><Eye size={16} /></div><div><span>收到喜欢</span><strong><AnimatedNumber value={1328} /></strong><Heart size={16} /></div><div><span>关注者</span><strong><AnimatedNumber value={2840} /></strong><Users size={16} /></div><div><span>社区声望</span><strong><AnimatedNumber value={764} /></strong><Award size={16} /></div></section>
      <div className="profile-content-grid"><section><div className="deep-section-heading"><div><span className="deep-eyebrow">PUBLISHED WORKS</span><h2>发布的作品</h2></div></div><div className="discover-grid">{products.slice(0, 4).map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}</div></section><aside className="profile-badges"><span className="deep-eyebrow"><Award size={14} /> COMMUNITY BADGES</span><h3>社区徽章</h3>{[{ icon: "07", name: "连续造物", text: "连续 7 周发布版本" }, { icon: "24", name: "耐心反馈", text: "写下 24 条有效反馈" }, { icon: "∞", name: "声音采集者", text: "声音实验圈贡献者" }].map((badge) => <div key={badge.name}><span>{badge.icon}</span><span><strong>{badge.name}</strong><small>{badge.text}</small></span></div>)}</aside></div>
    </div>
  );
}
