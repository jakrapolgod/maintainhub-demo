/**
 * Unit tests for the Integration bounded context.
 *
 * Coverage:
 *   1. WebhookDelivery — exponential backoff calculation
 *   2. WebhookDelivery — shouldRetry logic
 *   3. WebhookDelivery — state transitions (markDelivered, markFailed, resetForRetry)
 *   4. WebhookDelivery — error invariants
 *   5. WebhookEndpoint — create invariants (HTTPS, secret length, events)
 *   6. WebhookEndpoint — activate / deactivate lifecycle
 *   7. WebhookEndpoint — requestDelivery fan-out
 *   8. WebhookEndpoint — delivery outcome recording
 *   9. Integration entity — lifecycle and config management
 *  10. WebhookEventType — type guard helper
 */

import { WebhookDelivery, MAX_DELIVERY_ATTEMPTS } from '../WebhookDelivery.js'
import { WebhookEndpoint } from '../WebhookEndpoint.js'
import { Integration } from '../Integration.js'
import { WebhookEndpointId } from '../value-objects/webhook-endpoint-id.js'
import { WebhookDeliveryId } from '../value-objects/webhook-delivery-id.js'
import { IntegrationId } from '../value-objects/integration-id.js'
import { isWebhookEventType } from '../value-objects/webhook-event-type.js'
import { WebhookEndpointActivatedEvent } from '../events/webhook-endpoint-activated.event.js'
import { WebhookEndpointDeactivatedEvent } from '../events/webhook-endpoint-deactivated.event.js'
import { WebhookDeliveryRequestedEvent } from '../events/webhook-delivery-requested.event.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_ENDPOINT_ID = 'clh7z2d1h0000z1x1z1x1z1x1'
const VALID_DELIVERY_ID = 'clh7z2d1h0001z1x1z1x1z1x2'
const VALID_INTEG_ID = 'clh7z2d1h0002z1x1z1x1z1x3'
const TENANT_ID = 'tenant-1'
const USER_ID = 'user-1'
const VALID_URL = 'https://hooks.example.com/maintainhub'
const VALID_SECRET = 'super-secret-key-that-is-long-enough-for-hmac-sha256'

function makeEndpoint(overrides: Partial<Parameters<typeof WebhookEndpoint.create>[0]> = {}) {
  return WebhookEndpoint.create({
    id: new WebhookEndpointId(VALID_ENDPOINT_ID),
    tenantId: TENANT_ID,
    url: VALID_URL,
    secret: VALID_SECRET,
    events: ['WORK_ORDER_CREATED', 'PM_TRIGGERED'],
    createdById: USER_ID,
    ...overrides,
  })
}

function makeDelivery(overrides: Partial<Parameters<typeof WebhookDelivery.create>[0]> = {}) {
  return WebhookDelivery.create({
    id: new WebhookDeliveryId(VALID_DELIVERY_ID),
    webhookEndpointId: VALID_ENDPOINT_ID,
    event: 'WORK_ORDER_CREATED',
    payload: { workOrderId: 'wo-1', title: 'Fix pump' },
    ...overrides,
  })
}

// ── 1. Exponential backoff calculation ────────────────────────────────────────

