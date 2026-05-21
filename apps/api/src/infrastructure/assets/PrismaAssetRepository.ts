/**
 * PrismaAssetRepository — PostgreSQL-backed implementation of `AssetRepository`.
 *
 * ## Key design decisions
 *
 * ### findAncestors — recursive CTE
 * Uses a PostgreSQL `WITH RECURSIVE` query because Prisma's ORM layer has no
 * native support for recursive tree traversal.  The raw SQL is issued via
 * `$queryRaw` with parameterised input; the returned rows are mapped through
 * `AssetMapper.toDomainSlim`.
 *
 * ### hasOpenWorkOrders
 * Issues a COUNT query restricted to non-terminal WO statuses.  Returns a
 * boolean so the command handler can pass `hasOpenWOs` to `Asset.decommission()`
 * without coupling the aggregate to the repository.
 *
 * ### Event publishing
 * Reuses the same BullMQ pattern as `PrismaWorkOrderRepository`: events are
 * enqueued **after** the DB write succeeds.
 *
 * ### nextAssetNumber
 * Uses a per-tenant PostgreSQL sequence (same pattern as nextWONumber) for
 * race-free sequential numbering.
 */
import { randomUUID } from 'node:crypto'
import type {
  Prisma,
  PrismaClient,
  AssetStatus as PrismaAssetStatus,
  Criticality as PrismaCriticality,
  WOStatus,
} from '@prisma/client'
import { Queue } from 'bullmq'
import type IORedis from 'ioredis'
import type {
  Asset,
  AssetFilters,
  AssetId,
  AssetNumber,
  AssetRepository,
  DomainEvent,
} from '@maintainhub/domain'
import { AssetNumber as AssetNumberVO } from '@maintainhub/domain'
import { AssetMapper } from './AssetMapper.js'
import type { PrismaAssetRowSlim } from './AssetMapper.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const DOMAIN_EVENTS_QUEUE = 'domain-events'

/** Terminal WO statuses — an asset has open WOs when any row is NOT in this set. */
const TERMINAL_WO_STATUSES: WOStatus[] = ['COMPLETED', 'CANCELLED']

/** Include clause for full aggregate hydration. */
const INCLUDE_FULL = { attachments: true } as const

