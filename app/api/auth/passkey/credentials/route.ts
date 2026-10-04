import { NextResponse } from "next/server";
import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";
import { listCredentials, splitTransports } from "../../../_lib/webauthn";

export const dynamic = "force-dynamic";

// 当前成员的通行密钥列表(设置页凭据管理用)。只暴露展示字段——public_key /
// user_handle 永不出服务端。
export async function GET() {
  try {
    const member = await requireMember();
    const rows = await listCredentials(member.email);
    return NextResponse.json({
      credentials: rows.map((row) => ({
        credential_id: row.credentialId,
        name: row.name,
        device_type: row.deviceType,
        backed_up: Boolean(row.backedUp),
        transports: splitTransports(row.transports),
        created_at: row.createdAt,
        last_used_at: row.lastUsedAt,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
