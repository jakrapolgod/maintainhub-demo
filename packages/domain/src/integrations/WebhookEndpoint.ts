/**
 * WebhookEndpoint — Domain Aggregate Root.
 *
 * Represents a tenant-owned HTTP endpoint that receives domain event
 * notifications as signed JSON payloads (HMAC-SHA256).
 *
 * ## Invariants
 *
 * - URL must use HTTPS scheme.
 * - Secret must be at least 32 characters (for adequate HMAC entropy).
 * - Events list must contain at least one WebhookEventType.
 * - failureCount is monotonically incremented; it is reset only by an
 *   explicit `resetFailureCount()` call (e.g. after a successful delivery).
 *
 * ## Delivery flow
 *
 * The aggregate does NOT execute HTTP requests — that is infrastructure.
 * Instead, `requestDelivery()` emits a `WebhookDeliveryRequestedEvent` which
 * the webhook-dispatcher worker picks up and processes asynchronously.
 */
import { DomainException } from '../errors/domain.exception.js'
import type { DomainEvent } from '../events/domain-event.js'
import type { WebhookEndpointId } from './value-objects/webhook-endpoint-id.js'
import type { WebhookEventType } from './value-objects/webhook-event-type.js'
import { WebhookEndpointActivatedEvent } from './events/webhook-endpoint-activated.event.js'
import { WebhookEndpointDeactivatedEvent } from './events/webhook-endpoint-deactivated.event.js'
import { WebhookDeliveryRequestedEvent } from './events/webhook-delivery-requested.event.js'

// ── Constants ──────────────────────────────────────────────────────────────────

const MIN_SECRET_LENGTH = 32
const HTTPS_SCHEME_REGEX = /^https:\/\//i

// ── Construction props ─────────────────────────────────────────────────────────

export interface WebhookEndpointProps {
  id: WebhookEndpointId
  tenantId: string
  url: string
  secret: string
  events: WebhookEventType[]
  isActive: boolean
  failureCount: number
  lastDeliveredAt: Date | undefined
  createdById: string
  createdAt: Date
  updatedAt: Date
}

// ── Aggregate ──────────────────────────────────────────────────────────────────

export class WebhookEndpoint {
  // ── Identity (immutable) ────────────────────────────────────────────────────
  readonly id: WebhookEndpointId

  readonly tenantId: string

  readonly createdById: string

  readonly createdAt: Date

  // ── Mutable state ───────────────────────────────────────────────────────────
  private mUrl: string

  private mSecret: string

  private mEvents: WebhookEventType[]

  private mIsActive: boolean

  private mFailureCount: number

  private mLastDeliveredAt: Date | undefined

  private mUpdatedAt: Date

  private domainEvents: DomainEvent[]

  private constructor(props: WebhookEndpointProps) {
    this.id = props.id
    this.tenantId = props.tenantId
    this.createdById = props.createdById
    this.createdAt = props.createdAt
    this.mUrl = props.url
    this.mSecret = props.secret
    this.mEvents = [...props.events]
    this.mIsActive = props.isActive
    this.mFailureCount = props.failureCount
    this.mLastDeliveredAt = props.lastDeliveredAt
    this.mUpdatedAt = props.updatedAt
    this.domainEvents = []
  }

  // ── Factory: create ─────────────────────────────────────────────────────────

  static create(
    props: Omit<
      WebhookEndpointProps,
      'isActive' | 'failureCount' | 'lastDeliveredAt' | 'createdAt' | 'updatedAt'
    >,
  ): WebhookEndpoint {
    WebhookEndpoint.validateUrl(props.url)
    WebhookEndpoint.validateSecret(props.secret)
    WebhookEndpoint.validateEvents(props.events)

    const now = new Date()
    return new WebhookEndpoint({
      ...props,
      isActive: false,
      failureCount: 0,
      lastDeliveredAt: undefined,
      createdAt: now,
      updatedAt: now,
    })
  }

  // ── Factory: reconstitute ───────────────────────────────────────────────────

  static reconstitute(props: WebhookEndpointProps): WebhookEndpoint {
    return new WebhookEndpoint(props)
  }

  // ── Event drain ─────────────────────────────────────────────────────────────

  pullEvents(): DomainEvent[] {
    const events = [...this.domainEvents]
    this.domainEvents = []
    return events
  }

  // ── Getters ─────────────────────────────────────────────────────────────────

  get url(): string {
    return this.mUrl
  }

  get secret(): string {
    return this.mSecret
  }

  get events(): readonly WebhookEventType[] {
    return this.mEvents
  }

  get isActive(): boolean {
    return this.mIsActive
  }

  get failureCount(): number {
    return this.mFailureCount
  }

