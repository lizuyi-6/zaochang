export const RETENTION_PURGE_CRON = "23 */6 * * *";
export const HYPERKNOW_IMAGE_CLEANUP_CRON = "*/15 * * * *";

export function scheduledPurgePlan(cron?: string) {
  return {
    retention: cron === RETENTION_PURGE_CRON,
    hyperknowImages: cron === RETENTION_PURGE_CRON || cron === HYPERKNOW_IMAGE_CLEANUP_CRON,
    // 招募回执补发挂在 15 分钟这一路:失败的回执 20 分钟后重试,不占用 6 小时的保留清理。
    recruitMail: cron === HYPERKNOW_IMAGE_CLEANUP_CRON,
  };
}