describe('WebhookDelivery — exponential backoff', () => {
  const BASE = new Date('2024-06-01T12:00:00.000Z')

  it('attempt 1 → retry in 1 minute', () => {
    const next = WebhookDelivery.nextRetryAfter(1, BASE)
    expect(next).toBeDefined()
    expect(next!.getTime()).toBe(BASE.getTime() + 60_000)
  })

  it('attempt 2 → retry in 5 minutes', () => {
    const next = WebhookDelivery.nextRetryAfter(2, BASE)
    expect(next!.getTime()).toBe(BASE.getTime() + 5 * 60_000)
  })

  it('attempt 3 → retry in 30 minutes', () => {
    const next = WebhookDelivery.nextRetryAfter(3, BASE)
    expect(next!.getTime()).toBe(BASE.getTime() + 30 * 60_000)
  })

  it('attempt 4 → retry in 2 hours', () => {
    const next = WebhookDelivery.nextRetryAfter(4, BASE)
    expect(next!.getTime()).toBe(BASE.getTime() + 2 * 60 * 60_000)
  })

  it('attempt 5 (max) → returns undefined (no more retries)', () => {
    const next = WebhookDelivery.nextRetryAfter(5, BASE)
    expect(next).toBeUndefined()
  })

  it('attempt > max → returns undefined', () => {
    expect(WebhookDelivery.nextRetryAfter(6, BASE)).toBeUndefined()
    expect(WebhookDelivery.nextRetryAfter(99, BASE)).toBeUndefined()
  })

  it('backoff schedule has exactly 5 entries', () => {
    expect(WebhookDelivery.backoffDelaysMs).toHaveLength(5)
  })

  it('backoff is strictly increasing', () => {
    const delays = [...WebhookDelivery.backoffDelaysMs]
    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1]!)
    }
  })

  it('MAX_DELIVERY_ATTEMPTS is 5', () => {
    expect(MAX_DELIVERY_ATTEMPTS).toBe(5)
  })
})

// ── 2. shouldRetry logic ──────────────────────────────────────────────────────

describe('WebhookDelivery — shouldRetry', () => {
  it('returns false for a fresh PENDING delivery (not failed yet)', () => {
    const d = makeDelivery()
    expect(d.shouldRetry()).toBe(false)
  })

  it('returns true after 1st failure (attemptCount=1, status=FAILED)', () => {
    const d = makeDelivery()
    d.markFailed('connection timeout')
    expect(d.status).toBe('FAILED')
    expect(d.attemptCount).toBe(1)
    expect(d.shouldRetry()).toBe(true)
  })

  it('returns true after 2nd failure (attemptCount=2)', () => {
    const d = makeDelivery()
    d.markFailed('timeout 1')
    d.resetForRetry()
    d.markFailed('timeout 2')
    expect(d.attemptCount).toBe(2)
    expect(d.shouldRetry()).toBe(true)
  })

  it('returns true after 3rd failure (attemptCount=3)', () => {
    const d = makeDelivery()
    for (let i = 0; i < 3; i += 1) {
      if (d.shouldRetry()) d.resetForRetry()
      d.markFailed(`error ${i + 1}`)
    }
    expect(d.attemptCount).toBe(3)
    expect(d.shouldRetry()).toBe(true)
  })

  it('returns true after 4th failure (attemptCount=4)', () => {
    const d = makeDelivery()
    for (let i = 0; i < 4; i += 1) {
      if (d.shouldRetry()) d.resetForRetry()
      d.markFailed(`error ${i + 1}`)
    }
    expect(d.attemptCount).toBe(4)
    expect(d.shouldRetry()).toBe(true)
  })

  it('returns FALSE after 5th failure — max attempts exhausted', () => {
    const d = makeDelivery()
    for (let i = 0; i < 5; i += 1) {
      if (d.shouldRetry()) d.resetForRetry()
      d.markFailed(`error ${i + 1}`)
    }
    expect(d.attemptCount).toBe(5)
    expect(d.status).toBe('FAILED')
    expect(d.shouldRetry()).toBe(false)
    expect(d.nextRetryAt).toBeUndefined()
  })

  it('returns false for a DELIVERED delivery', () => {
    const d = makeDelivery()
    d.markDelivered(200, '{"ok":true}')
    expect(d.shouldRetry()).toBe(false)
  })
})

// ── 3. State transitions ──────────────────────────────────────────────────────

