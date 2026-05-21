import Decimal from 'decimal.js'
import { BaseDomainEvent } from '../../events/base-domain-event'
import { DomainEvent } from '../../events/domain-event'
import {
  SLABreachedEvent,
  WorkOrderAssignedEvent,
  WorkOrderCancelledEvent,
  WorkOrderCompletedEvent,
  WorkOrderCreatedEvent,
  WorkOrderEscalatedEvent,
} from '../events'

// ── Shared constants ──────────────────────────────────────────────────────────

const AGG_ID = 'clh7z2d1h0000z1x1z1x1z1x1'
const TENANT = 'tenant-1'

// ── BaseDomainEvent ───────────────────────────────────────────────────────────

describe('BaseDomainEvent', () => {
  class ConcreteEvent extends BaseDomainEvent {
    readonly eventType = 'Test' as const

    constructor() {
      super(AGG_ID, 'WorkOrder')
    }
  }

  it('is an instance of DomainEvent (hierarchy is preserved)', () => {
    expect(new ConcreteEvent()).toBeInstanceOf(DomainEvent)
  })

  it('is an instance of BaseDomainEvent', () => {
    expect(new ConcreteEvent()).toBeInstanceOf(BaseDomainEvent)
  })

  it('generates a unique UUID-v4 eventId on each construction', () => {
    const a = new ConcreteEvent()
    const b = new ConcreteEvent()
    expect(a.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(a.eventId).not.toBe(b.eventId)
  })

  it('sets aggregateId correctly', () => {
    expect(new ConcreteEvent().aggregateId).toBe(AGG_ID)
  })

  it('sets aggregateType correctly', () => {
    expect(new ConcreteEvent().aggregateType).toBe('WorkOrder')
  })

  it('sets occurredAt to a recent timestamp', () => {
    const before = Date.now()
    const event = new ConcreteEvent()
    expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('two events at the same millisecond still have different eventIds', () => {
    const events = Array.from({ length: 10 }, () => new ConcreteEvent())
    const ids = new Set(events.map((e) => e.eventId))
    expect(ids.size).toBe(10)
  })
})

// ── WorkOrderCreatedEvent ─────────────────────────────────────────────────────

describe('WorkOrderCreatedEvent', () => {
  const event = new WorkOrderCreatedEvent({
    aggregateId: AGG_ID,
    woNumber: 'WO-2024-000001',
    tenantId: TENANT,
    assetId: 'asset-1',
    type: 'CORRECTIVE',
    priority: 'HIGH',
    createdById: 'user-1',
  })

  it('has eventType "WorkOrderCreated"', () => {
    expect(event.eventType).toBe('WorkOrderCreated')
  })

  it('has aggregateType "WorkOrder"', () => {
    expect(event.aggregateType).toBe('WorkOrder')
  })

  it('carries the wo number', () => {
    expect(event.woNumber).toBe('WO-2024-000001')
  })

  it('carries tenantId, assetId, type, priority, createdById', () => {
    expect(event.tenantId).toBe(TENANT)
    expect(event.assetId).toBe('asset-1')
    expect(event.type).toBe('CORRECTIVE')
    expect(event.priority).toBe('HIGH')
    expect(event.createdById).toBe('user-1')
  })

  it('is instanceof BaseDomainEvent', () => {
    expect(event).toBeInstanceOf(BaseDomainEvent)
  })
})

// ── WorkOrderAssignedEvent ────────────────────────────────────────────────────

describe('WorkOrderAssignedEvent', () => {
  const event = new WorkOrderAssignedEvent({
    aggregateId: AGG_ID,
    tenantId: TENANT,
    technicianId: 'tech-1',
    assignedById: 'manager-1',
    assigneeIds: ['tech-1', 'tech-2'],
  })

  it('has eventType "WorkOrderAssigned"', () => {
    expect(event.eventType).toBe('WorkOrderAssigned')
  })

  it('carries the correct payload', () => {
    expect(event.technicianId).toBe('tech-1')
    expect(event.assignedById).toBe('manager-1')
    expect(event.assigneeIds).toEqual(['tech-1', 'tech-2'])
    expect(event.tenantId).toBe(TENANT)
  })

  it('stores a defensive copy of assigneeIds', () => {
    const ids = ['tech-1']
    const e = new WorkOrderAssignedEvent({
      aggregateId: AGG_ID,
      tenantId: TENANT,
      technicianId: 'tech-1',
      assignedById: 'mgr',
      assigneeIds: ids,
    })
    ids.push('tech-99')
    expect(e.assigneeIds).toHaveLength(1)
  })
})

// ── WorkOrderCompletedEvent ───────────────────────────────────────────────────

describe('WorkOrderCompletedEvent', () => {
  const event = new WorkOrderCompletedEvent({
    aggregateId: AGG_ID,
    tenantId: TENANT,
    assetId: 'asset-1',
    technicianId: 'tech-1',
    resolution: 'Replaced seal.',
    totalCost: new Decimal('1500.00'),
    laborHours: 3,
  })

  it('has eventType "WorkOrderCompleted"', () => {
    expect(event.eventType).toBe('WorkOrderCompleted')
  })

  it('carries all cost and time metrics', () => {
    expect(event.totalCost.equals('1500.00')).toBe(true)
    expect(event.laborHours).toBe(3)
  })

  it('carries resolution and technicianId', () => {
    expect(event.resolution).toBe('Replaced seal.')
    expect(event.technicianId).toBe('tech-1')
  })

  it('accepts zero cost (WO with no labour or parts)', () => {
    const e = new WorkOrderCompletedEvent({
      aggregateId: AGG_ID,
      tenantId: TENANT,
      assetId: 'a',
      technicianId: 't',
      resolution: 'ok',
      totalCost: new Decimal(0),
      laborHours: 0,
    })
    expect(e.totalCost.isZero()).toBe(true)
    expect(e.laborHours).toBe(0)
  })
})

// ── WorkOrderCancelledEvent ───────────────────────────────────────────────────

describe('WorkOrderCancelledEvent', () => {
  const event = new WorkOrderCancelledEvent({
    aggregateId: AGG_ID,
    tenantId: TENANT,
    cancelledById: 'manager-1',
    reason: 'Budget cut',
  })

  it('has eventType "WorkOrderCancelled"', () => {
    expect(event.eventType).toBe('WorkOrderCancelled')
  })

  it('carries reason and cancelledById', () => {
    expect(event.reason).toBe('Budget cut')
    expect(event.cancelledById).toBe('manager-1')
  })
})

// ── WorkOrderEscalatedEvent ───────────────────────────────────────────────────

describe('WorkOrderEscalatedEvent', () => {
  const event = new WorkOrderEscalatedEvent({
    aggregateId: AGG_ID,
    tenantId: TENANT,
    fromPriority: 'MEDIUM',
    toPriority: 'HIGH',
  })

  it('has eventType "WorkOrderEscalated"', () => {
    expect(event.eventType).toBe('WorkOrderEscalated')
  })

  it('carries from/to priority levels', () => {
    expect(event.fromPriority).toBe('MEDIUM')
    expect(event.toPriority).toBe('HIGH')
  })
})

// ── SLABreachedEvent ──────────────────────────────────────────────────────────

describe('SLABreachedEvent', () => {
  const deadline = new Date('2024-01-01T08:00:00Z')
  const event = new SLABreachedEvent({
    aggregateId: AGG_ID,
    tenantId: TENANT,
    assetId: 'asset-1',
    woNumber: 'WO-2024-000042',
    priority: 'CRITICAL',
    slaDeadline: deadline,
    overdueMinutes: 90,
  })

  it('has eventType "SLABreached"', () => {
    expect(event.eventType).toBe('SLABreached')
  })

  it('has aggregateType "WorkOrder"', () => {
    expect(event.aggregateType).toBe('WorkOrder')
  })

  it('carries deadline and overdue duration', () => {
    expect(event.slaDeadline).toEqual(deadline)
    expect(event.overdueMinutes).toBe(90)
  })

  it('carries wo metadata', () => {
    expect(event.woNumber).toBe('WO-2024-000042')
    expect(event.priority).toBe('CRITICAL')
    expect(event.assetId).toBe('asset-1')
    expect(event.tenantId).toBe(TENANT)
  })

  it('is instanceof BaseDomainEvent', () => {
    expect(event).toBeInstanceOf(BaseDomainEvent)
  })
})

// ── Common BaseDomainEvent contract across all event types ────────────────────

describe('BaseDomainEvent contract — all six event types', () => {
  const instances = [
    new WorkOrderCreatedEvent({
      aggregateId: AGG_ID,
      woNumber: 'WO-1',
      tenantId: TENANT,
      assetId: 'a',
      type: 'CORRECTIVE',
      priority: 'LOW',
      createdById: 'u',
    }),
    new WorkOrderAssignedEvent({
      aggregateId: AGG_ID,
      tenantId: TENANT,
      technicianId: 't',
      assignedById: 'm',
      assigneeIds: [],
    }),
    new WorkOrderCompletedEvent({
      aggregateId: AGG_ID,
      tenantId: TENANT,
      assetId: 'a',
      technicianId: 't',
      resolution: 'ok',
      totalCost: new Decimal(0),
      laborHours: 0,
    }),
    new WorkOrderCancelledEvent({
      aggregateId: AGG_ID,
      tenantId: TENANT,
      cancelledById: 'm',
      reason: 'x',
    }),
    new WorkOrderEscalatedEvent({
      aggregateId: AGG_ID,
      tenantId: TENANT,
      fromPriority: 'LOW',
      toPriority: 'MEDIUM',
    }),
    new SLABreachedEvent({
      aggregateId: AGG_ID,
      tenantId: TENANT,
      assetId: 'a',
      woNumber: 'WO-1',
      priority: 'HIGH',
      slaDeadline: new Date(),
      overdueMinutes: 1,
    }),
  ]

  it.each(instances.map((e) => [e.eventType, e] as const))(
    '%s has a non-empty eventId',
    (_type, event) => {
      expect(event.eventId).toBeTruthy()
      expect(event.eventId.length).toBeGreaterThan(0)
    },
  )

  it.each(instances.map((e) => [e.eventType, e] as const))(
    '%s has aggregateType "WorkOrder"',
    (_type, event) => {
      expect(event.aggregateType).toBe('WorkOrder')
    },
  )

  it.each(instances.map((e) => [e.eventType, e] as const))(
    '%s is instanceof DomainEvent',
    (_type, event) => {
      expect(event).toBeInstanceOf(DomainEvent)
    },
  )

  it('all six instances have unique eventIds', () => {
    const ids = new Set(instances.map((e) => e.eventId))
    expect(ids.size).toBe(instances.length)
  })
})
