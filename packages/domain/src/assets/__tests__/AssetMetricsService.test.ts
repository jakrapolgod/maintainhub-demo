/**
 * Unit tests for AssetMetricsService.
 *
 * Scenarios covered:
 *  • MTBF — happy path, single WO, no-date WOs, mixed dated/undated
 *  • MTTR — CORRECTIVE only, mixed types, no CORRECTIVE, missing dates
 *  • Availability — typical, zero MTTR, zero MTBF, zero both
 *  • Maintenance cost ratio — typical, excellent/good/poor thresholds, zero asset value
 *  • Criticality — all four tiers (A/B/C/D), boundary scores
 */
import { WorkOrder } from '../../work-orders/WorkOrder.js'
import { WorkOrderId } from '../../work-orders/value-objects/work-order-id.js'
import { WorkOrderStatus } from '../../work-orders/value-objects/work-order-status.js'
import { Priority } from '../../work-orders/value-objects/priority.js'
import { Money } from '../../work-orders/value-objects/money.js'
import { DomainException } from '../../errors/domain.exception.js'
import { CriticalityLevel } from '../value-objects/criticality-level.js'
import {
  AssetMetricsService,
  type CriticalityFactors,
  type Duration,
} from '../AssetMetricsService.js'

// Convenience aliases for static methods
const {
  calculateMTBF,
  calculateMTTR,
  calculateAvailability,
  calculateMaintenanceCostRatio,
  assessCriticality,
} = AssetMetricsService

// ── Helpers ───────────────────────────────────────────────────────────────────

const WO_ID_1 = 'clh7z2d1h0000z1x1z1x1z1x1'
const WO_ID_2 = 'cm9pq3r2i0000ymbj1nhq1zr2'
const WO_ID_3 = 'clh7z2d1h0001z1x1z1x1z1x3'
const WO_ID_4 = 'clh7z2d1h0002z1x1z1x1z1x4'
const WO_ID_5 = 'clh7z2d1h0003z1x1z1x1z1x5'

type WOType = 'CORRECTIVE' | 'PREVENTIVE' | 'INSPECTION' | 'EMERGENCY'

/**
 * Build a minimal WorkOrder in COMPLETED status.
 * `startedAt` and `completedAt` default to sensible values relative to a
 * reference timestamp so tests are readable without hard-coded epoch math.
 */
function makeWO(opts: {
  id?: string
  type?: WOType
  startedAt?: Date
  completedAt?: Date
  /** omit completedAt entirely (simulate WO with no completion date) */
  noCompletedAt?: true
  /** omit startedAt entirely */
  noStartedAt?: true
}): WorkOrder {
  const id = opts.id ?? WO_ID_1
  const type = opts.type ?? 'CORRECTIVE'
  const started = opts.startedAt ?? new Date('2024-01-01T08:00:00Z')
  const ended = opts.completedAt ?? new Date('2024-01-01T12:00:00Z')

  return WorkOrder.reconstitute({
    id: new WorkOrderId(id),
    tenantId: 'tenant-1',
    woNumber: 'WO-000001',
    title: 'Test Work Order',
    type,
    priority: Priority.from('MEDIUM'),
    status: WorkOrderStatus.COMPLETED,
    assetId: 'asset-1',
    createdById: 'user-1',
    createdAt: new Date('2024-01-01T07:00:00Z'),
    updatedAt: new Date('2024-01-01T12:00:00Z'),
    ...(!opts.noStartedAt && { startedAt: started }),
    ...(!opts.noCompletedAt && { completedAt: ended }),
  })
}

const usd = (amount: number) => new Money(amount, 'USD')

// ── calculateMTBF ─────────────────────────────────────────────────────────────

