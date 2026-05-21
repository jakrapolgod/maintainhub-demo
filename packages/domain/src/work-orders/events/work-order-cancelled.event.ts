import { BaseDomainEvent } from '../../events/base-domain-event.js'

const AGGREGATE_TYPE = 'WorkOrder'

/**
 * Raised when a work order is cancelled.
 *
 * Downstream consumers: inventory service (release reserved parts),
 * notification service (alert team), SLA tracker (stop the clock),
 * KPI counters (cancellation rate).
 */
export class WorkOrderCancelledEvent extends BaseDomainEvent {
  readonly eventType = 'WorkOrderCancelled' as const

  readonly tenantId: string

  readonly cancelledById: string

  readonly reason: string

  constructor(opts: {
    aggregateId: string
    tenantId: string
    cancelledById: string
    reason: string
  }) {
    super(opts.aggregateId, AGGREGATE_TYPE)
    this.tenantId = opts.tenantId
    this.cancelledById = opts.cancelledById
    this.reason = opts.reason
  }
}
