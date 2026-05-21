/**
 * WebhookDelivery — Entity tracking a single HTTP delivery attempt lifecycle.
 *
 * ## Lifecycle
 *
 *   PENDING → (HTTP call succeeds) → DELIVERED
 *   PENDING → (HTTP call fails)    → FAILED
 *   FAILED  → (retry eligible)     → PENDING (reset by dispatcher before re-attempt)
 *
 * ## Exponential backoff schedule (max 5 attempts)
 *
 *   Attempt 1 → nextRetryAt = now + 1 min
 *   Attempt 2 → nextRetryAt = now + 5 min
 *   Attempt 3 → nextRetryAt = now + 30 min
 *   Attempt 4 → nextRetryAt = now + 2 h
 *   Attempt 5 → nextRetryAt = undefined  (final attempt — no more retries)
 *
 * ## Design note
 *
 * WebhookDelivery is a standalone entity (not embedded in WebhookEndpoint)
 * because the number of delivery records per endpoint is unbounded and loading
 * them all into the aggregate would be inefficient. The WebhookEndpointRepository
 * is responsible for updating summary state on the endpoint (failureCount, etc.)
 * after each delivery outcome.
 */
import { DomainException } from '../errors/domain.exception.js'
import type { WebhookDeliveryId } from './value-objects/webhook-delivery-id.js'
import type { WebhookEventType } from './value-objects/webhook-event-type.js'

// ── Delivery status ────────────────────────────────────────────────────────────

export type DeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED'

// ── Backoff schedule ───────────────────────────────────────────────────────────

/** Delay (ms) added after the Nth failed attempt. Index = attemptCount − 1. */
const BACKOFF_DELAYS_MS: readonly number[] = [
  60_000, // after attempt 1 → retry in 1 min
  5 * 60_000, // after attempt 2 → retry in 5 min
  30 * 60_000, // after attempt 3 → retry in 30 min
  2 * 60 * 60_000, // after attempt 4 → retry in 2 h
  8 * 60 * 60_000, // after attempt 5 → retry in 8 h (but shouldRetry returns false — final)
] as const

export const MAX_DELIVERY_ATTEMPTS = 5

// ── Construction props ─────────────────────────────────────────────────────────

export interface WebhookDeliveryProps {
  id: WebhookDeliveryId
  webhookEndpointId: string
  event: WebhookEventType
  payload: Record<string, unknown>
  status: DeliveryStatus
  attemptCount: number
  lastAttemptAt: Date | undefined
  responseCode: number | undefined
  responseBody: string | undefined
  nextRetryAt: Date | undefined
  createdAt: Date
}

// ── Entity ─────────────────────────────────────────────────────────────────────

export class WebhookDelivery {
  // ── Identity (immutable) ────────────────────────────────────────────────────
  readonly id: WebhookDeliveryId

  readonly webhookEndpointId: string

  readonly event: WebhookEventType

  readonly payload: Record<string, unknown>

  readonly createdAt: Date

  // ── Mutable state ───────────────────────────────────────────────────────────
  private mStatus: DeliveryStatus

  private mAttemptCount: number

  private mLastAttemptAt: Date | undefined

  private mResponseCode: number | undefined

  private mResponseBody: string | undefined

  private mNextRetryAt: Date | undefined

  private constructor(props: WebhookDeliveryProps) {
    this.id = props.id
    this.webhookEndpointId = props.webhookEndpointId
    this.event = props.event
    this.payload = props.payload
    this.createdAt = props.createdAt
    this.mStatus = props.status
    this.mAttemptCount = props.attemptCount
    this.mLastAttemptAt = props.lastAttemptAt
    this.mResponseCode = props.responseCode
    this.mResponseBody = props.responseBody
    this.mNextRetryAt = props.nextRetryAt
  }

  // ── Factories ───────────────────────────────────────────────────────────────

  /** Create a brand-new pending delivery. */
  static create(
    props: Omit<
      WebhookDeliveryProps,
      | 'status'
      | 'attemptCount'
      | 'lastAttemptAt'
      | 'responseCode'
      | 'responseBody'
      | 'nextRetryAt'
      | 'createdAt'
    >,
  ): WebhookDelivery {
    return new WebhookDelivery({
      ...props,
      status: 'PENDING',
      attemptCount: 0,
      lastAttemptAt: undefined,
      responseCode: undefined,
      responseBody: undefined,
      nextRetryAt: undefined,
      createdAt: new Date(),
    })
  }

  /** Reconstitute from persistence (no side effects). */
  static reconstitute(props: WebhookDeliveryProps): WebhookDelivery {
    return new WebhookDelivery(props)
  }

