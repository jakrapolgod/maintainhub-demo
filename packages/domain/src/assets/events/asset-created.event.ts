import { BaseDomainEvent } from '../../events/base-domain-event.js'

const AGGREGATE_TYPE = 'Asset'

/**
 * Raised when a new asset is registered in the system.
 *
 * Downstream consumers: search index projection, KPI dashboard (asset count),
 * notification service (asset created alert for ADMIN).
 */
export class AssetCreatedEvent extends BaseDomainEvent {
  readonly eventType = 'AssetCreated' as const

  readonly tenantId: string

  readonly assetNumber: string

  readonly name: string

  readonly categoryId: string

  readonly criticality: string

  readonly createdById: string

  constructor(opts: {
    aggregateId: string
    tenantId: string
    assetNumber: string
    name: string
    categoryId: string
    criticality: string
    createdById: string
  }) {
    super(opts.aggregateId, AGGREGATE_TYPE)
    this.tenantId = opts.tenantId
    this.assetNumber = opts.assetNumber
    this.name = opts.name
    this.categoryId = opts.categoryId
    this.criticality = opts.criticality
    this.createdById = opts.createdById
  }
}
