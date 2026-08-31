import type { Metadata } from "next";
import { isAdminEmail, isFounderEmail } from "./api/_lib/access-control";
import { database } from "./api/_lib/community";
import { memberInitial } from "./lib/format";
import { getChatGPTUser } from "./chatgpt-auth";
import { SiteShell } from "./components/site-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "造场 | 创作者的试玩社区", template: "%s | 造场" },
  description: "发布你的新作品，让真实用户试玩、讨论，并用站内果子支持创作。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { title: "造场 | 创作者的试玩社区", description: "让每个小想法，都有人试玩。", type: "website", locale: "zh_CN" },
  twitter: { card: "summary", title: "造场 | 创作者的试玩社区", description: "让每个小想法，都有人试玩。" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getChatGPTUser();
  let memberNumber: number | null = null;
  if (user) {
    // session 建立时 ensureMember 已写入 member 行;此处轻量主键查询取会员号供导航显示。
    const row = await database().prepare("SELECT member_number AS memberNumber FROM members WHERE email = ?").bind(user.email).first<{ memberNumber: number | null }>();
    memberNumber = row?.memberNumber ?? null;
  }
  const member = user
    ? {
        signedIn: true,
        // email 作为站壳会话键:signedIn 布尔无法区分同页账户 A→B 切换,
        // 站壳 effect 依赖它做账户级数据隔离(仅本人邮箱,非新增信息暴露)。
        email: user.email,
        displayName: user.displayName,
        initial: memberInitial(user.displayName),
        isAdmin: isAdminEmail(user.email),
        isFounder: isFounderEmail(user.email),
        memberNumber,
      }
    : { signedIn: false, email: null, displayName: "游客", initial: "游", isAdmin: false, isFounder: false, memberNumber: null };

  return (
    <html lang="zh-CN">
      <body>
        <SiteShell member={member}>{children}</SiteShell>
      </body>
    </html>
  );
}
