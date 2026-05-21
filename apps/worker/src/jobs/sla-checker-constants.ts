export const SLA_CHECK_QUEUE = 'sla-check'
export const NOTIFICATIONS_QUEUE = 'notifications'
export const ALERTED_KEY = (woId: string) => `sla-alerted:${woId}`
export const ALERTED_TTL_SECONDS = 60 * 60 // 1 hour
export const BULLMQ_CRITICAL_PRIORITY = 1
export const CHECK_INTERVAL_MS = 5 * 60 * 1_000 // 5 minutes