describe('WebhookDelivery — state transitions', () => {
  it('markDelivered: increments attemptCount, sets status and responseCode', () => {
    const d = makeDelivery()
    expect(d.status).toBe('PENDING')
    expect(d.attemptCount).toBe(0)

    d.markDelivered(200, '{"status":"ok"}')

    expect(d.status).toBe('DELIVERED')
    expect(d.attemptCount).toBe(1)
    expect(d.responseCode).toBe(200)
    expect(d.responseBody).toBe('{"status":"ok"}')
    expect(d.lastAttemptAt).toBeInstanceOf(Date)
    expect(d.nextRetryAt).toBeUndefined()
  })

  it('markDelivered: truncates responseBody to 4 KB', () => {
    const d = makeDelivery()
    const body = 'x'.repeat(10_000)
    d.markDelivered(201, body)
    expect(d.responseBody!.length).toBe(4_096)
  })

  it('markFailed: increments attemptCount, sets nextRetryAt', () => {
    const d = makeDelivery()
    const before = Date.now()
    d.markFailed('Connection refused')

    expect(d.status).toBe('FAILED')
    expect(d.attemptCount).toBe(1)
    expect(d.responseBody).toBe('Connection refused')
    expect(d.nextRetryAt).toBeInstanceOf(Date)
    expect(d.nextRetryAt!.getTime()).toBeGreaterThan(before)
    expect(d.nextRetryAt!.getTime()).toBeLessThanOrEqual(before + 65_000) // ~1 min
  })

  it('markFailed: no nextRetryAt after max attempts', () => {
    const d = makeDelivery()
    for (let i = 0; i < MAX_DELIVERY_ATTEMPTS; i += 1) {
      if (d.shouldRetry()) d.resetForRetry()
      d.markFailed('err')
    }
    expect(d.nextRetryAt).toBeUndefined()
  })

  it('resetForRetry: resets status to PENDING', () => {
    const d = makeDelivery()
    d.markFailed('err')
    expect(d.status).toBe('FAILED')
    d.resetForRetry()
    expect(d.status).toBe('PENDING')
    expect(d.nextRetryAt).toBeUndefined()
  })

  it('full happy path: PENDING → DELIVERED', () => {
    const d = makeDelivery()
    d.markDelivered(200, 'ok')
    expect(d.status).toBe('DELIVERED')
    expect(d.attemptCount).toBe(1)
  })

  it('full retry path: PENDING → FAILED × 3 → DELIVERED', () => {
    const d = makeDelivery()

    d.markFailed('timeout 1')
    expect(d.shouldRetry()).toBe(true)
    d.resetForRetry()

    d.markFailed('timeout 2')
    expect(d.shouldRetry()).toBe(true)
    d.resetForRetry()

    d.markFailed('timeout 3')
    expect(d.shouldRetry()).toBe(true)
    d.resetForRetry()

    d.markDelivered(200, 'finally ok')
    expect(d.status).toBe('DELIVERED')
    expect(d.attemptCount).toBe(4)
  })

  it('reconstitute preserves all mutable state', () => {
    const original = makeDelivery()
    original.markFailed('first error')
    original.resetForRetry()
    original.markDelivered(200, 'ok')

    const copy = WebhookDelivery.reconstitute({
      id: original.id,
      webhookEndpointId: original.webhookEndpointId,
      event: original.event,
      payload: original.payload,
      status: original.status,
      attemptCount: original.attemptCount,
      lastAttemptAt: original.lastAttemptAt,
      responseCode: original.responseCode,
      responseBody: original.responseBody,
      nextRetryAt: original.nextRetryAt,
      createdAt: original.createdAt,
    })

    expect(copy.status).toBe('DELIVERED')
    expect(copy.attemptCount).toBe(2)
    expect(copy.responseCode).toBe(200)
  })
})

// ── 4. WebhookDelivery error invariants ───────────────────────────────────────

