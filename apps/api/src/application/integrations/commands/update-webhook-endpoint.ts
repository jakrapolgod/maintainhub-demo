import type { PrismaClient } from '@prisma/client'
import { WebhookEndpointId } from '@maintainhub/domain'
import type { WebhookEndpointRepository, WebhookEventType } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import { writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

export interface UpdateWebhookEndpointCommand {
  id: string
  url?: string
  events?: WebhookEventType[]
  isActive?: boolean
}

export class UpdateWebhookEndpointHandler {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly endpointRepo: WebhookEndpointRepository,
  ) {}

  async handle(cmd: UpdateWebhookEndpointCommand, ctx: CommandContext): Promise<void> {
    const id = new WebhookEndpointId(cmd.id)
    const endpoint = await this.endpointRepo.findById(id, ctx.tenantId)

    if (endpoint === undefined) {
      throw new DomainException('Webhook endpoint not found', 'WEBHOOK_ENDPOINT_NOT_FOUND', 404)
    }

    if (cmd.url !== undefined) endpoint.updateUrl(cmd.url)
    if (cmd.events !== undefined) endpoint.updateEvents(cmd.events)

    if (cmd.isActive !== undefined) {
      if (cmd.isActive && !endpoint.isActive) {
        endpoint.activate(ctx.executingUserId)
      } else if (!cmd.isActive && endpoint.isActive) {
        endpoint.deactivate(ctx.executingUserId)
      }
    }

    // Drain events (activate/deactivate emit events but we don't dispatch here)
    endpoint.pullEvents()

    await this.endpointRepo.update(endpoint)

    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'UPDATE_WEBHOOK_ENDPOINT',
      entityType: 'WebhookEndpoint',
      entityId: cmd.id,
      after: {
        ...(cmd.url !== undefined && { url: cmd.url }),
        ...(cmd.events !== undefined && { events: cmd.events }),
        ...(cmd.isActive !== undefined && { isActive: cmd.isActive }),
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }
}
