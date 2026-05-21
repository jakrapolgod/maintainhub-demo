import { DomainException } from '../../errors/domain.exception'
import {
  WorkOrderAssignedEvent,
  WorkOrderCancelledEvent,
  WorkOrderCompletedEvent,
  WorkOrderCreatedEvent,
  WorkOrderEscalatedEvent,
} from '../events'
import { LaborCost } from '../value-objects/labor-cost'
import { Money } from '../value-objects/money'
import { PermitToWork } from '../value-objects/permit-to-work'
import { Priority } from '../value-objects/priority'
import { WorkOrderId } from '../value-objects/work-order-id'
import { WorkOrderStatus } from '../value-objects/work-order-status'
import { WorkOrder } from '../WorkOrder'
import type { WorkOrderProps } from '../WorkOrder'
import type { LaborEntry, PartUsage } from '../work-order.types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_ID = 'clh7z2d1h0000z1x1z1x1z1x1'
const VALID_ID2 = 'cm9pq3r2i0000ymbj1nhq1zr2'
const THB = (n: number) => new Money(n, 'THB')

const BASE_PROPS: WorkOrderProps = {
  id: new WorkOrderId(VALID_ID),
  tenantId: 'tenant-1',
  woNumber: 'WO-2024-000001',
  title: 'Fix pump P-101',
  type: 'CORRECTIVE',
  priority: Priority.MEDIUM,
  status: WorkOrderStatus.OPEN,
  assetId: 'asset-1',
  createdById: 'user-1',
  createdAt: new Date('2024-01-01T08:00:00Z'),
  updatedAt: new Date('2024-01-01T08:00:00Z'),
}

function makeWO(overrides: Partial<WorkOrderProps> = {}): WorkOrder {
  return WorkOrder.reconstitute({ ...BASE_PROPS, ...overrides })
}

function makeLaborEntry(overrides: Partial<LaborEntry> = {}): LaborEntry {
  return {
    id: 'le-1',
    technicianId: 'tech-1',
    date: new Date(),
    cost: new LaborCost(2, THB(500)),
    description: undefined,
    ...overrides,
  }
}

function makePartUsage(overrides: Partial<PartUsage> = {}): PartUsage {
  return {
    id: 'pu-1',
    partId: 'part-1',
    quantity: 2,
    unitCost: THB(100),
    usedAt: new Date(),
    ...overrides,
  }
}

// ── reconstitute() ────────────────────────────────────────────────────────────

// ── create() ─────────────────────────────────────────────────────────────────

