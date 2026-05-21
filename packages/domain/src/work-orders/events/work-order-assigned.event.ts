import { BaseDomainEvent } from '../../events/base-domain-event.js'

const AGGREGATE_TYPE = 'WorkOrder'

/**
 * Raised when a technician is assigned to a work order.
 *
 * Downstream consumers: notification service (email/push to technician),
 * dashboard (assign count per technician), SLA tracker (start monitoring).
 */
export class WorkOrderAssignedEvent extends BaseDomainEvent {
  readonly eventType = 'WorkOrderAssigned' as const

  readonly tenantId: string

  /** The technician ID that was added to the assignment list. */
  readonly technicianId: string

  /** The user who performed the assignment. */
  readonly assignedById: string

  /** Full list of assignees after this assignment (snapshot). */
  readonly assigneeIds: readonly string[]

  constructor(opts: {
    aggregateId: string
    tenantId: string
    technicianId: string
    assignedById: string
    assigneeIds: readonly string[]
  }) {
    super(opts.aggregateId, AGGREGATE_TYPE)
    this.tenantId = opts.tenantId
    this.technicianId = opts.technicianId
    this.assignedById = opts.assignedById
    this.assigneeIds = [...opts.assigneeIds]
  }
}
