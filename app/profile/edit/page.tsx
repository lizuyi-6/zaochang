import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { database, ensureMember } from "../../api/_lib/community";
import { getChatGPTUser } from "../../chatgpt-auth";
import { ProfileEditForm } from "./profile-edit-form";

export const metadata: Metadata = { title: "编辑个人资料" };
export const dynamic = "force-dynamic";

export default async function ProfileEditPage() {
  const user = await getChatGPTUser();
  if (!user) redirect("/signin?return_to=%2Fprofile%2Fedit");
  const member = { ...user, initial: (user.displayName.trim()[0] || "造").toUpperCase() };
  await ensureMember(member);
  const profile = await database().prepare(
    "SELECT display_name AS displayName, bio, location, website FROM members WHERE email = ?",
  ).bind(user.email).first<{ displayName: string; bio: string; location: string; website: string }>();
  return <ProfileEditForm initial={profile ?? { displayName: user.displayName, bio: "正在把一个想法变成作品。", location: "杭州", website: "" }} />;
}
