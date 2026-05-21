import type { PrismaClient } from '@prisma/client'
import type { WorkOrderRepository } from '@maintainhub/domain'
import { WorkOrderId } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

// ── Command ───────────────────────────────────────────────────────────────────

export interface CancelWorkOrderCommand {
  workOrderId: string
  reason: string
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class CancelWorkOrderHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  private readonly woRepo: WorkOrderRepository

  constructor(db: TenantClient, prisma: PrismaClient, woRepo: WorkOrderRepository) {
    this.db = db
    this.prisma = prisma
    this.woRepo = woRepo
  }

  /**
   * Cancels a work order that is not yet COMPLETED.
   *
   * Domain rules enforced by `wo.cancel()`:
   *   - COMPLETED WOs cannot be cancelled (CANNOT_CANCEL_COMPLETED)
   *   - Already CANCELLED WOs throw ALREADY_CANCELLED
   *   - Reason must be non-empty (CANCEL_REASON_REQUIRED)
   *
   * Side effects after persistence:
   *   - `WorkOrderCancelledEvent` dispatched to BullMQ
   *     → inventory service (release reserved parts), SLA tracker (stop clock)
   *
   * @throws DomainException NOT_FOUND
   * @throws DomainException CANNOT_CANCEL_COMPLETED
   * @throws DomainException ALREADY_CANCELLED
   * @throws DomainException CANCEL_REASON_REQUIRED
   */
  async handle(cmd: CancelWorkOrderCommand, ctx: CommandContext): Promise<void> {
    // ── 1. Load aggregate ──────────────────────────────────────────────────────
    const wo = await this.woRepo.findById(new WorkOrderId(cmd.workOrderId), ctx.tenantId)
    if (!wo) {
      throw new DomainException('Work order not found', 'NOT_FOUND', 404)
    }

    const priorStatus = wo.status.value

    // ── 2. Apply domain transition (throws on invalid state or missing reason) ─
    wo.cancel(cmd.reason, ctx.executingUserId)

    // ── 3. Persist + dispatch WorkOrderCancelledEvent ─────────────────────────
    await this.woRepo.save(wo)

    // ── 4. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'CANCEL_WORK_ORDER',
      entityType: 'WorkOrder',
      entityId: cmd.workOrderId,
      before: { status: priorStatus },
      after: {
        status: 'CANCELLED',
        reason: cmd.reason,
        cancelledAt: wo.cancelledAt?.toISOString(),
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }
}
