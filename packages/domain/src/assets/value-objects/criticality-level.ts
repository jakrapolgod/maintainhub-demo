import { DomainException } from '../../errors/domain.exception.js'

/**
 * CriticalityLevel — ISO 55000-aligned asset criticality classification.
 *
 *   A = Mission-critical  (riskScore 4) — failure causes immediate safety hazard
 *                                         or total production loss
 *   B = High-impact       (riskScore 3) — significant production or safety impact
 *   C = Standard          (riskScore 2) — moderate impact; workarounds available
 *   D = Low-impact        (riskScore 1) — minimal operational effect
 *
 * The `riskScore()` value feeds into SLA deadline calculation and maintenance
 * scheduling priority algorithms.
 */
export type CriticalityValue = 'A' | 'B' | 'C' | 'D'

const RISK_SCORES: Readonly<Record<CriticalityValue, 1 | 2 | 3 | 4>> = {
  A: 4,
  B: 3,
  C: 2,
  D: 1,
}

const VALID_LEVELS = new Set<CriticalityValue>(['A', 'B', 'C', 'D'])

export class CriticalityLevel {
  readonly value: CriticalityValue

  private constructor(value: CriticalityValue) {
    this.value = value
    Object.freeze(this)
  }

  // ── Static factories ────────────────────────────────────────────────────────

  static readonly A = new CriticalityLevel('A')

  static readonly B = new CriticalityLevel('B')

  static readonly C = new CriticalityLevel('C')

  static readonly D = new CriticalityLevel('D')

  static from(value: string): CriticalityLevel {
    if (!VALID_LEVELS.has(value as CriticalityValue)) {
      throw new DomainException(
        `"${value}" is not a valid CriticalityLevel. Expected one of: A, B, C, D`,
        'INVALID_CRITICALITY',
      )
    }
    switch (value as CriticalityValue) {
      case 'A':
        return CriticalityLevel.A
      case 'B':
        return CriticalityLevel.B
      case 'C':
        return CriticalityLevel.C
      /* istanbul ignore next -- default guards against future enum additions */
      default:
        return CriticalityLevel.D
    }
  }

  // ── Domain behaviour ────────────────────────────────────────────────────────

  /**
   * Numeric risk score used for SLA calculation and scheduling priority.
   * Higher = more critical.
   */
  riskScore(): 1 | 2 | 3 | 4 {
    return RISK_SCORES[this.value]
  }

  /** Returns true for A and B — assets that require heightened attention. */
  isHighRisk(): boolean {
    return this.value === 'A' || this.value === 'B'
  }

  // ── Equality & display ──────────────────────────────────────────────────────

  equals(other: CriticalityLevel): boolean {
    return this.value === other.value
  }

  toString(): string {
    const LABELS: Record<CriticalityValue, string> = {
      A: 'A (Mission-critical)',
      B: 'B (High-impact)',
      C: 'C (Standard)',
      D: 'D (Low-impact)',
    }
    return LABELS[this.value]
  }
}
