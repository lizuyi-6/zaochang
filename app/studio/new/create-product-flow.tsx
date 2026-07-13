"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Coins, ExternalLink, Image as ImageIcon, Link2, PackageCheck, Play, Sparkles } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

const steps = ["基本信息", "体验设置", "发布确认"];

export function CreateProductFlow() {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("互动体验");
  const [pricingModel, setPricingModel] = useState<"free" | "one_time" | "per_use">("free");
  const [price, setPrice] = useState(0);
  const [demoUrl, setDemoUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [coverOpen, setCoverOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState("coral");
  const [submitting, setSubmitting] = useState(false);
  const [published, setPublished] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("zaochang-product-draft");
    if (!raw) return;
    const frame = window.requestAnimationFrame(() => {
      try {
        const draft = JSON.parse(raw) as Record<string, unknown>;
        setTitle(String(draft.title ?? "")); setDescription(String(draft.description ?? "")); setCategory(String(draft.category ?? "互动体验")); setPricingModel((["free", "one_time", "per_use"].includes(String(draft.pricingModel)) ? String(draft.pricingModel) : "free") as typeof pricingModel); setPrice(Number(draft.price ?? 0)); setDemoUrl(String(draft.demoUrl ?? "")); setImageUrl(String(draft.imageUrl ?? "")); setTheme(String(draft.theme ?? "coral"));
      } catch { localStorage.removeItem("zaochang-product-draft"); }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    localStorage.setItem("zaochang-product-draft", JSON.stringify({ title, description, category, pricingModel, price, demoUrl, imageUrl, theme }));
  }, [category, demoUrl, description, imageUrl, price, pricingModel, theme, title]);

  const next = () => {
    if (step === 0 && (title.trim().length < 2 || description.trim().length < 12)) return;
    setStep((current) => Math.min(2, current + 1));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    const response = await fetch("/api/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, description, category, pricingModel, price, demoUrl, imageUrl, coverTheme: theme }) });
    if (response.status === 401) {
      window.location.href = "/signin?return_to=%2Fstudio%2Fnew";
      return;
    }
    if (response.ok) { localStorage.removeItem("zaochang-product-draft"); setPublished(true); }
    setSubmitting(false);
  };

  const uploadCover = async (file: File) => {
    setUploadingCover(true);
    const form = new FormData(); form.set("file", file); form.set("visibility", "public");
    const response = await fetch("/api/uploads", { method: "POST", body: form });
    if (response.status === 401) { window.location.assign("/signin?return_to=%2Fstudio%2Fnew"); return; }
    if (response.ok) { const data = await response.json() as { url: string }; setImageUrl(data.url); setCoverOpen(true); }
    setUploadingCover(false);
  };

  if (published) {
    return <motion.section className="publish-success" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}><motion.span initial={{ rotate: -25, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", delay: 0.15 }}><PackageCheck size={38} /></motion.span><small>PUBLISHED / READY FOR REAL FEEDBACK</small><h1>作品已经进入场内</h1><p>第一批体验会从探索页开始。有效喜欢会为作品带来果子，发布本身不直接发放奖励。</p><div><Link className="primary-action" href="/discover">去探索页看看 <ArrowRight size={17} /></Link><Link className="text-action" href="/studio">回到创作台</Link></div></motion.section>;
  }

  return (
    <div className="create-flow-page">
      <header className="create-flow-header"><Link href="/studio"><ArrowLeft size={16} /> 返回创作台</Link><div><span>NEW WORK / DRAFT</span><h1>发布一件新作品</h1></div><small>草稿自动保留在当前页面</small></header>
      <div className="create-stepper">{steps.map((label, index) => <div key={label} className={index <= step ? "active" : ""}><span>{index < step ? <Check size={15} /> : index + 1}</span><strong>{label}</strong>{index < steps.length - 1 && <i><b style={{ transform: `scaleX(${index < step ? 1 : 0})` }} /></i>}</div>)}</div>

      <form className="create-flow-body" onSubmit={submit}>
        <AnimatePresence mode="wait">
          <motion.section key={step} className="create-step-panel" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.35 }}>
            {step === 0 && <><div className="step-intro"><span>01 / IDENTITY</span><h2>先说清楚，它是什么</h2><p>一个准确的名字和一句具体介绍，比完整功能列表更容易让人愿意点进来。</p></div><label><span>作品名称 <b>{title.length}/36</b></span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={36} placeholder="例如：雨天散步生成器" /></label><label><span>一句话介绍 <b>{description.length}/180</b></span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={180} placeholder="它为谁带来怎样的体验？" /></label><label><span>作品类别</span><div className="choice-grid">{["互动体验", "效率工具", "声音影像", "生活方式", "开发工具"].map((item) => <button type="button" key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{category === item && <Check size={14} />}{item}</button>)}</div></label></>}
            {step === 1 && <><div className="step-intro"><span>02 / EXPERIENCE</span><h2>用户要从哪里进入</h2><p>你可以先发布一个站内原型，也可以关联已经在线的完整版本。</p></div><label><span>完整体验链接 <small>可选</small></span><div className="input-with-icon"><Link2 size={17} /><input value={demoUrl} onChange={(event) => setDemoUrl(event.target.value)} type="url" placeholder="https://" /></div></label><fieldset className="pricing-model-field"><legend>访问方式</legend><div className="pricing-model-choice">{[{ id: "free", title: "免费开放", text: "所有人直接进入" }, { id: "one_time", title: "一次解锁", text: "支付一次，持续访问" }, { id: "per_use", title: "按次体验", text: "每次进入单独结算" }].map((item) => <button type="button" key={item.id} className={pricingModel === item.id ? "active" : ""} onClick={() => { setPricingModel(item.id as typeof pricingModel); if (item.id === "free") setPrice(0); else if (price === 0) setPrice(5); }}>{pricingModel === item.id && <Check size={14} />}<strong>{item.title}</strong><small>{item.text}</small></button>)}</div></fieldset>{pricingModel !== "free" && <label><span>果子价格</span><div className="price-control"><button type="button" onClick={() => setPrice(Math.max(1, price - 1))}>−</button><strong><Coins size={18} /> {price}</strong><button type="button" onClick={() => setPrice(Math.min(99, price + 1))}>+</button><small>{pricingModel === "one_time" ? "一次解锁收入先待结算 24 小时" : "每次体验单独扣款，进入后不退款"}</small></div></label>}<fieldset><legend>作品封面色</legend><div className="theme-choice">{["coral", "mint", "blue", "yellow", "ink"].map((item) => <button type="button" aria-label={item} key={item} className={`${item} ${theme === item ? "active" : ""}`} onClick={() => setTheme(item)}>{theme === item && <Check size={15} />}</button>)}</div></fieldset><button type="button" className="upload-zone" onClick={() => coverInputRef.current?.click()} disabled={uploadingCover}><ImageIcon size={23} /><span><strong>{uploadingCover ? "正在上传封面" : imageUrl ? "已添加封面图片" : "添加一张作品封面"}</strong><small>{imageUrl ? "再次点击可替换文件" : "PNG / JPG / WebP · 最大 10MB"}</small></span><ExternalLink size={16} /></button><input ref={coverInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadCover(file); event.currentTarget.value = ""; }} /><button type="button" className="cover-url-toggle" onClick={() => setCoverOpen((value) => !value)}>或使用公开图片链接</button>{coverOpen && <label className="cover-url-field"><span>封面图片链接</span><input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} type="url" placeholder="https://example.com/cover.jpg" /></label>}</>}
            {step === 2 && <><div className="step-intro"><span>03 / RELEASE</span><h2>让第一批人进入作品</h2><p>发布后仍然可以继续改名、调整介绍和更新体验链接。</p></div><div className={`publish-preview theme-${theme} ${previewing ? "playing" : ""}`} style={imageUrl ? { backgroundImage: `linear-gradient(rgb(0 0 0 / 48%), rgb(0 0 0 / 48%)), url(${imageUrl})` } : undefined}><div><span>{category}</span><h3>{title || "未命名作品"}</h3><p>{previewing ? "预览正在运行：用户会从这里进入你的作品。" : description || "你的作品介绍会出现在这里。"}</p><small>BY YOU / VERSION 0.1</small></div><motion.button type="button" onClick={() => setPreviewing((value) => !value)} whileHover={{ scale: 1.06 }} aria-label="预览作品"><Play size={19} fill="currentColor" /></motion.button></div><div className="release-checklist"><div><Check size={16} /><span><strong>基础信息</strong><small>名称、介绍和类别已经填写</small></span></div><div><Check size={16} /><span><strong>体验入口</strong><small>{demoUrl ? "已关联完整链接" : "使用站内原型模式"}</small></span></div><div><Sparkles size={16} /><span><strong>访问方式</strong><small>{pricingModel === "free" ? "免费开放" : pricingModel === "one_time" ? `${price} 果一次解锁` : `${price} 果按次体验`}</small></span></div></div></>}
          </motion.section>
        </AnimatePresence>

        <div className="create-flow-actions"><button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}><ArrowLeft size={16} /> 上一步</button>{step < 2 ? <button type="button" className="primary-action" onClick={next}>继续 <ArrowRight size={17} /></button> : <button className="primary-action" disabled={submitting}>{submitting ? "发布中" : "确认发布"}<Sparkles size={16} /></button>}</div>
      </form>
    </div>
  );
}
