/**
 * Worker-local job-data type definitions.
 *
 * These mirror the interfaces in apps/api/src/infrastructure/events/job-data.ts.
 * They are duplicated here so the worker does not import from apps/api (which
 * would create a cross-app dependency).  If the shapes diverge, a shared
 * package (e.g. packages/shared) should own them.
 */

export type NotificationType = 'WO_COMPLETED' | 'SLA_BREACHED' | 'WO_ESCALATED'

export interface NotificationJobData {
  eventId: string
  type: NotificationType
  tenantId: string
  aggregateId: string
  woNumber: string
  recipientUserIds: string[]
  notifyRoles: Array<'ADMIN' | 'MANAGER'>
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL'
  payload: Record<string, unknown>
}
