// 展示格式化的单一事实来源。此前 zh-CN/Asia/Shanghai 的日期格式化在 home 页与
// feed 客户端各有一份逐字相同的实现;头像首字在 layout/profile 系页面重复三处。

// 时间戳 → "MM/DD HH:mm"(zh-CN,Asia/Shanghai)。SQLite 的 "YYYY-MM-DD HH:MM:SS"
// 视为 UTC(补 T + Z);非法/空值回原文或占位,不抛错。
export function formatZhDateTime(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "时间未记录";
  const parsed = new Date(raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(parsed);
}

// 头像首字(与 layout/profile/profile-edit 的既有表达式逐字同义):
// 取显示名首字符,空名回落 "造",统一转大写。
export function memberInitial(displayName: string): string {
  return (displayName.trim()[0] || "造").toUpperCase();
}