describe('WorkOrder.create()', () => {
  const CREATE_PROPS = {
    id: new WorkOrderId(VALID_ID),
    tenantId: 'tenant-1',
    woNumber: 'WO-2024-000001',
    title: 'Fix pump P-101',
    type: 'CORRECTIVE' as const,
    priority: Priority.HIGH,
    assetId: 'asset-1',
    createdById: 'user-1',
  }

  it('creates a DRAFT work order', () => {
    const wo = WorkOrder.create(CREATE_PROPS)
    expect(wo.status.value).toBe('DRAFT')
  })

  it('sets all required fields', () => {
    const wo = WorkOrder.create(CREATE_PROPS)
    expect(wo.id.value).toBe(VALID_ID)
    expect(wo.woNumber).toBe('WO-2024-000001')
    expect(wo.priority.value).toBe('HIGH')
    expect(wo.type).toBe('CORRECTIVE')
  })

  it('sets createdAt close to now', () => {
    const before = Date.now()
    const wo = WorkOrder.create(CREATE_PROPS)
    expect(wo.createdAt.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('includes description when provided', () => {
    const wo = WorkOrder.create({ ...CREATE_PROPS, description: 'Seal worn out' })
    expect(wo.description).toBe('Seal worn out')
  })

  it('includes slaDeadline when provided', () => {
    const deadline = new Date('2024-12-31')
    const wo = WorkOrder.create({ ...CREATE_PROPS, slaDeadline: deadline })
    expect(wo.slaDeadline).toEqual(deadline)
  })

  it('includes parentWorkOrderId when provided', () => {
    const parentId = new WorkOrderId(VALID_ID2)
    const wo = WorkOrder.create({ ...CREATE_PROPS, parentWorkOrderId: parentId })
    expect(wo.parentWorkOrderId?.value).toBe(VALID_ID2)
  })

  it('emits WorkOrderCreatedEvent', () => {
    const wo = WorkOrder.create(CREATE_PROPS)
    const events = wo.pullEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toBeInstanceOf(WorkOrderCreatedEvent)
  })

  it('created event carries the correct payload', () => {
    const wo = WorkOrder.create(CREATE_PROPS)
    const event = wo.pullEvents()[0] as WorkOrderCreatedEvent
    expect(event.aggregateId).toBe(VALID_ID)
    expect(event.woNumber).toBe('WO-2024-000001')
    expect(event.tenantId).toBe('tenant-1')
    expect(event.type).toBe('CORRECTIVE')
    expect(event.priority).toBe('HIGH')
    expect(event.aggregateType).toBe('WorkOrder')
  })

  it('starts with empty collections', () => {
    const wo = WorkOrder.create(CREATE_PROPS)
    expect(wo.assigneeIds).toHaveLength(0)
    expect(wo.laborEntries).toHaveLength(0)
    expect(wo.partUsages).toHaveLength(0)
  })
})

// ── reconstitute() ────────────────────────────────────────────────────────────

describe('WorkOrder.reconstitute()', () => {
  it('creates a WorkOrder with all required fields', () => {
    const wo = makeWO()
    expect(wo.id.value).toBe(VALID_ID)
    expect(wo.tenantId).toBe('tenant-1')
    expect(wo.woNumber).toBe('WO-2024-000001')
    expect(wo.title).toBe('Fix pump P-101')
    expect(wo.type).toBe('CORRECTIVE')
    expect(wo.status.value).toBe('OPEN')
    expect(wo.priority.value).toBe('MEDIUM')
    expect(wo.assetId).toBe('asset-1')
    expect(wo.createdById).toBe('user-1')
  })

  it('defaults collections to empty arrays when not provided', () => {
    const wo = makeWO()
    expect(wo.assigneeIds).toHaveLength(0)
    expect(wo.laborEntries).toHaveLength(0)
    expect(wo.partUsages).toHaveLength(0)
    expect(wo.attachments).toHaveLength(0)
  })

  it('restores optional fields when provided', () => {
    const ptw = PermitToWork.issue('PTW-001')
    const entry = makeLaborEntry()
    const usage = makePartUsage()
    const wo = makeWO({
      description: 'Full pump replacement',
      permitToWork: ptw,
      slaDeadline: new Date('2024-01-02'),
      assigneeIds: ['tech-1', 'tech-2'],
      laborEntries: [entry],
      partUsages: [usage],
      attachments: [
        {
          id: 'att-1',
          fileName: 'manual.pdf',
          storageKey: 'k1',
          mimeType: 'application/pdf',
          fileSize: 1024,
          uploadedById: 'user-1',
          uploadedAt: new Date(),
        },
      ],
    })
    expect(wo.description).toBe('Full pump replacement')
    expect(wo.permitToWork).toBe(ptw)
    expect(wo.slaDeadline).toEqual(new Date('2024-01-02'))
    expect(wo.assigneeIds).toEqual(['tech-1', 'tech-2'])
    expect(wo.laborEntries).toHaveLength(1)
    expect(wo.partUsages).toHaveLength(1)
    expect(wo.attachments).toHaveLength(1)
  })

  it('makes a defensive copy of provided arrays', () => {
    const ids = ['tech-1']
    const wo = makeWO({ assigneeIds: ids })
    ids.push('tech-2')
    expect(wo.assigneeIds).toHaveLength(1)
  })

  it('does NOT emit any domain events', () => {
    const wo = makeWO()
    expect(wo.pullEvents()).toHaveLength(0)
  })
})

// ── assign() ─────────────────────────────────────────────────────────────────

describe('assign()', () => {
  it('adds a technician when OPEN', () => {
    const wo = makeWO({ status: WorkOrderStatus.OPEN })
    wo.assign('tech-1', 'manager-1')
    expect(wo.assigneeIds).toContain('tech-1')
  })

  it('adds a technician when IN_PROGRESS', () => {
    const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS })
    wo.assign('tech-2', 'manager-1')
    expect(wo.assigneeIds).toContain('tech-2')
  })

  it('is idempotent — duplicate IDs are not added twice', () => {
    const wo = makeWO({ status: WorkOrderStatus.OPEN, assigneeIds: ['tech-1'] })
    wo.assign('tech-1', 'manager-1')
    expect(wo.assigneeIds.filter((id) => id === 'tech-1')).toHaveLength(1)
  })

  it('throws INVALID_ASSIGNMENT when DRAFT', () => {
    const wo = makeWO({ status: WorkOrderStatus.DRAFT })
    expect(() => wo.assign('tech-1', 'mgr')).toThrow(
      expect.objectContaining({ code: 'INVALID_ASSIGNMENT' }),
    )
  })

  it('throws INVALID_ASSIGNMENT when ON_HOLD', () => {
    const wo = makeWO({ status: WorkOrderStatus.ON_HOLD })
    expect(() => wo.assign('tech-1', 'mgr')).toThrow(
      expect.objectContaining({ code: 'INVALID_ASSIGNMENT' }),
    )
  })

  it('throws INVALID_ASSIGNMENT when COMPLETED', () => {
    const wo = makeWO({ status: WorkOrderStatus.COMPLETED })
    expect(() => wo.assign('tech-1', 'mgr')).toThrow(
      expect.objectContaining({ code: 'INVALID_ASSIGNMENT' }),
    )
  })

  it('throws INVALID_ASSIGNMENT when CANCELLED', () => {
    const wo = makeWO({ status: WorkOrderStatus.CANCELLED })
    expect(() => wo.assign('tech-1', 'mgr')).toThrow(
      expect.objectContaining({ code: 'INVALID_ASSIGNMENT' }),
    )
  })

  it('updates updatedAt', () => {
    const before = new Date('2024-01-01')
    const wo = makeWO({ status: WorkOrderStatus.OPEN, updatedAt: before })
    wo.assign('tech-1', 'mgr')
    expect(wo.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })

  it('emits WorkOrderAssignedEvent', () => {
    const wo = makeWO({ status: WorkOrderStatus.OPEN })
    wo.assign('tech-1', 'manager-1')
    const events = wo.pullEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toBeInstanceOf(WorkOrderAssignedEvent)
  })

  it('assigned event carries the correct payload', () => {
    const wo = makeWO({ status: WorkOrderStatus.OPEN })
    wo.assign('tech-1', 'manager-1')
    const event = wo.pullEvents()[0] as WorkOrderAssignedEvent
    expect(event.technicianId).toBe('tech-1')
    expect(event.assignedById).toBe('manager-1')
    expect(event.tenantId).toBe('tenant-1')
    expect(event.assigneeIds).toContain('tech-1')
  })

  it('emits event even when re-assigning the same technician', () => {
    const wo = makeWO({ status: WorkOrderStatus.OPEN, assigneeIds: ['tech-1'] })
    wo.assign('tech-1', 'mgr')
    expect(wo.pullEvents()).toHaveLength(1)
  })
})

// ── start() ───────────────────────────────────────────────────────────────────

describe('start()', () => {
  it('transitions OPEN → IN_PROGRESS', () => {
    const wo = makeWO({ status: WorkOrderStatus.OPEN })
    wo.start('tech-1')
    expect(wo.status.value).toBe('IN_PROGRESS')
  })

  it('sets startedAt to the current time', () => {
    const before = Date.now()
    const wo = makeWO({ status: WorkOrderStatus.OPEN })
    wo.start('tech-1')
    expect(wo.startedAt?.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('throws INVALID_START when DRAFT (must be opened first)', () => {
    const wo = makeWO({ status: WorkOrderStatus.DRAFT })
    expect(() => wo.start('tech-1')).toThrow(expect.objectContaining({ code: 'INVALID_START' }))
  })

  it('throws INVALID_START when already IN_PROGRESS', () => {
    const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS })
    expect(() => wo.start('tech-1')).toThrow(expect.objectContaining({ code: 'INVALID_START' }))
  })

  it('throws INVALID_START when ON_HOLD', () => {
    const wo = makeWO({ status: WorkOrderStatus.ON_HOLD })
    expect(() => wo.start('tech-1')).toThrow(expect.objectContaining({ code: 'INVALID_START' }))
  })

  it('throws INVALID_START when COMPLETED', () => {
    const wo = makeWO({ status: WorkOrderStatus.COMPLETED })
    expect(() => wo.start('tech-1')).toThrow(expect.objectContaining({ code: 'INVALID_START' }))
  })

  it('throws INVALID_START when CANCELLED', () => {
    const wo = makeWO({ status: WorkOrderStatus.CANCELLED })
    expect(() => wo.start('tech-1')).toThrow(expect.objectContaining({ code: 'INVALID_START' }))
  })

  it('error message names the current status', () => {
    const wo = makeWO({ status: WorkOrderStatus.DRAFT })
    let msg = ''
    try {
      wo.start('tech-1')
    } catch (e) {
      msg = (e as Error).message
    }
    expect(msg).toContain('DRAFT')
  })
})

// ── complete() ────────────────────────────────────────────────────────────────

describe('complete()', () => {
  const RESOLUTION = 'Replaced impeller seal and bearings; pump tested at full load.'

  it('transitions IN_PROGRESS → COMPLETED', () => {
    const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS })
    wo.complete('tech-1', RESOLUTION)
    expect(wo.status.value).toBe('COMPLETED')
  })

  it('records the resolution', () => {
    const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS })
    wo.complete('tech-1', RESOLUTION)
    expect(wo.resolution).toBe(RESOLUTION)
  })

  it('trims whitespace from the resolution', () => {
    const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS })
    wo.complete('tech-1', `  ${RESOLUTION}  `)
    expect(wo.resolution).toBe(RESOLUTION)
  })

  it('sets completedAt', () => {
    const before = Date.now()
    const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS })
    wo.complete('tech-1', RESOLUTION)
    expect(wo.completedAt?.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('emits WorkOrderCompletedEvent', () => {
    const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS })
    wo.complete('tech-1', RESOLUTION)
    const events = wo.pullEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toBeInstanceOf(WorkOrderCompletedEvent)
  })

  it('event carries the correct payload', () => {
    const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS })
    wo.complete('tech-1', RESOLUTION)
    const event = wo.pullEvents()[0] as WorkOrderCompletedEvent
    expect(event.aggregateId).toBe(VALID_ID)
    expect(event.tenantId).toBe('tenant-1')
    expect(event.assetId).toBe('asset-1')
    expect(event.technicianId).toBe('tech-1')
    expect(event.resolution).toBe(RESOLUTION)
    expect(event.laborHours).toBe(0)
    expect(event.totalCost.isZero()).toBe(true)
  })

  it('completes when IN_PROGRESS with a signed PTW', () => {
    const ptw = PermitToWork.issue('PTW-001').sign('safety-officer-1')
    const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS, permitToWork: ptw })
    expect(() => wo.complete('tech-1', RESOLUTION)).not.toThrow()
  })

  it('throws PTW_NOT_SIGNED when IN_PROGRESS with an unsigned PTW', () => {
    const ptw = PermitToWork.issue('PTW-001')
    const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS, permitToWork: ptw })
    expect(() => wo.complete('tech-1', RESOLUTION)).toThrow(
      expect.objectContaining({ code: 'PTW_NOT_SIGNED' }),
    )
  })

  it('throws RESOLUTION_REQUIRED for empty resolution', () => {
    const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS })
    expect(() => wo.complete('tech-1', '')).toThrow(
      expect.objectContaining({ code: 'RESOLUTION_REQUIRED' }),
    )
  })

  it('throws RESOLUTION_REQUIRED for whitespace-only resolution', () => {
    const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS })
    expect(() => wo.complete('tech-1', '   ')).toThrow(
      expect.objectContaining({ code: 'RESOLUTION_REQUIRED' }),
    )
  })

  it('throws INVALID_COMPLETION when OPEN', () => {
    const wo = makeWO({ status: WorkOrderStatus.OPEN })
    expect(() => wo.complete('tech-1', RESOLUTION)).toThrow(
      expect.objectContaining({ code: 'INVALID_COMPLETION' }),
    )
  })

  it('throws INVALID_COMPLETION when ON_HOLD', () => {
    const wo = makeWO({ status: WorkOrderStatus.ON_HOLD })
    expect(() => wo.complete('tech-1', RESOLUTION)).toThrow(
      expect.objectContaining({ code: 'INVALID_COMPLETION' }),
    )
  })

  it('throws INVALID_COMPLETION when DRAFT', () => {
    const wo = makeWO({ status: WorkOrderStatus.DRAFT })
    expect(() => wo.complete('tech-1', RESOLUTION)).toThrow(DomainException)
  })

  it('event totalCost includes both labour and parts costs', () => {
    const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS })
    wo.addLabor(makeLaborEntry({ id: 'le-1', cost: new LaborCost(2, THB(500)) }))
    wo.usePart(makePartUsage({ id: 'pu-1', quantity: 3, unitCost: THB(200) }))
    wo.complete('tech-1', RESOLUTION)
    const event = wo
      .pullEvents()
      .find((e) => e instanceof WorkOrderCompletedEvent) as WorkOrderCompletedEvent
    // labour: 2h × THB500 = 1000 | parts: 3 × THB200 = 600 → total = 1600
    expect(event.totalCost.toString()).toBe('1600')
    expect(event.laborHours).toBe(2)
  })

  it('does not emit an event when completion fails', () => {
    const wo = makeWO({ status: WorkOrderStatus.OPEN })
    try {
      wo.complete('tech-1', RESOLUTION)
    } catch {
      /* expected */
    }
    expect(wo.pullEvents()).toHaveLength(0)
  })
})

