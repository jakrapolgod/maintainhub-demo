import { Prisma } from '@prisma/client'
import type { AuditMeta } from '../lib/audit'
import { DomainException } from '../errors/domain.exception'
import { fromPrismaRow } from '../domain/work-order/work-order.entity'
import type { TenantClient } from '../lib/tenant-prisma'
import type {
  AddCommentDto,
  AddLaborDto,
  AddPartUsageDto,
  AssignDto,
  CancelDto,
  CompleteDto,
  CreateWoDto,
  ListWoQuery,
  UpdateWoDto,
} from '../schemas/work-order'

// ── Constants ─────────────────────────────────────────────────────────────────

const WO_DETAIL_INCLUDE = {
  asset: { select: { id: true, assetNumber: true, name: true, status: true } },
  failureCode: { select: { id: true, code: true, name: true, category: true } },
  laborEntries: {
    orderBy: { date: 'asc' as const },
    select: {
      id: true, date: true, hours: true, ratePerHour: true,
      totalCost: true, description: true,
      technician: { select: { id: true, name: true, email: true } },
    },
  },
  partUsages: {
    orderBy: { usedAt: 'asc' as const },
    select: {
      id: true, quantity: true, unitCost: true, totalCost: true, usedAt: true,
      part: { select: { id: true, partNumber: true, name: true } },
    },
  },
  comments: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true, body: true, createdAt: true,
      author: { select: { id: true, name: true, avatarUrl: true } },
    },
  },
} satisfies Prisma.WorkOrderInclude

// SLA hours from WO creation, keyed by priority
const SLA_HOURS: Record<string, number> = {
  CRITICAL: 4, HIGH: 24, MEDIUM: 72, LOW: 168,
}

// ── WO-number generation ──────────────────────────────────────────────────────

async function generateWoNumber(db: TenantClient, _tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `WO-${year}-`

  const last = await db.workOrder.findFirst({
    where: { woNumber: { startsWith: prefix } },
    orderBy: { woNumber: 'desc' },
    select: { woNumber: true },
  })

  let seq = 1
  if (last?.woNumber) {
    const parsed = parseInt(last.woNumber.slice(prefix.length), 10)
    if (!Number.isNaN(parsed)) seq = parsed + 1
  }

  return `${prefix}${String(seq).padStart(6, '0')}`
}

// ── Pagination & ownership ────────────────────────────────────────────────────

interface Paginated<T> {
  data: T[]
  pagination: { total: number; page: number; limit: number; totalPages: number }
}

/**
 * Passed by routes that used requirePermission() and received 'own' back.
 * When requiresOwnership is true, read operations filter to resources the
 * requester is assigned to; mutation operations verify assignment first.
 */
export interface OwnershipContext {
  requiresOwnership: boolean
  requesterId: string
}

// ── Service ───────────────────────────────────────────────────────────────────

export class WorkOrderService {
  constructor(
    private readonly db: TenantClient,
    private readonly tenantId: string,
  ) {}

  // ── Read ───────────────────────────────────────────────────────────────────

