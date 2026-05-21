/**
 * Worker-local PM schedule repository.
 *
 * The full `PrismaPMScheduleRepository` lives in apps/api/ and cannot be
 * imported here (rootDir constraint, different compilation unit).
 *
 * This module provides a minimal read + update wrapper for the worker jobs:
 *   - `findDueForTrigger` โ€” SQL pre-filter + domain reconstitution
 *   - `update`            โ€” persist lastTriggered / nextDue after a trigger
 *
 * All mapping logic is self-contained (no import from apps/api).
 */
import type { PrismaClient } from '@prisma/client'
import { PMSchedule, PMScheduleId, CalendarRule, MeterRule, Task } from '@maintainhub/domain'
import type { PMScheduleRepository } from '@maintainhub/domain'

/** Max lookahead for the SQL pre-filter (same as api-side repository). */
const MAX_ADVANCE_DAYS = 30

// โ”€โ”€ Raw JSON shapes โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

interface StoredCalendarRule {
  frequency: string
  interval: number
  dayOfWeek?: number
  dayOfMonth?: number
  month?: number
  pmMeta?: { advanceNoticeDays?: number; defaultAssigneeIds?: string[] }
}

interface StoredMeterRule {
  meterField: string
  interval: number
  tolerance: number
  pmMeta?: { defaultAssigneeIds?: string[] }
}

interface StoredTask {
  sequence: number
  title: string
  instructions: string
  requiresPhoto: boolean
  requiresMeterReading: boolean
  meterReadingUnit?: string
  estimatedMinutes: number
  isCritical: boolean
}

// โ”€โ”€ Mapping helpers โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

function rowToSchedule(row: {
  id: string
  tenantId: string
  assetId: string
  triggerType: string
  title: string
  description: string | null
  calendarRule: unknown
  meterRule: unknown
  conditionRule: unknown
  taskList: unknown
  estimatedHours: unknown
  requiredSkills: string[]
  isActive: boolean
  lastTriggered: Date | null
  nextDue: Date | null
  createdById: string
  createdAt: Date
  updatedAt: Date
}): PMSchedule {
  const calRaw = row.calendarRule as StoredCalendarRule | null
  const metRaw = row.meterRule as StoredMeterRule | null

  const calendarRule =
    calRaw !== null
      ? new CalendarRule({
          frequency: calRaw.frequency as 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually',
          interval: calRaw.interval,
          dayOfWeek: calRaw.dayOfWeek,
          dayOfMonth: calRaw.dayOfMonth,
          month: calRaw.month,
        })
      : undefined

  const meterRule =
    metRaw !== null
      ? new MeterRule({
          meterField: metRaw.meterField,
          interval: metRaw.interval,
          tolerance: metRaw.tolerance,
        })
      : undefined

  const advanceNoticeDays = calRaw?.pmMeta?.advanceNoticeDays ?? 7
  const defaultAssigneeIds =
    calRaw?.pmMeta?.defaultAssigneeIds ?? metRaw?.pmMeta?.defaultAssigneeIds ?? []

  const rawTasks = Array.isArray(row.taskList) ? (row.taskList as StoredTask[]) : []
  const taskList = rawTasks.map(
    (t: StoredTask) =>
      new Task({
        sequence: t.sequence,
        title: t.title,
        instructions: t.instructions ?? '',
        requiresPhoto: t.requiresPhoto ?? false,
        requiresMeterReading: t.requiresMeterReading ?? false,
        meterReadingUnit: t.meterReadingUnit,
        estimatedMinutes: t.estimatedMinutes ?? 0,
        isCritical: t.isCritical ?? false,
      }),
  )

  return PMSchedule.reconstitute({
    id: new PMScheduleId(row.id),
    tenantId: row.tenantId,
    assetId: row.assetId,
    type: row.triggerType as 'CALENDAR' | 'METER' | 'CONDITION',
    title: row.title,
    description: row.description ?? '',
    calendarRule,
    meterRule,
    conditionRule: (row.conditionRule as Record<string, unknown> | null) ?? undefined,
    taskList,
    estimatedHours: row.estimatedHours ? Number(row.estimatedHours) : 0,
    requiredParts: [],
    requiredSkillIds: row.requiredSkills,
    defaultAssigneeIds,
    isActive: row.isActive,
    lastTriggeredAt: row.lastTriggered ?? undefined,
    nextDueAt: row.nextDue ?? undefined,
    advanceNoticeDays,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

// โ”€โ”€ Repository โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

export class WorkerPMScheduleRepository implements Pick<
  PMScheduleRepository,
  'findDueForTrigger' | 'update'
> {
  constructor(private readonly prisma: PrismaClient) {}

  async findDueForTrigger(now: Date, tenantId?: string): Promise<PMSchedule[]> {
    const cutoff = new Date(now.getTime() + MAX_ADVANCE_DAYS * 24 * 60 * 60 * 1000)

    const rows = await this.prisma.pMSchedule.findMany({
      where: {
        isActive: true,
        ...(tenantId !== undefined ? { tenantId } : { tenant: { isActive: true } }),
        OR: [{ nextDue: null }, { nextDue: { lte: cutoff } }],
      },
      orderBy: { nextDue: 'asc' },
    })

    return rows.map((r) => rowToSchedule(r))
  }

  async update(schedule: PMSchedule): Promise<void> {
    await this.prisma.pMSchedule.update({
      where: { id: schedule.id.value },
      data: {
        isActive: schedule.isActive,
        lastTriggered: schedule.lastTriggeredAt ?? null,
        nextDue: schedule.nextDueAt ?? null,
        updatedAt: schedule.updatedAt,
      },
    })
  }
}
