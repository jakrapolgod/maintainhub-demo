import { DomainException } from '../../errors/domain.exception.js'

/**
 * AssetNumber — human-readable, tenant-unique asset identifier.
 *
 * Format:  AST-{NNNNNN}  (6 zero-padded decimal digits)
 * Example: AST-000001, AST-042099
 *
 * The number component must be a positive integer from 1 to 999 999.
 * Numbers are assigned by the repository (`AssetRepository.nextAssetNumber`)
 * in monotonically increasing order per tenant.
 */
export class AssetNumber {
  readonly value: string

  private static readonly FORMAT_REGEX = /^AST-\d{6}$/

  constructor(value: string) {
    if (!AssetNumber.FORMAT_REGEX.test(value)) {
      throw new DomainException(
        `"${value}" is not a valid AssetNumber — expected format AST-NNNNNN (e.g. AST-000001)`,
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

  /** Extract the integer sequence component. */
  get sequence(): number {
    return parseInt(this.value.slice(4), 10)
  }

  equals(other: AssetNumber): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
