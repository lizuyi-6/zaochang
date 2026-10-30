import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { env } from "cloudflare:workers";
import { database, ensureMember } from "../../api/_lib/community";
import { memberInitial } from "../../lib/format";
import { getChatGPTUser } from "../../chatgpt-auth";
import { listCredentials, splitTransports } from "../../api/_lib/webauthn";
import { listUserApiKeys } from "../../api/_lib/user-api-key";
import { resolvePublicAppOrigin } from "../../lib/public-origin";
import { IdentityEditor } from "./identity-editor";
import { ProfileEditForm } from "./profile-edit-form";
import { PasskeyManager, type PasskeyItem } from "./passkey-manager";
import { ApiKeyManager, type ApiKeyItem } from "./api-key-manager";

export const metadata: Metadata = { title: "编辑个人资料" };
export const dynamic = "force-dynamic";

export default async function ProfileEditPage() {
  const user = await getChatGPTUser();
  if (!user) redirect("/signin?return_to=%2Fprofile%2Fedit");
  const member = { ...user, initial: memberInitial(user.displayName) };
  await ensureMember(member);
  const requestHeaders = await headers();
  const values = env as unknown as Record<string, string | undefined>;
  const requestOrigin = `${requestHeaders.get("x-forwarded-proto")?.split(",")[0] ?? "http"}://${requestHeaders.get("host") ?? "localhost"}/`;
  const publicOrigin = resolvePublicAppOrigin(requestOrigin, values.APP_ENV, values.PUBLIC_APP_ORIGIN);
  const [profile, passkeyRows, apiKeyRows] = await Promise.all([
    database().prepare(
      "SELECT display_name AS displayName, bio, location, website, username FROM members WHERE email = ?",
    ).bind(user.email).first<{ displayName: string; bio: string; location: string; website: string; username: string | null }>(),
    listCredentials(user.email),
    user.authVia === "session" ? listUserApiKeys(user.email) : Promise.resolve([]),
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
  const apiKeys: ApiKeyItem[] = apiKeyRows;
  return (
    <div>
      <ProfileEditForm initial={profile ?? { displayName: user.displayName, bio: "正在把一个想法变成作品。", location: "杭州", website: "" }} />
      {user.authVia === "session" && <IdentityEditor initial={{ username: profile?.username ?? null, nickname: profile?.displayName ?? user.displayName }} />}
      <PasskeyManager initial={passkeys} />
      {user.authVia === "session" && <ApiKeyManager initial={apiKeys} publicOrigin={publicOrigin} />}
    </div>
  );
}