describe('calculateMTBF', () => {
  it('returns zero duration for empty array', () => {
    const result = calculateMTBF([])
    expect(result).toEqual<Duration>({ hours: 0, days: 0 })
  })

  it('returns zero duration for single work order (insufficient data)', () => {
    const result = calculateMTBF([
      makeWO({ id: WO_ID_1, completedAt: new Date('2024-03-01T10:00:00Z') }),
    ])
    expect(result).toEqual<Duration>({ hours: 0, days: 0 })
  })

  it('calculates MTBF for two failures 48 hours apart', () => {
    const wo1 = makeWO({ id: WO_ID_1, completedAt: new Date('2024-01-01T00:00:00Z') })
    const wo2 = makeWO({ id: WO_ID_2, completedAt: new Date('2024-01-03T00:00:00Z') })
    // one interval of 48 h → MTBF = 48 h = 2 days
    const result = calculateMTBF([wo1, wo2])
    expect(result.hours).toBe(48)
    expect(result.days).toBe(2)
  })

  it('calculates MTBF for three failures and averages the intervals', () => {
    // Intervals: 24 h, 72 h → average = 48 h
    const wo1 = makeWO({ id: WO_ID_1, completedAt: new Date('2024-01-01T00:00:00Z') })
    const wo2 = makeWO({ id: WO_ID_2, completedAt: new Date('2024-01-02T00:00:00Z') }) // +24 h
    const wo3 = makeWO({ id: WO_ID_3, completedAt: new Date('2024-01-05T00:00:00Z') }) // +72 h
    const result = calculateMTBF([wo1, wo2, wo3])
    expect(result.hours).toBe(48)
    expect(result.days).toBe(2)
  })

  it('sorts by completedAt before computing intervals (order-independent input)', () => {
    // Provide WOs in reverse order — result should be identical to sorted input
    const wo1 = makeWO({ id: WO_ID_1, completedAt: new Date('2024-01-01T00:00:00Z') })
    const wo2 = makeWO({ id: WO_ID_2, completedAt: new Date('2024-01-03T00:00:00Z') }) // +48 h
    const reversed = calculateMTBF([wo2, wo1])
    const sorted = calculateMTBF([wo1, wo2])
    expect(reversed).toEqual(sorted)
  })

  it('ignores work orders without a completedAt date', () => {
    const noDate = makeWO({ id: WO_ID_1, noCompletedAt: true })
    const dated = makeWO({ id: WO_ID_2, completedAt: new Date('2024-01-01T00:00:00Z') })
    // Only one dated WO remains → insufficient data → zero
    const result = calculateMTBF([noDate, dated])
    expect(result).toEqual<Duration>({ hours: 0, days: 0 })
  })

  it('skips WOs without completedAt and uses the remaining dated WOs', () => {
    const wo1 = makeWO({ id: WO_ID_1, completedAt: new Date('2024-01-01T00:00:00Z') })
    const wo2 = makeWO({ id: WO_ID_2, noCompletedAt: true }) // filtered out
    const wo3 = makeWO({ id: WO_ID_3, completedAt: new Date('2024-01-03T00:00:00Z') }) // +48 h
    const result = calculateMTBF([wo1, wo2, wo3])
    expect(result.hours).toBe(48)
  })

  it('returns fractional days rounded to 4 decimal places', () => {
    // 36 h apart → days = 36/24 = 1.5000
    const wo1 = makeWO({ id: WO_ID_1, completedAt: new Date('2024-01-01T00:00:00Z') })
    const wo2 = makeWO({ id: WO_ID_2, completedAt: new Date('2024-01-02T12:00:00Z') })
    const result = calculateMTBF([wo1, wo2])
    expect(result.hours).toBe(36)
    expect(result.days).toBe(1.5)
  })

  it('handles a realistic 5-failure scenario', () => {
    // Failures at: Jan 1, Jan 8, Jan 15, Jan 22, Jan 29 (every 7 days = 168 h)
    const wos = [1, 8, 15, 22, 29].map((day, i) =>
      makeWO({
        id: [WO_ID_1, WO_ID_2, WO_ID_3, WO_ID_4, WO_ID_5][i],
        completedAt: new Date(`2024-01-${String(day).padStart(2, '0')}T00:00:00Z`),
      }),
    )
    const result = calculateMTBF(wos)
    expect(result.hours).toBe(168)
    expect(result.days).toBe(7)
  })
})

// ── calculateMTTR ─────────────────────────────────────────────────────────────

