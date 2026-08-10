"use client";

import { ArrowDown, ArrowUp, BookOpen, FileText, Folder, Lock, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";

type Doc = {
  id: string;
  slug: string;
  parentId: string | null;
  title: string;
  bodyMd: string;
  visibility: "public" | "members" | "private";
  sortOrder: number;
  isBook: number;
  coverHue: number;
  summary: string;
  coverImage: string;
  bannerImage: string;
  updatedAt: string;
};

type Draft = {
  id: string | null;
  title: string;
  slug: string;
  parentId: string;
  visibility: "public" | "members" | "private";
  bodyMd: string;
  isBook: boolean;
  coverHue: number;
  summary: string;
  coverImage: string;
  bannerImage: string;
};

const EMPTY_DRAFT: Draft = { id: null, title: "", slug: "", parentId: "", visibility: "private", bodyMd: "", isBook: false, coverHue: 210, summary: "", coverImage: "", bannerImage: "" };

const VISIBILITY_LABEL: Record<Doc["visibility"], string> = {
  public: "公开",
  members: "登录可见",
  private: "私有",
};

const ERRORS: Record<string, string> = {
  slug_taken: "同级下该路径别名已被占用",
  doc_cycle: "不能移动到它自己的子级里",
  doc_has_children: "请先删除或移走它的子节点",
  malware_detected: "文件未通过安全扫描",
  book_not_found: "目标不是一本已存在的书",
};
const mapError = (e?: string) => (e && ERRORS[e]) ? ERRORS[e] : (e ?? "请求失败");

export function DocsManager() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tab, setTab] = useState<"books" | "docs">("books");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<"" | "cover" | "banner">("");
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);

  const load = async () => {
    const response = await fetch("/api/docs", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as { docs: Doc[] };
    setDocs(data.docs);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/docs", { cache: "no-store" });
      if (!response.ok || cancelled) return;
      const data = await response.json() as { docs: Doc[] };
      if (!cancelled) setDocs(data.docs);
    })();
    return () => { cancelled = true; };
  }, []);

  const byId = useMemo(() => new Map(docs.map((d) => [d.id, d] as const)), [docs]);

  // doc 是否为 rootId 的后代(不含 rootId 自身)。用于展开某本书的章节子树。
  const isDescendantOf = (docId: string, rootId: string): boolean => {
    let cursor = byId.get(docId);
    const seen = new Set<string>();
    while (cursor && cursor.parentId) {
      if (seen.has(cursor.id)) break;
      seen.add(cursor.id);
      if (cursor.parentId === rootId) return true;
      cursor = byId.get(cursor.parentId);
    }
    return false;
  };

  const books = useMemo(() => docs.filter((d) => d.isBook === 1), [docs]);
  const bookIdSet = useMemo(() => new Set(books.map((b) => b.id)), [books]);

  // 独立文档:不在任何书子树里(书根自身也排除——它属于书架,不归文档管理)。
  // 与 docs.ts 的 listStandaloneDocs 同语义:祖先链任一节点是书根即属书子树。
  const standaloneDocs = useMemo(() => docs.filter((d) => {
    if (d.isBook === 1) return false;
    let cursor: Doc | undefined = d;
    const seen = new Set<string>();
    while (cursor) {
      if (seen.has(cursor.id)) break;
      seen.add(cursor.id);
      if (bookIdSet.has(cursor.id)) return false;
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return true;
  }), [docs, bookIdSet, byId]);

  const selectedBook = selectedBookId ? (byId.get(selectedBookId) ?? null) : (books[0] ?? null);

  const countChapters = (bookId: string) => docs.filter((d) => isDescendantOf(d.id, bookId)).length;
  const hasChildren = (id: string) => docs.some((d) => d.parentId === id);

  // 整棵树里的深度(独立文档列表缩进用)。
  const depthOf = (doc: Doc): number => {
    let level = 0;
    let cursor: Doc | undefined = doc;
    const seen = new Set<string>();
    while (cursor?.parentId && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      cursor = byId.get(cursor.parentId);
      level += 1;
    }
    return level;
  };

  const siblingsOf = (d: Doc) => docs.filter((x) => (x.parentId ?? "") === (d.parentId ?? ""));
  const isFirstSibling = (d: Doc) => siblingsOf(d)[0]?.id === d.id;
  const isLastSibling = (d: Doc) => siblingsOf(d).at(-1)?.id === d.id;

  const startEdit = (doc: Doc) => {
    setDraft({
      id: doc.id, title: doc.title, slug: doc.slug, parentId: doc.parentId ?? "",
      visibility: doc.visibility, bodyMd: doc.bodyMd, isBook: doc.isBook === 1,
      coverHue: doc.coverHue, summary: doc.summary, coverImage: doc.coverImage, bannerImage: doc.bannerImage,
    });
    setEditing(true); setNotice("");
  };

  const startNew = (preset: Partial<Draft>) => { setDraft({ ...EMPTY_DRAFT, ...preset }); setEditing(true); setNotice(""); };
  const cancelEdit = () => { setEditing(false); setDraft(EMPTY_DRAFT); };

  const save = async () => {
    setBusy(true);
    const isEdit = draft.id !== null;
    const response = await fetch("/api/docs", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(isEdit ? { id: draft.id } : {}),
        title: draft.title, slug: draft.slug, parentId: draft.parentId || null,
        visibility: draft.visibility, bodyMd: draft.bodyMd, isBook: draft.isBook,
        coverHue: draft.coverHue, summary: draft.summary,
        coverImage: draft.coverImage, bannerImage: draft.bannerImage,
      }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    if (!response.ok) { setNotice(`保存未生效:${mapError(result.error)}`); return; }
    setNotice(isEdit ? "已更新。" : "已创建。");
    cancelEdit();
    await load();
  };

  // 上传封面/横幅(仅书)。走创始人专用 /api/docs/cover:ClamAV 扫描 clean 后
  // 才把返回的公开地址写回该书的 cover_image(slot=cover)或 banner_image(slot=banner)。
  // 需要书已存在(先保存书再传图)。
  const uploadImage = async (slot: "cover" | "banner", file: File) => {
    if (!draft.id) { setNotice("请先保存这本书,再为它上传封面/横幅。"); return; }
    setUploadingSlot(slot);
    try {
      const form = new FormData();
      form.set("file", file); form.set("docId", draft.id); form.set("slot", slot); form.set("visibility", "public");
      const response = await fetch("/api/docs/cover", { method: "POST", body: form });
      const result = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !result.url) { setNotice(`图片上传未生效:${mapError(result.error)}`); return; }
      setDraft((c) => (slot === "cover" ? { ...c, coverImage: result.url as string } : { ...c, bannerImage: result.url as string }));
      setNotice(slot === "cover" ? "竖版封面已上传并写回该书。" : "横版横幅已上传并写回该书。");
      await load();
    } finally { setUploadingSlot(""); }
  };

  const remove = async (doc: Doc) => {
    if (!window.confirm(`确定删除「${doc.title}」吗?此操作不可恢复。`)) return;
    const response = await fetch("/api/docs", {
      method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: doc.id }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) { setNotice(`删除未生效:${mapError(result.error)}`); return; }
    setNotice("已删除。");
    if (selectedBookId === doc.id) setSelectedBookId(null);
    await load();
  };

  // 章节上下移:同级兄弟间交换 sort_order(两个 PATCH)。无新端点。
  const moveChapter = async (doc: Doc, delta: -1 | 1) => {
    const siblings = siblingsOf(doc);
    const idx = siblings.findIndex((s) => s.id === doc.id);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= siblings.length) return;
    const other = siblings[target];
    const a = await fetch("/api/docs", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: doc.id, sortOrder: other.sortOrder }) });
    const b = await fetch("/api/docs", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: other.id, sortOrder: doc.sortOrder }) });
    if (!a.ok || !b.ok) { setNotice("排序未生效:请求失败。"); return; }
    setNotice("顺序已更新。");
    await load();
  };

  // 递归渲染选中书的章节子树。
  const renderChapters = (parentId: string, depth: number): ReactNode[] =>
    docs.filter((d) => (d.parentId ?? "") === parentId).map((d) => (
      <Fragment key={d.id}>
        <article className="docs-manager-chapter" style={{ marginLeft: depth * 18 }}>
          <span className="docs-manager-icon">{hasChildren(d.id) ? <Folder size={14} /> : <FileText size={14} />}</span>
          <div className="docs-manager-chapter-main">
            <strong>{d.title}</strong>
            <small>/{d.slug}{d.visibility !== "public" ? ` · ${VISIBILITY_LABEL[d.visibility]}` : ""}</small>
          </div>
          <span className="docs-manager-chapter-actions">
            <button onClick={() => void moveChapter(d, -1)} disabled={isFirstSibling(d)} aria-label="上移" title="上移"><ArrowUp size={13} /></button>
            <button onClick={() => void moveChapter(d, 1)} disabled={isLastSibling(d)} aria-label="下移" title="下移"><ArrowDown size={13} /></button>
            <button onClick={() => startEdit(d)}><Pencil size={13} /> 编辑</button>
            <button className="danger" onClick={() => void remove(d)}><Trash2 size={13} /></button>
          </span>
        </article>
        {renderChapters(d.id, depth + 1)}
      </Fragment>
    ));

  const editingLabel = draft.id
    ? (draft.isBook ? "编辑书" : "编辑文档/章节")
    : (draft.isBook ? "新建书" : "新建文档/章节");

  return <main className="docs-manager">
    <header>
      <span><FileText size={17} /> ZAOCHANG DOCS / ADMIN</span>
      <h1>文档与书架管理</h1>
      <p>「书架管理」维护书与章节(对外只从书架进入);「文档管理」维护独立的零散文档。两者互不重叠——书不会出现在文档目录里。</p>
      <button onClick={() => void load()}><RefreshCw size={14} /> 刷新</button>
    </header>
    {notice && <p className="docs-manager-notice">{notice}</p>}

    {editing ? (
      <section className="docs-manager-editor">
        <div className="docs-manager-editor-head">
          <h2>{editingLabel}</h2>
          <button onClick={cancelEdit}>← 返回列表</button>
        </div>
        <div className="docs-manager-form">
          <label>标题<input value={draft.title} maxLength={120} onChange={(e) => setDraft((c) => ({ ...c, title: e.target.value }))} placeholder="标题" /></label>
          <label>路径别名(slug)<input value={draft.slug} maxLength={80} onChange={(e) => setDraft((c) => ({ ...c, slug: e.target.value }))} placeholder="my-doc" /></label>
          <label>父级
            <select value={draft.parentId} onChange={(e) => setDraft((c) => ({ ...c, parentId: e.target.value }))}>
              <option value="">{draft.isBook ? "(根目录 — 书架顶层)" : "(根目录)"}</option>
              {docs.filter((d) => d.id !== draft.id).map((d) => <option key={d.id} value={d.id}>{"　".repeat(depthOf(d))}{d.title}{d.isBook === 1 ? " 📖" : ""}</option>)}
            </select>
          </label>
          <label>可见性
            <select value={draft.visibility} onChange={(e) => setDraft((c) => ({ ...c, visibility: e.target.value as Draft["visibility"] }))}>
              <option value="private">私有</option>
              <option value="members">登录可见</option>
              <option value="public">公开</option>
            </select>
          </label>
          <label className="docs-manager-check">
            <input type="checkbox" checked={draft.isBook} onChange={(e) => setDraft((c) => ({ ...c, isBook: e.target.checked }))} />
            这是一本书(出现在书架,章节挂到它下面)
          </label>
          {draft.isBook && <>
            <label>封面主题色(色相 0-360)<input type="number" min={0} max={360} value={draft.coverHue} onChange={(e) => setDraft((c) => ({ ...c, coverHue: Math.max(0, Math.min(360, Math.floor(Number(e.target.value)) || 0)) }))} /></label>
            <label>书籍简介<input value={draft.summary} maxLength={240} onChange={(e) => setDraft((c) => ({ ...c, summary: e.target.value }))} placeholder="这本书讲什么,一两句话" /></label>
            <label>竖版封面(书架卡片用,经安全扫描,公开可读)
              <span className="docs-manager-cover">
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadingSlot !== ""} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage("cover", f); e.currentTarget.value = ""; }} />
                {uploadingSlot === "cover" && <small>正在扫描并上传…</small>}
                {draft.coverImage && <span className="docs-manager-cover-preview"><img src={draft.coverImage} alt="竖版封面预览" /><button type="button" onClick={() => setDraft((c) => ({ ...c, coverImage: "" }))}>移除</button></span>}
              </span>
            </label>
            <label>横版横幅(书封面页顶部用,经安全扫描,公开可读)
              <span className="docs-manager-cover">
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadingSlot !== ""} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage("banner", f); e.currentTarget.value = ""; }} />
                {uploadingSlot === "banner" && <small>正在扫描并上传…</small>}
                {draft.bannerImage && <span className="docs-manager-cover-preview docs-manager-banner-preview"><img src={draft.bannerImage} alt="横版横幅预览" /><button type="button" onClick={() => setDraft((c) => ({ ...c, bannerImage: "" }))}>移除</button></span>}
              </span>
            </label>
          </>}
          <label className="docs-manager-body">正文(Markdown,支持 $…$ / $$…$$ 数学公式与 ```mermaid 图)
            <textarea value={draft.bodyMd} onChange={(e) => setDraft((c) => ({ ...c, bodyMd: e.target.value }))} placeholder="# 标题&#10;&#10;支持 Markdown 语法…" />
          </label>
          <div className="docs-manager-actions">
            <button disabled={busy || draft.title.trim().length < 1} onClick={() => void save()}>
              {draft.id ? <Pencil size={14} /> : <Plus size={14} />} {draft.id ? "保存修改" : "创建"}
            </button>
            <button onClick={cancelEdit}>取消</button>
          </div>
        </div>
      </section>
    ) : (
      <>
        <div className="docs-manager-tabs">
          <button className={tab === "books" ? "active" : ""} onClick={() => setTab("books")}><BookOpen size={15} /> 书架管理 ({books.length})</button>
          <button className={tab === "docs" ? "active" : ""} onClick={() => setTab("docs")}><FileText size={15} /> 文档管理 ({standaloneDocs.length})</button>
        </div>

        {tab === "books" ? (
          <section className="docs-manager-books">
            <div className="docs-manager-books-list">
              <div className="docs-manager-list-head"><h3>书架({books.length})</h3><button onClick={() => startNew({ isBook: true, parentId: "" })}><Plus size={13} /> 新建书</button></div>
              {books.length === 0
                ? <p className="docs-manager-empty">书架还没有书。点「新建书」上架第一本。</p>
                : books.map((b) => (
                  <button key={b.id} className={`docs-manager-book-card${selectedBook?.id === b.id ? " selected" : ""}`} onClick={() => setSelectedBookId(b.id)}>
                    <span className="book-cover book-cover-sm" style={{ background: `linear-gradient(150deg, hsl(${b.coverHue} 42% 88%), hsl(${b.coverHue} 48% 70%))` }}>
                      {b.coverImage ? <img src={b.coverImage} alt={b.title} /> : <BookOpen size={16} style={{ color: `hsl(${b.coverHue} 40% 38%)` }} />}
                    </span>
                    <span className="docs-manager-book-card-meta">
                      <strong>{b.title}</strong>
                      <small>{countChapters(b.id)} 章 · {VISIBILITY_LABEL[b.visibility]}</small>
                    </span>
                  </button>
                ))}
            </div>
            <div className="docs-manager-book-detail">
              {selectedBook ? (
                <>
                  <div className="docs-manager-book-head">
                    <div>
                      <h3>📖 {selectedBook.title}</h3>
                      <small>/bookshelf/{selectedBook.slug} · {countChapters(selectedBook.id)} 章 · {VISIBILITY_LABEL[selectedBook.visibility]}{selectedBook.visibility !== "public" && <Lock size={11} />}</small>
                    </div>
                    <div className="docs-manager-book-head-actions">
                      <button onClick={() => startEdit(selectedBook)}><Pencil size={13} /> 编辑书信息</button>
                      <button onClick={() => startNew({ isBook: false, parentId: selectedBook.id })}><Plus size={13} /> 新建章节</button>
                    </div>
                  </div>
                  {selectedBook.summary && <p className="docs-manager-book-summary">{selectedBook.summary}</p>}
                  <div className="docs-manager-book-covers">
                    <span className="docs-manager-cover-preview">{selectedBook.coverImage ? <img src={selectedBook.coverImage} alt="竖版封面" /> : <small>无竖版封面</small>}</span>
                    <span className="docs-manager-cover-preview docs-manager-banner-preview">{selectedBook.bannerImage ? <img src={selectedBook.bannerImage} alt="横版横幅" /> : <small>无横版横幅</small>}</span>
                  </div>
                  <h4>章节目录</h4>
                  {countChapters(selectedBook.id) === 0
                    ? <p className="docs-manager-empty">这本书还没有章节。点「新建章节」开始。</p>
                    : renderChapters(selectedBook.id, 0)}
                </>
              ) : <p className="docs-manager-empty">选择左侧的一本书,或新建一本。</p>}
            </div>
          </section>
        ) : (
          <section className="docs-manager-list">
            <div className="docs-manager-list-head"><h3>独立文档({standaloneDocs.length})</h3><button onClick={() => startNew({ isBook: false, parentId: "" })}><Plus size={13} /> 新建文档</button></div>
            {standaloneDocs.length === 0
              ? <p className="docs-manager-empty">还没有独立文档。文档与书互不重叠——书里的章节只从书架进入。</p>
              : standaloneDocs.map((doc) => (
                <article key={doc.id} style={{ marginLeft: depthOf(doc) * 18 }}>
                  <span className="docs-manager-icon">{hasChildren(doc.id) ? <Folder size={15} /> : <FileText size={15} />}</span>
                  <div><strong>{doc.title}</strong><small>/{doc.slug} · {doc.updatedAt.slice(0, 10)}</small></div>
                  <span className={`docs-manager-vis docs-vis-${doc.visibility}`}>{doc.visibility !== "public" && <Lock size={11} />} {VISIBILITY_LABEL[doc.visibility]}</span>
                  <button onClick={() => startEdit(doc)}><Pencil size={13} /> 编辑</button>
                  <button className="danger" onClick={() => void remove(doc)}><Trash2 size={13} /> 删除</button>
                </article>
              ))}
          </section>
        )}
      </>
    )}
  </main>;
}
