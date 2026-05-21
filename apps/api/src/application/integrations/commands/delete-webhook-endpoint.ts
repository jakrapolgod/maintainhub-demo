/**
 * DeleteWebhookEndpointHandler
 *
 * Soft-deletes a webhook endpoint:
 *  1. Deactivates the endpoint (stops new deliveries).
 *  2. Cancels PENDING deliveries (sets status = FAILED with a cancellation message).
 *  3. Writes audit log.
 *
 * Completed deliveries (DELIVERED / FAILED) are retained for history.
 */
import type { PrismaClient } from '@prisma/client'
import { WebhookEndpointId } from '@maintainhub/domain'
import type { WebhookEndpointRepository } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import { writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

export class DeleteWebhookEndpointHandler {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly endpointRepo: WebhookEndpointRepository,
  ) {}

  async handle(cmd: { id: string }, ctx: CommandContext): Promise<void> {
    const id = new WebhookEndpointId(cmd.id)
    const endpoint = await this.endpointRepo.findById(id, ctx.tenantId)

    if (endpoint === undefined) {
      throw new DomainException('Webhook endpoint not found', 'WEBHOOK_ENDPOINT_NOT_FOUND', 404)
    }

    // ── Deactivate (marks isActive=false, stops the scheduler from picking it up) ─
    if (endpoint.isActive) {
      endpoint.deactivate(ctx.executingUserId)
      endpoint.pullEvents()
    }

    await this.endpointRepo.delete(id, ctx.tenantId)

    // ── Cancel all PENDING deliveries for this endpoint ──────────────────────
    const cancelled = await this.prisma.webhookDelivery.updateMany({
      where: {
        webhookEndpointId: cmd.id,
        status: 'PENDING',
      },
      data: {
        status: 'FAILED',
        responseBody: 'Cancelled: webhook endpoint was deleted',
        updatedAt: new Date(),
      },
    })

    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'DELETE_WEBHOOK_ENDPOINT',
      entityType: 'WebhookEndpoint',
      entityId: cmd.id,
      after: { deletedAt: new Date().toISOString(), cancelledDeliveries: cancelled.count },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }
}
