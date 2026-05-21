/**
 * ReplayWebhookDeliveryHandler
 *
 * Re-sends a specific past delivery to its original webhook endpoint.
 * Useful for debugging, or when a delivery failed and the operator wants to
 * retry it immediately without waiting for the automatic retry window.
 *
 * Creates a NEW WebhookDelivery record with the same payload so the delivery
 * history is accurate (original is untouched).
 */
import type { PrismaClient } from '@prisma/client'
import { WebhookDeliveryId, WebhookDelivery } from '@maintainhub/domain'
import type {
  WebhookEndpointRepository,
  WebhookDeliveryRepository,
  WebhookEventType,
} from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import { WebhookDeliveryService } from '../../../infrastructure/integrations/WebhookDeliveryService.js'
import { generateId, writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

export interface ReplayWebhookDeliveryResult {
  newDeliveryId: string
  success: boolean
}

export class ReplayWebhookDeliveryHandler {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly endpointRepo: WebhookEndpointRepository,
    private readonly deliveryRepo: WebhookDeliveryRepository,
  ) {}

  async handle(
    cmd: { deliveryId: string },
    ctx: CommandContext,
  ): Promise<ReplayWebhookDeliveryResult> {
    // ── 1. Load original delivery ─────────────────────────────────────────────
    const originalId = new WebhookDeliveryId(cmd.deliveryId)
    const original = await this.deliveryRepo.findById(originalId)

    if (original === undefined) {
      throw new DomainException('Webhook delivery not found', 'WEBHOOK_DELIVERY_NOT_FOUND', 404)
    }

    // ── 2. Ensure delivery belongs to this tenant (security check) ────────────
    const endpoint = await this.endpointRepo.findById(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { value: original.webhookEndpointId } as any,
      ctx.tenantId,
    )

    if (endpoint === undefined) {
      throw new DomainException(
        'Webhook delivery does not belong to this tenant',
        'WEBHOOK_DELIVERY_NOT_FOUND',
        404,
      )
    }

    if (!endpoint.isActive) {
      throw new DomainException(
        'Cannot replay delivery: webhook endpoint is inactive',
        'WEBHOOK_ENDPOINT_INACTIVE',
        422,
      )
    }

    // ── 3. Create a fresh delivery record with the same payload ───────────────
    const newId = `c${generateId().slice(0, 23)}`
    const newDelivery = WebhookDelivery.create({
      id: new WebhookDeliveryId(newId),
      webhookEndpointId: original.webhookEndpointId,
      event: original.event,
      payload: { ...original.payload, _replayed: true, _originalDeliveryId: original.id.value },
    })

    await this.deliveryRepo.save(newDelivery)

    // ── 4. Execute delivery ───────────────────────────────────────────────────
    const svc = new WebhookDeliveryService(this.prisma)
    const result = await svc.deliver(
      endpoint,
      original.event as WebhookEventType,
      newDelivery.payload,
      newDelivery,
    )

    // ── 5. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'REPLAY_WEBHOOK_DELIVERY',
      entityType: 'WebhookDelivery',
      entityId: newId,
      after: {
        originalDeliveryId: cmd.deliveryId,
        newDeliveryId: newId,
        success: result.status === 'DELIVERED',
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return { newDeliveryId: newId, success: result.status === 'DELIVERED' }
  }
}
