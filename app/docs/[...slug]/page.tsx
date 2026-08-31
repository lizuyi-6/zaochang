import type { Metadata } from "next";
import { ArrowLeft, ChevronRight, FileText, Lock } from "lucide-react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { currentMember, docBreadcrumbs, findDocByPath, getDocBody, listChildren, renderDocHtml, resolveBookRootSlug } from "../../api/_lib/docs";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const member = await currentMember();
  const slugs = (slug ?? []).map((segment) => decodeURIComponent(segment));
  // 旧的书 URL 由页面组件重定向;这里若识别出可见书根,先返回书名作标题。
  const book = slugs.length > 0 ? await resolveBookRootSlug(slugs[0], member) : null;
  if (book) return { title: book.title };
  const doc = await findDocByPath(slugs, member);
  return { title: doc ? doc.title : "文档" };
}

export default async function DocDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const slugs = (slug ?? []).map((segment) => decodeURIComponent(segment));
  const member = await currentMember();
  // 旧的书 URL /docs/<book>/... 永久重定向(308)到 /bookshelf/<book>/...,
  // 让书与章节只从书架进入。fail-closed:不可见的书根(members/private 且未登录)
  // 不重定向,落到下方 notFound(),不借重定向泄露书的存在性——与访问不存在的
  // 文档对外表现一致。
  if (slugs.length > 0) {
    const book = await resolveBookRootSlug(slugs[0], member);
    if (book) {
      permanentRedirect("/bookshelf/" + slugs.map((segment) => encodeURIComponent(segment)).join("/"));
    }
  }
  // fail-closed:不存在或对当前访问者不可见(members/private 且未登录)一律 404,
  // 不暴露文档存在性。
  const doc = await findDocByPath(slugs, member);
  if (!doc) notFound();

  const [crumbs, children, bodyHtml] = await Promise.all([
    docBreadcrumbs(doc, member),
    listChildren(doc.id, member),
    getDocBody(doc.id).then(renderDocHtml),
  ]);
  const crumbHref = (index: number) => "/docs/" + crumbs.slice(0, index + 1).map((crumb) => encodeURIComponent(crumb.slug)).join("/");

  return <div className="docs-page docs-detail">
    <nav className="docs-breadcrumb" aria-label="面包屑">
      <Link href="/docs"><ArrowLeft size={14} /> 文档</Link>
      {crumbs.map((crumb, index) => <span key={crumb.id}>
        <ChevronRight size={13} />
        {index === crumbs.length - 1 ? <strong>{crumb.title}</strong> : <Link href={crumbHref(index)}>{crumb.title}</Link>}
      </span>)}
    </nav>

    <header className="docs-article-header">
      <h1>{doc.title}</h1>
      <small>更新于 {doc.updatedAt.slice(0, 10)}{doc.visibility === "members" ? " · 登录可见" : doc.visibility === "private" ? " · 私有" : ""}</small>
    </header>
    <article className="docs-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />

    {children.length > 0 && <section className="docs-children" aria-label="子文档">
      <h2>本节目录</h2>
      <ul>
        {children.map((child) => <li key={child.id}>
          <Link href={crumbHref(crumbs.length - 1) + "/" + encodeURIComponent(child.slug)}>
            <FileText size={15} /><span>{child.title}</span>{child.visibility !== "public" && <Lock size={12} />}
          </Link>
        </li>)}
      </ul>
    </section>}
  </div>;
}
