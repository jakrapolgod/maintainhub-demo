/**
 * GetPMCostHandler
 *
 * Returns estimated vs actual cost for PM work orders, broken down by schedule
 * and by month.
 *
 * ## Estimated cost
 * Computed as: `estimatedHours × avgLaborRatePerHour` where the rate is
 * configurable (default: 500 THB/h, the platform base rate).
 *
 * ## Actual cost
 * Summed from `WorkOrder.totalLaborCost + WorkOrder.totalPartsCost` for
 * PREVENTIVE WOs created by PM schedules (identified via AuditLog).
 */
import type { PrismaClient } from '@prisma/client'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import type { QueryContext, PMCostResult, PMCostPeriod, PMCostScheduleRow } from './query.types.js'

/** Default hourly labor rate (THB) used when not configured per-tenant. */
const DEFAULT_LABOR_RATE = 500

// ── Query ─────────────────────────────────────────────────────────────────────

export interface GetPMCostQuery {
  /** Start of period (inclusive). */
  from?: Date
  /** End of period (inclusive). @default today */
  to?: Date
  /** Override labor rate (THB/hour). @default 500 */
  laborRatePerHour?: number
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class GetPMCostHandler {
  constructor(
    private readonly db: TenantClient,
    private readonly prisma: PrismaClient,
  ) {}

  async handle(query: GetPMCostQuery, ctx: QueryContext): Promise<PMCostResult> {
    const now = new Date()
    const to = query.to ?? now
    const from = query.from ?? new Date(now.getFullYear(), now.getMonth() - 11, 1)
    const laborRate = query.laborRatePerHour ?? DEFAULT_LABOR_RATE

    // ── 1. Load all PM schedules (for estimated cost) ─────────────────────────
    const scheduleRows = await this.db.pMSchedule.findMany({
      select: {
        id: true,
        title: true,
        estimatedHours: true,
        assetId: true,
        asset: { select: { id: true, assetNumber: true, name: true } },
      },
      orderBy: { title: 'asc' },
    })

    const scheduleIds = scheduleRows.map((r) => r.id)

    // ── 2. Find PM-created WOs via AuditLog ───────────────────────────────────
    const auditRows = await this.prisma.auditLog.findMany({
      where: {
        tenantId: ctx.tenantId,
        action: 'CREATE_WORK_ORDER',
        entityType: 'WorkOrder',
        createdAt: { gte: from, lte: to },
      },
      select: { entityId: true, after: true, createdAt: true },
    })

    // Map woId → { pmScheduleId, createdAt }
    const woToSchedule = new Map<string, { pmScheduleId: string; createdAt: Date }>()
    for (const row of auditRows) {
      const after = row.after as Record<string, unknown> | null
      if (after) {
        const pmId = after.pmScheduleId as string | undefined
        const src = after.source as string | undefined
        if (pmId && scheduleIds.includes(pmId) && (src === 'pm-scheduler' || src === 'manual')) {
          woToSchedule.set(row.entityId, { pmScheduleId: pmId, createdAt: row.createdAt })
        }
      }
    }

    // ── 3. Load actual WO costs for those WO IDs ──────────────────────────────
    const pmWOIds = [...woToSchedule.keys()]
    let woRows: Array<{
      id: string
      totalLaborCost: unknown
      totalPartsCost: unknown
      completedAt: Date | null
      createdAt: Date
    }> = []

    if (pmWOIds.length > 0) {
      woRows = await this.prisma.workOrder.findMany({
        where: { id: { in: pmWOIds }, tenantId: ctx.tenantId, deletedAt: null },
        select: {
          id: true,
          totalLaborCost: true,
          totalPartsCost: true,
          completedAt: true,
          createdAt: true,
        },
      })
    }

    // Build map: woId → { labor, parts }
    const woCostById = new Map(
      woRows
        .map((w) => ({
          ...w,
          labor: Number(w.totalLaborCost ?? 0),
          parts: Number(w.totalPartsCost ?? 0),
        }))
        .map((w) => [w.id, w]),
    )

    // ── 4. Aggregate by schedule ──────────────────────────────────────────────
    const scheduleAgg = new Map<string, { labor: number; parts: number; count: number }>()
    for (const scheduleId of scheduleIds) {
      scheduleAgg.set(scheduleId, { labor: 0, parts: 0, count: 0 })
    }

    for (const [woId, { pmScheduleId }] of woToSchedule) {
      const cost = woCostById.get(woId)
      const agg = scheduleAgg.get(pmScheduleId)
      if (cost && agg) {
        agg.labor += cost.labor
        agg.parts += cost.parts
        agg.count += 1
      }
    }

    // ── 5. Aggregate by month ─────────────────────────────────────────────────
    const monthMap = new Map<
      string,
      { estCost: number; labor: number; parts: number; count: number }
    >()

    // Seed month map with all months in the range
    const monthCursor = new Date(from.getFullYear(), from.getMonth(), 1)
    while (monthCursor <= to) {
      const key = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, '0')}`
      monthMap.set(key, { estCost: 0, labor: 0, parts: 0, count: 0 })
      monthCursor.setMonth(monthCursor.getMonth() + 1)
    }

    for (const [woId, { pmScheduleId, createdAt }] of woToSchedule) {
      const cost = woCostById.get(woId)
      const sched = scheduleRows.find((s) => s.id === pmScheduleId)
      if (cost && sched) {
        const monthKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`
        const entry = monthMap.get(monthKey)
        if (entry) {
          entry.estCost += (sched.estimatedHours ? Number(sched.estimatedHours) : 0) * laborRate
          entry.labor += cost.labor
          entry.parts += cost.parts
          entry.count += 1
        }
      }
    }

    const byMonth: PMCostPeriod[] = [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { estCost, labor, parts, count }]) => ({
        month,
        estimatedCost: Math.round(estCost),
        actualLaborCost: Math.round(labor),
        actualPartsCost: Math.round(parts),
        actualTotalCost: Math.round(labor + parts),
        woCount: count,
      }))

    // ── 6. Build per-schedule rows ────────────────────────────────────────────
    let totalEstimated = 0
    let totalActual = 0

    const bySchedule: PMCostScheduleRow[] = scheduleRows.map((s) => {
      const agg = scheduleAgg.get(s.id) ?? { labor: 0, parts: 0, count: 0 }
      const estimatedTotal =
        (s.estimatedHours ? Number(s.estimatedHours) : 0) * laborRate * Math.max(agg.count, 1)
      const actualTotal = agg.labor + agg.parts
      const variance = actualTotal - estimatedTotal

      totalEstimated += estimatedTotal
      totalActual += actualTotal

      return {
        scheduleId: s.id,
        title: s.title,
        assetId: s.assetId,
        assetName: s.asset.name,
        estimatedHours: s.estimatedHours ? Number(s.estimatedHours) : 0,
        estimatedCostTotal: Math.round(estimatedTotal),
        actualLaborCostTotal: Math.round(agg.labor),
        actualPartsCostTotal: Math.round(agg.parts),
        actualTotalCost: Math.round(actualTotal),
        variance: Math.round(variance),
        woCount: agg.count,
      }
    })

    return {
      periodStart: from.toISOString().slice(0, 10),
      periodEnd: to.toISOString().slice(0, 10),
      totalEstimatedCost: Math.round(totalEstimated),
      totalActualCost: Math.round(totalActual),
      totalVariance: Math.round(totalActual - totalEstimated),
      byMonth,
      bySchedule,
    }
  }
}
