import { DomainException } from '../../errors/domain.exception.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type StatusValue = 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED'

const VALID_STATUSES = new Set<StatusValue>([
  'DRAFT',
  'OPEN',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
])

// ── Transition table ──────────────────────────────────────────────────────────
//
// Each entry lists the statuses that are reachable from the current one.
// Terminal statuses (COMPLETED, CANCELLED) have empty sets — no exit.
//
// Business rules encoded here:
//  • A DRAFT WO must be explicitly opened before work begins.
//  • An IN_PROGRESS WO can be held (waiting for parts/approval) but cannot
//    jump straight to COMPLETED from ON_HOLD — the technician must resume.
//  • Cancellation is available from every non-terminal state.

const TRANSITIONS: Readonly<Record<StatusValue, ReadonlySet<StatusValue>>> = {
  DRAFT: new Set<StatusValue>(['OPEN', 'CANCELLED']),
  OPEN: new Set<StatusValue>(['IN_PROGRESS', 'CANCELLED']),
  IN_PROGRESS: new Set<StatusValue>(['ON_HOLD', 'COMPLETED', 'CANCELLED']),
  ON_HOLD: new Set<StatusValue>(['IN_PROGRESS', 'CANCELLED']),
  COMPLETED: new Set<StatusValue>(), // terminal — no transitions
  CANCELLED: new Set<StatusValue>(), // terminal — no transitions
}

// ── Value object ──────────────────────────────────────────────────────────────

/**
 * Work order lifecycle status with an embedded transition guard.
 *
 * `canTransitionTo(next)` is a pure query — use it to build UI state (enable /
 * disable buttons) without triggering side effects.
 *
 * `transitionTo(next)` returns a new WorkOrderStatus if the transition is valid,
 * or throws DomainException if it is not — use it in command handlers that
 * mutate aggregate state.
 */
export class WorkOrderStatus {
  readonly value: StatusValue

  private constructor(value: StatusValue) {
    this.value = value
  }

  // ── Static factories ────────────────────────────────────────────────────────

  static readonly DRAFT = new WorkOrderStatus('DRAFT')

  static readonly OPEN = new WorkOrderStatus('OPEN')

  static readonly IN_PROGRESS = new WorkOrderStatus('IN_PROGRESS')

  static readonly ON_HOLD = new WorkOrderStatus('ON_HOLD')

  static readonly COMPLETED = new WorkOrderStatus('COMPLETED')

  static readonly CANCELLED = new WorkOrderStatus('CANCELLED')

  /** Deserialise from a raw string. Throws for unknown values. */
  static from(value: string): WorkOrderStatus {
    if (!VALID_STATUSES.has(value as StatusValue)) {
      throw new DomainException(
        `"${value}" is not a valid WorkOrderStatus. Expected one of: ${[...VALID_STATUSES].join(', ')}`,
        'INVALID_STATUS',
      )
    }
    // Return canonical static instance
    switch (value as StatusValue) {
      case 'DRAFT':
        return WorkOrderStatus.DRAFT
      case 'OPEN':
        return WorkOrderStatus.OPEN
      case 'IN_PROGRESS':
        return WorkOrderStatus.IN_PROGRESS
      case 'ON_HOLD':
        return WorkOrderStatus.ON_HOLD
      case 'COMPLETED':
        return WorkOrderStatus.COMPLETED
      case 'CANCELLED':
        return WorkOrderStatus.CANCELLED
      /* istanbul ignore next */
      default:
        throw new DomainException(`Unhandled status: ${value}`, 'INVALID_STATUS')
    }
  }

  // ── Transition machine ──────────────────────────────────────────────────────

  /**
   * Pure query: returns true when moving from the current status to `next`
   * is permitted by the transition table.
   *
   * Does NOT throw — safe to call in UI render paths.
   */
  canTransitionTo(next: WorkOrderStatus): boolean {
    return TRANSITIONS[this.value].has(next.value)
  }

  /**
   * Command: returns a new WorkOrderStatus representing `next`.
   *
   * Throws DomainException when the transition is not allowed, preserving
   * the invariant that a WO can only move through valid lifecycle steps.
   */
  transitionTo(next: WorkOrderStatus): WorkOrderStatus {
    if (!this.canTransitionTo(next)) {
      throw new DomainException(
        `Cannot transition a work order from ${this.value} to ${next.value}`,
        'INVALID_STATUS_TRANSITION',
      )
    }
    return next
  }

  // ── Status predicates ───────────────────────────────────────────────────────

  /**
   * Terminal statuses cannot be transitioned out of.
   * Business rule: once complete or cancelled, a WO is immutable.
   */
  isTerminal(): boolean {
    return this.value === 'COMPLETED' || this.value === 'CANCELLED'
  }

  /** True while the WO is actively being worked on. */
  isActive(): boolean {
    return this.value === 'IN_PROGRESS'
  }

  /** True when the WO is waiting but not yet started. */
  isPending(): boolean {
    return this.value === 'DRAFT' || this.value === 'OPEN'
  }

  // ── Equality ────────────────────────────────────────────────────────────────

  equals(other: WorkOrderStatus): boolean {
    return this.value === other.value
  }

  // ── Convenience ─────────────────────────────────────────────────────────────

  toString(): string {
    return this.value
  }
}
