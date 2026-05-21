import { GetAssetMetricsHandler } from '../get-asset-metrics'
import type { QueryContext } from '../query.types'

const TENANT = 'tenant-1'
const USER_ID = 'user-1'
const ASSET_ID = 'clh7z2d1h0000z1x1z1x1z1x1'

const ctx: QueryContext = { executingUserId: USER_ID, tenantId: TENANT, userRole: 'MANAGER' }

const BASE = new Date('2024-06-01T12:00:00Z')
const H = 3_600_000

// Valid CUID-format IDs for test WOs
const WO_CUID_1 = 'clh7z2d1h0001z1x1z1x1z1x1'
const WO_CUID_2 = 'clh7z2d1h0002z1x1z1x1z1x1'
const WO_CUID_3 = 'clh7z2d1h0003z1x1z1x1z1x1'

function makeWORow(id: string, startOffsetH: number, durationH: number) {
  return {
    id,
    tenantId: TENANT,
    woNumber: `WO-${id.slice(-4)}`,
    type: 'CORRECTIVE',
    status: 'COMPLETED',
    assetId: ASSET_ID,
    createdById: USER_ID,
    startedAt: new Date(BASE.getTime() - startOffsetH * H),
    completedAt: new Date(BASE.getTime() - startOffsetH * H + durationH * H),
    createdAt: BASE,
    updatedAt: BASE,
  }
}

