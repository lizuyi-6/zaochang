// 见界会员兑换码域模块:管理端发放/列表/撤销与会员端兑换用例。
// 与 invitations 同纪律:库存只存 SHA-256,明文只在创建响应出现一次;
// 兑换是原子批次(扣次数 + 插授权 + 审计),UNIQUE(user_email, code_id) 拦同人重复。
import type { MemberIdentity } from "../access-control";
import { adminAuditStatement } from "../admin";
import { database } from "../community";
import { beijingToday, TIER_CONFIG } from "./credits";
import { hashInvitationCode } from "../../../oauth-session";

type RedeemTier = "PRO" | "MAX";

// 32 字符表(去易混淆的 0/O/1/I),与邀请码同 alphabet。HK- 前缀区分 ZC- 邀请码;
// hashInvitationCode 的归一化(去空格/全角转半角/大写)对生成原文是恒等变换。
export function generateRedeemCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `HK-${Array.from(bytes, (value) => alphabet[value & 31]).join("")}`;
}

// 与 invitation_codes 同款 UTC 台账格式(YYYY-MM-DD HH:MM:SS):同长度零填充,
// 与 CURRENT_TIMESTAMP 的字典序比较即时间比较。
function isoStampAt(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString().slice(0, 19).replace("T", " ");
}

export async function listRedeemCodes(): Promise<Response> {
  const rows = await database().prepare(
    `SELECT id, label, tier, duration_days AS durationDays,
            max_uses AS maxUses, uses_count AS usesCount,
            expires_at AS expiresAt, revoked_at AS revokedAt,
            created_by AS createdBy, created_at AS createdAt,
            last_used_at AS lastUsedAt
     FROM hk_redeem_codes ORDER BY created_at DESC LIMIT 100`,
  ).all();
  return Response.json({ codes: rows.results });
}

function invalidRedeemCode() {
  return Response.json({ error: "invalid_redeem_code" }, { status: 400 });
}

