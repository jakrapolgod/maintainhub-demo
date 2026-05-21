import { DomainException } from '../../errors/domain.exception.js'

/** Same CUID regex as AssetId / WorkOrderId — Prisma v5 default. */
const CUID_REGEX = /^c[0-9a-z]{24}$|^[a-z][0-9a-z]{23}$/

/**
 * Strongly-typed PM-schedule identifier.
 * Prevents accidentally passing a plain string where a PMScheduleId is expected.
 */
export class PMScheduleId {
  readonly value: string

  constructor(value: string) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new DomainException('PMScheduleId must be a non-empty string', 'INVALID_PM_SCHEDULE_ID')
    }
    if (!CUID_REGEX.test(value)) {
      throw new DomainException(
        `"${value}" is not a valid CUID (expected lowercase alphanumeric, 24–25 chars starting with a letter)`,
        'INVALID_PM_SCHEDULE_ID',
      )
    }
    this.value = value
    Object.freeze(this)
  }

  equals(other: PMScheduleId): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
