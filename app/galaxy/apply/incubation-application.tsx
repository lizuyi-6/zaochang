"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, FileText, Lightbulb, Rocket, Send, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { PRODUCT_BY_PLANET } from "../product-galaxy";
import styles from "../ecosystem.module.css";

const projectTypes = ["AI 产品", "软件产品", "硬件项目", "开源项目", "创业团队", "开发者项目", "创新想法"];
const stages = ["提交申请", "资料审核", "初步沟通", "项目评估", "确认合作", "产品定位", "原型设计", "开发测试", "上线准备", "进入银河"];

export function IncubationApplication() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedProduct = searchParams.get("product");
  const productContext = requestedProduct && requestedProduct in PRODUCT_BY_PLANET ? PRODUCT_BY_PLANET[requestedProduct as keyof typeof PRODUCT_BY_PLANET] : null;
  const [step, setStep] = useState(0);
  const [projectType, setProjectType] = useState("AI 产品");
  const [name, setName] = useState("");
  const [oneLiner, setOneLiner] = useState("");
  const [problem, setProblem] = useState("");
  const [progress, setProgress] = useState("已有可演示原型");
  const [team, setTeam] = useState("1 人独立项目");
  const [need, setNeed] = useState("产品定位与用户验证");
  const [contact, setContact] = useState("");

  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(projectType);
    if (step === 1) return name.trim().length >= 2 && oneLiner.trim().length >= 10 && problem.trim().length >= 10;
    if (step === 2) return Boolean(progress && team && need && contact.trim().length >= 5);
    return true;
  }, [contact, name, need, oneLiner, problem, progress, projectType, step, team]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canContinue) return;
    localStorage.setItem("zaochang-incubation-project", JSON.stringify({ name, projectType, oneLiner, problem, progress, team, need, contact, submittedAt: new Date().toISOString() }));
    router.push("/galaxy/incubator?submitted=1");
  };

  return (
    <div className={styles.applicationPage}>
      <section className={styles.applicationIntro}>
        <span>SEND A PRODUCT SIGNAL</span>
        <h1>发射产品信号</h1>
        <p>你不需要先证明项目已经完美。请让我们看见它为谁存在、正在解决什么，以及你愿意把它推进到哪里。</p>
        {productContext && <div className={styles.contextNotice}><Lightbulb size={16} /><span><strong>申请关联：{productContext.name}</strong><small>我们会把你的申请交给对应产品负责人。</small></span></div>}
        <div className={styles.applicationOrbit} aria-label="加入造场完整流程">{stages.map((item, index) => <span key={item} className={index === 0 ? styles.current : ""}><b>{String(index + 1).padStart(2, "0")}</b>{item}</span>)}</div>
      </section>

      <form className={styles.applicationForm} onSubmit={submit}>
        <div className={styles.formProgress}>{["项目类型", "产品信号", "合作需求", "确认发射"].map((item, index) => <button type="button" key={item} onClick={() => index < step && setStep(index)} className={index <= step ? styles.active : ""}><span>{index < step ? <Check size={13} /> : index + 1}</span><small>{item}</small></button>)}</div>
        <AnimatePresence mode="wait">
          <motion.section key={step} className={styles.formStep} initial={{ opacity: 0, x: 22 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: .28 }}>
            {step === 0 && <><header><small>01 / SIGNAL TYPE</small><h2>这是一颗怎样的新生星体？</h2><p>项目类型帮助信号进入正确的评估轨道，不决定项目的价值。</p></header><div className={styles.typeChoices}>{projectTypes.map((item) => <button type="button" key={item} className={projectType === item ? styles.selected : ""} onClick={() => setProjectType(item)}><span>{item === "创新想法" ? <Lightbulb size={18} /> : item.includes("团队") ? <Users size={18} /> : <FileText size={18} />}</span><strong>{item}</strong>{projectType === item && <Check size={14} />}</button>)}</div></>}
            {step === 1 && <><header><small>02 / PRODUCT SIGNAL</small><h2>让我们看见项目为什么存在</h2><p>准确的问题比完整的功能清单更重要。</p></header><label><span>项目名称 <b>{name.length}/32</b></span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} placeholder="例如：面向小团队的知识协作助手" /></label><label><span>一句话介绍 <b>{oneLiner.length}/100</b></span><textarea value={oneLiner} onChange={(event) => setOneLiner(event.target.value)} maxLength={100} placeholder="它为谁带来什么具体改变？" /></label><label><span>正在解决的问题 <b>{problem.length}/240</b></span><textarea value={problem} onChange={(event) => setProblem(event.target.value)} maxLength={240} placeholder="这个问题现在如何被处理，为什么仍值得重新解决？" /></label></>}
            {step === 2 && <><header><small>03 / COOPERATION</small><h2>你希望共同推进哪一段路？</h2><p>我们会据此安排产品、技术或生态负责人参与初步沟通。</p></header><div className={styles.formTwoColumns}><label><span>项目当前进度</span><select value={progress} onChange={(event) => setProgress(event.target.value)}><option>只有想法与初步研究</option><option>已有产品方案</option><option>已有可演示原型</option><option>已有早期用户</option><option>已经上线运营</option></select></label><label><span>团队情况</span><select value={team} onChange={(event) => setTeam(event.target.value)}><option>1 人独立项目</option><option>2-5 人团队</option><option>6 人以上团队</option><option>企业内部创新项目</option><option>正在寻找联合创始人</option></select></label></div><label><span>最需要的支持</span><select value={need} onChange={(event) => setNeed(event.target.value)}><option>产品定位与用户验证</option><option>UX/UI 与原型设计</option><option>技术架构与开发</option><option>测试与首批用户</option><option>商业合作与市场连接</option><option>长期联合孵化</option></select></label><label><span>联系方式</span><input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="邮箱、微信或其他可以联系到你的方式" /></label></>}
            {step === 3 && <><header><small>04 / CONFIRM SIGNAL</small><h2>确认发射这束产品信号</h2><p>提交后，项目进入资料审核。控制台会持续解释当前状态、等待原因和下一步。</p></header><div className={styles.applicationReview}><div><small>项目</small><strong>{name}</strong><span>{projectType} · {progress}</span></div><div><small>产品信号</small><p>{oneLiner}</p></div><div><small>希望获得</small><strong>{need}</strong><span>{team}</span></div><div className={styles.reviewPromise}><Rocket size={18} /><p>提交并不意味着项目已经被正式接纳；它意味着造场开始认真回应这束信号。</p></div></div></>}
          </motion.section>
        </AnimatePresence>
        <footer className={styles.formActions}><button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}><ArrowLeft size={15} /> 上一步</button>{step < 3 ? <button key="next-step" type="button" className={styles.formPrimary} disabled={!canContinue} onClick={() => canContinue && setStep((value) => value + 1)}>继续 <ArrowRight size={15} /></button> : <button key="submit-application" type="submit" className={styles.formPrimary} disabled={!canContinue}>发射产品信号 <Send size={14} /></button>}</footer>
      </form>
    </div>
  );
}
