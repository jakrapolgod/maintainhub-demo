/**
 * WebhookEventType — the set of domain events that can be dispatched to
 * external systems via webhook endpoints.
 *
 * Every new domain event that should be observable externally must be added
 * here AND wired in the webhook dispatcher (infrastructure layer).
 */
export type WebhookEventType =
  | 'WORK_ORDER_CREATED'
  | 'WORK_ORDER_ASSIGNED'
  | 'WORK_ORDER_COMPLETED'
  | 'WORK_ORDER_SLA_BREACHED'
  | 'ASSET_STATUS_CHANGED'
  | 'ASSET_DECOMMISSIONED'
  | 'PM_TRIGGERED'
  | 'PART_LOW_STOCK'

/** All valid webhook event types as a readonly array (useful for validation). */
export const ALL_WEBHOOK_EVENT_TYPES: readonly WebhookEventType[] = [
  'WORK_ORDER_CREATED',
  'WORK_ORDER_ASSIGNED',
  'WORK_ORDER_COMPLETED',
  'WORK_ORDER_SLA_BREACHED',
  'ASSET_STATUS_CHANGED',
  'ASSET_DECOMMISSIONED',
  'PM_TRIGGERED',
  'PART_LOW_STOCK',
] as const

/** Returns true when the given string is a valid WebhookEventType. */
export function isWebhookEventType(value: string): value is WebhookEventType {
  return (ALL_WEBHOOK_EVENT_TYPES as readonly string[]).includes(value)
}
