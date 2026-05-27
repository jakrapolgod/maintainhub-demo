/**
 * GetPMComplianceHandler
 *
 * Compliance = actual triggers / planned triggers ร— 100 over the last 12 months.
 *
 * ## Actual triggers
 * Counted from AuditLog rows where:
 *   action = 'CREATE_WORK_ORDER'
 *   after->pmScheduleId = scheduleId
 *   after->source IN ('pm-scheduler', 'manual')
 *
 * PostgreSQL JSON path: `after @> '{"pmScheduleId":"..."}'::jsonb`
 * Prisma supports this via the `path` filter on Json fields.
 *
 * ## Planned triggers
 * Calculated from the schedule's calendarRule frequency ร— interval:
 *   daily     โ’ 365 / interval
 *   weekly    โ’ 52  / interval
 *   monthly   โ’ 12  / interval
 *   quarterly โ’ 4   / interval
 *   annually  โ’ 1   / interval
 * For METER/CONDITION types, planned = 0 (not calendar-predictable).
 *
 * ## Breakdown
 * Groups by asset category and location using the asset's category/location at
 * query time.
 */
import type { PrismaClient } from '@prisma/client'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import type {
  QueryContext,
  PMComplianceResult,
  PMComplianceScheduleRow,
  PMComplianceCategoryBreakdown,
  PMComplianceLocationBreakdown,
} from './query.types.js'

// โ”€โ”€ Helpers โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

function plannedTriggersPerYear(
  triggerType: string,
  calendarRule: { frequency: string; interval: number } | null,
): number {
  if (triggerType !== 'CALENDAR' || calendarRule === null) return 0
  const { frequency, interval = 1 } = calendarRule
  if (!interval || Number.isNaN(interval) || interval <= 0) return 0
  switch (frequency) {
    case 'daily':
      return Math.round(365 / interval)
    case 'weekly':
      return Math.round(52 / interval)
    case 'monthly':
      return Math.round(12 / interval)
    case 'quarterly':
      return Math.round(4 / interval)
    case 'annually':
      return Math.round(1 / interval)
    default:
      return 0
  }
}

function compliancePct(actual: number, planned: number): number {
  if (planned === 0) return actual > 0 ? 100 : 0
  return Math.min(Math.round((actual / planned) * 100), 100)
}

// โ”€โ”€ Query โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

export interface GetPMComplianceQuery {
  /** Look-back window in months. @default 12 */
  lookbackMonths?: number
}

// โ”€โ”€ Raw JSON types โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

// calendarRule cast shape: { frequency: string; interval: number; pmMeta?: unknown }

// โ”€โ”€ Handler โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

export class GetPMComplianceHandler {
  constructor(
    private readonly db: TenantClient,
    private readonly prisma: PrismaClient,
  ) {}

