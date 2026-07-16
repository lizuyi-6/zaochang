import type { Metadata } from "next";
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
  const member = user
    ? { signedIn: true, displayName: user.displayName, initial: (user.displayName.trim()[0] || "造").toUpperCase() }
    : { signedIn: false, displayName: "游客", initial: "游" };

  return (
    <html lang="zh-CN">
      <body>
        <SiteShell member={member}>{children}</SiteShell>
      </body>
    </html>
  );
}
