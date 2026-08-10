// Agent 服务账户:非人类主体,以 Bearer token 认证(类似 MCP 的机器控制通道)。
// 与人类身份(GitHub OAuth)平行:不进 members 表的常规流程,不继承 founder/admin,
// 能力由下面的 AGENT_WRITE_CAPABILITIES 硬编码白名单决定(单一全局 token → 全 scope)。
//
// 安全模型:
//  - token 未配置(ZAOCHANG_AGENT_TOKEN 为空)→ 本模块识别永不命中,零行为变化。
//  - token 配置后 → agent GET 全通(read);非 GET 必须命中 capability 表,否则 worker
//    入口 403 fail-closed。DELETE/财务/上传/admin 等一律不在表内 → 永远拦。
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
//   - 财务(/api/payments, /api/v1/fruit/*)、admin、uploads、oauth、社交动作:全不在表内
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
