import type { PrismaClient } from '@prisma/client'
import { PMScheduleId } from '@maintainhub/domain'
import type { PMScheduleRepository } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import { writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

export interface RemoveTaskCommand {
  scheduleId: string
  sequence: number
}

export class RemoveTaskHandler {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly pmRepo: PMScheduleRepository,
  ) {}

  async handle(cmd: RemoveTaskCommand, ctx: CommandContext): Promise<void> {
    const id = new PMScheduleId(cmd.scheduleId)
    const schedule = await this.pmRepo.findById(id, ctx.tenantId)
    if (schedule === undefined) {
      throw new DomainException('PM schedule not found', 'PM_SCHEDULE_NOT_FOUND', 404)
    }

    schedule.removeTask(cmd.sequence)
    await this.pmRepo.update(schedule)

    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'PM_REMOVE_TASK',
      entityType: 'PMSchedule',
      entityId: cmd.scheduleId,
      after: { removedSequence: cmd.sequence },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }
}