type WORow = {
  id: string
  tenantId: string
  woNumber: string
  type: string
  status: string
  assetId: string
  createdById: string
  startedAt: Date | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function makeDeps(
  woRows: WORow[] = [],
  costSums = { totalLaborCost: null as null | string, totalPartsCost: null as null | string },
) {
  const db = {
    asset: {
      findFirst: jest.fn().mockResolvedValue({
        id: ASSET_ID,
        assetNumber: 'AST-000001',
        name: 'Test Pump',
        tenantId: TENANT,
      }),
    },
  }
  const prisma = {
    workOrder: {
      findMany: jest.fn().mockResolvedValue(woRows),
      aggregate: jest.fn().mockResolvedValue({ _sum: costSums }),
    },
  }
  return { db, prisma }
}

describe('GetAssetMetricsHandler', () => {
  it('throws NOT_FOUND when asset does not exist', async () => {
    const { db, prisma } = makeDeps()
    ;(db.asset.findFirst as jest.Mock).mockResolvedValue(null)
    const handler = new GetAssetMetricsHandler(db as never, prisma as never)

    await expect(handler.handle({ assetId: ASSET_ID }, ctx)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('returns zero metrics when no WOs exist', async () => {
    const { db, prisma } = makeDeps()
    const handler = new GetAssetMetricsHandler(db as never, prisma as never)

    const result = await handler.handle({ assetId: ASSET_ID, asOf: BASE }, ctx)

    expect(result.mtbfHours).toBe(0)
    expect(result.mttrHours).toBe(0)
    expect(result.availability).toBe(100) // 0 failures → perfect availability
    expect(result.failureCount).toBe(0)
  })

  it('calculates MTTR as average of repair durations', async () => {
    const wos = [
      makeWORow(WO_CUID_1, 200, 4), // 4h repair
      makeWORow(WO_CUID_2, 100, 8), // 8h repair
      makeWORow(WO_CUID_3, 0, 6), // 6h repair
    ]
    const { db, prisma } = makeDeps(wos)
    const handler = new GetAssetMetricsHandler(db as never, prisma as never)

    const result = await handler.handle({ assetId: ASSET_ID, asOf: BASE }, ctx)

    // (4 + 8 + 6) / 3 = 6 hours
    expect(result.mttrHours).toBe(6)
    expect(result.failureCount).toBe(3)
  })

  it('calculates availability correctly (MTBF=100h, MTTR=5h → 95.24%)', async () => {
    // Two WOs 100h apart (completedAt), each 5h long
    const t1 = BASE.getTime() - 105 * H
    const t2 = BASE.getTime() - 5 * H

    const wos = [
      {
        id: WO_CUID_1,
        tenantId: TENANT,
        woNumber: 'WO-1',
        type: 'CORRECTIVE',
        status: 'COMPLETED',
        assetId: ASSET_ID,
        createdById: USER_ID,
        startedAt: new Date(t1),
        completedAt: new Date(t1 + 5 * H),
        createdAt: BASE,
        updatedAt: BASE,
      },
      {
        id: WO_CUID_2,
        tenantId: TENANT,
        woNumber: 'WO-2',
        type: 'CORRECTIVE',
        status: 'COMPLETED',
        assetId: ASSET_ID,
        createdById: USER_ID,
        startedAt: new Date(t2),
        completedAt: new Date(t2 + 5 * H),
        createdAt: BASE,
        updatedAt: BASE,
      },
    ]

    const { db, prisma } = makeDeps(wos)
    const handler = new GetAssetMetricsHandler(db as never, prisma as never)

    const result = await handler.handle({ assetId: ASSET_ID, asOf: BASE }, ctx)

    // MTBF = interval between completedAt / (n-1) = 100h; MTTR = 5h
    expect(result.mtbfHours).toBe(100)
    expect(result.mttrHours).toBe(5)
    // availability = 100 / 105 * 100 ≈ 95.24
    expect(result.availability).toBeCloseTo(95.24, 1)
  })

  it('returns 12 monthly trend points', async () => {
    const { db, prisma } = makeDeps()
    const handler = new GetAssetMetricsHandler(db as never, prisma as never)

    const result = await handler.handle({ assetId: ASSET_ID, asOf: BASE }, ctx)

    expect(result.mttrTrend).toHaveLength(12)
  })

  it('includes correct MTTR in the month a repair occurred', async () => {
    // One repair in May 2024 (BASE is June 2024)
    const may = new Date('2024-05-15T10:00:00Z')
    const wos = [
      {
        id: WO_CUID_1,
        tenantId: TENANT,
        woNumber: 'WO-1',
        type: 'CORRECTIVE',
        status: 'COMPLETED',
        assetId: ASSET_ID,
        createdById: USER_ID,
        startedAt: new Date(may.getTime()),
        completedAt: new Date(may.getTime() + 3 * H),
        createdAt: BASE,
        updatedAt: BASE,
      },
    ]

    const { db, prisma } = makeDeps(wos)
    const handler = new GetAssetMetricsHandler(db as never, prisma as never)

    const result = await handler.handle({ assetId: ASSET_ID, asOf: BASE }, ctx)

    const mayPoint = result.mttrTrend.find((p) => p.month === '2024-05')
    expect(mayPoint).toBeDefined()
    expect(mayPoint!.mttrHours).toBe(3)
    expect(mayPoint!.repairCount).toBe(1)
  })

  it('months with no repairs have mttrHours = 0 and repairCount = 0', async () => {
    const { db, prisma } = makeDeps()
    const handler = new GetAssetMetricsHandler(db as never, prisma as never)

    const result = await handler.handle({ assetId: ASSET_ID, asOf: BASE }, ctx)

    const allZero = result.mttrTrend.every((p) => p.mttrHours === 0 && p.repairCount === 0)
    expect(allZero).toBe(true)
  })

  it('includes total lifetime cost in result', async () => {
    const { db, prisma } = makeDeps([], { totalLaborCost: '10000.00', totalPartsCost: '5000.00' })
    const handler = new GetAssetMetricsHandler(db as never, prisma as never)

    const result = await handler.handle({ assetId: ASSET_ID, asOf: BASE }, ctx)

    expect(result.totalLaborCost).toBe(10000)
    expect(result.totalPartsCost).toBe(5000)
    expect(result.totalLifetimeCost).toBe(15000)
  })

  it('includes assetNumber and name in result', async () => {
    const { db, prisma } = makeDeps()
    const handler = new GetAssetMetricsHandler(db as never, prisma as never)

    const result = await handler.handle({ assetId: ASSET_ID }, ctx)

    expect(result.assetNumber).toBe('AST-000001')
    expect(result.name).toBe('Test Pump')
  })
})