/** Select clause for list/slim queries. */
const SELECT_SLIM = {
  id: true,
  tenantId: true,
  assetNumber: true,
  name: true,
  description: true,
  categoryId: true,
  parentId: true,
  locationId: true,
  criticality: true,
  status: true,
  manufacturer: true,
  model: true,
  serialNumber: true,
  installDate: true,
  warrantyExpiry: true,
  customFields: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const

// ── Repository ────────────────────────────────────────────────────────────────

export class PrismaAssetRepository implements AssetRepository {
  private readonly prisma: PrismaClient

  private readonly redis: IORedis

  private queue: Queue | undefined

  constructor(prisma: PrismaClient, redis: IORedis) {
    this.prisma = prisma
    this.redis = redis
  }

  // ── findById ───────────────────────────────────────────────────────────────

  async findById(id: AssetId, tenantId: string): Promise<Asset | null> {
    const row = await this.prisma.asset.findFirst({
      where: { id: id.value, tenantId, deletedAt: null },
      include: INCLUDE_FULL,
    })
    return row ? AssetMapper.toDomain(row) : null
  }

  // ── findByAssetNumber ──────────────────────────────────────────────────────

  async findByAssetNumber(number: AssetNumber, tenantId: string): Promise<Asset | null> {
    const row = await this.prisma.asset.findFirst({
      where: { assetNumber: number.value, tenantId, deletedAt: null },
      include: INCLUDE_FULL,
    })
    return row ? AssetMapper.toDomain(row) : null
  }

  // ── findChildren ───────────────────────────────────────────────────────────

  /**
   * Returns direct children only (one level deep).
   * Ordered by `assetNumber` ASC so the UI renders a stable sorted list.
   */
  async findChildren(parentId: AssetId, tenantId: string): Promise<Asset[]> {
    const rows = await this.prisma.asset.findMany({
      where: { parentId: parentId.value, tenantId, deletedAt: null },
      select: SELECT_SLIM,
      orderBy: { assetNumber: 'asc' },
    })
    return rows.map((r) => AssetMapper.toDomainSlim(r))
  }

  // ── findAncestors ──────────────────────────────────────────────────────────

  /**
   * Returns the full ancestor chain from root to the asset's direct parent.
   *
   * Uses a PostgreSQL recursive CTE because Prisma has no native tree-walk.
   * The CTE starts at the asset itself then walks UP via `parent_id`:
   *
   * ```sql
   * WITH RECURSIVE ancestors AS (
   *   SELECT * FROM assets WHERE id = $1
   *   UNION ALL
   *   SELECT a.* FROM assets a JOIN ancestors anc ON a.id = anc.parent_id
   * )
   * SELECT * FROM ancestors WHERE id <> $1 AND tenant_id = $2 AND deleted_at IS NULL
   * ORDER BY asset_number ASC
   * ```
   *
   * The result excludes the asset itself and includes only same-tenant rows.
   * Rows are returned in order from root to direct parent (ascending depth).
   */
  async findAncestors(id: AssetId, tenantId: string): Promise<Asset[]> {
    // Prisma generates the PostgreSQL table as "Asset" (quoted, PascalCase).
    // Unquoted `assets` would silently resolve to a non-existent relation.
    const rows = await this.prisma.$queryRaw<PrismaAssetRowSlim[]>`
      WITH RECURSIVE ancestors AS (
        SELECT
          id, "tenantId", "assetNumber", name, description,
          "categoryId", "parentId", "locationId", criticality,
          status, manufacturer, model, "serialNumber",
          "installDate", "warrantyExpiry", "customFields",
          "createdAt", "updatedAt", "deletedAt"
        FROM "Asset"
        WHERE id = ${id.value}

        UNION ALL

        SELECT
          a.id, a."tenantId", a."assetNumber", a.name, a.description,
          a."categoryId", a."parentId", a."locationId", a.criticality,
          a.status, a.manufacturer, a.model, a."serialNumber",
          a."installDate", a."warrantyExpiry", a."customFields",
          a."createdAt", a."updatedAt", a."deletedAt"
        FROM "Asset" a
        JOIN ancestors anc ON a.id = anc."parentId"
      )
      SELECT * FROM ancestors
      WHERE id <> ${id.value}
        AND "tenantId" = ${tenantId}
        AND "deletedAt" IS NULL
      ORDER BY "assetNumber" ASC
    `
    return rows.map((r) => AssetMapper.toDomainSlim(r))
  }

  // ── findByCategory ─────────────────────────────────────────────────────────

  async findByCategory(categoryId: string, tenantId: string): Promise<Asset[]> {
    const rows = await this.prisma.asset.findMany({
      where: { categoryId, tenantId, deletedAt: null },
      select: SELECT_SLIM,
      orderBy: { assetNumber: 'asc' },
    })
    return rows.map((r) => AssetMapper.toDomainSlim(r))
  }

  // ── findByLocation ─────────────────────────────────────────────────────────

  async findByLocation(locationId: string, tenantId: string): Promise<Asset[]> {
    const rows = await this.prisma.asset.findMany({
      where: { locationId, tenantId, deletedAt: null },
      select: SELECT_SLIM,
      orderBy: { assetNumber: 'asc' },
    })
    return rows.map((r) => AssetMapper.toDomainSlim(r))
  }

  // ── findByFilters ──────────────────────────────────────────────────────────

  /**
   * Paginated, multi-criteria asset search.
   *
   * Supported filters:
   *   • `search`      — case-insensitive ILIKE on name, assetNumber, serialNumber
   *   • `categoryId`  — exact match
   *   • `locationId`  — exact match
   *   • `status`      — one or many AssetStatus values
   *   • `criticality` — one or many Criticality values (A/B/C/D)
   *   • `hasOpenWOs`  — true/false filter via correlated EXISTS sub-query
   *   • `page`/`limit`— pagination (1-based, default 1/20)
   */
  async findByFilters(
    filters: AssetFilters,
    tenantId: string,
  ): Promise<{ items: Asset[]; total: number }> {
    const where = PrismaAssetRepository.buildWhereClause(filters, tenantId)

    // hasOpenWOs requires a subquery that Prisma cannot express natively.
    // We split the query: first get matching IDs, then fetch full rows.
    if (filters.hasOpenWOs !== undefined) {
      return this.findByFiltersWithOpenWOsFilter(filters, tenantId, where)
    }

    const page = filters.page ?? 1
    const limit = filters.limit ?? 20
    const skip = (page - 1) * limit

    const [rows, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        select: SELECT_SLIM,
        orderBy: [{ criticality: 'asc' }, { assetNumber: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.asset.count({ where }),
    ])

    return {
      items: rows.map((r) => AssetMapper.toDomainSlim(r)),
      total,
    }
  }

  // ── save ───────────────────────────────────────────────────────────────────

  async save(asset: Asset): Promise<void> {
    await this.prisma.asset.upsert({
      where: { id: asset.id.value },
      create: AssetMapper.toCreateInput(asset),
      update: AssetMapper.toUpdateInput(asset),
    })

    const events = asset.pullEvents()
    if (events.length > 0) {
      await this.publishDomainEvents(events)
    }
  }

  // ── nextAssetNumber ────────────────────────────────────────────────────────

  /**
   * Generate the next sequential asset number for the tenant.
   *
   * Uses a per-tenant PostgreSQL sequence for atomic, race-free numbering.
   * Format: `AST-{NNNNNN}` (zero-padded 6-digit counter, no year reset).
   */
  async nextAssetNumber(tenantId: string): Promise<AssetNumber> {
    const safeTenantId = tenantId.replace(/[^a-z0-9]/g, '')
    const seqName = `asset_seq_${safeTenantId}`

    await this.prisma.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS "${seqName}" START 1 INCREMENT 1 MINVALUE 1 MAXVALUE 999999 NO CYCLE`,
    )

    const rows = await this.prisma.$queryRawUnsafe<Array<{ nextval: bigint }>>(
      `SELECT nextval('"${seqName}"')`,
    )

    const seq = Number(rows[0]?.nextval ?? 1)
    return AssetNumberVO.fromSequence(seq)
  }

  // ── hasOpenWorkOrders ──────────────────────────────────────────────────────

  /**
   * Returns `true` when the asset has at least one work order whose status is
   * not COMPLETED or CANCELLED (i.e. DRAFT, OPEN, IN_PROGRESS, ON_HOLD).
   */
  async hasOpenWorkOrders(assetId: AssetId, tenantId: string): Promise<boolean> {
    const count = await this.prisma.workOrder.count({
      where: {
        assetId: assetId.value,
        tenantId,
        deletedAt: null,
        status: { notIn: TERMINAL_WO_STATUSES },
      },
    })
    return count > 0
  }

  // ── Private: hasOpenWOs branch ─────────────────────────────────────────────

  private async findByFiltersWithOpenWOsFilter(
    filters: AssetFilters,
    tenantId: string,
    baseWhere: Prisma.AssetWhereInput,
  ): Promise<{ items: Asset[]; total: number }> {
    const page = filters.page ?? 1
    const limit = filters.limit ?? 20
    const skip = (page - 1) * limit

    // Collect IDs of assets that have (or don't have) open work orders.
    const openWOAssetIds = await this.prisma.workOrder
      .findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: { notIn: TERMINAL_WO_STATUSES },
        },
        select: { assetId: true },
        distinct: ['assetId'],
      })
      .then((rows) => rows.map((r) => r.assetId))

    const enrichedWhere: Prisma.AssetWhereInput = {
      ...baseWhere,
      id: filters.hasOpenWOs ? { in: openWOAssetIds } : { notIn: openWOAssetIds },
    }

    const [rows, total] = await Promise.all([
      this.prisma.asset.findMany({
        where: enrichedWhere,
        select: SELECT_SLIM,
        orderBy: [{ criticality: 'asc' }, { assetNumber: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.asset.count({ where: enrichedWhere }),
    ])

    return {
      items: rows.map((r) => AssetMapper.toDomainSlim(r)),
      total,
    }
  }

  // ── Private: event publishing ──────────────────────────────────────────────

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

    await Promise.all(
      events.map((event) => {
        const jobId = 'eventId' in event ? String(event.eventId) : randomUUID()
        return this.queue!.add(event.eventType, JSON.parse(JSON.stringify(event)) as object, {
          jobId,
        })
      }),
    )
  }

  // ── Private: WHERE clause builder ─────────────────────────────────────────

  private static buildWhereClause(filters: AssetFilters, tenantId: string): Prisma.AssetWhereInput {
    const where: Prisma.AssetWhereInput = {
      tenantId,
      deletedAt: null,
    }

    // ── Status ────────────────────────────────────────────────────────────────

    if (filters.status !== undefined) {
      where.status = Array.isArray(filters.status)
        ? { in: filters.status as PrismaAssetStatus[] }
        : (filters.status as PrismaAssetStatus)
    }

    // ── Criticality ───────────────────────────────────────────────────────────

    if (filters.criticality !== undefined) {
      where.criticality = Array.isArray(filters.criticality)
        ? { in: filters.criticality as PrismaCriticality[] }
        : (filters.criticality as PrismaCriticality)
    }

    // ── Category ──────────────────────────────────────────────────────────────

    if (filters.categoryId !== undefined) {
      where.categoryId = filters.categoryId
    }

    // ── Location ──────────────────────────────────────────────────────────────

    if (filters.locationId !== undefined) {
      where.locationId = filters.locationId
    }

    // ── Parent ────────────────────────────────────────────────────────────────

    if (filters.parentId !== undefined) {
      where.parentId = filters.parentId
    }

    // ── Full-text search (ILIKE on name, assetNumber, serialNumber) ────────────

    if (filters.search !== undefined && filters.search.trim() !== '') {
      const term = filters.search.trim()
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { assetNumber: { contains: term, mode: 'insensitive' } },
        { serialNumber: { contains: term, mode: 'insensitive' } },
      ]
    }

    return where
  }
}