describe('WebhookDelivery — error invariants', () => {
  it('markDelivered on already-delivered throws DELIVERY_ALREADY_DELIVERED', () => {
    const d = makeDelivery()
    d.markDelivered(200, 'ok')
    expect(() => d.markDelivered(200, 'again')).toThrow(
      expect.objectContaining({ code: 'DELIVERY_ALREADY_DELIVERED' }),
    )
  })

  it('markFailed on delivered throws DELIVERY_ALREADY_DELIVERED', () => {
    const d = makeDelivery()
    d.markDelivered(200, 'ok')
    expect(() => d.markFailed('oops')).toThrow(
      expect.objectContaining({ code: 'DELIVERY_ALREADY_DELIVERED' }),
    )
  })

  it('resetForRetry on PENDING throws DELIVERY_NOT_RETRYABLE', () => {
    const d = makeDelivery()
    expect(() => d.resetForRetry()).toThrow(
      expect.objectContaining({ code: 'DELIVERY_NOT_RETRYABLE' }),
    )
  })

  it('resetForRetry after max failures throws DELIVERY_NOT_RETRYABLE', () => {
    const d = makeDelivery()
    for (let i = 0; i < MAX_DELIVERY_ATTEMPTS; i += 1) {
      if (d.shouldRetry()) d.resetForRetry()
      d.markFailed('err')
    }
    expect(() => d.resetForRetry()).toThrow(
      expect.objectContaining({ code: 'DELIVERY_NOT_RETRYABLE' }),
    )
  })
})

// ── 5. WebhookEndpoint invariants ─────────────────────────────────────────────

describe('WebhookEndpoint — create invariants', () => {
  it('creates successfully with valid props', () => {
    const ep = makeEndpoint()
    expect(ep.url).toBe(VALID_URL)
    expect(ep.isActive).toBe(false)
    expect(ep.failureCount).toBe(0)
    expect(ep.events).toEqual(['WORK_ORDER_CREATED', 'PM_TRIGGERED'])
  })

  it('rejects HTTP (non-HTTPS) URL', () => {
    expect(() => makeEndpoint({ url: 'http://hooks.example.com/wh' })).toThrow(
      expect.objectContaining({ code: 'INVALID_WEBHOOK_URL' }),
    )
  })

  it('rejects empty URL', () => {
    expect(() => makeEndpoint({ url: '' })).toThrow(
      expect.objectContaining({ code: 'INVALID_WEBHOOK_URL' }),
    )
  })

  it('rejects URL without hostname', () => {
    expect(() => makeEndpoint({ url: 'https://' })).toThrow(
      expect.objectContaining({ code: 'INVALID_WEBHOOK_URL' }),
    )
  })

  it('rejects secret shorter than 32 chars', () => {
    expect(() => makeEndpoint({ secret: 'too-short' })).toThrow(
      expect.objectContaining({ code: 'INVALID_WEBHOOK_SECRET' }),
    )
  })

  it('rejects empty events list', () => {
    expect(() => makeEndpoint({ events: [] })).toThrow(
      expect.objectContaining({ code: 'EMPTY_WEBHOOK_EVENTS' }),
    )
  })

  it('accepts HTTPS URL with port', () => {
    expect(() => makeEndpoint({ url: 'https://hooks.example.com:8443/webhook' })).not.toThrow()
  })

  it('starts inactive', () => {
    expect(makeEndpoint().isActive).toBe(false)
  })
})

// ── 6. WebhookEndpoint lifecycle ─────────────────────────────────────────────

