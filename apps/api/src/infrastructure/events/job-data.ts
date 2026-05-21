/**
 * Typed job-data contracts for every BullMQ queue used by the event publisher.
 *
 * Design rules
 * ────────────
 *  • All `Date` fields are serialised as ISO-8601 strings — JSON round-trips do
 *    not reconstruct `Date` objects, so workers receive strings and parse them.
 *  • `Decimal` fields are serialised as numeric strings to survive JSON
 *    serialisation without losing precision.
 *  • Every job carries `eventId` (UUID) as a deduplication / idempotency key
 *    that workers can use to guard against double-processing on retry.
 */

// ── Queue names ───────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  /** Recalculate MTBF / MTTR / availability after a work order is closed. */
  ASSET_METRICS: 'asset-metrics',
  /** Send in-app / email / push notifications to technicians and managers. */
  NOTIFICATIONS: 'notifications',
  /** Check whether any active PM schedules depend on the just-completed asset. */
  PM_CHECK: 'pm-check',
  /** Send priority-escalation emails to responsible managers. */
  ESCALATION_EMAIL: 'escalation-email',
} as const

// ── BullMQ job priority constants ─────────────────────────────────────────────
// Lower number → higher priority in BullMQ.

export const JOB_PRIORITY = {
  CRITICAL: 1,
  HIGH: 2,
  NORMAL: 3,
} as const

// ── Notification sub-types ────────────────────────────────────────────────────

export type NotificationType = 'WO_COMPLETED' | 'SLA_BREACHED' | 'WO_ESCALATED'

// ── Per-queue job-data interfaces ─────────────────────────────────────────────

/**
 * Job data for the `asset-metrics` queue.
 *
 * Workers use this to recompute MTBF, MTTR, and cumulative maintenance cost
 * for the affected asset.
 */
export interface AssetMetricsJobData {
  /** Event ID — used as a BullMQ job ID for deduplication. */
  eventId: string
  tenantId: string
  /** The asset whose metrics need refreshing. */
  assetId: string
  /** The work order that was just completed. */
  workOrderId: string
  /** ISO-8601 string. Workers parse with `new Date(completedAt)`. */
  completedAt: string
  /** Total labour hours logged on the work order. */
  laborHours: number
  /** Total maintenance cost (labour + parts) as a decimal string. */
  totalCost: string
}

/**
 * Job data for the `notifications` queue.
 *
 * A single flexible shape covers all notification sub-types.  Workers
 * inspect `type` to select the correct message template.
 */
export interface NotificationJobData {
  /** Event ID — used as a BullMQ job ID for deduplication. */
  eventId: string
  type: NotificationType
  tenantId: string
  /** Aggregate (work order) ID. */
  aggregateId: string
  /** Human-readable WO reference shown in the notification body. */
  woNumber: string
  /**
   * Specific user IDs to deliver to directly (e.g. the completing technician,
   * assigned technicians).  The notification worker resolves these to contact
   * details from the user table.
   */
  recipientUserIds: string[]
  /**
   * Role-based catch-all — every user with one of these roles in the same
   * tenant also receives the notification.
   */
  notifyRoles: Array<'ADMIN' | 'MANAGER'>
  /** User-facing priority label used for sorting the notification inbox. */
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL'
  /** Template-specific payload merged into the notification body. */
  payload: Record<string, unknown>
}

/**
 * Job data for the `pm-check` queue.
 *
 * Workers look up all PM schedules whose `assetId` matches and evaluate
 * whether a completed corrective WO should reset a meter-based trigger.
 */
export interface PmCheckJobData {
  /** Event ID — used as a BullMQ job ID for deduplication. */
  eventId: string
  tenantId: string
  assetId: string
  workOrderId: string
  /** ISO-8601 string. */
  completedAt: string
}

/**
 * Job data for the `escalation-email` queue.
 *
 * Workers send a dedicated escalation email to all managers in the tenant
 * explaining why the priority was raised and what action is required.
 */
export interface EscalationEmailJobData {
  /** Event ID — used as a BullMQ job ID for deduplication. */
  eventId: string
  tenantId: string
  workOrderId: string
  /** Human-readable WO number shown in the subject line. */
  woNumber: string | undefined
  fromPriority: string
  toPriority: string
  /** ISO-8601 string — when the escalation occurred. */
  occurredAt: string
}