describe('calculateMTTR', () => {
  it('returns zero for empty array', () => {
    expect(calculateMTTR([])).toEqual<Duration>({ hours: 0, days: 0 })
  })

  it('returns zero when all WOs are PREVENTIVE (no CORRECTIVE)', () => {
    const wo = makeWO({
      id: WO_ID_1,
      type: 'PREVENTIVE',
      startedAt: new Date('2024-01-01T08:00:00Z'),
      completedAt: new Date('2024-01-01T12:00:00Z'),
    })
    expect(calculateMTTR([wo])).toEqual<Duration>({ hours: 0, days: 0 })
  })

  it('excludes PREVENTIVE WOs from the average', () => {
    const corrective = makeWO({
      id: WO_ID_1,
      type: 'CORRECTIVE',
      startedAt: new Date('2024-01-01T08:00:00Z'),
      completedAt: new Date('2024-01-01T12:00:00Z'),
    }) // 4 h
    const preventive = makeWO({
      id: WO_ID_2,
      type: 'PREVENTIVE',
      startedAt: new Date('2024-01-02T08:00:00Z'),
      completedAt: new Date('2024-01-02T20:00:00Z'),
    }) // 12 h — must not affect avg
    const result = calculateMTTR([corrective, preventive])
    expect(result.hours).toBe(4)
  })

  it('excludes INSPECTION and EMERGENCY WOs', () => {
    const corrective = makeWO({
      id: WO_ID_1,
      type: 'CORRECTIVE',
      startedAt: new Date('2024-01-01T06:00:00Z'),
      completedAt: new Date('2024-01-01T14:00:00Z'),
    }) // 8 h
    const inspection = makeWO({
      id: WO_ID_2,
      type: 'INSPECTION',
      startedAt: new Date('2024-01-02T08:00:00Z'),
      completedAt: new Date('2024-01-02T09:00:00Z'),
    }) // 1 h — excluded
    const emergency = makeWO({
      id: WO_ID_3,
      type: 'EMERGENCY',
      startedAt: new Date('2024-01-03T00:00:00Z'),
      completedAt: new Date('2024-01-03T24:00:00Z'),
    }) // 24 h — excluded
    const result = calculateMTTR([corrective, inspection, emergency])
    expect(result.hours).toBe(8)
  })

  it('calculates average repair time for two CORRECTIVE WOs', () => {
    // WO1: 4 h, WO2: 8 h → average = 6 h
    const wo1 = makeWO({
      id: WO_ID_1,
      type: 'CORRECTIVE',
      startedAt: new Date('2024-01-01T08:00:00Z'),
      completedAt: new Date('2024-01-01T12:00:00Z'),
    })
    const wo2 = makeWO({
      id: WO_ID_2,
      type: 'CORRECTIVE',
      startedAt: new Date('2024-01-02T08:00:00Z'),
      completedAt: new Date('2024-01-02T16:00:00Z'),
    })
    const result = calculateMTTR([wo1, wo2])
    expect(result.hours).toBe(6)
    expect(result.days).toBe(0.25)
  })

  it('ignores CORRECTIVE WOs that are missing startedAt or completedAt', () => {
    const noStart = makeWO({ id: WO_ID_1, type: 'CORRECTIVE', noStartedAt: true })
    const noEnd = makeWO({ id: WO_ID_2, type: 'CORRECTIVE', noCompletedAt: true })
    const complete = makeWO({
      id: WO_ID_3,
      type: 'CORRECTIVE',
      startedAt: new Date('2024-01-01T08:00:00Z'),
      completedAt: new Date('2024-01-01T10:00:00Z'),
    }) // 2 h
    const result = calculateMTTR([noStart, noEnd, complete])
    expect(result.hours).toBe(2)
  })

  it('handles a realistic 3-repair average (1 h, 3 h, 5 h → 3 h avg)', () => {
    const base = new Date('2024-02-01T08:00:00Z').getTime()
    const h = 3_600_000

    const wos = [
      { id: WO_ID_1, offsetMs: 0, durationMs: 1 * h },
      { id: WO_ID_2, offsetMs: 48 * h, durationMs: 3 * h },
      { id: WO_ID_3, offsetMs: 96 * h, durationMs: 5 * h },
    ].map(({ id, offsetMs, durationMs }) =>
      makeWO({
        id,
        type: 'CORRECTIVE',
        startedAt: new Date(base + offsetMs),
        completedAt: new Date(base + offsetMs + durationMs),
      }),
    )

    const result = calculateMTTR(wos)
    expect(result.hours).toBe(3)
  })
})

