import type { Metadata } from "next";
import { ArrowRight, Building2, Mail, Orbit, Radio } from "lucide-react";
import Link from "next/link";
import { EcosystemShell } from "../ecosystem-shell";
import { COMPANY_CORE, GALAXY_BUSINESS, GALAXY_PRODUCTS, STATUS_SUMMARY } from "../product-galaxy";
import styles from "../ecosystem.module.css";

export const metadata: Metadata = { title: "公司中心 | 造场产品银河", description: "杭州视界奇点科技有限公司的使命、产品方向与合作入口。" };

export default function CompanyPage() {
  return <EcosystemShell><section className={styles.pageIntro}><div><span>ZAOCHANG / COMPANY CORE</span><h1>{COMPANY_CORE.name}</h1><p>{COMPANY_CORE.mission}</p></div><div className={styles.introStats}><span><strong>{COMPANY_CORE.productCount}</strong><small>产品与概念</small></span><span><strong>{COMPANY_CORE.galaxyCount}</strong><small>业务赛道</small></span><span><strong>{COMPANY_CORE.incubatingCount}</strong><small>验证中</small></span></div></section>
    <section className={styles.productGrid} style={{ marginTop: 28 }}><article className={styles.productCard}><div className={styles.productIdentity}><span className={styles.planetMark}><Building2 size={17} /></span><div><small>MISSION</small><h2>让值得存在的产品获得形状</h2><p>{COMPANY_CORE.direction}</p></div><em>{COMPANY_CORE.phase}</em></div><div className={styles.productDetail}><p>产品银河同时展示运行中产品、开发项目和概念验证。状态文字是业务事实，不以视觉光效替代。</p><dl><div><dt>公司</dt><dd>{COMPANY_CORE.name}</dd></div><div><dt>阶段</dt><dd>{COMPANY_CORE.phase}</dd></div><div><dt>正式上线</dt><dd>{GALAXY_PRODUCTS.filter((item) => item.status === "正式上线").length} 个</dd></div></dl></div><footer><span>商务与共创申请会进入可追踪的孵化队列</span><div><Link className={styles.cardPrimary} href="/galaxy/apply?type=business">商务合作 <ArrowRight size={13} /></Link></div></footer></article>
      <article className={styles.productCard}><div className={styles.productIdentity}><span className={styles.planetMark}><Orbit size={17} /></span><div><small>PRODUCT SECTORS</small><h2>真实业务分类</h2><p>世界观名称与业务名称同时存在。</p></div></div><div className={styles.productDetail}><ul>{Object.values(GALAXY_BUSINESS).map((item) => <li key={item.id}>{item.businessName}</li>)}</ul><dl>{STATUS_SUMMARY.slice(0, 3).map((item) => <div key={item.status}><dt>{item.status}</dt><dd>{item.count}</dd></div>)}</dl></div><footer><span>查看每个产品的版本、状态与下一里程碑</span><div><Link href="/galaxy/products">全部产品 <ArrowRight size={13} /></Link></div></footer></article>
      <article className={styles.productCard}><div className={styles.productIdentity}><span className={styles.planetMark}><Radio size={17} /></span><div><small>COMPANY UPDATES</small><h2>公司动态</h2><p>当前没有发布可核验的公司新闻。</p></div></div><div className={styles.productDetail}><p>这里不会填充虚构融资、客户、合作或增长数据。正式动态发布后将显示来源、日期和详情。</p></div><footer><span>暂无正式动态</span></footer></article>
      <article className={styles.productCard}><div className={styles.productIdentity}><span className={styles.planetMark}><Mail size={17} /></span><div><small>COOPERATION</small><h2>合作入口</h2><p>产品共创、技术合作、团队孵化与商务合作统一进入可追踪申请。</p></div></div><div className={styles.productDetail}><p>提交后生成项目编号、真实阶段、当前任务、等待原因与下一步，不承诺未经确认的负责人或时限。</p></div><footer><span>申请资料仅对项目所有者与授权运营人员开放</span><div><Link className={styles.cardPrimary} href="/galaxy/apply?type=business">发起合作 <ArrowRight size={13} /></Link></div></footer></article>
    </section>
  </EcosystemShell>;
}
