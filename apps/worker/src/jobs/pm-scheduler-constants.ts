/** BullMQ queue name for PM schedule trigger jobs. */
export const PM_SCHEDULER_QUEUE = 'pm-scheduler'

/** BullMQ queue name for PM advance-notice jobs. */
export const PM_NOTICE_QUEUE = 'pm-advance-notice'

/** BullMQ job name for the hourly PM trigger sweep. */
export const PM_JOB_NAME = 'pm:check'

/** BullMQ job name for the daily advance-notice sweep. */
export const PM_NOTICE_JOB_NAME = 'pm:advance-notice'

/** How often the PM trigger sweep runs (1 hour). */
export const PM_CHECK_INTERVAL_MS = 60 * 60 * 1_000

/**
 * Redis key for PM advance-notice dedup.
 * TTL = 23 h so one notice per calendar day, regardless of timezone.
 */
export const ADVANCE_NOTICE_KEY = (scheduleId: string, date: string) =>
  `advance-notice:${scheduleId}:${date}`

/** TTL for advance-notice dedup key (23 hours, not 24h to avoid TZ edge-cases). */
export const ADVANCE_NOTICE_TTL_SECONDS = 23 * 60 * 60

/** Queue name for monitoring / alerting (re-used from SLA checker). */
export const MONITORING_QUEUE = 'monitoring'

/** BullMQ critical priority for monitoring alerts. */
export const BULLMQ_CRITICAL_PRIORITY = 1
