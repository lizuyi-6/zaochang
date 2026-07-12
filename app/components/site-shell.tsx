"use client";

import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import {
  Bell,
  BadgeCheck,
  Bookmark,
  ChevronDown,
  CircleUserRound,
  Coins,
  Compass,
  Flame,
  Home,
  Layers3,
  LogOut,
  Plus,
  Radio,
  Search,
  Sparkles,
  Trophy,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { circles, products } from "../lib/community-data";

type Member = { signedIn: boolean; displayName: string; initial: string };

const navItems = [
  { href: "/", label: "首页", icon: Home },
  { href: "/discover", label: "探索", icon: Compass },
  { href: "/feed", label: "动态", icon: Radio },
  { href: "/circles", label: "圈子", icon: Users },
  { href: "/challenges", label: "挑战", icon: Trophy },
  { href: "/collections", label: "收藏", icon: Bookmark },
  { href: "/studio", label: "创作台", icon: Layers3 },
];

const routeNames: Record<string, string> = {
  "/": "今日造场",
  "/discover": "探索作品",
  "/feed": "创作者动态",
  "/circles": "社区圈子",
  "/challenges": "造物挑战",
  "/collections": "灵感收藏",
  "/studio": "我的创作台",
  "/studio/new": "发布新作品",
  "/wallet": "果子钱包",
  "/profile": "创作者主页",
  "/profile/edit": "编辑个人资料",
  "/notifications": "通知中心",
  "/guide": "社区指南",
};

function routeIsActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteShell({ children, member }: { children: ReactNode; member: Member }) {
  const pathname = usePathname();
  const router = useRouter();
  const reduced = useReducedMotion();
  const [commandOpen, setCommandOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }
      if (event.key === "Escape") setCommandOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setCommandOpen(false);
      setAccountOpen(false);
      setQuery("");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    if (!member.signedIn) return;
    let active = true;
    fetch("/api/community", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => {
      if (!active || !data) return;
      const payload = data as { wallet?: { balance: number } | null; notifications?: { id: string }[]; actions?: { kind: string; targetRef: string }[] };
      setWalletBalance(payload.wallet?.balance ?? 0);
      const read = new Set((payload.actions ?? []).filter((item) => item.kind === "read_notification").map((item) => item.targetRef));
      setHasUnread((payload.notifications ?? []).some((item) => !read.has(item.id)));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [member.signedIn, pathname]);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return products.slice(0, 4);
    return products
      .filter((product) => `${product.title} ${product.ownerName} ${product.category}`.toLowerCase().includes(normalized))
      .slice(0, 6);
  }, [query]);

  // Authentication screens are intentionally outside the community chrome.
  // Keeping them unwrapped prevents account actions, side navigation, and the
  // mobile rail from appearing while a user is signing in.
  if (
    pathname.startsWith("/signin") ||
    pathname.startsWith("/signout") ||
    pathname === "/callback"
  ) return <>{children}</>;

  if (pathname.startsWith("/galaxy")) return <>{children}</>;

  const productSlug = pathname.startsWith("/product/") ? pathname.slice("/product/".length).split("/")[0] : null;
  const officialProduct = productSlug ? products.find((product) => product.slug === productSlug && product.official) : undefined;
  const routeName = officialProduct ? "造场官方产品" : pathname.startsWith("/product/") ? "作品体验" : routeNames[pathname] ?? "造场";

  return (
    <div className={`deep-shell${officialProduct ? " official-product-shell" : ""}`}>
      <motion.div
        key={`progress-${pathname}`}
        className="route-progress"
        initial={reduced ? false : { scaleX: 0 }}
        animate={reduced ? undefined : { scaleX: [0, 0.7, 1] }}
        transition={{ duration: 0.62, times: [0, 0.72, 1] }}
      />
      {officialProduct && (
        <motion.div
          key={`official-entry-${pathname}`}
          className="official-entry-transition"
          aria-hidden="true"
          initial={{ opacity: 0.72 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.46, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.span
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
          />
        </motion.div>
      )}
      <header className="deep-topbar">
        <Link className="deep-brand" href="/" aria-label="造场首页">
          <span className="deep-brand-mark"><i /><i /><i /></span>
          <strong>造场</strong>
          <small>ZAOCHANG</small>
          {officialProduct && <span className="deep-official-context"><BadgeCheck size={14} /> 造场官方项目</span>}
        </Link>

        <button className="deep-search-trigger" onClick={() => setCommandOpen(true)}>
          <Search size={17} />
          <span>搜索作品、创作者和圈子</span>
          <kbd>⌘ K</kbd>
        </button>

        <div className="deep-top-actions">
          <Link className="deep-icon-button" href="/notifications" aria-label="通知" title="通知">
            <Bell size={19} />
            {hasUnread && <span className="deep-notification-dot" />}
          </Link>
          <Link className="deep-balance" href="/wallet">
            <Coins size={17} /> <strong>{member.signedIn ? walletBalance ?? "--" : "--"}</strong><span>果</span>
          </Link>
          <Link className="deep-create" href="/studio/new"><Plus size={17} /> 发布作品</Link>
          {member.signedIn ? (
            <button className="deep-account" onClick={() => setAccountOpen((value) => !value)} title="账户菜单" aria-label="打开账户菜单" aria-expanded={accountOpen}>
              <span className="deep-avatar ink">{member.initial}</span><ChevronDown size={14} />
            </button>
          ) : (
            <a className="deep-signin" href="/signin?return_to=%2F">登录</a>
          )}
        </div>
        <AnimatePresence>
          {member.signedIn && accountOpen && (
            <motion.div className="account-menu" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              <div><span className="deep-avatar ink">{member.initial}</span><span><strong>{member.displayName}</strong><small>造场成员</small></span></div>
              <Link href="/profile"><UserRound size={15} /> 个人主页</Link>
              <Link href="/profile/edit"><Layers3 size={15} /> 编辑资料</Link>
              <a href="/api/auth/logout?return_to=%2F"><LogOut size={15} /> 退出登录</a>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <aside className="deep-sidebar">
        <nav className="deep-nav" aria-label="主导航">
          <LayoutGroup>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = routeIsActive(pathname, item.href);
              return (
                <Link key={item.href} href={item.href} className={active ? "active" : ""}>
                  {active && <motion.span className="deep-nav-active" layoutId="deep-nav-active" transition={{ type: "spring", stiffness: 430, damping: 35 }} />}
                  <Icon size={19} />
                  <span>{item.label}</span>
                  {item.href === "/feed" && <b>6</b>}
                </Link>
              );
            })}
            <Link href="/wallet" className={routeIsActive(pathname, "/wallet") ? "active" : ""}>
              {routeIsActive(pathname, "/wallet") && <motion.span className="deep-nav-active" layoutId="deep-nav-active" />}
              <WalletCards size={19} /><span>果子钱包</span>
            </Link>
          </LayoutGroup>
        </nav>

        <div className="deep-side-section">
          <div className="deep-side-title"><span>正在发生</span><Link href="/circles" aria-label="查看全部圈子"><Plus size={14} /></Link></div>
          {circles.slice(0, 4).map((circle) => (
            <Link className="deep-circle-link" href={`/circles#${circle.slug}`} key={circle.slug}>
              <span className={`deep-circle-dot ${circle.color}`} />
              <span>{circle.name}</span>
              <small>{circle.online}</small>
            </Link>
          ))}
        </div>

        <Link className="deep-side-challenge" href="/challenges">
          <span><Sparkles size={16} /> 七月造物挑战</span>
          <strong>为“等候”<br />做一件东西</strong>
          <small>4 天后截止</small>
          <i><b /></i>
        </Link>

        <div className="deep-side-footer"><Link href="/guide#covenant">社区公约</Link><Link href="/guide#creator">创作者指南</Link><small>© 2026 造场</small></div>
      </aside>

      <div className="deep-route-frame">
        <div className="deep-route-label"><span>{routeName}</span><small>{officialProduct ? "PRODUCT GALAXY / OFFICIAL" : "LIVE COMMUNITY / 2026"}</small></div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={pathname}
            className="deep-route-content"
            initial={reduced ? false : { opacity: 0, y: 18, filter: "blur(5px)" }}
            animate={reduced ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduced ? undefined : { opacity: 0, y: -10, filter: "blur(3px)" }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>

      <nav className="deep-mobile-nav" aria-label="移动端导航">
        {navItems.slice(0, 4).map((item) => {
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} className={routeIsActive(pathname, item.href) ? "active" : ""}><Icon size={20} /><span>{item.label}</span></Link>;
        })}
        <Link className="deep-mobile-create" href="/studio/new" aria-label="发布作品"><Plus size={23} /></Link>
      </nav>

      <AnimatePresence>
        {commandOpen && (
          <motion.div className="command-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && setCommandOpen(false)}>
            <motion.section className="command-palette" role="dialog" aria-modal="true" aria-label="搜索造场" initial={{ opacity: 0, y: -20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -14, scale: 0.98 }} transition={{ type: "spring", stiffness: 420, damping: 32 }}>
              <label><Search size={20} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入作品、作者或类别" /><button onClick={() => setCommandOpen(false)} aria-label="关闭搜索"><X size={18} /></button></label>
              <div className="command-shortcuts"><button onClick={() => router.push("/discover")}><Compass size={15} />探索</button><button onClick={() => router.push("/challenges")}><Flame size={15} />挑战</button><button onClick={() => router.push("/profile")}><CircleUserRound size={15} />我的主页</button></div>
              <div className="command-results">
                <span>{query ? "搜索结果" : "此刻热门"}</span>
                {results.map((product) => (
                  <Link href={`/product/${product.slug}`} key={product.id}>
                    <img src={product.image} alt="" />
                    <span><strong>{product.title}</strong><small>{product.category} · {product.ownerName}</small></span>
                    <em>{product.price ? `${product.price} 果` : "免费"}</em>
                  </Link>
                ))}
                {results.length === 0 && <div className="command-empty">没有找到相关作品</div>}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
