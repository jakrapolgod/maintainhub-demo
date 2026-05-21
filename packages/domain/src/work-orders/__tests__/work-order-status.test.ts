import { DomainException } from '../../errors/domain.exception'
import { WorkOrderStatus } from '../value-objects/work-order-status'
import type { StatusValue } from '../value-objects/work-order-status'

// ── Construction ──────────────────────────────────────────────────────────────

describe('WorkOrderStatus — static instances', () => {
  const cases: StatusValue[] = ['DRAFT', 'OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']

  it.each(cases)('WorkOrderStatus.%s has correct value', (status) => {
    expect(WorkOrderStatus.from(status).value).toBe(status)
  })
})

// ── from() ────────────────────────────────────────────────────────────────────

describe('WorkOrderStatus.from()', () => {
  it('returns the canonical static instance (reference equality)', () => {
    expect(WorkOrderStatus.from('DRAFT')).toBe(WorkOrderStatus.DRAFT)
    expect(WorkOrderStatus.from('OPEN')).toBe(WorkOrderStatus.OPEN)
    expect(WorkOrderStatus.from('IN_PROGRESS')).toBe(WorkOrderStatus.IN_PROGRESS)
    expect(WorkOrderStatus.from('ON_HOLD')).toBe(WorkOrderStatus.ON_HOLD)
    expect(WorkOrderStatus.from('COMPLETED')).toBe(WorkOrderStatus.COMPLETED)
    expect(WorkOrderStatus.from('CANCELLED')).toBe(WorkOrderStatus.CANCELLED)
  })

  it('throws INVALID_STATUS for unknown value', () => {
    expect(() => WorkOrderStatus.from('PENDING')).toThrow(
      expect.objectContaining({ code: 'INVALID_STATUS' }),
    )
  })

  it('throws INVALID_STATUS for lowercase', () => {
    expect(() => WorkOrderStatus.from('draft')).toThrow(DomainException)
  })

  it('throws INVALID_STATUS for empty string', () => {
    expect(() => WorkOrderStatus.from('')).toThrow(DomainException)
  })
})

// ── canTransitionTo() ─────────────────────────────────────────────────────────

describe('WorkOrderStatus — canTransitionTo() valid transitions', () => {
  // Each tuple: [from, to]
  const validTransitions: [StatusValue, StatusValue][] = [
    ['DRAFT', 'OPEN'],
    ['DRAFT', 'CANCELLED'],
    ['OPEN', 'IN_PROGRESS'],
    ['OPEN', 'CANCELLED'],
    ['IN_PROGRESS', 'ON_HOLD'],
    ['IN_PROGRESS', 'COMPLETED'],
    ['IN_PROGRESS', 'CANCELLED'],
    ['ON_HOLD', 'IN_PROGRESS'],
    ['ON_HOLD', 'CANCELLED'],
  ]

  it.each(validTransitions)('%s → %s is allowed', (from, to) => {
    expect(WorkOrderStatus.from(from).canTransitionTo(WorkOrderStatus.from(to))).toBe(true)
  })
})

describe('WorkOrderStatus — canTransitionTo() invalid transitions', () => {
  const invalidTransitions: [StatusValue, StatusValue][] = [
    // Must open before starting
    ['DRAFT', 'IN_PROGRESS'],
    ['DRAFT', 'ON_HOLD'],
    ['DRAFT', 'COMPLETED'],
    // Cannot skip resume
    ['ON_HOLD', 'COMPLETED'],
    ['ON_HOLD', 'DRAFT'],
    ['ON_HOLD', 'OPEN'],
    // Terminal statuses have no exit
    ['COMPLETED', 'OPEN'],
    ['COMPLETED', 'IN_PROGRESS'],
    ['COMPLETED', 'CANCELLED'],
    ['COMPLETED', 'DRAFT'],
    ['CANCELLED', 'OPEN'],
    ['CANCELLED', 'IN_PROGRESS'],
    ['CANCELLED', 'COMPLETED'],
    ['CANCELLED', 'DRAFT'],
    // Cannot go backwards
    ['OPEN', 'DRAFT'],
    ['IN_PROGRESS', 'OPEN'],
    ['IN_PROGRESS', 'DRAFT'],
  ]

  it.each(invalidTransitions)('%s → %s is blocked', (from, to) => {
    expect(WorkOrderStatus.from(from).canTransitionTo(WorkOrderStatus.from(to))).toBe(false)
  })
})

