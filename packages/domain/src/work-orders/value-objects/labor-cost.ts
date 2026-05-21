import { DomainException } from '../../errors/domain.exception.js'
import { type Money } from './money.js'

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Maximum hours per labour entry. A single entry cannot exceed one standard
 * work week (40 h) to guard against accidental data-entry errors.
 * The application layer may enforce a tighter limit (e.g. 24 h per entry).
 */
const MAX_HOURS = 40

// ── Value object ──────────────────────────────────────────────────────────────

/**
 * Cost of a single labour entry: hours worked × hourly rate.
 *
 * Invariants
 * ──────────
 *  • hours must be a positive, finite number (> 0)
 *  • hours must not exceed MAX_HOURS (40) per entry
 *  • hours are stored as-is; callers are responsible for rounding to their
 *    preferred increment (e.g. 0.25 h = 15-minute increments)
 *  • rate must be a valid Money instance (non-negative, valid currency)
 *  • total() returns hours × rate, rounded to 2 decimal places (ROUND_HALF_UP)
 */
export class LaborCost {
  readonly hours: number

  readonly rate: Money

  constructor(hours: number, rate: Money) {
    if (!Number.isFinite(hours)) {
      throw new DomainException(
        'LaborCost hours must be a finite number (NaN and Infinity are not allowed)',
        'INVALID_HOURS',
      )
    }

    if (hours <= 0) {
      throw new DomainException(
        `LaborCost hours must be greater than zero (got ${hours})`,
        'INVALID_HOURS',
      )
    }

    if (hours > MAX_HOURS) {
      throw new DomainException(
        `LaborCost hours cannot exceed ${MAX_HOURS} per entry (got ${hours})`,
        'INVALID_HOURS',
      )
    }

    this.hours = hours
    this.rate = rate
    Object.freeze(this)
  }

  // ── Computation ─────────────────────────────────────────────────────────────

  /**
   * Total cost = hours × rate.
   * Returned as a new Money in the same currency as rate, rounded to 2 d.p.
   * `hours` is a plain number — Money.multiply() accepts number directly.
   */
  total(): Money {
    return this.rate.multiply(this.hours)
  }

  // ── Equality ────────────────────────────────────────────────────────────────

  /**
   * Two LaborCost values are equal when hours and rate are identical.
   * Total is derived, so it does not need a separate comparison.
   */
  equals(other: LaborCost): boolean {
    return this.hours === other.hours && this.rate.equals(other.rate)
  }

  // ── Convenience ─────────────────────────────────────────────────────────────

  toString(): string {
    return `${this.hours}h × ${this.rate.toString()} = ${this.total().toString()}`
  }
}
