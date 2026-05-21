import Decimal from 'decimal.js'
import { DomainException } from '../errors/domain.exception.js'
import type { DomainEvent } from '../events/domain-event.js'
import { Priority } from './value-objects/priority.js'
import type { PriorityLevel } from './value-objects/priority.js'
import type { PermitToWork } from './value-objects/permit-to-work.js'
import { type WorkOrderId } from './value-objects/work-order-id.js'
import { WorkOrderStatus } from './value-objects/work-order-status.js'
import { WorkOrderAssignedEvent } from './events/work-order-assigned.event.js'
import { WorkOrderCancelledEvent } from './events/work-order-cancelled.event.js'
import { WorkOrderCompletedEvent } from './events/work-order-completed.event.js'
import { WorkOrderCreatedEvent } from './events/work-order-created.event.js'
import { WorkOrderEscalatedEvent } from './events/work-order-escalated.event.js'
import type { Attachment, LaborEntry, PartUsage, WOType } from './work-order.types.js'

// ── Priority escalation table ─────────────────────────────────────────────────

/** Maps each non-maximum priority to the next level up. */
const NEXT_PRIORITY: Partial<Record<PriorityLevel, PriorityLevel>> = {
  LOW: 'MEDIUM',
  MEDIUM: 'HIGH',
  HIGH: 'CRITICAL',
  // CRITICAL has no next — escalate() will throw
}

// ── Mutable state ─────────────────────────────────────────────────────────────

/** All state that can change after the aggregate is created. */
interface MutableState {
  status: WorkOrderStatus
  priority: Priority
  assigneeIds: string[]
  laborEntries: LaborEntry[]
  partUsages: PartUsage[]
  attachments: Attachment[]
  permitToWork: PermitToWork | undefined
  resolution: string | undefined
  startedAt: Date | undefined
  completedAt: Date | undefined
  cancelledAt: Date | undefined
  updatedAt: Date
}

// ── Construction props ────────────────────────────────────────────────────────

/**
 * Input shape for `WorkOrder.reconstitute()`.
 *
 * All fields required to restore the aggregate to its persisted state.
 * Optional fields may be absent (never `undefined` — `exactOptionalPropertyTypes` is active).
 */
export interface WorkOrderProps {
  id: WorkOrderId
  tenantId: string
  woNumber: string
  title: string
  type: WOType
  priority: Priority
  status: WorkOrderStatus
  assetId: string
  createdById: string
  createdAt: Date
  updatedAt: Date
  description?: string
  assigneeIds?: readonly string[]
  laborEntries?: readonly LaborEntry[]
  partUsages?: readonly PartUsage[]
  attachments?: readonly Attachment[]
  permitToWork?: PermitToWork
  slaDeadline?: Date
  parentWorkOrderId?: WorkOrderId
  failureCodeId?: string
  resolution?: string
  startedAt?: Date
  completedAt?: Date
  cancelledAt?: Date
}

// ── Aggregate root ────────────────────────────────────────────────────────────

/**
 * WorkOrder Aggregate Root.
 *
 * All business-rule enforcement lives here. The application layer orchestrates
 * persistence and side effects; the aggregate enforces *what* is allowed.
 *
 * ## Immutability contract
 * - Properties declared `readonly` on the class are set once at construction and
 *   never change (identity, context, timestamps).
 * - Mutable state (status, priority, collections, etc.) lives in a private `state`
 *   object. External consumers read it via getters; only business methods mutate it.
 *
 * ## Domain events
 * - Business methods that produce observable side effects push events to the
 *   internal `domainEvents` array.
 * - The application layer calls `pullEvents()` after the aggregate is persisted to
 *   dispatch the events to subscribers.
 *
 * ## Reconstruction vs creation
 * - `WorkOrder.reconstitute(props)` restores an existing aggregate from persistent
 *   storage. It runs NO business-rule validation and raises NO domain events.
 *   Use this in repositories when loading from the database.
 */
export class WorkOrder {
  // ── Immutable identity ───────────────────────────────────────────────────────

  readonly id: WorkOrderId

  readonly tenantId: string

  readonly woNumber: string

  readonly title: string

  readonly description: string | undefined

  readonly type: WOType

  readonly assetId: string

  readonly slaDeadline: Date | undefined

  readonly parentWorkOrderId: WorkOrderId | undefined

  readonly failureCodeId: string | undefined

  readonly createdById: string

  readonly createdAt: Date

  // ── Mutable state (private, exposed via getters) ─────────────────────────────

  private state: MutableState

  // ── Domain events (cleared by pullEvents) ────────────────────────────────────