// ── hold() ────────────────────────────────────────────────────────────────────

describe('hold()', () => {
  it('transitions IN_PROGRESS → ON_HOLD', () => {
    const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS })
    wo.hold('Waiting for spare parts')
    expect(wo.status.value).toBe('ON_HOLD')
  })

  it('throws HOLD_REASON_REQUIRED for empty reason', () => {
    const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS })
    expect(() => wo.hold('')).toThrow(expect.objectContaining({ code: 'HOLD_REASON_REQUIRED' }))
  })

  it('throws INVALID_HOLD when OPEN', () => {
    const wo = makeWO({ status: WorkOrderStatus.OPEN })
    expect(() => wo.hold('reason')).toThrow(expect.objectContaining({ code: 'INVALID_HOLD' }))
  })

  it('throws INVALID_HOLD when DRAFT', () => {
    const wo = makeWO({ status: WorkOrderStatus.DRAFT })
    expect(() => wo.hold('reason')).toThrow(expect.objectContaining({ code: 'INVALID_HOLD' }))
  })

  it('throws INVALID_HOLD when already ON_HOLD', () => {
    const wo = makeWO({ status: WorkOrderStatus.ON_HOLD })
    expect(() => wo.hold('reason')).toThrow(expect.objectContaining({ code: 'INVALID_HOLD' }))
  })

  it('throws INVALID_HOLD when COMPLETED', () => {
    const wo = makeWO({ status: WorkOrderStatus.COMPLETED })
    expect(() => wo.hold('reason')).toThrow(expect.objectContaining({ code: 'INVALID_HOLD' }))
  })

  it('throws INVALID_HOLD when CANCELLED', () => {
    const wo = makeWO({ status: WorkOrderStatus.CANCELLED })
    expect(() => wo.hold('reason')).toThrow(expect.objectContaining({ code: 'INVALID_HOLD' }))
  })
})

