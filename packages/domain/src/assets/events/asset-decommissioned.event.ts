import { BaseDomainEvent } from '../../events/base-domain-event.js'

const AGGREGATE_TYPE = 'Asset'

/**
 * Raised when an asset is permanently decommissioned.
 *
 * This is a terminal event — the asset can never return to an operational state.
 *
 * Downstream: close any OPEN/IN_PROGRESS work orders (or block decommission
 * in the command handler), archive asset in search index, update KPI dashboards
 * (active asset count -1), send notification to facility managers.
 */
export class AssetDecommissionedEvent extends BaseDomainEvent {
  readonly eventType = 'AssetDecommissioned' as const

  readonly tenantId: string

  readonly assetNumber: string

  readonly reason: string

  readonly authorizedBy: string

  constructor(opts: {
    aggregateId: string
    tenantId: string
    assetNumber: string
    reason: string
    authorizedBy: string
  }) {
    super(opts.aggregateId, AGGREGATE_TYPE)
    this.tenantId = opts.tenantId
    this.assetNumber = opts.assetNumber
    this.reason = opts.reason
    this.authorizedBy = opts.authorizedBy
  }
}
