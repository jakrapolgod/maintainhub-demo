/* istanbul ignore file — barrel re-exports, no logic */

// ── Value objects ──────────────────────────────────────────────────────────────
export { WebhookEndpointId } from './value-objects/webhook-endpoint-id.js'
export { WebhookDeliveryId } from './value-objects/webhook-delivery-id.js'
export { IntegrationId } from './value-objects/integration-id.js'
export { ALL_WEBHOOK_EVENT_TYPES, isWebhookEventType } from './value-objects/webhook-event-type.js'
export type { WebhookEventType } from './value-objects/webhook-event-type.js'

// ── Domain events ──────────────────────────────────────────────────────────────
export { WebhookEndpointActivatedEvent } from './events/webhook-endpoint-activated.event.js'
export { WebhookEndpointDeactivatedEvent } from './events/webhook-endpoint-deactivated.event.js'
export { WebhookDeliveryRequestedEvent } from './events/webhook-delivery-requested.event.js'

// ── Aggregates / entities ──────────────────────────────────────────────────────
export { WebhookEndpoint } from './WebhookEndpoint.js'
export type { WebhookEndpointProps } from './WebhookEndpoint.js'

export { WebhookDelivery, MAX_DELIVERY_ATTEMPTS } from './WebhookDelivery.js'
export type { WebhookDeliveryProps, DeliveryStatus } from './WebhookDelivery.js'

export { Integration, ALL_INTEGRATION_PROVIDERS } from './Integration.js'
export type { IntegrationProps, IntegrationProvider } from './Integration.js'

// ── Repository ports ───────────────────────────────────────────────────────────
export type { WebhookEndpointRepository } from './WebhookEndpointRepository.js'
export type { WebhookDeliveryRepository } from './WebhookDeliveryRepository.js'
export type { IntegrationRepository } from './IntegrationRepository.js'
