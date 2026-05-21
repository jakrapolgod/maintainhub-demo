import type { PrismaClient } from '@prisma/client'
import type { WorkOrderRepository } from '@maintainhub/domain'
import { WorkOrderId } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

// ── Command ───────────────────────────────────────────────────────────────────

export interface AssignWorkOrderCommand {
  workOrderId: string
  technicianId: string
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class AssignWorkOrderHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  private readonly woRepo: WorkOrderRepository

  constructor(db: TenantClient, prisma: PrismaClient, woRepo: WorkOrderRepository) {
    this.db = db
    this.prisma = prisma
    this.woRepo = woRepo
  }

  /**
   * Assigns a technician to an OPEN or IN_PROGRESS work order.
   *
   * The domain's `wo.assign()` enforces:
   *   - Status must be OPEN or IN_PROGRESS (throws INVALID_ASSIGNMENT otherwise)
   *   - Duplicate IDs are silently ignored (idempotent)
   *
   * @throws DomainException NOT_FOUND — work order not in this tenant
   * @throws DomainException TECHNICIAN_NOT_FOUND — user does not exist / inactive
   * @throws DomainException INVALID_ASSIGNMENT — wrong WO status
   */
  async handle(cmd: AssignWorkOrderCommand, ctx: CommandContext): Promise<void> {
    // ── 1. Validate technician exists and is active in this tenant ────────────
    const tech = await this.db.user.findFirst({
      where: { id: cmd.technicianId, isActive: true, deletedAt: null },
      select: { id: true, name: true },
    })
    if (!tech) {
      throw new DomainException(
        'Technician not found or inactive in this workspace',
        'TECHNICIAN_NOT_FOUND',
        404,
      )
    }

    // ── 2. Load aggregate ──────────────────────────────────────────────────────
    const wo = await this.woRepo.findById(new WorkOrderId(cmd.workOrderId), ctx.tenantId)
    if (!wo) {
      throw new DomainException('Work order not found', 'NOT_FOUND', 404)
    }

    const beforeAssignees = [...wo.assigneeIds]

    // ── 3. Apply domain business rule (throws INVALID_ASSIGNMENT if wrong state)
    wo.assign(cmd.technicianId, ctx.executingUserId)

    // ── 4. Persist + dispatch WorkOrderAssignedEvent ──────────────────────────
    await this.woRepo.save(wo)

    // ── 5. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'ASSIGN_WORK_ORDER',
      entityType: 'WorkOrder',
      entityId: cmd.workOrderId,
      before: { assigneeIds: beforeAssignees },
      after: { technicianId: cmd.technicianId, assigneeIds: [...wo.assigneeIds] },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }
}