describe('WebhookEndpoint — activate / deactivate', () => {
  it('activate transitions to active and emits event', () => {
    const ep = makeEndpoint()
    ep.activate(USER_ID)
    expect(ep.isActive).toBe(true)
    const events = ep.pullEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toBeInstanceOf(WebhookEndpointActivatedEvent)
    const evt = events[0] as WebhookEndpointActivatedEvent
    expect(evt.tenantId).toBe(TENANT_ID)
    expect(evt.url).toBe(VALID_URL)
    expect(evt.activatedBy).toBe(USER_ID)
  })

  it('activate throws WEBHOOK_ALREADY_ACTIVE when already active', () => {
    const ep = makeEndpoint()
    ep.activate(USER_ID)
    expect(() => ep.activate(USER_ID)).toThrow(
      expect.objectContaining({ code: 'WEBHOOK_ALREADY_ACTIVE' }),
    )
  })

  it('deactivate transitions to inactive and emits event', () => {
    const ep = makeEndpoint()
    ep.activate(USER_ID)
    ep.pullEvents() // drain activation event
    ep.deactivate(USER_ID)
    expect(ep.isActive).toBe(false)
    const events = ep.pullEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toBeInstanceOf(WebhookEndpointDeactivatedEvent)
  })

  it('deactivate throws WEBHOOK_ALREADY_INACTIVE when already inactive', () => {
    const ep = makeEndpoint()
    expect(() => ep.deactivate(USER_ID)).toThrow(
      expect.objectContaining({ code: 'WEBHOOK_ALREADY_INACTIVE' }),
    )
  })

  it('pullEvents drains the buffer (second call returns empty)', () => {
    const ep = makeEndpoint()
    ep.activate(USER_ID)
    expect(ep.pullEvents()).toHaveLength(1)
    expect(ep.pullEvents()).toHaveLength(0)
  })
})

// ── 7. WebhookEndpoint requestDelivery ───────────────────────────────────────

describe('WebhookEndpoint — requestDelivery', () => {
  it('emits WebhookDeliveryRequestedEvent for subscribed event type', () => {
    const ep = makeEndpoint({ events: ['WORK_ORDER_CREATED'] })
    ep.activate(USER_ID)
    ep.pullEvents()

    const dispatched = ep.requestDelivery({
      deliveryId: VALID_DELIVERY_ID,
      webhookEventType: 'WORK_ORDER_CREATED',
      payload: { id: 'wo-1' },
    })

    expect(dispatched).toBe(true)
    const events = ep.pullEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toBeInstanceOf(WebhookDeliveryRequestedEvent)
    const evt = events[0] as WebhookDeliveryRequestedEvent
    expect(evt.webhookEventType).toBe('WORK_ORDER_CREATED')
    expect(evt.deliveryId).toBe(VALID_DELIVERY_ID)
    expect(evt.payload).toEqual({ id: 'wo-1' })
  })

  it('returns false and emits NO event for unsubscribed event type', () => {
    const ep = makeEndpoint({ events: ['WORK_ORDER_CREATED'] })
    ep.activate(USER_ID)
    ep.pullEvents()

    const dispatched = ep.requestDelivery({
      deliveryId: VALID_DELIVERY_ID,
      webhookEventType: 'ASSET_DECOMMISSIONED',
      payload: {},
    })

    expect(dispatched).toBe(false)
    expect(ep.pullEvents()).toHaveLength(0)
  })

  it('returns false and emits NO event when endpoint is inactive', () => {
    const ep = makeEndpoint({ events: ['WORK_ORDER_CREATED'] })
    // NOT activated

    const dispatched = ep.requestDelivery({
      deliveryId: VALID_DELIVERY_ID,
      webhookEventType: 'WORK_ORDER_CREATED',
      payload: {},
    })

    expect(dispatched).toBe(false)
    expect(ep.pullEvents()).toHaveLength(0)
  })

  it('subscribers to all 8 event types: each event dispatches correctly', () => {
    const ep = makeEndpoint({
      events: [
        'WORK_ORDER_CREATED',
        'WORK_ORDER_ASSIGNED',
        'WORK_ORDER_COMPLETED',
        'WORK_ORDER_SLA_BREACHED',
        'ASSET_STATUS_CHANGED',
        'ASSET_DECOMMISSIONED',
        'PM_TRIGGERED',
        'PART_LOW_STOCK',
      ],
    })
    ep.activate(USER_ID)
    ep.pullEvents()

    const eventTypes = [
      'WORK_ORDER_CREATED',
      'WORK_ORDER_ASSIGNED',
      'WORK_ORDER_COMPLETED',
      'WORK_ORDER_SLA_BREACHED',
      'ASSET_STATUS_CHANGED',
      'ASSET_DECOMMISSIONED',
      'PM_TRIGGERED',
      'PART_LOW_STOCK',
    ] as const

    for (const type of eventTypes) {
      expect(
        ep.requestDelivery({ deliveryId: VALID_DELIVERY_ID, webhookEventType: type, payload: {} }),
      ).toBe(true)
    }

    expect(ep.pullEvents()).toHaveLength(8)
  })
})

