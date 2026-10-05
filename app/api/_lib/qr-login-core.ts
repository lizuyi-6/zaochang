// 扫码登录纯判定层(零依赖,测试直连——与 webauthn-core 同纪律)。
// 两个方向共用 token/URL 机制,以路径区分:
// - 正向(手机已登录 → 电脑未登录):QR 内容 /signin/qr/<token>,手机确认页;
// - 反向(电脑已登录 → 手机未登录):QR 内容 /signin/qr-pair/<token>,手机配对页,
//   多两道验证:6 位配对码(接近性)+ 桌面端显式允许(设备主人在场)。
// QR URL 解析、token 形态、发起端标签构造都在这里;IO(D1/限流/会话签发)在
// qr-login.ts。安全要点:desktopLabel 只由白名单词拼出,绝不透传 UA 子串;
// parseQrLoginUrl 只接受本站 origin + 固定路径形态,扫一扫拿到的任何其它
// 内容一律拒绝导航。

/** QR 会话有效期:两分钟内有效,过期桌面端自动换新码。 */
export const QR_LOGIN_TTL_SECONDS = 120;

/** randomToken(32) 的 base64url 形态(43 字符),token 本体只出现在 QR 与页面 URL。 */
export const QR_LOGIN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const QR_CONFIRM_PATH_PATTERN = /^\/signin\/qr\/([A-Za-z0-9_-]{43})\/?$/;
export const QR_PAIR_PATH_PATTERN = /^\/signin\/qr-pair\/([A-Za-z0-9_-]{43})\/?$/;

/** 反向配对码:6 位数字,存 SHA-256;错 PAIR_ATTEMPTS_LIMIT 次整行作废。 */
export const QR_PAIR_CODE_PATTERN = /^\d{6}$/;
export const QR_PAIR_ATTEMPTS_LIMIT = 5;

export type QrLoginKind = "confirm" | "pair";

/**
 * 扫一扫得到的原始内容 → 方向 + token。仅接受与当前站点完全同源(protocol +
 * host)的两类登录链接;其它 URL(外站、scheme 注入、文本)一律 null。
 * expectedOrigin 传 location.origin(同源判定,本地 http 预览也能走通)。
 */
export function parseQrLoginUrl(raw: string, expectedOrigin: string): { kind: QrLoginKind; token: string } | null {
  let url: URL;
  let expected: URL;
  try {
    url = new URL(raw);
    expected = new URL(expectedOrigin);
  } catch {
    return null;
  }
  if (url.protocol !== expected.protocol) return null;
  if (url.host.toLowerCase() !== expected.host.toLowerCase()) return null;
  const confirm = QR_CONFIRM_PATH_PATTERN.exec(url.pathname);
  if (confirm) return { kind: "confirm", token: confirm[1] };
  const pair = QR_PAIR_PATH_PATTERN.exec(url.pathname);
  if (pair) return { kind: "pair", token: pair[1] };
  return null;
}

/**
 * 桌面端发起标签:浏览器/平台粗粒度词,只由固定词表拼出(UA 不入库不透传),
 * 供手机确认页核对"我在给什么设备登录"。
 */
export function desktopLabelFromUserAgent(ua: string | null | undefined): string {
  if (!ua) return "桌面端";
  const browser = ua.includes("Edg/")
    ? "Edge"
    : ua.includes("Chromium")
      ? "Chromium"
      : /\bChrome\//.test(ua)
        ? "Chrome"
        : /\bFirefox\//.test(ua)
          ? "Firefox"
          : /\bSafari\//.test(ua) && /\bVersion\//.test(ua)
            ? "Safari"
            : "浏览器";
  const platform = /\bWindows NT\b/.test(ua)
    ? "Windows"
    : /\bMac OS X\b/.test(ua)
      ? "macOS"
      : /\bAndroid\b/.test(ua)
        ? "Android"
        : /\b(iPhone|iPad|iPod)\b/.test(ua)
          ? "iOS"
          : /\bLinux\b/.test(ua)
            ? "Linux"
            : "";
  return platform ? `${browser} · ${platform}` : browser;
}

/** 6 位配对码展示形态:3 + 3 分组。 */
export function formatPairCode(code: string): string {
  return QR_PAIR_CODE_PATTERN.test(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}
