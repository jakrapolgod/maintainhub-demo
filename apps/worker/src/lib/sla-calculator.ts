/**
 * SLA deadline calculator.
 *
 * Computes the SLA deadline for a work order given its priority and creation
 * timestamp, with optional per-tenant overrides stored in `Tenant.settings`.
 *
 * ## Default SLA hours
 *
 * | Priority | Hours | Typical meaning            |
 * |----------|-------|----------------------------|
 * | CRITICAL |   4   | Respond within hours        |
 * | HIGH     |   8   | Respond same day            |
 * | MEDIUM   |  24   | Respond within 1 day        |
 * | LOW      |  72   | Respond within 3 days       |
 *
 * ## Tenant overrides
 *
 * A tenant can store custom SLA hours in its `settings` JSON field:
 *
 * ```json
 * {
 *   "slaHours": {
 *     "CRITICAL": 2,
 *     "HIGH": 6,
 *     "MEDIUM": 12,
 *     "LOW": 48
 *   }
 * }
 * ```
 *
 * Only the priorities that appear in `slaHours` are overridden; others fall
 * back to the platform defaults.  Invalid values (non-positive, non-finite,
 * non-numeric) are silently ignored and the default is used instead.
 *
 * ## Timezone handling
 *
 * All arithmetic is performed in UTC milliseconds, so DST transitions and
 * server timezone settings have no effect on the result.  Pass the WO's
 * `createdAt` `Date` object (which is always UTC under the hood) and the
 * returned deadline is also a `Date` in UTC.
 */

import type { PriorityLevel } from '@maintainhub/domain'

// ── Default SLA hours ─────────────────────────────────────────────────────────

/** Platform-wide SLA response times.  Tenants may override these per-priority. */
export const DEFAULT_SLA_HOURS: Record<PriorityLevel, number> = {
  CRITICAL: 4,
  HIGH: 8,
  MEDIUM: 24,
  LOW: 72,
}

// ── Tenant settings shape ─────────────────────────────────────────────────────

/**
 * The SLA-specific portion of `Tenant.settings`.
 *
 * Full schema: `{ slaHours?: { CRITICAL?: number, HIGH?: number, ... } }`
 */
export interface TenantSlaSettings {
  /** Per-priority hour overrides.  Missing keys fall back to platform defaults. */
  slaHours?: Partial<Record<PriorityLevel, number>>
}

// ── Private helpers (declared before public API to satisfy no-use-before-define) ─

/** Returns the default SLA hours for a priority, with a safe fallback. */
function getDefaultHours(priority: PriorityLevel): number {
  // The ?? fallback is a defensive guard; all four PriorityLevels are defined in the map.
  /* istanbul ignore next */
  return DEFAULT_SLA_HOURS[priority] ?? DEFAULT_SLA_HOURS.MEDIUM
}

/** Type guard: plain object (not null, not array). */
function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

/** Type guard: a valid SLA hour value — positive finite number. */
function isValidHours(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val > 0
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute the SLA deadline for a work order.
 *
 * @param priority      Work order priority level.
 * @param createdAt     Timestamp when the work order was created.
 * @param tenantSettings  Raw `Tenant.settings` JSON value — safely parsed;
 *                       ignored if missing or malformed.
 * @returns             A `Date` exactly `slaHours` after `createdAt`.
 */
/**
 * Safely parse the `slaHours` sub-object from a tenant's settings JSON.
 *
 * Returns `undefined` when:
 *  - `settings` is not a plain object
 *  - `settings.slaHours` is absent or not a plain object
 *  - No valid numeric entry is present
 *
 * Invalid per-priority entries (negative, zero, NaN, Infinity, non-numeric)
 * are silently dropped so partial overrides still work.
 */
export function parseTenantSlaHours(
  settings: unknown,
): Partial<Record<PriorityLevel, number>> | undefined {
  if (!isPlainObject(settings)) return undefined

  const rawHours = (settings as Record<string, unknown>).slaHours
  if (!isPlainObject(rawHours)) return undefined

  const raw = rawHours as Record<string, unknown>
  const ALL_PRIORITIES: PriorityLevel[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
  const result: Partial<Record<PriorityLevel, number>> = {}
  let hasValid = false

  for (const priority of ALL_PRIORITIES) {
    const val = raw[priority]
    if (isValidHours(val)) {
      result[priority] = val
      hasValid = true
    }
  }

  return hasValid ? result : undefined
}

export function computeSlaDeadline(
  priority: PriorityLevel,
  createdAt: Date,
  tenantSettings?: unknown,
): Date {
  const overrideHours = parseTenantSlaHours(tenantSettings)
  const hours = overrideHours?.[priority] ?? getDefaultHours(priority)
  return new Date(createdAt.getTime() + hours * 3_600_000)
}

/**
 * Compute how many minutes a work order is overdue at a given reference time.
 * Returns 0 if the deadline has not yet passed.
 */
export function overdueMinutes(slaDeadline: Date, at: Date = new Date()): number {
  const diffMs = at.getTime() - slaDeadline.getTime()
  return diffMs > 0 ? Math.floor(diffMs / 60_000) : 0
}
