/**
 * ListWorkOrdersHandler — paginated list with filters, sorting, and Redis cache.
 *
 * ## Pagination modes
 *
 * Page+limit:   page=1&limit=20   → returns { items, total, nextCursor: null }
 * Cursor-based: cursor=<opaque>   → returns { items, total, nextCursor? }
 *
 * The cursor encodes the last row's `createdAt` + `id` (JSON base64) so the
 * query can continue from that exact position with a keyset WHERE clause.
 * Cursor pagination is recommended for infinite scroll; page+limit for
 * data-grid views where the user jumps to a specific page.
 *
 * ## Caching
 *
 * Results are cached in Redis with a 30-second TTL keyed by tenantId + a
 * deterministic hash of query parameters.  Any mutation to a tenant's work
 * orders must call `invalidateListCache(redis, tenantId)`.
 */
import type { Prisma, PrismaClient, Priority, WOStatus, WOType } from '@prisma/client'
import type { Redis } from 'ioredis'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { cacheGet, cacheSet, hashParams, listCacheKey } from './query.types.js'
import type {
  QueryContext,
  SortField,
  WorkOrderSummary,
  ListWorkOrdersResult,
  UserStub,
} from './query.types.js'

// ── Query ─────────────────────────────────────────────────────────────────────

export interface ListWorkOrdersQuery {
  // Filters
  status?: string[]
  priority?: string[]
  type?: string[]
  assetId?: string
  assigneeId?: string
  /** Filter WOs whose createdAt or dueDate falls within [from, to] */
  dateFrom?: string // ISO datetime
  dateTo?: string // ISO datetime
  /** Full-text search against title, description, woNumber */
  search?: string

  // Sorting
  sortBy?: SortField
  sortDir?: 'asc' | 'desc'

  // Pagination — mutually exclusive: use either page+limit or cursor
  page?: number
  limit?: number
  cursor?: string
}

// ── Cursor encoding ───────────────────────────────────────────────────────────

interface CursorPayload {
  createdAt: string
  id: string
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorPayload
  } catch {
    return null
  }
}

// ── Priority sort order (CRITICAL > HIGH > MEDIUM > LOW) ─────────────────────

