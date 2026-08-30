// Galaxy 表现层:从 galaxy-experience.tsx 逐字拆出的纯展示组件。
// 边界:这里只做 JSX 呈现——不读 URL/DB/Three internals,所需数据全部经显式 props
// 或纯数据模块(cosmic-atlas/product-galaxy)注入;文案、class、data-*/aria 属性
// 与拆分前逐字一致,改动任何一个都算行为变更。
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Building2,
  Expand,
  LayoutList,
  MoonStar,
  Orbit,
  Pause,
  Play,
  Rocket,
  Shuffle,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import {
  GALAXIES,
  PLANET_BY_ID,
  PLANETS,
  SINGULARITY,
  type GalaxyId,
  type PlanetStory,
  type TargetId,
} from "./cosmic-atlas";
import {
  COMPANY_CORE,
  GALAXY_BUSINESS,
  GALAXY_PRODUCTS,
  PRODUCT_BY_PLANET,
  type GalaxyBusiness,
  type GalaxyProduct,
} from "./product-galaxy";
import styles from "./galaxy.module.css";

type GalaxyDefinition = (typeof GALAXIES)[number];
type ActiveStory = PlanetStory | (typeof SINGULARITY);

// 场景遮罩:vignette/filmGrain/loader/WebGL 错误。loader 与 error 的显隐完全由 props 决定。
export function GalaxyOverlay({ ready, webglError }: { ready: boolean; webglError: boolean }) {
  return (
    <>
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.filmGrain} aria-hidden="true" />

      <div className={`${styles.loader} ${ready ? styles.loaderHidden : ""}`} aria-hidden={ready}>
        <span className={styles.loaderMark}><i /><i /><i /></span>
        <strong>见界环正在显现</strong>
        <small>请允许宇宙先于名字抵达</small>
        <span className={styles.loaderLine}><i /></span>
      </div>

      {webglError && (
        <section className={styles.error} role="alert">
          <strong>星图无法启动</strong>
          <p>当前设备没有提供可用的 WebGL 图形环境。</p>
          <Link href="/">返回造场</Link>
        </section>
      )}
    </>
  );
}

export function GalaxyHeader() {
  return (
    <header className={styles.header}>
      <Link className={styles.back} href="/" aria-label="返回造场社区" title="返回造场社区">
        <ArrowLeft size={18} />
      </Link>
      <div className={styles.brand}>
        <span className={styles.brandMark}><i /><i /><i /></span>
        <div><strong>造场产品银河</strong><small>PRODUCT GALAXY · HANGZHOU</small></div>
      </div>
    </header>
  );
}

export function GalaxyEcosystemNav() {
  return (
    <nav className={styles.ecosystemNav} aria-label="产品银河主要入口">
      <Link href="/galaxy" aria-current="page">银河探索</Link>
      <Link href="/galaxy/products">全部产品</Link>
      <Link href="/galaxy/company">公司中心</Link>
      <Link href="/galaxy/incubator">孵化控制台</Link>
      <Link className={styles.navApply} href="/galaxy/apply"><Rocket size={13} /> 申请加入</Link>
    </nav>
  );
}

