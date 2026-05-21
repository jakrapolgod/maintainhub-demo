/**
 * TestWebhookEndpointHandler
 *
 * Sends a test payload to the webhook URL and returns the delivery result.
 * The test delivery is NOT persisted as a real WebhookDelivery record.
 * This is purely diagnostic — useful for operators verifying connectivity.
 */
import { WebhookEndpointId } from '@maintainhub/domain'
import type { WebhookEndpointRepository } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import type { CommandContext } from './command.types.js'

// ── Result ────────────────────────────────────────────────────────────────────

interface DeliveryResult {
  success: boolean
  responseCode: number | undefined
  responseBody: string
  durationMs: number
}

export interface TestWebhookResult {
  success: boolean
  responseCode: number | undefined
  responseBody: string
  durationMs: number
  signatureHeader: string
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class TestWebhookEndpointHandler {
  constructor(private readonly endpointRepo: WebhookEndpointRepository) {}

  async handle(cmd: { id: string }, ctx: CommandContext): Promise<TestWebhookResult> {
    const id = new WebhookEndpointId(cmd.id)
    const endpoint = await this.endpointRepo.findById(id, ctx.tenantId)

    if (endpoint === undefined) {
      throw new DomainException('Webhook endpoint not found', 'WEBHOOK_ENDPOINT_NOT_FOUND', 404)
    }

    // Build a descriptive test payload
    const testPayload = {
      type: 'WEBHOOK_TEST',
      timestamp: new Date().toISOString(),
      endpointId: endpoint.id.value,
      tenantId: ctx.tenantId,
      triggeredBy: ctx.executingUserId,
      message:
        'This is a test event from MaintainHub. If you received this, your webhook endpoint is configured correctly.',
    }

    const result = await TestWebhookEndpointHandler.executeTestDelivery(
      endpoint.url,
      endpoint.secret,
      testPayload,
    )

    return {
      success: result.success,
      responseCode: result.responseCode,
      responseBody: result.responseBody,
      durationMs: result.durationMs,
      signatureHeader: `sha256=<computed over ${JSON.stringify(testPayload).length} bytes>`,
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private static async executeTestDelivery(
    url: string,
    secret: string,
    payload: Record<string, unknown>,
  ): Promise<DeliveryResult> {
    const { createHmac } = await import('node:crypto')
    const body = JSON.stringify(payload)
    const hmac = createHmac('sha256', secret)
    hmac.update(body, 'utf8')
    const signature = `sha256=${hmac.digest('hex')}`
    const t0 = Date.now()

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MaintainHub-Webhook/1.0',
          'X-MaintainHub-Signature': signature,
          'X-MaintainHub-Delivery': `test-${Date.now()}`,
          'X-MaintainHub-Event': 'WEBHOOK_TEST',
        },
        body,
        signal: AbortSignal.timeout(10_000),
      })
      const text = await res.text().catch(() => '')
      return {
        success: res.ok,
        responseCode: res.status,
        responseBody: text.slice(0, 4_096),
        durationMs: Date.now() - t0,
      }
    } catch (err) {
      return {
        success: false,
        responseCode: undefined,
        responseBody: (err instanceof Error ? err.message : String(err)).slice(0, 4_096),
        durationMs: Date.now() - t0,
      }
    }
  }
}
