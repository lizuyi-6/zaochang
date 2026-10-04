import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { database, ensureMember } from "../../api/_lib/community";
import { memberInitial } from "../../lib/format";
import { getChatGPTUser } from "../../chatgpt-auth";
import { listCredentials, splitTransports } from "../../api/_lib/webauthn";
import { ProfileEditForm } from "./profile-edit-form";
import { PasskeyManager, type PasskeyItem } from "./passkey-manager";

export const metadata: Metadata = { title: "编辑个人资料" };
export const dynamic = "force-dynamic";

export default async function ProfileEditPage() {
  const user = await getChatGPTUser();
  if (!user) redirect("/signin?return_to=%2Fprofile%2Fedit");
  const member = { ...user, initial: memberInitial(user.displayName) };
  await ensureMember(member);
  const [profile, passkeyRows] = await Promise.all([
    database().prepare(
      "SELECT display_name AS displayName, bio, location, website FROM members WHERE email = ?",
    ).bind(user.email).first<{ displayName: string; bio: string; location: string; website: string }>(),
    listCredentials(user.email),
  ]);
  const passkeys: PasskeyItem[] = passkeyRows.map((row) => ({
    credential_id: row.credentialId,
    name: row.name,
    device_type: row.deviceType,
    backed_up: Boolean(row.backedUp),
    transports: splitTransports(row.transports),
    created_at: row.createdAt,
    last_used_at: row.lastUsedAt,
  }));
  return (
    <div>
      <ProfileEditForm initial={profile ?? { displayName: user.displayName, bio: "正在把一个想法变成作品。", location: "杭州", website: "" }} />
      <PasskeyManager initial={passkeys} />
    </div>
  );
}
