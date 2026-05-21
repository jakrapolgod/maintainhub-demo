import type { SLABreachedEvent } from '@maintainhub/domain'

/** Minimal shape of an overdue work order row returned from Prisma. */
export interface OverdueWoRow {
  id: string
  tenantId: string
  woNumber: string
  assetId: string
  priority: string
  slaDeadline: Date
}

/** Read-port used by the checker. */
export interface SlaWorkOrderRepository {
  findOverdueSLA(tenantId: string): Promise<OverdueWoRow[]>
}

/** Publishes a breached-SLA notification to the downstream queue. */
export interface SlaNotificationPublisher {
  publishSlaBreached(event: SLABreachedEvent): Promise<void>
}

/** Minimal logger interface — compatible with pino, console, and test stubs. */
export interface SlaCheckerLogger {
  info(data: object | string, msg?: string): void
  warn(data: object | string, msg?: string): void
  error(data: object | string, msg?: string): void
}
