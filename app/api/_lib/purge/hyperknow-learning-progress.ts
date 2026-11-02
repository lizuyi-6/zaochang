import type { PurgeStatement } from "./index.ts";

export function hyperknowLearningProgressPurgeStatements(db: D1Database): PurgeStatement[] {
  return [
    {
      label: "hyperknow.check-attempts",
      statement: db.prepare(`DELETE FROM hk_check_attempts WHERE created_at <= datetime('now', '-365 days')`),
    },
  ];
}
