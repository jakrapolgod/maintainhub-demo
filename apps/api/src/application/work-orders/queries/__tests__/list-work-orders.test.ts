import { ListWorkOrdersHandler } from '../list-work-orders'
import type { ListWorkOrdersQuery } from '../list-work-orders'
import type { QueryContext } from '../query.types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT = 'tenant-1'
const ctx: QueryContext = { executingUserId: 'user-1', tenantId: TENANT, userRole: 'MANAGER' }

const NOW = new Date('2024-06-01T10:00:00Z')

function makeWoRow(overrides = {}) {
  return {
    id: 'wo-1',
    woNumber: 'WO-2024-000001',
    title: 'Fix pump',
    type: 'CORRECTIVE',
    priority: 'HIGH',
    status: 'OPEN',
    assetId: 'asset-1',
    assigneeIds: ['tech-1'],
    dueDate: null,
    slaDeadline: null,
    completedAt: null,
    totalLaborCost: null,
    totalPartsCost: null,
    createdAt: NOW,
    updatedAt: NOW,
    asset: { id: 'asset-1', name: 'Pump P-101' },
    ...overrides,
  }
}

function makeDeps(
  opts: {
    rows?: ReturnType<typeof makeWoRow>[]
    total?: number
    users?: { id: string; name: string; avatarUrl: string | null }[]
    cacheHit?: boolean
  } = {},
) {
  const {
    rows = [makeWoRow()],
    total = rows.length,
    users = [{ id: 'tech-1', name: 'Alice', avatarUrl: null }],
    cacheHit = false,
  } = opts

  const db = {
    workOrder: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(total),
    },
    user: {
      findMany: jest.fn().mockResolvedValue(users),
    },
  }

  const prisma = {}

  const redis = {
    get: jest
      .fn()
      .mockResolvedValue(
        cacheHit ? JSON.stringify({ items: [], total: 0, nextCursor: null }) : null,
      ),
    set: jest.fn().mockResolvedValue('OK'),
    scan: jest.fn().mockResolvedValue(['0', []]),
    del: jest.fn().mockResolvedValue(1),
  }

  return { db, prisma, redis }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ListWorkOrdersHandler', () => {
  it('returns items, total, and null nextCursor for a single page', async () => {
    const { db, prisma, redis } = makeDeps()
    const handler = new ListWorkOrdersHandler(db as never, prisma as never, redis as never)

    const result = await handler.handle({}, ctx)

    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.nextCursor).toBeNull()
  })

  it('enriches items with assignee stubs', async () => {
    const { db, prisma, redis } = makeDeps()
    const handler = new ListWorkOrdersHandler(db as never, prisma as never, redis as never)

    const result = await handler.handle({}, ctx)

    expect(result.items[0]?.assignees).toEqual([{ id: 'tech-1', name: 'Alice', avatarUrl: null }])
  })

  it('returns cached result without hitting db when cache is warm', async () => {
    const { db, prisma, redis } = makeDeps({ cacheHit: true })
    const handler = new ListWorkOrdersHandler(db as never, prisma as never, redis as never)

    const result = await handler.handle({}, ctx)

    expect(db.workOrder.findMany).not.toHaveBeenCalled()
    expect(result.items).toHaveLength(0)
  })

  it('writes result to cache after a db fetch', async () => {
    const { db, prisma, redis } = makeDeps()
    const handler = new ListWorkOrdersHandler(db as never, prisma as never, redis as never)

    await handler.handle({}, ctx)

    expect(redis.set).toHaveBeenCalledTimes(1)
    const [key, , , ttl] = (redis.set as jest.Mock).mock.calls[0] as [
      string,
      string,
      string,
      number,
    ]
    expect(key).toMatch(/^wo:list:tenant-1:/)
    expect(ttl).toBe(30)
  })

  it('sets nextCursor when there are more rows than the limit', async () => {
    const row1 = makeWoRow({ id: 'wo-1', createdAt: new Date('2024-06-01T10:00:00Z') })
    const row2 = makeWoRow({ id: 'wo-2', createdAt: new Date('2024-05-01T10:00:00Z') })
    // DB returns limit+1 rows (fetchs one extra)
    const { db, prisma, redis } = makeDeps({ rows: [row1, row2], total: 5 })
    const handler = new ListWorkOrdersHandler(db as never, prisma as never, redis as never)

    const result = await handler.handle({ limit: 1 }, ctx)

    expect(result.items).toHaveLength(1)
    expect(result.nextCursor).not.toBeNull()
  })

  it('passes filters down to the db query', async () => {
    const { db, prisma, redis } = makeDeps()
    const handler = new ListWorkOrdersHandler(db as never, prisma as never, redis as never)

    const q: ListWorkOrdersQuery = {
      status: ['OPEN', 'IN_PROGRESS'],
      priority: ['HIGH'],
      search: 'pump',
    }
    await handler.handle(q, ctx)

    const whereArg = (db.workOrder.findMany as jest.Mock).mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >
    expect(whereArg).toBeDefined()
    expect(whereArg.status).toMatchObject({ in: ['OPEN', 'IN_PROGRESS'] })
    expect(whereArg.priority).toMatchObject({ in: ['HIGH'] })
  })

  it('filters by assigneeId using { has } predicate', async () => {
    const { db, prisma, redis } = makeDeps()
    const handler = new ListWorkOrdersHandler(db as never, prisma as never, redis as never)

    await handler.handle({ assigneeId: 'tech-99' }, ctx)

    const where = (db.workOrder.findMany as jest.Mock).mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >
    expect(where.assigneeIds).toEqual({ has: 'tech-99' })
  })

  it('respects page and limit for offset pagination', async () => {
    const { db, prisma, redis } = makeDeps({ rows: [], total: 0 })
    const handler = new ListWorkOrdersHandler(db as never, prisma as never, redis as never)

    await handler.handle({ page: 3, limit: 10 }, ctx)

    const findManyArg = (db.workOrder.findMany as jest.Mock).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(findManyArg.skip).toBe(20) // (page-1) * limit = 2*10
    expect(findManyArg.take).toBe(11) // limit + 1
  })

  it('sorts by priority in memory preserving createdAt tiebreaker', async () => {
    const low = makeWoRow({ id: 'wo-low', priority: 'LOW', createdAt: new Date('2024-01-03') })
    const high = makeWoRow({ id: 'wo-high', priority: 'HIGH', createdAt: new Date('2024-01-02') })
    const medium = makeWoRow({
      id: 'wo-medium',
      priority: 'MEDIUM',
      createdAt: new Date('2024-01-01'),
    })
    const { db, prisma, redis } = makeDeps({ rows: [low, high, medium], total: 3 })
    const handler = new ListWorkOrdersHandler(db as never, prisma as never, redis as never)

    const result = await handler.handle({ sortBy: 'priority', sortDir: 'asc' }, ctx)

    expect(result.items.map((i) => i.priority)).toEqual(['HIGH', 'MEDIUM', 'LOW'])
  })

  it('caps limit at 100', async () => {
    const { db, prisma, redis } = makeDeps({ rows: [], total: 0 })
    const handler = new ListWorkOrdersHandler(db as never, prisma as never, redis as never)

    await handler.handle({ limit: 500 }, ctx)

    const findManyArg = (db.workOrder.findMany as jest.Mock).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(findManyArg.take).toBe(101) // 100 + 1
  })

  it('returns empty items list when no WOs match', async () => {
    const { db, prisma, redis } = makeDeps({ rows: [], total: 0 })
    const handler = new ListWorkOrdersHandler(db as never, prisma as never, redis as never)

    const result = await handler.handle({ status: ['CANCELLED'] }, ctx)

    expect(result.items).toHaveLength(0)
    expect(result.total).toBe(0)
    expect(result.nextCursor).toBeNull()
  })
})
