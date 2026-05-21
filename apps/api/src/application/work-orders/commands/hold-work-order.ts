import type { PrismaClient } from '@prisma/client'
import type { WorkOrderRepository } from '@maintainhub/domain'
import { WorkOrderId } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

// ── Command ───────────────────────────────────────────────────────────────────

export interface HoldWorkOrderCommand {
  workOrderId: string
  /** Non-empty description of why work is paused (e.g. "waiting for spare parts"). */
  reason: string
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class HoldWorkOrderHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  private readonly woRepo: WorkOrderRepository

  constructor(db: TenantClient, prisma: PrismaClient, woRepo: WorkOrderRepository) {
    this.db = db
    this.prisma = prisma
    this.woRepo = woRepo
  }

  /**
   * Puts an IN_PROGRESS work order on hold.
   *
   * @throws DomainException NOT_FOUND
   * @throws DomainException HOLD_REASON_REQUIRED — empty reason string
   * @throws DomainException INVALID_HOLD — WO is not IN_PROGRESS
   */
  async handle(cmd: HoldWorkOrderCommand, ctx: CommandContext): Promise<void> {
    // ── 1. Load aggregate ──────────────────────────────────────────────────────
    const wo = await this.woRepo.findById(new WorkOrderId(cmd.workOrderId), ctx.tenantId)
    if (!wo) {
      throw new DomainException('Work order not found', 'NOT_FOUND', 404)
    }

    // ── 2. Apply domain transition (throws HOLD_REASON_REQUIRED or INVALID_HOLD)
    wo.hold(cmd.reason)

    // ── 3. Persist ────────────────────────────────────────────────────────────
    await this.woRepo.save(wo)

    // ── 4. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'HOLD_WORK_ORDER',
      entityType: 'WorkOrder',
      entityId: cmd.workOrderId,
      before: { status: 'IN_PROGRESS' },
      after: { status: 'ON_HOLD', reason: cmd.reason },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }
}
