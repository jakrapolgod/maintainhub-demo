import type { PrismaClient } from '@prisma/client'
import { PMScheduleId } from '@maintainhub/domain'
import type { PMScheduleRepository, TaskProps } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import { writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

export interface AddTaskToScheduleCommand {
  scheduleId: string
  task: TaskProps
}

export class AddTaskToScheduleHandler {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly pmRepo: PMScheduleRepository,
  ) {}

  async handle(cmd: AddTaskToScheduleCommand, ctx: CommandContext): Promise<void> {
    const id = new PMScheduleId(cmd.scheduleId)
    const schedule = await this.pmRepo.findById(id, ctx.tenantId)
    if (schedule === undefined) {
      throw new DomainException('PM schedule not found', 'PM_SCHEDULE_NOT_FOUND', 404)
    }

    schedule.addTask(cmd.task)
    await this.pmRepo.update(schedule)

    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'PM_ADD_TASK',
      entityType: 'PMSchedule',
      entityId: cmd.scheduleId,
      after: { taskTitle: cmd.task.title, sequence: cmd.task.sequence },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }
}
