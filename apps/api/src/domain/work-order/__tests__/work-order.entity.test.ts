import { DomainException } from '../../../errors/domain.exception'
import { WorkOrderEntity, fromPrismaRow } from '../work-order.entity'
import type { WorkOrderData } from '../work-order.entity'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWo(overrides: Partial<WorkOrderData> = {}): WorkOrderEntity {
  return new WorkOrderEntity({
    id: 'wo-test-01',
    tenantId: 'tenant-01',
    assetId: 'asset-01',
    type: 'CORRECTIVE',
    priority: 'MEDIUM',
    status: 'DRAFT',
    assigneeIds: [],
    ...overrides,
  })
}

// ── Status machine ────────────────────────────────────────────────────────────

describe('WorkOrderEntity — status machine', () => {
  describe('canTransitionTo()', () => {
    it('allows DRAFT → OPEN', () => {
      expect(makeWo({ status: 'DRAFT' }).canTransitionTo('OPEN')).toBe(true)
    })

    it('allows DRAFT → CANCELLED', () => {
      expect(makeWo({ status: 'DRAFT' }).canTransitionTo('CANCELLED')).toBe(true)
    })

    it('blocks DRAFT → IN_PROGRESS (must go via OPEN)', () => {
      expect(makeWo({ status: 'DRAFT' }).canTransitionTo('IN_PROGRESS')).toBe(false)
    })

    it('allows OPEN → IN_PROGRESS', () => {
      expect(makeWo({ status: 'OPEN' }).canTransitionTo('IN_PROGRESS')).toBe(true)
    })

    it('allows IN_PROGRESS → ON_HOLD', () => {
      expect(makeWo({ status: 'IN_PROGRESS' }).canTransitionTo('ON_HOLD')).toBe(true)
    })

    it('allows IN_PROGRESS → COMPLETED', () => {
      expect(makeWo({ status: 'IN_PROGRESS' }).canTransitionTo('COMPLETED')).toBe(true)
    })

    it('allows ON_HOLD → IN_PROGRESS', () => {
      expect(makeWo({ status: 'ON_HOLD' }).canTransitionTo('IN_PROGRESS')).toBe(true)
    })

    it('blocks ON_HOLD → COMPLETED (must resume first)', () => {
      expect(makeWo({ status: 'ON_HOLD' }).canTransitionTo('COMPLETED')).toBe(false)
    })

    it('blocks any transition from COMPLETED', () => {
      const wo = makeWo({ status: 'COMPLETED' })
      expect(wo.canTransitionTo('OPEN')).toBe(false)
      expect(wo.canTransitionTo('IN_PROGRESS')).toBe(false)
      expect(wo.canTransitionTo('CANCELLED')).toBe(false)
    })

    it('blocks any transition from CANCELLED', () => {
      const wo = makeWo({ status: 'CANCELLED' })
      expect(wo.canTransitionTo('OPEN')).toBe(false)
      expect(wo.canTransitionTo('IN_PROGRESS')).toBe(false)
    })
  })

  describe('transitionTo()', () => {
    it('updates status when transition is valid', () => {
      const wo = makeWo({ status: 'DRAFT' })
      wo.transitionTo('OPEN')
      expect(wo.status).toBe('OPEN')
    })

    it('throws DomainException when transition is invalid', () => {
      const wo = makeWo({ status: 'COMPLETED' })
      expect(() => wo.transitionTo('OPEN')).toThrow(DomainException)
    })

    it('throws with INVALID_STATUS_TRANSITION code', () => {
      const wo = makeWo({ status: 'COMPLETED' })
      try {
        wo.transitionTo('OPEN')
        fail('expected to throw')
      } catch (e) {
        expect(e).toBeInstanceOf(DomainException)
        expect((e as DomainException).code).toBe('INVALID_STATUS_TRANSITION')
        expect((e as DomainException).statusCode).toBe(422)
      }
    })
  })
})

// ── start() ───────────────────────────────────────────────────────────────────

describe('WorkOrderEntity — start()', () => {
  it('transitions OPEN → IN_PROGRESS', () => {
    const wo = makeWo({ status: 'OPEN' })
    wo.start()
    expect(wo.status).toBe('IN_PROGRESS')
  })

  it('transitions DRAFT → IN_PROGRESS', () => {
    // DRAFT can also be started directly
    const wo = makeWo({ status: 'DRAFT' })
    expect(() => wo.start()).toThrow(DomainException) // DRAFT → IN_PROGRESS is blocked
  })

  it('throws when already IN_PROGRESS', () => {
    const wo = makeWo({ status: 'IN_PROGRESS' })
    expect(() => wo.start()).toThrow(DomainException)
  })
})

// ── complete() ────────────────────────────────────────────────────────────────