// ── transitionTo() ────────────────────────────────────────────────────────────

describe('WorkOrderStatus — transitionTo()', () => {
  it('returns the new status on a valid transition', () => {
    const result = WorkOrderStatus.DRAFT.transitionTo(WorkOrderStatus.OPEN)
    expect(result.value).toBe('OPEN')
    expect(result).toBe(WorkOrderStatus.OPEN)
  })

  it('does not mutate the source status', () => {
    WorkOrderStatus.OPEN.transitionTo(WorkOrderStatus.IN_PROGRESS)
    expect(WorkOrderStatus.OPEN.value).toBe('OPEN')
  })

  it('throws INVALID_STATUS_TRANSITION on an invalid transition', () => {
    expect(() => WorkOrderStatus.DRAFT.transitionTo(WorkOrderStatus.IN_PROGRESS)).toThrow(
      expect.objectContaining({ code: 'INVALID_STATUS_TRANSITION' }),
    )
  })

  it('throws DomainException (not a generic Error) on invalid transition', () => {
    expect(() => WorkOrderStatus.COMPLETED.transitionTo(WorkOrderStatus.OPEN)).toThrow(
      DomainException,
    )
  })

  it('error message names the source and target statuses', () => {
    let message = ''
    try {
      WorkOrderStatus.ON_HOLD.transitionTo(WorkOrderStatus.COMPLETED)
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toContain('ON_HOLD')
    expect(message).toContain('COMPLETED')
  })

  it('chained valid transitions return correct final state', () => {
    const result = WorkOrderStatus.DRAFT.transitionTo(WorkOrderStatus.OPEN)
      .transitionTo(WorkOrderStatus.IN_PROGRESS)
      .transitionTo(WorkOrderStatus.ON_HOLD)
      .transitionTo(WorkOrderStatus.IN_PROGRESS)
      .transitionTo(WorkOrderStatus.COMPLETED)
    expect(result.value).toBe('COMPLETED')
  })
})

// ── isTerminal() ──────────────────────────────────────────────────────────────

describe('WorkOrderStatus — isTerminal()', () => {
  it.each(['COMPLETED', 'CANCELLED'] as StatusValue[])('%s is terminal', (s) => {
    expect(WorkOrderStatus.from(s).isTerminal()).toBe(true)
  })

  it.each(['DRAFT', 'OPEN', 'IN_PROGRESS', 'ON_HOLD'] as StatusValue[])(
    '%s is not terminal',
    (s) => {
      expect(WorkOrderStatus.from(s).isTerminal()).toBe(false)
    },
  )
})

// ── isActive() / isPending() ──────────────────────────────────────────────────

describe('WorkOrderStatus — isActive() and isPending()', () => {
  it('only IN_PROGRESS is active', () => {
    expect(WorkOrderStatus.IN_PROGRESS.isActive()).toBe(true)
    for (const s of ['DRAFT', 'OPEN', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] as StatusValue[]) {
      expect(WorkOrderStatus.from(s).isActive()).toBe(false)
    }
  })

  it('DRAFT and OPEN are pending', () => {
    expect(WorkOrderStatus.DRAFT.isPending()).toBe(true)
    expect(WorkOrderStatus.OPEN.isPending()).toBe(true)
  })

  it('other statuses are not pending', () => {
    for (const s of ['IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] as StatusValue[]) {
      expect(WorkOrderStatus.from(s).isPending()).toBe(false)
    }
  })
})

// ── equals() ─────────────────────────────────────────────────────────────────

describe('WorkOrderStatus — equals()', () => {
  it('same value returns true', () => {
    expect(WorkOrderStatus.OPEN.equals(WorkOrderStatus.OPEN)).toBe(true)
    expect(WorkOrderStatus.OPEN.equals(WorkOrderStatus.from('OPEN'))).toBe(true)
  })

  it('different values return false', () => {
    expect(WorkOrderStatus.OPEN.equals(WorkOrderStatus.DRAFT)).toBe(false)
  })
})

// ── toString() ────────────────────────────────────────────────────────────────

describe('WorkOrderStatus — toString()', () => {
  it('returns the status value string', () => {
    expect(WorkOrderStatus.IN_PROGRESS.toString()).toBe('IN_PROGRESS')
    expect(WorkOrderStatus.CANCELLED.toString()).toBe('CANCELLED')
  })
})