  async list(query: ListWoQuery, ownership?: OwnershipContext): Promise<Paginated<unknown>> {
    const { page, limit, status, priority, type, assetId, assigneeId, search } = query
    const skip = (page - 1) * limit

    const where: Prisma.WorkOrderWhereInput = {
      deletedAt: null,
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
      ...(type !== undefined && { type }),
      ...(assetId !== undefined && { assetId }),
      ...(assigneeId !== undefined && { assigneeIds: { has: assigneeId } }),
      ...(search !== undefined && { title: { contains: search, mode: 'insensitive' as const } }),
      // CONTRACTOR 'own' restriction — only show WOs they are assigned to.
      // This filter is additive: the assigneeId query param still works on top.
      ...(ownership?.requiresOwnership && { assigneeIds: { has: ownership.requesterId } }),
    }

    const [data, total] = await Promise.all([
      this.db.workOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        select: {
          id: true, woNumber: true, title: true, type: true, priority: true,
          status: true, assigneeIds: true, dueDate: true, slaDeadline: true,
          createdAt: true, updatedAt: true,
          asset: { select: { id: true, assetNumber: true, name: true } },
        },
      }),
      this.db.workOrder.count({ where }),
    ])

    return {
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  async getById(id: string, ownership?: OwnershipContext): Promise<unknown> {
    const wo = await this.db.workOrder.findFirst({
      where: { id, deletedAt: null },
      include: WO_DETAIL_INCLUDE,
    })
    if (!wo) throw new DomainException('Work order not found', 'NOT_FOUND', 404)

    // CONTRACTOR 'own' restriction — reject if they are not an assignee.
    if (ownership?.requiresOwnership) {
      const assigneeIds = wo.assigneeIds as string[]
      if (!assigneeIds.includes(ownership.requesterId)) {
        throw new DomainException('Access denied', 'FORBIDDEN', 403)
      }
    }

    return wo
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(dto: CreateWoDto, audit: AuditMeta): Promise<unknown> {
    const woNumber = await generateWoNumber(this.db, this.tenantId)

    const slaDeadline = new Date(
      Date.now() + (SLA_HOURS[dto.priority] ?? 72) * 3_600_000,
    )

    const wo = await this.db.workOrder.create({
      data: {
        // tenantId is injected by withTenantFilter at runtime;
        // passed explicitly here so the Prisma type-checker is satisfied.
        tenantId: this.tenantId,
        woNumber,
        title: dto.title,
        type: dto.type,
        priority: dto.priority,
        assetId: dto.assetId,
        assigneeIds: dto.assigneeIds,
        slaDeadline,
        createdById: audit.userId,
        // Optional fields: only include when defined to satisfy exactOptionalPropertyTypes
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate }),
      },
      include: WO_DETAIL_INCLUDE,
    })

    await this.writeAudit({
      ...audit,
      action: 'CREATE_WORK_ORDER',
      entityId: wo.id,
      after: { woNumber, title: dto.title, status: wo.status, priority: wo.priority },
    })

    return wo
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateWoDto, audit: AuditMeta): Promise<unknown> {
    const existing = await this.db.workOrder.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true, title: true, priority: true },
    })
    if (!existing) throw new DomainException('Work order not found', 'NOT_FOUND', 404)
    if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
      throw new DomainException(
        'Cannot update a completed or cancelled work order',
        'INVALID_OPERATION',
        422,
      )
    }

    const wo = await this.db.workOrder.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate }),
        ...(dto.failureCodeId !== undefined && { failureCodeId: dto.failureCodeId }),
      },
      include: WO_DETAIL_INCLUDE,
    })

    await this.writeAudit({
      ...audit,
      action: 'UPDATE_WORK_ORDER',
      entityId: id,
      before: { title: existing.title, priority: existing.priority },
      after: dto,
    })

    return wo
  }

  // ── Assign ─────────────────────────────────────────────────────────────────

  async assign(id: string, dto: AssignDto, audit: AuditMeta): Promise<unknown> {
    const row = await this.loadRow(id)
    const entity = fromPrismaRow(row)

    entity.assign(dto.technicianIds)

    const wo = await this.db.workOrder.update({
      where: { id },
      data: { assigneeIds: entity.assigneeIds as string[] },
      include: WO_DETAIL_INCLUDE,
    })

    await this.writeAudit({
      ...audit,
      action: 'ASSIGN_WORK_ORDER',
      entityId: id,
      before: { assigneeIds: row.assigneeIds },
      after: { assigneeIds: dto.technicianIds },
    })

    return wo
  }

  // ── Start ──────────────────────────────────────────────────────────────────

  async start(id: string, audit: AuditMeta): Promise<unknown> {
    const row = await this.loadRow(id)
    const entity = fromPrismaRow(row)

    entity.start()

    const wo = await this.db.workOrder.update({
      where: { id },
      data: { status: entity.status, startedAt: new Date() },
      include: WO_DETAIL_INCLUDE,
    })

    await this.writeAudit({
      ...audit,
      action: 'UPDATE_WO_STATUS',
      entityId: id,
      before: { status: row.status },
      after: { status: entity.status },
    })

    return wo
  }

  // ── Complete ───────────────────────────────────────────────────────────────

  async complete(id: string, dto: CompleteDto, audit: AuditMeta): Promise<unknown> {
    const row = await this.loadRow(id)
    const entity = fromPrismaRow(row)

    entity.complete(dto.resolution)

    const wo = await this.db.workOrder.update({
      where: { id },
      data: {
        status: entity.status,
        completedAt: new Date(),
        resolution: dto.resolution,
        ...(dto.failureCodeId !== undefined && { failureCodeId: dto.failureCodeId }),
      },
      include: WO_DETAIL_INCLUDE,
    })

    await this.writeAudit({
      ...audit,
      action: 'UPDATE_WO_STATUS',
      entityId: id,
      before: { status: row.status },
      after: { status: entity.status, resolution: dto.resolution },
    })

    return wo
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────

  async cancel(id: string, dto: CancelDto, audit: AuditMeta): Promise<unknown> {
    const row = await this.loadRow(id)
    const entity = fromPrismaRow(row)

    entity.cancel(dto.reason)

    const wo = await this.db.workOrder.update({
      where: { id },
      data: { status: entity.status, resolution: dto.reason },
      include: WO_DETAIL_INCLUDE,
    })

    await this.writeAudit({
      ...audit,
      action: 'UPDATE_WO_STATUS',
      entityId: id,
      before: { status: row.status },
      after: { status: entity.status },
    })

    return wo
  }

  // ── Labor entries ──────────────────────────────────────────────────────────

  async addLabor(woId: string, dto: AddLaborDto, audit: AuditMeta, ownership?: OwnershipContext): Promise<unknown> {
    await this.assertExists(woId)
    if (ownership?.requiresOwnership) await this.assertAssignee(woId, ownership.requesterId)

    const hours = new Prisma.Decimal(dto.hours)
    const rate = new Prisma.Decimal(dto.ratePerHour)
    const totalCost = hours.mul(rate)

    const entry = await this.db.laborEntry.create({
      data: {
        workOrderId: woId,
        technicianId: audit.userId,
        date: dto.date,
        hours,
        ratePerHour: rate,
        totalCost,
        ...(dto.description !== undefined && { description: dto.description }),
      },
      select: {
        id: true, date: true, hours: true, ratePerHour: true, totalCost: true, description: true,
        technician: { select: { id: true, name: true, email: true } },
      },
    })

    await this.recalculateLaborTotal(woId)

    await this.writeAudit({
      ...audit,
      action: 'ADD_LABOR_ENTRY',
      entityId: woId,
      after: { hours: dto.hours, ratePerHour: dto.ratePerHour },
    })

    return entry
  }

  async listLabor(woId: string): Promise<unknown> {
    await this.assertExists(woId)
    return this.db.laborEntry.findMany({
      where: { workOrderId: woId },
      orderBy: { date: 'asc' },
      select: {
        id: true, date: true, hours: true, ratePerHour: true, totalCost: true, description: true,
        technician: { select: { id: true, name: true, email: true } },
      },
    })
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  async addComment(woId: string, dto: AddCommentDto, audit: AuditMeta, ownership?: OwnershipContext): Promise<unknown> {
    await this.assertExists(woId)
    if (ownership?.requiresOwnership) await this.assertAssignee(woId, ownership.requesterId)
    return this.db.comment.create({
      data: { workOrderId: woId, authorId: audit.userId, body: dto.body },
      select: {
        id: true, body: true, createdAt: true,
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    })
  }

  async listComments(woId: string): Promise<unknown> {
    await this.assertExists(woId)
    return this.db.comment.findMany({
      where: { workOrderId: woId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, body: true, createdAt: true,
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    })
  }

  // ── Part usage ─────────────────────────────────────────────────────────────

  async addPartUsage(woId: string, dto: AddPartUsageDto, audit: AuditMeta, ownership?: OwnershipContext): Promise<unknown> {
    await this.assertExists(woId)
    if (ownership?.requiresOwnership) await this.assertAssignee(woId, ownership.requesterId)

    // Load part to get snapshot cost and verify it exists in this tenant
    const part = await this.db.part.findFirst({
      where: { id: dto.partId, deletedAt: null },
      select: { id: true, partNumber: true, name: true, unitCost: true, quantity: true },
    })
    if (!part) throw new DomainException('Part not found', 'NOT_FOUND', 404)

    // Use provided unitCost override, or fall back to the part's current cost
    const unitCost = dto.unitCost !== undefined
      ? new Prisma.Decimal(dto.unitCost)
      : part.unitCost

    const totalCost = unitCost.mul(dto.quantity)

    // Record usage (partUsage has no tenantId column — not in TENANT_MODELS, passes through)
    const usage = await this.db.partUsage.create({
      data: {
        workOrderId: woId,
        partId: dto.partId,
        quantity: dto.quantity,   // Int in schema
        unitCost,
        totalCost,
        usedAt: new Date(),
      },
      select: {
        id: true, quantity: true, unitCost: true, totalCost: true, usedAt: true,
        part: { select: { id: true, partNumber: true, name: true } },
      },
    })

    // Deduct from stock — allow negative (signals shortage) rather than blocking WO progress
    await this.db.part.update({
      where: { id: dto.partId },
      data: { quantity: { decrement: dto.quantity } },
    })

    await this.recalculatePartsTotal(woId)

    await this.writeAudit({
      ...audit,
      action: 'ADD_PART_USAGE',
      entityId: woId,
      after: { partId: dto.partId, quantity: dto.quantity, unitCost: unitCost.toString() },
    })

    return usage
  }

  async listPartUsages(woId: string): Promise<unknown> {
    await this.assertExists(woId)
    return this.db.partUsage.findMany({
      where: { workOrderId: woId },
      orderBy: { usedAt: 'asc' },
      select: {
        id: true, quantity: true, unitCost: true, totalCost: true, usedAt: true,
        part: { select: { id: true, partNumber: true, name: true } },
      },
    })
  }

  // ── Audit history ──────────────────────────────────────────────────────────

  async getHistory(woId: string): Promise<unknown> {
    await this.assertExists(woId)
    return this.db.auditLog.findMany({
      where: { entityId: woId, entityType: { in: ['WorkOrder', 'LaborEntry', 'PartUsage', 'Comment'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, action: true, entityType: true, before: true, after: true,
        ipAddress: true, createdAt: true,
        // userId is not a relation — just surface the ID; callers can join if needed
        userId: true,
      },
    })
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async loadRow(id: string) {
    const row = await this.db.workOrder.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true, tenantId: true, assetId: true, type: true,
        priority: true, status: true, assigneeIds: true,
      },
    })
    if (!row) throw new DomainException('Work order not found', 'NOT_FOUND', 404)
    return row
  }

  private async assertExists(woId: string): Promise<void> {
    const exists = await this.db.workOrder.findFirst({
      where: { id: woId, deletedAt: null },
      select: { id: true },
    })
    if (!exists) throw new DomainException('Work order not found', 'NOT_FOUND', 404)
  }

  /** Throws 403 if the requester is not in the WO's assigneeIds list. */
  private async assertAssignee(woId: string, requesterId: string): Promise<void> {
    const wo = await this.db.workOrder.findFirst({
      where: { id: woId, deletedAt: null },
      select: { assigneeIds: true },
    })
    if (!wo) throw new DomainException('Work order not found', 'NOT_FOUND', 404)
    if (!(wo.assigneeIds as string[]).includes(requesterId)) {
      throw new DomainException('Access denied — you are not assigned to this work order', 'FORBIDDEN', 403)
    }
  }

  private async recalculatePartsTotal(woId: string): Promise<void> {
    // partUsage has no tenantId — aggregate directly via the base relation
    const usages = await this.db.partUsage.findMany({
      where: { workOrderId: woId },
      select: { totalCost: true },
    })
    const partsTotal = usages.reduce(
      (sum, u) => sum.add(u.totalCost),
      new Prisma.Decimal(0),
    )
    await this.db.workOrder.update({
      where: { id: woId },
      data: { totalPartsCost: partsTotal },
    })
  }

  private async recalculateLaborTotal(woId: string): Promise<void> {
    const agg = await this.db.laborEntry.aggregate({
      where: { workOrderId: woId },
      // Prisma uses _sum for aggregation results — eslint-disable required for the key name
      // eslint-disable-next-line no-underscore-dangle
      _sum: { totalCost: true },
    })
    // eslint-disable-next-line no-underscore-dangle
    const laborTotal = agg._sum.totalCost ?? new Prisma.Decimal(0)
    await this.db.workOrder.update({
      where: { id: woId },
      data: { totalLaborCost: laborTotal },
    })
  }

  private async writeAudit(opts: {
    userId: string
    action: string
    entityId: string
    before?: unknown
    after?: unknown
    ipAddress: string | null
    userAgent: string | null
  }): Promise<void> {
    await this.db.auditLog.create({
      data: {
        // tenantId is injected by withTenantFilter at runtime;
        // we pass it explicitly so the Prisma type-checker is satisfied.
        tenantId: this.tenantId,
        userId: opts.userId,
        action: opts.action,
        entityType: 'WorkOrder',
        entityId: opts.entityId,
        ipAddress: opts.ipAddress,
        userAgent: opts.userAgent,
        ...(opts.before !== undefined && { before: opts.before as Prisma.InputJsonValue }),
        ...(opts.after !== undefined && { after: opts.after as Prisma.InputJsonValue }),
      },
    })
  }
}
