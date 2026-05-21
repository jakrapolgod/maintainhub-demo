import { BaseDomainEvent } from '../../events/base-domain-event.js'

const AGGREGATE_TYPE = 'WorkOrder'

/**
 * Raised when a work order passes its SLA deadline without reaching a
 * terminal status (COMPLETED or CANCELLED).
 *
 * This event is typically emitted by a scheduled background job that scans
 * for overdue WOs — it is NOT emitted by the `WorkOrder` aggregate itself,
 * since the aggregate is only aware of its own state, not the passage of
 * real time. The job calls `findOverdueSLA()` on the repository and emits
 * this event for each result via an application-layer domain service.
 *
 * Downstream consumers: notification service (escalation alerts to managers),
 * SLA tracker (mark as breached), KPI reporting (SLA compliance rate).
 */
export class SLABreachedEvent extends BaseDomainEvent {
  readonly eventType = 'SLABreached' as const

  readonly tenantId: string

  readonly assetId: string

  readonly woNumber: string

  readonly priority: string

  /** The SLA deadline that was missed. */
  readonly slaDeadline: Date

  /**
   * Number of minutes the WO is overdue at the time the breach was detected.
   * Computed by the scheduler: `(detectedAt - slaDeadline) / 60_000`.
   */
  readonly overdueMinutes: number

  constructor(opts: {
    aggregateId: string
    tenantId: string
    assetId: string
    woNumber: string
    priority: string
    slaDeadline: Date
    overdueMinutes: number
  }) {
    super(opts.aggregateId, AGGREGATE_TYPE)
    this.tenantId = opts.tenantId
    this.assetId = opts.assetId
    this.woNumber = opts.woNumber
    this.priority = opts.priority
    this.slaDeadline = opts.slaDeadline
    this.overdueMinutes = opts.overdueMinutes
  }
}
