import { GetWorkOrderCalendarHandler } from '../get-work-order-calendar'
import type { GetWorkOrderCalendarQuery } from '../get-work-order-calendar'
import type { QueryContext } from '../query.types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT = 'tenant-1'
const ctx: QueryContext = { executingUserId: 'user-1', tenantId: TENANT, userRole: 'MANAGER' }

function makeWoRow(overrides = {}) {
  return {
    id: 'wo-1',
    woNumber: 'WO-2024-000001',
    title: 'Replace seal',
    type: 'CORRECTIVE',
    priority: 'HIGH',
    status: 'OPEN',
    assetId: 'asset-1',
    dueDate: new Date('2024-06-10T00:00:00Z'),
    asset: { id: 'asset-1', name: 'Pump P-101' },
    ...overrides,
  }
}

function makePmRow(overrides = {}) {
  return {
    id: 'pm-1',
    title: 'Monthly inspection',
    assetId: 'asset-1',
    nextDue: new Date('2024-06-12T00:00:00Z'),
    asset: { id: 'asset-1', name: 'Pump P-101' },
    ...overrides,
  }
}

function makeDeps(
  opts: {
    woRows?: ReturnType<typeof makeWoRow>[]
    pmRows?: ReturnType<typeof makePmRow>[]
  } = {},
) {
  const { woRows = [makeWoRow()], pmRows = [makePmRow()] } = opts

  const db = {
    workOrder: {
      findMany: jest.fn().mockResolvedValue(woRows),
    },
  }

  const prisma = {
    pMSchedule: {
      findMany: jest.fn().mockResolvedValue(pmRows),
    },
  }

  return { db, prisma }
}

const BASE_QUERY: GetWorkOrderCalendarQuery = { from: '2024-06-01', to: '2024-06-30' }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GetWorkOrderCalendarHandler', () => {
  it('returns from and to in the result', async () => {
    const { db, prisma } = makeDeps()
    const handler = new GetWorkOrderCalendarHandler(db as never, prisma as never)

    const result = await handler.handle(BASE_QUERY, ctx)

    expect(result.from).toBe('2024-06-01')
    expect(result.to).toBe('2024-06-30')
  })

  it('groups work orders by dueDate', async () => {
    const { db, prisma } = makeDeps()
    const handler = new GetWorkOrderCalendarHandler(db as never, prisma as never)

    const result = await handler.handle(BASE_QUERY, ctx)

    const jun10 = result.days.find((d) => d.date === '2024-06-10')
    expect(jun10).toBeDefined()
    expect(jun10?.workOrders).toHaveLength(1)
    expect(jun10?.workOrders[0]?.woNumber).toBe('WO-2024-000001')
  })

  it('groups PM schedules by nextDue', async () => {
    const { db, prisma } = makeDeps()
    const handler = new GetWorkOrderCalendarHandler(db as never, prisma as never)

    const result = await handler.handle(BASE_QUERY, ctx)

    const jun12 = result.days.find((d) => d.date === '2024-06-12')
    expect(jun12).toBeDefined()
    expect(jun12?.pmDue).toHaveLength(1)
    expect(jun12?.pmDue[0]?.title).toBe('Monthly inspection')
  })

  it('includes asset names in WO entries', async () => {
    const { db, prisma } = makeDeps()
    const handler = new GetWorkOrderCalendarHandler(db as never, prisma as never)

    const result = await handler.handle(BASE_QUERY, ctx)

    const woEntry = result.days.find((d) => d.date === '2024-06-10')?.workOrders[0]
    expect(woEntry?.assetName).toBe('Pump P-101')
  })

  it('includes asset names in PM entries', async () => {
    const { db, prisma } = makeDeps()
    const handler = new GetWorkOrderCalendarHandler(db as never, prisma as never)

    const result = await handler.handle(BASE_QUERY, ctx)

    const pmEntry = result.days.find((d) => d.date === '2024-06-12')?.pmDue[0]
    expect(pmEntry?.assetName).toBe('Pump P-101')
  })

  it('only includes days that have WOs or PM entries (no empty days)', async () => {
    const { db, prisma } = makeDeps()
    const handler = new GetWorkOrderCalendarHandler(db as never, prisma as never)

    const result = await handler.handle(BASE_QUERY, ctx)

    // Only 2 days should appear: jun10 (WO) and jun12 (PM)
    expect(result.days).toHaveLength(2)
    expect(result.days.map((d) => d.date).sort()).toEqual(['2024-06-10', '2024-06-12'])
  })

  it('can place WO and PM on the same day', async () => {
    const { db, prisma } = makeDeps({
      woRows: [makeWoRow({ dueDate: new Date('2024-06-15T00:00:00Z') })],
      pmRows: [makePmRow({ nextDue: new Date('2024-06-15T00:00:00Z') })],
    })
    const handler = new GetWorkOrderCalendarHandler(db as never, prisma as never)

    const result = await handler.handle(BASE_QUERY, ctx)

    const jun15 = result.days.find((d) => d.date === '2024-06-15')
    expect(jun15?.workOrders).toHaveLength(1)
    expect(jun15?.pmDue).toHaveLength(1)
  })

  it('returns empty days array when no WOs or PMs in range', async () => {
    const { db, prisma } = makeDeps({ woRows: [], pmRows: [] })
    const handler = new GetWorkOrderCalendarHandler(db as never, prisma as never)

    const result = await handler.handle(BASE_QUERY, ctx)

    expect(result.days).toHaveLength(0)
  })

  it('handles WO rows without dueDate (skips them)', async () => {
    const { db, prisma } = makeDeps({
      woRows: [makeWoRow({ dueDate: null })],
      pmRows: [],
    })
    const handler = new GetWorkOrderCalendarHandler(db as never, prisma as never)

    const result = await handler.handle(BASE_QUERY, ctx)

    expect(result.days).toHaveLength(0)
  })

  it('passes correct date range to workOrder query', async () => {
    const { db, prisma } = makeDeps({ woRows: [], pmRows: [] })
    const handler = new GetWorkOrderCalendarHandler(db as never, prisma as never)

    await handler.handle({ from: '2024-07-01', to: '2024-07-31' }, ctx)

    const where = (db.workOrder.findMany as jest.Mock).mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >
    const dueDateFilter = where.dueDate as { gte: Date; lte: Date }
    expect(dueDateFilter.gte.toISOString()).toBe('2024-07-01T00:00:00.000Z')
    expect(dueDateFilter.lte.toISOString()).toBe('2024-07-31T23:59:59.999Z')
  })
})
