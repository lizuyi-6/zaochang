"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Coins, ExternalLink, Image as ImageIcon, Link2, PackageCheck, Play, Sparkles } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";

const steps = ["基本信息", "体验设置", "发布确认"];

export function CreateProductFlow() {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("互动体验");
  const [price, setPrice] = useState(0);
  const [demoUrl, setDemoUrl] = useState("");
  const [theme, setTheme] = useState("coral");
  const [submitting, setSubmitting] = useState(false);
  const [published, setPublished] = useState(false);

  const next = () => {
    if (step === 0 && (title.trim().length < 2 || description.trim().length < 12)) return;
    setStep((current) => Math.min(2, current + 1));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    const response = await fetch("/api/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, description, category, price, demoUrl, coverTheme: theme }) });
    if (response.status === 401) {
      window.location.href = "/signin-with-chatgpt?return_to=%2Fstudio%2Fnew";
      return;
    }
    if (response.ok) setPublished(true);
    setSubmitting(false);
  };

  if (published) {
    return <motion.section className="publish-success" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}><motion.span initial={{ rotate: -25, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", delay: 0.15 }}><PackageCheck size={38} /></motion.span><small>PUBLISHED / REWARD +20</small><h1>作品已经进入场内</h1><p>第一批体验会从探索页开始。你可以继续发布过程记录，或回到创作台查看数据。</p><div><Link className="primary-action" href="/discover">去探索页看看 <ArrowRight size={17} /></Link><Link className="text-action" href="/studio">回到创作台</Link></div></motion.section>;
  }

  return (
    <div className="create-flow-page">
      <header className="create-flow-header"><Link href="/studio"><ArrowLeft size={16} /> 返回创作台</Link><div><span>NEW WORK / DRAFT</span><h1>发布一件新作品</h1></div><small>草稿自动保留在当前页面</small></header>
      <div className="create-stepper">{steps.map((label, index) => <div key={label} className={index <= step ? "active" : ""}><span>{index < step ? <Check size={15} /> : index + 1}</span><strong>{label}</strong>{index < steps.length - 1 && <i><b style={{ transform: `scaleX(${index < step ? 1 : 0})` }} /></i>}</div>)}</div>

      <form className="create-flow-body" onSubmit={submit}>
        <AnimatePresence mode="wait">
          <motion.section key={step} className="create-step-panel" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.35 }}>
            {step === 0 && <><div className="step-intro"><span>01 / IDENTITY</span><h2>先说清楚，它是什么</h2><p>一个准确的名字和一句具体介绍，比完整功能列表更容易让人愿意点进来。</p></div><label><span>作品名称 <b>{title.length}/36</b></span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={36} placeholder="例如：雨天散步生成器" /></label><label><span>一句话介绍 <b>{description.length}/180</b></span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={180} placeholder="它为谁带来怎样的体验？" /></label><label><span>作品类别</span><div className="choice-grid">{["互动体验", "效率工具", "声音影像", "生活方式", "开发工具"].map((item) => <button type="button" key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{category === item && <Check size={14} />}{item}</button>)}</div></label></>}
            {step === 1 && <><div className="step-intro"><span>02 / EXPERIENCE</span><h2>用户要从哪里进入</h2><p>你可以先发布一个站内原型，也可以关联已经在线的完整版本。</p></div><label><span>完整体验链接 <small>可选</small></span><div className="input-with-icon"><Link2 size={17} /><input value={demoUrl} onChange={(event) => setDemoUrl(event.target.value)} type="url" placeholder="https://" /></div></label><label><span>体验价格</span><div className="price-control"><button type="button" onClick={() => setPrice(Math.max(0, price - 1))}>−</button><strong><Coins size={18} /> {price}</strong><button type="button" onClick={() => setPrice(Math.min(99, price + 1))}>+</button><small>{price === 0 ? "免费开放" : "每次体验进入创作者账户"}</small></div></label><fieldset><legend>作品封面色</legend><div className="theme-choice">{["coral", "mint", "blue", "yellow", "ink"].map((item) => <button type="button" aria-label={item} key={item} className={`${item} ${theme === item ? "active" : ""}`} onClick={() => setTheme(item)}>{theme === item && <Check size={15} />}</button>)}</div></fieldset><button type="button" className="upload-zone"><ImageIcon size={23} /><span><strong>添加一张作品封面</strong><small>暂用社区封面模板 · 16:10</small></span><ExternalLink size={16} /></button></>}
            {step === 2 && <><div className="step-intro"><span>03 / RELEASE</span><h2>让第一批人进入作品</h2><p>发布后仍然可以继续改名、调整介绍和更新体验链接。</p></div><div className={`publish-preview theme-${theme}`}><div><span>{category}</span><h3>{title || "未命名作品"}</h3><p>{description || "你的作品介绍会出现在这里。"}</p><small>BY YOU / VERSION 0.1</small></div><motion.button type="button" whileHover={{ scale: 1.06 }}><Play size={19} fill="currentColor" /></motion.button></div><div className="release-checklist"><div><Check size={16} /><span><strong>基础信息</strong><small>名称、介绍和类别已经填写</small></span></div><div><Check size={16} /><span><strong>体验入口</strong><small>{demoUrl ? "已关联完整链接" : "使用站内原型模式"}</small></span></div><div><Sparkles size={16} /><span><strong>发布奖励</strong><small>作品首次发布后获得 20 果</small></span></div></div></>}
          </motion.section>
        </AnimatePresence>

        <div className="create-flow-actions"><button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}><ArrowLeft size={16} /> 上一步</button>{step < 2 ? <button type="button" className="primary-action" onClick={next}>继续 <ArrowRight size={17} /></button> : <button className="primary-action" disabled={submitting}>{submitting ? "发布中" : "确认发布"}<Sparkles size={16} /></button>}</div>
      </form>
    </div>
  );
}