export async function createRedeemCodes(admin: MemberIdentity, input: Record<string, unknown>): Promise<Response> {
  const label = String(input.label ?? "").trim().slice(0, 80);
  const tier = String(input.tier ?? "");
  const rawDuration = input.durationDays;
  const durationDays = rawDuration === null || rawDuration === undefined || rawDuration === ""
    ? null
    : Math.floor(Number(rawDuration));
  const maxUses = Math.floor(Number(input.maxUses));
  const expiresDays = Math.floor(Number(input.expiresDays));
  const count = input.count === undefined ? 1 : Math.floor(Number(input.count));
  if ((tier !== "PRO" && tier !== "MAX")
    || (durationDays !== null && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650))
    || !Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100
    || !Number.isInteger(expiresDays) || expiresDays < 1 || expiresDays > 365
    || !Number.isInteger(count) || count < 1 || count > 20) {
    return invalidRedeemCode();
  }
  const expiresAt = isoStampAt(expiresDays * 24 * 60 * 60 * 1000);
  const db = database();
  const statements = [];
  const created: Array<{ id: string; code: string; label: string; tier: RedeemTier; durationDays: number | null; maxUses: number; usesCount: number; expiresAt: string; revokedAt: null }> = [];
  for (let i = 0; i < count; i++) {
    const code = generateRedeemCode();
    const codeHash = await hashInvitationCode(code);
    if (!codeHash) throw new Error("generated_redeem_code_invalid");
    const id = `hkcode:${crypto.randomUUID()}`;
    statements.push(
      db.prepare(
        `INSERT INTO hk_redeem_codes
         (id, code_hash, label, tier, duration_days, max_uses, expires_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, codeHash, label, tier, durationDays, maxUses, expiresAt, admin.email),
    );
    created.push({ id, code, label, tier, durationDays, maxUses, usesCount: 0, expiresAt, revokedAt: null });
  }
  statements.push(adminAuditStatement(
    admin.email,
    "hk_redeem_code.create",
    "hk_redeem_code",
    created[0].id,
    `label=${label}; tier=${tier}; durationDays=${durationDays ?? "permanent"}; maxUses=${maxUses}; expiresAt=${expiresAt}; count=${count}`,
  ));
  await db.batch(statements);
  return Response.json({ codes: created }, { status: 201 });
}

export async function revokeRedeemCode(admin: MemberIdentity, input: Record<string, unknown>): Promise<Response> {
  const id = String(input.id ?? "").slice(0, 80);
  const reason = String(input.reason ?? "").trim().slice(0, 500);
  if (input.action !== "revoke" || !/^hkcode:[a-f0-9-]+$/.test(id) || reason.length < 4) {
    return Response.json({ error: "invalid_redeem_code_action" }, { status: 400 });
  }
  const active = await database().prepare(
    `SELECT id FROM hk_redeem_codes WHERE id = ? AND revoked_at IS NULL`,
  ).bind(id).first();
  if (!active) return Response.json({ error: "redeem_code_not_found" }, { status: 404 });
  await database().batch([
    database().prepare(
      `UPDATE hk_redeem_codes SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL`,
    ).bind(id),
    // 撤码只拦未消耗的兑换;已发授权(hk_redeem_grants)不回收,审计里写明语义。
    adminAuditStatement(admin.email, "hk_redeem_code.revoke", "hk_redeem_code", id, `reason=${reason}; issued_grants_kept=true`),
  ]);
  return Response.json({ updated: true, id });
}

export async function redeemCodeForMember(member: MemberIdentity, rawCode: unknown): Promise<Response> {
  const codeHash = await hashInvitationCode(String(rawCode ?? "").trim());
  if (!codeHash) return Response.json({ error: "redeem_invalid" }, { status: 400 });
  const code = await database().prepare(
    `SELECT id, tier, duration_days AS durationDays, revoked_at AS revokedAt,
            max_uses AS maxUses, uses_count AS usesCount, expires_at AS expiresAt
     FROM hk_redeem_codes WHERE code_hash = ?`,
  ).bind(codeHash).first<{ id: string; tier: RedeemTier; durationDays: number | null; revokedAt: string | null; maxUses: number; usesCount: number; expiresAt: string }>();
  if (!code) return Response.json({ error: "redeem_invalid" }, { status: 400 });
  // 判定顺序:本人已兑换 → 409 先于可用性。单次码(max_uses=1)被本人兑完即用尽,
  // 若先判可用性会得到笼统的 400,持有授权的人反而看不出"你已经兑过了";
  // 已持有授权的条件下码的撤销/过期/用尽状态对本人不再是要紧信息。
  const existing = await database().prepare(
    `SELECT id FROM hk_redeem_grants WHERE user_email = ? AND code_id = ?`,
  ).bind(member.email, code.id).first();
  if (existing) return Response.json({ error: "redeem_already_used" }, { status: 409 });
  if (code.revokedAt || code.expiresAt <= new Date().toISOString().slice(0, 19).replace("T", " ")
    || code.usesCount >= code.maxUses) {
    return Response.json({ error: "redeem_unavailable" }, { status: 400 });
  }

  // 授权到期从兑换时刻起算;永久码(NULL duration_days)授权不过期。
  const grantExpiresAt = code.durationDays === null ? null : isoStampAt(code.durationDays * 24 * 60 * 60 * 1000);
  const grantId = `hkgrant:${crypto.randomUUID()}`;
  const db = database();
  try {
    await db.batch([
      // 条件扣次数:撤销/过期/用尽在并发下也只有一个赢家,其余整批回滚。
      db.prepare(
        `UPDATE hk_redeem_codes SET uses_count = uses_count + 1, last_used_at = CURRENT_TIMESTAMP
         WHERE id = ? AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP AND uses_count < max_uses`,
      ).bind(code.id),
      db.prepare(
        `INSERT INTO hk_redeem_grants (id, user_email, code_id, tier, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(grantId, member.email, code.id, code.tier, grantExpiresAt),
      // 升档当日即享当日额度:把今日余额抬到新档上限(只升不降——从没刷过积分
      // 的行不存在,由下一次 currentCredits 的懒重置直接建满额行)。这修的是
      // "今天早上查过一次余额(FREE 20)、下午兑换后仍显示 20"的割裂——
      // 会员权益属于兑换当天,不属于下个北京日界。
      db.prepare(
        `UPDATE hk_credits SET balance = max(balance, ?), updated_at = CURRENT_TIMESTAMP
         WHERE user_email = ? AND reset_date = ?`,
      ).bind(TIER_CONFIG[code.tier].maxCredits, member.email, beijingToday()),
      adminAuditStatement(
        member.email,
        "hk_redeem_code.redeem",
        "hk_redeem_code",
        code.id,
        `email=${member.email}; tier=${code.tier}; expiresAt=${grantExpiresAt ?? "permanent"}`,
      ),
    ]);
  } catch (error) {
    // batch 是事务:UNIQUE(user_email, code_id) 命中时上面的扣次数一并回滚。
    const raced = await database().prepare(
      `SELECT id FROM hk_redeem_grants WHERE user_email = ? AND code_id = ?`,
    ).bind(member.email, code.id).first();
    if (raced) return Response.json({ error: "redeem_already_used" }, { status: 409 });
    throw error;
  }
  return Response.json({ tier: code.tier, expiresAt: grantExpiresAt });
}
