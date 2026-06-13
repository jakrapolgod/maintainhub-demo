import { randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient, Priority as PrismaPriority, WOStatus } from '@prisma/client'
import { Queue } from 'bullmq'
import type IORedis from 'ioredis'
import type {
  DomainEvent,
  StatusValue,
  WOFilters,
  WorkOrder,
  WorkOrderId,
  WorkOrderRepository,
} from '@maintainhub/domain'
import { WorkOrderMapper } from './WorkOrderMapper.js'

// ── Queue name ────────────────────────────────────────────────────────────────

/**
 * All work-order domain events land on this single BullMQ queue.
 * Workers consume jobs whose `name` field equals the `eventType` discriminant
 * (e.g. `WorkOrderCompleted`, `WorkOrderCancelled`).
 */
const DOMAIN_EVENTS_QUEUE = 'domain-events'

// ── Include clause ─────────────────────────────────────────────────────────────

/** Relations required to fully hydrate the aggregate. */
const INCLUDE = {
  laborEntries: true,
  partUsages: true,
  attachments: true,
} as const

/** Select clause for list queries (no heavy relations). */
const SELECT_SLIM = {
  id: true,
  tenantId: true,
  woNumber: true,
  title: true,
  description: true,
  type: true,
  priority: true,
  status: true,
  assetId: true,
  parentId: true,
  assigneeIds: true,
  dueDate: true,
  slaDeadline: true,
  startedAt: true,
  completedAt: true,
  failureCodeId: true,
  resolution: true,
  totalLaborCost: true,
  totalPartsCost: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const

// ── Repository ────────────────────────────────────────────────────────────────

export class PrismaWorkOrderRepository implements WorkOrderRepository {
  private readonly prisma: PrismaClient

  private readonly redis: IORedis

  /** Lazily-initialised BullMQ queue — created once and reused. */
  private queue: Queue | undefined

  constructor(prisma: PrismaClient, redis: IORedis) {
    this.prisma = prisma
    this.redis = redis
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  async findById(id: WorkOrderId, tenantId: string): Promise<WorkOrder | null> {
    const row = await this.prisma.workOrder.findFirst({
      where: { id: id.value, tenantId, deletedAt: null },
      include: INCLUDE,
    })
    return row ? WorkOrderMapper.toDomain(row) : null
  }

  async findByAsset(assetId: string, tenantId: string): Promise<WorkOrder[]> {
    const rows = await this.prisma.workOrder.findMany({
      where: { assetId, tenantId, deletedAt: null },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((r) => WorkOrderMapper.toDomain(r))
  }

  async findByAssignee(
    userId: string,
    tenantId: string,
    status?: StatusValue,
  ): Promise<WorkOrder[]> {
    const rows = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        deletedAt: null,
        assigneeIds: { has: userId },
        ...(status !== undefined && { status: status as WOStatus }),
      },
      include: INCLUDE,
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map((r) => WorkOrderMapper.toDomain(r))
  }

  async findByFilters(
    filters: WOFilters,
    tenantId: string,
  ): Promise<{ items: WorkOrder[]; total: number }> {
    const where = PrismaWorkOrderRepository.buildWhereClause(filters, tenantId)

    const page = filters.page ?? 1
    const limit = filters.limit ?? 20
    const skip = (page - 1) * limit

    const [rows, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        select: SELECT_SLIM,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.workOrder.count({ where }),
    ])

    return {
      items: rows.map((r) => WorkOrderMapper.toDomainSlim(r)),
      total,
    }
  }

  async findOverdueSLA(tenantId: string): Promise<WorkOrder[]> {
    const now = new Date()

    const rows = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        deletedAt: null,
        slaDeadline: { lt: now },
        status: { in: ['OPEN', 'IN_PROGRESS'] as WOStatus[] },
      },
      include: INCLUDE,
      orderBy: { slaDeadline: 'asc' },
    })

    return rows.map((r) => WorkOrderMapper.toDomain(r))
  }

  // ── Writes ────────────────────────────────────────────────────────────────

  /**
   * Persist the aggregate state (INSERT or UPDATE) then publish its domain events.
   *
   * The upsert uses the aggregate's `id` as the unique key.  When this is a
   * new aggregate, the row is inserted; for an existing one, only the mutable
   * scalar fields are overwritten (identity / tenant fields are unchanged).
   *
   * Events are published **after** the DB write succeeds so subscribers always
   * observe a state that is already durable.
   */
  async save(workOrder: WorkOrder): Promise<void> {
    await this.prisma.workOrder.upsert({
      where: { id: workOrder.id.value },
      create: WorkOrderMapper.toCreateInput(workOrder),
      update: WorkOrderMapper.toUpdateInput(workOrder),
    })

    const events = workOrder.pullEvents()

    if (events.length > 0) {
      await this.publishDomainEvents(events)
    }
  }

  async delete(id: WorkOrderId, tenantId: string): Promise<void> {
    // Soft-delete: set deletedAt; never physically removes the row because
    // the WO is part of the asset's immutable maintenance history.
    await this.prisma.workOrder.updateMany({
      where: { id: id.value, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    })
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  /**
   * Generate the next sequential WO number for a tenant in the current year.
   *
   * Uses a per-tenant-per-year PostgreSQL sequence for atomic, race-free
   * generation.  The sequence is created on first use (idempotent DDL).
   *
   * Format: `WO-{YYYY}-{NNNNNN}` (zero-padded 6-digit counter)
   * Example: `WO-2024-000042`
   */
  async nextWONumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear()
    // Only lowercase alphanumeric in CUID — safe as a PostgreSQL identifier.
    const safeTenantId = tenantId.replace(/[^a-z0-9]/g, '')
    const seqName = `wo_seq_${safeTenantId}_${year}`

    // DDL: create the sequence if it doesn't exist yet (idempotent).
    await this.prisma.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS "${seqName}" START 1 INCREMENT 1 MINVALUE 1 NO MAXVALUE NO CYCLE`,
    )

    const rows = await this.prisma.$queryRawUnsafe<Array<{ nextval: bigint }>>(
      `SELECT nextval('"${seqName}"')`,
    )

    const seq = Number(rows[0]?.nextval ?? 1)
    return `WO-${year}-${String(seq).padStart(6, '0')}`
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Publish domain events to the BullMQ queue.
   *
   * Each event becomes a separate job whose name is the event's `eventType`
   * discriminant.  If the event extends `BaseDomainEvent`, the `eventId` is
   * used as the job ID to guard against duplicate processing on retry.
   */
  private async publishDomainEvents(events: DomainEvent[]): Promise<void> {
    if (!this.queue) {
      this.queue = new Queue(DOMAIN_EVENTS_QUEUE, {
        connection: this.redis,
        defaultJobOptions: {
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      })
    }

    // Best-effort: if Redis doesn't support Streams (< 5.0) or BullMQ fails,
    // log the error but don't block the database write from completing.
    try {
      await Promise.all(
        events.map((event) => {
          // Use eventId (BaseDomainEvent) when available for idempotency.
          const jobId = 'eventId' in event ? String(event.eventId) : randomUUID()

          return this.queue!.add(
            event.eventType,
            // Serialise the full event payload as the job data.
            JSON.parse(JSON.stringify(event)) as object,
            { jobId },
          )
        }),
      )
    } catch (err) {
      // Redis version < 5.0 doesn't support XADD (Streams). Log and continue.
      // eslint-disable-next-line no-console
      console.warn(
        '[WO repo] Domain event publishing failed (queue unavailable) —',
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  /** Build the Prisma WHERE clause from WOFilters + mandatory tenant scoping. */
  private static buildWhereClause(
    filters: WOFilters,
    tenantId: string,
  ): Prisma.WorkOrderWhereInput {
    const where: Prisma.WorkOrderWhereInput = {
      tenantId,
      deletedAt: null,
    }

    // ── Status ──────────────────────────────────────────────────────────────

    if (filters.status !== undefined) {
      where.status = Array.isArray(filters.status)
        ? { in: filters.status as WOStatus[] }
        : (filters.status as WOStatus)
    }

    // ── Priority ─────────────────────────────────────────────────────────────

    if (filters.priority !== undefined) {
      where.priority = Array.isArray(filters.priority)
        ? { in: filters.priority as PrismaPriority[] }
        : (filters.priority as PrismaPriority)
    }

    // ── Type ──────────────────────────────────────────────────────────────────

    if (filters.type !== undefined) {
      where.type = Array.isArray(filters.type) ? { in: filters.type } : filters.type
    }

    // ── Asset ─────────────────────────────────────────────────────────────────

    if (filters.assetId !== undefined) {
      where.assetId = filters.assetId
    }

    // ── Assignee (GIN array contains check) ──────────────────────────────────

    if (filters.assigneeId !== undefined) {
      where.assigneeIds = { has: filters.assigneeId }
    }

    // ── Full-text search on title and description ─────────────────────────────
    // Uses ILIKE for case-insensitive substring matching.  For production-scale
    // full-text search, replace with a Meilisearch query or pg tsvector index.

    if (filters.search !== undefined && filters.search.trim() !== '') {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ]
    }

    // ── Date range on createdAt ────────────────────────────────────────────────

    if (filters.from !== undefined || filters.to !== undefined) {
      where.createdAt = {
        ...(filters.from !== undefined && { gte: filters.from }),
        ...(filters.to !== undefined && { lte: filters.to }),
      }
    }

    return where
  }
}
