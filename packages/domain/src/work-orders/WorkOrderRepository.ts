import type { PriorityLevel } from './value-objects/priority.js'
import type { StatusValue } from './value-objects/work-order-status.js'
import type { WorkOrderId } from './value-objects/work-order-id.js'
import type { WorkOrder } from './WorkOrder.js'
import type { WOType } from './work-order.types.js'

// ── Filter shape ──────────────────────────────────────────────────────────────

/**
 * Filter bag accepted by `findByFilters()`.
 *
 * All fields are optional — omitting a field means "no filter on that dimension."
 * Multiple values in an array are treated as OR conditions.
 */
export interface WOFilters {
  /**
   * Filter by one or more statuses.
   * Example: `['OPEN', 'IN_PROGRESS']` returns both.
   */
  status?: StatusValue | StatusValue[]

  /**
   * Filter by one or more priority levels.
   */
  priority?: PriorityLevel | PriorityLevel[]

  /**
   * Filter by work order type.
   */
  type?: WOType | WOType[]

  /**
   * Return only WOs for a specific asset.
   */
  assetId?: string

  /**
   * Return only WOs where this user ID is in `assigneeIds`.
   */
  assigneeId?: string

  /**
   * Case-insensitive substring match on `title`.
   */
  search?: string

  /**
   * 1-based page number for offset pagination.
   * @default 1
   */
  page?: number

  /**
   * Maximum number of items per page.
   * @default 20
   */
  limit?: number

  /**
   * Exclude WOs created before this date.
   */
  from?: Date

  /**
   * Exclude WOs created after this date.
   */
  to?: Date
}

// ── Repository interface ──────────────────────────────────────────────────────

/**
 * Domain repository interface (Port) for the WorkOrder aggregate.
 *
 * This interface lives in the domain layer and declares WHAT operations the
 * persistence layer must support — it says nothing about HOW they are
 * implemented. Infrastructure packages provide the Adapter (e.g. the Prisma
 * implementation in `apps/api/src/repositories/`).
 *
 * ## Invariants every implementation must satisfy
 *
 * 1. **Tenant isolation** — every read method accepts `tenantId` and MUST NOT
 *    return data belonging to a different tenant.
 *
 * 2. **Event dispatch** — `save()` is responsible for persisting the aggregate
 *    AND dispatching its domain events. The caller should call
 *    `workOrder.pullEvents()` inside the implementation after the DB write
 *    succeeds. This ensures events are published only once the state change
 *    is durable (outbox or in-transaction publish).
 *
 * 3. **Idempotent `save()`** — whether the aggregate is new or dirty, `save()`
 *    produces the correct DB state. The implementation decides whether to use
 *    INSERT + ON CONFLICT UPDATE, or a check-then-insert pattern.
 *
 * 4. **WO number uniqueness** — `nextWONumber()` must produce a number that is
 *    unique within the tenant for the current calendar year.  Implementations
 *    should use a DB-level sequence or pessimistic lock to prevent races.
 */
export interface WorkOrderRepository {
  // ── Reads ───────────────────────────────────────────────────────────────────

  /**
   * Load a single work order by its primary ID.
   *
   * @returns The aggregate, or `null` if not found within the given tenant.
   */
  findById(id: WorkOrderId, tenantId: string): Promise<WorkOrder | null>

  /**
   * Load all work orders for a given asset, ordered by `createdAt` descending.
   * Includes all statuses (active and terminal).
   */
  findByAsset(assetId: string, tenantId: string): Promise<WorkOrder[]>

  /**
   * Load work orders where `userId` appears in `assigneeIds`.
   *
   * @param status Optional filter — when omitted, all statuses are returned.
   */
  findByAssignee(userId: string, tenantId: string, status?: StatusValue): Promise<WorkOrder[]>

  /**
   * Paginated, filterable query used by list endpoints.
   *
   * @returns `items` — the page of aggregates; `total` — the full count for the
   *          same filter (before pagination), used to build pagination metadata.
   */
  findByFilters(
    filters: WOFilters,
    tenantId: string,
  ): Promise<{ items: WorkOrder[]; total: number }>

  /**
   * Returns all work orders whose `slaDeadline` is in the past and whose status
   * is NOT terminal (COMPLETED or CANCELLED).
   *
   * Used by the SLA-breach scheduler to identify WOs that need escalation or
   * notification. The scheduler is responsible for emitting `SLABreachedEvent`.
   */
  findOverdueSLA(tenantId: string): Promise<WorkOrder[]>

  // ── Writes ──────────────────────────────────────────────────────────────────

  /**
   * Persist the aggregate (INSERT or UPDATE) and dispatch its domain events.
   *
   * Implementations MUST:
   *  1. Write the aggregate state to the DB.
   *  2. Call `workOrder.pullEvents()` to drain the event buffer.
   *  3. Publish each event to subscribers (outbox table, message bus, etc.).
   *
   * The events must be published **after** the DB write succeeds so that
   * subscribers always observe a state that is already durable.
   */
  save(workOrder: WorkOrder): Promise<void>

  /**
   * Soft-delete a work order by setting `deletedAt`.
   * Implementations should NOT physically remove the row — the WO is part
   * of the asset's maintenance history.
   */
  delete(id: WorkOrderId, tenantId: string): Promise<void>

  // ── Utilities ───────────────────────────────────────────────────────────────

  /**
   * Generate the next sequential work order number for the given tenant in the
   * current calendar year.
   *
   * Format: `WO-{YYYY}-{NNNNNN}` where `NNNNNN` is a zero-padded 6-digit
   * counter that resets each calendar year.
   *
   * Example: `WO-2024-000042`
   *
   * Implementations must guarantee uniqueness under concurrent requests.
   * Recommended approaches:
   *  - PostgreSQL sequence per tenant (`wo_seq_{tenantId}`)
   *  - `SELECT MAX(wo_number) ... FOR UPDATE` with increment
   *  - Redis atomic counter with yearly expiry
   */
  nextWONumber(tenantId: string): Promise<string>
}
