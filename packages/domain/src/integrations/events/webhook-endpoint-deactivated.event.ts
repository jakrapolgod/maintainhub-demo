import { BaseDomainEvent } from '../../events/base-domain-event.js'

const AGGREGATE_TYPE = 'WebhookEndpoint'

/**
 * Raised when a webhook endpoint is deactivated (active → inactive).
 */
export class WebhookEndpointDeactivatedEvent extends BaseDomainEvent {
  readonly eventType = 'WebhookEndpointDeactivated' as const

  readonly tenantId: string

  readonly url: string

  readonly deactivatedBy: string

  constructor(opts: { aggregateId: string; tenantId: string; url: string; deactivatedBy: string }) {
    super(opts.aggregateId, AGGREGATE_TYPE)
    this.tenantId = opts.tenantId
    this.url = opts.url
    this.deactivatedBy = opts.deactivatedBy
  }
}
