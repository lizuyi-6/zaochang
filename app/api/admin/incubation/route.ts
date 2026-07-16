import { adminAuditStatement, requireAdmin } from "../../_lib/admin";
import { database, jsonError } from "../../_lib/community";

const STAGES = ["提交申请", "资料审核", "初步沟通", "项目评估", "确认合作", "产品定位", "原型设计", "开发测试", "上线准备", "进入银河"];

export async function GET() {
  try {
    await requireAdmin();
    const projects = await database().prepare(
      `SELECT id, user_email AS userEmail, name, project_type AS projectType, one_liner AS oneLiner,
              status, current_task AS currentTask, assigned_owner AS assignedOwner,
              next_action AS nextAction, waiting_reason AS waitingReason, progress_percent AS progressPercent,
              updated_at AS updatedAt FROM incubation_projects ORDER BY updated_at ASC LIMIT 100`,
    ).all();
    return Response.json({ projects: projects.results, stages: STAGES });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const input = await request.json() as Record<string, unknown>;
    const projectId = Number(input.projectId);
    const status = String(input.status ?? "");
    const currentTask = String(input.currentTask ?? "").trim().slice(0, 160);
    const assignedOwner = String(input.assignedOwner ?? "").trim().slice(0, 80) || null;
    const nextAction = String(input.nextAction ?? "").trim().slice(0, 200);
    const waitingReason = String(input.waitingReason ?? "").trim().slice(0, 300);
    const progressPercent = Math.max(0, Math.min(100, Math.floor(Number(input.progressPercent) || 0)));
    const feedback = String(input.feedback ?? "").trim().slice(0, 1000);
    if (!Number.isInteger(projectId) || !STAGES.includes(status) || !currentTask || !nextAction || !waitingReason) {
      return Response.json({ error: "invalid_incubation_update" }, { status: 400 });
    }
    const db = database();
    const statements = [db.prepare(
      `UPDATE incubation_projects SET status = ?, current_task = ?, assigned_owner = ?, next_action = ?,
       waiting_reason = ?, progress_percent = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).bind(status, currentTask, assignedOwner, nextAction, waitingReason, progressPercent, projectId)];
    if (feedback) statements.push(db.prepare(`INSERT INTO incubation_feedback (project_id, author_email, kind, content) VALUES (?, ?, 'stage_update', ?)`).bind(projectId, admin.email, feedback));
    statements.push(adminAuditStatement(admin.email, "update_incubation", "incubation_project", String(projectId), JSON.stringify({ status, progressPercent })));
    await db.batch(statements);
    return Response.json({ updated: true });
  } catch (error) {
    return jsonError(error);
  }
}
