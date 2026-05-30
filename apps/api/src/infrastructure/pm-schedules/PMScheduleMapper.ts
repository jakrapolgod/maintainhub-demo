/**
 * PMScheduleMapper โ€” bidirectional translation between Prisma's flat JSON
 * persistence model and the domain's `PMSchedule` aggregate.
 *
 * ## Schema โ” Domain mapping notes
 *
 * | Prisma column    | Domain property       | Notes                                 |
 * |------------------|-----------------------|---------------------------------------|
 * | triggerType      | type                  | Enum name differs                     |
 * | lastTriggered    | lastTriggeredAt       | Column name differs                   |
 * | nextDue          | nextDueAt             | Column name differs                   |
 * | requiredSkills   | requiredSkillIds      | Column name differs                   |
 * | calendarRule     | calendarRule + extras | advanceNoticeDays & defaultAssigneeIds|
 * |                  |                       | embedded in the JSON blob             |
 * | meterRule        | meterRule + extras    | defaultAssigneeIds in the JSON blob   |
 * | taskList         | taskList              | Array of TaskProps                    |
 *
 * ### Schema extras embedding
 * The schema has no dedicated columns for `advanceNoticeDays` or
 * `defaultAssigneeIds`.  These are embedded in the calendarRule / meterRule
 * JSON blob under `pmMeta` so the CalendarRule / MeterRule value objects stay
 * pure (they only see their own fields on construction).
 *
 * ### requiredParts
 * Not stored in the current schema โ€” always hydrated as an empty array.
 * TODO: add `requiredParts Json @default("[]")` column and backfill.
 */
import type { Prisma, TriggerType } from '@prisma/client'
import { PMSchedule, PMScheduleId, CalendarRule, MeterRule, Task } from '@maintainhub/domain'
import type { PMScheduleProps, PMType, TaskProps } from '@maintainhub/domain'

// โ”€โ”€ Prisma row shape โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

export type PrismaPMScheduleRow = Prisma.PMScheduleGetPayload<Record<string, never>>

// โ”€โ”€ Internal JSON shapes stored in the DB โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

interface StoredCalendarRule {
  frequency: string
  interval: number
  dayOfWeek?: number
  dayOfMonth?: number
  month?: number
  // Meta extras (not part of the CalendarRule value object)
  pmMeta?: {
    advanceNoticeDays?: number
    defaultAssigneeIds?: string[]
  }
}

interface StoredMeterRule {
  meterField: string
  interval: number
  tolerance: number
  // Meta extras
  pmMeta?: {
    defaultAssigneeIds?: string[]
  }
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

// โ”€โ”€ Mapper โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

export class PMScheduleMapper {
  // โ”€โ”€ Prisma โ’ Domain โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

  static toDomain(row: PrismaPMScheduleRow): PMSchedule {
    const calRaw = row.calendarRule as StoredCalendarRule | null
    const metRaw = row.meterRule as StoredMeterRule | null

    const calendarRule: CalendarRule | undefined =
      calRaw !== null
        ? new CalendarRule({
            frequency: calRaw.frequency as
              | 'daily'
              | 'weekly'
              | 'monthly'
              | 'quarterly'
              | 'annually',
            interval: calRaw.interval ?? 1,
            dayOfWeek: calRaw.dayOfWeek,
            dayOfMonth: calRaw.dayOfMonth,
            month: calRaw.month,
          })
        : undefined

    const meterRule: MeterRule | undefined =
      metRaw !== null
        ? new MeterRule({
            meterField: metRaw.meterField,
            interval: metRaw.interval,
            tolerance: metRaw.tolerance,
          })
        : undefined

    // Extract meta extras from JSON blobs
    const advanceNoticeDays = calRaw?.pmMeta?.advanceNoticeDays ?? 7
    const defaultAssigneeIds =
      calRaw?.pmMeta?.defaultAssigneeIds ?? metRaw?.pmMeta?.defaultAssigneeIds ?? []

    const taskList: Task[] = PMScheduleMapper.parseTasks(row.taskList as StoredTask[] | null)

    const props: PMScheduleProps = {
      id: new PMScheduleId(row.id),
      tenantId: row.tenantId,
      assetId: row.assetId,
      type: row.triggerType as PMType,
      title: row.title,
      description: row.description ?? '',
      calendarRule,
      meterRule,
      conditionRule: (row.conditionRule as Record<string, unknown> | null) ?? undefined,
      taskList,
      estimatedHours: row.estimatedHours ? Number(row.estimatedHours) : 0,
      requiredParts: [], // schema debt โ€” no column yet
      requiredSkillIds: row.requiredSkills,
      defaultAssigneeIds,
      isActive: row.isActive,
      lastTriggeredAt: row.lastTriggered ?? undefined,
      nextDueAt: row.nextDue ?? undefined,
      advanceNoticeDays,
      createdById: row.createdById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }

    return PMSchedule.reconstitute(props)
  }