// ── calculateAvailability ─────────────────────────────────────────────────────

describe('calculateAvailability', () => {
  const TOTAL_HOURS = 8_760 // one year

  it('returns 100 when both MTBF and MTTR are zero (no failures)', () => {
    const zero: Duration = { hours: 0, days: 0 }
    expect(calculateAvailability(TOTAL_HOURS, zero, zero)).toBe(100)
  })

  it('returns 100 when MTTR is zero (instant repairs)', () => {
    const mtbf: Duration = { hours: 720, days: 30 }
    const zero: Duration = { hours: 0, days: 0 }
    expect(calculateAvailability(TOTAL_HOURS, mtbf, zero)).toBe(100)
  })

  it('calculates 96% availability (MTBF=120h, MTTR=5h)', () => {
    // A = 120 / (120 + 5) × 100 = 96.00
    const result = calculateAvailability(
      TOTAL_HOURS,
      { hours: 120, days: 5 },
      { hours: 5, days: 0.2083 },
    )
    expect(result).toBe(96)
  })

  it('calculates 50% availability (MTBF = MTTR)', () => {
    const d: Duration = { hours: 10, days: 0.4167 }
    expect(calculateAvailability(TOTAL_HOURS, d, d)).toBe(50)
  })

  it('rounds result to 2 decimal places', () => {
    // MTBF=100 h, MTTR=3 h → 100/103 × 100 = 97.0873...
    const result = calculateAvailability(
      TOTAL_HOURS,
      { hours: 100, days: 4.1667 },
      { hours: 3, days: 0.125 },
    )
    expect(result).toBe(97.09)
  })

  it('returns near-zero availability when MTBF << MTTR', () => {
    // MTBF=1 h, MTTR=99 h → 1/100 × 100 = 1%
    const result = calculateAvailability(
      TOTAL_HOURS,
      { hours: 1, days: 0.0417 },
      { hours: 99, days: 4.125 },
    )
    expect(result).toBe(1)
  })

  it('totalHours parameter does not affect the result', () => {
    // The formula is independent of totalHours; same answer for any value
    const mtbf: Duration = { hours: 80, days: 3.3333 }
    const mttr: Duration = { hours: 20, days: 0.8333 }
    const a = calculateAvailability(1_000, mtbf, mttr)
    const b = calculateAvailability(100_000, mtbf, mttr)
    expect(a).toBe(b)
    expect(a).toBe(80) // 80/(80+20) × 100
  })
})

// ── calculateMaintenanceCostRatio ─────────────────────────────────────────────

describe('calculateMaintenanceCostRatio', () => {
  it('calculates 2.5% ratio', () => {
    // $2,500 annual cost on a $100,000 asset = 2.5 %
    const result = calculateMaintenanceCostRatio(usd(2_500), usd(100_000))
    expect(result).toBe(2.5)
  })

  it('identifies "excellent" benchmark (< 2%)', () => {
    const result = calculateMaintenanceCostRatio(usd(1_500), usd(100_000))
    expect(result).toBe(1.5)
    expect(result).toBeLessThan(2)
  })

  it('identifies "good" benchmark (2–5%)', () => {
    const result = calculateMaintenanceCostRatio(usd(3_000), usd(100_000))
    expect(result).toBe(3)
    expect(result).toBeGreaterThanOrEqual(2)
    expect(result).toBeLessThanOrEqual(5)
  })

  it('identifies "poor" benchmark (> 5%)', () => {
    const result = calculateMaintenanceCostRatio(usd(6_000), usd(100_000))
    expect(result).toBe(6)
    expect(result).toBeGreaterThan(5)
  })

  it('returns 0 when maintenance cost is zero', () => {
    expect(calculateMaintenanceCostRatio(usd(0), usd(50_000))).toBe(0)
  })

  it('throws ZERO_ASSET_VALUE when assetValue is zero', () => {
    expect(() => calculateMaintenanceCostRatio(usd(1_000), usd(0))).toThrow(
      expect.objectContaining({ code: 'ZERO_ASSET_VALUE' }),
    )
  })

  it('throws a DomainException for zero asset value', () => {
    expect(() => calculateMaintenanceCostRatio(usd(500), usd(0))).toThrow(DomainException)
  })

  it('rounds to 2 decimal places', () => {
    // 1000 / 30000 × 100 = 3.3333...% → 3.33
    const result = calculateMaintenanceCostRatio(usd(1_000), usd(30_000))
    expect(result).toBe(3.33)
  })

  it('handles high-value industrial equipment (> 100% ratio flags abandonment)', () => {
    // A broken-down asset costing more to maintain than its value
    const result = calculateMaintenanceCostRatio(usd(150_000), usd(100_000))
    expect(result).toBe(150)
  })
})