  private readonly domainEvents: DomainEvent[]

  // ── Constructor ──────────────────────────────────────────────────────────────

  private constructor(props: WorkOrderProps) {
    this.id = props.id
    this.tenantId = props.tenantId
    this.woNumber = props.woNumber
    this.title = props.title
    this.description = props.description
    this.type = props.type
    this.assetId = props.assetId
    this.slaDeadline = props.slaDeadline
    this.parentWorkOrderId = props.parentWorkOrderId
    this.failureCodeId = props.failureCodeId
    this.createdById = props.createdById
    this.createdAt = props.createdAt

    this.state = {
      status: props.status,
      priority: props.priority,
      assigneeIds: props.assigneeIds ? [...props.assigneeIds] : [],
      laborEntries: props.laborEntries ? [...props.laborEntries] : [],
      partUsages: props.partUsages ? [...props.partUsages] : [],
      attachments: props.attachments ? [...props.attachments] : [],
      permitToWork: props.permitToWork,
      resolution: props.resolution,
      startedAt: props.startedAt,
      completedAt: props.completedAt,
      cancelledAt: props.cancelledAt,
      updatedAt: props.updatedAt,
    }

    this.domainEvents = []
  }

  // ── Static factory ────────────────────────────────────────────────────────────

  /**
   * Restore a WorkOrder aggregate from its persisted state.
   *
   * This is the only way to construct a WorkOrder instance outside this module.
   * It deliberately skips all business-rule checks — the assumption is that the
   * data was valid when it was first persisted.
   */
  /**
   * Create a brand-new WorkOrder.
   *
   * The caller (application service) is responsible for:
   *  1. Generating a new `WorkOrderId` (`new WorkOrderId(cuid())`)
   *  2. Calling `repository.nextWONumber(tenantId)` to get the sequential number
   *
   * The aggregate starts in DRAFT status so managers can review it before
   * it is assigned and started.
   *
   * Emits: WorkOrderCreatedEvent
   */
  static create(props: {
    id: WorkOrderId
    tenantId: string
    woNumber: string
    title: string
    type: WOType
    priority: Priority
    assetId: string
    createdById: string
    description?: string
    slaDeadline?: Date
    parentWorkOrderId?: WorkOrderId
  }): WorkOrder {
    const now = new Date()

    const wo = new WorkOrder({
      id: props.id,
      tenantId: props.tenantId,
      woNumber: props.woNumber,
      title: props.title,
      type: props.type,
      priority: props.priority,
      status: WorkOrderStatus.DRAFT,
      assetId: props.assetId,
      createdById: props.createdById,
      createdAt: now,
      updatedAt: now,
      ...(props.description !== undefined && { description: props.description }),
      ...(props.slaDeadline !== undefined && { slaDeadline: props.slaDeadline }),
      ...(props.parentWorkOrderId !== undefined && { parentWorkOrderId: props.parentWorkOrderId }),
    })

    wo.domainEvents.push(
      new WorkOrderCreatedEvent({
        aggregateId: props.id.value,
        woNumber: props.woNumber,
        tenantId: props.tenantId,
        assetId: props.assetId,
        type: props.type,
        priority: props.priority.value,
        createdById: props.createdById,
      }),
    )

    return wo
  }

  /**
   * Restore a WorkOrder aggregate from its persisted state.
   *
   * Deliberately skips all business-rule checks — the assumption is that the
   * data was valid when it was first persisted. No domain events are emitted.
   */
  static reconstitute(props: WorkOrderProps): WorkOrder {
    return new WorkOrder(props)
  }

  // ── Getters ───────────────────────────────────────────────────────────────────

  get status(): WorkOrderStatus {
    return this.state.status
  }

  get priority(): Priority {
    return this.state.priority
  }

  /** Returns a shallow copy — external mutations do not affect aggregate state. */
  get assigneeIds(): readonly string[] {
    return [...this.state.assigneeIds]
  }

  /** Returns a shallow copy — external mutations do not affect aggregate state. */
  get laborEntries(): readonly LaborEntry[] {
    return [...this.state.laborEntries]
  }

  /** Returns a shallow copy — external mutations do not affect aggregate state. */
  get partUsages(): readonly PartUsage[] {
    return [...this.state.partUsages]
  }

  /** Returns a shallow copy — external mutations do not affect aggregate state. */
  get attachments(): readonly Attachment[] {
    return [...this.state.attachments]
  }

  get permitToWork(): PermitToWork | undefined {
    return this.state.permitToWork
  }

  get resolution(): string | undefined {
    return this.state.resolution
  }

  get startedAt(): Date | undefined {
    return this.state.startedAt
  }