  // โ”€โ”€ Domain โ’ Prisma create โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

  static toCreateInput(schedule: PMSchedule): Prisma.PMScheduleUncheckedCreateInput {
    return {
      id: schedule.id.value,
      tenantId: schedule.tenantId,
      assetId: schedule.assetId,
      title: schedule.title,
      triggerType: schedule.type as TriggerType,
      isActive: schedule.isActive,
      requiredSkills: [...schedule.requiredSkillIds],
      taskList: PMScheduleMapper.serializeTasks(schedule) as unknown as Prisma.InputJsonValue,
      createdById: schedule.createdById,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
      ...(schedule.description !== '' && { description: schedule.description }),
      ...(schedule.estimatedHours > 0 && { estimatedHours: schedule.estimatedHours }),
      ...(schedule.calendarRule !== undefined && {
        calendarRule: PMScheduleMapper.serializeCalendarRule(
          schedule,
        ) as unknown as Prisma.InputJsonValue,
      }),
      ...(schedule.meterRule !== undefined && {
        meterRule: PMScheduleMapper.serializeMeterRule(
          schedule,
        ) as unknown as Prisma.InputJsonValue,
      }),
      ...(schedule.conditionRule !== undefined && {
        conditionRule: schedule.conditionRule as Prisma.InputJsonValue,
      }),
      ...(schedule.lastTriggeredAt !== undefined && { lastTriggered: schedule.lastTriggeredAt }),
      ...(schedule.nextDueAt !== undefined && { nextDue: schedule.nextDueAt }),
    }
  }

  // โ”€โ”€ Domain โ’ Prisma update (mutable fields only) โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

  static toUpdateInput(schedule: PMSchedule): Prisma.PMScheduleUncheckedUpdateInput {
    return {
      title: schedule.title,
      isActive: schedule.isActive,
      requiredSkills: [...schedule.requiredSkillIds],
      taskList: PMScheduleMapper.serializeTasks(schedule) as unknown as Prisma.InputJsonValue,
      updatedAt: schedule.updatedAt,
      description: schedule.description !== '' ? schedule.description : null,
      estimatedHours: schedule.estimatedHours > 0 ? schedule.estimatedHours : null,
      lastTriggered: schedule.lastTriggeredAt ?? null,
      nextDue: schedule.nextDueAt ?? null,
      ...(schedule.calendarRule !== undefined && {
        calendarRule: PMScheduleMapper.serializeCalendarRule(
          schedule,
        ) as unknown as Prisma.InputJsonValue,
      }),
      ...(schedule.meterRule !== undefined && {
        meterRule: PMScheduleMapper.serializeMeterRule(
          schedule,
        ) as unknown as Prisma.InputJsonValue,
      }),
    }
  }

  // โ”€โ”€ Private helpers โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

  private static serializeCalendarRule(schedule: PMSchedule): StoredCalendarRule {
    const r = schedule.calendarRule!
    return {
      frequency: r.frequency,
      interval: r.interval,
      ...(r.dayOfWeek !== undefined && { dayOfWeek: r.dayOfWeek }),
      ...(r.dayOfMonth !== undefined && { dayOfMonth: r.dayOfMonth }),
      ...(r.month !== undefined && { month: r.month }),
      pmMeta: {
        advanceNoticeDays: schedule.advanceNoticeDays,
        defaultAssigneeIds: [...schedule.defaultAssigneeIds],
      },
    }
  }

  private static serializeMeterRule(schedule: PMSchedule): StoredMeterRule {
    const r = schedule.meterRule!
    return {
      meterField: r.meterField,
      interval: r.interval,
      tolerance: r.tolerance,
      pmMeta: {
        defaultAssigneeIds: [...schedule.defaultAssigneeIds],
      },
    }
  }

  private static serializeTasks(schedule: PMSchedule): StoredTask[] {
    return schedule.taskList.map((t) => ({
      sequence: t.sequence,
      title: t.title,
      instructions: t.instructions,
      requiresPhoto: t.requiresPhoto,
      requiresMeterReading: t.requiresMeterReading,
      estimatedMinutes: t.estimatedMinutes,
      isCritical: t.isCritical,
      ...(t.meterReadingUnit !== undefined && { meterReadingUnit: t.meterReadingUnit }),
    }))
  }

  private static parseTasks(raw: StoredTask[] | null | unknown): Task[] {
    if (!Array.isArray(raw)) return []
    return (raw as StoredTask[]).map(
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
        } as TaskProps),
    )
  }
}
