/**
 * WebhookDeliveryService
 *
 * Executes a single HTTP delivery attempt to an external webhook endpoint.
 *
 * ## Signing
 * Each request carries an HMAC-SHA256 signature in the
 * `X-MaintainHub-Signature` header:
 *
 *   X-MaintainHub-Signature: sha256=<hex(HMAC-SHA256(secret, body))>
 *
 * The signature is computed over the raw JSON body bytes so the receiver can
 * verify integrity by re-computing with their stored secret.
 *
 * ## Timeout
 * A 10-second AbortSignal timeout is attached to every fetch call.
 * Network errors (ECONNREFUSED, ETIMEDOUT, etc.) are caught and treated as
 * delivery failures with the error message stored in responseBody.
 *
 * ## Status determination
 * HTTP 2xx  → DELIVERED
 * HTTP 4xx / 5xx / network error → FAILED
 *
 * ## Idempotency
 * Every request includes `X-MaintainHub-Delivery: <deliveryId>` so receivers
 * can detect duplicates during retry storms.
 */
import { createHmac } from 'node:crypto'
import type { PrismaClient, Prisma } from '@prisma/client'
import { WebhookDelivery, WebhookDeliveryId } from '@maintainhub/domain'
import type { WebhookEndpoint, WebhookEventType } from '@maintainhub/domain'

// ── Constants ──────────────────────────────────────────────────────────────────

const DELIVERY_TIMEOUT_MS = 10_000
const SIGNATURE_HEADER = 'X-MaintainHub-Signature'
const DELIVERY_ID_HEADER = 'X-MaintainHub-Delivery'
const EVENT_TYPE_HEADER = 'X-MaintainHub-Event'
const CONTENT_TYPE_HEADER = 'Content-Type'
const USER_AGENT_HEADER = 'User-Agent'
const USER_AGENT_VALUE = 'MaintainHub-Webhook/1.0'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DeliveryResult {
  success: boolean
  responseCode: number | undefined
  responseBody: string
  durationMs: number
}

// ── Service ────────────────────────────────────────────────────────────────────

export class WebhookDeliveryService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Execute a single delivery attempt.
   *
   * 1. Signs the payload with HMAC-SHA256.
   * 2. POSTs to the endpoint URL with a 10-second timeout.
   * 3. Persists the outcome as a WebhookDelivery record.
   * 4. Returns the new WebhookDelivery domain entity.
   */
  async deliver(
    endpoint: WebhookEndpoint,
    eventType: WebhookEventType,
    payload: Record<string, unknown>,
    existingDelivery?: WebhookDelivery,
  ): Promise<WebhookDelivery> {
    const deliveryId =
      existingDelivery?.id.value ??
      `wdl${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

    // ── Create or reuse the delivery entity ────────────────────────────────────
    let delivery: WebhookDelivery
    if (existingDelivery !== undefined) {
      delivery = existingDelivery
      delivery.resetForRetry()
    } else {
      delivery = WebhookDelivery.create({
        id: new WebhookDeliveryId(
          // ensure CUID-like shape for the value object
          `c${deliveryId.padEnd(24, '0').slice(0, 24)}`,
        ),
        webhookEndpointId: endpoint.id.value,
        event: eventType,
        payload,
      })
    }

    // ── Sign the body ──────────────────────────────────────────────────────────
    const body = JSON.stringify(payload)
    const signature = WebhookDeliveryService.sign(endpoint.secret, body)

    // ── Execute the HTTP request ───────────────────────────────────────────────
    const result = await WebhookDeliveryService.httpPost(
      endpoint.url,
      body,
      signature,
      delivery.id.value,
      eventType,
    )

    // ── Update domain entity ───────────────────────────────────────────────────
    if (result.success && result.responseCode !== undefined) {
      delivery.markDelivered(result.responseCode, result.responseBody)
    } else {
      delivery.markFailed(
        result.responseCode !== undefined
          ? `HTTP ${result.responseCode}: ${result.responseBody}`
          : result.responseBody,
      )
    }

    // ── Persist ────────────────────────────────────────────────────────────────
    await this.persistDelivery(delivery)

    return delivery
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  static sign(secret: string, body: string): string {
    const hmac = createHmac('sha256', secret)
    hmac.update(body, 'utf8')
    return `sha256=${hmac.digest('hex')}`
  }

  private static async httpPost(
    url: string,
    body: string,
    signature: string,
    deliveryId: string,
    eventType: string,
  ): Promise<DeliveryResult> {
    const t0 = Date.now()

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          [CONTENT_TYPE_HEADER]: 'application/json',
          [USER_AGENT_HEADER]: USER_AGENT_VALUE,
          [SIGNATURE_HEADER]: signature,
          [DELIVERY_ID_HEADER]: deliveryId,
          [EVENT_TYPE_HEADER]: eventType,
        },
        body,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      })

      const responseBody = await response.text().catch(() => '')
      const durationMs = Date.now() - t0

      return {
        success: response.status >= 200 && response.status < 300,
        responseCode: response.status,
        responseBody: responseBody.slice(0, 4_096),
        durationMs,
      }
    } catch (err) {
      const durationMs = Date.now() - t0
      const message = err instanceof Error ? err.message : String(err)
      return {
        success: false,
        responseCode: undefined,
        responseBody: message.slice(0, 4_096),
        durationMs,
      }
    }
  }

  private async persistDelivery(delivery: WebhookDelivery): Promise<void> {
    const data = {
      webhookEndpointId: delivery.webhookEndpointId,
      event: delivery.event,
      payload: delivery.payload as Prisma.InputJsonValue,
      status: delivery.status,
      attemptCount: delivery.attemptCount,
      updatedAt: new Date(),
      ...(delivery.lastAttemptAt !== undefined && { lastAttemptAt: delivery.lastAttemptAt }),
      ...(delivery.responseCode !== undefined && { responseCode: delivery.responseCode }),
      ...(delivery.responseBody !== undefined && { responseBody: delivery.responseBody }),
      ...(delivery.nextRetryAt !== undefined && { nextRetryAt: delivery.nextRetryAt }),
    }

    await this.prisma.webhookDelivery.upsert({
      where: { id: delivery.id.value },
      create: { id: delivery.id.value, ...data, createdAt: new Date() },
      update: data,
    })
  }

  // ── Static utility — exposed for testing ──────────────────────────────────

  /** Verify a signature from a webhook receiver (incoming webhook use-case). */
  static verifySignature(secret: string, body: string, header: string): boolean {
    const expected = WebhookDeliveryService.sign(secret, body)
    // Constant-time comparison to prevent timing attacks
    if (expected.length !== header.length) return false
    let diff = 0
    for (let i = 0; i < expected.length; i += 1) {
      // eslint-disable-next-line no-bitwise
      diff |= expected.charCodeAt(i) ^ header.charCodeAt(i)
    }
    return diff === 0
  }
}
