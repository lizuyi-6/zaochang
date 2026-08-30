import type { Metadata } from "next";
import { Award, BadgeCheck, Eye, Heart, Link2, LogIn, MapPin, Settings, ShieldCheck, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { isAdminEmail, isFounderEmail } from "../api/_lib/access-control";
import { database, ensureMember } from "../api/_lib/community";
import { getChatGPTUser } from "../chatgpt-auth";
import { AnimatedNumber } from "../components/animated-number";
import { ProductCard } from "../components/product-card";
import { products as showcaseProducts, type Product } from "../lib/community-data";
import { hydrateProductRow } from "../lib/product-hydrate";
import { PUBLISHED_PRODUCT_SQL } from "../lib/product-policy";

export const metadata: Metadata = { title: "创作者主页" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getChatGPTUser();
  if (!user) return <div className="profile-page"><section className="profile-cover"><div className="profile-cover-grid" /><span>CREATOR PROFILE / SIGN IN</span></section><section className="profile-signed-out"><LogIn size={30} /><h1>登录后查看你的创作者主页</h1><p>个人资料、作品数据、社区关系和创作记录会汇集在这里。</p><Link className="primary-action" href="/signin?return_to=%2Fprofile">登录造场</Link></section></div>;

  const name = user.displayName;
  const founder = isFounderEmail(user.email);
  const admin = isAdminEmail(user.email);
  const member = { ...user, initial: (name[0] || "造").toUpperCase() };
  await ensureMember(member);
  const db = database();
  const [profile, productResult, followerResult, commentResult, circleResult] = await Promise.all([
    db.prepare("SELECT bio, location, website, reputation, joined_at AS joinedAt, member_number AS memberNumber FROM members WHERE email = ?").bind(user.email).first<{ bio: string; location: string; website: string; reputation: number; joinedAt: string; memberNumber: number | null }>(),
    db.prepare(`SELECT id, owner_name AS ownerName, title, description, category, demo_type AS demoType, demo_url AS demoUrl, image_url AS imageUrl, cover_theme AS coverTheme, price, pricing_model AS pricingModel, likes_count AS likes, plays_count AS plays, created_at AS createdAt FROM products WHERE owner_email = ? AND ${PUBLISHED_PRODUCT_SQL} ORDER BY created_at DESC, id DESC`).bind(user.email).all<Record<string, unknown>>(),
    db.prepare("SELECT COUNT(*) AS count FROM community_actions WHERE kind = 'follow_creator' AND target_ref = ?").bind(name).first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM comments WHERE user_email = ?").bind(user.email).first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM community_actions WHERE user_email = ? AND kind = 'join_circle'").bind(user.email).first<{ count: number }>(),
  ]);
  const persistedWorks: Product[] = productResult.results.map((row) => hydrateProductRow(row, { release: String(row.createdAt), tags: [String(row.category), "独立创作"], ownerInitial: name[0] }));
  const works = founder
    ? [...showcaseProducts.filter((product) => product.founderOwned), ...persistedWorks]
    : persistedWorks;
  const plays = works.reduce((sum, item) => sum + item.plays, 0);
  const likes = works.reduce((sum, item) => sum + item.likes, 0);
  const website = profile?.website ?? "";
  const websiteHref = website ? (website.startsWith("http") ? website : `https://${website}`) : "";
  const badges = [
    ...(founder ? [{ icon: "∞", name: "造场创始人", text: "定义产品银河并为平台长期方向负责" }] : []),
    { icon: String(works.length).padStart(2, "0"), name: "公开作品", text: works.length ? "持续让作品接受真实体验" : "发布第一件作品后获得" },
    { icon: String(commentResult?.count ?? 0).padStart(2, "0"), name: "具体反馈", text: "写下可被创作者继续行动的回应" },
    { icon: String(circleResult?.count ?? 0).padStart(2, "0"), name: "共同在场", text: "加入圈子并参与持续讨论" },
  ];

  return <div className="profile-page">
    <section className="profile-cover"><div className="profile-cover-grid" /><div className="profile-signal signal-a" /><div className="profile-signal signal-b" /><span>CREATOR PROFILE / {profile?.joinedAt?.slice(0, 4) ?? "2026"}</span></section>
    <section className={`profile-identity${founder ? " founder-profile" : ""}`}><span className="profile-large-avatar">{name[0]}</span><div><span className="deep-eyebrow">{founder ? <><BadgeCheck size={14} /> FOUNDER / ZAOCHANG</> : <><Sparkles size={14} /> MAKER PROFILE</>}{profile?.memberNumber ? <> · #{String(profile.memberNumber).padStart(4, "0")}</> : null}</span><h1>{name}{founder && <small className="profile-founder-badge"><BadgeCheck size={13} /> 造场创始人</small>}</h1><p>{profile?.bio}</p><div><span><MapPin size={14} /> {profile?.location}</span>{website && <a href={websiteHref} target="_blank" rel="noreferrer"><Link2 size={14} /> {website}</a>}</div></div><div className="profile-actions">{founder && <Link href="/founder"><BadgeCheck size={16} /> 创始人中心</Link>}{admin && <Link href="/admin"><ShieldCheck size={16} /> 平台管理</Link>}<Link href="/profile/edit"><Settings size={16} /> 编辑主页</Link></div></section>
    <section className="profile-stats"><div><span>作品体验</span><strong><AnimatedNumber value={plays} /></strong><Eye size={16} /></div><div><span>收到喜欢</span><strong><AnimatedNumber value={likes} /></strong><Heart size={16} /></div><div><span>关注者</span><strong><AnimatedNumber value={followerResult?.count ?? 0} /></strong><Users size={16} /></div><div><span>社区声望</span><strong><AnimatedNumber value={profile?.reputation ?? 0} /></strong><Award size={16} /></div></section>
    <div className="profile-content-grid"><section><div className="deep-section-heading"><div><span className="deep-eyebrow">PUBLISHED WORKS / {String(works.length).padStart(2, "0")}</span><h2>发布的作品</h2></div></div>{works.length ? <div className="discover-grid">{works.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}</div> : <div className="profile-empty"><Sparkles size={24} /><strong>还没有公开作品</strong><p>发布一个可以被体验的最小版本，主页会自动更新。</p><Link className="primary-action" href="/studio/new">创建第一件作品</Link></div>}</section><aside className="profile-badges"><span className="deep-eyebrow"><Award size={14} /> COMMUNITY RECORD</span><h3>社区记录</h3>{badges.map((badge) => <div key={badge.name}><span>{badge.icon}</span><span><strong>{badge.name}</strong><small>{badge.text}</small></span></div>)}</aside></div>
  </div>;
}
