import type { PrismaClient } from '@prisma/client'
import { PMSchedule, PMScheduleId, CalendarRule, MeterRule, Task } from '@maintainhub/domain'
import type { PMScheduleRepository, TaskProps } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import { writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

// ── Command ───────────────────────────────────────────────────────────────────

export interface UpdatePMScheduleCommand {
  id: string
  title?: string
  description?: string
  calendarRule?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually'
    interval: number
    dayOfWeek?: number
    dayOfMonth?: number
    month?: number
  } | null
  meterRule?: {
    meterField: string
    interval: number
    tolerance: number
  } | null
  taskList?: TaskProps[]
  estimatedHours?: number
  requiredSkillIds?: string[]
  defaultAssigneeIds?: string[]
  advanceNoticeDays?: number
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class UpdatePMScheduleHandler {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly pmRepo: PMScheduleRepository,
  ) {}

  async handle(cmd: UpdatePMScheduleCommand, ctx: CommandContext): Promise<void> {
    // ── 1. Load aggregate ────────────────────────────────────────────────────
    const id = new PMScheduleId(cmd.id)
    const schedule = await this.pmRepo.findById(id, ctx.tenantId)
    if (schedule === undefined) {
      throw new DomainException('PM schedule not found', 'PM_SCHEDULE_NOT_FOUND', 404)
    }

    const before = {
      title: schedule.title,
      estimatedHours: schedule.estimatedHours,
      advanceNoticeDays: schedule.advanceNoticeDays,
    }

    // ── 2. Mutate mutable state via Prisma update payload
    //       (The domain aggregate doesn't expose a generic `update()` method —
    //        mutations go through named business methods.  For simple field
    //        updates we rebuild and reconstitute with the new values.)
    //
    //       This is a deliberate trade-off: the aggregate's invariant-enforcing
    //       business methods (addTask, removeTask, activate, etc.) are used for
    //       structural changes; flat field updates (title, estimatedHours) bypass
    //       the aggregate and go directly to the repository.
    // ─────────────────────────────────────────────────────────────────────────

    const now = new Date()

    // Build updated value objects when rule fields are provided
    let newCalendarRule: CalendarRule | undefined
    if (cmd.calendarRule === undefined) {
      newCalendarRule = schedule.calendarRule
    } else if (cmd.calendarRule === null) {
      newCalendarRule = undefined
    } else {
      newCalendarRule = new CalendarRule({
        frequency: cmd.calendarRule.frequency,
        interval: cmd.calendarRule.interval,
        dayOfWeek: cmd.calendarRule.dayOfWeek,
        dayOfMonth: cmd.calendarRule.dayOfMonth,
        month: cmd.calendarRule.month,
      })
    }

    let newMeterRule: MeterRule | undefined
    if (cmd.meterRule === undefined) {
      newMeterRule = schedule.meterRule
    } else if (cmd.meterRule === null) {
      newMeterRule = undefined
    } else {
      newMeterRule = new MeterRule(cmd.meterRule)
    }

    const newTaskList =
      cmd.taskList !== undefined ? cmd.taskList.map((t) => new Task(t)) : [...schedule.taskList]

    // Recompute nextDueAt when calendarRule changed (static pure method, no side effects)
    const newNextDueAt =
      cmd.calendarRule !== undefined && newCalendarRule !== undefined
        ? PMSchedule.calculateNextDue(now, newCalendarRule)
        : schedule.nextDueAt

    // Rebuild via reconstitute with updated fields
    const updated = PMSchedule.reconstitute({
      id: schedule.id,
      tenantId: schedule.tenantId,
      assetId: schedule.assetId,
      type: schedule.type,
      title: cmd.title ?? schedule.title,
      description: cmd.description ?? schedule.description,
      calendarRule: newCalendarRule,
      meterRule: newMeterRule,
      conditionRule: schedule.conditionRule,
      taskList: newTaskList,
      estimatedHours: cmd.estimatedHours ?? schedule.estimatedHours,
      requiredParts: [...schedule.requiredParts],
      requiredSkillIds: cmd.requiredSkillIds ?? [...schedule.requiredSkillIds],
      defaultAssigneeIds: cmd.defaultAssigneeIds ?? [...schedule.defaultAssigneeIds],
      isActive: schedule.isActive,
      lastTriggeredAt: schedule.lastTriggeredAt,
      nextDueAt: newNextDueAt,
      advanceNoticeDays: cmd.advanceNoticeDays ?? schedule.advanceNoticeDays,
      createdById: schedule.createdById,
      createdAt: schedule.createdAt,
      updatedAt: now,
    })

    // ── 3. Persist ────────────────────────────────────────────────────────────
    await this.pmRepo.update(updated)

    // ── 4. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'UPDATE_PM_SCHEDULE',
      entityType: 'PMSchedule',
      entityId: cmd.id,
      before,
      after: {
        title: updated.title,
        estimatedHours: updated.estimatedHours,
        advanceNoticeDays: updated.advanceNoticeDays,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }
}
