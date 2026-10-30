import type { PurgeStatement } from "./index.ts";

export function hyperknowFeedbackPurgeStatements(db: D1Database): PurgeStatement[] {
  return [
    {
      label: "hyperknow.feedback",
      statement: db.prepare(`DELETE FROM hk_feedback WHERE created_at <= datetime('now', '-180 days')`),
    },
  ];
}
