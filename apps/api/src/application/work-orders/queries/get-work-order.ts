/**
 * GetWorkOrderHandler — full detail projection for a single work order.
 *
 * Returns a `WorkOrderDetail` DTO that includes:
 *   - All scalar WO fields
 *   - Related asset name + location path
 *   - Assignee names and avatars
 *   - Labor entries with technician names
 *   - Part usages with part number / name
 *   - Attachments with uploader names
 *   - Comments with author names / avatars
 *   - Audit trail (last 50 entries, newest first)
 *
 * This is a pure read path — no aggregate loading, no domain objects.
 * Prisma rows are projected directly to DTOs.
 */
import type { PrismaClient } from '@prisma/client'
import { DomainException } from '../../../errors/domain.exception.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import type {
  QueryContext,
  WorkOrderDetail,
  LaborEntryDto,
  PartUsageDto,
  AttachmentDto,
  CommentDto,
  AuditEntryDto,
} from './query.types.js'

// ── Query ─────────────────────────────────────────────────────────────────────

export interface GetWorkOrderQuery {
  workOrderId: string
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class GetWorkOrderHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  constructor(db: TenantClient, prisma: PrismaClient) {
    this.db = db
    this.prisma = prisma
  }

  /**
   * @throws DomainException NOT_FOUND when WO does not exist in tenant
   */
  async handle(query: GetWorkOrderQuery, ctx: QueryContext): Promise<WorkOrderDetail> {
    // ── 1. Load WO with all relations ─────────────────────────────────────────
    const row = await this.db.workOrder.findFirst({
      where: {
        id: query.workOrderId,
        deletedAt: null,
      },
      include: {
        asset: {
          select: {
            id: true,
            name: true,
            location: { select: { name: true } },
          },
        },
        failureCode: { select: { id: true, name: true } },
        laborEntries: {
          orderBy: { date: 'desc' },
          include: {
            technician: { select: { id: true, name: true } },
          },
        },
        partUsages: {
          orderBy: { usedAt: 'desc' },
          include: {
            part: { select: { id: true, partNumber: true, name: true } },
          },
        },
        attachments: {
          orderBy: { createdAt: 'asc' },
          include: {
            uploadedBy: { select: { id: true, name: true } },
          },
        },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    })

    if (!row) {
      throw new DomainException('Work order not found', 'NOT_FOUND', 404)
    }

    // ── 2. Resolve assignee profiles ──────────────────────────────────────────
    const assignees =
      row.assigneeIds.length > 0
        ? await this.db.user.findMany({
            where: { id: { in: row.assigneeIds }, deletedAt: null },
            select: { id: true, name: true, avatarUrl: true },
          })
        : []

    // ── 3. Resolve creator name ───────────────────────────────────────────────
    const creator = await this.db.user.findFirst({
      where: { id: row.createdById },
      select: { id: true, name: true },
    })

    // ── 4. Load audit trail (last 50 entries for this WO) ─────────────────────
    const auditRows = await this.prisma.auditLog.findMany({
      where: { tenantId: ctx.tenantId, entityType: 'WorkOrder', entityId: query.workOrderId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { id: true, name: true } } },
    })

    // ── 5. Project to DTO ─────────────────────────────────────────────────────
    const laborEntries: LaborEntryDto[] = row.laborEntries.map((e) => ({
      id: e.id,
      technicianId: e.technicianId,
      technicianName: e.technician.name,
      date: e.date.toISOString().slice(0, 10),
      hours: Number(e.hours),
      ratePerHour: Number(e.ratePerHour),
      totalCost: Number(e.totalCost),
      description: e.description ?? null,
    }))

    const partUsages: PartUsageDto[] = row.partUsages.map((u) => ({
      id: u.id,
      partId: u.partId,
      partNumber: u.part.partNumber,
      partName: u.part.name,
      quantity: u.quantity,
      unitCost: Number(u.unitCost),
      totalCost: Number(u.totalCost),
      usedAt: u.usedAt.toISOString(),
    }))

    const attachments: AttachmentDto[] = row.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      fileSize: a.fileSize,
      mimeType: a.mimeType,
      storageKey: a.storageKey,
      thumbnailKey: a.thumbnailKey ?? null,
      uploadedById: a.uploadedById,
      uploadedByName: a.uploadedBy.name,
      uploadedAt: a.createdAt.toISOString(),
    }))

    const comments: CommentDto[] = row.comments.map((c) => ({
      id: c.id,
      body: c.body,
      authorId: c.authorId,
      authorName: c.author.name,
      authorAvatarUrl: c.author.avatarUrl ?? null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }))

    const auditTrail: AuditEntryDto[] = auditRows.map((a) => ({
      id: a.id,
      action: a.action,
      userId: a.userId ?? null,
      userName: a.user?.name ?? null,
      before: a.before ?? null,
      after: a.after ?? null,
      ipAddress: a.ipAddress ?? null,
      createdAt: a.createdAt.toISOString(),
    }))

    return {
      id: row.id,
      woNumber: row.woNumber,
      title: row.title,
      description: row.description ?? null,
      type: row.type,
      priority: row.priority,
      status: row.status,
      assetId: row.assetId,
      assetName: row.asset.name,
      assetLocation: row.asset.location?.name ?? null,
      parentId: row.parentId ?? null,
      assigneeIds: row.assigneeIds,
      assignees: assignees.map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl ?? null })),
      dueDate: row.dueDate?.toISOString() ?? null,
      slaDeadline: row.slaDeadline?.toISOString() ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      failureCodeId: row.failureCodeId ?? null,
      failureCodeName: row.failureCode?.name ?? null,
      resolution: row.resolution ?? null,
      totalLaborCost: row.totalLaborCost !== null ? Number(row.totalLaborCost) : null,
      totalPartsCost: row.totalPartsCost !== null ? Number(row.totalPartsCost) : null,
      laborEntries,
      partUsages,
      attachments,
      comments,
      auditTrail,
      createdById: row.createdById,
      createdByName: creator?.name ?? 'Unknown',
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}
