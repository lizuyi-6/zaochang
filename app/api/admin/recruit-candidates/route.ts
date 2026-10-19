// 见界创赛选拔候选人(admin/agent 机器通道 + 管理台「选拔」分区)。
// GET 列表;POST 建档(可选同时建个人进度令牌);PATCH 局部更新(环节推进/淘汰/备注)。
// 一人一行(email 唯一索引兜底,冲突回 409)。所有写操作记管理审计。
import { guardWrite } from "../../_lib/route-guards";
import { requireAdminOrAgent } from "../../_lib/access-control";
import { database, jsonError } from "../../_lib/community";
import { auditAdminAction } from "../../_lib/admin";
import { normalizeRecruitCandidateInput, normalizeRecruitCandidatePatch } from "../../_lib/recruit-candidates";
import { upsertMailStatus } from "../../_lib/mail-status-store";

export const dynamic = "force-dynamic";

type CandidateRow = {
  id: string; name: string; email: string; position: string; stage: string;
  statusToken: string | null; note: string; createdAt: string; updatedAt: string;
};

const SELECT_COLUMNS = `id, name, email, position, stage, status_token AS statusToken, note,
  created_at AS createdAt, updated_at AS updatedAt`;

export async function GET() {
  try {
    await requireAdminOrAgent();
    const rows = await database().prepare(
      `SELECT ${SELECT_COLUMNS} FROM recruit_candidates ORDER BY created_at DESC, id DESC LIMIT 500`,
    ).all<CandidateRow>();
    return Response.json({ candidates: rows.results ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const guarded = await guardWrite(request, {
      member: "adminOrAgent",
      sameOrigin: true,
      rate: { bucket: "recruit-candidates-write", limit: 120, windowSeconds: 60 * 60 },
    });
    if (guarded instanceof Response) return guarded;
    const actor = guarded.member;
    const input = await request.json().catch(() => ({})) as Record<string, unknown>;
    const normalized = normalizeRecruitCandidateInput(input);
    if (!normalized.ok) return Response.json({ error: normalized.error }, { status: 400 });
    const value = normalized.value;
    const id = crypto.randomUUID();
    // 可选:同时建个人进度令牌(E8 邮件实时块/进度页的能力 URL),令牌与候选人绑定。
    let statusToken: string | null = null;
    if (input.createStatusToken === true) {
      const status = await upsertMailStatus({
        label: `${value.name} · ${value.position}`,
        patch: {},
        actorEmail: actor.email,
      });
      statusToken = status.token;
    }
    try {
      await database().prepare(
        `INSERT INTO recruit_candidates (id, name, email, position, stage, status_token, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, value.name, value.email, value.position, value.stage, statusToken, value.note).run();
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        return Response.json({ error: "recruit_candidate_email_exists" }, { status: 409 });
      }
      throw error;
    }
    await auditAdminAction(actor.email, "recruit_candidate.create", "recruit_candidate", id, `${value.name} · ${value.email} · ${value.stage}`);
    const created = await database().prepare(`SELECT ${SELECT_COLUMNS} FROM recruit_candidates WHERE id = ?`).bind(id).first<CandidateRow>();
    return Response.json({ candidate: created }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const guarded = await guardWrite(request, {
      member: "adminOrAgent",
      sameOrigin: true,
      rate: { bucket: "recruit-candidates-write", limit: 120, windowSeconds: 60 * 60 },
    });
    if (guarded instanceof Response) return guarded;
    const actor = guarded.member;
    const input = await request.json().catch(() => ({})) as Record<string, unknown>;
    const id = typeof input.id === "string" ? input.id.trim() : "";
    if (!id) return Response.json({ error: "missing_id" }, { status: 400 });
    const normalized = normalizeRecruitCandidatePatch(input);
    if (!normalized.ok) return Response.json({ error: normalized.error }, { status: 400 });
    const patch = normalized.patch;
    const entries = Object.entries(patch);
    if (!entries.length) return Response.json({ error: "empty_patch" }, { status: 400 });
    const existing = await database().prepare(`SELECT id FROM recruit_candidates WHERE id = ?`).bind(id).first<{ id: string }>();
    if (!existing) return Response.json({ error: "recruit_candidate_not_found" }, { status: 404 });
    const columns: Record<string, string> = { name: "name", email: "email", position: "position", stage: "stage", note: "note", statusToken: "status_token" };
    const assignments = entries.map(([key]) => `${columns[key]} = ?`).join(", ");
    try {
      await database().prepare(
        `UPDATE recruit_candidates SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).bind(...entries.map(([, value]) => value), id).run();
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        return Response.json({ error: "recruit_candidate_email_exists" }, { status: 409 });
      }
      throw error;
    }
    const changedKeys = entries.map(([key]) => key).join(",");
    await auditAdminAction(actor.email, "recruit_candidate.update", "recruit_candidate", id, changedKeys);
    const updated = await database().prepare(`SELECT ${SELECT_COLUMNS} FROM recruit_candidates WHERE id = ?`).bind(id).first<CandidateRow>();
    return Response.json({ candidate: updated });
  } catch (error) {
    return jsonError(error);
  }
}
