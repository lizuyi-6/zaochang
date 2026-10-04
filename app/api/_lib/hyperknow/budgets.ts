// 课程生成两阶段的服务端总预算(2026-10 审计 C1)。零 import:单测直接加载本文件。
// - Stage1 覆盖自动级联全程(检索→蓝图→逐单元);扣费在流开始前,超时必须走显式
//   失败 + 退费,不得与客户端断开合并成同一个静默分支。
// - Stage2 覆盖确认后的单元生成;不扣费,超时只需显式报错。不设测试覆盖旋钮——
//   现有集成套件的单元延迟用例与其真实预算(15 分钟)耦合,压缩会引入偶发红。
export const COURSE_STAGE1_BUDGET_MS = 300_000;
export const COURSE_STAGE2_BUDGET_MS = 900_000;

// HK_COURSE_GEN_TIMEOUT_MS 仅在 APP_ENV=test 生效:集成测试用它把 Stage1 预算压到
// 秒级,以真实触发"超时→失败→退费"路径。生产/预发/未设置/拼写错误的 APP_ENV 一律
// 忽略——它不是生产旋钮,线上误配不得缩短真实预算。下限 1000ms 防止误配成 0/负数
// 把超时变成立即失败。
export function resolveCourseGenBudgetMs(
  appEnv: string | undefined,
  overrideRaw: string | undefined,
  defaultMs: number,
): number {
  if (appEnv !== "test") return defaultMs;
  const parsed = Number.parseInt(String(overrideRaw ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed >= 1_000 ? parsed : defaultMs;
}
