import { DomainException } from '../../errors/domain.exception.js'

/**
 * AssetNumber — human-readable, tenant-unique asset identifier.
 *
 * Strict format:  AST-{NNNNNN}  (6 zero-padded decimal digits)
 * Example: AST-000001, AST-042099
 */
export class AssetNumber {
  readonly value: string

  /** Canonical format: AST- followed by exactly 6 decimal digits. */
  private static readonly SEQUENTIAL_REGEX = /^AST-\d{6}$/

  constructor(value: string) {
    if (!value || !AssetNumber.SEQUENTIAL_REGEX.test(value)) {
      throw new DomainException(
        `"${value}" is not a valid AssetNumber — must match AST-NNNNNN (6-digit zero-padded number)`,
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
