"use client";

import { ArrowLeft, Orbit, Rocket } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "./ecosystem.module.css";

const routes = [
  { href: "/galaxy", label: "银河探索" },
  { href: "/galaxy/products", label: "全部产品" },
  { href: "/galaxy/incubator", label: "孵化控制台" },
];

export function EcosystemShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className={styles.shell}>
      <div className={styles.sky} aria-hidden="true"><i /><i /><i /></div>
      <header className={styles.header}>
        <Link className={styles.brand} href="/galaxy">
          <span><i /><i /><i /></span>
          <div><strong>造场产品银河</strong><small>PRODUCT GALAXY</small></div>
        </Link>
        <nav aria-label="产品银河导航">
          {routes.map((route) => <Link key={route.href} className={pathname === route.href ? styles.active : ""} href={route.href}>{route.label}</Link>)}
        </nav>
        <div className={styles.headerActions}>
          <Link href="/" aria-label="返回造场社区" title="返回造场社区"><ArrowLeft size={16} /></Link>
          <Link className={styles.launchButton} href="/galaxy/apply"><Rocket size={14} /> 申请加入</Link>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}><span><Orbit size={13} /> 杭州视界奇点科技有限公司</span><small>让值得存在的产品，获得自己的轨道。</small></footer>
    </div>
  );
}
