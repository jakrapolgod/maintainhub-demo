import { BaseDomainEvent } from '../../events/base-domain-event.js'
import type { WOType } from '../work-order.types.js'

const AGGREGATE_TYPE = 'WorkOrder'

/**
 * Raised when a new work order is created.
 *
 * Downstream consumers: KPI counters (open WO backlog), notification service
 * (alert assigned technicians), audit projections.
 */
export class WorkOrderCreatedEvent extends BaseDomainEvent {
  readonly eventType = 'WorkOrderCreated' as const

  /** The human-readable work order reference number, e.g. `WO-2024-000042`. */
  readonly woNumber: string

  readonly tenantId: string

  readonly assetId: string

  readonly type: WOType

  readonly priority: string

  readonly createdById: string

  constructor(opts: {
    aggregateId: string
    woNumber: string
    tenantId: string
    assetId: string
    type: WOType
    priority: string
    createdById: string
  }) {
    super(opts.aggregateId, AGGREGATE_TYPE)
    this.woNumber = opts.woNumber
    this.tenantId = opts.tenantId
    this.assetId = opts.assetId
    this.type = opts.type
    this.priority = opts.priority
    this.createdById = opts.createdById
  }
}
