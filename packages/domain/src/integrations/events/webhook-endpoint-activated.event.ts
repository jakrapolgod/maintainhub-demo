import { BaseDomainEvent } from '../../events/base-domain-event.js'

const AGGREGATE_TYPE = 'WebhookEndpoint'

/**
 * Raised when a webhook endpoint is activated (inactive → active).
 */
export class WebhookEndpointActivatedEvent extends BaseDomainEvent {
  readonly eventType = 'WebhookEndpointActivated' as const

  readonly tenantId: string

  readonly url: string

  readonly activatedBy: string

  constructor(opts: { aggregateId: string; tenantId: string; url: string; activatedBy: string }) {
    super(opts.aggregateId, AGGREGATE_TYPE)
    this.tenantId = opts.tenantId
    this.url = opts.url
    this.activatedBy = opts.activatedBy
  }
}
