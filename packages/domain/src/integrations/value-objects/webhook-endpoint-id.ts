import { DomainException } from '../../errors/domain.exception.js'

const CUID_REGEX = /^c[0-9a-z]{24}$|^[a-z][0-9a-z]{23}$/

/**
 * Strongly-typed webhook-endpoint identifier (CUID).
 */
export class WebhookEndpointId {
  readonly value: string

  constructor(value: string) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new DomainException(
        'WebhookEndpointId must be a non-empty string',
        'INVALID_WEBHOOK_ENDPOINT_ID',
      )
    }
    if (!CUID_REGEX.test(value)) {
      throw new DomainException(`"${value}" is not a valid CUID`, 'INVALID_WEBHOOK_ENDPOINT_ID')
    }
    this.value = value
    Object.freeze(this)
  }

  equals(other: WebhookEndpointId): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