// ── cancel() ─────────────────────────────────────────────────────────────────

describe('cancel()', () => {
  it.each(['DRAFT', 'OPEN', 'IN_PROGRESS', 'ON_HOLD'] as const)(
    'can cancel from %s',
    (statusValue) => {
      const wo = makeWO({ status: WorkOrderStatus.from(statusValue) })
      wo.cancel('Wrong asset', 'manager-1')
      expect(wo.status.value).toBe('CANCELLED')
    },
  )

  it('sets cancelledAt', () => {
    const before = Date.now()
    const wo = makeWO({ status: WorkOrderStatus.OPEN })
    wo.cancel('Wrong asset', 'manager-1')
    expect(wo.cancelledAt?.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('emits WorkOrderCancelledEvent', () => {
    const wo = makeWO({ status: WorkOrderStatus.OPEN })
    wo.cancel('Duplicate WO', 'manager-1')
    const events = wo.pullEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toBeInstanceOf(WorkOrderCancelledEvent)
  })

  it('event carries the correct payload', () => {
    const wo = makeWO({ status: WorkOrderStatus.OPEN })
    wo.cancel('Duplicate WO', 'manager-1')
    const event = wo.pullEvents()[0] as WorkOrderCancelledEvent
    expect(event.tenantId).toBe('tenant-1')
    expect(event.cancelledById).toBe('manager-1')
    expect(event.reason).toBe('Duplicate WO')
  })

  it('throws CANCEL_REASON_REQUIRED for empty reason', () => {
    const wo = makeWO({ status: WorkOrderStatus.OPEN })
    expect(() => wo.cancel('', 'manager-1')).toThrow(
      expect.objectContaining({ code: 'CANCEL_REASON_REQUIRED' }),
    )
  })

  it('throws CANNOT_CANCEL_COMPLETED for a completed work order', () => {
    const wo = makeWO({ status: WorkOrderStatus.COMPLETED })
    expect(() => wo.cancel('Mistake', 'manager-1')).toThrow(
      expect.objectContaining({ code: 'CANNOT_CANCEL_COMPLETED' }),
    )
  })

  it('throws ALREADY_CANCELLED when already cancelled', () => {
    const wo = makeWO({ status: WorkOrderStatus.CANCELLED })
    expect(() => wo.cancel('Again', 'manager-1')).toThrow(
      expect.objectContaining({ code: 'ALREADY_CANCELLED' }),
    )
  })
})

// ── addLabor() ────────────────────────────────────────────────────────────────

describe('addLabor()', () => {
  it('records a labour entry when IN_PROGRESS', () => {
    const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS })
    const entry = makeLaborEntry()
    wo.addLabor(entry)
    expect(wo.laborEntries).toHaveLength(1)
    expect(wo.laborEntries[0]).toBe(entry)
  })

  it('accumulates multiple entries', () => {
    const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS })
    wo.addLabor(makeLaborEntry({ id: 'le-1' }))
    wo.addLabor(makeLaborEntry({ id: 'le-2' }))
    expect(wo.laborEntries).toHaveLength(2)
  })

  it('returns a defensive copy — external mutation does not affect aggregate', () => {
    const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS })
    wo.addLabor(makeLaborEntry())
    const snapshot = wo.laborEntries as LaborEntry[]
    snapshot.push(makeLaborEntry({ id: 'injected' }))
    expect(wo.laborEntries).toHaveLength(1)
  })

  it('throws INVALID_LABOR_ADD when OPEN', () => {
    const wo = makeWO({ status: WorkOrderStatus.OPEN })
    expect(() => wo.addLabor(makeLaborEntry())).toThrow(
      expect.objectContaining({ code: 'INVALID_LABOR_ADD' }),
    )
  })

  it('throws INVALID_LABOR_ADD when DRAFT', () => {
    const wo = makeWO({ status: WorkOrderStatus.DRAFT })
    expect(() => wo.addLabor(makeLaborEntry())).toThrow(
      expect.objectContaining({ code: 'INVALID_LABOR_ADD' }),
    )
  })

  it('throws INVALID_LABOR_ADD when ON_HOLD', () => {
    const wo = makeWO({ status: WorkOrderStatus.ON_HOLD })
    expect(() => wo.addLabor(makeLaborEntry())).toThrow(
      expect.objectContaining({ code: 'INVALID_LABOR_ADD' }),
    )
  })

  it('throws INVALID_LABOR_ADD when COMPLETED', () => {
    const wo = makeWO({ status: WorkOrderStatus.COMPLETED })
    expect(() => wo.addLabor(makeLaborEntry())).toThrow(
      expect.objectContaining({ code: 'INVALID_LABOR_ADD' }),
    )
  })

  it('throws INVALID_LABOR_ADD when CANCELLED', () => {
    const wo = makeWO({ status: WorkOrderStatus.CANCELLED })
    expect(() => wo.addLabor(makeLaborEntry())).toThrow(
      expect.objectContaining({ code: 'INVALID_LABOR_ADD' }),
    )
  })
})