  get completedAt(): Date | undefined {
    return this.state.completedAt
  }

  get cancelledAt(): Date | undefined {
    return this.state.cancelledAt
  }

  get updatedAt(): Date {
    return this.state.updatedAt
  }

  // ── Domain events ─────────────────────────────────────────────────────────────

  /**
   * Returns all domain events raised since the last call (or since construction),
   * and clears the internal buffer.
   *
   * The application layer must call this *after* persisting the aggregate so that
   * events are only dispatched once the state change is durable.
   */
  pullEvents(): DomainEvent[] {
    const events = [...this.domainEvents]
    this.domainEvents.length = 0
    return events
  }

  // ── Business methods ──────────────────────────────────────────────────────────

  /**
   * Assign a technician to this work order.
   *
   * Rule: the work order must be OPEN or IN_PROGRESS to accept assignments.
   * Technicians can be re-assigned while work is in progress; assignments are
   * additive (a technician ID appears at most once in the list).
   */
  assign(technicianId: string, assignedBy: string): void {
    const allowed =
      this.state.status.equals(WorkOrderStatus.OPEN) ||
      this.state.status.equals(WorkOrderStatus.IN_PROGRESS)

    if (!allowed) {
      throw new DomainException(
        `Cannot assign a technician to a ${this.state.status.value} work order — must be OPEN or IN_PROGRESS`,
        'INVALID_ASSIGNMENT',
      )
    }

    const isNewAssignee = !this.state.assigneeIds.includes(technicianId)

    if (isNewAssignee) {
      this.state.assigneeIds = [...this.state.assigneeIds, technicianId]
    }

    this.touch()

    // Emit assignment event even for re-assignments so the notification service
    // can alert the newly added technician. Idempotency is the subscriber's concern.
    this.domainEvents.push(
      new WorkOrderAssignedEvent({
        aggregateId: this.id.value,
        tenantId: this.tenantId,
        technicianId,
        assignedById: assignedBy,
        assigneeIds: this.state.assigneeIds,
      }),
    )
  }

  /**
   * Start work — transitions the work order from OPEN to IN_PROGRESS.
   *
   * Rule: only an OPEN work order can be started. A DRAFT work order must be
   * opened first; a work order already IN_PROGRESS cannot be restarted.
   */
  start(technicianId: string): void {
    void technicianId // recorded in audit log by the application layer

    if (!this.state.status.equals(WorkOrderStatus.OPEN)) {
      throw new DomainException(
        `Cannot start a work order that is ${this.state.status.value} — it must be OPEN first`,
        'INVALID_START',
      )
    }

    this.state.status = WorkOrderStatus.IN_PROGRESS
    this.state.startedAt = new Date()
    this.touch()
  }

  /**
   * Complete the work order, recording the resolution.
   *
   * Rules:
   *  1. Status must be IN_PROGRESS.
   *  2. If a Permit To Work is attached, it must be signed before completion.
   *  3. Resolution must be a non-empty description of what was done.
   *
   * Emits: WorkOrderCompletedEvent
   */
  complete(technicianId: string, resolution: string): void {
    if (!this.state.status.equals(WorkOrderStatus.IN_PROGRESS)) {
      throw new DomainException(
        `Cannot complete a work order that is ${this.state.status.value} — it must be IN_PROGRESS`,
        'INVALID_COMPLETION',
      )
    }

    if (this.state.permitToWork && !this.state.permitToWork.isSigned()) {
      throw new DomainException(
        `Work order ${this.woNumber} has an unsigned Permit To Work — it must be signed before completion`,
        'PTW_NOT_SIGNED',
      )
    }

    if (!resolution.trim()) {
      throw new DomainException(
        'A resolution description is required to complete a work order',
        'RESOLUTION_REQUIRED',
      )
    }

    this.state.status = WorkOrderStatus.COMPLETED
    this.state.resolution = resolution.trim()
    this.state.completedAt = new Date()
    this.touch()

    // Compute cost/time summary at the moment of closure — these become
    // immutable facts in the event, insulated from future record amendments.
    const laborHours = this.state.laborEntries.reduce((sum, e) => sum + e.cost.hours, 0)
    const totalCost = this.state.laborEntries
      .reduce((sum, e) => sum.add(e.cost.total().amount), new Decimal(0))
      .add(
        this.state.partUsages.reduce(
          (sum, u) => sum.add(u.unitCost.amount.mul(u.quantity)),
          new Decimal(0),
        ),
      )

    this.domainEvents.push(
      new WorkOrderCompletedEvent({
        aggregateId: this.id.value,
        tenantId: this.tenantId,
        assetId: this.assetId,
        technicianId,
        resolution: this.state.resolution,
        totalCost,
        laborHours,
      }),
    )
  }

