export type { QueryContext } from '../../work-orders/queries/query.types.js'

// ── WebhookDelivery list ──────────────────────────────────────────────────────

export interface WebhookDeliveryDto {
  id: string
  webhookEndpointId: string
  endpointUrl: string
  event: string
  status: string
  attemptCount: number
  lastAttemptAt: string | null
  responseCode: number | null
  responseBody: string | null
  nextRetryAt: string | null
  createdAt: string
}

export interface WebhookDeliveryListResult {
  items: WebhookDeliveryDto[]
  total: number
  nextCursor: string | null
}

// ── WebhookEndpoint list ──────────────────────────────────────────────────────

export interface WebhookEndpointDto {
  id: string
  url: string
  events: string[]
  isActive: boolean
  failureCount: number
  lastDeliveredAt: string | null
  createdAt: string
  updatedAt: string
}

export interface WebhookEndpointListResult {
  items: WebhookEndpointDto[]
  total: number
}
