"use client";

import { ArrowDown, ArrowRight, ArrowUp, BarChart3, BookOpen, Check, Eye, Heart, Lock, LogIn, Plus, Radio, Sparkles, Users, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatedNumber } from "../components/animated-number";
import { Reveal } from "../components/reveal";

type StudioProduct = { id: number; title: string; category: string; imageUrl?: string | null; coverTheme: string; plays: number; likes: number; status: string; reviewStatus: "pending_review" | "approved" | "rejected"; reviewVersion: number; approvedVersion: number; reviewedAt?: string | null; reviewNote?: string; submittedAt: string; createdAt: string };
type Wallet = { lifetimeEarned: number };
type Draft = { title?: string; description?: string; category?: string; imageUrl?: string; theme?: string };
type AuthoredBook = { id: string; slug: string; title: string; summary: string; coverHue: number; coverImage: string; bannerImage: string; visibility: "public" | "members" | "private"; chapterCount: number; updatedAt: string };
type RecentBook = { bookId: string; bookSlug: string; bookTitle: string; coverHue: number; coverImage: string; visibility: "public" | "members" | "private"; summary: string; chapterId: string; chapterTitle: string; href: string; updatedAt: string };

function reviewLabel(product: StudioProduct) {
  if (product.reviewStatus === "approved" && product.approvedVersion === product.reviewVersion) return { text: "已发布", className: "live" };
  if (product.reviewStatus === "rejected") return { text: "未通过", className: "rejected" };
  return { text: "审核中", className: "pending" };
}

function StudioProductRow({ product, index, manage, first, last, move }: { product: StudioProduct; index: number; manage: boolean; first: boolean; last: boolean; move: (index: number, delta: number) => void }) {
  const review = reviewLabel(product);
  const approved = review.className === "live";
  const content = <><span className="project-index">{String(index + 1).padStart(2, "0")}</span>{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span className={`studio-project-placeholder ${product.coverTheme}`} />}<span className="project-main"><strong>{product.title}</strong><small>{product.createdAt} · {product.category}{product.reviewNote ? ` · ${product.reviewNote}` : ""}</small></span><span><Eye size={14} /> {product.plays.toLocaleString()}</span><span><Heart size={14} /> {product.likes}</span><em className={review.className}>{review.text}</em>{approved ? <ArrowRight size={16} /> : <span aria-hidden="true" />}</>;
  return <div className="studio-project-row">{approved ? <Link href={`/product/${product.id}`}>{content}</Link> : <div className="studio-project-summary">{content}</div>}{manage && <span className="project-order-controls"><button onClick={() => move(index, -1)} disabled={first} aria-label="上移"><ArrowUp size={14} /></button><button onClick={() => move(index, 1)} disabled={last} aria-label="下移"><ArrowDown size={14} /></button></span>}</div>;
}

