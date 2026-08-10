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
import "katex/dist/katex.min.css";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string[] }> };

function TocBranch({ nodes, base, activeId }: { nodes: DocNode[]; base: string; activeId: string }) {
  if (nodes.length === 0) return null;
  return <ul className="book-toc-list">
    {nodes.map((node) => <li key={node.id}>
      <Link href={`${base}/${encodeURIComponent(node.slug)}`} className={node.id === activeId ? "active" : ""}>
        {node.children.length > 0 ? <Folder size={14} /> : <FileText size={14} />}
        <span>{node.title}</span>
        {node.visibility !== "public" && <Lock size={11} aria-label="登录后可见" />}
      </Link>
      <TocBranch nodes={node.children} base={`${base}/${encodeURIComponent(node.slug)}`} activeId={activeId} />
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

  return <div className="book-page">
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
        <div className="docs-body" dangerouslySetInnerHTML={{ __html: renderDocHtml(doc.bodyMd) }} />
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
  </div>;
}