// ── 8. WebhookEndpoint delivery outcome recording ────────────────────────────

describe('WebhookEndpoint — delivery outcome recording', () => {
  it('recordDeliverySuccess resets failureCount and sets lastDeliveredAt', () => {
    const ep = WebhookEndpoint.reconstitute({
      id: new WebhookEndpointId(VALID_ENDPOINT_ID),
      tenantId: TENANT_ID,
      url: VALID_URL,
      secret: VALID_SECRET,
      events: ['WORK_ORDER_CREATED'],
      isActive: true,
      failureCount: 3,
      lastDeliveredAt: undefined,
      createdById: USER_ID,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date(),
    })

    ep.recordDeliverySuccess()

    expect(ep.failureCount).toBe(0)
    expect(ep.lastDeliveredAt).toBeInstanceOf(Date)
  })

  it('recordDeliveryFailure increments failureCount', () => {
    const ep = makeEndpoint()
    ep.activate(USER_ID)
    expect(ep.failureCount).toBe(0)
    ep.recordDeliveryFailure()
    ep.recordDeliveryFailure()
    expect(ep.failureCount).toBe(2)
  })

  it('resetFailureCount zeroes the counter', () => {
    const ep = makeEndpoint()
    ep.activate(USER_ID)
    ep.recordDeliveryFailure()
    ep.recordDeliveryFailure()
    ep.resetFailureCount()
    expect(ep.failureCount).toBe(0)
  })

  it('updateUrl validates HTTPS', () => {
    const ep = makeEndpoint()
    expect(() => ep.updateUrl('http://evil.com/hook')).toThrow(
      expect.objectContaining({ code: 'INVALID_WEBHOOK_URL' }),
    )
  })

  it('updateUrl accepts valid HTTPS URL', () => {
    const ep = makeEndpoint()
    ep.updateUrl('https://new-endpoint.example.com/webhook')
    expect(ep.url).toBe('https://new-endpoint.example.com/webhook')
  })

  it('updateSecret validates minimum length', () => {
    const ep = makeEndpoint()
    expect(() => ep.updateSecret('short')).toThrow(
      expect.objectContaining({ code: 'INVALID_WEBHOOK_SECRET' }),
    )
  })

  it('updateEvents validates non-empty list', () => {
    const ep = makeEndpoint()
    expect(() => ep.updateEvents([])).toThrow(
      expect.objectContaining({ code: 'EMPTY_WEBHOOK_EVENTS' }),
    )
  })
})

// ── 9. Integration entity ─────────────────────────────────────────────────────