export function GalaxyHero({
  storyExpanded,
  activeStory,
  activeProduct,
  activeBusiness,
  activePlanet,
  onToggleStory,
  onSelectGalaxy,
  onSelectRandomPlanet,
}: {
  storyExpanded: boolean;
  activeStory: ActiveStory;
  activeProduct: GalaxyProduct | null;
  activeBusiness: GalaxyBusiness | null;
  activePlanet: PlanetStory | null;
  onToggleStory: () => void;
  onSelectGalaxy: (id: GalaxyId) => void;
  onSelectRandomPlanet: () => void;
}) {
  return (
    <section
      key={`${activeStory.id}-${storyExpanded ? "archive" : "short"}`}
      className={`${styles.hero} ${storyExpanded ? styles.storyExpanded : ""}`}
      style={{ "--philosophy-accent": activeStory.accent } as CSSProperties}
      aria-live="polite"
    >
      {activeProduct ? (
        <span className={styles.kicker}>{activeProduct.status} · {activeBusiness?.businessName} · {activeProduct.codeName}</span>
      ) : (
        <span className={styles.kicker}>ZAOCHANG PRODUCT GALAXY · 04 SECTORS / 12 PRODUCTS</span>
      )}
      <h1>{storyExpanded && activePlanet ? activePlanet.archiveTitle : activeProduct ? activeProduct.name : "探索造场产品宇宙"}</h1>
      {storyExpanded && activePlanet ? (
        <div className={styles.archiveBody}>
          {activePlanet.archive.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
      ) : activeProduct ? (
        <>
          <p>{activeProduct.tagline}</p>
          <div className={styles.productFacts} aria-label="产品概况">
            <span><small>VERSION</small><strong>{activeProduct.version}</strong></span>
            <span><small>FOR</small><strong>{activeProduct.audience}</strong></span>
            <span><small>NEXT</small><strong>{activeProduct.nextMilestone}</strong></span>
          </div>
          <div className={styles.productActions}>
            <Link className={styles.primaryGalaxyAction} href={activeProduct.actionHref}>{activeProduct.actionLabel} <ArrowUpRight size={14} /></Link>
            <Link href={`/galaxy/products#${activeProduct.planetId}`}>产品档案 <ArrowRight size={13} /></Link>
          </div>
        </>
      ) : (
        <>
          <p>每一个星系代表一条产品赛道，每一颗行星代表一个正在运行、开发或孵化中的产品。</p>
          <div className={styles.overviewActions}>
            <button type="button" onClick={() => onSelectGalaxy("origo")}><Play size={14} fill="currentColor" /> 开始探索</button>
            <Link href="/galaxy/products"><LayoutList size={14} /> 查看全部产品</Link>
            <button type="button" onClick={onSelectRandomPlanet}><Shuffle size={14} /> 随机行星</button>
            <Link href="/galaxy/apply"><Rocket size={14} /> 申请加入造场</Link>
          </div>
          <div className={styles.companySignal}>
            <span><Building2 size={13} /> {COMPANY_CORE.shortName} · {COMPANY_CORE.phase}</span>
            <div><strong>{COMPANY_CORE.productCount}</strong><small>产品</small><strong>{COMPANY_CORE.galaxyCount}</strong><small>赛道</small><strong>{COMPANY_CORE.incubatingCount}</strong><small>孵化中</small></div>
          </div>
        </>
      )}
      {activePlanet && <blockquote>{activePlanet.coda}</blockquote>}
      {activePlanet && (
        <button
          type="button"
          className={styles.storyToggle}
          onClick={onToggleStory}
          aria-expanded={storyExpanded}
        >
          {storyExpanded ? <ArrowLeft size={14} /> : <BookOpen size={14} />}
          <span>{storyExpanded ? "返回产品概览" : "读取行星故事"}</span>
        </button>
      )}
    </section>
  );
}

// 移动端星系索引(仅总览态由主组件条件渲染)。
export function GalaxyMobileIndex({ onSelectGalaxy }: { onSelectGalaxy: (id: GalaxyId) => void }) {
  return (
    <section className={styles.mobileGalaxyIndex} aria-label="产品星系分类">
      <div><span>04 PRODUCT SECTORS</span><Link href="/galaxy/products">全部产品 <ArrowRight size={13} /></Link></div>
      {GALAXIES.map((galaxy) => {
        const business = GALAXY_BUSINESS[galaxy.id];
        return (
          <button type="button" key={galaxy.id} onClick={() => onSelectGalaxy(galaxy.id)}>
            <i style={{ background: galaxy.accent }} />
            <span><strong>{business.worldName}</strong><small>{business.businessName}</small></span>
            <b>{GALAXY_PRODUCTS.filter((product) => PLANET_BY_ID[product.planetId].galaxyId === galaxy.id).length}</b>
            <ArrowRight size={14} />
          </button>
        );
      })}
      <footer>
        <Link href="/galaxy/apply"><Rocket size={13} /> 发射产品信号</Link>
        <Link href="/galaxy/incubator">孵化控制台 <ArrowRight size={13} /></Link>
      </footer>
    </section>
  );
}

export function GalaxyAtlasNav({
  activeTarget,
  activeGalaxy,
  siblingPlanets,
  onSelectTarget,
  onSelectGalaxy,
}: {
  activeTarget: TargetId;
  activeGalaxy: GalaxyDefinition | null;
  siblingPlanets: PlanetStory[];
  onSelectTarget: (id: TargetId) => void;
  onSelectGalaxy: (id: GalaxyId) => void;
}) {
  return (
    <nav className={styles.atlasNav} aria-label="界外纪宇宙图谱">
      <div className={styles.galaxyNav} aria-label="选择星系">
        <button
          type="button"
          className={activeTarget === "singularity" ? styles.navActive : ""}
          onClick={() => onSelectTarget("singularity")}
          aria-pressed={activeTarget === "singularity"}
          aria-label="返回观渊奇点总览"
        >
          <Orbit size={14} />
          <span><strong>观渊</strong><small>THE WITNESS WELL</small></span>
        </button>
        {GALAXIES.map((galaxy) => (
          <button
            type="button"
            key={galaxy.id}
            data-galaxy-id={galaxy.id}
            className={activeGalaxy?.id === galaxy.id ? styles.navActive : ""}
            onClick={() => onSelectGalaxy(galaxy.id)}
            aria-pressed={activeGalaxy?.id === galaxy.id}
            aria-label={`进入${galaxy.name}星系 ${galaxy.latin}`}
          >
            <i style={{ background: galaxy.accent }} />
            <span><strong>{galaxy.name}</strong><small>{GALAXY_BUSINESS[galaxy.id].businessName}</small></span>
          </button>
        ))}
      </div>
      {activeGalaxy && (
        <div className={styles.planetNav} aria-label={`${activeGalaxy.name}星系行星`}>
          <span className={styles.galaxyThesis}>{activeGalaxy.index} · {activeGalaxy.thesis}</span>
          {siblingPlanets.map((item) => (
            <button
              type="button"
              key={item.id}
              data-planet-id={item.id}
              className={activeTarget === item.id ? styles.navActive : ""}
              onClick={() => onSelectTarget(item.id)}
              aria-pressed={activeTarget === item.id}
            >
              <i style={{ background: item.accent }} />
              <span><strong>{PRODUCT_BY_PLANET[item.id].name}</strong><small>{PRODUCT_BY_PLANET[item.id].status}</small></span>
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}

export function GalaxyObservation({
  activeProduct,
  activeBusiness,
}: {
  activeProduct: GalaxyProduct | null;
  activeBusiness: GalaxyBusiness | null;
}) {
  return (
    <aside className={styles.observation} aria-live="polite">
      <span>{activeProduct ? `${activeProduct.codeName} · ${activeProduct.status}` : "ZAOCHANG · COMPANY CORE"}</span>
      <b>{activeProduct?.version ?? `${COMPANY_CORE.productCount} PRODUCTS`}</b>
      <small>{activeBusiness?.positioning ?? COMPANY_CORE.mission}</small>
    </aside>
  );
}

export function GalaxyControls({
  paused,
  quiet,
  passageActive,
  onTogglePaused,
  onToggleQuiet,
  onStartPassage,
  onStopPassage,
  onToggleFullscreen,
}: {
  paused: boolean;
  quiet: boolean;
  passageActive: boolean;
  onTogglePaused: () => void;
  onToggleQuiet: () => void;
  onStartPassage: () => void;
  onStopPassage: () => void;
  onToggleFullscreen: () => void;
}) {
  return (
    <div className={styles.controls} aria-label="星图控制">
      <button type="button" onClick={onTogglePaused} title={paused ? "继续星图" : "暂停星图"} aria-label={paused ? "继续星图" : "暂停星图"}>
        {paused ? <Play size={18} /> : <Pause size={18} />}
      </button>
      <button type="button" onClick={onToggleQuiet} className={quiet ? styles.controlActive : ""} title={quiet ? "离开静默模式" : "进入静默模式"} aria-label={quiet ? "离开静默模式" : "进入静默模式"} aria-pressed={quiet}>
        <MoonStar size={18} />
      </button>
      <button
        type="button"
        className={styles.passageControl}
        onPointerDown={onStartPassage}
        onPointerUp={onStopPassage}
        onPointerLeave={onStopPassage}
        onPointerCancel={onStopPassage}
        title="让时间经过"
        aria-label="让时间经过"
        aria-pressed={passageActive}
      >
        <Sparkles size={18} /><span>时间经过</span>
      </button>
      <button type="button" onClick={onToggleFullscreen} title="切换全屏" aria-label="切换全屏">
        <Expand size={17} />
      </button>
    </div>
  );
}

// 屏幕阅读器摘要:视觉场景的完整文字等价物。
export function GalaxyAccessibleSummary() {
  return (
    <div className={styles.srOnly}>
      <h2>{SINGULARITY.title}</h2>
      <span>{SINGULARITY.epoch}</span>
      <p>{SINGULARITY.body}</p>
      <p>界外纪包含 4 个星系与 12 颗可观测行星。穿过观渊与见界环，进入每颗行星独有的文明故事。</p>
      <ul>{PLANETS.map((item) => <li key={item.id}>{PRODUCT_BY_PLANET[item.id].name}，{PRODUCT_BY_PLANET[item.id].status}；{item.chapter} {item.name}：{item.title}；完整档案：{item.archiveTitle}</li>)}</ul>
    </div>
  );
}