  /**
   * Put the work order on hold while work is paused (waiting for parts, approval, etc.).
   *
   * Rule: only an IN_PROGRESS work order can be held.
   */
  hold(reason: string): void {
    if (!reason.trim()) {
      throw new DomainException(
        'A reason is required to put a work order on hold',
        'HOLD_REASON_REQUIRED',
      )
    }

    if (!this.state.status.equals(WorkOrderStatus.IN_PROGRESS)) {
      throw new DomainException(
        `Cannot put a ${this.state.status.value} work order on hold — it must be IN_PROGRESS`,
        'INVALID_HOLD',
      )
    }

    this.state.status = WorkOrderStatus.ON_HOLD
    this.touch()
  }

  /**
   * Cancel the work order.
   *
   * Rule: a COMPLETED work order cannot be cancelled — it is an immutable record.
   * All other statuses (DRAFT, OPEN, IN_PROGRESS, ON_HOLD) allow cancellation.
   *
   * Emits: WorkOrderCancelledEvent
   */
  cancel(reason: string, cancelledBy: string): void {
    if (!reason.trim()) {
      throw new DomainException(
        'A reason is required to cancel a work order',
        'CANCEL_REASON_REQUIRED',
      )
    }

    if (this.state.status.equals(WorkOrderStatus.COMPLETED)) {
      throw new DomainException(
        'Cannot cancel a completed work order — it is an immutable record',
        'CANNOT_CANCEL_COMPLETED',
      )
    }

    if (this.state.status.equals(WorkOrderStatus.CANCELLED)) {
      throw new DomainException('Work order is already cancelled', 'ALREADY_CANCELLED')
    }

    this.state.status = WorkOrderStatus.CANCELLED
    this.state.cancelledAt = new Date()
    this.touch()

    this.domainEvents.push(
      new WorkOrderCancelledEvent({
        aggregateId: this.id.value,
        tenantId: this.tenantId,
        cancelledById: cancelledBy,
        reason: reason.trim(),
      }),
    )
  }

  /**
   * Add a labour time entry to the work order.
   *
   * Rule: labour can only be logged while work is actively IN_PROGRESS.
   * Time entries cannot be back-filled after the work order is completed or
   * cancelled — that is an application-layer concern (use reconstitute for import).
   */
  addLabor(entry: LaborEntry): void {
    if (!this.state.status.equals(WorkOrderStatus.IN_PROGRESS)) {
      throw new DomainException(
        `Labour entries can only be added to IN_PROGRESS work orders (current status: ${this.state.status.value})`,
        'INVALID_LABOR_ADD',
      )
    }

    this.state.laborEntries = [...this.state.laborEntries, entry]
    this.touch()
  }

  /**
   * Record a spare part used during this work order.
   *
   * Deducts from the reserved stock bucket for this WO by recording the usage.
   * The inventory bounded context reacts to `PartUsage` persistence to update
   * physical stock levels — this aggregate does not own the inventory.
   *
   * Rule: parts can only be recorded while the work order is not yet terminal
   * (COMPLETED or CANCELLED).
   */
  usePart(usage: PartUsage): void {
    if (this.state.status.isTerminal()) {
      throw new DomainException(
        `Cannot record part usage on a ${this.state.status.value} work order`,
        'INVALID_PART_USAGE',
      )
    }

    this.state.partUsages = [...this.state.partUsages, usage]
    this.touch()
  }

  /**
   * Escalate the priority one level (LOW→MEDIUM→HIGH→CRITICAL).
   *
   * Rule: CRITICAL is already the highest priority — escalation throws.
   *
   * Emits: WorkOrderEscalatedEvent
   */
  escalate(): void {
    const nextLevel = NEXT_PRIORITY[this.state.priority.value]

    if (nextLevel === undefined) {
      throw new DomainException(
        `Work order ${this.woNumber} is already at the highest priority (CRITICAL)`,
        'ALREADY_MAX_PRIORITY',
      )
    }

    const fromPriority = this.state.priority.value
    this.state.priority = Priority.from(nextLevel)
    this.touch()

    this.domainEvents.push(
      new WorkOrderEscalatedEvent({
        aggregateId: this.id.value,
        tenantId: this.tenantId,
        fromPriority,
        toPriority: nextLevel,
      }),
    )
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  /** Stamp updatedAt on every mutation so the repository can detect dirty state. */
  private touch(): void {
    this.state.updatedAt = new Date()
  }
}
