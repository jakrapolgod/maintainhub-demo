import { DomainException } from '../../errors/domain.exception.js'

// ── CUID validation ───────────────────────────────────────────────────────────

/**
 * Prisma v5 generates CUID v1 by default.
 *
 * CUID v1 shape: 'c' + 8-char timestamp + 4-char counter +
 *               4-char fingerprint + 8-char random = 25 chars total.
 * All characters are lowercase alphanumeric.
 *
 * Examples:
 *   clh7z2d1h0000z1x1z1x1z1x1  ← valid
 *   cm9pq3r2i0000ymbj1nhq1zr2  ← valid (Prisma v5 output)
 *
 * The regex accepts both CUID v1 (c + 24 chars) and CUID v2 (any letter + 23 chars)
 * to remain forward-compatible with Prisma's cuidv2() option.
 */
const CUID_REGEX = /^c[0-9a-z]{24}$|^[a-z][0-9a-z]{23}$/

// ── Value object ──────────────────────────────────────────────────────────────

/**
 * Strongly-typed work order identifier.
 *
 * Wraps a raw string and validates it conforms to CUID format before use.
 * Using a named type prevents accidentally passing a plain string (or another
 * entity's ID) where a WorkOrderId is expected.
 */
export class WorkOrderId {
  readonly value: string

  constructor(value: string) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new DomainException('WorkOrderId must be a non-empty string', 'INVALID_WORK_ORDER_ID')
    }

    if (!CUID_REGEX.test(value)) {
      throw new DomainException(
        `"${value}" is not a valid CUID (expected lowercase alphanumeric, 24–25 chars starting with a letter)`,
        'INVALID_WORK_ORDER_ID',
      )
    }

    this.value = value
    Object.freeze(this)
  }

  // ── Equality ────────────────────────────────────────────────────────────────

  /** Two WorkOrderIds are equal when their underlying string values are identical. */
  equals(other: WorkOrderId): boolean {
    return this.value === other.value
  }

  // ── Convenience ─────────────────────────────────────────────────────────────

  toString(): string {
    return this.value
  }
}
