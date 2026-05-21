import { BaseDomainEvent } from '../../events/base-domain-event.js'

const AGGREGATE_TYPE = 'Asset'

/**
 * Raised when an asset is physically relocated to a different location.
 *
 * Downstream: update location-based work order routing rules, alert
 * maintenance teams responsible for the new location, update floor-plan
 * visualisations.
 */
export class AssetTransferredEvent extends BaseDomainEvent {
  readonly eventType = 'AssetTransferred' as const

  readonly tenantId: string

  readonly assetNumber: string

  readonly previousLocationId: string | undefined

  readonly newLocationId: string

  readonly transferredBy: string

  constructor(opts: {
    aggregateId: string
    tenantId: string
    assetNumber: string
    previousLocationId?: string
    newLocationId: string
    transferredBy: string
  }) {
    super(opts.aggregateId, AGGREGATE_TYPE)
    this.tenantId = opts.tenantId
    this.assetNumber = opts.assetNumber
    this.previousLocationId = opts.previousLocationId
    this.newLocationId = opts.newLocationId
    this.transferredBy = opts.transferredBy
  }
}
