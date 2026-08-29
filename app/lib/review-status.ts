// 审核状态展示判定的单一事实来源。
// 规则:只有 approved 且 批准版本 == 当前审核版本 才算"已发布/审核通过";
// 陈旧批准版本(approvedVersion < reviewVersion,编辑会触发重审)不算已发布。
// 此前 studio 用严格规则、founder 中心只看 reviewStatus 单字段——同一产品在两处
// 显示不一致(陈旧批准版本被错标"审核通过"),本模块统一按严格规则。
export type ReviewDisplayState = "live" | "rejected" | "pending";

export function reviewDisplayState(product: {
  reviewStatus: string;
  approvedVersion?: number | null;
  reviewVersion?: number | null;
}): ReviewDisplayState {
  if (product.reviewStatus === "approved" && product.approvedVersion === product.reviewVersion) return "live";
  if (product.reviewStatus === "rejected") return "rejected";
  return "pending";
}
