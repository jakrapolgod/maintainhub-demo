/**
 * WorkOrderMapper — bidirectional translation between Prisma's flat persistence
 * model and the domain's rich aggregate.
 *
 * ## Design notes
 *
 * ### Currency
 * The Prisma schema stores monetary amounts as bare `Decimal` values without a
 * currency column. The mapper defaults to 'THB' (the platform's base currency).
 * A future migration should add a `currency` column to `LaborEntry` and
 * `PartUsage` so this can be read from the row.
 *
 * ### cancelledAt
 * The `WorkOrder` aggregate tracks `cancelledAt` as a domain concept, but the
 * Prisma schema has no matching column. On reads it is always `undefined`; on
 * writes it is silently dropped. Track as schema debt.
 *
 * ### Relations
 * The full `WorkOrder` with all relations is loaded once by the repository and
 * passed to `toDomain()`. Partial hydration (e.g. for list views) is handled by
 * returning reconstituted aggregates with empty collections.
 */
import type { Prisma, Priority as PrismaPriority, WOStatus, WOType } from '@prisma/client'
import {
  LaborCost,
  Money,
  Priority,
  WorkOrder,
  WorkOrderId,
  WorkOrderStatus,
} from '@maintainhub/domain'
import type { Attachment, LaborEntry, PartUsage, WorkOrderProps } from '@maintainhub/domain'

// ── Default currency ──────────────────────────────────────────────────────────

/**
 * Platform base currency.
 * TODO: read from tenant settings once multi-currency support is added.
 */
const BASE_CURRENCY = 'THB'

// ── Prisma row shapes ─────────────────────────────────────────────────────────

/** Full Prisma row with all relations that the mapper needs. */
export type PrismaWorkOrderRow = Prisma.WorkOrderGetPayload<{
  include: {
    laborEntries: true
    partUsages: true
    attachments: true
  }
}>

/** Prisma row without relations (used for list queries). */
export type PrismaWorkOrderRowSlim = Prisma.WorkOrderGetPayload<{
  select: {
    id: true
    tenantId: true
    woNumber: true
    title: true
    description: true
    type: true
    priority: true
    status: true
    assetId: true
    parentId: true
    assigneeIds: true
    dueDate: true
    slaDeadline: true
    startedAt: true
    completedAt: true
    failureCodeId: true
    resolution: true
    totalLaborCost: true
    totalPartsCost: true
    createdById: true
    createdAt: true
    updatedAt: true
    deletedAt: true
  }
}>

// ── Mapper ────────────────────────────────────────────────────────────────────

export class WorkOrderMapper {
  // ── Prisma → Domain ────────────────────────────────────────────────────────

  /** Map a fully-hydrated Prisma row to the domain aggregate. */
  static toDomain(row: PrismaWorkOrderRow): WorkOrder {
    const props: WorkOrderProps = {
      id: new WorkOrderId(row.id),
      tenantId: row.tenantId,
      woNumber: row.woNumber,
      title: row.title,
      type: row.type as WOType,
      priority: Priority.from(row.priority),
      status: WorkOrderStatus.from(row.status),
      assetId: row.assetId,
      createdById: row.createdById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      assigneeIds: row.assigneeIds,
      laborEntries: row.laborEntries.map(WorkOrderMapper.toLaborEntry),
      partUsages: row.partUsages.map(WorkOrderMapper.toPartUsage),
      attachments: row.attachments.map(WorkOrderMapper.toAttachment),
      ...(row.description !== null && { description: row.description }),
      ...(row.parentId !== null && { parentWorkOrderId: new WorkOrderId(row.parentId) }),
      ...(row.failureCodeId !== null && { failureCodeId: row.failureCodeId }),
      ...(row.slaDeadline !== null && { slaDeadline: row.slaDeadline }),
      ...(row.resolution !== null && { resolution: row.resolution }),
      ...(row.startedAt !== null && { startedAt: row.startedAt }),
      ...(row.completedAt !== null && { completedAt: row.completedAt }),
      // cancelledAt: not stored in schema — see module docstring
    }

    return WorkOrder.reconstitute(props)
  }

