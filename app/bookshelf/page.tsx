import type { Metadata } from "next";
import { BookOpen, Lock } from "lucide-react";
import Link from "next/link";
import { currentMember, listBooks } from "../api/_lib/docs";

export const metadata: Metadata = { title: "书架" };
export const dynamic = "force-dynamic";

export default async function BookshelfPage() {
  const member = await currentMember();
  const books = await listBooks(member);

  return <div className="bookshelf-page">
    <header className="bookshelf-header">
      <span className="deep-eyebrow"><BookOpen size={14} /> ZAOCHANG BOOKSHELF</span>
      <h1>造场书架</h1>
      <p>这里陈列造场的原创长内容——体系化的书与教程。点开一本书,逐章阅读。带 <Lock size={11} /> 标记的书需要登录后才能阅读。</p>
    </header>

    {books.length > 0
      ? <div className="bookshelf-grid">
        {books.map((book) => <Link key={book.id} href={`/bookshelf/${encodeURIComponent(book.slug)}`} className="book-card">
          <span className="book-cover" style={{ background: `linear-gradient(150deg, hsl(${book.coverHue} 42% 88%), hsl(${book.coverHue} 48% 70%))` }}>
            <BookOpen size={30} style={{ color: `hsl(${book.coverHue} 40% 38%)` }} />
            <strong style={{ color: `hsl(${book.coverHue} 44% 26%)` }}>{book.title}</strong>
          </span>
          <span className="book-meta">
            <strong>{book.title}{book.visibility !== "public" && <Lock size={12} aria-label="登录后可见" />}</strong>
            {book.summary && <small>{book.summary}</small>}
            <em>{book.chapterCount} 章</em>
          </span>
        </Link>)}
      </div>
      : <div className="docs-empty"><BookOpen size={22} /><span><strong>书架还是空的</strong><small>创始人还没有在{member ? "这里" : "不登录也能看的范围内"}上架任何书。</small></span></div>}
  </div>;
}
