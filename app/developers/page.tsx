import { Code2, KeyRound, LogIn } from "lucide-react";
import Link from "next/link";
import { getChatGPTUser } from "../chatgpt-auth";
import { DeveloperConsole } from "./developer-console";

export const dynamic = "force-dynamic";

export default async function DevelopersPage() {
  const user = await getChatGPTUser();
  if (!user) {
    return <div className="developers-page"><header className="route-hero developer-hero"><div><span className="deep-eyebrow"><Code2 size={14} /> ZAOCHANG IDENTITY PLATFORM</span><h1>让用户使用造场登录</h1><p>注册第三方应用，接入标准 OIDC，并在用户逐笔确认后使用果子支付 API。</p></div></header><section className="developer-signin"><KeyRound size={26} /><h2>登录后管理应用</h2><p>客户端密钥、回调地址和授权记录只对应用所有者可见。</p><Link href="/signin?return_to=%2Fdevelopers"><LogIn size={17} /> 登录造场</Link></section></div>;
  }
  return <DeveloperConsole />;
}
