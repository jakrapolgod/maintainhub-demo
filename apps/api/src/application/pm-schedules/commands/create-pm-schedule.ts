import type { PrismaClient } from '@prisma/client'
import {
  PMSchedule,
  PMScheduleId,
  CalendarRule,
  MeterRule,
  Task,
  RequiredPart,
} from '@maintainhub/domain'
import type { PMScheduleRepository, TaskProps } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { generatePMId, writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

// ── Command ───────────────────────────────────────────────────────────────────

export interface CreatePMScheduleCommand {
  assetId: string
  title: string
  description?: string
  type: 'CALENDAR' | 'METER' | 'CONDITION'
  calendarRule?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually'
    interval: number
    dayOfWeek?: number
    dayOfMonth?: number
    month?: number
  }
  meterRule?: {
    meterField: string
    interval: number
    tolerance: number
  }
  conditionRule?: Record<string, unknown>
  taskList: TaskProps[]
  estimatedHours?: number
  requiredParts?: Array<{
    partId: string
    partNumber: string
    description: string
    quantity: number
    unitOfMeasure: string
  }>
  requiredSkillIds?: string[]
  defaultAssigneeIds?: string[]
  advanceNoticeDays?: number
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class CreatePMScheduleHandler {
  constructor(
    private readonly db: TenantClient,
    private readonly prisma: PrismaClient,
    private readonly pmRepo: PMScheduleRepository,
  ) {}

  async handle(cmd: CreatePMScheduleCommand, ctx: CommandContext): Promise<string> {
    // ── 1. Validate asset ────────────────────────────────────────────────────
    const asset = await this.db.asset.findFirst({
      where: { id: cmd.assetId, deletedAt: null },
      select: { id: true },
    })
    if (!asset) {
      throw new DomainException('Asset not found', 'ASSET_NOT_FOUND', 404)
    }

    // ── 2. Validate task list ─────────────────────────────────────────────────
    if (!cmd.taskList || cmd.taskList.length === 0) {
      throw new DomainException('PM schedule must have at least one task', 'EMPTY_TASK_LIST', 422)
    }

    // ── 3. Build value objects ────────────────────────────────────────────────
    const calendarRule =
      cmd.calendarRule !== undefined
        ? new CalendarRule({
            frequency: cmd.calendarRule.frequency,
            interval: cmd.calendarRule.interval,
            dayOfWeek: cmd.calendarRule.dayOfWeek,
            dayOfMonth: cmd.calendarRule.dayOfMonth,
            month: cmd.calendarRule.month,
          })
        : undefined

    const meterRule = cmd.meterRule !== undefined ? new MeterRule(cmd.meterRule) : undefined

    const taskList = cmd.taskList.map((t) => new Task(t))

    const requiredParts = (cmd.requiredParts ?? []).map((p) => new RequiredPart(p))

    // ── 4. Build aggregate (nextDueAt computed inside PMSchedule.create()) ────
    const id = new PMScheduleId(generatePMId())

    const schedule = PMSchedule.create({
      id,
      tenantId: ctx.tenantId,
      assetId: cmd.assetId,
      type: cmd.type,
      title: cmd.title,
      description: cmd.description ?? '',
      calendarRule,
      meterRule,
      conditionRule: cmd.conditionRule,
      taskList,
      estimatedHours: cmd.estimatedHours ?? 0,
      requiredParts,
      requiredSkillIds: cmd.requiredSkillIds ?? [],
      defaultAssigneeIds: cmd.defaultAssigneeIds ?? [],
      advanceNoticeDays: cmd.advanceNoticeDays ?? 7,
      createdById: ctx.executingUserId,
    })

    // ── 5. Persist ────────────────────────────────────────────────────────────
    await this.pmRepo.save(schedule)

    // ── 6. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'CREATE_PM_SCHEDULE',
      entityType: 'PMSchedule',
      entityId: id.value,
      after: {
        title: cmd.title,
        type: cmd.type,
        assetId: cmd.assetId,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return id.value
  }
}
