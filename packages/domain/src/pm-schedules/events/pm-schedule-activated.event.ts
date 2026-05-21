import { BaseDomainEvent } from '../../events/base-domain-event.js'

const AGGREGATE_TYPE = 'PMSchedule'

/**
 * Raised when a PM schedule transitions from inactive → active.
 */
export class PMScheduleActivatedEvent extends BaseDomainEvent {
  readonly eventType = 'PMScheduleActivated' as const

  readonly tenantId: string

  readonly assetId: string

  readonly activatedBy: string

  constructor(opts: {
    aggregateId: string
    tenantId: string
    assetId: string
    activatedBy: string
  }) {
    super(opts.aggregateId, AGGREGATE_TYPE)
    this.tenantId = opts.tenantId
    this.assetId = opts.assetId
    this.activatedBy = opts.activatedBy
  }
}
