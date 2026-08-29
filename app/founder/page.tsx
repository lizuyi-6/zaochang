import type { Metadata } from "next";
import { ArrowUpRight, BadgeCheck, Boxes, FolderKanban, Orbit, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdminEmail, requireFounder } from "../api/_lib/access-control";
import { database } from "../api/_lib/community";
import { FOUNDER_DISPLAY_NAME, products as showcaseProducts } from "../lib/community-data";

export const metadata: Metadata = { title: "创始人中心" };
export const dynamic = "force-dynamic";

type CountRow = { count: number };
type OwnedProduct = {
  id: number;
  title: string;
  category: string;
  status: string;
  reviewStatus: string;
  updatedAt: string;
};

export default async function FounderPage() {
  let founder: Awaited<ReturnType<typeof requireFounder>>;
  try {
    founder = await requireFounder();
  } catch {
    notFound();
  }

  const db = database();
  const admin = isAdminEmail(founder.email);
  const officialProducts = showcaseProducts.filter((product) => product.founderOwned);
  const [ownedResult, incubationCount, pendingProductCount, pendingProjectCount] = await Promise.all([
    db.prepare(
      `SELECT id, title, category, status, review_status AS reviewStatus, created_at AS updatedAt
       FROM products WHERE owner_email = ? ORDER BY created_at DESC, id DESC`,
    ).bind(founder.email).all<OwnedProduct>(),
    db.prepare("SELECT COUNT(*) AS count FROM incubation_projects WHERE user_email = ?").bind(founder.email).first<CountRow>(),
    admin
      ? db.prepare("SELECT COUNT(*) AS count FROM products WHERE review_status = 'pending_review'").first<CountRow>()
      : Promise.resolve({ count: 0 }),
    admin
      ? db.prepare("SELECT COUNT(*) AS count FROM incubation_projects WHERE status <> '进入银河'").first<CountRow>()
      : Promise.resolve({ count: 0 }),
  ]);

  const databaseProducts = ownedResult.results;
  const operationalTasks = Number(pendingProductCount?.count ?? 0) + Number(pendingProjectCount?.count ?? 0);

  return <div className="founder-center">
    <header className="founder-hero">
      <div className="founder-seal"><Orbit size={28} /><span>01</span></div>
      <div>
        <span className="deep-eyebrow"><BadgeCheck size={14} /> FOUNDER / ZAOCHANG</span>
        <h1>创始人中心</h1>
        <p>这是 {FOUNDER_DISPLAY_NAME} 的专属身份与资产总览。造场预置产品在这里统一归档，平台运营权限仍由独立管理员白名单控制。</p>
      </div>
      <aside>
        <span>唯一创始人身份</span>
        <strong>{founder.displayName}</strong>
        <small>{admin ? "创始人 · 平台管理员" : "创始人 · 产品所有者"}</small>
      </aside>
    </header>

    <section className="founder-metrics" aria-label="创始人资产概览">
      <div><span>造场预置产品</span><strong>{officialProducts.length}</strong><small>全部归属创始人</small></div>
      <div><span>账户发布产品</span><strong>{databaseProducts.length}</strong><small>数据库真实归属</small></div>
      <div><span>本人孵化项目</span><strong>{Number(incubationCount?.count ?? 0)}</strong><small>以登录邮箱核对</small></div>
      <div><span>待处理运营事项</span><strong>{admin ? operationalTasks : "--"}</strong><small>{admin ? "预审与孵化队列" : "需要管理员权限"}</small></div>
    </section>

    <section className="founder-actions" aria-label="创始人快捷操作">
      <Link href="/galaxy"><Orbit size={19} /><span><strong>查看产品银河</strong><small>从公开视角检查官方产品</small></span><ArrowUpRight size={16} /></Link>
      <Link href="/studio"><FolderKanban size={19} /><span><strong>管理我的发布</strong><small>查看草稿、审核与上线状态</small></span><ArrowUpRight size={16} /></Link>
      {admin && <Link className="founder-primary-action" href="/admin"><ShieldCheck size={19} /><span><strong>进入平台管理</strong><small>{operationalTasks} 项预审或孵化事项待处理</small></span><ArrowUpRight size={16} /></Link>}
    </section>

    <section className="founder-portfolio">
      <header><div><span className="deep-eyebrow"><Boxes size={14} /> OFFICIAL PORTFOLIO / {String(officialProducts.length).padStart(2, "0")}</span><h2>造场官方资产</h2></div><p>这些预置产品在展示层统一标记为创始人作品；社区成员发布的作品仍保留真实作者与收益归属。</p></header>
      <div className="founder-product-list">
        {officialProducts.map((product, index) => <Link href={`/product/${product.slug}`} key={product.id}>
          <span className={`founder-product-orbit ${product.coverTheme}`}><i /><b>{String(index + 1).padStart(2, "0")}</b></span>
          <span><small>{product.category}</small><strong>{product.title}</strong><p>{product.description}</p></span>
          <em><BadgeCheck size={13} /> {FOUNDER_DISPLAY_NAME}</em>
          <ArrowUpRight size={16} />
        </Link>)}
      </div>
    </section>

    <section className="founder-database-products">
      <header><div><span className="deep-eyebrow"><Sparkles size={14} /> ACCOUNT PRODUCTS / {String(databaseProducts.length).padStart(2, "0")}</span><h2>账户创建的产品</h2></div><Link href="/studio/new">发布新产品 <ArrowUpRight size={14} /></Link></header>
      {databaseProducts.length ? databaseProducts.map((product) => <article key={product.id}>
        <div><strong>{product.title}</strong><small>{product.category} · {product.updatedAt}</small></div>
        <span>{product.reviewStatus === "approved" ? "审核通过" : product.reviewStatus === "rejected" ? "已驳回" : "等待预审"}</span>
        <Link href="/studio">管理 <ArrowUpRight size={13} /></Link>
      </article>) : <div className="founder-empty"><Sparkles size={20} /><span><strong>还没有数据库产品</strong><small>上面的六项是造场预置资产；你之后从创作台发布的产品会出现在这里。</small></span></div>}
    </section>
  </div>;
}
