import type { Priority, WOStatus, WOType } from '@prisma/client'
import { DomainException } from '../../errors/domain.exception'

// ── Status machine ────────────────────────────────────────────────────────────

const TRANSITIONS: Readonly<Record<WOStatus, readonly WOStatus[]>> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

// ── Construction data ─────────────────────────────────────────────────────────

export interface WorkOrderData {
  id: string
  tenantId: string
  assetId: string
  type: WOType
  priority: Priority
  status: WOStatus
  assigneeIds: readonly string[]
}

// ── Entity ────────────────────────────────────────────────────────────────────

/**
 * WorkOrder aggregate root.
 *
 * All business-rule enforcement lives here. Controllers and services
 * orchestrate persistence; they never contain validation logic.
 *
 * Mutable fields (status, assigneeIds) are intentionally public — the entity's
 * value is in enforcing valid transitions, not in hiding state. The service
 * reads the mutated values back after each operation to persist them.
 */
export class WorkOrderEntity {
  readonly id: string

  readonly tenantId: string

  readonly assetId: string

  readonly type: WOType

  readonly priority: Priority

  /** Current status — mutated by transition helpers. */
  status: WOStatus

  /** Ordered list of assigned technician IDs — mutated by assign(). */
  assigneeIds: string[]

  constructor(data: WorkOrderData) {
    this.id = data.id
    this.tenantId = data.tenantId
    this.assetId = data.assetId
    this.type = data.type
    this.priority = data.priority
    this.status = data.status
    this.assigneeIds = [...data.assigneeIds]
  }

  get isTerminal(): boolean {
    return this.status === 'COMPLETED' || this.status === 'CANCELLED'
  }

  // ── Status machine ──────────────────────────────────────────────────────────

  canTransitionTo(next: WOStatus): boolean {
    return (TRANSITIONS[this.status] as readonly WOStatus[]).includes(next)
  }

  transitionTo(next: WOStatus): void {
    if (!this.canTransitionTo(next)) {
      throw new DomainException(
        `Cannot move a work order from ${this.status} to ${next}`,
        'INVALID_STATUS_TRANSITION',
        422,
      )
    }
    this.status = next
  }

  // ── Named operations ────────────────────────────────────────────────────────

  start(): void {
    this.transitionTo('IN_PROGRESS')
  }

  complete(resolution: string): void {
    if (this.status !== 'IN_PROGRESS') {
      throw new DomainException(
        'Only in-progress work orders can be completed',
        'INVALID_STATUS_TRANSITION',
        422,
      )
    }
    if (!resolution.trim()) {
      throw new DomainException(
        'A resolution description is required to close a work order',
        'RESOLUTION_REQUIRED',
        422,
      )
    }
    this.status = 'COMPLETED'
  }

  cancel(reason: string): void {
    if (this.isTerminal) {
      throw new DomainException(
        `Cannot cancel a work order that is already ${this.status.toLowerCase()}`,
        'INVALID_STATUS_TRANSITION',
        422,
      )
    }
    if (!reason.trim()) {
      throw new DomainException(
        'A cancellation reason is required',
        'CANCELLATION_REASON_REQUIRED',
        422,
      )
    }
    this.status = 'CANCELLED'
  }

  assign(technicianIds: string[]): void {
    if (this.isTerminal) {
      throw new DomainException(
        `Cannot reassign a work order that is ${this.status.toLowerCase()}`,
        'INVALID_OPERATION',
        422,
      )
    }
    this.assigneeIds = [...technicianIds]
  }

  toUpdatePayload(): { status: WOStatus; assigneeIds: string[] } {
    return { status: this.status, assigneeIds: this.assigneeIds }
  }
}

export function fromPrismaRow(row: WorkOrderData): WorkOrderEntity {
  return new WorkOrderEntity(row)
}