// ── usePart() ─────────────────────────────────────────────────────────────────

describe('usePart()', () => {
  it.each(['DRAFT', 'OPEN', 'IN_PROGRESS', 'ON_HOLD'] as const)(
    'records part usage when %s',
    (statusValue) => {
      const wo = makeWO({ status: WorkOrderStatus.from(statusValue) })
      const usage = makePartUsage()
      wo.usePart(usage)
      expect(wo.partUsages).toHaveLength(1)
    },
  )

  it('accumulates multiple usages', () => {
    const wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS })
    wo.usePart(makePartUsage({ id: 'pu-1' }))
    wo.usePart(makePartUsage({ id: 'pu-2' }))
    expect(wo.partUsages).toHaveLength(2)
  })

  it('throws INVALID_PART_USAGE when COMPLETED', () => {
    const wo = makeWO({ status: WorkOrderStatus.COMPLETED })
    expect(() => wo.usePart(makePartUsage())).toThrow(
      expect.objectContaining({ code: 'INVALID_PART_USAGE' }),
    )
  })

  it('throws INVALID_PART_USAGE when CANCELLED', () => {
    const wo = makeWO({ status: WorkOrderStatus.CANCELLED })
    expect(() => wo.usePart(makePartUsage())).toThrow(
      expect.objectContaining({ code: 'INVALID_PART_USAGE' }),
    )
  })
})

