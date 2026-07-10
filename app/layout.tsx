import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "造场 | 创作者的试玩社区",
  description: "发布你的新作品，让真实用户试玩、讨论，并用站内果子支持创作。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "造场 | 创作者的试玩社区",
    description: "让每个小想法，都有人试玩。",
    type: "website",
    locale: "zh_CN",
  },
  twitter: {
    card: "summary",
    title: "造场 | 创作者的试玩社区",
    description: "让每个小想法，都有人试玩。",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
