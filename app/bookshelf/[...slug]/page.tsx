import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Bookmark, BookOpen, ChevronRight, FileText, Folder, Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  bookTree,
  currentMember,
  docBreadcrumbs,
  findInBook,
  getBookContinueReading,
  getChapterParagraph,
  renderDocHtml,
  type DocNode,
  type DocRow,
} from "../../api/_lib/docs";
import { MermaidRunner } from "../mermaid-runner";
import { ReadingProgressTracker } from "../reading-progress-tracker";
import { ChapterAside } from "../chapter-aside";
import { BookSideToggle } from "../book-side-toggle";
import "katex/dist/katex.min.css";
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
import "@fontsource/noto-serif-sc/chinese-simplified-400.css";
import "@fontsource/noto-serif-sc/chinese-simplified-500.css";
import "@fontsource/noto-serif-sc/chinese-simplified-600.css";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string[] }> };

// 拍平书的目录树为"叶子章节"序列(非分段容器),用于右侧进度 N/总。
function collectLeaves(nodes: DocNode[]): DocNode[] {
  const out: DocNode[] = [];
  const walk = (ns: DocNode[]) => {
    for (const n of ns) {
      if (n.children.length > 0) walk(n.children);
      else out.push(n);
    }
  };
  walk(nodes);
  return out;
}

function TocBranch({ nodes, base, activeId, depth = 0 }: { nodes: DocNode[]; base: string; activeId: string; depth?: number }) {
  if (nodes.length === 0) return null;
  return <ul className="book-toc-list">
    {nodes.map((node) => <li key={node.id}>
      <Link href={`${base}/${encodeURIComponent(node.slug)}`} className={node.id === activeId ? "active" : ""} data-depth={depth}>
        {depth === 0 && (node.children.length > 0 ? <Folder size={13} /> : <FileText size={13} />)}
        <span>{node.title}</span>
        {node.visibility !== "public" && <Lock size={11} aria-label="登录后可见" />}
      </Link>
      <TocBranch nodes={node.children} base={`${base}/${encodeURIComponent(node.slug)}`} activeId={activeId} depth={depth + 1} />
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
  if (!found) notFound();

  const { book, doc } = found;
  const tree = await bookTree(book, member);
  const isCover = doc.id === book.id;
  const base = `/bookshelf/${encodeURIComponent(book.slug)}`;
  const crumbs: DocRow[] = isCover ? [] : await docBreadcrumbs(doc, member);
  // 阅读进度:封面页算"继续阅读"点;章节页算当前章节的段落恢复点。仅登录用户。
  const continueReading = member && isCover ? await getBookContinueReading(member, book) : null;
  const initialParagraph = member && !isCover ? await getChapterParagraph(member, book.id, doc.id) : null;

  // 正文 HTML:章节页给 h2/h3 注入稳定 id(ch-N),供右栏本章目录锚定 + scroll-spy。
  // renderDocHtml 经 sanitize 后 h2/h3 为裸标签(无属性),正则替换安全;不动安全消毒配置。
  // 书籍上下文:把 MkDocs 搬运来的 .md 相对链接重写成造场路由。pathByLeafSlug 从目录树
  // 收集"叶子章节 slug → 书内完整路径",供 renderDocHtml 重写 NN-slug.md 形式链接。
  const pathByLeafSlug = new Map<string, string>();
  {
    const walk = (nodes: DocNode[], prefix: string[]) => {
      for (const n of nodes) {
        const path = [...prefix, n.slug];
        if (n.children.length > 0) walk(n.children, path);
        else if (!pathByLeafSlug.has(n.slug)) pathByLeafSlug.set(n.slug, path.join("/"));
      }
    };
    walk(tree, []);
  }
  const headings: { id: string; text: string; level: number }[] = [];
  let bodyHtml = doc.bodyMd.trim().length > 0
    ? renderDocHtml(doc.bodyMd, { bookSlug: book.slug, pathByLeafSlug })
    : "";
  if (!isCover && bodyHtml) {
    let hi = 0;
    bodyHtml = bodyHtml.replace(/<(h[23])>([\s\S]*?)<\/\1>/g, (m, tag: string, inner: string) => {
      const text = inner.replace(/<[^>]+>/g, "").trim();
      if (!text) return m;
      const id = `ch-${hi++}`;
      headings.push({ id, text, level: tag === "h2" ? 2 : 3 });
      return `<${tag} id="${id}">${inner}</${tag}>`;
    });
  }

  // 右栏章节进度:当前 doc 在叶子章节序列中的位置。
  const leaves = !isCover ? collectLeaves(tree) : [];
  const leafIdx = leaves.findIndex((l) => l.id === doc.id);
  const progress = !isCover && leafIdx >= 0 ? { current: leafIdx + 1, total: leaves.length } : null;

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
        <TocBranch nodes={tree} base={base} activeId={doc.id} />
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

      {continueReading && <Link className="book-continue-reading" href={continueReading.href}><Bookmark size={15} /> 继续阅读 · {continueReading.title} <ArrowRight size={15} /></Link>}

      {doc.bodyMd.trim().length > 0 && <>
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
  </div>;
}
