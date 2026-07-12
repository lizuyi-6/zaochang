"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CalendarDays, Check, ChevronRight, CircleAlert, Clock3, FileText, MessageSquareText, Plus, Upload, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "../ecosystem.module.css";

type StoredProject = { id?: number; name?: string; projectType?: string; oneLiner?: string; need?: string; status?: string; currentTask?: string; submittedAt?: string };
type Material = { id: number; name: string; url: string; kind: string; createdAt: string };
type DetailPanel = { title: string; eyebrow: string; body: string; items: string[]; action?: "upload" };

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
  const [materials, setMaterials] = useState<Material[]>([]);
  const [uploading, setUploading] = useState(false);
  const [detail, setDetail] = useState<DetailPanel | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/incubation", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => {
      if (!active) return;
      const payload = data as { project?: StoredProject | null; materials?: Material[] } | null;
      if (payload?.project) setStored(payload.project);
      const loadedMaterials = payload?.materials ?? [];
      setMaterials(loadedMaterials);
      setSubmitted(loadedMaterials.length > 0 || payload?.project?.status === "项目评估");
      if (!payload?.project) {
        const raw = localStorage.getItem("zaochang-incubation-project");
        if (raw) try { setStored(JSON.parse(raw) as StoredProject); } catch { localStorage.removeItem("zaochang-incubation-project"); }
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const projectName = stored?.name || "尚未提交项目";
  const progress = submitted ? 42 : stored?.id ? 35 : 0;
  const currentState = submitted ? "等待造场" : stored?.id ? "等待用户" : "尚未提交";

  const act = () => {
    if (!stored?.id) { setNotice("请先提交产品信号，再上传项目资料。"); return; }
    uploadInputRef.current?.click();
  };

  const uploadMaterial = async (file: File) => {
    if (!stored?.id) return;
    setUploading(true);
    try {
      const form = new FormData(); form.set("file", file); form.set("visibility", "private");
      const upload = await fetch("/api/uploads", { method: "POST", body: form });
      if (!upload.ok) { setNotice("文件上传失败。支持 PNG、JPG、WebP、PDF、TXT、DOCX，最大 10MB。"); return; }
      const fileData = await upload.json() as { name: string; url: string; type: string };
      const save = await fetch("/api/incubation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "add_material", projectId: stored.id, name: fileData.name, url: fileData.url, kind: fileData.type.includes("pdf") ? "PDF" : fileData.type.startsWith("image/") ? "IMG" : "FILE" }) });
      if (save.ok) { const data = await save.json() as { material: Material }; setMaterials((current) => [data.material, ...current]); setStored((current) => current ? { ...current, status: "项目评估", currentTask: "等待产品评估意见" } : current); setSubmitted(true); setDetail(null); setNotice("资料已上传并提交，负责人将在 2 个工作日内更新评估意见。"); }
      else setNotice("文件已上传，但未能关联到当前项目，请重试。");
    } catch { setNotice("网络中断，文件未提交。请重新选择文件。"); }
    finally { setUploading(false); }
  };

  const openStage = (item: (typeof timeline)[number], index: number) => setDetail({ title: item.name, eyebrow: `ORBIT STAGE / ${String(index + 1).padStart(2, "0")}`, body: !stored?.id ? "项目提交后，这个阶段会显示负责人、完成条件、处理时间和等待原因。" : index < 3 ? "这个阶段的材料与结论已经记录，可以在反馈中心回看。" : index === 3 ? (submitted ? "资料已交由产品负责人评估。当前不需要重复提交，阶段结论会在预计时间内更新。" : "提交目标用户画像后，产品负责人会据此判断问题边界与首轮验证对象。") : "前一阶段形成明确结论后才会进入这里，避免项目在目标不清时直接消耗开发资源。", items: !stored?.id ? ["状态：未开始", "负责人：待项目提交后分配", "时间：待排期", "完成条件：由前一阶段结论确定"] : [`状态：${index === 3 && submitted ? "等待造场" : item.state}`, `负责人：${item.owner}`, `时间：${item.date}`, `完成条件：${index < 3 ? "阶段结论已归档" : index === 3 ? "产品定位边界与验证计划明确" : "由上一阶段结论触发"}`] });

  return (
    <div className={styles.consolePage}>
      <section className={styles.consoleHero}>
        <div className={styles.consoleProject}><span>{stored?.id ? `INCUBATION ORBIT / ZC-${String(stored.id).padStart(6, "0")}` : "INCUBATION ORBIT / WAITING SIGNAL"}</span><h1>{projectName}</h1><p>{stored?.oneLiner || "发射产品信号后，这里会生成属于你的阶段轨道、当前任务与下一步行动。"}</p><div><em>{stored?.projectType || "等待产品信号"}</em><small>{stored?.id ? "项目资料已与当前账号关联" : "尚无更新时间"}</small></div></div>
        <div className={styles.consoleStage}><span>当前阶段</span><strong>{stored?.status || "等待提交"}</strong><small>{stored?.id ? "阶段 4 / 8 · 项目评估" : "提交产品信号后生成轨道"}</small></div>
        <div className={styles.progressDial} style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><div><strong>{progress}%</strong><small>总体进度</small></div></div>
        <div className={styles.heroNext}><span>当前任务 · {currentState}</span><strong>{stored?.currentTask || (stored?.id ? "补充目标用户画像" : "提交项目申请")}</strong>{stored?.id ? <button onClick={submitted ? () => setDetail({ title: "为什么正在等待", eyebrow: "WAITING REASON", body: "资料已经进入产品评估队列。为避免重复意见，目前由同一位负责人集中判断定位边界。", items: ["处理人：产品负责人 · 陈默", "预计反馈：2 个工作日内", "你现在需要：保持联系方式畅通", "完成后：安排产品定位会"] }) : act}>{submitted ? "查看等待原因" : "继续任务"} <ArrowRight size={14} /></button> : <Link href="/galaxy/apply">发射产品信号 <ArrowRight size={14} /></Link>}</div>
      </section>

      <section className={styles.nextAction}>
        <div><span>现在需要</span><strong>{!stored?.id ? "说明项目解决的问题、当前进度与需要的支持" : submitted ? "等待产品负责人完成需求评估" : "补充 3 类目标用户画像与真实使用场景"}</strong></div><div><span>为什么</span><p>{!stored?.id ? "用于判断信号应进入哪条产品赛道与评估轨道。" : submitted ? "确认项目的定位边界与本轮孵化目标。" : "用于判断核心问题是否足够具体，以及首轮验证应邀请哪些用户。"}</p></div><div><span>完成后</span><p>{!stored?.id ? "生成项目编号、阶段轨道与第一个明确任务。" : submitted ? "安排产品定位会，确认合作方式。" : "进入项目评估结论与产品定位会。"}</p></div>{stored?.id ? <button onClick={submitted ? () => setDetail({ title: "当前处理进度", eyebrow: "PROCESS STATUS", body: "项目当前处于产品评估阶段。", items: ["资料已接收", "负责人正在形成评估结论", "预计 2 个工作日内更新"] }) : act}>{submitted ? <Clock3 size={16} /> : <Upload size={16} />}{submitted ? "查看处理进度" : "提交用户画像"}</button> : <Link href="/galaxy/apply">开始申请 <ArrowRight size={14} /></Link>}
      </section>

      <div className={styles.consoleLayout}>
        <div className={styles.consoleMain}>
          <section className={styles.consoleSection}>
            <header><div><span>ORBIT TIMELINE</span><h2>阶段轨道</h2></div><small>每一步都有负责人和完成条件</small></header>
            <div className={styles.timeline}>{timeline.map((item, index) => { const state = !stored?.id ? "未开始" : index === 3 && submitted ? "等待造场" : item.state; return <article key={item.name} data-state={state}><span>{state === "完成" ? <Check size={14} /> : index + 1}</span><div><strong>{item.name}</strong><small>{state} · {stored?.id ? item.date : "待提交"}</small></div><p>{stored?.id ? item.owner : "待确认"}</p><button aria-label={`查看${item.name}详情`} onClick={() => openStage(item, index)}><ChevronRight size={15} /></button></article>; })}</div>
          </section>

          <section className={styles.taskPanel}>
            <header><div><span>CURRENT TASK / 01</span><h2>{!stored?.id ? "提交项目申请" : submitted ? "资料已进入评估" : "补充目标用户画像"}</h2></div><em>{currentState}</em></header>
            <div className={styles.taskSpec}><div><span>做什么</span><p>{!stored?.id ? "说明项目类型、核心问题、当前进度、团队情况与联系方式。" : submitted ? "暂时无需操作。保持联系方式畅通。" : "描述 3 类最可能使用产品的人，以及他们在什么场景下遇到这个问题。"}</p></div><div><span>如何完成</span><p>{!stored?.id ? "完成四步产品信号表单，提交前可返回修改。" : submitted ? "负责人将在控制台更新评估意见。" : "使用画像模板，每类用户至少附一个可验证的真实场景。"}</p></div><div><span>提交什么</span><p>{!stored?.id ? "项目介绍、问题描述与可联系信息" : submitted ? "无需新增材料" : "用户画像文档，PDF / DOCX / 在线文档均可"}</p></div><div><span>完成标准</span><p>{!stored?.id ? "所有必填信息通过校验并生成项目编号" : submitted ? "产品负责人给出阶段结论" : "用户、触发场景、现有替代方案和付出成本均明确"}</p></div></div>
            <footer><span><CalendarDays size={14} /> {!stored?.id ? "提交后生成首个任务时限" : submitted ? "预计反馈：2 个工作日内" : "截止：07 月 16 日 18:00"}</span>{stored?.id ? <button onClick={act} disabled={submitted || uploading}>{submitted ? <Check size={15} /> : <Upload size={15} />}{submitted ? "已经提交" : uploading ? "上传中" : "上传并提交"}</button> : <Link href="/galaxy/apply">提交项目申请</Link>}</footer>
          </section>
        </div>

        <aside className={styles.consoleAside}>
          <section><header><span><FileText size={15} /> 项目资料</span><button onClick={act} disabled={uploading} aria-label="添加项目资料"><Plus size={14} /></button></header>{materials.length ? materials.slice(0, 3).map((item) => <a className={styles.materialRow} key={item.id} href={item.url} target="_blank" rel="noreferrer"><i>{item.kind}</i><span><strong>{item.name}</strong><small>{item.createdAt}</small></span></a>) : <div className={styles.asideEmpty}>还没有项目资料</div>}<button className={styles.asideLink} onClick={() => setDetail({ title: "项目资料中心", eyebrow: "MATERIAL ARCHIVE", body: materials.length ? "这些文件仅对当前项目所有者开放。" : "上传用户画像、原型、演示或技术资料，帮助负责人完成项目评估。", items: materials.map((item) => `${item.kind} · ${item.name} · ${item.createdAt}`), action: "upload" })}>查看全部资料 <ArrowRight size={13} /></button></section>
          <section><header><span><MessageSquareText size={15} /> 最新反馈</span><small>{stored?.id ? (submitted ? "等待更新" : "0 条") : "示例"}</small></header>{stored?.id ? <article className={styles.feedback}><span>{submitted ? "产品负责人 · 评估中" : "尚未分配负责人"}</span><p>{submitted ? "资料已收到。首轮反馈会明确问题边界、验证对象与下一步会议安排。" : "提交当前任务资料后，评审意见会显示在这里。"}</p><small>{submitted ? "预计 2 个工作日内" : "等待用户提交"}</small></article> : <article className={styles.feedback}><span>示例反馈</span><p>真实项目提交后，这里只显示与你的项目有关的评审意见。</p><small>演示内容</small></article>}<button className={styles.asideLink} onClick={() => setDetail({ title: "沟通与反馈", eyebrow: "REVIEW LOG", body: submitted ? "评估进行中。所有阶段结论与会议记录都会按时间保存在这里。" : "当前还没有正式反馈。提交资料后，负责人会在这里说明结论与理由。", items: submitted ? ["资料接收 · 系统 · 今天", "需求评估 · 产品负责人 · 进行中", "定位会议 · 等待评估结论"] : ["尚未生成反馈记录"] })}>查看沟通记录 <ArrowRight size={13} /></button></section>
          <section><header><span><Users size={15} /> 项目成员</span><small>{stored?.id ? "1 人" : "示例"}</small></header>{(stored?.id ? [["你", "项目发起人"], ["待分配", "造场产品负责人"], ["待分配", "产品顾问"]] : [["你", "项目发起人"], ["造场", "等待项目提交"]]).map(([name, role], index) => <div className={styles.memberRow} key={`${name}-${index}`}><span><UserRound size={14} /></span><div><strong>{name}</strong><small>{role}</small></div></div>)}<small className={styles.asideHint}>确认合作方式后开放团队协作席位</small></section>
        </aside>
      </div>

      <input ref={uploadInputRef} hidden type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.docx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadMaterial(file); event.currentTarget.value = ""; }} />
      {!stored && <section className={styles.demoNotice}><CircleAlert size={15} /><p>当前账号还没有孵化项目。提交产品信号后，这里会生成真实项目轨道。</p><Link href="/galaxy/apply">提交项目</Link></section>}
      <AnimatePresence>{detail && <motion.div className={styles.detailOverlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && setDetail(null)}><motion.section className={styles.detailPanel} initial={{ opacity: 0, y: 18, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}><header><div><span>{detail.eyebrow}</span><h2>{detail.title}</h2></div><button onClick={() => setDetail(null)} aria-label="关闭">关闭</button></header><p>{detail.body}</p><div>{detail.items.length ? detail.items.map((item) => <article key={item}><Check size={13} /><span>{item}</span></article>) : <small>当前没有记录</small>}</div>{detail.action === "upload" && <footer><button onClick={act} disabled={uploading}><Upload size={15} /> {uploading ? "上传中" : "添加资料"}</button></footer>}</motion.section></motion.div>}</AnimatePresence>
      <AnimatePresence>{notice && <motion.div className={styles.toast} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Check size={15} /><span>{notice}</span><button onClick={() => setNotice("")}>关闭</button></motion.div>}</AnimatePresence>
    </div>
  );
}
