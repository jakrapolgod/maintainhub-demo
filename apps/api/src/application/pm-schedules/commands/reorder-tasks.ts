import type { PrismaClient } from '@prisma/client'
import { PMScheduleId } from '@maintainhub/domain'
import type { PMScheduleRepository } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import { writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

export interface ReorderTasksCommand {
  scheduleId: string
  /** Task titles in the desired display order. */
  orderedTitles: string[]
}

export class ReorderTasksHandler {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly pmRepo: PMScheduleRepository,
  ) {}

  async handle(cmd: ReorderTasksCommand, ctx: CommandContext): Promise<void> {
    const id = new PMScheduleId(cmd.scheduleId)
    const schedule = await this.pmRepo.findById(id, ctx.tenantId)
    if (schedule === undefined) {
      throw new DomainException('PM schedule not found', 'PM_SCHEDULE_NOT_FOUND', 404)
    }

    schedule.reorderTasks(cmd.orderedTitles)
    await this.pmRepo.update(schedule)

    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'PM_REORDER_TASKS',
      entityType: 'PMSchedule',
      entityId: cmd.scheduleId,
      after: { newOrder: cmd.orderedTitles },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }
}
