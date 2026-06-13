/**
 * GetAssetReliabilityHandler — per-asset MTBF / MTTR / availability.
 *
 * ## Definitions
 *   failure       — CORRECTIVE or EMERGENCY work order created in the period
 *   repair time   — completedAt − (startedAt ?? createdAt), completed WOs only
 *   MTBF          — (period hours − total downtime) / failure count
 *   MTTR          — total repair hours / completed repair count
 *   availability  — (period hours − total downtime) / period hours × 100
 *
 * Downtime is approximated from repair time of completed failures; failures
 * still open at query time contribute to MTBF (failure count) but not to
 * downtime, so availability is an upper-bound estimate.
 *
 * ## Trend
 * Availability is recomputed for the preceding period of equal length;
 * a delta beyond ±0.5 percentage points yields 'up' / 'down', else 'flat'.
 *
 * Aggregation happens in JS over a minimal projection — the row count is
 * bounded by WOs created in the window for one tenant, which is small.
 */
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import type {
  QueryContext,
  AssetReliabilityResult,
  AssetReliabilityRow,
  MonthlySeriesPoint,
  VolumeByTypePoint,
} from './query.types.js'

// ── Query ─────────────────────────────────────────────────────────────────────

export interface GetAssetReliabilityQuery {
  /** Start of period (inclusive). @default 12 months before `to` */
  from?: Date
  /** End of period (inclusive). @default now */
  to?: Date
  /** Number of assets charted in the monthly series. @default 5 */
  topAssets?: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FAILURE_TYPES = ['CORRECTIVE', 'EMERGENCY'] as const
const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED'] as const
const DEFAULT_TOP_ASSETS = 5
const MAX_TABLE_ROWS = 20
/** Availability delta (percentage points) below which the trend is 'flat'. */
const TREND_EPSILON = 0.5
const MS_PER_HOUR = 3_600_000

// ── Internal shapes ───────────────────────────────────────────────────────────

interface WoRow {
  assetId: string
  type: string
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
  asset: { assetNumber: string; name: string }
}

interface AssetAgg {
  assetNumber: string
  assetName: string
  failureCount: number
  downtimeHours: number
  repairCount: number
  repairHours: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isFailure(type: string): boolean {
  return (FAILURE_TYPES as readonly string[]).includes(type)
}

function repairHours(row: WoRow): number | null {
  if (row.completedAt === null) return null
  const start = row.startedAt ?? row.createdAt
  const hours = (row.completedAt.getTime() - start.getTime()) / MS_PER_HOUR
  return hours > 0 ? hours : 0
}

function monthKey(d: Date): string {
  return `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** All YYYY-MM keys from `from` to `to` inclusive, in order. */
function monthRange(from: Date, to: Date): string[] {
  const keys: string[] = []
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1))
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1))
  while (cursor <= end) {
    keys.push(monthKey(cursor))
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return keys
}

function aggregateByAsset(rows: WoRow[]): Map<string, AssetAgg> {
  const byAsset = new Map<string, AssetAgg>()
  for (const row of rows) {
    if (isFailure(row.type)) {
      let agg = byAsset.get(row.assetId)
      if (!agg) {
        agg = {
          assetNumber: row.asset.assetNumber,
          assetName: row.asset.name,
          failureCount: 0,
          downtimeHours: 0,
          repairCount: 0,
          repairHours: 0,
        }
        byAsset.set(row.assetId, agg)
      }
      agg.failureCount += 1
      const repair = repairHours(row)
      if (repair !== null) {
        agg.downtimeHours += repair
        agg.repairCount += 1
        agg.repairHours += repair
      }
    }
  }
  return byAsset
}

function availabilityPct(agg: AssetAgg | undefined, periodHours: number): number {
  if (!agg || periodHours <= 0) return 100
  const uptime = Math.max(0, periodHours - agg.downtimeHours)
  return Math.round((uptime / periodHours) * 10_000) / 100
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class GetAssetReliabilityHandler {
  private readonly db: TenantClient

  constructor(db: TenantClient) {
    this.db = db
  }

  async handle(
    query: GetAssetReliabilityQuery,
    _ctx: QueryContext,
  ): Promise<AssetReliabilityResult> {
    const to = query.to ?? new Date()
    const from = query.from ?? new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1))
    const topAssets = query.topAssets ?? DEFAULT_TOP_ASSETS

    const periodMs = to.getTime() - from.getTime()
    const periodHours = periodMs / MS_PER_HOUR
    const prevFrom = new Date(from.getTime() - periodMs)

    // ── Load current + previous period WOs and open counts in parallel ───────
    const select = {
      assetId: true,
      type: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
      asset: { select: { assetNumber: true, name: true } },
    } as const

    const [rows, prevRows, openRows] = await Promise.all([
      this.db.workOrder.findMany({
        where: { deletedAt: null, createdAt: { gte: from, lte: to } },
        select,
      }),
      this.db.workOrder.findMany({
        where: {
          deletedAt: null,
          createdAt: { gte: prevFrom, lt: from },
          type: { in: [...FAILURE_TYPES] },
        },
        select,
      }),
      this.db.workOrder.groupBy({
        by: ['assetId'],
        where: { deletedAt: null, status: { notIn: [...TERMINAL_STATUSES] } },
        _count: { _all: true },
      }),
    ])

    const openByAsset = new Map<string, number>()
    for (const r of openRows) {
      // eslint-disable-next-line no-underscore-dangle
      openByAsset.set(r.assetId, r._count._all)
    }

    // ── Per-asset table ───────────────────────────────────────────────────────
    const current = aggregateByAsset(rows)
    const previous = aggregateByAsset(prevRows)

    const assets: AssetReliabilityRow[] = [...current.entries()]
      .map(([assetId, agg]) => {
        const avail = availabilityPct(agg, periodHours)
        const prevAvail = availabilityPct(previous.get(assetId), periodHours)
        const delta = avail - prevAvail
        let trend: AssetReliabilityRow['trend'] = 'flat'
        if (delta > TREND_EPSILON) trend = 'up'
        else if (delta < -TREND_EPSILON) trend = 'down'

        return {
          assetId,
          assetNumber: agg.assetNumber,
          assetName: agg.assetName,
          mtbfHours:
            agg.failureCount > 0
              ? round2(Math.max(0, periodHours - agg.downtimeHours) / agg.failureCount)
              : null,
          mttrHours: agg.repairCount > 0 ? round2(agg.repairHours / agg.repairCount) : null,
          availabilityPct: avail,
          failureCount: agg.failureCount,
          openWorkOrders: openByAsset.get(assetId) ?? 0,
          trend,
        }
      })
      .sort((a, b) => a.availabilityPct - b.availabilityPct)
      .slice(0, MAX_TABLE_ROWS)

    // ── Monthly series for the top-N assets by failure count ─────────────────
    const topIds = [...current.entries()]
      .sort((a, b) => b[1].failureCount - a[1].failureCount)
      .slice(0, topAssets)
      .map(([assetId, agg]) => ({ assetId, assetName: agg.assetName }))

    const months = monthRange(from, to)
    const monthHours = 730 // average hours per month — series granularity only

    // failures created per asset per month / repair hours per asset per month
    const failuresByMonth = new Map<string, Map<string, number>>()
    const repairsByMonth = new Map<string, Map<string, { hours: number; count: number }>>()
    for (const row of rows) {
      if (isFailure(row.type)) {
        const mCreated = monthKey(row.createdAt)
        let fm = failuresByMonth.get(mCreated)
        if (!fm) {
          fm = new Map()
          failuresByMonth.set(mCreated, fm)
        }
        fm.set(row.assetId, (fm.get(row.assetId) ?? 0) + 1)

        const repair = repairHours(row)
        if (repair !== null && row.completedAt !== null) {
          const mCompleted = monthKey(row.completedAt)
          let rm = repairsByMonth.get(mCompleted)
          if (!rm) {
            rm = new Map()
            repairsByMonth.set(mCompleted, rm)
          }
          const entry = rm.get(row.assetId) ?? { hours: 0, count: 0 }
          entry.hours += repair
          entry.count += 1
          rm.set(row.assetId, entry)
        }
      }
    }

    const mtbfSeries: MonthlySeriesPoint[] = months.map((month) => {
      const values: Record<string, number | null> = {}
      for (const { assetId, assetName } of topIds) {
        const failures = failuresByMonth.get(month)?.get(assetId) ?? 0
        values[assetName] = failures > 0 ? round2(monthHours / failures) : null
      }
      return { month, values }
    })

    const mttrSeries: MonthlySeriesPoint[] = months.map((month) => {
      const values: Record<string, number | null> = {}
      for (const { assetId, assetName } of topIds) {
        const entry = repairsByMonth.get(month)?.get(assetId)
        values[assetName] = entry && entry.count > 0 ? round2(entry.hours / entry.count) : null
      }
      return { month, values }
    })

    // ── WO volume by type per month ───────────────────────────────────────────
    const volumeMap = new Map<string, VolumeByTypePoint>()
    for (const month of months) {
      volumeMap.set(month, { month, CORRECTIVE: 0, PREVENTIVE: 0, INSPECTION: 0, EMERGENCY: 0 })
    }
    for (const row of rows) {
      const point = volumeMap.get(monthKey(row.createdAt))
      if (point) {
        if (row.type === 'CORRECTIVE') point.CORRECTIVE += 1
        else if (row.type === 'PREVENTIVE') point.PREVENTIVE += 1
        else if (row.type === 'INSPECTION') point.INSPECTION += 1
        else if (row.type === 'EMERGENCY') point.EMERGENCY += 1
      }
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      assets,
      mtbfSeries,
      mttrSeries,
      volumeByType: [...volumeMap.values()],
    }
  }
}
