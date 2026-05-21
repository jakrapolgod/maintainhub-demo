import { BaseDomainEvent } from '../../events/base-domain-event.js'
import type { WebhookEventType } from '../value-objects/webhook-event-type.js'

const AGGREGATE_TYPE = 'WebhookEndpoint'

/**
 * Raised when a domain event should be dispatched to a webhook endpoint.
 *
 * Downstream consumers (webhook dispatcher worker) pick this up and execute
 * the actual HTTP delivery, persisting a WebhookDelivery record.
 */
export class WebhookDeliveryRequestedEvent extends BaseDomainEvent {
  readonly eventType = 'WebhookDeliveryRequested' as const

  readonly tenantId: string

  readonly endpointId: string

  readonly webhookEventType: WebhookEventType

  readonly payload: Record<string, unknown>

  readonly deliveryId: string

  constructor(opts: {
    aggregateId: string
    tenantId: string
    endpointId: string
    webhookEventType: WebhookEventType
    payload: Record<string, unknown>
    deliveryId: string
  }) {
    super(opts.aggregateId, AGGREGATE_TYPE)
    this.tenantId = opts.tenantId
    this.endpointId = opts.endpointId
    this.webhookEventType = opts.webhookEventType
    this.payload = opts.payload
    this.deliveryId = opts.deliveryId
  }
}
