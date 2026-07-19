"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, ChevronRight, CircleAlert, FileText, LogIn, MessageSquareText, Plus, Upload, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "../ecosystem.module.css";

const STAGES = ["提交申请", "资料审核", "初步沟通", "项目评估", "确认合作", "产品定位", "原型设计", "开发测试", "上线准备", "进入银河"];
type StoredProject = { id: number; name: string; projectType: string; oneLiner: string; status: string; currentTask: string; assignedOwner: string | null; nextAction: string; waitingReason: string; progressPercent: number; createdAt: string; updatedAt: string };
type Material = { id: number; name: string; url: string; kind: string; createdAt: string };
type Feedback = { id: number; kind: string; content: string; createdAt: string };
type DetailPanel = { title: string; eyebrow: string; body: string; items: string[]; action?: "upload" };

export function IncubationConsole({ signedIn }: { signedIn: boolean }) {
  const [project, setProject] = useState<StoredProject | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [detail, setDetail] = useState<DetailPanel | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!signedIn) return;
    fetch("/api/incubation", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => {
      const payload = data as { project?: StoredProject | null; materials?: Material[]; feedback?: Feedback[] } | null;
      setProject(payload?.project ?? null);
      setMaterials(payload?.materials ?? []);
      setFeedback(payload?.feedback ?? []);
    }).catch(() => setNotice("项目状态暂时无法读取，请刷新重试。"));
  }, [signedIn]);

  const stageIndex = project ? Math.max(0, STAGES.indexOf(project.status)) : -1;
  const timeline = useMemo(() => STAGES.map((name, index) => ({ name, state: index < stageIndex ? "完成" : index === stageIndex ? "进行中" : "未开始" })), [stageIndex]);
  const act = () => project ? uploadInputRef.current?.click() : setNotice("请先提交产品信号，再上传项目资料。");

  const uploadMaterial = async (file: File) => {
    if (!project) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file); form.set("visibility", "private");
      const upload = await fetch("/api/uploads", { method: "POST", body: form });
      if (!upload.ok) throw new Error("upload_failed");
      const fileData = await upload.json() as { name: string; url: string; type: string };
      const save = await fetch("/api/incubation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "add_material", projectId: project.id, name: fileData.name, url: fileData.url, kind: fileData.type.includes("pdf") ? "PDF" : fileData.type.startsWith("image/") ? "IMG" : "FILE" }) });
      if (!save.ok) throw new Error("save_failed");
      const data = await save.json() as { material: Material };
      setMaterials((items) => [data.material, ...items]);
      setProject((current) => current ? { ...current, currentTask: "等待造场核对新增资料", nextAction: "造场确认资料是否满足当前阶段要求", waitingReason: "新增资料已进入资料审核队列" } : current);
      setDetail(null);
      setNotice("资料已提交；阶段不会自动推进，造场审核后会明确更新。 ");
    } catch {
      setNotice("资料没有关联到项目，请检查文件后重试。");
    } finally {
      setUploading(false);
    }
  };

  const openStage = (index: number) => {
    const item = timeline[index];
    setDetail({ title: item.name, eyebrow: `ORBIT STAGE / ${String(index + 1).padStart(2, "0")}`, body: index === stageIndex ? project?.waitingReason ?? "等待状态更新" : index < stageIndex ? "该阶段已由造场运营人员明确更新为完成。" : "上一阶段形成结论后才会进入这里。", items: [`状态：${item.state}`, `负责人：${index === stageIndex ? project?.assignedOwner || "尚未分配" : "以阶段记录为准"}`, `更新时间：${project?.updatedAt || "尚无"}`, `完成条件：由运营人员在阶段反馈中说明`] });
  };

  if (!signedIn) return <div className={styles.consolePage}><section className={styles.demoNotice}><LogIn size={15} /><p>登录后查看项目孵化进度。阶段、当前任务、等待原因和项目资料只对本人开放。</p><Link href="/signin?return_to=%2Fgalaxy%2Fincubator">登录造场</Link></section></div>;
  if (!project) return <div className={styles.consolePage}><section className={styles.demoNotice}><CircleAlert size={15} /><p>当前账号还没有孵化项目。提交后才会生成真实项目轨道，不展示示例进度。</p><Link href="/galaxy/apply">提交项目</Link></section></div>;

  return <div className={styles.consolePage}>
    <section className={styles.consoleHero}>
      <div className={styles.consoleProject}><span>INCUBATION ORBIT / ZC-{String(project.id).padStart(6, "0")}</span><h1>{project.name}</h1><p>{project.oneLiner}</p><div><em>{project.projectType}</em><small>最近更新 · {project.updatedAt}</small></div></div>
      <div className={styles.consoleStage}><span>当前阶段</span><strong>{project.status}</strong><small>阶段 {stageIndex + 1} / {STAGES.length}</small></div>
      <div className={styles.progressDial} style={{ "--progress": `${project.progressPercent * 3.6}deg` } as React.CSSProperties}><div><strong>{project.progressPercent}%</strong><small>总体进度</small></div></div>
      <div className={styles.heroNext}><span>当前任务 · {project.assignedOwner ? "等待造场" : "等待分配"}</span><strong>{project.currentTask}</strong><button onClick={() => setDetail({ title: "为什么正在等待", eyebrow: "WAITING REASON", body: project.waitingReason, items: [`处理人：${project.assignedOwner || "尚未分配"}`, `下一步：${project.nextAction}`, `更新时间：${project.updatedAt}`] })}>查看等待原因 <ArrowRight size={14} /></button></div>
    </section>

    <section className={styles.nextAction}><div><span>现在需要</span><strong>{project.currentTask}</strong></div><div><span>为什么</span><p>{project.waitingReason}</p></div><div><span>完成后</span><p>{project.nextAction}</p></div><button onClick={act}><Upload size={16} /> 补充资料</button></section>

    <div className={styles.consoleLayout}><div className={styles.consoleMain}>
      <section className={styles.consoleSection}><header><div><span>ORBIT TIMELINE</span><h2>阶段轨道</h2></div><small>只显示后台确认过的状态</small></header><div className={styles.timeline}>{timeline.map((item, index) => <article key={item.name} data-state={item.state}><span>{item.state === "完成" ? <Check size={14} /> : index + 1}</span><div><strong>{item.name}</strong><small>{item.state}</small></div><p>{index === stageIndex ? project.assignedOwner || "尚未分配" : ""}</p><button aria-label={`查看${item.name}详情`} onClick={() => openStage(index)}><ChevronRight size={15} /></button></article>)}</div></section>
      <section className={styles.taskPanel}><header><div><span>CURRENT TASK</span><h2>{project.currentTask}</h2></div><em>{project.assignedOwner ? "等待造场" : "等待分配"}</em></header><div className={styles.taskSpec}><div><span>做什么</span><p>{project.currentTask}</p></div><div><span>为什么</span><p>{project.waitingReason}</p></div><div><span>提交什么</span><p>与当前任务直接相关的原型、文档、视频或验证记录</p></div><div><span>完成标准</span><p>{project.nextAction}</p></div></div><footer><span>状态更新时间：{project.updatedAt}</span><button onClick={act} disabled={uploading}><Upload size={15} /> {uploading ? "上传中" : "添加资料"}</button></footer></section>
    </div><aside className={styles.consoleAside}>
      <section><header><span><FileText size={15} /> 项目资料</span><button onClick={act} disabled={uploading} aria-label="添加项目资料"><Plus size={14} /></button></header>{materials.length ? materials.slice(0, 3).map((item) => <a className={styles.materialRow} key={item.id} href={item.url} target="_blank" rel="noreferrer"><i>{item.kind}</i><span><strong>{item.name}</strong><small>{item.createdAt}</small></span></a>) : <div className={styles.asideEmpty}>还没有项目资料</div>}<button className={styles.asideLink} onClick={() => setDetail({ title: "项目资料中心", eyebrow: "MATERIAL ARCHIVE", body: "文件仅对当前项目所有者与授权运营人员开放。", items: materials.map((item) => `${item.kind} · ${item.name} · ${item.createdAt}`), action: "upload" })}>查看全部资料 <ArrowRight size={13} /></button></section>
      <section><header><span><MessageSquareText size={15} /> 正式反馈</span><small>{feedback.length} 条</small></header>{feedback.length ? feedback.slice(0, 3).map((item) => <article className={styles.feedback} key={item.id}><span>{item.kind}</span><p>{item.content}</p><small>{item.createdAt}</small></article>) : <div className={styles.asideEmpty}>尚未产生正式反馈</div>}</section>
      <section><header><span><Users size={15} /> 项目成员</span><small>{project.assignedOwner ? "2 人" : "1 人"}</small></header><div className={styles.memberRow}><span><UserRound size={14} /></span><div><strong>你</strong><small>项目发起人</small></div></div><div className={styles.memberRow}><span><UserRound size={14} /></span><div><strong>{project.assignedOwner || "尚未分配"}</strong><small>造场负责人</small></div></div></section>
    </aside></div>

    <input ref={uploadInputRef} hidden type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.docx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadMaterial(file); event.currentTarget.value = ""; }} />
    <AnimatePresence>{detail && <motion.div className={styles.detailOverlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && setDetail(null)}><motion.section className={styles.detailPanel} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}><header><div><span>{detail.eyebrow}</span><h2>{detail.title}</h2></div><button onClick={() => setDetail(null)}>关闭</button></header><p>{detail.body}</p><div>{detail.items.length ? detail.items.map((item) => <article key={item}><Check size={13} /><span>{item}</span></article>) : <small>当前没有记录</small>}</div>{detail.action === "upload" && <footer><button onClick={act}><Upload size={15} /> 添加资料</button></footer>}</motion.section></motion.div>}</AnimatePresence>
    <AnimatePresence>{notice && <motion.div className={styles.toast} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Check size={15} /><span>{notice}</span><button onClick={() => setNotice("")}>关闭</button></motion.div>}</AnimatePresence>
  </div>;
}
