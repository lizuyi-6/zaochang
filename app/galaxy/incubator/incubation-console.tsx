"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CalendarDays, Check, ChevronRight, CircleAlert, Clock3, FileText, MessageSquareText, Plus, Upload, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "../ecosystem.module.css";

type StoredProject = { name?: string; projectType?: string; oneLiner?: string; need?: string; submittedAt?: string };

const timeline = [
  { name: "提交申请", state: "完成", date: "07.10", owner: "项目发起人" },
  { name: "资料审核", state: "完成", date: "07.11", owner: "生态运营 · 林屿" },
  { name: "初步沟通", state: "完成", date: "07.12", owner: "产品顾问 · 周岑" },
  { name: "项目评估", state: "进行中", date: "当前", owner: "产品负责人 · 陈默" },
  { name: "孵化", state: "未开始", date: "预计 07.18", owner: "待确认" },
  { name: "开发", state: "未开始", date: "待排期", owner: "待确认" },
  { name: "测试", state: "未开始", date: "待排期", owner: "待确认" },
  { name: "上线", state: "未开始", date: "待排期", owner: "待确认" },
];

export function IncubationConsole() {
  const [stored, setStored] = useState<StoredProject | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem("zaochang-incubation-project");
    const frame = window.requestAnimationFrame(() => {
      if (!raw) return;
      try { setStored(JSON.parse(raw) as StoredProject); } catch { localStorage.removeItem("zaochang-incubation-project"); }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const projectName = stored?.name || "星尘协作台";
  const progress = submitted ? 42 : 35;
  const currentState = submitted ? "等待造场" : "等待用户";

  const act = () => {
    setSubmitted(true);
    setNotice("用户画像已提交，项目负责人会在 2 个工作日内给出评估结论。下一步将进入项目定位会。");
  };

  return (
    <div className={styles.consolePage}>
      <section className={styles.consoleHero}>
        <div className={styles.consoleProject}><span>INCUBATION ORBIT / ZC-2607-018</span><h1>{projectName}</h1><p>{stored?.oneLiner || "让小团队在不增加会议的情况下，持续形成可追踪的产品共识。"}</p><div><em>{stored?.projectType || "AI 产品"}</em><small>最近更新：今天 14:32</small></div></div>
        <div className={styles.consoleStage}><span>当前阶段</span><strong>产品需求验证</strong><small>阶段 4 / 8 · 项目评估</small></div>
        <div className={styles.progressDial} style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><div><strong>{progress}%</strong><small>总体进度</small></div></div>
        <div className={styles.heroNext}><span>当前任务 · {currentState}</span><strong>{submitted ? "等待产品评估意见" : "补充目标用户画像"}</strong><button onClick={submitted ? () => setNotice("负责人正在审阅资料，预计 2 个工作日内更新。") : act}>{submitted ? "查看等待原因" : "继续任务"} <ArrowRight size={14} /></button></div>
      </section>

      <section className={styles.nextAction}>
        <div><span>现在需要</span><strong>{submitted ? "等待产品负责人完成需求评估" : "补充 3 类目标用户画像与真实使用场景"}</strong></div><div><span>为什么</span><p>{submitted ? "确认项目的定位边界与本轮孵化目标。" : "用于判断核心问题是否足够具体，以及首轮验证应邀请哪些用户。"}</p></div><div><span>完成后</span><p>{submitted ? "安排产品定位会，确认合作方式。" : "进入项目评估结论与产品定位会。"}</p></div><button onClick={submitted ? () => setNotice("当前等待造场处理，无需重复提交。") : act}>{submitted ? <Clock3 size={16} /> : <Upload size={16} />}{submitted ? "查看处理进度" : "提交用户画像"}</button>
      </section>

      <div className={styles.consoleLayout}>
        <div className={styles.consoleMain}>
          <section className={styles.consoleSection}>
            <header><div><span>ORBIT TIMELINE</span><h2>阶段轨道</h2></div><small>每一步都有负责人和完成条件</small></header>
            <div className={styles.timeline}>{timeline.map((item, index) => <article key={item.name} data-state={index === 3 && submitted ? "等待造场" : item.state}><span>{item.state === "完成" ? <Check size={14} /> : index + 1}</span><div><strong>{item.name}</strong><small>{index === 3 && submitted ? "等待造场" : item.state} · {item.date}</small></div><p>{item.owner}</p><button aria-label={`查看${item.name}详情`} onClick={() => setNotice(`${item.name}：负责人为 ${item.owner}。完成条件会在阶段开始时明确。`)}><ChevronRight size={15} /></button></article>)}</div>
          </section>

          <section className={styles.taskPanel}>
            <header><div><span>CURRENT TASK / 01</span><h2>{submitted ? "资料已进入评估" : "补充目标用户画像"}</h2></div><em>{currentState}</em></header>
            <div className={styles.taskSpec}><div><span>做什么</span><p>{submitted ? "暂时无需操作。保持联系方式畅通。" : "描述 3 类最可能使用产品的人，以及他们在什么场景下遇到这个问题。"}</p></div><div><span>如何完成</span><p>{submitted ? "负责人将在控制台更新评估意见。" : "使用画像模板，每类用户至少附一个可验证的真实场景。"}</p></div><div><span>提交什么</span><p>{submitted ? "无需新增材料" : "用户画像文档，PDF / DOCX / 在线文档均可"}</p></div><div><span>完成标准</span><p>{submitted ? "产品负责人给出阶段结论" : "用户、触发场景、现有替代方案和付出成本均明确"}</p></div></div>
            <footer><span><CalendarDays size={14} /> {submitted ? "预计反馈：2 个工作日内" : "截止：07 月 16 日 18:00"}</span><button onClick={act} disabled={submitted}>{submitted ? <Check size={15} /> : <Upload size={15} />}{submitted ? "已经提交" : "上传并提交"}</button></footer>
          </section>
        </div>

        <aside className={styles.consoleAside}>
          <section><header><span><FileText size={15} /> 项目资料</span><button onClick={() => setNotice("资料上传入口已打开。演示环境不会上传真实文件。") }><Plus size={14} /></button></header>{["产品介绍 v2.pdf", "交互原型链接", "用户访谈摘要"].map((item, index) => <div className={styles.materialRow} key={item}><i>{["PDF", "URL", "DOC"][index]}</i><span><strong>{item}</strong><small>{index === 2 ? "待补充" : `${index + 2} 天前更新`}</small></span></div>)}<button className={styles.asideLink} onClick={() => setNotice("资料中心包含版本记录和阶段归档。")}>进入资料中心 <ArrowRight size={13} /></button></section>
          <section><header><span><MessageSquareText size={15} /> 最新反馈</span><small>2 条</small></header><article className={styles.feedback}><span>产品负责人 · 陈默</span><p>问题方向成立，但“协作成本”仍然过宽。请先聚焦到产品决策如何被遗漏。</p><small>今天 11:24</small></article><button className={styles.asideLink} onClick={() => setNotice("沟通中心包含评审意见、会议记录和阶段结论。")}>查看沟通记录 <ArrowRight size={13} /></button></section>
          <section><header><span><Users size={15} /> 项目成员</span><small>4 人</small></header>{[["你", "项目发起人"], ["陈默", "造场产品负责人"], ["周岑", "产品顾问"]].map(([name, role]) => <div className={styles.memberRow} key={name}><span><UserRound size={14} /></span><div><strong>{name}</strong><small>{role}</small></div></div>)}<Link className={styles.asideLink} href="/galaxy/apply">邀请团队成员 <ArrowRight size={13} /></Link></section>
        </aside>
      </div>

      {!stored && <section className={styles.demoNotice}><CircleAlert size={15} /><p>当前展示示例项目。提交新的产品信号后，这里会自动切换到你的项目。</p><Link href="/galaxy/apply">提交项目</Link></section>}
      <AnimatePresence>{notice && <motion.div className={styles.toast} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Check size={15} /><span>{notice}</span><button onClick={() => setNotice("")}>关闭</button></motion.div>}</AnimatePresence>
    </div>
  );
}
