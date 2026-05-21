import { BaseDomainEvent } from '../../events/base-domain-event.js'

const AGGREGATE_TYPE = 'Asset'

/**
 * Raised when an asset moves through a lifecycle status transition
 * (e.g. OPERATIONAL → UNDER_MAINTENANCE).
 *
 * Downstream: maintenance schedule trigger, PM check (should a preventive WO
 * be created when status moves to UNDER_MAINTENANCE?), audit projection.
 */
export class AssetStatusChangedEvent extends BaseDomainEvent {
  readonly eventType = 'AssetStatusChanged' as const

  readonly tenantId: string

  readonly assetNumber: string

  readonly previousStatus: string

  readonly newStatus: string

  readonly changedBy: string

  constructor(opts: {
    aggregateId: string
    tenantId: string
    assetNumber: string
    previousStatus: string
    newStatus: string
    changedBy: string
  }) {
    super(opts.aggregateId, AGGREGATE_TYPE)
    this.tenantId = opts.tenantId
    this.assetNumber = opts.assetNumber
    this.previousStatus = opts.previousStatus
    this.newStatus = opts.newStatus
    this.changedBy = opts.changedBy
  }
}
