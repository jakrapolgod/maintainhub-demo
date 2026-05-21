import type { AssetId } from './value-objects/asset-id.js'
import type { AssetNumber } from './value-objects/asset-number.js'
import type { Asset } from './Asset.js'

// ── Filter shape ──────────────────────────────────────────────────────────────

/**
 * Filter bag for `findByFilters()`.  All fields are optional.
 */
export interface AssetFilters {
  /** Filter by one or more status values. */
  status?: string | string[]
  /** Filter by criticality level (A/B/C/D). */
  criticality?: string | string[]
  /** Return only assets in the given category (exact match). */
  categoryId?: string
  /** Return only assets at the given location. */
  locationId?: string
  /** Return only assets that are direct children of the given parent. */
  parentId?: string
  /** Full-text substring match on `name`, `assetNumber`, `serialNumber`. */
  search?: string
  /**
   * When `true`, return only assets that have at least one open (non-terminal)
   * work order.  When `false`, return only assets with no open work orders.
   * Omit to return all assets regardless of work order status.
   */
  hasOpenWOs?: boolean
  /** 1-based page number. @default 1 */
  page?: number
  /** Items per page. @default 20 */
  limit?: number
}

// ── Repository interface (Port) ───────────────────────────────────────────────

/**
 * Domain repository interface for the Asset aggregate.
 *
 * ## Invariants every implementation must satisfy
 *
 * 1. **Tenant isolation** — every read method accepts `tenantId` and MUST NOT
 *    return data belonging to a different tenant.
 *
 * 2. **Event dispatch** — `save()` persists the aggregate AND dispatches domain
 *    events via `asset.pullEvents()`.  Events are published after a successful
 *    DB write so subscribers never observe stale state.
 *
 * 3. **Asset number uniqueness** — `nextAssetNumber()` returns a globally
 *    unique number for the tenant.  Implementations should use a DB sequence
 *    or atomic counter.
 */
export interface AssetRepository {
  // ── Reads ───────────────────────────────────────────────────────────────────

  /**
   * Load a single asset by its primary ID.
   * Returns `null` when not found within the tenant.
   */
  findById(id: AssetId, tenantId: string): Promise<Asset | null>

  /**
   * Load an asset by its human-readable number (e.g. `AST-000042`).
   * Returns `null` when not found.
   */
  findByAssetNumber(number: AssetNumber, tenantId: string): Promise<Asset | null>

  /**
   * Return the direct children of `parentId` (one level deep only).
   * Does NOT recurse — use `findAncestors` for the upward path.
   */
  findChildren(parentId: AssetId, tenantId: string): Promise<Asset[]>

  /**
   * Return the ordered ancestor chain from this asset up to the root.
   *
   * Example:
   *   Asset hierarchy: Plant → Building → System → Equipment (this asset)
   *   Returns: [Building, Plant]  (closest ancestor first)
   *
   * Used by:
   *   - `Asset.setParent()` — caller passes the list of ancestor IDs for
   *     circular-reference detection.
   *   - Breadcrumb navigation in the UI.
   */
  findAncestors(id: AssetId, tenantId: string): Promise<Asset[]>

  /**
   * Return all assets in the given category (direct match on `categoryId`).
   * Does NOT traverse sub-categories.
   */
  findByCategory(categoryId: string, tenantId: string): Promise<Asset[]>

  /**
   * Return all assets at the given location.
   */
  findByLocation(locationId: string, tenantId: string): Promise<Asset[]>

  /**
   * Paginated, filterable asset query.
   *
   * @returns `items` — the current page; `total` — total matching records.
   */
  findByFilters(filters: AssetFilters, tenantId: string): Promise<{ items: Asset[]; total: number }>

  // ── Writes ──────────────────────────────────────────────────────────────────

  /**
   * Persist the aggregate (INSERT or UPDATE) and dispatch queued domain events.
   *
   * Implementations MUST:
   *   1. Write aggregate state to DB.
   *   2. Call `asset.pullEvents()` to drain the buffer.
   *   3. Publish each event (outbox table or message bus).
   */
  save(asset: Asset): Promise<void>

  // ── Utilities ───────────────────────────────────────────────────────────────

  /**
   * Generate the next sequential asset number for the tenant.
   *
   * Format: `AST-{NNNNNN}` (zero-padded 6-digit counter, no year reset).
   * Implementations must guarantee uniqueness under concurrent requests.
   */
  nextAssetNumber(tenantId: string): Promise<AssetNumber>

  /**
   * Returns `true` when the asset has at least one work order in a
   * non-terminal status (DRAFT, OPEN, IN_PROGRESS, ON_HOLD).
   *
   * Used by `Asset.decommission()` indirectly — the command handler queries
   * this before passing `hasOpenWOs` to the domain method.
   */
  hasOpenWorkOrders(assetId: AssetId, tenantId: string): Promise<boolean>
}
