import type { Metadata } from "next";
import { Award, Eye, Heart, Link2, LogIn, MapPin, Settings, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { database, ensureMember } from "../api/_lib/community";
import { getChatGPTUser } from "../chatgpt-auth";
import { AnimatedNumber } from "../components/animated-number";
import { ProductCard } from "../components/product-card";
import type { Product } from "../lib/community-data";

export const metadata: Metadata = { title: "创作者主页" };
export const dynamic = "force-dynamic";

const accents = { coral: "#ff5c3d", mint: "#b9ecc8", blue: "#92c6ef", yellow: "#f1ca51", ink: "#171816" } as const;

export default async function ProfilePage() {
  const user = await getChatGPTUser();
  if (!user) return <div className="profile-page"><section className="profile-cover"><div className="profile-cover-grid" /><span>CREATOR PROFILE / SIGN IN</span></section><section className="profile-signed-out"><LogIn size={30} /><h1>登录后查看你的创作者主页</h1><p>个人资料、作品数据、社区关系和创作记录会汇集在这里。</p><Link className="primary-action" href="/signin?return_to=%2Fprofile">登录造场</Link></section></div>;

  const name = user.displayName;
  const member = { ...user, initial: (name[0] || "造").toUpperCase() };
  await ensureMember(member);
  const db = database();
  const [profile, productResult, followerResult, commentResult, circleResult] = await Promise.all([
    db.prepare("SELECT bio, location, website, reputation, joined_at AS joinedAt FROM members WHERE email = ?").bind(user.email).first<{ bio: string; location: string; website: string; reputation: number; joinedAt: string }>(),
    db.prepare(`SELECT id, owner_name AS ownerName, title, description, category, demo_type AS demoType, demo_url AS demoUrl, image_url AS imageUrl, cover_theme AS coverTheme, price, likes_count AS likes, plays_count AS plays, created_at AS createdAt FROM products WHERE owner_email = ? AND status = 'published' ORDER BY created_at DESC, id DESC`).bind(user.email).all<Record<string, unknown>>(),
    db.prepare("SELECT COUNT(*) AS count FROM community_actions WHERE kind = 'follow_creator' AND target_ref = ?").bind(name).first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM comments WHERE user_email = ?").bind(user.email).first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM community_actions WHERE user_email = ? AND kind = 'join_circle'").bind(user.email).first<{ count: number }>(),
  ]);
  const works: Product[] = productResult.results.map((row) => {
    const theme = (["coral", "mint", "blue", "yellow", "ink"].includes(String(row.coverTheme)) ? String(row.coverTheme) : "coral") as Product["coverTheme"];
    return { id: Number(row.id), ownerName: String(row.ownerName), ownerInitial: name[0], title: String(row.title), description: String(row.description), longDescription: String(row.description), category: String(row.category), demoType: String(row.demoType), demoUrl: row.demoUrl ? String(row.demoUrl) : null, coverTheme: theme, price: Number(row.price), likes: Number(row.likes), plays: Number(row.plays), image: row.imageUrl ? String(row.imageUrl) : "https://images.unsplash.com/photo-1558655146-9f40138edfeb?auto=format&fit=crop&w=1600&q=88", accent: accents[theme], release: String(row.createdAt), tags: [String(row.category), "独立创作"] };
  });
  const plays = works.reduce((sum, item) => sum + item.plays, 0);
  const likes = works.reduce((sum, item) => sum + item.likes, 0);
  const website = profile?.website ?? "";
  const websiteHref = website ? (website.startsWith("http") ? website : `https://${website}`) : "";
  const badges = [
    { icon: String(works.length).padStart(2, "0"), name: "公开作品", text: works.length ? "持续让作品接受真实体验" : "发布第一件作品后获得" },
    { icon: String(commentResult?.count ?? 0).padStart(2, "0"), name: "具体反馈", text: "写下可被创作者继续行动的回应" },
    { icon: String(circleResult?.count ?? 0).padStart(2, "0"), name: "共同在场", text: "加入圈子并参与持续讨论" },
  ];

  return <div className="profile-page">
    <section className="profile-cover"><div className="profile-cover-grid" /><div className="profile-signal signal-a" /><div className="profile-signal signal-b" /><span>CREATOR PROFILE / {profile?.joinedAt?.slice(0, 4) ?? "2026"}</span></section>
    <section className="profile-identity"><span className="profile-large-avatar">{name[0]}</span><div><span className="deep-eyebrow"><Sparkles size={14} /> MAKER PROFILE</span><h1>{name}</h1><p>{profile?.bio}</p><div><span><MapPin size={14} /> {profile?.location}</span>{website && <a href={websiteHref} target="_blank" rel="noreferrer"><Link2 size={14} /> {website}</a>}</div></div><Link href="/profile/edit"><Settings size={16} /> 编辑主页</Link></section>
    <section className="profile-stats"><div><span>作品体验</span><strong><AnimatedNumber value={plays} /></strong><Eye size={16} /></div><div><span>收到喜欢</span><strong><AnimatedNumber value={likes} /></strong><Heart size={16} /></div><div><span>关注者</span><strong><AnimatedNumber value={followerResult?.count ?? 0} /></strong><Users size={16} /></div><div><span>社区声望</span><strong><AnimatedNumber value={profile?.reputation ?? 0} /></strong><Award size={16} /></div></section>
    <div className="profile-content-grid"><section><div className="deep-section-heading"><div><span className="deep-eyebrow">PUBLISHED WORKS / {String(works.length).padStart(2, "0")}</span><h2>发布的作品</h2></div></div>{works.length ? <div className="discover-grid">{works.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}</div> : <div className="profile-empty"><Sparkles size={24} /><strong>还没有公开作品</strong><p>发布一个可以被体验的最小版本，主页会自动更新。</p><Link className="primary-action" href="/studio/new">创建第一件作品</Link></div>}</section><aside className="profile-badges"><span className="deep-eyebrow"><Award size={14} /> COMMUNITY RECORD</span><h3>社区记录</h3>{badges.map((badge) => <div key={badge.name}><span>{badge.icon}</span><span><strong>{badge.name}</strong><small>{badge.text}</small></span></div>)}</aside></div>
  </div>;
}
