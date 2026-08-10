"use client";

import { FileText, Folder, Lock, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

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

export function DocsManager() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<"" | "cover" | "banner">("");

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

  const startEdit = (doc: Doc) => setDraft({
    id: doc.id,
    title: doc.title,
    slug: doc.slug,
    parentId: doc.parentId ?? "",
    visibility: doc.visibility,
    bodyMd: doc.bodyMd,
    isBook: doc.isBook === 1,
    coverHue: doc.coverHue,
    summary: doc.summary,
    coverImage: doc.coverImage,
    bannerImage: doc.bannerImage,
  });

  const save = async () => {
    setBusy(true);
    const isEdit = draft.id !== null;
    const response = await fetch("/api/docs", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(isEdit ? { id: draft.id } : {}),
        title: draft.title,
        slug: draft.slug,
        parentId: draft.parentId || null,
        visibility: draft.visibility,
        bodyMd: draft.bodyMd,
        isBook: draft.isBook,
        coverHue: draft.coverHue,
        summary: draft.summary,
        coverImage: draft.coverImage,
        bannerImage: draft.bannerImage,
      }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setNotice(`保存未生效:${result.error === "slug_taken" ? "同级下该路径别名已被占用" : result.error === "doc_cycle" ? "不能移动到它自己的子级里" : result.error ?? "请求失败"}`);
      return;
    }
    setNotice(isEdit ? "文档已更新。" : "文档已创建。");
    setDraft(EMPTY_DRAFT);
    await load();
  };

  // 上传封面/横幅图(仅书)。走创始人专用 /api/docs/cover:ClamAV 扫描 clean 后
  // 才把返回的公开地址写回该书的 cover_image(slot=cover)或 banner_image(slot=banner)。
  // 需要书已存在(先保存书再传图)。
  const uploadImage = async (slot: "cover" | "banner", file: File) => {
    if (!draft.id) {
      setNotice("请先保存这本书，再为它上传封面/横幅。");
      return;
    }
    setUploadingSlot(slot);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("docId", draft.id);
      form.set("slot", slot);
      form.set("visibility", "public");
      const response = await fetch("/api/docs/cover", { method: "POST", body: form });
      const result = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !result.url) {
        setNotice(`图片上传未生效:${result.error === "malware_detected" ? "文件未通过安全扫描" : result.error === "book_not_found" ? "目标不是一本已存在的书" : result.error ?? "请求失败"}`);
        return;
      }
      setDraft((c) => (slot === "cover" ? { ...c, coverImage: result.url as string } : { ...c, bannerImage: result.url as string }));
      setNotice(slot === "cover" ? "竖版封面已上传并写回该书。" : "横版横幅已上传并写回该书。");
      await load();
    } finally {
      setUploadingSlot("");
    }
  };

  const remove = async (doc: Doc) => {
    if (!window.confirm(`确定删除「${doc.title}」吗?此操作不可恢复。`)) return;
    const response = await fetch("/api/docs", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: doc.id }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      setNotice(`删除未生效:${result.error === "doc_has_children" ? "请先删除或移走它的子文档" : result.error ?? "请求失败"}`);
      return;
    }
    setNotice("文档已删除。");
    if (draft.id === doc.id) setDraft(EMPTY_DRAFT);
    await load();
  };

  const depth = (doc: Doc): number => {
    let level = 0;
    let cursor: Doc | undefined = doc;
    const seen = new Set<string>();
    while (cursor?.parentId && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      cursor = docs.find((item) => item.id === cursor?.parentId);
      level += 1;
    }
    return level;
  };

  return <main className="docs-manager">
    <header>
      <span><FileText size={17} /> ZAOCHANG DOCS / ADMIN</span>
      <h1>文档管理</h1>
      <p>只读对外展示的文档在这里维护。「公开」匿名可读,「登录可见」需登录,「私有」仅你可见。</p>
      <button onClick={() => void load()}><RefreshCw size={14} /> 刷新</button>
    </header>
    {notice && <p className="docs-manager-notice">{notice}</p>}

    <section className="docs-manager-editor">
      <h2>{draft.id ? "编辑文档" : "新建文档"}</h2>
      <div className="docs-manager-form">
        <label>标题<input value={draft.title} maxLength={120} onChange={(e) => setDraft((c) => ({ ...c, title: e.target.value }))} placeholder="文档标题" /></label>
        <label>路径别名(slug)<input value={draft.slug} maxLength={80} onChange={(e) => setDraft((c) => ({ ...c, slug: e.target.value }))} placeholder="my-doc" /></label>
        <label>父级
          <select value={draft.parentId} onChange={(e) => setDraft((c) => ({ ...c, parentId: e.target.value }))}>
            <option value="">(根目录)</option>
            {docs.filter((d) => d.id !== draft.id).map((d) => <option key={d.id} value={d.id}>{"　".repeat(depth(d))}{d.title}</option>)}
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
            {draft.id ? <Pencil size={14} /> : <Plus size={14} />} {draft.id ? "保存修改" : "创建文档"}
          </button>
          {draft.id && <button onClick={() => setDraft(EMPTY_DRAFT)}>取消编辑</button>}
        </div>
      </div>
    </section>

    <section className="docs-manager-list">
      <h2>已有文档({docs.length})</h2>
      {docs.length === 0
        ? <p className="docs-manager-empty">还没有文档。用上方表单创建第一篇。</p>
        : docs.map((doc) => <article key={doc.id}>
            <span className="docs-manager-icon" style={{ marginLeft: depth(doc) * 18 }}>
              {docs.some((d) => d.parentId === doc.id) ? <Folder size={15} /> : <FileText size={15} />}
            </span>
            <div>
              <strong>{doc.isBook === 1 ? "📖 " : ""}{doc.title}</strong>
              <small>/{doc.slug} · {doc.updatedAt.slice(0, 10)}{doc.isBook === 1 ? " · 书" : ""}</small>
            </div>
            <span className={`docs-manager-vis docs-vis-${doc.visibility}`}>
              {doc.visibility !== "public" && <Lock size={11} />} {VISIBILITY_LABEL[doc.visibility]}
            </span>
            <button onClick={() => startEdit(doc)}><Pencil size={13} /> 编辑</button>
            <button className="danger" onClick={() => void remove(doc)}><Trash2 size={13} /> 删除</button>
          </article>)}
    </section>
  </main>;
}
