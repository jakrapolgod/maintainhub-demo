import type { PrismaClient } from '@prisma/client'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import type {
  QueryContext,
  PMScheduleDto,
  ListPMSchedulesResult,
  CalendarRuleDto,
  MeterRuleDto,
} from './query.types.js'

// โ”€โ”€ Query โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

export interface ListPMSchedulesQuery {
  assetId?: string
  isActive?: boolean
  triggerType?: 'CALENDAR' | 'METER' | 'CONDITION'
  nextDueBefore?: Date
  nextDueAfter?: Date
  /** Cursor-based pagination โ€” pass the last item's `id`. */
  cursor?: string
  limit?: number
}

// โ”€โ”€ Raw JSON shapes (from DB) โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

interface RawCalendarRule {
  frequency: string
  interval: number
  dayOfWeek?: number
  dayOfMonth?: number
  month?: number
  pmMeta?: { advanceNoticeDays?: number; defaultAssigneeIds?: string[] }
}
interface RawMeterRule {
  meterField: string
  interval: number
  tolerance: number
  pmMeta?: { defaultAssigneeIds?: string[] }
}

// โ”€โ”€ Handler โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

export class ListPMSchedulesHandler {
  constructor(
    private readonly db: TenantClient,
    private readonly prisma: PrismaClient,
  ) {}

  async handle(query: ListPMSchedulesQuery, ctx: QueryContext): Promise<ListPMSchedulesResult> {
    const limit = Math.min(query.limit ?? 50, 200)
    const now = new Date()

    // โ”€โ”€ 1. Fetch rows (one extra for next-cursor detection) โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
    const rows = await this.db.pMSchedule.findMany({
      where: {
        ...(query.assetId !== undefined && { assetId: query.assetId }),
        ...(query.isActive !== undefined && { isActive: query.isActive }),
        ...(query.triggerType !== undefined && { triggerType: query.triggerType }),
        ...(query.nextDueBefore !== undefined && { nextDue: { lte: query.nextDueBefore } }),
        ...(query.nextDueAfter !== undefined && { nextDue: { gte: query.nextDueAfter } }),
      },
      include: {
        asset: { select: { id: true, assetNumber: true, name: true } },
      },
      orderBy: [{ nextDue: 'asc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(query.cursor !== undefined && { cursor: { id: query.cursor }, skip: 1 }),
    })

    // โ”€โ”€ 2. Count total matching rows (without cursor/limit) โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
    const total = await this.prisma.pMSchedule.count({
      where: {
        tenantId: ctx.tenantId,
        ...(query.assetId !== undefined && { assetId: query.assetId }),
        ...(query.isActive !== undefined && { isActive: query.isActive }),
        ...(query.triggerType !== undefined && { triggerType: query.triggerType }),
        ...(query.nextDueBefore !== undefined && { nextDue: { lte: query.nextDueBefore } }),
        ...(query.nextDueAfter !== undefined && { nextDue: { gte: query.nextDueAfter } }),
      },
    })

    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore ? (pageRows.at(-1)?.id ?? null) : null

    // โ”€โ”€ 3. Map to DTOs โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
    const items: PMScheduleDto[] = pageRows.map((r) => {
      const calRaw = r.calendarRule as RawCalendarRule | null
      const metRaw = r.meterRule as RawMeterRule | null

      const calendarRule: CalendarRuleDto | null =
        calRaw !== null
          ? {
              frequency: calRaw.frequency,
              interval: calRaw.interval,
              dayOfWeek: calRaw.dayOfWeek ?? null,
              dayOfMonth: calRaw.dayOfMonth ?? null,
              month: calRaw.month ?? null,
            }
          : null

      const meterRule: MeterRuleDto | null =
        metRaw !== null
          ? {
              meterField: metRaw.meterField,
              interval: metRaw.interval,
              tolerance: metRaw.tolerance,
            }
          : null

      const advanceNoticeDays = calRaw?.pmMeta?.advanceNoticeDays ?? 7
      const defaultAssigneeIds = (calRaw?.pmMeta?.defaultAssigneeIds ??
        metRaw?.pmMeta?.defaultAssigneeIds ??
        []) as string[]

      const tasks = Array.isArray(r.taskList) ? r.taskList : []

      return {
        id: r.id,
        tenantId: r.tenantId,
        assetId: r.assetId,
        assetName: r.asset.name,
        assetNumber: r.asset.assetNumber,
        title: r.title,
        description: r.description ?? '',
        type: r.triggerType,
        isActive: r.isActive,
        calendarRule,
        meterRule,
        taskCount: tasks.length,
        estimatedHours: r.estimatedHours ? Number(r.estimatedHours) : 0,
        requiredSkillIds: r.requiredSkills,
        defaultAssigneeIds,
        advanceNoticeDays,
        lastTriggeredAt: r.lastTriggered?.toISOString() ?? null,
        nextDueAt: r.nextDue?.toISOString() ?? null,
        isOverdue: r.nextDue !== null && r.nextDue < now && r.isActive,
        createdById: r.createdById,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }
    })

    return { items, total, nextCursor }
  }
}
