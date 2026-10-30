export function pricingModelLabel(pricingModel: string, price: number) {
  if (pricingModel === "free") return "免费";
  if (pricingModel === "one_time") return `${price} 果 / 一次解锁`;
  if (pricingModel === "per_use") return `${price} 果 / 按次体验`;
  // 未知值不能默认为某个收费模型,否则脏数据会被展示成可收费。
  return "未知定价";
}

export type Report = { id: string; targetType: string; targetRef: string; reason: string; details: string; createdAt: string };
export type AdminHosting = { id: number; state: string; desired: string; reviewVersion: number; approvedVersion: number; bundleFileCount: number; bundleUncompressedBytes: number; bundleSha256: string; previewUrl: string | null; previewExpiresAt: string | null; failureCode: string | null; failureDetail: string | null };
export type ProductReview = { id: number; ownerEmail: string; ownerName: string; title: string; description: string; category: string; demoUrl: string | null; imageUrl: string | null; price: number; pricingModel: string; reviewStatus: string; reviewVersion: number; submittedAt: string; hosting: AdminHosting | null };
export type Client = { clientId: string; name: string; websiteUrl: string; allowedScopes: string; ownerEmail?: string; reviewStatus?: string; writeAccessApproved?: number; createdAt?: string };
export type Risk = { id: string; userEmail: string; kind: string; severity: string; evidence: string; createdAt: string };
export type Project = { id: number; name: string; userEmail: string; status: string; currentTask: string; assignedOwner: string | null; nextAction: string; waitingReason: string; progressPercent: number; updatedAt: string };
export type Invitation = { id: string; label: string; maxUses: number; usesCount: number; expiresAt: string; revokedAt: string | null; createdBy: string; createdAt: string; lastUsedAt: string | null };
export type HostingGrant = { memberEmail: string; maxSites: number; note: string; grantedBy: string; createdAt: string; revokedAt: string | null; usedSites: number };
export type ModerationData = { reports: Report[]; products: ProductReview[]; clients: Client[]; risks: Risk[] };
export type AdminData = { moderation: ModerationData; projects: Project[]; stages: string[]; invitations: Invitation[]; hostingGrants: HostingGrant[]; errors: string[] };

export type Member = {
  email: string;
  displayName: string;
  username: string | null;
  onboardingRequired: boolean;
  provisioned: boolean;
  memberNumber: number | null;
  joinedAt: string;
  loginMethods: string[];
  products: { pendingReview: number; approved: number; rejected: number };
  wallet: { balance: number; pendingBalance: number; status: string | null };
  activeSessions: number;
  activeApiKeys: number;
  suspendedAt: string | null;
  suspendedReason: string;
  suspendedBy: string | null;
};

export type Overview = {
  members: { total: number; newToday: number; new7Days: number; suspended: number };
  products: { byReviewStatus: { pendingReview: number; approved: number; rejected: number } };
  posts: { total: number };
  queues: { fruitRisk: { total: number; high: number }; reports: number; productReviews: number; thirdPartyApps: number; incubation: number };
  fruit: { walletBalanceTotal: number; walletPendingBalanceTotal: number; walletCombinedTotal: number; reviewWallets: number; operationsLast24h: number };
};

export type AuditEvent = {
  id: string;
  source: "admin" | "mcp";
  actorEmail: string;
  action: string;
  targetType: string;
  targetRef: string;
  detail: string;
  createdAt: string;
  credentialKind: string | null;
  credentialId: string | null;
  result: string | null;
  productId: number | null;
};

export class AdminRequestError extends Error {
  constructor(readonly status: number, readonly code?: string) {
    super(code ?? `http_${status}`);
  }
}

export async function adminRequest<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error("network");
  }
  const payload = await response.json().catch(() => null) as { error?: unknown } | null;
  const code = typeof payload?.error === "string" ? payload.error : undefined;
  if (!response.ok) throw new AdminRequestError(response.status, code);
  if (!payload) throw new Error("invalid_response");
  return payload as T;
}

export function adminErrorMessage(action: string, error: unknown): string {
  if (error instanceof AdminRequestError) {
    if (error.code === "hosting_not_staged") return `${action}：托管包尚未部署完成，审核决定未生效。`;
    if (error.status === 403) return `${action}：权限不足（403），当前账号无权执行此操作。`;
    if (error.status === 409) return `${action}：状态冲突（409）${error.code ? `（${error.code}）` : ""}，请刷新后确认当前状态。`;
    return `${action}：请求失败（HTTP ${error.status}）${error.code ? `，错误码 ${error.code}` : ""}。`;
  }
  if (error instanceof Error && error.message === "network") return `${action}：网络异常，请检查连接后重试。`;
  if (error instanceof Error && error.message !== "invalid_response") return `${action}：${error.message}。`;
  return `${action}：服务器响应无法读取，请稍后重试。`;
}

export function formatHostingBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

export function hostingStateLabel(state: string): string {
  return ({ queued: "排队中", deploying: "部署中", staged: "待审核预览", promoting: "上线中", live: "已上线", removing: "移除中", removed: "已移除", failed: "失败" } as Record<string, string>)[state] ?? "未知状态";
}

export function approvalBlockReason(hosting: AdminHosting | null): string {
  if (!hosting || hosting.state === "staged" || hosting.state === "live") return "";
  if (hosting.state === "failed") return "托管部署失败";
  if (hosting.state === "queued" || hosting.state === "deploying" || hosting.state === "promoting") return "托管包尚未部署完成";
  return "当前托管状态不允许批准";
}

// 状态以"现在还能不能被人拿来注册"为准:已撤销/已用完/已过期都不可再消费,
// 只有三者都不满足才显示「有效」。expires_at 是 UTC 的 "YYYY-MM-DD HH:MM:SS",
// 须显式补 T/Z 解析,否则按本地时区解释会把未过期的码误判过期(反之亦然)。
export function invitationStatus(invitation: Invitation) {
  if (invitation.revokedAt) return "已撤销";
  if (invitation.usesCount >= invitation.maxUses) return "已用完";
  if (new Date(`${invitation.expiresAt.replace(" ", "T")}Z`).getTime() <= Date.now()) return "已过期";
  return "有效";
}

export function adminWriteInit(body: unknown): RequestInit {
  return { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}
