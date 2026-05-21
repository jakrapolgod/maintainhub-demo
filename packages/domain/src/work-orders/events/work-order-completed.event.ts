import type Decimal from 'decimal.js'
import { BaseDomainEvent } from '../../events/base-domain-event.js'

const AGGREGATE_TYPE = 'WorkOrder'

/**
 * Raised when a work order is completed.
 *
 * Carries cost and time summary metrics captured at the moment of closure —
 * these are immutable snapshots; they do not change if underlying records
 * are later amended in the application layer.
 *
 * Downstream consumers: MTTR/KPI projections, asset health scoring,
 * maintenance cost accounting, notification service (close alerts).
 */
export class WorkOrderCompletedEvent extends BaseDomainEvent {
  readonly eventType = 'WorkOrderCompleted' as const

  readonly tenantId: string

  readonly assetId: string

  /** The technician who triggered the completion. */
  readonly technicianId: string

  readonly resolution: string

  /**
   * Total maintenance cost at time of completion: labour + parts.
   * Computed as a dimensionless `Decimal` — currency is implicit from the
   * tenant context and not embedded in the event to keep it portable.
   */
  readonly totalCost: Decimal

  /**
   * Aggregate labour hours logged against this WO.
   * Sum of all `LaborEntry.cost.hours` at time of completion.
   */
  readonly laborHours: number

  constructor(opts: {
    aggregateId: string
    tenantId: string
    assetId: string
    technicianId: string
    resolution: string
    totalCost: Decimal
    laborHours: number
  }) {
    super(opts.aggregateId, AGGREGATE_TYPE)
    this.tenantId = opts.tenantId
    this.assetId = opts.assetId
    this.technicianId = opts.technicianId
    this.resolution = opts.resolution
    this.totalCost = opts.totalCost
    this.laborHours = opts.laborHours
  }
}