  get lastDeliveredAt(): Date | undefined {
    return this.mLastDeliveredAt
  }

  get updatedAt(): Date {
    return this.mUpdatedAt
  }

  // ── Business methods ────────────────────────────────────────────────────────

  activate(activatedBy: string): void {
    if (this.mIsActive) {
      throw new DomainException('Webhook endpoint is already active', 'WEBHOOK_ALREADY_ACTIVE')
    }
    this.mIsActive = true
    this.mUpdatedAt = new Date()
    this.domainEvents.push(
      new WebhookEndpointActivatedEvent({
        aggregateId: this.id.value,
        tenantId: this.tenantId,
        url: this.mUrl,
        activatedBy,
      }),
    )
  }

  deactivate(deactivatedBy: string): void {
    if (!this.mIsActive) {
      throw new DomainException('Webhook endpoint is already inactive', 'WEBHOOK_ALREADY_INACTIVE')
    }
    this.mIsActive = false
    this.mUpdatedAt = new Date()
    this.domainEvents.push(
      new WebhookEndpointDeactivatedEvent({
        aggregateId: this.id.value,
        tenantId: this.tenantId,
        url: this.mUrl,
        deactivatedBy,
      }),
    )
  }

  updateUrl(url: string): void {
    WebhookEndpoint.validateUrl(url)
    this.mUrl = url
    this.mUpdatedAt = new Date()
  }

  updateSecret(secret: string): void {
    WebhookEndpoint.validateSecret(secret)
    this.mSecret = secret
    this.mUpdatedAt = new Date()
  }

  updateEvents(events: WebhookEventType[]): void {
    WebhookEndpoint.validateEvents(events)
    this.mEvents = [...events]
    this.mUpdatedAt = new Date()
  }

  /**
   * Emit a delivery request for the given domain event payload.
   *
   * Only fires when the endpoint is active AND the event type is subscribed.
   * Returns `false` when the event is not subscribed or the endpoint is inactive,
   * so the caller can decide whether to create a `WebhookDelivery` record.
   */
  requestDelivery(opts: {
    deliveryId: string
    webhookEventType: WebhookEventType
    payload: Record<string, unknown>
  }): boolean {
    if (!this.mIsActive) return false
    if (!this.mEvents.includes(opts.webhookEventType)) return false

    this.domainEvents.push(
      new WebhookDeliveryRequestedEvent({
        aggregateId: this.id.value,
        tenantId: this.tenantId,
        endpointId: this.id.value,
        webhookEventType: opts.webhookEventType,
        payload: opts.payload,
        deliveryId: opts.deliveryId,
      }),
    )

    return true
  }

  /** Record a successful delivery outcome on the endpoint summary. */
  recordDeliverySuccess(): void {
    this.mLastDeliveredAt = new Date()
    this.mFailureCount = 0
    this.mUpdatedAt = new Date()
  }

  /** Increment the failure counter after a delivery definitively fails (no more retries). */
  recordDeliveryFailure(): void {
    this.mFailureCount += 1
    this.mUpdatedAt = new Date()
  }

  /** Reset the failure counter (e.g. after operator investigation). */
  resetFailureCount(): void {
    this.mFailureCount = 0
    this.mUpdatedAt = new Date()
  }

  // ── Private validators ──────────────────────────────────────────────────────

  private static validateUrl(url: string): void {
    if (!url || url.trim().length === 0) {
      throw new DomainException('Webhook URL must not be empty', 'INVALID_WEBHOOK_URL')
    }
    if (!HTTPS_SCHEME_REGEX.test(url.trim())) {
      throw new DomainException('Webhook URL must use HTTPS', 'INVALID_WEBHOOK_URL')
    }
    // Basic URL shape check (catches port-only strings etc.)
    try {
      const parsed = new URL(url.trim())
      if (parsed.hostname.length === 0) {
        throw new DomainException('Webhook URL must have a valid hostname', 'INVALID_WEBHOOK_URL')
      }
    } catch (err) {
      if (err instanceof DomainException) throw err
      throw new DomainException(`Webhook URL is not a valid URL: ${url}`, 'INVALID_WEBHOOK_URL')
    }
  }

  private static validateSecret(secret: string): void {
    if (!secret || secret.length < MIN_SECRET_LENGTH) {
      throw new DomainException(
        `Webhook secret must be at least ${MIN_SECRET_LENGTH} characters long`,
        'INVALID_WEBHOOK_SECRET',
      )
    }
  }

  private static validateEvents(events: WebhookEventType[]): void {
    if (!events || events.length === 0) {
      throw new DomainException(
        'Webhook endpoint must subscribe to at least one event type',
        'EMPTY_WEBHOOK_EVENTS',
      )
    }
  }
}
