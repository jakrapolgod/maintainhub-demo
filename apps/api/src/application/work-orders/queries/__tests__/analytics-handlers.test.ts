/**
 * Unit tests for the analytics query handlers backing the /analytics page:
 *   GetAssetReliabilityHandler — MTBF / MTTR / availability / trend / volume
 *   GetCostBreakdownHandler    — cost mix (incl. contractor split) + monthly by category
 *
 * The TenantClient is mocked with plain jest.fn() objects — these handlers
 * only use workOrder.findMany / workOrder.groupBy.
 */
import { GetAssetReliabilityHandler } from '../get-asset-reliability.js'
import { GetCostBreakdownHandler } from '../get-cost-breakdown.js'
import type { TenantClient } from '../../../../lib/tenant-prisma.js'
import type { QueryContext } from '../query.types.js'

const ctx: QueryContext = {
  executingUserId: 'user-1',
  tenantId: 'tenant-a',
  userRole: 'MANAGER',
}

// 30-day window: 2026-05-01 → 2026-05-31 (720 hours)
const FROM = new Date('2026-05-01T00:00:00.000Z')
const TO = new Date('2026-05-31T00:00:00.000Z')

const asset = (name: string) => ({ assetNumber: `A-${name}`, name })

function wo(overrides: Record<string, unknown>) {
  return {
    assetId: 'asset-1',
    type: 'CORRECTIVE',
    createdAt: new Date('2026-05-02T00:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    asset: asset('Pump'),
    ...overrides,
  }
}

describe('GetAssetReliabilityHandler', () => {
  function makeDb(rows: unknown[], prevRows: unknown[] = [], openRows: unknown[] = []) {
    return {
      workOrder: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(rows) // current period
          .mockResolvedValueOnce(prevRows), // previous period
        groupBy: jest.fn().mockResolvedValue(openRows),
      },
    } as unknown as TenantClient
  }

  it('computes MTBF, MTTR and availability from failure WOs', async () => {
    // Two failures, each repaired in 10h → downtime 20h
    const rows = [
      wo({
        startedAt: new Date('2026-05-02T00:00:00.000Z'),
        completedAt: new Date('2026-05-02T10:00:00.000Z'),
      }),
      wo({
        startedAt: new Date('2026-05-10T00:00:00.000Z'),
        completedAt: new Date('2026-05-10T10:00:00.000Z'),
        createdAt: new Date('2026-05-10T00:00:00.000Z'),
      }),
    ]
    const handler = new GetAssetReliabilityHandler(makeDb(rows))
    const result = await handler.handle({ from: FROM, to: TO }, ctx)

    expect(result.assets).toHaveLength(1)
    const row = result.assets[0]!
    expect(row.failureCount).toBe(2)
    expect(row.mttrHours).toBe(10)
    // MTBF = (720 − 20) / 2 = 350
    expect(row.mtbfHours).toBe(350)
    // availability = 700 / 720 = 97.22%
    expect(row.availabilityPct).toBeCloseTo(97.22, 1)
  })

  it('ignores PREVENTIVE/INSPECTION WOs for failure metrics but counts them in volume', async () => {
    const rows = [
      wo({ type: 'PREVENTIVE' }),
      wo({ type: 'INSPECTION' }),
      wo({ type: 'EMERGENCY', completedAt: new Date('2026-05-02T05:00:00.000Z') }),
    ]
    const handler = new GetAssetReliabilityHandler(makeDb(rows))
    const result = await handler.handle({ from: FROM, to: TO }, ctx)

    expect(result.assets).toHaveLength(1)
    expect(result.assets[0]!.failureCount).toBe(1) // EMERGENCY only
    const may = result.volumeByType.find((p) => p.month === '2026-05')!
    expect(may.PREVENTIVE).toBe(1)
    expect(may.INSPECTION).toBe(1)
    expect(may.EMERGENCY).toBe(1)
    expect(may.CORRECTIVE).toBe(0)
  })

  it('reports trend "down" when availability worsened vs the previous period', async () => {
    // Current period: 100h downtime; previous: none
    const rows = [
      wo({
        startedAt: new Date('2026-05-02T00:00:00.000Z'),
        completedAt: new Date('2026-05-06T04:00:00.000Z'), // 100h
      }),
    ]
    const prevRows = [wo({ createdAt: new Date('2026-04-15T00:00:00.000Z') })] // failure, no downtime
    const handler = new GetAssetReliabilityHandler(makeDb(rows, prevRows))
    const result = await handler.handle({ from: FROM, to: TO }, ctx)

    expect(result.assets[0]!.trend).toBe('down')
  })

  it('attaches current open WO counts per asset', async () => {
    const rows = [wo({})]
    const openRows = [{ assetId: 'asset-1', _count: { _all: 3 } }]
    const handler = new GetAssetReliabilityHandler(makeDb(rows, [], openRows))
    const result = await handler.handle({ from: FROM, to: TO }, ctx)

    expect(result.assets[0]!.openWorkOrders).toBe(3)
  })

  it('produces one month bucket per month in range, even with no data', async () => {
    const handler = new GetAssetReliabilityHandler(makeDb([]))
    const result = await handler.handle(
      { from: new Date('2026-01-15T00:00:00.000Z'), to: new Date('2026-03-15T00:00:00.000Z') },
      ctx,
    )
    expect(result.volumeByType.map((p) => p.month)).toEqual(['2026-01', '2026-02', '2026-03'])
  })
})

describe('GetCostBreakdownHandler', () => {
  function makeDb(rows: unknown[]) {
    return {
      workOrder: { findMany: jest.fn().mockResolvedValue(rows) },
    } as unknown as TenantClient
  }

  it('splits contractor labor out of the labor total', async () => {
    const rows = [
      {
        completedAt: new Date('2026-05-10T00:00:00.000Z'),
        totalLaborCost: 1000,
        totalPartsCost: 400,
        failureCode: { category: 'Mechanical' },
        laborEntries: [
          { totalCost: 600, technician: { role: 'TECHNICIAN' } },
          { totalCost: 400, technician: { role: 'CONTRACTOR' } },
        ],
      },
    ]
    const handler = new GetCostBreakdownHandler(makeDb(rows))
    const result = await handler.handle({ from: FROM, to: TO }, ctx)

    expect(result.costMix).toEqual({ labor: 600, parts: 400, contractor: 400 })
    expect(result.totalCost).toBe(1400)
  })

  it('groups monthly cost by failure-code category with Uncategorised fallback', async () => {
    const rows = [
      {
        completedAt: new Date('2026-05-10T00:00:00.000Z'),
        totalLaborCost: 100,
        totalPartsCost: 0,
        failureCode: { category: 'Electrical' },
        laborEntries: [],
      },
      {
        completedAt: new Date('2026-05-20T00:00:00.000Z'),
        totalLaborCost: 50,
        totalPartsCost: 25,
        failureCode: null,
        laborEntries: [],
      },
    ]
    const handler = new GetCostBreakdownHandler(makeDb(rows))
    const result = await handler.handle({ from: FROM, to: TO }, ctx)

    expect(result.monthlyByCategory).toEqual([
      { month: '2026-05', categories: { Electrical: 100, Uncategorised: 75 } },
    ])
  })
})
