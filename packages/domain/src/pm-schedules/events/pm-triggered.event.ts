import { BaseDomainEvent } from '../../events/base-domain-event.js'

const AGGREGATE_TYPE = 'PMSchedule'

export type TriggerSource = 'SCHEDULER' | 'MANUAL' | 'METER'

/**
 * Raised when a PM schedule fires and a work order draft should be created.
 *
 * Downstream consumers: work-order command handler (create WO from draft),
 * notification service, PM analytics projection.
 */
export class PMTriggeredEvent extends BaseDomainEvent {
  readonly eventType = 'PMTriggered' as const

  readonly tenantId: string

  readonly assetId: string

  readonly title: string

  readonly triggeredBy: TriggerSource

  readonly triggeredAt: Date

  readonly nextDueAt: Date | undefined

  constructor(opts: {
    aggregateId: string
    tenantId: string
    assetId: string
    title: string
    triggeredBy: TriggerSource
    triggeredAt: Date
    nextDueAt: Date | undefined
  }) {
    super(opts.aggregateId, AGGREGATE_TYPE)
    this.tenantId = opts.tenantId
    this.assetId = opts.assetId
    this.title = opts.title
    this.triggeredBy = opts.triggeredBy
    this.triggeredAt = opts.triggeredAt
    this.nextDueAt = opts.nextDueAt
  }
}
