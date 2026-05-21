import { BaseDomainEvent } from '../../events/base-domain-event.js'
import type { PriorityLevel } from '../value-objects/priority.js'

const AGGREGATE_TYPE = 'WorkOrder'

/**
 * Raised when a work order's priority is escalated one level.
 *
 * Downstream consumers: notification service (alert managers),
 * SLA tracker (tighten response deadline), dashboard priority queue.
 */
export class WorkOrderEscalatedEvent extends BaseDomainEvent {
  readonly eventType = 'WorkOrderEscalated' as const

  readonly tenantId: string

  readonly fromPriority: PriorityLevel

  readonly toPriority: PriorityLevel

  constructor(opts: {
    aggregateId: string
    tenantId: string
    fromPriority: PriorityLevel
    toPriority: PriorityLevel
  }) {
    super(opts.aggregateId, AGGREGATE_TYPE)
    this.tenantId = opts.tenantId
    this.fromPriority = opts.fromPriority
    this.toPriority = opts.toPriority
  }
}
