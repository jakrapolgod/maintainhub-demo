/**
 * Unit tests for PM schedule query handlers.
 */
import { ListPMSchedulesHandler } from '../list-pm-schedules.js'
import { GetPMCalendarHandler } from '../get-pm-calendar.js'
import { GetUpcomingPMHandler } from '../get-upcoming-pm.js'
import { GetPMComplianceHandler } from '../get-pm-compliance.js'
import type { QueryContext } from '../query.types.js'

const ctx: QueryContext = {
  executingUserId: 'user-1',
  tenantId: 'tenant-1',
  userRole: 'MANAGER',
}

const ASSET_ID = 'clh7z2d1h0001z1x1z1x1z1x2'
const SCHEDULE_ID = 'clh7z2d1h0000z1x1z1x1z1x1'

function makeScheduleRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SCHEDULE_ID,
    tenantId: 'tenant-1',
    assetId: ASSET_ID,
    title: 'Monthly Lubrication',
    description: '',
    triggerType: 'CALENDAR',
    isActive: true,
    estimatedHours: 2,
    requiredSkills: [],
    calendarRule: {
      frequency: 'monthly',
      interval: 1,
      pmMeta: { advanceNoticeDays: 7, defaultAssigneeIds: [] },
    },
    meterRule: null,
    taskList: [{ sequence: 1, title: 'Lubricate' }],
    lastTriggered: null,
    nextDue: new Date(Date.now() + 5 * 86_400_000), // 5 days from now
    createdById: 'user-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date(),
    asset: {
      id: ASSET_ID,
      assetNumber: 'AST-000001',
      name: 'Pump P-101',
      category: { name: 'Pumps' },
      location: null,
    },
    ...overrides,
  }
}

// ── ListPMSchedulesHandler ─────────────────────────────────────────────────────

describe('ListPMSchedulesHandler', () => {
  it('returns items from DB rows', async () => {
    const row = makeScheduleRow()
    const db = {
      pMSchedule: {
        findMany: jest.fn().mockResolvedValue([row]),
      },
    }
    const prisma = { pMSchedule: { count: jest.fn().mockResolvedValue(1) } }

    const handler = new ListPMSchedulesHandler(db as never, prisma as never)
    const result = await handler.handle({}, ctx)

    expect(result.total).toBe(1)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.title).toBe('Monthly Lubrication')
    expect(result.items[0]!.type).toBe('CALENDAR')
    expect(result.items[0]!.taskCount).toBe(1)
    expect(result.nextCursor).toBeNull()
  })

  it('returns nextCursor when more rows exist than limit', async () => {
    const rows = Array.from({ length: 4 }, (_, i) => makeScheduleRow({ id: `id${i}` }))
    const db = { pMSchedule: { findMany: jest.fn().mockResolvedValue(rows) } }
    const prisma = { pMSchedule: { count: jest.fn().mockResolvedValue(10) } }

    const handler = new ListPMSchedulesHandler(db as never, prisma as never)
    const result = await handler.handle({ limit: 3 }, ctx)

    expect(result.items).toHaveLength(3)
    expect(result.nextCursor).toBe('id2')
  })

  it('marks isOverdue=true for past nextDue', async () => {
    const row = makeScheduleRow({ nextDue: new Date(Date.now() - 86_400_000) }) // yesterday
    const db = { pMSchedule: { findMany: jest.fn().mockResolvedValue([row]) } }
    const prisma = { pMSchedule: { count: jest.fn().mockResolvedValue(1) } }

    const handler = new ListPMSchedulesHandler(db as never, prisma as never)
    const result = await handler.handle({}, ctx)

    expect(result.items[0]!.isOverdue).toBe(true)
  })

  it('returns empty result when no rows match', async () => {
    const db = { pMSchedule: { findMany: jest.fn().mockResolvedValue([]) } }
    const prisma = { pMSchedule: { count: jest.fn().mockResolvedValue(0) } }

    const handler = new ListPMSchedulesHandler(db as never, prisma as never)
    const result = await handler.handle({ assetId: 'nonexistent' }, ctx)

    expect(result.items).toHaveLength(0)
    expect(result.total).toBe(0)
    expect(result.nextCursor).toBeNull()
  })
})

