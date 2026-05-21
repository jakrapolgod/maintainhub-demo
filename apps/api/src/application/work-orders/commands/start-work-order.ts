import type { PrismaClient } from '@prisma/client'
import type { WorkOrderRepository } from '@maintainhub/domain'
import { WorkOrderId } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

// ── Roles permitted to start any WO regardless of assignment ──────────────────

const PRIVILEGED_ROLES = new Set(['ADMIN', 'MANAGER'])

// ── Command ───────────────────────────────────────────────────────────────────

export interface StartWorkOrderCommand {
  workOrderId: string
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class StartWorkOrderHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  private readonly woRepo: WorkOrderRepository

  constructor(db: TenantClient, prisma: PrismaClient, woRepo: WorkOrderRepository) {
    this.db = db
    this.prisma = prisma
    this.woRepo = woRepo
  }

  /**
   * Transitions an OPEN work order to IN_PROGRESS.
   *
   * Authorization rules:
   *   - ADMIN and MANAGER may start any WO in the tenant.
   *   - TECHNICIAN and CONTRACTOR may only start WOs they are assigned to.
   *
   * @throws DomainException NOT_FOUND — work order not in this tenant
   * @throws DomainException FORBIDDEN — caller has no permission to start this WO
   * @throws DomainException INVALID_START — WO is not OPEN
   */
  async handle(cmd: StartWorkOrderCommand, ctx: CommandContext): Promise<void> {
    // ── 1. Load aggregate ──────────────────────────────────────────────────────
    const wo = await this.woRepo.findById(new WorkOrderId(cmd.workOrderId), ctx.tenantId)
    if (!wo) {
      throw new DomainException('Work order not found', 'NOT_FOUND', 404)
    }

    // ── 2. Authorization: must be assignee OR have elevated role ──────────────
    const isPrivileged = PRIVILEGED_ROLES.has(ctx.userRole)
    const isAssignee = wo.assigneeIds.includes(ctx.executingUserId)

    if (!isPrivileged && !isAssignee) {
      throw new DomainException(
        'You are not assigned to this work order and do not have permission to start it',
        'FORBIDDEN',
        403,
      )
    }

    // ── 3. Apply domain transition (throws INVALID_START if not OPEN) ─────────
    wo.start(ctx.executingUserId)

    // ── 4. Persist ────────────────────────────────────────────────────────────
    await this.woRepo.save(wo)

    // ── 5. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'START_WORK_ORDER',
      entityType: 'WorkOrder',
      entityId: cmd.workOrderId,
      before: { status: 'OPEN' },
      after: { status: 'IN_PROGRESS', startedAt: wo.startedAt?.toISOString() },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }
}
