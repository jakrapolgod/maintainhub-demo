import { DomainException } from '../../errors/domain.exception.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type PriorityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

const VALID_LEVELS = new Set<PriorityLevel>(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])

/**
 * Numeric urgency scores used for sorting and SLA calculations.
 * Higher = more urgent.
 */
const URGENCY_SCORES: Record<PriorityLevel, 4 | 3 | 2 | 1> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
}

// ── Value object ──────────────────────────────────────────────────────────────

/**
 * Work order priority.
 *
 * Immutable enum-style value object. Static factory instances (Priority.CRITICAL etc.)
 * satisfy the common case; `Priority.from(string)` handles deserialisation.
 *
 * urgencyScore() returns a numeric weight:
 *   CRITICAL → 4 | HIGH → 3 | MEDIUM → 2 | LOW → 1
 */
export class Priority {
  readonly value: PriorityLevel

  private constructor(value: PriorityLevel) {
    this.value = value
  }

  // ── Static factories ────────────────────────────────────────────────────────

  /** Well-known instances — avoids repeated construction for known values. */
  static readonly CRITICAL = new Priority('CRITICAL')

  static readonly HIGH = new Priority('HIGH')

  static readonly MEDIUM = new Priority('MEDIUM')

  static readonly LOW = new Priority('LOW')

  /**
   * Deserialise from a raw string (e.g. DB column, API payload).
   * Accepts any of the four valid level names — case-sensitive.
   */
  static from(value: string): Priority {
    if (!VALID_LEVELS.has(value as PriorityLevel)) {
      throw new DomainException(
        `"${value}" is not a valid Priority. Expected one of: ${[...VALID_LEVELS].join(', ')}`,
        'INVALID_PRIORITY',
      )
    }
    // Return the canonical static instance to preserve reference equality
    // for the common case and avoid unnecessary allocations.
    switch (value as PriorityLevel) {
      case 'CRITICAL':
        return Priority.CRITICAL
      case 'HIGH':
        return Priority.HIGH
      case 'MEDIUM':
        return Priority.MEDIUM
      case 'LOW':
        return Priority.LOW
      // The validation above guarantees this branch is unreachable;
      // the default satisfies the `consistent-return` and `default-case` rules.
      /* istanbul ignore next */
      default:
        throw new DomainException(`Unhandled priority level: ${value}`, 'INVALID_PRIORITY')
    }
  }

  // ── Domain behaviour ────────────────────────────────────────────────────────

  /**
   * Numeric urgency weight. Higher = more urgent.
   *
   *   CRITICAL → 4   (respond within hours)
   *   HIGH     → 3   (respond same day)
   *   MEDIUM   → 2   (respond within days)
   *   LOW      → 1   (respond within weeks)
   */
  urgencyScore(): 4 | 3 | 2 | 1 {
    return URGENCY_SCORES[this.value]
  }

  /**
   * Returns true when this priority is more urgent than another.
   * Useful for SLA escalation comparisons.
   */
  isMoreUrgentThan(other: Priority): boolean {
    return this.urgencyScore() > other.urgencyScore()
  }

  // ── Equality ────────────────────────────────────────────────────────────────

  equals(other: Priority): boolean {
    return this.value === other.value
  }

  // ── Convenience ─────────────────────────────────────────────────────────────

  toString(): string {
    return this.value
  }
}
