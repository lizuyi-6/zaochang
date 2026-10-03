import { checkPrerequisitesAcyclic } from "./protocol";

export async function finalizeCourseDependencies<T extends { unitId: string; prerequisites?: string[] }>(
  units: T[],
  repair: (unit: T, errors: string[]) => Promise<T | null>,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  /* 只修"环上"的单元:repair 是一次真实 LLM 调用,对全部 N 个单元逐个修复时,
   * 两个单元构成的小环也会烧 N 次生成——修复面收敛到 check 报告的环成员。
   * 多轮互锁环:修完一轮重检,至多 4 轮,仍成环按契约显式抛错。 */
  for (let round = 0; round < 4; round++) {
    const check = checkPrerequisitesAcyclic(units);
    if (check.isAcyclic) return;
    const cycleSet = new Set(check.cycle ?? []);
    const errors = [`Cyclic dependency: ${check.cycle?.join(" -> ")}`];
    let repairedAny = false;
    for (let i = 0; i < units.length; i++) {
      signal?.throwIfAborted();
      if (!cycleSet.has(units[i].unitId)) continue;
      const repaired = await repair(units[i], errors);
      signal?.throwIfAborted();
      if (!repaired) throw new Error("course_dependency_repair_failed");
      units[i] = repaired;
      repairedAny = true;
    }
    if (!repairedAny) break;
  }
  if (!checkPrerequisitesAcyclic(units).isAcyclic) {
    throw new Error("course_dependencies_cyclic");
  }
}
