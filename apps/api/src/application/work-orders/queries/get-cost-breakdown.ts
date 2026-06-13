/**
 * GetCostBreakdownHandler — maintenance cost analysis for completed WOs.
 *
 * ## Cost mix
 *   parts       — Σ WorkOrder.totalPartsCost
 *   contractor  — Σ LaborEntry.totalCost where the technician role is CONTRACTOR
 *   labor       — Σ WorkOrder.totalLaborCost − contractor (in-house labor)
 *
 * ## Monthly by category
 * Each completed WO's full cost (labor + parts) is attributed to the month of
 * `completedAt` and the ISO 14224 category of its failure code
 * ('Uncategorised' when no failure code is set).
 */
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import type { QueryContext, CostBreakdownResult, MonthlyCostByCategory } from './query.types.js'

// ── Query ─────────────────────────────────────────────────────────────────────

export interface GetCostBreakdownQuery {
  /** Start of period (inclusive). @default 12 months before `to` */
  from?: Date
  /** End of period (inclusive). @default now */
  to?: Date
}

// ── Constants ─────────────────────────────────────────────────────────────────

const UNCATEGORISED = 'Uncategorised'

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function monthKey(d: Date): string {
  return `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class GetCostBreakdownHandler {
  private readonly db: TenantClient

  constructor(db: TenantClient) {
    this.db = db
  }

  async handle(query: GetCostBreakdownQuery, _ctx: QueryContext): Promise<CostBreakdownResult> {
    const to = query.to ?? new Date()
    const from = query.from ?? new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1))

    const rows = await this.db.workOrder.findMany({
      where: {
        deletedAt: null,
        status: 'COMPLETED',
        completedAt: { gte: from, lte: to },
      },
      select: {
        completedAt: true,
        totalLaborCost: true,
        totalPartsCost: true,
        failureCode: { select: { category: true } },
        laborEntries: {
          select: { totalCost: true, technician: { select: { role: true } } },
        },
      },
    })

    let laborTotal = 0
    let partsTotal = 0
    let contractorTotal = 0
    const byMonth = new Map<string, Record<string, number>>()

    for (const row of rows) {
      const labor = row.totalLaborCost !== null ? Number(row.totalLaborCost) : 0
      const parts = row.totalPartsCost !== null ? Number(row.totalPartsCost) : 0

      const contractor = row.laborEntries.reduce(
        (sum, e) => (e.technician.role === 'CONTRACTOR' ? sum + Number(e.totalCost) : sum),
        0,
      )

      laborTotal += Math.max(0, labor - contractor)
      contractorTotal += contractor
      partsTotal += parts

      if (row.completedAt !== null) {
        const month = monthKey(row.completedAt)
        const category = row.failureCode?.category ?? UNCATEGORISED
        let categories = byMonth.get(month)
        if (!categories) {
          categories = {}
          byMonth.set(month, categories)
        }
        categories[category] = (categories[category] ?? 0) + labor + parts
      }
    }

    const monthlyByCategory: MonthlyCostByCategory[] = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, categories]) => ({
        month,
        categories: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, round2(v)])),
      }))

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      costMix: {
        labor: round2(laborTotal),
        parts: round2(partsTotal),
        contractor: round2(contractorTotal),
      },
      monthlyByCategory,
      totalCost: round2(laborTotal + partsTotal + contractorTotal),
    }
  }
}
