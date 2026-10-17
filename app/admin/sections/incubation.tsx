"use client";

import { Save } from "lucide-react";
import type { Project } from "../admin-api";

export function IncubationSection({ projects, stages, onChange, onSave, busy }: {
  projects: Project[];
  stages: string[];
  onChange: (id: number, patch: Partial<Project>) => void;
  onSave: (project: Project) => void;
  busy: boolean;
}) {
  return <section className="admin-panel">
    <header className="admin-section-heading"><div><p className="admin-eyebrow">INCUBATION</p><h2>孵化项目</h2><p>更新项目阶段、负责人和下一步安排。</p></div></header>
    {projects.length ? <div className="admin-project-list">{projects.map((project) => <article className="admin-project" key={project.id}>
      <div className="admin-project-title"><strong>{project.name}</strong><small>{project.userEmail} · {project.updatedAt}</small></div>
      <label>阶段<select value={project.status} onChange={(event) => onChange(project.id, { status: event.target.value })}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></label>
      <label>负责人<input value={project.assignedOwner ?? ""} onChange={(event) => onChange(project.id, { assignedOwner: event.target.value })} /></label>
      <label>当前任务<input value={project.currentTask} onChange={(event) => onChange(project.id, { currentTask: event.target.value })} /></label>
      <label>下一步<input value={project.nextAction} onChange={(event) => onChange(project.id, { nextAction: event.target.value })} /></label>
      <label>等待原因<input value={project.waitingReason} onChange={(event) => onChange(project.id, { waitingReason: event.target.value })} /></label>
      <label>进度<input type="number" min={0} max={100} value={project.progressPercent} onChange={(event) => onChange(project.id, { progressPercent: Number(event.target.value) })} /></label>
      <button type="button" disabled={busy} onClick={() => onSave(project)}><Save size={14} /> 保存项目状态</button>
    </article>)}</div> : <p className="admin-empty-state">没有孵化项目</p>}
  </section>;
}
