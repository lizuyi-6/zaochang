export const RETENTION_PURGE_CRON = "23 */6 * * *";
export const HYPERKNOW_IMAGE_CLEANUP_CRON = "*/15 * * * *";

export function scheduledPurgePlan(cron?: string) {
  return {
    retention: cron === RETENTION_PURGE_CRON,
    hyperknowImages: cron === RETENTION_PURGE_CRON || cron === HYPERKNOW_IMAGE_CLEANUP_CRON,
  };
}
