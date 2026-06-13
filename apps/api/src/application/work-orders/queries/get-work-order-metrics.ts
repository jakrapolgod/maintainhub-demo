/**
 * GetWorkOrderMetricsHandler — aggregated dashboard metrics.
 *
 * Returns for the tenant:
 *   - Count of WOs by status
 *   - Count of WOs by priority
 *   - Overdue count (slaDeadline < now AND status NOT IN terminal)
 *   - Average completion time in hours (completed WOs only)
 *   - Total cost (laborCost + partsCost) for WOs completed this calendar month
 *
 * All queries run in parallel for minimal latency.
 * Results are NOT cached — metrics should reflect real-time state.
 */
import type { PrismaClient } from '@prisma/client'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import type { QueryContext, WorkOrderMetrics } from './query.types.js'

// ── Query ─────────────────────────────────────────────────────────────────────

export interface GetWorkOrderMetricsQuery {
  /** Optional date ceiling for "completed this month" — defaults to now(). */
  asOf?: Date
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED'] as const

// ── Handler ───────────────────────────────────────────────────────────────────

export class GetWorkOrderMetricsHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  constructor(db: TenantClient, prisma: PrismaClient) {
    this.db = db
    this.prisma = prisma
  }

  async handle(query: GetWorkOrderMetricsQuery, ctx: QueryContext): Promise<WorkOrderMetrics> {
    const now = query.asOf ?? new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    // ── Run all aggregations in parallel ─────────────────────────────────────
    const [byStatusRows, byPriorityRows, overdueCount, completedRows, costRows] = await Promise.all(
      [
        // Count by status
        this.db.workOrder.groupBy({
          by: ['status'],
          where: { deletedAt: null },
          _count: { _all: true },
        }),

        // Count by priority
        this.db.workOrder.groupBy({
          by: ['priority'],
          where: { deletedAt: null },
          _count: { _all: true },
        }),

        // Overdue: slaDeadline has passed and WO is not terminal
        this.db.workOrder.count({
          where: {
            deletedAt: null,
            slaDeadline: { lt: now },
            status: { notIn: [...TERMINAL_STATUSES] },
          },
        }),

        // Completed WOs — for avg completion time
        this.prisma.workOrder.findMany({
          where: {
            tenantId: ctx.tenantId,
            status: 'COMPLETED',
            completedAt: { not: null },
            deletedAt: null,
          },
          select: { createdAt: true, completedAt: true },
        }),

        // Cost this month — WOs completed in [monthStart, now]
        this.prisma.workOrder.findMany({
          where: {
            tenantId: ctx.tenantId,
            status: 'COMPLETED',
            completedAt: { gte: monthStart, lte: now },
            deletedAt: null,
          },
          select: { totalLaborCost: true, totalPartsCost: true },
        }),
      ],
    )

    // ── Project by-status ─────────────────────────────────────────────────────
    const byStatus: Record<string, number> = {}
    for (const row of byStatusRows) {
      // eslint-disable-next-line no-underscore-dangle
      byStatus[row.status] = row._count._all
    }

    // ── Project by-priority ───────────────────────────────────────────────────
    const byPriority: Record<string, number> = {}
    for (const row of byPriorityRows) {
      // eslint-disable-next-line no-underscore-dangle
      byPriority[row.priority] = row._count._all
    }

    // ── Average completion time ───────────────────────────────────────────────
    let avgCompletionHours: number | null = null
    if (completedRows.length > 0) {
      const totalHours = completedRows.reduce((sum, r) => {
        if (!r.completedAt) return sum
        // Clamp to 0 — dirty data can have completedAt before createdAt
        return sum + Math.max(0, (r.completedAt.getTime() - r.createdAt.getTime()) / 3_600_000)
      }, 0)
      avgCompletionHours = Math.round((totalHours / completedRows.length) * 100) / 100
    }

    // ── Total cost this month ─────────────────────────────────────────────────
    const totalCostThisMonth = costRows.reduce((sum, r) => {
      const labor = r.totalLaborCost !== null ? Number(r.totalLaborCost) : 0
      const parts = r.totalPartsCost !== null ? Number(r.totalPartsCost) : 0
      return sum + labor + parts
    }, 0)

    return {
      byStatus,
      byPriority,
      overdueCount,
      avgCompletionHours,
      totalCostThisMonth: Math.round(totalCostThisMonth * 100) / 100,
    }
  }
}
