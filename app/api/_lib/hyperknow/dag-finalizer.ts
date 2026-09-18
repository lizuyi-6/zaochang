import { checkPrerequisitesAcyclic } from "./protocol";

export async function finalizeCourseDependencies<T extends { unitId: string; prerequisites?: string[] }>(
  units: T[],
  repair: (unit: T, errors: string[]) => Promise<T | null>,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const check = checkPrerequisitesAcyclic(units);
  if (check.isAcyclic) return;
  const errors = [`Cyclic dependency: ${check.cycle?.join(" -> ")}`];
  for (let i = 0; i < units.length; i++) {
    signal?.throwIfAborted();
    const repaired = await repair(units[i], errors);
    signal?.throwIfAborted();
    if (!repaired) throw new Error("course_dependency_repair_failed");
    units[i] = repaired;
  }
  if (!checkPrerequisitesAcyclic(units).isAcyclic) {
    throw new Error("course_dependencies_cyclic");
  }
}