  async handle(query: GetPMComplianceQuery, ctx: QueryContext): Promise<PMComplianceResult> {
    const lookbackMonths = query.lookbackMonths ?? 12
    const now = new Date()
    const periodStart = new Date(now)
    periodStart.setMonth(periodStart.getMonth() - lookbackMonths)

    // โ”€โ”€ 1. Load all PM schedules with their asset info โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
    const scheduleRows = await this.db.pMSchedule.findMany({
      select: {
        id: true,
        title: true,
        triggerType: true,
        calendarRule: true,
        lastTriggered: true,
        nextDue: true,
        assetId: true,
        asset: {
          select: {
            id: true,
            assetNumber: true,
            name: true,
            category: { select: { name: true } },
            location: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    if (scheduleRows.length === 0) {
      return {
        overallCompliancePct: 0,
        periodStart: periodStart.toISOString().slice(0, 10),
        periodEnd: now.toISOString().slice(0, 10),
        schedules: [],
        byCategory: [],
        byLocation: [],
        totalSchedules: 0,
        fullyCompliant: 0,
      }
    }

    // โ”€โ”€ 2. Count actual triggers from AuditLog โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
    const scheduleIds = scheduleRows.map((r) => r.id)

    // Fetch audit log rows for all PM-triggered WO creations in the period.
    // We filter by pmScheduleId in application code (JSON path filter is
    // PostgreSQL-specific and Prisma's cross-DB JSON path support is limited).
    const auditRows = await this.prisma.auditLog.findMany({
      where: {
        tenantId: ctx.tenantId,
        action: 'CREATE_WORK_ORDER',
        entityType: 'WorkOrder',
        createdAt: { gte: periodStart, lte: now },
      },
      select: { after: true },
    })

    // Build map of scheduleId โ’ actual trigger count
    const actualBySchedule = new Map<string, number>(scheduleIds.map((id) => [id, 0]))

    for (const row of auditRows) {
      const after = row.after as Record<string, unknown> | null
      if (after) {
        const pmId = after.pmScheduleId as string | undefined
        const src = after.source as string | undefined
        if (pmId && actualBySchedule.has(pmId) && (src === 'pm-scheduler' || src === 'manual')) {
          actualBySchedule.set(pmId, (actualBySchedule.get(pmId) ?? 0) + 1)
        }
      }
    }

    // โ”€โ”€ 3. Build per-schedule rows โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
    let totalPlanned = 0
    let totalActual = 0

    const schedules: PMComplianceScheduleRow[] = scheduleRows.map((r) => {
      const calRule = r.calendarRule as {
        frequency: string
        interval: number
        pmMeta?: unknown
      } | null
      const planned = plannedTriggersPerYear(r.triggerType, calRule)
      const actual = actualBySchedule.get(r.id) ?? 0
      const pct = compliancePct(actual, planned)

      totalPlanned += planned
      totalActual += actual

      return {
        scheduleId: r.id,
        title: r.title,
        assetId: r.assetId,
        assetName: r.asset.name,
        assetNumber: r.asset.assetNumber,
        categoryName: r.asset.category.name,
        locationName: r.asset.location?.name ?? null,
        type: r.triggerType,
        plannedTriggers: planned,
        actualTriggers: actual,
        compliancePct: pct,
        lastTriggeredAt: r.lastTriggered?.toISOString() ?? null,
        nextDueAt: r.nextDue?.toISOString() ?? null,
      }
    })

    // โ”€โ”€ 4. Group by category and location โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
    const categoryMap = new Map<string, { planned: number; actual: number }>()
    const locationMap = new Map<string, { planned: number; actual: number }>()

    for (const s of schedules) {
      const cat = categoryMap.get(s.categoryName) ?? { planned: 0, actual: 0 }
      cat.planned += s.plannedTriggers
      cat.actual += s.actualTriggers
      categoryMap.set(s.categoryName, cat)

      const loc = s.locationName ?? 'Unassigned'
      const locEntry = locationMap.get(loc) ?? { planned: 0, actual: 0 }
      locEntry.planned += s.plannedTriggers
      locEntry.actual += s.actualTriggers
      locationMap.set(loc, locEntry)
    }

    const byCategory: PMComplianceCategoryBreakdown[] = [...categoryMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([categoryName, { planned, actual }]) => ({
        categoryName,
        plannedTriggers: planned,
        actualTriggers: actual,
        compliancePct: compliancePct(actual, planned),
      }))

    const byLocation: PMComplianceLocationBreakdown[] = [...locationMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([locationName, { planned, actual }]) => ({
        locationName,
        plannedTriggers: planned,
        actualTriggers: actual,
        compliancePct: compliancePct(actual, planned),
      }))

    const fullyCompliant = schedules.filter((s) => s.compliancePct >= 100).length
    const overallCompliancePct = compliancePct(totalActual, totalPlanned)

    return {
      overallCompliancePct,
      periodStart: periodStart.toISOString().slice(0, 10),
      periodEnd: now.toISOString().slice(0, 10),
      schedules,
      byCategory,
      byLocation,
      totalSchedules: schedules.length,
      fullyCompliant,
    }
  }
}