describe('Integration entity', () => {
  function makeIntegration(
    provider: Parameters<typeof Integration.create>[0]['provider'] = 'slack',
  ) {
    return Integration.create({
      id: new IntegrationId(VALID_INTEG_ID),
      tenantId: TENANT_ID,
      provider,
      config: { webhookUrl: 'https://hooks.slack.com/services/T000/B000/xxx' },
      createdById: USER_ID,
    })
  }

  it('creates with isActive=false', () => {
    const integ = makeIntegration()
    expect(integ.isActive).toBe(false)
    expect(integ.lastSyncAt).toBeUndefined()
  })

  it('activate sets isActive=true', () => {
    const integ = makeIntegration()
    integ.activate()
    expect(integ.isActive).toBe(true)
  })

  it('activate throws INTEGRATION_ALREADY_ACTIVE', () => {
    const integ = makeIntegration()
    integ.activate()
    expect(() => integ.activate()).toThrow(
      expect.objectContaining({ code: 'INTEGRATION_ALREADY_ACTIVE' }),
    )
  })

  it('deactivate sets isActive=false', () => {
    const integ = makeIntegration()
    integ.activate()
    integ.deactivate()
    expect(integ.isActive).toBe(false)
  })

  it('deactivate throws INTEGRATION_ALREADY_INACTIVE', () => {
    const integ = makeIntegration()
    expect(() => integ.deactivate()).toThrow(
      expect.objectContaining({ code: 'INTEGRATION_ALREADY_INACTIVE' }),
    )
  })

  it('updateConfig replaces the config blob', () => {
    const integ = makeIntegration()
    integ.updateConfig({ webhookUrl: 'https://hooks.slack.com/services/new' })
    expect(integ.config).toEqual({ webhookUrl: 'https://hooks.slack.com/services/new' })
  })

  it('config getter returns a defensive copy', () => {
    const integ = makeIntegration()
    const cfg = integ.config
    cfg.injected = 'malicious'
    expect(integ.config.injected).toBeUndefined()
  })

  it('recordSync sets lastSyncAt', () => {
    const integ = makeIntegration()
    expect(integ.lastSyncAt).toBeUndefined()
    integ.recordSync()
    expect(integ.lastSyncAt).toBeInstanceOf(Date)
  })

  it('all providers are accepted', () => {
    const providers = ['zapier', 'make', 'slack', 'google_workspace', 'azure_ad'] as const
    for (const p of providers) {
      expect(() => makeIntegration(p)).not.toThrow()
    }
  })

  it('reconstitute preserves all state', () => {
    const original = makeIntegration()
    original.activate()
    original.recordSync()

    const copy = Integration.reconstitute({
      id: original.id,
      tenantId: original.tenantId,
      provider: original.provider,
      config: original.config,
      isActive: original.isActive,
      lastSyncAt: original.lastSyncAt,
      createdById: original.createdById,
      createdAt: original.createdAt,
      updatedAt: original.updatedAt,
    })

    expect(copy.isActive).toBe(true)
    expect(copy.lastSyncAt).toBeInstanceOf(Date)
    expect(copy.provider).toBe('slack')
  })
})

// ── 10. WebhookEventType type guard ──────────────────────────────────────────

describe('isWebhookEventType', () => {
  it('returns true for all valid types', () => {
    const valid = [
      'WORK_ORDER_CREATED',
      'WORK_ORDER_ASSIGNED',
      'WORK_ORDER_COMPLETED',
      'WORK_ORDER_SLA_BREACHED',
      'ASSET_STATUS_CHANGED',
      'ASSET_DECOMMISSIONED',
      'PM_TRIGGERED',
      'PART_LOW_STOCK',
    ]
    for (const v of valid) {
      expect(isWebhookEventType(v)).toBe(true)
    }
  })

  it('returns false for unknown strings', () => {
    expect(isWebhookEventType('UNKNOWN_EVENT')).toBe(false)
    expect(isWebhookEventType('')).toBe(false)
    expect(isWebhookEventType('work_order_created')).toBe(false) // lowercase not valid
  })
})

// ── 11. ID value objects ──────────────────────────────────────────────────────

describe('ID value objects', () => {
  it('WebhookEndpointId rejects non-CUID', () => {
    expect(() => new WebhookEndpointId('bad')).toThrow(
      expect.objectContaining({ code: 'INVALID_WEBHOOK_ENDPOINT_ID' }),
    )
  })

  it('WebhookDeliveryId equals works', () => {
    const a = new WebhookDeliveryId(VALID_DELIVERY_ID)
    const b = new WebhookDeliveryId(VALID_DELIVERY_ID)
    expect(a.equals(b)).toBe(true)
  })

  it('IntegrationId toString returns raw value', () => {
    const id = new IntegrationId(VALID_INTEG_ID)
    expect(id.toString()).toBe(VALID_INTEG_ID)
  })
})
