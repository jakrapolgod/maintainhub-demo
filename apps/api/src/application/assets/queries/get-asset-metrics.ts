/**
 * GetAssetMetricsHandler — reliability KPIs + monthly MTTR trend.
 *
 * Data source: all CORRECTIVE work orders for the asset in the last 12 months.
 *
 * Calculations are delegated to `AssetMetricsService` (pure domain service —
 * no side effects, no DB calls).
 *
 * Monthly trend:
 *   Groups completed CORRECTIVE WOs by calendar month (YYYY-MM).
 *   For each month computes MTTR = average(completedAt − startedAt).
 *   Returns 12 data points (months with no repairs have mttrHours = 0).
 */
import type { PrismaClient } from '@prisma/client'
import {
  WorkOrder,
  WorkOrderId,
  WorkOrderStatus,
  Priority,
  AssetMetricsService,
} from '@maintainhub/domain'
import type { WorkOrderProps } from '@maintainhub/domain'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { DomainException } from '../../../errors/domain.exception.js'
import type { QueryContext, AssetMetricsDetail, MonthlyMttrPoint } from './query.types.js'

// ── Query ─────────────────────────────────────────────────────────────────────

export interface GetAssetMetricsQuery {
  assetId: string
  /** Override "today" — useful in tests. @default new Date() */
  asOf?: Date
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class GetAssetMetricsHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  constructor(db: TenantClient, prisma: PrismaClient) {
    this.db = db
    this.prisma = prisma
  }

  /**
   * @throws DomainException NOT_FOUND when the asset does not exist
   */
  async handle(query: GetAssetMetricsQuery, ctx: QueryContext): Promise<AssetMetricsDetail> {
    // ── 1. Verify asset exists ─────────────────────────────────────────────────
    const asset = await this.db.asset.findFirst({
      where: { id: query.assetId, deletedAt: null },
      select: { id: true, assetNumber: true, name: true, tenantId: true },
    })
    if (!asset) {
      throw new DomainException('Asset not found', 'NOT_FOUND', 404)
    }

    // ── 2. Define 12-month window ──────────────────────────────────────────────
    const now = query.asOf ?? new Date()
    const periodEnd = now
    const periodStart = new Date(now)
    periodStart.setFullYear(periodStart.getFullYear() - 1)

    // ── 3. Fetch completed CORRECTIVE WOs in the window ────────────────────────
    const [woRows, costAgg] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: {
          assetId: query.assetId,
          tenantId: ctx.tenantId,
          type: 'CORRECTIVE',
          status: 'COMPLETED',
          deletedAt: null,
          completedAt: { gte: periodStart, lte: periodEnd },
        },
        orderBy: { completedAt: 'asc' },
        select: {
          id: true,
          tenantId: true,
          woNumber: true,
          type: true,
          status: true,
          assetId: true,
          createdById: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),

      this.prisma.workOrder.aggregate({
        where: { assetId: query.assetId, tenantId: ctx.tenantId, deletedAt: null },
        // eslint-disable-next-line no-underscore-dangle
        _sum: { totalLaborCost: true, totalPartsCost: true },
      }),
    ])

    // ── 4. Reconstitute domain WorkOrder aggregates ────────────────────────────
    const domainWOs: WorkOrder[] = woRows.map((r) =>
      WorkOrder.reconstitute({
        id: new WorkOrderId(r.id),
        tenantId: r.tenantId,
        woNumber: r.woNumber,
        title: '',
        type: r.type as 'CORRECTIVE',
        priority: Priority.from('MEDIUM'),
        status: WorkOrderStatus.COMPLETED,
        assetId: r.assetId,
        createdById: r.createdById,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        ...(r.startedAt !== null && { startedAt: r.startedAt }),
        ...(r.completedAt !== null && { completedAt: r.completedAt }),
      } satisfies WorkOrderProps),
    )

    // ── 5. Compute top-level KPIs ──────────────────────────────────────────────
    const mtbf = AssetMetricsService.calculateMTBF(domainWOs)
    const mttr = AssetMetricsService.calculateMTTR(domainWOs)
    const availability = AssetMetricsService.calculateAvailability(0, mtbf, mttr)

    // eslint-disable-next-line no-underscore-dangle
    const sums = costAgg._sum
    const totalLaborCost = sums.totalLaborCost !== null ? Number(sums.totalLaborCost) : 0
    const totalPartsCost = sums.totalPartsCost !== null ? Number(sums.totalPartsCost) : 0

    // ── 6. Build monthly MTTR trend (last 12 calendar months) ─────────────────
    const mttrTrend = GetAssetMetricsHandler.buildMonthlyTrend(domainWOs, periodStart)

    return {
      assetId: query.assetId,
      assetNumber: asset.assetNumber,
      name: asset.name,
      mtbfHours: mtbf.hours,
      mtbfDays: mtbf.days,
      mttrHours: mttr.hours,
      mttrDays: mttr.days,
      availability,
      failureCount: domainWOs.length,
      mttrTrend,
      totalLaborCost,
      totalPartsCost,
      totalLifetimeCost: Math.round((totalLaborCost + totalPartsCost) * 100) / 100,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    }
  }

  // ── Private: monthly MTTR trend ───────────────────────────────────────────

  /**
   * Returns 12 monthly data points (oldest → newest).
   * Months with no repairs have `mttrHours = 0, repairCount = 0`.
   */
  private static buildMonthlyTrend(wos: WorkOrder[], periodStart: Date): MonthlyMttrPoint[] {
    // Build month labels: [periodStart month, ..., +11 months]
    const months: string[] = []
    const d = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1)
    for (let i = 0; i < 12; i += 1) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      months.push(`${y}-${m}`)
      d.setMonth(d.getMonth() + 1)
    }

    // Group WOs by month key
    type MonthBucket = { totalMs: number; count: number }
    const buckets = new Map<string, MonthBucket>()

    for (const wo of wos) {
      if (wo.completedAt === undefined || wo.startedAt === undefined) continue // eslint-disable-line no-continue
      const key = GetAssetMetricsHandler.monthKey(wo.completedAt)
      const existing = buckets.get(key) ?? { totalMs: 0, count: 0 }
      existing.totalMs += wo.completedAt.getTime() - wo.startedAt.getTime()
      existing.count += 1
      buckets.set(key, existing)
    }

    return months.map((month) => {
      const bucket = buckets.get(month)
      if (!bucket || bucket.count === 0) {
        return { month, mttrHours: 0, repairCount: 0 }
      }
      const avgMs = bucket.totalMs / bucket.count
      const mttrHours = Math.round((avgMs / 3_600_000) * 100) / 100
      return { month, mttrHours, repairCount: bucket.count }
    })
  }

  private static monthKey(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  }
}
