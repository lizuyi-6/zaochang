import type { Metadata } from "next";
import { BookOpen, FileText, Folder, Lock } from "lucide-react";
import Link from "next/link";
import { buildDocTree, currentMember, listStandaloneDocs, type DocNode } from "../api/_lib/docs";

export const metadata: Metadata = { title: "文档" };
export const dynamic = "force-dynamic";

function nodeHref(crumbs: string[], node: DocNode): string {
  return "/docs/" + [...crumbs, node.slug].map(encodeURIComponent).join("/");
}

function TreeBranch({ nodes, crumbs }: { nodes: DocNode[]; crumbs: string[] }) {
  if (nodes.length === 0) return null;
  return <ul className="docs-tree-list">
    {nodes.map((node) => <li key={node.id}>
      <Link href={nodeHref(crumbs, node)}>
        {node.children.length > 0 ? <Folder size={15} /> : <FileText size={15} />}
        <span>{node.title}</span>
        {node.visibility === "members" && <Lock size={12} aria-label="登录后可见" />}
      </Link>
      <TreeBranch nodes={node.children} crumbs={[...crumbs, node.slug]} />
    </li>)}
  </ul>;
}

export default async function DocsIndexPage() {
  const member = await currentMember();
  // 只列独立文档(is_book=0):书与书的章节由 listStandaloneDocs 整体剔除,
  // 只从书架(/bookshelf)进入,不在文档目录重复出现。
  const tree = buildDocTree(await listStandaloneDocs(), member);

  return <div className="docs-page">
    <header className="docs-header">
      <span className="deep-eyebrow"><BookOpen size={14} /> ZAOCHANG DOCS</span>
      <h1>造场文档</h1>
      <p>这里归档造场的设计文档、使用说明与创作笔记。带 <Lock size={11} /> 标记的文档需要登录后才能阅读。</p>
    </header>
    {tree.length > 0
      ? <nav className="docs-tree" aria-label="文档目录"><TreeBranch nodes={tree} crumbs={[]} /></nav>
      : <div className="docs-empty"><BookOpen size={22} /><span><strong>还没有公开文档</strong><small>创始人还没有发布可在{member ? "这里" : "不登录"}查看的文档。</small></span></div>}
  </div>;
}
