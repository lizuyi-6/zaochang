// 审核状态展示判定的单一事实来源。
// 规则:只有 approved 且 批准版本 == 当前审核版本 才算"已发布/审核通过";
// 陈旧批准版本(approvedVersion < reviewVersion,编辑会触发重审)不算已发布。
// 缺少任一版本时必须 fail-closed 为 pending,不能把 undefined === undefined 误判为已发布。
import { isCurrentApprovedProduct } from "./product-policy";

export type ReviewDisplayState = "live" | "rejected" | "pending";

export function reviewDisplayState(product: {
  reviewStatus: string;
  approvedVersion?: number | null;
  reviewVersion?: number | null;
}): ReviewDisplayState {
  if (product.reviewStatus === "rejected") return "rejected";
  if (isCurrentApprovedProduct(product)) return "live";
  return "pending";
}