  // ── Getters ─────────────────────────────────────────────────────────────────

  get status(): DeliveryStatus {
    return this.mStatus
  }

  get attemptCount(): number {
    return this.mAttemptCount
  }

  get lastAttemptAt(): Date | undefined {
    return this.mLastAttemptAt
  }

  get responseCode(): number | undefined {
    return this.mResponseCode
  }

  get responseBody(): string | undefined {
    return this.mResponseBody
  }

  get nextRetryAt(): Date | undefined {
    return this.mNextRetryAt
  }

  // ── Business methods ────────────────────────────────────────────────────────

  /**
   * Mark this delivery as successfully delivered.
   *
   * @param responseCode  HTTP status code returned by the endpoint (2xx expected).
   * @param responseBody  First 4 KB of the response body (for diagnostics).
   *
   * @throws DomainException DELIVERY_ALREADY_TERMINAL when already DELIVERED or
   *   when status is FAILED and the delivery is no longer retryable.
   */
  markDelivered(responseCode: number, responseBody: string): void {
    if (this.mStatus === 'DELIVERED') {
      throw new DomainException(
        'Delivery is already marked as delivered',
        'DELIVERY_ALREADY_DELIVERED',
      )
    }

    const now = new Date()
    this.mAttemptCount += 1
    this.mLastAttemptAt = now
    this.mStatus = 'DELIVERED'
    this.mResponseCode = responseCode
    this.mResponseBody = responseBody.slice(0, 4_096)
    this.mNextRetryAt = undefined
  }

  /**
   * Mark this delivery as failed.
   *
   * Increments `attemptCount` and schedules the next retry using the
   * exponential backoff table.  When `attemptCount` reaches `MAX_DELIVERY_ATTEMPTS`
   * no further retry is scheduled and `shouldRetry()` will return `false`.
   *
   * @param error  Error message or HTTP status/body for diagnostics.
   */
  markFailed(error: string): void {
    if (this.mStatus === 'DELIVERED') {
      throw new DomainException(
        'Cannot fail a delivery that has already been delivered',
        'DELIVERY_ALREADY_DELIVERED',
      )
    }

    const now = new Date()
    this.mAttemptCount += 1
    this.mLastAttemptAt = now
    this.mStatus = 'FAILED'
    this.mResponseBody = error.slice(0, 4_096)

    // Schedule next retry only if we have not exhausted max attempts
    if (this.mAttemptCount < MAX_DELIVERY_ATTEMPTS) {
      const delayMs =
        BACKOFF_DELAYS_MS[this.mAttemptCount - 1] ??
        BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1]!
      this.mNextRetryAt = new Date(now.getTime() + delayMs)
    } else {
      this.mNextRetryAt = undefined
    }
  }

  /**
   * Returns `true` when this delivery is eligible for another attempt.
   *
   * A delivery is retryable when:
   *   - status is FAILED (not PENDING or DELIVERED), AND
   *   - attemptCount is less than MAX_DELIVERY_ATTEMPTS
   */
  shouldRetry(): boolean {
    return this.mStatus === 'FAILED' && this.mAttemptCount < MAX_DELIVERY_ATTEMPTS
  }

  /**
   * Reset status to PENDING before a retry attempt begins.
   * Called by the dispatcher worker just before executing the HTTP call.
   */
  resetForRetry(): void {
    if (!this.shouldRetry()) {
      throw new DomainException('Delivery is not eligible for retry', 'DELIVERY_NOT_RETRYABLE')
    }
    this.mStatus = 'PENDING'
    this.mNextRetryAt = undefined
  }

  // ── Static helper (pure, testable without instantiation) ────────────────────

  /**
   * Compute the nextRetryAt timestamp for a given attempt count.
   * Exposed as a static method so the backoff calculation can be tested in
   * isolation without needing a full delivery instance.
   *
   * @param attemptCount  The number of attempts *after* the current failure.
   * @param from          Base time for the calculation (defaults to `new Date()`).
   * @returns             The next retry date, or `undefined` when max attempts reached.
   */
  static nextRetryAfter(attemptCount: number, from: Date = new Date()): Date | undefined {
    if (attemptCount >= MAX_DELIVERY_ATTEMPTS) return undefined
    const delayMs =
      BACKOFF_DELAYS_MS[attemptCount - 1] ?? BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1]!
    return new Date(from.getTime() + delayMs)
  }

  /** Expose the backoff schedule as a readonly array (useful for documentation / tests). */
  static get backoffDelaysMs(): readonly number[] {
    return BACKOFF_DELAYS_MS
  }
}