// ── assessCriticality ─────────────────────────────────────────────────────────

describe('assessCriticality', () => {
  // ── Tier A (score 10–12) ─────────────────────────────────────────────────────

  it('returns A for maximum score (3+3+3+3 = 12)', () => {
    const f: CriticalityFactors = {
      safetyImpact: 3,
      productionImpact: 3,
      failureFrequency: 3,
      repairCost: 3,
    }
    expect(assessCriticality(f)).toBe(CriticalityLevel.A)
  })

  it('returns A for score 10 (boundary)', () => {
    const f: CriticalityFactors = {
      safetyImpact: 3,
      productionImpact: 3,
      failureFrequency: 3,
      repairCost: 1, // 3+3+3+1 = 10
    }
    expect(assessCriticality(f)).toBe(CriticalityLevel.A)
  })

  it('A is the canonical singleton', () => {
    const f: CriticalityFactors = {
      safetyImpact: 3,
      productionImpact: 3,
      failureFrequency: 3,
      repairCost: 3,
    }
    expect(assessCriticality(f)).toBe(CriticalityLevel.A)
  })

  // ── Tier B (score 7–9) ───────────────────────────────────────────────────────

  it('returns B for score 9 (upper boundary)', () => {
    const f: CriticalityFactors = {
      safetyImpact: 3,
      productionImpact: 3,
      failureFrequency: 2,
      repairCost: 1, // 3+3+2+1 = 9
    }
    expect(assessCriticality(f)).toBe(CriticalityLevel.B)
  })

  it('returns B for score 7 (lower boundary)', () => {
    const f: CriticalityFactors = {
      safetyImpact: 2,
      productionImpact: 2,
      failureFrequency: 2,
      repairCost: 1, // 2+2+2+1 = 7
    }
    expect(assessCriticality(f)).toBe(CriticalityLevel.B)
  })

  it('returns B for a realistic high-impact scenario', () => {
    // Centrifugal pump in a process plant: high safety, high production, medium frequency, medium cost
    const f: CriticalityFactors = {
      safetyImpact: 3,
      productionImpact: 3,
      failureFrequency: 1,
      repairCost: 2, // 3+3+1+2 = 9
    }
    expect(assessCriticality(f)).toBe(CriticalityLevel.B)
  })

  // ── Tier C (score 5–6) ───────────────────────────────────────────────────────

  it('returns C for score 6 (upper boundary)', () => {
    const f: CriticalityFactors = {
      safetyImpact: 2,
      productionImpact: 2,
      failureFrequency: 1,
      repairCost: 1, // 2+2+1+1 = 6
    }
    expect(assessCriticality(f)).toBe(CriticalityLevel.C)
  })

  it('returns C for score 5 (lower boundary)', () => {
    const f: CriticalityFactors = {
      safetyImpact: 2,
      productionImpact: 1,
      failureFrequency: 1,
      repairCost: 1, // 2+1+1+1 = 5
    }
    expect(assessCriticality(f)).toBe(CriticalityLevel.C)
  })

  // ── Tier D (score 4) ─────────────────────────────────────────────────────────

  it('returns D for minimum score (1+1+1+1 = 4)', () => {
    const f: CriticalityFactors = {
      safetyImpact: 1,
      productionImpact: 1,
      failureFrequency: 1,
      repairCost: 1,
    }
    expect(assessCriticality(f)).toBe(CriticalityLevel.D)
  })

  it('D is the canonical singleton', () => {
    const f: CriticalityFactors = {
      safetyImpact: 1,
      productionImpact: 1,
      failureFrequency: 1,
      repairCost: 1,
    }
    expect(assessCriticality(f)).toBe(CriticalityLevel.D)
  })

  // ── Domain-specific scenarios ────────────────────────────────────────────────

  it('HVAC unit — moderate safety, moderate production, low frequency, low cost → C', () => {
    const f: CriticalityFactors = {
      safetyImpact: 1,
      productionImpact: 2,
      failureFrequency: 1,
      repairCost: 2, // 1+2+1+2 = 6 → C
    }
    expect(assessCriticality(f)).toBe(CriticalityLevel.C)
  })

  it('safety-critical pressure vessel — high safety, medium production, low frequency, high cost → B', () => {
    const f: CriticalityFactors = {
      safetyImpact: 3,
      productionImpact: 2,
      failureFrequency: 1,
      repairCost: 2, // 3+2+1+2 = 8 → B
    }
    expect(assessCriticality(f)).toBe(CriticalityLevel.B)
  })

  it('office lighting — low on all factors → D', () => {
    const f: CriticalityFactors = {
      safetyImpact: 1,
      productionImpact: 1,
      failureFrequency: 1,
      repairCost: 1, // 4 → D
    }
    expect(assessCriticality(f)).toBe(CriticalityLevel.D)
  })

  it('mission-critical turbine — all high → A', () => {
    const f: CriticalityFactors = {
      safetyImpact: 3,
      productionImpact: 3,
      failureFrequency: 3,
      repairCost: 3, // 12 → A
    }
    const result = assessCriticality(f)
    expect(result).toBe(CriticalityLevel.A)
    expect(result.isHighRisk()).toBe(true)
    expect(result.riskScore()).toBe(4)
  })
})

