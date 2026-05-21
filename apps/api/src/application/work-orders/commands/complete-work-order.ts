import type { PrismaClient } from '@prisma/client'
import type { WorkOrderRepository } from '@maintainhub/domain'
import { WorkOrderId } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

// ── Command ───────────────────────────────────────────────────────────────────

export interface CompleteWorkOrderCommand {
  workOrderId: string
  /** Non-empty description of what was done and the outcome. */
  resolution: string
  /** Optional failure code for root-cause categorisation (ISO 14224). */
  failureCodeId?: string
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class CompleteWorkOrderHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  private readonly woRepo: WorkOrderRepository

  constructor(db: TenantClient, prisma: PrismaClient, woRepo: WorkOrderRepository) {
    this.db = db
    this.prisma = prisma
    this.woRepo = woRepo
  }

  /**
   * Completes an IN_PROGRESS work order.
   *
   * Domain rules enforced by `wo.complete()`:
   *   - Status must be IN_PROGRESS
   *   - Permit To Work (if attached) must be signed
   *   - Resolution must be non-empty
   *
   * Side effects after persistence:
   *   - `WorkOrderCompletedEvent` dispatched to BullMQ → asset metrics + PM check
   *
   * @throws DomainException NOT_FOUND
   * @throws DomainException INVALID_COMPLETION
   * @throws DomainException PTW_NOT_SIGNED
   * @throws DomainException RESOLUTION_REQUIRED
   */
  async handle(cmd: CompleteWorkOrderCommand, ctx: CommandContext): Promise<void> {
    // ── 1. Load aggregate ──────────────────────────────────────────────────────
    const wo = await this.woRepo.findById(new WorkOrderId(cmd.workOrderId), ctx.tenantId)
    if (!wo) {
      throw new DomainException('Work order not found', 'NOT_FOUND', 404)
    }

    // ── 2. Optionally validate failureCode exists ─────────────────────────────
    if (cmd.failureCodeId !== undefined) {
      const code = await this.prisma.failureCode.findUnique({
        where: { id: cmd.failureCodeId },
        select: { id: true },
      })
      if (!code) {
        throw new DomainException('Failure code not found', 'FAILURE_CODE_NOT_FOUND', 404)
      }
    }

    // ── 3. Apply domain transition (throws on invalid state / PTW / resolution)
    wo.complete(ctx.executingUserId, cmd.resolution)

    // ── 4. Persist + dispatch WorkOrderCompletedEvent ─────────────────────────
    await this.woRepo.save(wo)

    // ── 5. Record failure code if provided (not part of the aggregate) ────────
    if (cmd.failureCodeId !== undefined) {
      await this.prisma.workOrder.update({
        where: { id: cmd.workOrderId },
        data: { failureCodeId: cmd.failureCodeId },
      })
    }

    // ── 6. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'COMPLETE_WORK_ORDER',
      entityType: 'WorkOrder',
      entityId: cmd.workOrderId,
      before: { status: 'IN_PROGRESS' },
      after: {
        status: 'COMPLETED',
        resolution: cmd.resolution,
        completedAt: wo.completedAt?.toISOString(),
        failureCodeId: cmd.failureCodeId,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }
}
