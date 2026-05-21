import type { WebhookEndpoint } from './WebhookEndpoint.js'
import type { WebhookEndpointId } from './value-objects/webhook-endpoint-id.js'
import type { WebhookEventType } from './value-objects/webhook-event-type.js'

/**
 * Port for WebhookEndpoint persistence.
 * Implementations live in the infrastructure layer.
 */
export interface WebhookEndpointRepository {
  save(endpoint: WebhookEndpoint): Promise<void>

  update(endpoint: WebhookEndpoint): Promise<void>

  findById(id: WebhookEndpointId, tenantId: string): Promise<WebhookEndpoint | undefined>

  delete(id: WebhookEndpointId, tenantId: string): Promise<void>

  /** All endpoints for a tenant (active and inactive). */
  findByTenant(tenantId: string): Promise<WebhookEndpoint[]>

  /**
   * All active endpoints that subscribe to the given event type.
   * Called by the dispatcher to fan out a domain event to every interested endpoint.
   */
  findActiveByEventType(eventType: WebhookEventType, tenantId: string): Promise<WebhookEndpoint[]>
}
