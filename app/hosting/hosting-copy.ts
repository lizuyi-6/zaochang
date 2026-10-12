export type HostingIssue = { message: string; code?: string };

const hostingMessages: Record<string, string> = {
  hosting_not_granted: "静态托管目前仅对受邀成员开放。",
  hosting_quota_exceeded: "托管站点额度已用完，请联系管理员调整额度。",
  hosting_demo_url_conflict: "该项目仍填写了完整体验链接；请先清空后再提交托管包。",
  hosting_owner_mismatch: "当前账号不是该项目的作者，无法管理此托管站点。",
  hosting_not_staged: "托管包尚未部署到待审核状态，审核决定未生效。",
  product_not_found: "找不到这个项目，请刷新页面后重试。",
  upload_capacity_exceeded: "当前上传服务繁忙，请稍后重试。",
  rate_limit_exceeded: "操作过于频繁，请稍后再试。",
  bundle_missing_index: "压缩包根目录必须有 index.html。",
  bundle_extension_forbidden: "包含不允许的文件类型(如 .php/.sh/.exe)，请移除后重试。",
  bundle_too_large: "压缩包超过 10 MiB，请缩小后重试。",
  bundle_path_invalid: "压缩包包含不支持的路径或文件名，请检查后重试。",
  bundle_encrypted: "压缩包不能加密，请重新打包后上传。",
  bundle_too_many_entries: "压缩包内文件过多，请精简后重试。",
  bundle_uncompressed_too_large: "解压后的文件总量超过限制，请精简后重试。",
  bundle_ratio_exceeded: "压缩包压缩比例超过限制，请重新打包后重试。",
  bundle_missing: "托管压缩包暂时不可用，请重新上传。",
  validation_bundle: "压缩包未通过结构校验，请检查文件名、目录层级与内容后重试。",
  validation_secret: "文件疑似包含密钥或凭据，请从压缩包中移除后重试。",
  provider_quota: "第三方托管额度暂不可用，请稍后重试。",
  provider_audit_rejected: "托管平台未接受这个版本，请检查内容后重试。",
  provider_error: "托管平台暂时无法处理请求，请稍后重试。",
  provider_auth: "托管平台暂时无法完成授权，请联系管理员。",
  ambiguous: "需要人工核对，已通知管理员。",
  internal: "托管处理暂未成功，请稍后刷新状态。",
  auth_required: "登录状态已失效，请重新登录后重试。",
};

export function hostingFailureMessage(code: string | null | undefined): string {
  if (!code) return "托管处理暂未成功，请稍后刷新状态。";
  return hostingMessages[code] ?? "托管请求未完成，请稍后重试。";
}

export function hostingIssue(status: number, code: string | undefined): HostingIssue {
  if (code && hostingMessages[code]) return { message: hostingMessages[code], code };
  if (status === 403) return { message: "当前账号无权执行此操作，请确认授权与项目归属。", code };
  if (status === 409) return { message: "当前状态不允许此操作；请刷新托管状态后重试。", code };
  if (status === 413) return { message: "上传内容超过服务端接收上限，请缩小文件后重试。", code };
  return { message: "请求未成功，请检查网络后重试。", code };
}

export function isKnownHostingCode(code: string | null | undefined): boolean {
  return Boolean(code && hostingMessages[code]);
}
