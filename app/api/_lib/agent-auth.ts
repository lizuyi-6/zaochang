// Agent 服务账户:非人类主体,以 Bearer token 认证(类似 MCP 的机器控制通道)。
// 与人类身份(GitHub OAuth)平行:不进 members 表的常规流程,不继承 founder/admin,
// 能力由下面的 AGENT_WRITE_CAPABILITIES 硬编码白名单决定(单一全局 token → 全 scope)。
//
// 安全模型:
//  - token 未配置(ZAOCHANG_AGENT_TOKEN 为空)→ 本模块识别永不命中,零行为变化。
//  - token 配置后 → agent GET 全通(read);非 GET 必须命中能力表(写表 ∪ 管理表),
//    否则 worker 入口 403 fail-closed。DELETE/财务/上传/oauth 一律不在表内 → 永远拦。
//  - agent 写操作走完全相同的业务代码路径,所有 SQLite trigger 不变量照常生效。
//  - agent 的系统 member 行由 requireMember 惰性创建(见 community.ts ensureAgentMember),
//    member_number=0(显式非 NULL → 赋号 trigger 跳过,不占会员号序列)。

export const AGENT_EMAIL = "agent@zaochang";
export const AGENT_DISPLAY_NAME = "造场 Agent";

// Agent 能力表:agent 非 GET 请求的 pathname+method 必须精确命中其一才放行。
// 这是 agent 权限的唯一事实来源(worker/index.ts 据此 fail-closed)。
//   - /api/docs POST/PATCH:创建/编辑文档与书(DELETE 不含 —— 不可逆,人类专属)
//   - /api/docs/cover:不在表内(封面走上传扫描管道,单独复杂度,暂不给 agent)
//   - /api/products POST:创建产品(硬编码 pending_review,review gate 照常)
//   - 财务(/api/payments, /api/v1/fruit/*)、uploads、oauth、社交动作:全不在表内
//   - 管理操作(/api/admin/*):单独走下方 AGENT_ADMIN_CAPABILITIES(显式管理面)
export const AGENT_WRITE_CAPABILITIES = [
  { method: "POST", pathname: "/api/docs" },
  { method: "PATCH", pathname: "/api/docs" },
  { method: "POST", pathname: "/api/products" },
] as const;

export function parseBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match ? match[1].trim() : null;
}

// 常量时间比较:token 是长期凭据,防时序侧信道泄露。
export function isValidAgentToken(token: string | null, secret: string | undefined): boolean {
  if (!secret || !token) return false;
  if (token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) {
    diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}

// Admin 机器通道(管理 API):线上人类入口有登录门禁(GitHub OAuth + 邮箱白名单),
// 非人类主体(运维脚本/自动化验收)过不了这道门。此表把「管理写操作」对 agent token
// 显式开放——与 AGENT_WRITE_CAPABILITIES 平行成表、不混写,审计时一眼看清哪些管理
// 操作暴露给了机器通道;扩面 = 在此加行 + 对应路由用 adminOrAgent 角色。
//   - 读(GET)不在闸门管辖(agent GET 本就全通),由路由层 requireAdminOrAgent 放行
//   - 写(PATCH/POST)在 worker 入口 fail-closed,未列名一律 403 agent_scope_forbidden
//   - DELETE/财务/上传/oauth 依旧不在表内 —— 不可逆与资金操作是人类专属
export const AGENT_ADMIN_CAPABILITIES = [
  { method: "PATCH", pathname: "/api/admin/moderation" },
  { method: "POST", pathname: "/api/admin/invitations" },
  { method: "PATCH", pathname: "/api/admin/invitations" },
  { method: "PATCH", pathname: "/api/admin/incubation" },
] as const;

// agent 非 GET 请求的放行判定:两张能力表之并集精确命中(method+pathname)。
// 纯函数 —— worker 入口 chokepoint 与契约测试共用同一份事实,不允许各写一份。
export function isAgentWriteAllowed(method: string, pathname: string): boolean {
  const caps: readonly { method: string; pathname: string }[] = [
    ...AGENT_WRITE_CAPABILITIES,
    ...AGENT_ADMIN_CAPABILITIES,
  ];
  return caps.some((cap) => cap.method === method && cap.pathname === pathname);
}

// ———— 视觉验收入场票(机器通道 → 浏览器会话)————
// 线上 /lattice/ 有登录门禁(302 → /signin),Bearer token 通不了浏览器。
// 流程:持 token 调 /api/admin/visual-session 铸票 → 浏览器访问 enter URL 消费票 →
// 植入正式会话 cookie(HttpOnly)→ 门禁放行。票无状态(HMAC 签名,10 分钟 TTL),
// 不入库:只有能铸票的人(token 持有者)才拿得到票,重放不产生超出 token 的权力。
export const VISUAL_TICKET_TTL_SECONDS = 600;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toBase64Url(new Uint8Array(sig));
}

function constantTimeEqualsStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 铸票:v1.<exp epoch秒>.<nonce hex>.<hmac(exp+nonce)>。纯函数(secret 注入)。
export async function signVisualTicket(secret: string, nowMs: number = Date.now()): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + VISUAL_TICKET_TTL_SECONDS;
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(12)));
  const sig = await hmacSign(secret, `visual-session:${exp}:${nonce}`);
  return `v1.${exp}.${nonce}.${sig}`;
}

// 验票:签名常量时间比对 + 未过期。返回 { ok: true } 或 { ok: false, reason }。
export async function verifyVisualTicket(
  secret: string,
  ticket: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<{ ok: true } | { ok: false; reason: "malformed" | "bad_signature" | "expired" }> {
  if (!ticket) return { ok: false, reason: "malformed" };
  const parts = ticket.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return { ok: false, reason: "malformed" };
  const [, expRaw, nonce, sig] = parts;
  if (!/^\d+$/.test(expRaw) || !/^[A-Za-z0-9_-]+$/.test(nonce)) return { ok: false, reason: "malformed" };
  const expected = await hmacSign(secret, `visual-session:${expRaw}:${nonce}`);
  if (!constantTimeEqualsStr(sig, expected)) return { ok: false, reason: "bad_signature" };
  if (Number(expRaw) * 1000 <= nowMs) return { ok: false, reason: "expired" };
  return { ok: true };
}
