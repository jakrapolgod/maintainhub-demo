import { DomainException } from '../../errors/domain.exception.js'

/**
 * AssetNumber — human-readable, tenant-unique asset identifier.
 *
 * Auto-generated format:  AST-{NNNNNN}  (6 zero-padded decimal digits)
 * Example: AST-000001, AST-042099
 *
 * Custom / legacy formats (e.g. "P-101", "AC-001") are also accepted so that
 * imported or manually-assigned numbers are not rejected.
 * Constraints: 1–50 chars, alphanumeric with hyphens/underscores/dots/spaces.
 */
export class AssetNumber {
  readonly value: string

  /** Regex for auto-generated sequential numbers (used by fromSequence). */
  private static readonly SEQUENTIAL_REGEX = /^AST-\d{6}$/

  /** Permissive regex for any user-supplied or imported asset number. */
  private static readonly VALID_REGEX = /^[A-Za-z0-9][A-Za-z0-9\-_./ ]{0,49}$/

  constructor(value: string) {
    if (!value || !AssetNumber.VALID_REGEX.test(value)) {
      throw new DomainException(
        `"${value}" is not a valid AssetNumber — must be 1–50 alphanumeric characters (hyphens, dots, underscores allowed)`,
        'INVALID_ASSET_NUMBER',
      )
    }
    this.value = value
    Object.freeze(this)
  }

  /** Build from a raw integer sequence number (1–999 999). */
  static fromSequence(n: number): AssetNumber {
    if (!Number.isInteger(n) || n < 1 || n > 999_999) {
      throw new DomainException(
        `Sequence number must be an integer in [1, 999 999], got ${n}`,
        'INVALID_ASSET_NUMBER',
      )
    }
    return new AssetNumber(`AST-${String(n).padStart(6, '0')}`)
  }

  /** Extract the integer sequence component. Only valid for AST-NNNNNN format; returns NaN otherwise. */
  get sequence(): number {
    if (!AssetNumber.SEQUENTIAL_REGEX.test(this.value)) return NaN
    return parseInt(this.value.slice(4), 10)
  }

  equals(other: AssetNumber): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
