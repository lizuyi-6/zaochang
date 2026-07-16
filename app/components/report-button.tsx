"use client";

import { Flag, X } from "lucide-react";
import { useState } from "react";

const REASONS = [["spam", "垃圾或刷量"], ["harassment", "骚扰或攻击"], ["copyright", "侵权"], ["privacy", "泄露隐私"], ["fraud", "欺诈或冒充"], ["other", "其他问题"]] as const;

export function ReportButton({ targetType, targetRef }: { targetType: "post" | "comment" | "product"; targetRef: string }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const report = async (reason: string) => {
    const response = await fetch("/api/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetType, targetRef, reason }) });
    if (response.status === 401) { window.location.assign(`/signin?return_to=${encodeURIComponent(window.location.pathname)}`); return; }
    setNotice(response.ok ? "举报已进入审核队列" : "举报未提交，请稍后重试");
    setOpen(false);
  };
  return <span className="report-control"><button type="button" onClick={() => setOpen((value) => !value)} aria-label="举报内容"><Flag size={13} /> 举报</button>{open && <span className="report-menu"><button type="button" onClick={() => setOpen(false)} aria-label="关闭举报菜单"><X size={12} /></button>{REASONS.map(([value, label]) => <button type="button" key={value} onClick={() => void report(value)}>{label}</button>)}</span>}{notice && <small>{notice}</small>}</span>;
}
