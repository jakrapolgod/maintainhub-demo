import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { Money, WorkOrderId } from '@maintainhub/domain'
import type { WorkOrderRepository } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

// ── Command ───────────────────────────────────────────────────────────────────

export interface UsePartCommand {
  workOrderId: string
  partId: string
  /** Number of units to consume — must be a positive integer. */
  quantity: number
  /** Optional cost override; defaults to the part's current unit cost. */
  unitCostOverride?: number
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class UsePartHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  private readonly woRepo: WorkOrderRepository

  constructor(db: TenantClient, prisma: PrismaClient, woRepo: WorkOrderRepository) {
    this.db = db
    this.prisma = prisma
    this.woRepo = woRepo
  }

  /**
   * Records a spare part consumption and deducts from on-hand stock.
   *
   * Application-layer validations:
   *   - Part must exist and belong to this tenant
   *   - quantity must be a positive integer
   *   - on-hand stock must be >= quantity (spec: "validate part stock >= quantity")
   *
   * Domain rule enforced by `wo.usePart()`:
   *   - Work order must not be terminal (COMPLETED or CANCELLED)
   *
   * @throws DomainException NOT_FOUND — WO or part not found
   * @throws DomainException INVALID_QUANTITY
   * @throws DomainException INSUFFICIENT_STOCK
   * @throws DomainException INVALID_PART_USAGE — WO is terminal
   */
  async handle(cmd: UsePartCommand, ctx: CommandContext): Promise<string> {
    // ── 1. Validate quantity ───────────────────────────────────────────────────
    if (!Number.isInteger(cmd.quantity) || cmd.quantity <= 0) {
      throw new DomainException('Quantity must be a positive integer', 'INVALID_QUANTITY', 422)
    }

    // ── 2. Validate part exists in this tenant and has sufficient stock ────────
    const part = await this.db.part.findFirst({
      where: { id: cmd.partId, deletedAt: null },
      select: { id: true, partNumber: true, name: true, unitCost: true, quantity: true },
    })
    if (!part) {
      throw new DomainException('Part not found', 'NOT_FOUND', 404)
    }
    if (part.quantity < cmd.quantity) {
      throw new DomainException(
        `Insufficient stock: ${part.quantity} unit(s) available, ${cmd.quantity} requested`,
        'INSUFFICIENT_STOCK',
        422,
      )
    }

    // ── 3. Load WO aggregate to validate state ─────────────────────────────────
    const wo = await this.woRepo.findById(new WorkOrderId(cmd.workOrderId), ctx.tenantId)
    if (!wo) {
      throw new DomainException('Work order not found', 'NOT_FOUND', 404)
    }

    // ── 4. Build domain value objects and call domain validation ──────────────
    const unitCost =
      cmd.unitCostOverride !== undefined
        ? new Money(cmd.unitCostOverride, 'THB')
        : new Money(part.unitCost, 'THB')

    const usageId = randomUUID()

    wo.usePart({
      id: usageId,
      partId: cmd.partId,
      quantity: cmd.quantity,
      unitCost,
      usedAt: new Date(),
    })

    // ── 5. Persist PartUsage row ──────────────────────────────────────────────
    const unitCostDecimal = new Prisma.Decimal(unitCost.amount.toString())
    const totalCost = unitCostDecimal.mul(cmd.quantity)

    await this.prisma.partUsage.create({
      data: {
        id: usageId,
        workOrderId: cmd.workOrderId,
        partId: cmd.partId,
        quantity: cmd.quantity,
        unitCost: unitCostDecimal,
        totalCost,
        usedAt: new Date(),
      },
    })

    // ── 6. Deduct from stock ───────────────────────────────────────────────────
    await this.db.part.update({
      where: { id: cmd.partId },
      data: { quantity: { decrement: cmd.quantity } },
    })

    // ── 7. Update denormalised parts total on the WO ──────────────────────────
    await this.recalculatePartsTotal(cmd.workOrderId)

    // ── 8. Save aggregate (updates updatedAt, dispatches queued events) ───────
    await this.woRepo.save(wo)

    // ── 9. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'USE_PART',
      entityType: 'WorkOrder',
      entityId: cmd.workOrderId,
      after: {
        usageId,
        partId: cmd.partId,
        quantity: cmd.quantity,
        unitCost: unitCost.amount.toString(),
        totalCost: totalCost.toString(),
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return usageId
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async recalculatePartsTotal(woId: string): Promise<void> {
    const usages = await this.prisma.partUsage.findMany({
      where: { workOrderId: woId },
      select: { totalCost: true },
    })
    const total = usages.reduce(
      (sum, u) => sum.add(new Prisma.Decimal(u.totalCost.toString())),
      new Prisma.Decimal(0),
    )
    await this.prisma.workOrder.update({
      where: { id: woId },
      data: { totalPartsCost: total },
    })
  }
}
