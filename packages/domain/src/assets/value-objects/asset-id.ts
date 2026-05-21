import { DomainException } from '../../errors/domain.exception.js'

/** Same CUID regex as WorkOrderId — Prisma v5 default. */
const CUID_REGEX = /^c[0-9a-z]{24}$|^[a-z][0-9a-z]{23}$/

/**
 * Strongly-typed asset identifier.
 * Prevents accidentally passing a plain string where an AssetId is expected.
 */
export class AssetId {
  readonly value: string

  constructor(value: string) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new DomainException('AssetId must be a non-empty string', 'INVALID_ASSET_ID')
    }
    if (!CUID_REGEX.test(value)) {
      throw new DomainException(
        `"${value}" is not a valid CUID (expected lowercase alphanumeric, 24–25 chars starting with a letter)`,
        'INVALID_ASSET_ID',
      )
    }
    this.value = value
    Object.freeze(this)
  }

  equals(other: AssetId): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
