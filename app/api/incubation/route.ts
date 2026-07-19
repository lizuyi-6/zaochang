import { env } from "cloudflare:workers";
import { database, jsonError, requireMember } from "../_lib/community";
import { enforceRateLimit, rateLimitKey } from "../_lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const member = await requireMember();
    const project = await database().prepare(
      `SELECT id, name, project_type AS projectType, one_liner AS oneLiner,
              problem, progress, team, need, contact, status,
              current_task AS currentTask, assigned_owner AS assignedOwner,
              next_action AS nextAction, waiting_reason AS waitingReason,
              progress_percent AS progressPercent, created_at AS createdAt,
              updated_at AS updatedAt
       FROM incubation_projects WHERE user_email = ?
       ORDER BY updated_at DESC, id DESC LIMIT 1`,
    ).bind(member.email).first();
    const materials = project && typeof project.id === "number" ? (await database().prepare(
      `SELECT id, name, url, kind, created_at AS createdAt
       FROM project_materials WHERE project_id = ? AND user_email = ?
       ORDER BY created_at DESC, id DESC`,
    ).bind(project.id, member.email).all()).results : [];
    const feedback = project && typeof project.id === "number" ? (await database().prepare(
      `SELECT id, kind, content, created_at AS createdAt FROM incubation_feedback
       WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`,
    ).bind(project.id).all()).results : [];
    return Response.json({ project, materials, feedback });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    await enforceRateLimit(await rateLimitKey("incubation-write", member.email), 30, 24 * 60 * 60);
    const input = await request.json() as Record<string, unknown>;
    if (input.action === "add_material") {
      const projectId = Number(input.projectId);
      const name = String(input.name ?? "").trim().slice(0, 120);
      const url = String(input.url ?? "").trim().slice(0, 500);
      const kind = String(input.kind ?? "FILE").trim().slice(0, 12) || "FILE";
      if (!Number.isInteger(projectId) || !name || !url.startsWith("/api/uploads/")) return Response.json({ error: "invalid_material" }, { status: 400 });
      const key = decodeURIComponent(url.slice("/api/uploads/".length));
      if (!/^[a-f0-9-]+(?:\.[a-zA-Z0-9]{1,8})?$/.test(key)) return Response.json({ error: "invalid_material" }, { status: 400 });
      const bucket = (env as unknown as { UPLOADS?: R2Bucket }).UPLOADS;
      if (!bucket) return Response.json({ error: "uploads_unavailable" }, { status: 503 });
      const object = await bucket.head(key);
      const upload = await database().prepare(
        `SELECT owner_email AS owner, visibility, purpose, scan_status AS scanStatus, sha256
         FROM uploaded_files WHERE key = ?`,
      ).bind(key).first<{ owner: string; visibility: string; purpose: string; scanStatus: string; sha256: string }>();
      if (!object || !upload || upload.owner !== member.email) {
        return Response.json({ error: "material_not_owned" }, { status: 403 });
      }
      if (upload.scanStatus !== "clean"
        || object.customMetadata?.scanStatus !== "clean"
        || object.customMetadata?.sha256 !== upload.sha256
        || upload.visibility !== "private"
        || upload.purpose !== "incubation_material") {
        return Response.json({ error: "material_not_scanned" }, { status: 409 });
      }
      const project = await database().prepare("SELECT id FROM incubation_projects WHERE id = ? AND user_email = ?").bind(projectId, member.email).first();
      if (!project) return Response.json({ error: "project_not_found" }, { status: 404 });
      const material = await database().prepare(
        `INSERT INTO project_materials (project_id, user_email, name, url, kind)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id, name, url, kind, created_at AS createdAt`,
      ).bind(projectId, member.email, name, url, kind).first();
      await database().prepare(
        `UPDATE incubation_projects
         SET current_task = '等待造场核对新增资料',
             next_action = '造场确认资料是否满足当前阶段要求',
             waiting_reason = '新增资料已进入资料审核队列',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_email = ?`,
      ).bind(projectId, member.email).run();
      return Response.json({ material }, { status: 201 });
    }
    const fields = {
      name: String(input.name ?? "").trim().slice(0, 32),
      projectType: String(input.projectType ?? "").trim().slice(0, 32),
      oneLiner: String(input.oneLiner ?? "").trim().slice(0, 100),
      problem: String(input.problem ?? "").trim().slice(0, 240),
      progress: String(input.progress ?? "").trim().slice(0, 60),
      team: String(input.team ?? "").trim().slice(0, 60),
      need: String(input.need ?? "").trim().slice(0, 80),
      contact: String(input.contact ?? "").trim().slice(0, 100),
    };
    if (fields.name.length < 2 || fields.oneLiner.length < 10 || fields.problem.length < 10 || fields.contact.length < 5) {
      return Response.json({ error: "invalid_project" }, { status: 400 });
    }
    const project = await database().prepare(
      `INSERT INTO incubation_projects
       (user_email, name, project_type, one_liner, problem, progress, team, need, contact,
        status, current_task, next_action, waiting_reason, progress_percent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '资料审核', '等待造场完成资料审核',
               '造场确认申请资料并说明下一步', '申请已进入资料审核队列', 12)
       RETURNING id, name, project_type AS projectType, status,
                 current_task AS currentTask, created_at AS createdAt`,
    ).bind(member.email, fields.name, fields.projectType, fields.oneLiner, fields.problem, fields.progress, fields.team, fields.need, fields.contact).first();
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
