"use client";

import {
  ArrowUpRight,
  Bell,
  Bookmark,
  Check,
  ChevronDown,
  CircleUserRound,
  Clock3,
  Coins,
  Compass,
  Eye,
  Flame,
  Gift,
  Heart,
  History,
  Home,
  LayoutGrid,
  MessageCircle,
  MoreHorizontal,
  Package,
  Pause,
  Play,
  Plus,
  Radio,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  UserRound,
  Users,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Member = { signedIn: boolean; displayName: string; initial: string };

type Product = {
  id: string | number;
  ownerName: string;
  ownerInitial?: string;
  title: string;
  description: string;
  category: string;
  demoType: string;
  demoUrl?: string | null;
  coverTheme: string;
  price: number;
  likes: number;
  plays: number;
  createdAt?: string;
  image?: string;
  featured?: boolean;
  badge?: string;
};

type Post = {
  id: string | number;
  ownerName: string;
  content: string;
  likes: number;
  comments: number;
  createdAt?: string;
};

type Transaction = {
  id: string | number;
  delta: number;
  type: string;
  description: string;
  createdAt: string;
};

type CommunityPayload = {
  products: Product[];
  posts: Post[];
  wallet: null | { balance: number; lifetimeEarned: number; lifetimeSpent: number };
  transactions: Transaction[];
};

const staticProducts: Product[] = [
  {
    id: "mori",
    ownerName: "林默",
    ownerInitial: "林",
    title: "MORI 专注森林",
    description: "把专注时段变成会生长的声音景观。戴上耳机，种下今天的第一棵树。",
    category: "声音影像",
    demoType: "focus",
    coverTheme: "mint",
    price: 0,
    likes: 842,
    plays: 12800,
    featured: true,
    badge: "本周新星",
    image:
      "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1400&q=85",
  },
  {
    id: "wander",
    ownerName: "小路",
    ownerInitial: "路",
    title: "漫游路线生成器",
    description: "给我 40 分钟，带你绕开熟悉的街道。",
    category: "生活方式",
    demoType: "route",
    coverTheme: "blue",
    price: 6,
    likes: 319,
    plays: 4600,
    image:
      "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: "typewave",
    ownerName: "Niko",
    ownerInitial: "N",
    title: "字浪排版实验室",
    description: "用节奏控制字距、重量与呼吸。",
    category: "互动体验",
    demoType: "type",
    coverTheme: "coral",
    price: 9,
    likes: 577,
    plays: 7900,
    image:
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: "loops",
    ownerName: "阿声",
    ownerInitial: "声",
    title: "四拍 Loop 厨房",
    description: "把窗外的声音切成一段可以分享的节拍。",
    category: "声音影像",
    demoType: "mix",
    coverTheme: "yellow",
    price: 12,
    likes: 264,
    plays: 3800,
    image:
      "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: "sprout",
    ownerName: "松果工作室",
    ownerInitial: "松",
    title: "阳台芽点日志",
    description: "轻量记录光照、浇水和每一片新叶。",
    category: "效率工具",
    demoType: "tracker",
    coverTheme: "ink",
    price: 4,
    likes: 186,
    plays: 2100,
    image:
      "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=900&q=85",
  },
];

const staticPosts: Post[] = [
  {
    id: "post-1",
    ownerName: "贺千",
    content: "把产品里最漂亮但没人用的页面删掉以后，核心体验反而更清楚了。今晚发第 7 个版本。",
    likes: 96,
    comments: 18,
    createdAt: "18 分钟前",
  },
  {
    id: "post-2",
    ownerName: "听筒",
    content: "正在收集城市里不被注意的声音：卷帘门、早班公交、雨棚。已经有 43 段，准备做成一张可玩的地图。",
    likes: 141,
    comments: 27,
    createdAt: "1 小时前",
  },
];

const navItems = [
  { id: "home", label: "发现", icon: Home },
  { id: "feed", label: "动态", icon: Radio },
  { id: "collections", label: "收藏", icon: Bookmark },
  { id: "profile", label: "我的创作", icon: Package },
];

const circles = [
  { name: "独立开发", count: "8.4k", color: "coral" },
  { name: "声音实验", count: "3.1k", color: "blue" },
  { name: "小型游戏", count: "6.8k", color: "yellow" },
  { name: "生活发明", count: "4.2k", color: "mint" },
];

function compact(value: number) {
  return value >= 10000
    ? `${(value / 10000).toFixed(1)}w`
    : value >= 1000
      ? `${(value / 1000).toFixed(1)}k`
      : String(value);
}

function timeLabel(value?: string) {
  if (!value || /分钟前|小时前|天前/.test(value)) return value ?? "刚刚";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
  return `${Math.floor(minutes / 1440)} 天前`;
}

export default function CommunityApp({ member }: { member: Member }) {
  const [activeNav, setActiveNav] = useState("home");
  const [feedFilter, setFeedFilter] = useState("推荐");
  const [search, setSearch] = useState("");
  const [remoteProducts, setRemoteProducts] = useState<Product[]>([]);
  const [remotePosts, setRemotePosts] = useState<Post[]>([]);
  const [wallet, setWallet] = useState<CommunityPayload["wallet"]>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [experience, setExperience] = useState<Product | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [postText, setPostText] = useState("");
  const [toast, setToast] = useState("");
  const [liked, setLiked] = useState<Set<string | number>>(new Set());
  const [loading, setLoading] = useState(false);

  const refreshCommunity = async () => {
    try {
      const response = await fetch("/api/community", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as CommunityPayload;
      setRemoteProducts(data.products ?? []);
      setRemotePosts(data.posts ?? []);
      setWallet(data.wallet);
      setTransactions(data.transactions ?? []);
    } catch {
      // The public showcase remains available while the local database starts.
    }
  };

  useEffect(() => {
    refreshCommunity();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const products = useMemo(() => {
    const all = [...remoteProducts, ...staticProducts];
    const query = search.trim().toLowerCase();
    if (!query) return all;
    return all.filter((product) =>
      `${product.title} ${product.description} ${product.category} ${product.ownerName}`
        .toLowerCase()
        .includes(query),
    );
  }, [remoteProducts, search]);

  const posts = [...remotePosts, ...staticPosts];

  const authGate = () => {
    if (member.signedIn) return true;
    window.location.href = "/signin-with-chatgpt?return_to=%2F";
    return false;
  };

  const openExperience = (product: Product) => {
    setExperience(product);
    fetch("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "experience", productId: product.id }),
    }).catch(() => undefined);
  };

  const likeProduct = async (product: Product) => {
    if (!authGate()) return;
    if (liked.has(product.id)) return;
    setLiked((current) => new Set(current).add(product.id));
    try {
      await fetch("/api/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "like", productId: product.id }),
      });
    } finally {
      setToast("已收进你的喜欢");
    }
  };

  const submitPost = async (event: FormEvent) => {
    event.preventDefault();
    if (!postText.trim() || !authGate()) return;
    setLoading(true);
    try {
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "post", content: postText }),
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { post: Post };
      setRemotePosts((current) => [data.post, ...current]);
      setPostText("");
      setToast("动态已发布");
    } catch {
      setToast("发布失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const claimDaily = async () => {
    if (!authGate()) return;
    const response = await fetch("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "check_in" }),
    });
    if (response.ok) {
      setToast("今日灵感补给 +8");
      await refreshCommunity();
    } else {
      setToast("今天已经领取过了");
    }
  };

  const submitProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authGate()) return;
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    setLoading(true);
    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { product: Product; reward: number };
      setRemoteProducts((current) => [data.product, ...current]);
      setPublishOpen(false);
      setToast(`作品已发布，创作奖励 +${data.reward}`);
      await refreshCommunity();
    } catch {
      setToast("发布失败，请检查作品信息");
    } finally {
      setLoading(false);
    }
  };

  const tipProduct = async (product: Product, amount: number) => {
    if (!authGate()) return;
    if (typeof product.id !== "number") {
      setToast("演示作品暂不接收支持");
      return;
    }
    const response = await fetch("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "tip", productId: product.id, amount }),
    });
    if (response.ok) {
      setToast(`已用 ${amount} 果支持创作者`);
      await refreshCommunity();
    } else {
      const data = (await response.json()) as { error?: string };
      setToast(data.error === "insufficient_balance" ? "果子余额不足" : "暂时无法支持这件作品");
    }
  };

  const selectNav = (id: string) => {
    if (id === "wallet") {
      setWalletOpen(true);
      return;
    }
    setActiveNav(id);
  };

  return (
    <div className="community-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setActiveNav("home")} aria-label="返回造场首页">
          <span className="brand-mark"><i /><i /><i /></span>
          <span>造场</span>
          <small>ZAOCHANG</small>
        </button>

        <label className="global-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索作品、创作者、圈子"
            aria-label="搜索社区"
          />
          <kbd>⌘ K</kbd>
        </label>

        <div className="topbar-actions">
          <button className="icon-button" aria-label="通知" title="通知">
            <Bell size={19} />
            <span className="notification-dot" />
          </button>
          <button className="balance-button" onClick={() => setWalletOpen(true)}>
            <Coins size={17} />
            <strong>{wallet?.balance ?? 120}</strong>
            <span>果</span>
          </button>
          <button className="create-button" onClick={() => setPublishOpen(true)}>
            <Plus size={17} />
            发布作品
          </button>
          {member.signedIn ? (
            <button className="account-button" onClick={() => setActiveNav("profile")} title="个人主页">
              <span className="avatar avatar-user">{member.initial}</span>
              <ChevronDown size={15} />
            </button>
          ) : (
            <a className="sign-in-button" href="/signin-with-chatgpt?return_to=%2F">
              登录
            </a>
          )}
        </div>
      </header>

      <div className="page-grid">
        <aside className="left-rail">
          <nav className="primary-nav" aria-label="社区导航">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={activeNav === item.id ? "active" : ""}
                  onClick={() => selectNav(item.id)}
                >
                  <Icon size={19} />
                  <span>{item.label}</span>
                </button>
              );
            })}
            <button onClick={() => setWalletOpen(true)}>
              <WalletCards size={19} />
              <span>果子钱包</span>
            </button>
          </nav>

          <div className="rail-section">
            <div className="rail-title"><span>我的圈子</span><button title="发现圈子" aria-label="发现圈子"><Plus size={15} /></button></div>
            {circles.map((circle) => (
              <button className="circle-link" key={circle.name}>
                <span className={`circle-dot ${circle.color}`} />
                <span>{circle.name}</span>
                <small>{circle.count}</small>
              </button>
            ))}
          </div>

          <div className="rail-callout">
            <Sparkles size={20} />
            <strong>七月造物挑战</strong>
            <span>还剩 4 天 · 286 人参与</span>
            <div className="callout-progress"><i /></div>
          </div>

          <div className="rail-footer">
            <span>社区公约</span><span>创作者指南</span><span>关于</span>
            <small>© 2026 造场社区</small>
          </div>
        </aside>

        <main className="main-feed">
          {activeNav === "profile" ? (
            <ProfileView member={member} products={remoteProducts} wallet={wallet} onPublish={() => setPublishOpen(true)} />
          ) : activeNav === "collections" ? (
            <CollectionView products={products.filter((product) => liked.has(product.id)).slice(0, 6)} onExperience={openExperience} onLike={likeProduct} liked={liked} />
          ) : (
            <>
              <section className="feed-heading">
                <div>
                  <span className="eyebrow"><Flame size={14} /> 今日热场</span>
                  <h1>{activeNav === "feed" ? "创作者动态" : "今天，大家都在造什么"}</h1>
                </div>
                <button className="filter-button"><SlidersHorizontal size={16} /> 筛选</button>
              </section>

              {activeNav === "home" && !search && (
                <FeaturedProduct product={staticProducts[0]} onExperience={openExperience} onLike={likeProduct} liked={liked.has(staticProducts[0].id)} />
              )}

              <div className="feed-tabs" role="tablist" aria-label="内容筛选">
                {["推荐", "最新", "关注"].map((filter) => (
                  <button
                    key={filter}
                    role="tab"
                    aria-selected={feedFilter === filter}
                    className={feedFilter === filter ? "active" : ""}
                    onClick={() => setFeedFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {activeNav === "feed" ? (
                <CommunityFeed
                  member={member}
                  posts={posts}
                  postText={postText}
                  setPostText={setPostText}
                  submitPost={submitPost}
                  loading={loading}
                />
              ) : (
                <section className="product-grid" aria-label="作品列表">
                  {products.slice(search ? 0 : 1).map((product, index) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      rank={index + 1}
                      liked={liked.has(product.id)}
                      onExperience={openExperience}
                      onLike={likeProduct}
                    />
                  ))}
                  {products.length === 0 && (
                    <div className="empty-state">
                      <Search size={28} />
                      <strong>没有找到相关作品</strong>
                      <span>换一个关键词再看看</span>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </main>

        <aside className="right-rail">
          <section className="daily-board">
            <div className="section-title"><span><TrendingIcon /> 今日上升</span><button aria-label="更多" title="更多"><MoreHorizontal size={18} /></button></div>
            {staticProducts.slice(1, 4).map((product, index) => (
              <button key={product.id} className="ranking-row" onClick={() => openExperience(product)}>
                <b>0{index + 1}</b>
                <img src={product.image} alt="" />
                <span><strong>{product.title}</strong><small>{product.ownerName} · +{38 - index * 9}%</small></span>
                <ArrowUpRight size={15} />
              </button>
            ))}
          </section>

          <section className="creator-board">
            <div className="section-title"><span><Users size={17} /> 值得认识</span><button>换一批</button></div>
            {[
              ["K", "Kiko Wu", "微型产品设计", "coral"],
              ["湛", "湛蓝工作间", "生成影像", "blue"],
              ["王", "王不慢", "独立开发", "yellow"],
            ].map(([initial, name, role, color]) => (
              <div className="creator-row" key={name}>
                <span className={`avatar ${color}`}>{initial}</span>
                <span><strong>{name}</strong><small>{role}</small></span>
                <button className="follow-button">关注</button>
              </div>
            ))}
          </section>

          <button className="challenge-banner" onClick={() => setPublishOpen(true)}>
            <span><Zap size={17} /> 本月命题</span>
            <strong>为“等候”<br />做一件东西</strong>
            <small>奖金池 18,600 果</small>
            <ArrowUpRight size={19} />
          </button>
        </aside>
      </div>

      <nav className="mobile-nav" aria-label="移动端导航">
        {navItems.slice(0, 3).map((item) => {
          const Icon = item.icon;
          return <button key={item.id} className={activeNav === item.id ? "active" : ""} onClick={() => selectNav(item.id)}><Icon size={20} /><span>{item.label}</span></button>;
        })}
        <button className="mobile-create" onClick={() => setPublishOpen(true)} aria-label="发布作品"><Plus size={23} /></button>
        <button onClick={() => setWalletOpen(true)}><WalletCards size={20} /><span>钱包</span></button>
      </nav>

      {experience && (
        <ExperienceModal
          product={experience}
          liked={liked.has(experience.id)}
          onClose={() => setExperience(null)}
          onLike={likeProduct}
          onTip={tipProduct}
        />
      )}
      {publishOpen && <PublishModal onClose={() => setPublishOpen(false)} onSubmit={submitProduct} loading={loading} />}
      {walletOpen && (
        <WalletDrawer
          signedIn={member.signedIn}
          wallet={wallet}
          transactions={transactions}
          onClose={() => setWalletOpen(false)}
          onClaim={claimDaily}
        />
      )}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  );
}

function TrendingIcon() {
  return <Flame size={17} />;
}

function FeaturedProduct({ product, onExperience, onLike, liked }: { product: Product; onExperience: (product: Product) => void; onLike: (product: Product) => void; liked: boolean }) {
  return (
    <article className="featured-product">
      <div className="featured-visual">
        <img src={product.image} alt="林间晨雾，MORI 专注森林的视觉场景" />
        <div className="feature-overlay">
          <div className="mori-status"><span /><b>42:18</b><small>深度专注中</small></div>
          <div className="sound-bars">{Array.from({ length: 18 }).map((_, index) => <i key={index} style={{ height: `${18 + ((index * 17) % 54)}%` }} />)}</div>
        </div>
        <span className="feature-badge"><Trophy size={14} /> {product.badge}</span>
      </div>
      <div className="featured-copy">
        <span className="product-category">{product.category}</span>
        <h2>{product.title}</h2>
        <p>{product.description}</p>
        <div className="creator-line"><span className="avatar mint">{product.ownerInitial}</span><strong>{product.ownerName}</strong><span>共创者 2,431</span></div>
        <div className="feature-actions">
          <button className="play-button" onClick={() => onExperience(product)}><Play size={18} fill="currentColor" /> 立即体验</button>
          <button className={liked ? "round-action liked" : "round-action"} onClick={() => onLike(product)} aria-label="喜欢作品" title="喜欢"><Heart size={19} fill={liked ? "currentColor" : "none"} /></button>
          <div className="feature-stats"><span><Eye size={16} /> {compact(product.plays)}</span><span><Heart size={16} /> {compact(product.likes + (liked ? 1 : 0))}</span></div>
        </div>
      </div>
    </article>
  );
}

function ProductCard({ product, rank, liked, onExperience, onLike }: { product: Product; rank: number; liked: boolean; onExperience: (product: Product) => void; onLike: (product: Product) => void }) {
  return (
    <article className="product-card">
      <button className={`product-cover theme-${product.coverTheme}`} onClick={() => onExperience(product)} aria-label={`体验 ${product.title}`}>
        {product.image ? <img src={product.image} alt="" /> : <GeneratedCover product={product} rank={rank} />}
        <span className="cover-play"><Play size={20} fill="currentColor" /></span>
        <span className="price-tag">{product.price === 0 ? "免费" : <><Coins size={13} /> {product.price}</>}</span>
      </button>
      <div className="product-info">
        <div className="card-title-row"><span><small>{product.category}</small><h3>{product.title}</h3></span><button className={liked ? "card-like liked" : "card-like"} onClick={() => onLike(product)} aria-label="喜欢" title="喜欢"><Heart size={17} fill={liked ? "currentColor" : "none"} /></button></div>
        <p>{product.description}</p>
        <div className="card-meta"><span className={`avatar avatar-small ${product.coverTheme}`}>{product.ownerInitial ?? product.ownerName[0]}</span><strong>{product.ownerName}</strong><span><Eye size={14} /> {compact(product.plays)}</span><span><Heart size={14} /> {compact(product.likes + (liked ? 1 : 0))}</span></div>
      </div>
    </article>
  );
}

function GeneratedCover({ product, rank }: { product: Product; rank: number }) {
  return (
    <div className="generated-cover">
      <span className="generated-index">0{Math.min(rank, 9)}</span>
      <div className="generated-window"><i /><i /><i /><strong>{product.title.slice(0, 8)}</strong><span>{product.category}</span></div>
      <div className="generated-disc" />
    </div>
  );
}

function CommunityFeed({ member, posts, postText, setPostText, submitPost, loading }: { member: Member; posts: Post[]; postText: string; setPostText: (value: string) => void; submitPost: (event: FormEvent) => void; loading: boolean }) {
  return (
    <section className="community-feed">
      <form className="post-composer" onSubmit={submitPost}>
        <span className="avatar avatar-user">{member.initial}</span>
        <input value={postText} onChange={(event) => setPostText(event.target.value)} placeholder="此刻你在造什么？" maxLength={280} />
        <button disabled={loading || !postText.trim()} aria-label="发布动态" title="发布"><Send size={18} /></button>
      </form>
      {posts.map((post, index) => (
        <article className="post-item" key={post.id}>
          <span className={`avatar ${["coral", "blue", "yellow", "mint"][index % 4]}`}>{post.ownerName[0]}</span>
          <div className="post-body">
            <div className="post-author"><strong>{post.ownerName}</strong><span>{timeLabel(post.createdAt)}</span><button aria-label="更多" title="更多"><MoreHorizontal size={18} /></button></div>
            <p>{post.content}</p>
            <div className="post-actions"><button><Heart size={17} /> {post.likes}</button><button><MessageCircle size={17} /> {post.comments}</button><button><ArrowUpRight size={17} /> 分享</button></div>
          </div>
        </article>
      ))}
    </section>
  );
}

function ProfileView({ member, products, wallet, onPublish }: { member: Member; products: Product[]; wallet: CommunityPayload["wallet"]; onPublish: () => void }) {
  return (
    <section className="profile-view">
      <div className="profile-masthead">
        <span className="avatar profile-avatar">{member.initial}</span>
        <div><span className="eyebrow">个人创作台</span><h1>{member.signedIn ? member.displayName : "登录后建立你的创作者档案"}</h1><p>把小想法做成可以被别人体验、讨论与支持的作品。</p></div>
        <button className="create-button" onClick={onPublish}><Plus size={17} /> 发布新作</button>
      </div>
      <div className="profile-metrics">
        <div><span>已发布</span><strong>{products.length}</strong></div><div><span>总体验</span><strong>{compact(products.reduce((sum, item) => sum + item.plays, 0))}</strong></div><div><span>收到喜欢</span><strong>{compact(products.reduce((sum, item) => sum + item.likes, 0))}</strong></div><div><span>果子余额</span><strong>{wallet?.balance ?? 120}</strong></div>
      </div>
      <div className="studio-empty">
        <LayoutGrid size={32} />
        <strong>{products.length ? "你的作品正在社区里生长" : "第一件作品，从一个能玩的片段开始"}</strong>
        <button onClick={onPublish}>{products.length ? "继续发布" : "创建作品"}</button>
      </div>
    </section>
  );
}

function CollectionView({ products, onExperience, onLike, liked }: { products: Product[]; onExperience: (product: Product) => void; onLike: (product: Product) => void; liked: Set<string | number> }) {
  return (
    <section className="collection-view">
      <div className="feed-heading"><div><span className="eyebrow"><Bookmark size={14} /> 灵感收藏</span><h1>想再回来玩的作品</h1></div></div>
      {products.length ? <div className="product-grid">{products.map((product, index) => <ProductCard key={product.id} product={product} rank={index + 1} liked={liked.has(product.id)} onExperience={onExperience} onLike={onLike} />)}</div> : <div className="empty-state"><Bookmark size={28} /><strong>收藏夹还空着</strong><span>遇到喜欢的作品，点一下心形</span></div>}
    </section>
  );
}

function ExperienceModal({ product, liked, onClose, onLike, onTip }: { product: Product; liked: boolean; onClose: () => void; onLike: (product: Product) => void; onTip: (product: Product, amount: number) => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="experience-modal" role="dialog" aria-modal="true" aria-label={`体验 ${product.title}`}>
        <div className="modal-topline">
          <div><span className="product-category">{product.category}</span><strong>{product.title}</strong><small>by {product.ownerName}</small></div>
          <div><button className={liked ? "icon-button liked" : "icon-button"} onClick={() => onLike(product)} aria-label="喜欢" title="喜欢"><Heart size={19} fill={liked ? "currentColor" : "none"} /></button><button className="icon-button" onClick={onClose} aria-label="关闭" title="关闭"><X size={20} /></button></div>
        </div>
        <ExperienceStage product={product} />
        <div className="experience-footer">
          <p>{product.description}</p>
          <div className="support-strip"><span><Gift size={16} /> 支持创作者</span>{[5, 10, 25].map((amount) => <button key={amount} onClick={() => onTip(product, amount)}><Coins size={14} /> {amount}</button>)}</div>
        </div>
      </section>
    </div>
  );
}

function ExperienceStage({ product }: { product: Product }) {
  const [running, setRunning] = useState(false);
  const [level, setLevel] = useState(62);
  const [accent, setAccent] = useState("#ff5a36");
  return (
    <div className={`experience-stage stage-${product.demoType}`} style={{ "--demo-accent": accent } as React.CSSProperties}>
      {product.image && <img className="stage-background" src={product.image} alt="" />}
      <div className="stage-panel">
        <span className="stage-kicker">LIVE PROTOTYPE / 01</span>
        <strong>{product.demoType === "focus" ? (running ? "24:47" : "25:00") : product.title}</strong>
        <p>{running ? "体验正在发生" : "点击开始，进入这个作品"}</p>
        <button className="stage-play" onClick={() => setRunning((value) => !value)}>{running ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}{running ? "暂停" : "开始体验"}</button>
        <label><span>强度</span><input type="range" min="10" max="100" value={level} onChange={(event) => setLevel(Number(event.target.value))} /><b>{level}</b></label>
        <div className="accent-switcher">{["#ff5a36", "#b4efc8", "#8bc5ff", "#f2c84b"].map((color) => <button key={color} style={{ background: color }} onClick={() => setAccent(color)} aria-label="切换体验颜色" />)}</div>
        {product.demoUrl && <a href={product.demoUrl} target="_blank" rel="noreferrer">打开完整作品 <ArrowUpRight size={15} /></a>}
      </div>
      <div className="stage-meter">{Array.from({ length: 24 }).map((_, index) => <i key={index} style={{ height: `${12 + ((index * level) % 78)}%` }} />)}</div>
    </div>
  );
}

function PublishModal({ onClose, onSubmit, loading }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; loading: boolean }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="publish-modal" role="dialog" aria-modal="true" aria-label="发布作品">
        <div className="modal-heading"><div><span>CREATE / 01</span><h2>把新东西放进场里</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭" title="关闭"><X size={20} /></button></div>
        <form onSubmit={onSubmit}>
          <label><span>作品名称</span><input name="title" required minLength={2} maxLength={36} placeholder="例如：雨天散步生成器" /></label>
          <label><span>一句话介绍</span><textarea name="description" required minLength={12} maxLength={180} placeholder="它为谁解决什么，或者带来怎样的体验？" /></label>
          <div className="form-row">
            <label><span>类别</span><select name="category" defaultValue="互动体验"><option>互动体验</option><option>效率工具</option><option>声音影像</option><option>生活方式</option><option>开发工具</option></select></label>
            <label><span>体验价格</span><div className="coin-input"><Coins size={16} /><input name="price" type="number" min="0" max="99" defaultValue="0" /></div></label>
          </div>
          <label><span>完整体验链接 <small>可选</small></span><input name="demoUrl" type="url" placeholder="https://" /></label>
          <fieldset><legend>封面色</legend><div className="theme-options">{["coral", "mint", "blue", "yellow", "ink"].map((theme, index) => <label key={theme} className={`theme-swatch ${theme}`}><input type="radio" name="coverTheme" value={theme} defaultChecked={index === 0} /><span><Check size={14} /></span></label>)}</div></fieldset>
          <div className="publish-note"><Sparkles size={17} /><span>发布首个版本将获得 <strong>20 果</strong> 创作奖励</span></div>
          <button className="publish-submit" disabled={loading}>{loading ? "发布中…" : "发布作品"}<ArrowUpRight size={18} /></button>
        </form>
      </section>
    </div>
  );
}

function WalletDrawer({ signedIn, wallet, transactions, onClose, onClaim }: { signedIn: boolean; wallet: CommunityPayload["wallet"]; transactions: Transaction[]; onClose: () => void; onClaim: () => void }) {
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="wallet-drawer" role="dialog" aria-modal="true" aria-label="果子钱包">
        <div className="drawer-heading"><div><span><WalletCards size={18} /> 果子钱包</span><small>站内创作积分</small></div><button className="icon-button" onClick={onClose} aria-label="关闭" title="关闭"><X size={20} /></button></div>
        <div className="wallet-balance"><span>可用余额</span><strong>{wallet?.balance ?? 120}<small>果</small></strong><div><span>累计获得 <b>{wallet?.lifetimeEarned ?? 120}</b></span><span>累计支持 <b>{wallet?.lifetimeSpent ?? 0}</b></span></div></div>
        <button className="daily-claim" onClick={onClaim}><span><Gift size={20} /><span><strong>每日灵感补给</strong><small>今天可领取 8 果</small></span></span><b>领取</b></button>
        <div className="wallet-rules"><div><Zap size={17} /><span><strong>发布作品</strong><small>每件 +20 果</small></span></div><div><Users size={17} /><span><strong>收到支持</strong><small>直接进入余额</small></span></div></div>
        <div className="transaction-list"><h3><History size={17} /> 最近流水</h3>{signedIn && transactions.length ? transactions.map((item) => <div className="transaction-row" key={item.id}><span className={item.delta > 0 ? "positive" : "negative"}>{item.delta > 0 ? "+" : ""}{item.delta}</span><span><strong>{item.description}</strong><small>{timeLabel(item.createdAt)}</small></span></div>) : <div className="transaction-empty"><CircleUserRound size={27} /><span>{signedIn ? "还没有新的流水" : "登录后查看完整账户流水"}</span></div>}</div>
        <p className="wallet-footnote">果子不可提现，不对应法币，仅用于社区内支持与体验。</p>
      </aside>
    </div>
  );
}