// ── escalate() ────────────────────────────────────────────────────────────────

describe('escalate()', () => {
  it('escalates LOW → MEDIUM', () => {
    const wo = makeWO({ priority: Priority.LOW })
    wo.escalate()
    expect(wo.priority.value).toBe('MEDIUM')
  })

  it('escalates MEDIUM → HIGH', () => {
    const wo = makeWO({ priority: Priority.MEDIUM })
    wo.escalate()
    expect(wo.priority.value).toBe('HIGH')
  })

  it('escalates HIGH → CRITICAL', () => {
    const wo = makeWO({ priority: Priority.HIGH })
    wo.escalate()
    expect(wo.priority.value).toBe('CRITICAL')
  })

  it('emits WorkOrderEscalatedEvent', () => {
    const wo = makeWO({ priority: Priority.LOW })
    wo.escalate()
    const events = wo.pullEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toBeInstanceOf(WorkOrderEscalatedEvent)
  })

  it('event carries from/to priorities', () => {
    const wo = makeWO({ priority: Priority.MEDIUM })
    wo.escalate()
    const event = wo.pullEvents()[0] as WorkOrderEscalatedEvent
    expect(event.fromPriority).toBe('MEDIUM')
    expect(event.toPriority).toBe('HIGH')
    expect(event.tenantId).toBe('tenant-1')
  })

  it('throws ALREADY_MAX_PRIORITY when CRITICAL', () => {
    const wo = makeWO({ priority: Priority.CRITICAL })
    expect(() => wo.escalate()).toThrow(expect.objectContaining({ code: 'ALREADY_MAX_PRIORITY' }))
  })

  it('error message includes the WO number', () => {
    const wo = makeWO({ priority: Priority.CRITICAL })
    let msg = ''
    try {
      wo.escalate()
    } catch (e) {
      msg = (e as Error).message
    }
    expect(msg).toContain('WO-2024-000001')
  })

  it('does not emit an event on failure', () => {
    const wo = makeWO({ priority: Priority.CRITICAL })
    try {
      wo.escalate()
    } catch {
      /* expected */
    }
    expect(wo.pullEvents()).toHaveLength(0)
  })

  it('can escalate three times from LOW to CRITICAL', () => {
    const wo = makeWO({ priority: Priority.LOW })
    wo.escalate()
    wo.escalate()
    wo.escalate()
    expect(wo.priority.value).toBe('CRITICAL')
    expect(wo.pullEvents()).toHaveLength(3)
  })
})