export function StudioClient() {
  const [metric, setMetric] = useState<"体验" | "喜欢">("体验");
  const [manage, setManage] = useState(false);
  const [products, setProducts] = useState<StudioProduct[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [isFounder, setIsFounder] = useState(false);
  const [books, setBooks] = useState<AuthoredBook[]>([]);
  const [reading, setReading] = useState<RecentBook[]>([]);
  const [wallet, setWallet] = useState<Wallet>({ lifetimeEarned: 0 });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const rawDraft = localStorage.getItem("zaochang-product-draft");
      if (rawDraft) try { const parsed = JSON.parse(rawDraft) as Draft; if (parsed.title || parsed.description) setDraft(parsed); } catch { localStorage.removeItem("zaochang-product-draft"); }
    });
    fetch("/api/community", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => {
      const payload = data as { signedIn?: boolean; isFounder?: boolean; ownedProducts?: StudioProduct[]; authoredBooks?: AuthoredBook[]; recentReading?: RecentBook[]; wallet?: Wallet | null } | null;
      const remote = payload?.ownedProducts ?? [];
      setSignedIn(Boolean(payload?.signedIn));
      setIsFounder(Boolean(payload?.isFounder));
      setProducts(remote);
      setBooks(payload?.authoredBooks ?? []);
      setReading(payload?.recentReading ?? []);
      setWallet(payload?.wallet ?? { lifetimeEarned: 0 });
      const saved = localStorage.getItem("zaochang-studio-order");
      let parsed: number[] = [];
      if (saved) try { parsed = JSON.parse(saved) as number[]; } catch { localStorage.removeItem("zaochang-studio-order"); }
      const valid = parsed.filter((id) => remote.some((item) => item.id === id));
      setOrder([...valid, ...remote.map((item) => item.id).filter((id) => !valid.includes(id))]);
    }).catch(() => setSignedIn(false));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const orderedProducts = useMemo(() => order.map((id) => products.find((item) => item.id === id)).filter(Boolean) as StudioProduct[], [order, products]);
  const move = (index: number, delta: number) => setOrder((current) => { const target = index + delta; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; localStorage.setItem("zaochang-studio-order", JSON.stringify(next)); return next; });
  const totals = useMemo(() => ({ plays: products.reduce((sum, item) => sum + item.plays, 0), likes: products.reduce((sum, item) => sum + item.likes, 0) }), [products]);
  const values = orderedProducts.map((item) => metric === "体验" ? item.plays : item.likes);
  const peak = Math.max(1, ...values);
  const bars = values.length ? values.map((value) => `${Math.max(10, Math.round(value / peak * 100))}%`) : ["8%", "8%", "8%", "8%"];
  const approvedCount = products.filter((product) => product.reviewStatus === "approved" && product.approvedVersion === product.reviewVersion).length;
  const pendingCount = products.filter((product) => product.reviewStatus === "pending_review").length;
  const publishedProducts = orderedProducts.filter((product) => product.reviewStatus === "approved" && product.approvedVersion === product.reviewVersion);

  return <div className="studio-page">
    <header className="route-hero studio-hero"><div><span className="deep-eyebrow"><Sparkles size={14} /> CREATOR STUDIO</span><h1>你的作品，正在怎样生长</h1><p>从发布、被体验到获得支持，所有信号都汇集在这里。</p></div><Link className="primary-action" href={signedIn === false ? "/signin?return_to=%2Fstudio%2Fnew" : "/studio/new"}><Plus size={17} /> 创建新作品</Link></header>
    <section className="studio-metrics"><div><span><Eye size={16} /> 总体验</span><strong><AnimatedNumber value={totals.plays} /></strong><small>{products.length ? `${approvedCount} 件已发布 · ${pendingCount} 件审核中` : "提交预审后开始记录"}</small><i className="metric-sparkline one" /></div><div><span><Heart size={16} /> 收到喜欢</span><strong><AnimatedNumber value={totals.likes} /></strong><small>{totals.plays ? `${Math.round(totals.likes / totals.plays * 100)}% 体验者留下喜欢` : "等待第一位体验者"}</small><i className="metric-sparkline two" /></div><div><span><Users size={16} /> 作品数量</span><strong><AnimatedNumber value={products.length} /></strong><small>{draft ? "另有 1 份本机草稿" : "包含审核中与已发布作品"}</small><i className="metric-sparkline three" /></div><div><span><Zap size={16} /> 累计获得</span><strong><AnimatedNumber value={wallet.lifetimeEarned} suffix=" 果" /></strong><small>来自有效点赞与作品收入</small><i className="metric-sparkline four" /></div></section>
    <div className="studio-grid"><section className="studio-panel analytics-panel"><div className="panel-heading"><span><BarChart3 size={17} /> 作品{metric}对比</span><div>{(["体验", "喜欢"] as const).map((item) => <button key={item} className={metric === item ? "active" : ""} onClick={() => setMetric(item)}>{item}</button>)}</div></div><div className="analytics-chart"><div className="chart-grid">{Array.from({ length: 5 }).map((_, index) => <i key={index} />)}</div><div className="chart-bars">{bars.map((height, index) => <span key={index} style={{ height }} title={orderedProducts[index] ? `${orderedProducts[index].title}: ${values[index]}` : "暂无数据"}><b /></span>)}</div><div className="chart-labels"><span>{orderedProducts[0]?.title ?? "暂无作品"}</span><span>{orderedProducts.at(-1)?.title ?? "提交后显示"}</span></div></div></section><aside className="studio-panel release-panel"><div className="panel-heading"><span><Radio size={17} /> 最近作品</span><Link href="/feed">发布动态</Link></div>{publishedProducts.slice(0, 3).map((item) => <Link className="release-row" href={`/product/${item.id}`} key={item.id}><i className={item.coverTheme} /><span><strong>{item.title}</strong><small>{item.createdAt}</small></span></Link>)}{publishedProducts.length === 0 && <div className="studio-panel-empty">平台审核通过后，公开版本会在这里汇总。</div>}</aside></div>
    {/* 最近阅读(/api/community recentReading):当前用户打开过的书,一步续读到上次章节。 */}
    {reading.length > 0 && <Reveal className="studio-reading">
      <div className="deep-section-heading"><div><span className="deep-eyebrow">RECENT READING / {String(reading.length).padStart(2, "0")}</span><h2>最近阅读</h2></div><Link href="/bookshelf">逛书架 <ArrowRight size={15} /></Link></div>
      <div className="studio-reading-list">{reading.map((book) => <Link key={book.bookId} href={book.href} className="reading-row"><span className="book-cover book-cover-sm" style={{ background: `linear-gradient(150deg, hsl(${book.coverHue} 42% 88%), hsl(${book.coverHue} 48% 70%))` }}>{book.coverImage ? <img src={book.coverImage} alt={book.bookTitle} loading="lazy" /> : <BookOpen size={16} style={{ color: `hsl(${book.coverHue} 40% 38%)` }} />}</span><span className="reading-meta"><strong>{book.bookTitle}{book.visibility !== "public" && <Lock size={11} aria-label="登录后可见" />}</strong><small>读到 · {book.chapterTitle}</small></span><ArrowRight size={15} /></Link>)}</div>
    </Reveal>}
    {/* 当前账户名下的书(/api/community authoredBooks)。有书才显示,卡片点进书架阅读。 */}
    {books.length > 0 && <Reveal className="studio-books">
      <div className="deep-section-heading"><div><span className="deep-eyebrow">YOUR BOOKS / {String(books.length).padStart(2, "0")}</span><h2>我的书</h2></div>{isFounder && <Link className="studio-books-manage" href="/studio/docs">管理书架 <ArrowRight size={15} /></Link>}</div>
      <div className="bookshelf-grid">{books.map((book) => <Link key={book.id} href={`/bookshelf/${encodeURIComponent(book.slug)}`} className="book-card">
        <span className="book-cover" style={{ background: `linear-gradient(150deg, hsl(${book.coverHue} 42% 88%), hsl(${book.coverHue} 48% 70%))` }}>{book.coverImage ? <img src={book.coverImage} alt={book.title} loading="lazy" /> : <><BookOpen size={26} style={{ color: `hsl(${book.coverHue} 40% 38%)` }} /><strong style={{ color: `hsl(${book.coverHue} 44% 26%)` }}>{book.title}</strong></>}</span>
        <span className="book-meta"><strong>{book.title}{book.visibility !== "public" && <Lock size={12} aria-label="登录后可见" />}</strong>{book.summary && <small>{book.summary}</small>}<em>{book.chapterCount} 章</em></span>
      </Link>)}</div>
    </Reveal>}
    {/* 创始人专属:文档/书架管理入口。仅当 /api/community 判定为创始人时渲染,页面本身也由 requireFounder 二次把关。 */}
    {isFounder && <section className="studio-panel studio-docs-entry"><div className="panel-heading"><span><BookOpen size={17} /> 文档与书架</span></div><p className="studio-docs-entry-text">管理造场文档与书架上的书——新建章节、编辑正文,并为书籍上传竖版封面与横版横幅。</p><Link className="primary-action" href="/studio/docs"><BookOpen size={16} /> 打开文档管理 <ArrowRight size={15} /></Link></section>}
    <Reveal className="studio-projects"><div className="deep-section-heading"><div><span className="deep-eyebrow">YOUR WORKS / {String(products.length + (draft ? 1 : 0)).padStart(2, "0")}</span><h2>作品与草稿</h2></div>{products.length > 1 && <button className={manage ? "active" : ""} onClick={() => setManage((value) => !value)}>{manage ? <><Check size={14} /> 保存顺序</> : "管理顺序"}</button>}</div><div className="studio-project-table">{orderedProducts.map((product, index) => <StudioProductRow product={product} index={index} manage={manage} first={index === 0} last={index === orderedProducts.length - 1} move={move} key={product.id} />)}{draft && <div className="studio-project-row studio-draft-row"><Link href="/studio/new"><span className="project-index">DR</span>{draft.imageUrl ? <img src={draft.imageUrl} alt="" /> : <span className={`studio-project-placeholder ${draft.theme ?? "coral"}`} />}<span className="project-main"><strong>{draft.title || "未命名草稿"}</strong><small>本机自动保存 · {draft.category || "未分类"}</small></span><span /><span /><em className="draft">继续编辑</em><ArrowRight size={16} /></Link></div>}</div>{signedIn === false && <div className="studio-empty"><LogIn size={25} /><strong>登录后管理你的作品</strong><p>提交、审核、数据、草稿和果子记录会集中到当前账号。</p><Link className="primary-action" href="/signin?return_to=%2Fstudio">登录造场</Link></div>}{signedIn === true && products.length === 0 && !draft && <div className="studio-empty"><Sparkles size={25} /><strong>这里还没有作品</strong><p>从一个能被审核和体验的最小版本开始。</p><Link className="primary-action" href="/studio/new">创建第一件作品</Link></div>}</Reveal>
  </div>;
}