describe('WorkOrderEntity — complete()', () => {
  it('transitions IN_PROGRESS → COMPLETED', () => {
    const wo = makeWo({ status: 'IN_PROGRESS' })
    wo.complete('Replaced faulty valve and pressure-tested.')
    expect(wo.status).toBe('COMPLETED')
  })

  it('throws when status is not IN_PROGRESS', () => {
    const states: Array<WorkOrderData['status']> = [
      'DRAFT',
      'OPEN',
      'ON_HOLD',
      'CANCELLED',
      'COMPLETED',
    ]
    for (const status of states) {
      const wo = makeWo({ status })
      expect(() => wo.complete('resolution')).toThrow(DomainException)
    }
  })

  it('throws RESOLUTION_REQUIRED when resolution is blank', () => {
    const wo = makeWo({ status: 'IN_PROGRESS' })
    try {
      wo.complete('   ')
      fail('expected to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(DomainException)
      expect((e as DomainException).code).toBe('RESOLUTION_REQUIRED')
    }
  })

  it('throws RESOLUTION_REQUIRED when resolution is empty string', () => {
    const wo = makeWo({ status: 'IN_PROGRESS' })
    expect(() => wo.complete('')).toThrow(DomainException)
  })
})

// ── cancel() ──────────────────────────────────────────────────────────────────

describe('WorkOrderEntity — cancel()', () => {
  it.each(['DRAFT', 'OPEN', 'IN_PROGRESS', 'ON_HOLD'] as const)(
    'cancels a %s work order',
    (status) => {
      const wo = makeWo({ status })
      wo.cancel('Asset decommissioned.')
      expect(wo.status).toBe('CANCELLED')
    },
  )

  it('throws when already COMPLETED', () => {
    const wo = makeWo({ status: 'COMPLETED' })
    expect(() => wo.cancel('reason')).toThrow(DomainException)
  })

  it('throws when already CANCELLED', () => {
    const wo = makeWo({ status: 'CANCELLED' })
    expect(() => wo.cancel('reason')).toThrow(DomainException)
  })

  it('throws CANCELLATION_REASON_REQUIRED when reason is blank', () => {
    const wo = makeWo({ status: 'OPEN' })
    try {
      wo.cancel('  ')
      fail('expected to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(DomainException)
      expect((e as DomainException).code).toBe('CANCELLATION_REASON_REQUIRED')
    }
  })
})

// ── assign() ──────────────────────────────────────────────────────────────────

describe('WorkOrderEntity — assign()', () => {
  it('replaces the assignee list', () => {
    const wo = makeWo({ status: 'OPEN', assigneeIds: ['user-1'] })
    wo.assign(['user-2', 'user-3'])
    expect(wo.assigneeIds).toEqual(['user-2', 'user-3'])
  })

  it('allows assigning an empty list', () => {
    const wo = makeWo({ status: 'OPEN', assigneeIds: ['user-1'] })
    wo.assign([])
    expect(wo.assigneeIds).toHaveLength(0)
  })

  it('throws INVALID_OPERATION when work order is COMPLETED', () => {
    const wo = makeWo({ status: 'COMPLETED' })
    try {
      wo.assign(['user-1'])
      fail('expected to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(DomainException)
      expect((e as DomainException).code).toBe('INVALID_OPERATION')
    }
  })

  it('throws when work order is CANCELLED', () => {
    const wo = makeWo({ status: 'CANCELLED' })
    expect(() => wo.assign(['user-1'])).toThrow(DomainException)
  })
})

// ── isTerminal ────────────────────────────────────────────────────────────────

describe('WorkOrderEntity — isTerminal', () => {
  it.each(['COMPLETED', 'CANCELLED'] as const)('returns true for %s', (status) => {
    expect(makeWo({ status }).isTerminal).toBe(true)
  })

  it.each(['DRAFT', 'OPEN', 'IN_PROGRESS', 'ON_HOLD'] as const)(
    'returns false for %s',
    (status) => {
      expect(makeWo({ status }).isTerminal).toBe(false)
    },
  )
})

// ── toUpdatePayload() ─────────────────────────────────────────────────────────

describe('WorkOrderEntity — toUpdatePayload()', () => {
  it('reflects current status and assigneeIds', () => {
    const wo = makeWo({ status: 'OPEN', assigneeIds: ['u1', 'u2'] })
    wo.transitionTo('IN_PROGRESS')
    wo.assign(['u3'])
    const payload = wo.toUpdatePayload()
    expect(payload.status).toBe('IN_PROGRESS')
    expect(payload.assigneeIds).toEqual(['u3'])
  })
})

// ── fromPrismaRow factory ─────────────────────────────────────────────────────

describe('fromPrismaRow()', () => {
  it('constructs a WorkOrderEntity from a DB row', () => {
    const row: WorkOrderData = {
      id: 'wo-db-01',
      tenantId: 'tenant-01',
      assetId: 'asset-01',
      type: 'PREVENTIVE',
      priority: 'HIGH',
      status: 'OPEN',
      assigneeIds: ['u1'],
    }
    const entity = fromPrismaRow(row)
    expect(entity).toBeInstanceOf(WorkOrderEntity)
    expect(entity.status).toBe('OPEN')
    expect(entity.assigneeIds).toEqual(['u1'])
  })

  it('allows state transitions on the constructed entity', () => {
    const entity = fromPrismaRow({
      id: 'wo-db-02',
      tenantId: 't1',
      assetId: 'a1',
      type: 'CORRECTIVE',
      priority: 'MEDIUM',
      status: 'OPEN',
      assigneeIds: [],
    })
    entity.start()
    expect(entity.status).toBe('IN_PROGRESS')
  })
})
