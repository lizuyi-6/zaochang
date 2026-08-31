import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Bookmark, BookOpen, ChevronRight, FileText, Folder, Lock } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  bookTree,
  buildPathByLeafSlug,
  collectLeaves,
  currentMember,
  docBreadcrumbs,
  findInBook,
  getBookContinueReading,
  getChapterParagraph,
  getDocBody,
  injectChapterHeadingIds,
  renderDocHtml,
  type DocMeta,
  type DocNode,
} from "../../api/_lib/docs";
import { MermaidRunner } from "../mermaid-runner";
import { ReadingProgressTracker } from "../reading-progress-tracker";
import { ChapterAside } from "../chapter-aside";
import { BookSideToggle } from "../book-side-toggle";
import { ReadingAiDock } from "../reading-ai-dock";
// 书站阅读字体(self-host woff2 via @fontsource;按 weight/subset 精确引入,浏览器按 unicode-range 按需下载)。
// Serif(书的声音):英文 Source Serif 4 + 中文 Noto Serif SC(=思源宋体,与 Source Han Serif SC 同字形),覆盖正文 400/强调与标题 500/备用 600。
// Sans(系统的声音):Inter(UI/目录/元信息)。Mono(代码的声音):JetBrains Mono。
// 中文 Sans 不加载 Web Font,走系统 fallback(PingFang SC/Microsoft YaHei 等)。import scoped 到书站路由 bundle,不影响其他页。
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/500.css";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/noto-serif-sc/400.css";
import "@fontsource/noto-serif-sc/500.css";
import "@fontsource/noto-serif-sc/600.css";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string[] }> };

function TocBranch({ nodes, base, activeId, depth = 0, prefetchId }: { nodes: DocNode[]; base: string; activeId: string; depth?: number; prefetchId: string | null }) {
  if (nodes.length === 0) return null;
  return <ul className="book-toc-list">
    {nodes.map((node) => <li key={node.id}>
      <Link href={`${base}/${encodeURIComponent(node.slug)}`} className={node.id === activeId ? "active" : ""} data-depth={depth} prefetch={node.id === prefetchId ? true : undefined}>
        {depth === 0 && (node.children.length > 0 ? <Folder size={13} /> : <FileText size={13} />)}
        <span>{node.title}</span>
        {node.visibility !== "public" && <Lock size={11} aria-label="登录后可见" />}
      </Link>
      <TocBranch nodes={node.children} base={`${base}/${encodeURIComponent(node.slug)}`} activeId={activeId} depth={depth + 1} prefetchId={prefetchId} />
    </li>)}
  </ul>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const member = await currentMember();
  const found = await findInBook(slug ?? [], member);
  if (!found) return { title: "书架" };
  return { title: found.doc.id === found.book.id ? found.book.title : `${found.doc.title} · ${found.book.title}` };
}