// ── Integration — end-to-end metrics pipeline ─────────────────────────────────

describe('end-to-end metrics pipeline', () => {
  it('calculates KPI summary for a realistic asset history', () => {
    const H = 3_600_000 // 1 hour in ms
    const base = new Date('2024-01-01T00:00:00Z').getTime()

    // Four corrective failures with completedAt exactly 168 h (7 days) apart.
    // Repair durations: 4 h, 6 h, 4 h, 6 h → MTTR = (4+6+4+6)/4 = 5 h
    // MTBF = ((168+168+168) / 3) = 168 h
    // Availability = 168 / (168 + 5) × 100 = 97.11 %
    const scenarios = [
      { id: WO_ID_1, completedOffset: 0 * 168 * H, repairH: 4 },
      { id: WO_ID_2, completedOffset: 1 * 168 * H, repairH: 6 },
      { id: WO_ID_3, completedOffset: 2 * 168 * H, repairH: 4 },
      { id: WO_ID_4, completedOffset: 3 * 168 * H, repairH: 6 },
    ]
    const wos: WorkOrder[] = scenarios.map(({ id, completedOffset, repairH }) =>
      makeWO({
        id,
        type: 'CORRECTIVE',
        startedAt: new Date(base + completedOffset - repairH * H),
        completedAt: new Date(base + completedOffset),
      }),
    )

    const mtbf = calculateMTBF(wos)
    const mttr = calculateMTTR(wos)
    const avail = calculateAvailability(24 * 7 * 4, mtbf, mttr)
    const mcr = calculateMaintenanceCostRatio(usd(5_000), usd(100_000))

    expect(mtbf.hours).toBe(168)
    expect(mtbf.days).toBe(7)
    expect(mttr.hours).toBe(5)
    expect(avail).toBe(97.11) // 168 / 173 × 100 = 97.1098... → 97.11
    expect(mcr).toBe(5) // 5% — borderline poor

    const criticality = assessCriticality({
      safetyImpact: 2,
      productionImpact: 3,
      failureFrequency: 2,
      repairCost: 2, // 2+3+2+2 = 9 → B
    })
    expect(criticality).toBe(CriticalityLevel.B)
  })
})
