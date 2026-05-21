import { DomainException } from '../../errors/domain.exception.js'

const CUID_REGEX = /^c[0-9a-z]{24}$|^[a-z][0-9a-z]{23}$/

/**
 * Strongly-typed integration identifier (CUID).
 */
export class IntegrationId {
  readonly value: string

  constructor(value: string) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new DomainException(
        'IntegrationId must be a non-empty string',
        'INVALID_INTEGRATION_ID',
      )
    }
    if (!CUID_REGEX.test(value)) {
      throw new DomainException(`"${value}" is not a valid CUID`, 'INVALID_INTEGRATION_ID')
    }
    this.value = value
    Object.freeze(this)
  }

  equals(other: IntegrationId): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