export default async function BookPage({ params }: PageProps) {
  const { slug } = await params;
  const slugs = (slug ?? []).map((segment) => decodeURIComponent(segment));
  const member = await currentMember();
  // fail-closed:书不存在或对当前访问者不可见一律 404,不暴露其存在性。
  const found = await findInBook(slugs, member);
  if (!found) {
    // V1 Freeze 兼容重定向:附录F 曾错误挂载在第五部分之下,
    // parent 修复后稳定 URL 为 /bookshelf/hello-system/appx-f-myths-faq。
    // 旧层级 URL 兼容重定向(临时 307)到新地址,不静默制造 404。
    if (slugs.length === 3 && slugs[0] === "hello-system" && slugs[1] === "part-5" && slugs[2] === "appx-f-myths-faq") {
      redirect("/bookshelf/hello-system/appx-f-myths-faq");
    }
    notFound();
  }

  const { book, doc } = found;
  const tree = await bookTree(book, member);
  const isCover = doc.id === book.id;
  const base = `/bookshelf/${encodeURIComponent(book.slug)}`;
  const crumbs: DocMeta[] = isCover ? [] : await docBreadcrumbs(doc, member);
  // 阅读进度:封面页算"继续阅读"点;章节页算当前章节的段落恢复点。仅登录用户。
  const continueReading = member && isCover ? await getBookContinueReading(member, book) : null;
  const initialParagraph = member && !isCover ? await getChapterParagraph(member, book.id, doc.id) : null;

  // 正文只取当前这一篇(目录/面包屑走元数据,不再整表搬运全部书籍正文)。
  const bodyMd = await getDocBody(doc.id);
  // 正文 HTML:章节页给 h2/h3 注入稳定 id(ch-N),供右栏本章目录锚定 + scroll-spy。
  // 书籍上下文:把 MkDocs 搬运来的 .md 相对链接重写成造场路由(路径表从目录树收集)。
  const pathByLeafSlug = buildPathByLeafSlug(tree);
  let bodyHtml = bodyMd.trim().length > 0
    ? renderDocHtml(bodyMd, { bookSlug: book.slug, pathByLeafSlug })
    : "";
  const headings: { id: string; text: string; level: number }[] = [];
  if (!isCover && bodyHtml) {
    const injected = injectChapterHeadingIds(bodyHtml);
    bodyHtml = injected.html;
    headings.push(...injected.headings);
  }

  // 右栏章节进度:当前 doc 在叶子章节序列中的位置。
  const leaves = !isCover ? collectLeaves(tree) : [];
  const leafIdx = leaves.findIndex((l) => l.id === doc.id);
  const progress = !isCover && leafIdx >= 0 ? { current: leafIdx + 1, total: leaves.length } : null;
  // 只预取下一章:目录是动态路由且动辄几十条,整表预取会触发几十个 RSC 请求;
  // 顺序阅读的主路径是"读完点下一章",预取这一条收益最大、开销最小。
  const nextLeaf = !isCover && leafIdx >= 0 && leafIdx + 1 < leaves.length ? leaves[leafIdx + 1] : null;

  return <div className={`book-page ${isCover ? "book-page-cover" : "book-page-chapter"}`}>
    <BookSideToggle />
    <aside className="book-side">
      <Link href="/bookshelf" className="book-back"><ArrowLeft size={14} /> 书架</Link>
      <Link href={base} className="book-side-title">
        <span className="book-cover book-cover-sm" style={{ background: `linear-gradient(150deg, hsl(${book.coverHue} 42% 88%), hsl(${book.coverHue} 48% 70%))` }}>
          {book.coverImage
            ? <img src={book.coverImage} alt={book.title} loading="lazy" />
            : <BookOpen size={18} style={{ color: `hsl(${book.coverHue} 40% 38%)` }} />}
        </span>
        <strong>{book.title}</strong>
      </Link>
      <nav className="book-toc" aria-label="目录">
        <TocBranch nodes={tree} base={base} activeId={doc.id} prefetchId={nextLeaf?.id ?? null} />
      </nav>
    </aside>

    <article className="book-reader">
      {!isCover && <nav className="docs-breadcrumb" aria-label="面包屑">
        <Link href={base}>{book.title}</Link>
        {crumbs.slice(1).map((crumb, index) => <span key={crumb.id}>
          <ChevronRight size={13} />
          {crumb.id === doc.id ? <strong>{crumb.title}</strong> : <Link href={`${base}/${crumbs.slice(1, index + 2).map((c) => encodeURIComponent(c.slug)).join("/")}`}>{crumb.title}</Link>}
        </span>)}
      </nav>}

      {isCover && (book.bannerImage || book.coverImage) && <img className="book-banner" src={book.bannerImage || book.coverImage} alt={book.title} />}

      <header className="docs-article-header">
        <h1>{doc.title}</h1>
        <small>更新于 {doc.updatedAt.slice(0, 10)}{doc.visibility === "members" ? " · 登录可见" : doc.visibility === "private" ? " · 私有" : ""}</small>
      </header>

      {isCover && book.summary && <p className="book-summary">{book.summary}</p>}

      {continueReading && <Link className="book-continue-reading" href={continueReading.href} prefetch><Bookmark size={15} /> 继续阅读 · {continueReading.title} <ArrowRight size={15} /></Link>}

      {bodyMd.trim().length > 0 && <>
        <div className="docs-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        <MermaidRunner />
      </>}
      <ReadingProgressTracker bookId={book.id} chapterId={doc.id} initialParagraph={initialParagraph} canRecord={!!member} />

      {isCover && tree.length > 0 && <section className="docs-children" aria-label="章节目录">
        <h2>目录</h2>
        <ul>
          {tree.map((node) => <li key={node.id}>
            <Link href={`${base}/${encodeURIComponent(node.slug)}`}>
              <FileText size={15} /><span>{node.title}</span>{node.visibility !== "public" && <Lock size={12} />}
            </Link>
          </li>)}
        </ul>
      </section>}
    </article>

    {!isCover && <ChapterAside headings={headings} progress={progress} />}
    {/* 问 AI dock:仅章节页(封面页正文是桩,无材料可用);path 为书内章节 slug 序列(slugs[0] 是书 slug,服务端拼回)。 */}
    {!isCover && <ReadingAiDock bookSlug={book.slug} path={slugs.slice(1)} bookTitle={book.title} chapterTitle={doc.title} docId={doc.id} updatedAt={doc.updatedAt} />}
  </div>;
}