// ── GetPMCalendarHandler ───────────────────────────────────────────────────────

describe('GetPMCalendarHandler', () => {
  it('groups PM events by date', async () => {
    const nextDue = new Date('2024-06-15T00:00:00Z')
    const row = makeScheduleRow({ nextDue })
    const db = { pMSchedule: { findMany: jest.fn().mockResolvedValue([row]) } }
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([]) } }

    const handler = new GetPMCalendarHandler(db as never, prisma as never)
    const result = await handler.handle(
      {
        from: new Date('2024-06-01T00:00:00Z'),
        to: new Date('2024-06-30T00:00:00Z'),
      },
      ctx,
    )

    expect(result.totalEvents).toBe(1)
    const day = result.days.find((d) => d.date === '2024-06-15')
    expect(day).toBeDefined()
    expect(day!.entries).toHaveLength(1)
    expect(day!.entries[0]!.title).toBe('Monthly Lubrication')
  })

  it('includes all days in range even when empty', async () => {
    const db = { pMSchedule: { findMany: jest.fn().mockResolvedValue([]) } }
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([]) } }

    const handler = new GetPMCalendarHandler(db as never, prisma as never)
    const result = await handler.handle(
      {
        from: new Date('2024-06-01T00:00:00Z'),
        to: new Date('2024-06-07T00:00:00Z'),
      },
      ctx,
    )

    expect(result.days).toHaveLength(7)
    expect(result.totalEvents).toBe(0)
  })

  it('loads assignee stubs from prisma.user batch', async () => {
    const row = makeScheduleRow({
      calendarRule: {
        frequency: 'monthly',
        interval: 1,
        pmMeta: { advanceNoticeDays: 7, defaultAssigneeIds: ['user-1', 'user-2'] },
      },
      nextDue: new Date('2024-06-15T00:00:00Z'),
    })
    const db = { pMSchedule: { findMany: jest.fn().mockResolvedValue([row]) } }
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'user-1', name: 'Alice', avatarUrl: null },
          { id: 'user-2', name: 'Bob', avatarUrl: '/avatars/bob.png' },
        ]),
      },
    }

    const handler = new GetPMCalendarHandler(db as never, prisma as never)
    const result = await handler.handle(
      {
        from: new Date('2024-06-01T00:00:00Z'),
        to: new Date('2024-06-30T00:00:00Z'),
      },
      ctx,
    )

    const entry = result.days.find((d) => d.date === '2024-06-15')!.entries[0]!
    expect(entry.assignees).toHaveLength(2)
    expect(entry.assignees[0]!.name).toBe('Alice')
  })
})

// ── GetUpcomingPMHandler ──────────────────────────────────────────────────────

describe('GetUpcomingPMHandler', () => {
  it('groups items by ISO week', async () => {
    const row = makeScheduleRow({
      nextDue: new Date(Date.now() + 3 * 86_400_000), // 3 days away
    })
    const db = { pMSchedule: { findMany: jest.fn().mockResolvedValue([row]) } }
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([]) } }

    const handler = new GetUpcomingPMHandler(db as never, prisma as never)
    const result = await handler.handle({ horizon: 30 }, ctx)

    expect(result.totalItems).toBe(1)
    expect(result.overdueItems).toHaveLength(0)
    expect(result.weeks).toHaveLength(1)
    expect(result.weeks[0]!.weekLabel).toMatch(/^\d{4}-W\d{2}$/)
    expect(result.weeks[0]!.totalEstimatedHours).toBe(2)
  })

  it('separates overdue items', async () => {
    const rows = [
      makeScheduleRow({ id: 'sched-1', nextDue: new Date(Date.now() - 86_400_000) }), // overdue
      makeScheduleRow({ id: 'sched-2', nextDue: new Date(Date.now() + 3 * 86_400_000) }), // upcoming
    ]
    const db = { pMSchedule: { findMany: jest.fn().mockResolvedValue(rows) } }
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([]) } }

    const handler = new GetUpcomingPMHandler(db as never, prisma as never)
    const result = await handler.handle({ horizon: 30 }, ctx)

    expect(result.overdueItems).toHaveLength(1)
    expect(result.overdueItems[0]!.isOverdue).toBe(true)
    expect(result.weeks).toHaveLength(1)
  })
})

