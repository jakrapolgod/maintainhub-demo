import type { WebhookDelivery } from './WebhookDelivery.js'
import type { WebhookDeliveryId } from './value-objects/webhook-delivery-id.js'

/**
 * Port for WebhookDelivery persistence.
 * Implementations live in the infrastructure layer.
 */
export interface WebhookDeliveryRepository {
  save(delivery: WebhookDelivery): Promise<void>

  update(delivery: WebhookDelivery): Promise<void>

  findById(id: WebhookDeliveryId): Promise<WebhookDelivery | undefined>

  /** Deliveries due for retry (status=FAILED, nextRetryAt <= now). */
  findPendingRetries(now: Date, limit?: number): Promise<WebhookDelivery[]>

  /**
   * All deliveries for a given endpoint, ordered newest-first.
   * Useful for the admin UI delivery log.
   */
  findByEndpoint(endpointId: string, limit?: number): Promise<WebhookDelivery[]>
}
