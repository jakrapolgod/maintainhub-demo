import { BaseDomainEvent } from '../../events/base-domain-event.js'

const AGGREGATE_TYPE = 'PMSchedule'

/**
 * Raised when a PM schedule transitions from active → inactive.
 */
export class PMScheduleDeactivatedEvent extends BaseDomainEvent {
  readonly eventType = 'PMScheduleDeactivated' as const

  readonly tenantId: string

  readonly assetId: string

  readonly deactivatedBy: string

  constructor(opts: {
    aggregateId: string
    tenantId: string
    assetId: string
    deactivatedBy: string
  }) {
    super(opts.aggregateId, AGGREGATE_TYPE)
    this.tenantId = opts.tenantId
    this.assetId = opts.assetId
    this.deactivatedBy = opts.deactivatedBy
  }
}