// ── GetPMComplianceHandler ────────────────────────────────────────────────────

describe('GetPMComplianceHandler', () => {
  it('returns 100% compliance when all triggers match planned', async () => {
    const row = makeScheduleRow()
    const db = { pMSchedule: { findMany: jest.fn().mockResolvedValue([row]) } }

    // Simulate 12 audit log entries for this schedule (planned = 12 for monthly/interval=1)
    const auditRows = Array.from({ length: 12 }, () => ({
      after: { pmScheduleId: SCHEDULE_ID, source: 'pm-scheduler' },
    }))

    const prisma = {
      auditLog: { findMany: jest.fn().mockResolvedValue(auditRows) },
    }

    const handler = new GetPMComplianceHandler(db as never, prisma as never)
    const result = await handler.handle({ lookbackMonths: 12 }, ctx)

    expect(result.overallCompliancePct).toBe(100)
    expect(result.schedules[0]!.plannedTriggers).toBe(12)
    expect(result.schedules[0]!.actualTriggers).toBe(12)
    expect(result.schedules[0]!.compliancePct).toBe(100)
    expect(result.fullyCompliant).toBe(1)
  })

  it('returns 0% compliance when no actual triggers', async () => {
    const db = { pMSchedule: { findMany: jest.fn().mockResolvedValue([makeScheduleRow()]) } }
    const prisma = { auditLog: { findMany: jest.fn().mockResolvedValue([]) } }

    const handler = new GetPMComplianceHandler(db as never, prisma as never)
    const result = await handler.handle({}, ctx)

    expect(result.overallCompliancePct).toBe(0)
    expect(result.schedules[0]!.compliancePct).toBe(0)
    expect(result.fullyCompliant).toBe(0)
  })

  it('caps compliance at 100% even with extra triggers', async () => {
    const db = { pMSchedule: { findMany: jest.fn().mockResolvedValue([makeScheduleRow()]) } }

    // 15 actual triggers for a monthly (12 planned)
    const auditRows = Array.from({ length: 15 }, () => ({
      after: { pmScheduleId: SCHEDULE_ID, source: 'pm-scheduler' },
    }))
    const prisma = { auditLog: { findMany: jest.fn().mockResolvedValue(auditRows) } }

    const handler = new GetPMComplianceHandler(db as never, prisma as never)
    const result = await handler.handle({}, ctx)

    expect(result.schedules[0]!.compliancePct).toBe(100)
  })

  it('returns empty result when no schedules', async () => {
    const db = { pMSchedule: { findMany: jest.fn().mockResolvedValue([]) } }
    const prisma = { auditLog: { findMany: jest.fn() } }

    const handler = new GetPMComplianceHandler(db as never, prisma as never)
    const result = await handler.handle({}, ctx)

    expect(result.schedules).toHaveLength(0)
    expect(result.overallCompliancePct).toBe(0)
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled()
  })

  it('groups compliance by category and location', async () => {
    const row = {
      ...makeScheduleRow(),
      asset: {
        id: ASSET_ID,
        assetNumber: 'AST-001',
        name: 'Pump',
        category: { name: 'Pumps' },
        location: { name: 'Building A' },
      },
    }
    const db = { pMSchedule: { findMany: jest.fn().mockResolvedValue([row]) } }
    const prisma = { auditLog: { findMany: jest.fn().mockResolvedValue([]) } }

    const handler = new GetPMComplianceHandler(db as never, prisma as never)
    const result = await handler.handle({}, ctx)

    expect(result.byCategory).toHaveLength(1)
    expect(result.byCategory[0]!.categoryName).toBe('Pumps')
    expect(result.byLocation).toHaveLength(1)
    expect(result.byLocation[0]!.locationName).toBe('Building A')
  })
})
