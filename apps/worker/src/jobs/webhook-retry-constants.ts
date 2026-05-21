/** BullMQ queue name for webhook retry jobs. */
export const WEBHOOK_RETRY_QUEUE = 'webhook-retry'

/** BullMQ job name for the repeatable retry sweep. */
export const WEBHOOK_RETRY_JOB_NAME = 'webhook:retry'

/** How often the retry sweep runs (every 5 minutes). */
export const WEBHOOK_RETRY_INTERVAL_MS = 5 * 60_000

/** Failure count above which the tenant admin is notified (circuit-breaker threshold). */
export const WEBHOOK_FAILURE_ALERT_THRESHOLD = 10

/** Max deliveries processed per sweep (prevents unbounded batch size). */
export const WEBHOOK_RETRY_BATCH_SIZE = 50