// ── pullEvents() ─────────────────────────────────────────────────────────────

describe('pullEvents()', () => {
  it('returns an empty array on a freshly reconstituted aggregate', () => {
    const wo = makeWO()
    expect(wo.pullEvents()).toHaveLength(0)
  })

  it('clears the event buffer after pulling', () => {
    const wo = makeWO({ status: WorkOrderStatus.OPEN })
    wo.cancel('Duplicate', 'mgr-1')
    wo.pullEvents()
    expect(wo.pullEvents()).toHaveLength(0)
  })

  it('returns a snapshot — subsequent mutations do not appear in the already-pulled array', () => {
    const wo = makeWO({ priority: Priority.LOW })
    wo.escalate()
    const pulled = wo.pullEvents()
    wo.escalate()
    expect(pulled).toHaveLength(1) // first escalate only
  })

  it('accumulates events from multiple mutations before pull', () => {
    const wo = makeWO({ priority: Priority.LOW, status: WorkOrderStatus.IN_PROGRESS })
    wo.escalate()
    wo.complete('tech-1', 'All good.')
    const events = wo.pullEvents()
    expect(events).toHaveLength(2)
    expect(events[0]).toBeInstanceOf(WorkOrderEscalatedEvent)
    expect(events[1]).toBeInstanceOf(WorkOrderCompletedEvent)
  })
})

