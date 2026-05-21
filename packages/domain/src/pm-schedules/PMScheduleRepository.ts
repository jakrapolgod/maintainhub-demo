import type { PMSchedule } from './PMSchedule.js'
import type { PMScheduleId } from './value-objects/pm-schedule-id.js'

/**
 * Port (interface) for PM-schedule persistence.
 *
 * Implementations live in the infrastructure layer (e.g. PrismaPMScheduleRepository).
 * The domain depends only on this interface, never on Prisma directly.
 */
export interface PMScheduleRepository {
  // ── Standard CRUD ──────────────────────────────────────────────────────────

  /** Persist a new PM schedule. */
  save(schedule: PMSchedule): Promise<void>

  /** Update an existing PM schedule. */
  update(schedule: PMSchedule): Promise<void>

  /** Retrieve by ID (returns undefined if not found or soft-deleted). */
  findById(id: PMScheduleId, tenantId: string): Promise<PMSchedule | undefined>

  /** Soft-delete a PM schedule. */
  delete(id: PMScheduleId, tenantId: string): Promise<void>

  // ── Domain queries ─────────────────────────────────────────────────────────

  /**
   * Returns all active PM schedules that are due to be triggered at or before
   * `now` (accounting for advance-notice window).
   *
   * Implementations should filter by:
   *   isActive = true  AND
   *   nextDueAt - advanceNoticeDays <= now
   */
  /**
   * When `tenantId` is omitted, queries across ALL active tenants.
   * This cross-tenant form is only called by the background scheduler worker.
   */
  findDueForTrigger(now: Date, tenantId?: string): Promise<PMSchedule[]>

  /**
   * Returns all PM schedules linked to the given asset (active and inactive).
   */
  findByAsset(assetId: string, tenantId: string): Promise<PMSchedule[]>
}
