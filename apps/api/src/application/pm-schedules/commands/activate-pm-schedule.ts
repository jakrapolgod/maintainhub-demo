import type { PrismaClient } from '@prisma/client'
import { PMScheduleId } from '@maintainhub/domain'
import type { PMScheduleRepository } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import { writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

export class ActivatePMScheduleHandler {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly pmRepo: PMScheduleRepository,
  ) {}

  async handle(cmd: { id: string }, ctx: CommandContext): Promise<void> {
    const id = new PMScheduleId(cmd.id)
    const schedule = await this.pmRepo.findById(id, ctx.tenantId)
    if (schedule === undefined) {
      throw new DomainException('PM schedule not found', 'PM_SCHEDULE_NOT_FOUND', 404)
    }

    schedule.activate(ctx.executingUserId)
    await this.pmRepo.update(schedule)

    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'ACTIVATE_PM_SCHEDULE',
      entityType: 'PMSchedule',
      entityId: cmd.id,
      after: { isActive: true, nextDueAt: schedule.nextDueAt?.toISOString() },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }
}
