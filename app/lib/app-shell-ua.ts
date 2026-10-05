// 造场安卓壳 UA 契约:壳 v1.2.2 起在 WebView UA 末尾追加 "ZaochangApp/<versionName>"
// (MainActivity createConfiguredWebView)。旧壳(v1.2.1 及更早)不带 token,
// 只有通用 WebView 特征段 "; wv)",无法区分具体版本——区分三态是为了让
// /app/version 页对旧壳说"升级后可见版本",而不是假装知道版本。
export type ShellUaInfo =
  | { kind: "shell"; versionName: string }
  | { kind: "legacy-shell" }
  | { kind: "browser" };

export function parseShellUserAgent(ua: string): ShellUaInfo {
  const match = /ZaochangApp\/([\w.-]+)/.exec(ua);
  if (match) return { kind: "shell", versionName: match[1] };
  if (/;\s*wv\)/i.test(ua)) return { kind: "legacy-shell" };
  return { kind: "browser" };
}

/** 逐段数值比较 "1.2.10" 式版本名:a<b 返回负数,a>b 返回正数。 */
export function compareVersionNames(a: string, b: string): number {
  const pa = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(pa.length, pb.length);
  for (let i = 0; i < length; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}