// ── updatedAt stamping ────────────────────────────────────────────────────────

describe('updatedAt stamping', () => {
  const STALE = new Date('2020-01-01')

  it.each([
    ['assign', (wo: WorkOrder) => wo.assign('tech-1', 'mgr')],
    ['start', (wo: WorkOrder) => wo.start('tech-1')],
    ['hold', (wo: WorkOrder) => wo.hold('waiting for parts')],
    ['addLabor', (wo: WorkOrder) => wo.addLabor(makeLaborEntry())],
    ['usePart', (wo: WorkOrder) => wo.usePart(makePartUsage())],
    ['escalate', (wo: WorkOrder) => wo.escalate()],
  ] as const)('%s updates updatedAt', (label, mutate) => {
    let wo: WorkOrder

    switch (label) {
      case 'assign':
        wo = makeWO({ status: WorkOrderStatus.OPEN, updatedAt: STALE })
        break
      case 'start':
        wo = makeWO({ status: WorkOrderStatus.OPEN, updatedAt: STALE })
        break
      case 'hold':
        wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS, updatedAt: STALE })
        break
      case 'addLabor':
        wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS, updatedAt: STALE })
        break
      case 'usePart':
        wo = makeWO({ status: WorkOrderStatus.IN_PROGRESS, updatedAt: STALE })
        break
      case 'escalate':
        wo = makeWO({ priority: Priority.LOW, updatedAt: STALE })
        break
      default:
        wo = makeWO({ updatedAt: STALE })
    }

    mutate(wo)
    expect(wo.updatedAt.getTime()).toBeGreaterThan(STALE.getTime())
  })
})

// ── Full lifecycle ────────────────────────────────────────────────────────────

describe('full lifecycle integration', () => {
  it('DRAFT → OPEN (external) → IN_PROGRESS → ON_HOLD → IN_PROGRESS → COMPLETED', () => {
    // Simulate: WO created as DRAFT, opened externally, then managed through completion
    const wo = makeWO({ status: WorkOrderStatus.OPEN })
    wo.assign('tech-1', 'manager-1') // emits WorkOrderAssignedEvent
    wo.pullEvents() // drain assignment event before checking completion
    wo.start('tech-1')
    expect(wo.status.value).toBe('IN_PROGRESS')

    wo.addLabor(makeLaborEntry({ id: 'le-1', cost: new LaborCost(1, THB(500)) }))

    wo.hold('Waiting for replacement seal')
    expect(wo.status.value).toBe('ON_HOLD')

    // Resume: use a new WO reconstituted with IN_PROGRESS status (simulating DB round-trip)
    const resumed = WorkOrder.reconstitute({ ...BASE_PROPS, status: WorkOrderStatus.IN_PROGRESS })
    resumed.addLabor(makeLaborEntry({ id: 'le-2', cost: new LaborCost(1.5, THB(500)) }))
    resumed.complete('tech-1', 'Replaced impeller seal. Pump running normally.')

    expect(resumed.status.value).toBe('COMPLETED')
    const events = resumed.pullEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toBeInstanceOf(WorkOrderCompletedEvent)
  })

  it('escalate three times then cancel — both event types emitted', () => {
    const wo = makeWO({ status: WorkOrderStatus.OPEN, priority: Priority.LOW })
    wo.escalate()
    wo.escalate()
    wo.escalate()
    wo.cancel('Budget cut', 'manager-1')

    const events = wo.pullEvents()
    expect(events).toHaveLength(4) // 3 escalations + 1 cancel
    const escalations = events.filter((e) => e instanceof WorkOrderEscalatedEvent)
    const cancels = events.filter((e) => e instanceof WorkOrderCancelledEvent)
    expect(escalations).toHaveLength(3)
    expect(cancels).toHaveLength(1)
  })

  it('two WOs with the same tenant do not share state', () => {
    const wo1 = makeWO({ id: new WorkOrderId(VALID_ID) })
    const wo2 = makeWO({ id: new WorkOrderId(VALID_ID2) })
    wo1.assign('tech-1', 'mgr')
    expect(wo2.assigneeIds).toHaveLength(0)
  })
})
