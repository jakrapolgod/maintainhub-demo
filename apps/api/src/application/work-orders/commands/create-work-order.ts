import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { Priority, WorkOrder, WorkOrderId } from '@maintainhub/domain'
import type { WorkOrderRepository, WOType } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { computeSlaDeadline, writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

// ── Command ───────────────────────────────────────────────────────────────────

export interface CreateWorkOrderCommand {
  title: string
  type: WOType
  priority: string
  assetId: string
  description?: string
  assigneeIds?: string[]
  dueDate?: Date
  parentWorkOrderId?: string
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class CreateWorkOrderHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  private readonly woRepo: WorkOrderRepository

  constructor(db: TenantClient, prisma: PrismaClient, woRepo: WorkOrderRepository) {
    this.db = db
    this.prisma = prisma
    this.woRepo = woRepo
  }

  /**
   * Validates the command, creates the aggregate, persists it, and returns the
   * new work order ID.
   *
   * @throws DomainException ASSET_NOT_FOUND when the asset does not exist in
   *   the caller's tenant (TenantClient silently filters cross-tenant rows).
   */
  async handle(cmd: CreateWorkOrderCommand, ctx: CommandContext): Promise<WorkOrderId> {
    // ── 1. Validate asset belongs to this tenant ──────────────────────────────
    const asset = await this.db.asset.findFirst({
      where: { id: cmd.assetId, deletedAt: null },
      select: { id: true },
    })
    if (!asset) {
      throw new DomainException('Asset not found', 'ASSET_NOT_FOUND', 404)
    }

    // ── 2. Validate parent work order if provided ─────────────────────────────
    if (cmd.parentWorkOrderId !== undefined) {
      const parent = await this.db.workOrder.findFirst({
        where: { id: cmd.parentWorkOrderId, deletedAt: null },
        select: { id: true },
      })
      if (!parent) {
        throw new DomainException('Parent work order not found', 'PARENT_WO_NOT_FOUND', 404)
      }
    }

    // ── 3. Generate sequential WO number ──────────────────────────────────────
    const woNumber = await this.woRepo.nextWONumber(ctx.tenantId)

    // ── 4. Compute SLA deadline from priority ─────────────────────────────────
    const slaDeadline = computeSlaDeadline(cmd.priority)

    // ── 5. Build the domain aggregate ─────────────────────────────────────────
    const woId = new WorkOrderId(
      randomUUID()
        .replace(/-/g, '')
        .slice(0, 24)
        .replace(/^[^a-z]/, 'c'),
    )

    const wo = WorkOrder.create({
      id: woId,
      tenantId: ctx.tenantId,
      woNumber,
      title: cmd.title,
      type: cmd.type,
      priority: Priority.from(cmd.priority),
      assetId: cmd.assetId,
      createdById: ctx.executingUserId,
      slaDeadline,
      ...(cmd.description !== undefined && { description: cmd.description }),
      ...(cmd.dueDate !== undefined && { dueDate: cmd.dueDate }),
      ...(cmd.parentWorkOrderId !== undefined && {
        parentWorkOrderId: new WorkOrderId(cmd.parentWorkOrderId),
      }),
    })

    // ── 6. Persist + dispatch domain events ───────────────────────────────────
    await this.woRepo.save(wo)

    // ── 7. Set initial assignees (bypass domain state machine — DRAFT status
    //        does not permit assign(); these are pre-assigned during creation) ──
    if (cmd.assigneeIds && cmd.assigneeIds.length > 0) {
      await this.prisma.workOrder.update({
        where: { id: woId.value },
        data: { assigneeIds: cmd.assigneeIds },
      })
    }

    // ── 8. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'CREATE_WORK_ORDER',
      entityType: 'WorkOrder',
      entityId: woId.value,
      after: {
        woNumber,
        title: cmd.title,
        type: cmd.type,
        priority: cmd.priority,
        assetId: cmd.assetId,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return woId
  }
}
