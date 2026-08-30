// 统一错误语义层:API 层所有 coded error 的构造、映射与 D1 约束嗅探都从这里出。
// 之前 jsonError 在 community.ts(身份/落地模块)、D1 嗅探在 fruit.ts/moderation 路由
// 各写一份;收敛到本模块后,"错误长什么样"只有一个事实来源。
// 注意:本文件只做错误形状,不做身份与 DB 访问——community.ts(身份/落地)与
// access-control.ts(决策)依赖它,反向依赖会造成环。

// coded error 约定:{ code, status } 形状的 Error 会被 jsonError 映射为
// Response.json({ error: code }, { status })。不要在路由里手写 Object.assign(new Error...)。
export function accessError(code: string, status: number): Error & { code: string; status: number } {
  return Object.assign(new Error(code), { code, status });
}

export class AuthRequiredError extends Error {
  constructor() {
    super("Sign in is required");
  }
}

export function jsonError(error: unknown): Response {
  if (error instanceof AuthRequiredError) {
    return Response.json({ error: "auth_required" }, { status: 401 });
  }

  if (error && typeof error === "object" && "code" in error && "status" in error) {
    const code = String((error as { code: unknown }).code);
    const status = Number((error as { status: unknown }).status);
    return Response.json({ error: code }, { status: Number.isInteger(status) ? status : 500 });
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  // 仅钱包余额 CHECK 映射为 insufficient_balance;任意表的 CHECK 失败都报钱包
  // 错误会让 409 语义失真、掩盖真实故障。
  if (message.includes("CHECK constraint failed")
    && (message.includes("wallet_balance_nonnegative") || message.includes("wallet_pending_nonnegative"))) {
    return Response.json({ error: "insufficient_balance" }, { status: 409 });
  }
  if (message.includes("UNIQUE constraint failed")) {
    return Response.json({ error: "already_completed" }, { status: 409 });
  }
  // 不把 error.message 原文返回客户端：它会泄露 D1 约束名/表结构等内部细节。
  // 已识别的业务错误码在上方白名单；其余统一兜底为 server_error 并记录到服务端日志。
  console.error("[jsonError] unhandled:", message);
  return Response.json({ error: "server_error" }, { status: 500 });
}

// ---- D1 约束嗅探(direct-write 与触发器 RAISE 都以 message 文本落地,只能文本识别)----

export function errorMessageIncludes(error: unknown, marker: string): boolean {
  return error instanceof Error && error.message.includes(marker);
}

export function isUniqueConstraintError(error: unknown): boolean {
  return errorMessageIncludes(error, "UNIQUE constraint failed");
}

export function isWalletBalanceError(error: unknown): boolean {
  return errorMessageIncludes(error, "wallet_balance_nonnegative")
    || errorMessageIncludes(error, "CHECK constraint failed: balance");
}

export function isWalletPendingError(error: unknown): boolean {
  return errorMessageIncludes(error, "wallet_pending_nonnegative")
    || errorMessageIncludes(error, "CHECK constraint failed: pending_balance");
}

// ---- 业务触发器 RAISE marker 的命名识别 ----
// 新代码不得直接比较 D1 原始错误文本;marker 与映射在这里登记,避免各处散落字符串。

export function isExternalDemoImmutableError(error: unknown): boolean {
  return errorMessageIncludes(error, "external_demo_requires_immutable_package");
}

export function isProductReviewNotPendingError(error: unknown): boolean {
  return errorMessageIncludes(error, "product_review_not_pending");
}

export function isModerationRemediationNotAllowedError(error: unknown): boolean {
  return errorMessageIncludes(error, "moderation_remediation_not_allowed");
}

export function isInvitationRegistrationRequiredError(error: unknown): boolean {
  return errorMessageIncludes(error, "oauth_registration_invitation_required");
}

export function isInvitationUnavailableError(error: unknown): boolean {
  return errorMessageIncludes(error, "invitation_not_available");
}

export function isProductCommentNotApprovedError(error: unknown): boolean {
  return errorMessageIncludes(error, "product_comment_product_not_approved");
}

export function isPostCommentNotVisibleError(error: unknown): boolean {
  return errorMessageIncludes(error, "post_comment_post_not_visible");
}

export function isProductLikeNotApprovedError(error: unknown): boolean {
  return errorMessageIncludes(error, "product_like_product_not_approved");
}
