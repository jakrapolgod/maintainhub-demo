/**
 * Shared types for all work-order query handlers.
 *
 * ## Design decisions
 *
 * • `QueryContext` is intentionally separate from `CommandContext`.  Queries
 *   only need identity + tenant; they never write, so audit helpers are absent.
 *
 * • All "detail" and "summary" shapes are plain DTOs (no domain objects).
 *   Query handlers never load the aggregate root — they project raw Prisma rows
 *   directly to DTO types for maximum read performance.
 *
 * • Redis key helpers live here so every handler uses the same key format.
 *   Cache keys are always scoped to the tenantId to prevent cross-tenant leaks.
 */
import type { Redis } from 'ioredis'

// ── Query execution context ───────────────────────────────────────────────────

export interface QueryContext {
  executingUserId: string
  tenantId: string
  userRole: string
}

// ── Shared sub-shapes ─────────────────────────────────────────────────────────

export interface UserStub {
  id: string
  name: string
  avatarUrl: string | null
}

export interface LaborEntryDto {
  id: string
  technicianId: string
  technicianName: string
  date: string // ISO date string YYYY-MM-DD
  hours: number
  ratePerHour: number
  totalCost: number
  description: string | null
}

export interface PartUsageDto {
  id: string
  partId: string
  partNumber: string
  partName: string
  quantity: number
  unitCost: number
  totalCost: number
  usedAt: string
}

export interface AttachmentDto {
  id: string
  fileName: string
  fileSize: number
  mimeType: string
  storageKey: string
  thumbnailKey: string | null
  uploadedById: string
  uploadedByName: string
  uploadedAt: string
}

export interface CommentDto {
  id: string
  body: string
  authorId: string
  authorName: string
  authorAvatarUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface AuditEntryDto {
  id: string
  action: string
  userId: string | null
  userName: string | null
  before: unknown
  after: unknown
  ipAddress: string | null
  createdAt: string
}

// ── GetWorkOrder ──────────────────────────────────────────────────────────────

export interface WorkOrderDetail {
  id: string
  woNumber: string
  title: string
  description: string | null
  type: string
  priority: string
  status: string
  assetId: string
  assetName: string
  assetLocation: string | null
  parentId: string | null
  assigneeIds: string[]
  assignees: UserStub[]
  dueDate: string | null
  slaDeadline: string | null
  startedAt: string | null
  completedAt: string | null
  failureCodeId: string | null
  failureCodeName: string | null
  resolution: string | null
  totalLaborCost: number | null
  totalPartsCost: number | null
  laborEntries: LaborEntryDto[]
  partUsages: PartUsageDto[]
  attachments: AttachmentDto[]
  comments: CommentDto[]
  auditTrail: AuditEntryDto[]
  createdById: string
  createdByName: string
  createdAt: string
  updatedAt: string
}

// ── ListWorkOrders ────────────────────────────────────────────────────────────

export type SortField = 'createdAt' | 'priority' | 'dueDate' | 'woNumber'

export interface WorkOrderSummary {
  id: string
  woNumber: string
  title: string
  type: string
  priority: string
  status: string
  assetId: string
  assetName: string
  assigneeIds: string[]
  assignees: UserStub[]
  dueDate: string | null
  slaDeadline: string | null
  completedAt: string | null
  totalLaborCost: number | null
  totalPartsCost: number | null
  createdAt: string
  updatedAt: string
}

export interface ListWorkOrdersResult {
  items: WorkOrderSummary[]
  total: number
  nextCursor: string | null
}

// ── GetWorkOrderMetrics ───────────────────────────────────────────────────────

export interface WorkOrderMetrics {
  byStatus: Record<string, number>
  byPriority: Record<string, number>
  overdueCount: number
  /** Average completion time in hours (null when no completed WOs in period). */
  avgCompletionHours: number | null
  /** Sum of totalLaborCost + totalPartsCost for WOs completed this calendar month. */
  totalCostThisMonth: number
}

// ── GetWorkOrderCalendar ──────────────────────────────────────────────────────

export interface CalendarWorkOrder {
  id: string
  woNumber: string
  title: string
  type: string
  priority: string
  status: string
  assetId: string
  assetName: string
}

export interface PMDueEntry {
  scheduleId: string
  title: string
  assetId: string
  assetName: string
}

export interface CalendarDayEntry {
  date: string // YYYY-MM-DD
  workOrders: CalendarWorkOrder[]
  pmDue: PMDueEntry[]
}

export interface WorkOrderCalendar {
  /** Inclusive start of the range queried (YYYY-MM-DD). */
  from: string
  /** Inclusive end of the range queried (YYYY-MM-DD). */
  to: string
  days: CalendarDayEntry[]
}

// ── Redis cache helpers ───────────────────────────────────────────────────────

const LIST_TTL_SECONDS = 30

/**
 * Redis key for the ListWorkOrders result cache.
 * Key is scoped to tenantId and a hash of the query parameters so different
 * filter/sort/page combinations each get their own cache entry.
 */
export function listCacheKey(tenantId: string, paramsHash: string): string {
  return `wo:list:${tenantId}:${paramsHash}`
}

/** Pattern used for cache invalidation — matches all ListWorkOrders keys for a tenant. */
export function listCachePattern(tenantId: string): string {
  return `wo:list:${tenantId}:*`
}

export { LIST_TTL_SECONDS }

/**
 * Write a JSON value to Redis with the list TTL.
 * Non-fatal: errors are swallowed so cache failures never break reads.
 */
export async function cacheSet(redis: Redis, key: string, value: unknown): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', LIST_TTL_SECONDS)
  } catch {
    // Cache write failures are non-fatal
  }
}

/**
 * Read a JSON value from Redis.
 * Returns `null` on cache miss or error.
 */
export async function cacheGet<T>(redis: Redis, key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key)
    return raw !== null ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

/**
 * Invalidate all ListWorkOrders cache entries for a tenant.
 * Called after any mutation that changes the tenant's WO list.
 * Non-fatal: errors are swallowed.
 *
 * Uses KEYS rather than SCAN because the number of per-tenant cache entries
 * is bounded (30s TTL × ~100 distinct filter combinations at most), so KEYS
 * is safe here and avoids the no-await-in-loop footgun of cursor iteration.
 */
export async function invalidateListCache(redis: Redis, tenantId: string): Promise<void> {
  try {
    const keys = await redis.keys(listCachePattern(tenantId))
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  } catch {
    // Cache invalidation failures are non-fatal
  }
}

/**
 * Deterministic hash for a query-params object.
 * Uses JSON.stringify with sorted keys to ensure identical params always
 * produce the same hash regardless of key insertion order.
 *
 * Avoids bitwise ops by using modulo arithmetic — sufficient for cache keys.
 */
export function hashParams(params: unknown): string {
  const sorted = JSON.stringify(params, (_, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort())
      : v,
  )
  const MOD = 2_147_483_647 // Mersenne prime
  let hash = 0
  for (let i = 0; i < sorted.length; i += 1) {
    hash = (hash * 31 + sorted.charCodeAt(i)) % MOD
  }
  return hash.toString(36)
}
