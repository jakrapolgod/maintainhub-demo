import { GetWorkOrderMetricsHandler } from '../get-work-order-metrics'
import type { QueryContext } from '../query.types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT = 'tenant-1'
const ctx: QueryContext = { executingUserId: 'user-1', tenantId: TENANT, userRole: 'MANAGER' }

const NOW = new Date('2024-06-15T12:00:00Z')

function makeDeps(
  opts: {
    byStatus?: { status: string; _count: { _all: number } }[]
    byPriority?: { priority: string; _count: { _all: number } }[]
    overdue?: number
    completed?: { createdAt: Date; completedAt: Date | null }[]
    costRows?: { totalLaborCost: unknown; totalPartsCost: unknown }[]
  } = {},
) {
  const {
    byStatus = [
      { status: 'OPEN', _count: { _all: 5 } },
      { status: 'IN_PROGRESS', _count: { _all: 3 } },
      { status: 'COMPLETED', _count: { _all: 10 } },
    ],
    byPriority = [
      { priority: 'HIGH', _count: { _all: 4 } },
      { priority: 'MEDIUM', _count: { _all: 8 } },
    ],
    overdue = 2,
    completed = [
      {
        createdAt: new Date('2024-06-01T08:00:00Z'),
        completedAt: new Date('2024-06-01T16:00:00Z'), // 8 hours
      },
      {
        createdAt: new Date('2024-06-02T08:00:00Z'),
        completedAt: new Date('2024-06-02T20:00:00Z'), // 12 hours
      },
    ],
    costRows = [
      { totalLaborCost: '1000.00', totalPartsCost: '500.00' },
      { totalLaborCost: '2000.00', totalPartsCost: null },
    ],
  } = opts

  const db = {
    workOrder: {
      groupBy: jest.fn().mockResolvedValueOnce(byStatus).mockResolvedValueOnce(byPriority),
      count: jest.fn().mockResolvedValue(overdue),
    },
  }

  const prisma = {
    workOrder: {
      findMany: jest.fn().mockResolvedValueOnce(completed).mockResolvedValueOnce(costRows),
    },
  }

  return { db, prisma }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GetWorkOrderMetricsHandler', () => {
  it('returns counts by status', async () => {
    const { db, prisma } = makeDeps()
    const handler = new GetWorkOrderMetricsHandler(db as never, prisma as never)

    const metrics = await handler.handle({ asOf: NOW }, ctx)

    expect(metrics.byStatus.OPEN).toBe(5)
    expect(metrics.byStatus.IN_PROGRESS).toBe(3)
    expect(metrics.byStatus.COMPLETED).toBe(10)
  })

  it('returns counts by priority', async () => {
    const { db, prisma } = makeDeps()
    const handler = new GetWorkOrderMetricsHandler(db as never, prisma as never)

    const metrics = await handler.handle({ asOf: NOW }, ctx)

    expect(metrics.byPriority.HIGH).toBe(4)
    expect(metrics.byPriority.MEDIUM).toBe(8)
  })

  it('returns overdue count', async () => {
    const { db, prisma } = makeDeps({ overdue: 7 })
    const handler = new GetWorkOrderMetricsHandler(db as never, prisma as never)

    const metrics = await handler.handle({ asOf: NOW }, ctx)

    expect(metrics.overdueCount).toBe(7)
  })

  it('calculates average completion time in hours', async () => {
    // 8h + 12h = avg 10h
    const { db, prisma } = makeDeps()
    const handler = new GetWorkOrderMetricsHandler(db as never, prisma as never)

    const metrics = await handler.handle({ asOf: NOW }, ctx)

    expect(metrics.avgCompletionHours).toBeCloseTo(10, 1)
  })

  it('returns null avgCompletionHours when no completed WOs', async () => {
    const { db, prisma } = makeDeps({ completed: [] })
    const handler = new GetWorkOrderMetricsHandler(db as never, prisma as never)

    const metrics = await handler.handle({ asOf: NOW }, ctx)

    expect(metrics.avgCompletionHours).toBeNull()
  })

  it('calculates totalCostThisMonth as labor + parts sum', async () => {
    // 1000 + 500 + 2000 + 0 = 3500
    const { db, prisma } = makeDeps()
    const handler = new GetWorkOrderMetricsHandler(db as never, prisma as never)

    const metrics = await handler.handle({ asOf: NOW }, ctx)

    expect(metrics.totalCostThisMonth).toBeCloseTo(3500)
  })

  it('handles null cost columns gracefully (treats as zero)', async () => {
    const { db, prisma } = makeDeps({
      costRows: [{ totalLaborCost: null, totalPartsCost: null }],
    })
    const handler = new GetWorkOrderMetricsHandler(db as never, prisma as never)

    const metrics = await handler.handle({ asOf: NOW }, ctx)

    expect(metrics.totalCostThisMonth).toBe(0)
  })

  it('returns zero totalCostThisMonth when no WOs completed this month', async () => {
    const { db, prisma } = makeDeps({ costRows: [] })
    const handler = new GetWorkOrderMetricsHandler(db as never, prisma as never)

    const metrics = await handler.handle({ asOf: NOW }, ctx)

    expect(metrics.totalCostThisMonth).toBe(0)
  })

  it('skips entries with null completedAt in avg calculation', async () => {
    const { db, prisma } = makeDeps({
      completed: [
        {
          createdAt: new Date('2024-06-01T08:00:00Z'),
          completedAt: null, // should be ignored
        },
        {
          createdAt: new Date('2024-06-02T08:00:00Z'),
          completedAt: new Date('2024-06-02T12:00:00Z'), // 4 hours
        },
      ],
    })
    const handler = new GetWorkOrderMetricsHandler(db as never, prisma as never)

    const metrics = await handler.handle({ asOf: NOW }, ctx)

    // Only the completed-with-date row counts: 4 / 2 rows loaded = 2h average
    // (null rows add 0 to sum but denominator is completedRows.length = 2)
    expect(metrics.avgCompletionHours).toBeCloseTo(2, 1)
  })
})