const PRIORITY_ORDER: Record<string, number> = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class ListWorkOrdersHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  private readonly redis: Redis

  constructor(db: TenantClient, prisma: PrismaClient, redis: Redis) {
    this.db = db
    this.prisma = prisma
    this.redis = redis
  }

  async handle(query: ListWorkOrdersQuery, ctx: QueryContext): Promise<ListWorkOrdersResult> {
    // ── 1. Check cache ────────────────────────────────────────────────────────
    const key = listCacheKey(ctx.tenantId, hashParams({ ...query, tenantId: ctx.tenantId }))
    const cached = await cacheGet<ListWorkOrdersResult>(this.redis, key)
    if (cached !== null) return cached

    // ── 2. Build WHERE clause ─────────────────────────────────────────────────
    const where: Prisma.WorkOrderWhereInput = { deletedAt: null }

    if (query.status && query.status.length > 0) {
      where.status = { in: query.status as WOStatus[] }
    }
    if (query.priority && query.priority.length > 0) {
      where.priority = { in: query.priority as Priority[] }
    }
    if (query.type && query.type.length > 0) {
      where.type = { in: query.type as WOType[] }
    }
    if (query.assetId) {
      where.assetId = query.assetId
    }
    if (query.assigneeId) {
      where.assigneeIds = { has: query.assigneeId }
    }
    if (query.dateFrom ?? query.dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {}
      if (query.dateFrom) dateFilter.gte = new Date(query.dateFrom)
      if (query.dateTo) dateFilter.lte = new Date(query.dateTo)
      where.OR = [{ createdAt: dateFilter }, { dueDate: dateFilter }]
    }
    if (query.search) {
      const term = query.search.trim()
      where.AND = [
        {
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
            { woNumber: { contains: term, mode: 'insensitive' } },
          ],
        },
      ]
    }

    // ── 3. Build ORDER BY ─────────────────────────────────────────────────────
    const dir: Prisma.SortOrder = query.sortDir ?? 'desc'

    const orderBy: Prisma.WorkOrderOrderByWithRelationInput[] = (() => {
      switch (query.sortBy) {
        case 'priority':
          // Priority sort requires application-level ordering (enum not ordered)
          // We use createdAt as a tiebreaker after in-memory sort
          return [{ createdAt: dir }]
        case 'dueDate':
          return [{ dueDate: dir }, { createdAt: 'desc' as const }]
        case 'woNumber':
          return [{ woNumber: dir }]
        default:
          return [{ createdAt: dir }]
      }
    })()

    // ── 4. Determine pagination ───────────────────────────────────────────────
    const limit = Math.min(query.limit ?? 20, 100)
    const useCursor = query.cursor !== undefined

    if (useCursor) {
      const payload = decodeCursor(query.cursor!)
      if (payload) {
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : []),
          {
            OR: [
              { createdAt: { lt: new Date(payload.createdAt) } },
              { createdAt: new Date(payload.createdAt), id: { gt: payload.id } },
            ],
          },
        ]
      }
    }

    const skip = useCursor ? 0 : ((query.page ?? 1) - 1) * limit

    // ── 5. Execute queries in parallel ────────────────────────────────────────
    const [rows, total] = await Promise.all([
      this.db.workOrder.findMany({
        where,
        orderBy,
        skip,
        take: limit + 1, // fetch one extra to determine nextCursor
        select: {
          id: true,
          woNumber: true,
          title: true,
          type: true,
          priority: true,
          status: true,
          assetId: true,
          assigneeIds: true,
          dueDate: true,
          slaDeadline: true,
          completedAt: true,
          totalLaborCost: true,
          totalPartsCost: true,
          createdAt: true,
          updatedAt: true,
          asset: { select: { id: true, name: true } },
        },
      }),
      this.db.workOrder.count({ where }),
    ])

    // ── 6. Determine nextCursor ───────────────────────────────────────────────
    let nextCursor: string | null = null
    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows

    if (hasMore) {
      const last = items[items.length - 1]
      if (last) {
        nextCursor = encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
      }
    }

    // ── 7. Collect unique assignee IDs across the page ────────────────────────
    const allAssigneeIds = [...new Set(items.flatMap((r) => r.assigneeIds))]
    const userMap = new Map<string, UserStub>()

    if (allAssigneeIds.length > 0) {
      const users = await this.db.user.findMany({
        where: { id: { in: allAssigneeIds }, deletedAt: null },
        select: { id: true, name: true, avatarUrl: true },
      })
      for (const u of users) {
        userMap.set(u.id, { id: u.id, name: u.name, avatarUrl: u.avatarUrl ?? null })
      }
    }

    // ── 8. Apply priority sort in memory if requested ─────────────────────────
    let sortedItems = items
    if (query.sortBy === 'priority') {
      sortedItems = [...items].sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 99
        const pb = PRIORITY_ORDER[b.priority] ?? 99
        if (pa !== pb) return dir === 'asc' ? pa - pb : pb - pa
        return b.createdAt.getTime() - a.createdAt.getTime()
      })
    }

    // ── 9. Project to DTOs ────────────────────────────────────────────────────
    const summaries: WorkOrderSummary[] = sortedItems.map((r) => ({
      id: r.id,
      woNumber: r.woNumber,
      title: r.title,
      type: r.type,
      priority: r.priority,
      status: r.status,
      assetId: r.assetId,
      assetName: r.asset.name,
      assigneeIds: r.assigneeIds,
      assignees: r.assigneeIds.map(
        (id) => userMap.get(id) ?? { id, name: 'Unknown', avatarUrl: null },
      ),
      dueDate: r.dueDate?.toISOString() ?? null,
      slaDeadline: r.slaDeadline?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
      totalLaborCost: r.totalLaborCost !== null ? Number(r.totalLaborCost) : null,
      totalPartsCost: r.totalPartsCost !== null ? Number(r.totalPartsCost) : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }))

    const result: ListWorkOrdersResult = { items: summaries, total, nextCursor }

    // ── 10. Write to cache ────────────────────────────────────────────────────
    await cacheSet(this.redis, key, result)

    return result
  }
}