  /** Map a slim Prisma row (no relations) to the domain aggregate with empty collections. */
  static toDomainSlim(row: PrismaWorkOrderRowSlim): WorkOrder {
    const props: WorkOrderProps = {
      id: new WorkOrderId(row.id),
      tenantId: row.tenantId,
      woNumber: row.woNumber,
      title: row.title,
      type: row.type as WOType,
      priority: Priority.from(row.priority),
      status: WorkOrderStatus.from(row.status),
      assetId: row.assetId,
      createdById: row.createdById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      assigneeIds: row.assigneeIds,
      ...(row.description !== null && { description: row.description }),
      ...(row.parentId !== null && { parentWorkOrderId: new WorkOrderId(row.parentId) }),
      ...(row.failureCodeId !== null && { failureCodeId: row.failureCodeId }),
      ...(row.slaDeadline !== null && { slaDeadline: row.slaDeadline }),
      ...(row.resolution !== null && { resolution: row.resolution }),
      ...(row.startedAt !== null && { startedAt: row.startedAt }),
      ...(row.completedAt !== null && { completedAt: row.completedAt }),
    }

    return WorkOrder.reconstitute(props)
  }

  // ── Domain → Prisma ────────────────────────────────────────────────────────

  /**
   * Build the `create` payload for a new work order.
   * All required columns are included; optional columns are only set when present.
   */
  static toCreateInput(wo: WorkOrder): Prisma.WorkOrderUncheckedCreateInput {
    return {
      id: wo.id.value,
      tenantId: wo.tenantId,
      woNumber: wo.woNumber,
      title: wo.title,
      type: wo.type as WOType,
      priority: wo.priority.value as PrismaPriority,
      status: wo.status.value as WOStatus,
      assetId: wo.assetId,
      assigneeIds: [...wo.assigneeIds],
      createdById: wo.createdById,
      createdAt: wo.createdAt,
      updatedAt: wo.updatedAt,
      ...(wo.description !== undefined && { description: wo.description }),
      ...(wo.parentWorkOrderId !== undefined && { parentId: wo.parentWorkOrderId.value }),
      ...(wo.failureCodeId !== undefined && { failureCodeId: wo.failureCodeId }),
      ...(wo.slaDeadline !== undefined && { slaDeadline: wo.slaDeadline }),
      ...(wo.resolution !== undefined && { resolution: wo.resolution }),
      ...(wo.startedAt !== undefined && { startedAt: wo.startedAt }),
      ...(wo.completedAt !== undefined && { completedAt: wo.completedAt }),
    }
  }

  /**
   * Build the `update` payload for an existing work order.
   * Only the mutable fields that the domain can change are included —
   * identity fields (tenantId, woNumber, createdAt) are never overwritten.
   */
  static toUpdateInput(wo: WorkOrder): Prisma.WorkOrderUncheckedUpdateInput {
    return {
      title: wo.title,
      priority: wo.priority.value as PrismaPriority,
      status: wo.status.value as WOStatus,
      assigneeIds: [...wo.assigneeIds],
      updatedAt: wo.updatedAt,
      ...(wo.description !== undefined && { description: wo.description }),
      ...(wo.failureCodeId !== undefined && { failureCodeId: wo.failureCodeId }),
      ...(wo.resolution !== undefined && { resolution: wo.resolution }),
      ...(wo.startedAt !== undefined && { startedAt: wo.startedAt }),
      ...(wo.completedAt !== undefined && { completedAt: wo.completedAt }),
    }
  }

  // ── Relation mappers ───────────────────────────────────────────────────────

  private static toLaborEntry(row: Prisma.LaborEntryGetPayload<Record<string, never>>): LaborEntry {
    const hours = Number(row.hours)
    const rate = new Money(row.ratePerHour, BASE_CURRENCY)

    return {
      id: row.id,
      technicianId: row.technicianId,
      date: row.date,
      cost: new LaborCost(hours, rate),
      description: row.description ?? undefined,
    }
  }

  private static toPartUsage(row: Prisma.PartUsageGetPayload<Record<string, never>>): PartUsage {
    return {
      id: row.id,
      partId: row.partId,
      quantity: row.quantity,
      unitCost: new Money(row.unitCost, BASE_CURRENCY),
      usedAt: row.usedAt,
    }
  }

  private static toAttachment(row: Prisma.AttachmentGetPayload<Record<string, never>>): Attachment {
    return {
      id: row.id,
      fileName: row.fileName,
      storageKey: row.storageKey,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      uploadedById: row.uploadedById,
      uploadedAt: row.createdAt,
    }
  }
}
