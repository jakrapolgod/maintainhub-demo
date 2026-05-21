import type { PrismaClient } from '@prisma/client'
import type { WorkOrderRepository } from '@maintainhub/domain'
import { WorkOrderId } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

// ── Command ───────────────────────────────────────────────────────────────────

/** All fields are optional — only provided fields are patched. */
export interface UpdateWorkOrderCommand {
  workOrderId: string
  title?: string
  description?: string
  /** Admin-level priority override (does not go through escalation flow). */
  priority?: string
  dueDate?: Date
  /** Full replacement of the assignee list — admin override, no event emitted. */
  assigneeIds?: string[]
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class UpdateWorkOrderHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  private readonly woRepo: WorkOrderRepository

  constructor(db: TenantClient, prisma: PrismaClient, woRepo: WorkOrderRepository) {
    this.db = db
    this.prisma = prisma
    this.woRepo = woRepo
  }

  async handle(cmd: UpdateWorkOrderCommand, ctx: CommandContext): Promise<void> {
    // ── 1. Load to verify existence + state ───────────────────────────────────
    const wo = await this.woRepo.findById(new WorkOrderId(cmd.workOrderId), ctx.tenantId)
    if (!wo) {
      throw new DomainException('Work order not found', 'NOT_FOUND', 404)
    }

    if (wo.status.isTerminal()) {
      throw new DomainException(
        `Cannot update a ${wo.status.value} work order`,
        'INVALID_OPERATION',
        422,
      )
    }

    // ── 2. Capture before snapshot for audit ──────────────────────────────────
    const before = {
      title: wo.title,
      description: wo.description,
      priority: wo.priority.value,
    }

    // ── 3. Apply scalar patch via Prisma (no domain business rules involved) ──
    const hasPatch =
      cmd.title !== undefined ||
      cmd.description !== undefined ||
      cmd.priority !== undefined ||
      cmd.dueDate !== undefined ||
      cmd.assigneeIds !== undefined

    if (hasPatch) {
      await this.prisma.workOrder.update({
        where: { id: cmd.workOrderId },
        data: {
          ...(cmd.title !== undefined && { title: cmd.title }),
          ...(cmd.description !== undefined && { description: cmd.description }),
          ...(cmd.priority !== undefined && { priority: cmd.priority as never }),
          ...(cmd.dueDate !== undefined && { dueDate: cmd.dueDate }),
          ...(cmd.assigneeIds !== undefined && { assigneeIds: cmd.assigneeIds }),
        },
      })
    }

    // ── 4. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'UPDATE_WORK_ORDER',
      entityType: 'WorkOrder',
      entityId: cmd.workOrderId,
      before,
      after: { title: cmd.title, description: cmd.description, priority: cmd.priority },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }
}
