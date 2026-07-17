import { adminAuditStatement, requireAdmin } from "../../_lib/admin";
import { database, jsonError } from "../../_lib/community";
import { hashInvitationCode } from "../../../oauth-session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const rows = await database().prepare(
      `SELECT id, label, max_uses AS maxUses, uses_count AS usesCount,
              expires_at AS expiresAt, revoked_at AS revokedAt,
              created_by AS createdBy, created_at AS createdAt,
              last_used_at AS lastUsedAt
       FROM invitation_codes ORDER BY created_at DESC LIMIT 100`,
    ).all();
    return Response.json({ invitations: rows.results });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const input = await request.json() as Record<string, unknown>;
    const label = String(input.label ?? "").trim().slice(0, 80);
    const maxUses = Math.floor(Number(input.maxUses));
    const expiresDays = Math.floor(Number(input.expiresDays));
    if (label.length < 2 || !Number.isInteger(maxUses) || maxUses < 1 || maxUses > 25
      || !Number.isInteger(expiresDays) || expiresDays < 1 || expiresDays > 90) {
      return Response.json({ error: "invalid_invitation" }, { status: 400 });
    }
    const code = generateInvitationCode();
    const codeHash = await hashInvitationCode(code);
    if (!codeHash) throw new Error("generated_invitation_invalid");
    const id = `invite:${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 19).replace("T", " ");
    const db = database();
    await db.batch([
      db.prepare(
        `INSERT INTO invitation_codes
         (id, code_hash, label, max_uses, expires_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(id, codeHash, label, maxUses, expiresAt, admin.email),
      adminAuditStatement(admin.email, "create_invitation", "invitation", id, `label=${label}; maxUses=${maxUses}; expiresAt=${expiresAt}`),
    ]);
    return Response.json({
      invitation: { id, code, label, maxUses, usesCount: 0, expiresAt, revokedAt: null },
    }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const input = await request.json() as Record<string, unknown>;
    const id = String(input.id ?? "").slice(0, 80);
    if (input.action !== "revoke" || !/^invite:[a-f0-9-]+$/.test(id)) {
      return Response.json({ error: "invalid_invitation_action" }, { status: 400 });
    }
    const active = await database().prepare(
      `SELECT id FROM invitation_codes WHERE id = ? AND revoked_at IS NULL`,
    ).bind(id).first();
    if (!active) return Response.json({ error: "invitation_not_found" }, { status: 404 });
    await database().batch([
      database().prepare(
        `UPDATE invitation_codes SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL`,
      ).bind(id),
      adminAuditStatement(admin.email, "revoke_invitation", "invitation", id),
    ]);
    return Response.json({ updated: true, id });
  } catch (error) {
    return jsonError(error);
  }
}

function generateInvitationCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `ZC-${Array.from(bytes, (value) => alphabet[value & 31]).join("")}`;
}
