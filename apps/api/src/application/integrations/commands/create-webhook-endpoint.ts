/**
 * CreateWebhookEndpointHandler
 *
 * 1. Validates the URL is reachable by sending a test ping (HEAD or GET with a
 *    30-second timeout).  Non-2xx responses are accepted — the endpoint may
 *    reject PINGs intentionally; we only care that the host is reachable.
 *    DNS resolution failures or timeouts are rejected.
 * 2. Generates a random HMAC-SHA256 secret (80 hex chars).
 * 3. Persists the WebhookEndpoint domain aggregate via the repository.
 * 4. Writes an AuditLog row.
 */
import type { PrismaClient } from '@prisma/client'
import { WebhookEndpoint, WebhookEndpointId } from '@maintainhub/domain'
import type { WebhookEndpointRepository, WebhookEventType } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { generateId, generateWebhookSecret, writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

// ── Command ───────────────────────────────────────────────────────────────────

export interface CreateWebhookEndpointCommand {
  url: string
  events: WebhookEventType[]
  /** If provided, the caller supplies their own secret (min 32 chars). */
  secret?: string
}

// ── Result ────────────────────────────────────────────────────────────────────

export interface CreateWebhookEndpointResult {
  id: string
  secret: string
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class CreateWebhookEndpointHandler {
  constructor(
    private readonly db: TenantClient,
    private readonly prisma: PrismaClient,
    private readonly endpointRepo: WebhookEndpointRepository,
  ) {}

  async handle(
    cmd: CreateWebhookEndpointCommand,
    ctx: CommandContext,
  ): Promise<CreateWebhookEndpointResult> {
    // ── 1. Validate URL reachability ──────────────────────────────────────────
    await CreateWebhookEndpointHandler.pingUrl(cmd.url)

    // ── 2. Generate or use provided secret ───────────────────────────────────
    const secret = cmd.secret ?? generateWebhookSecret()

    // ── 3. Build domain aggregate (validates URL format, secret length, events) ──
    const id = new WebhookEndpointId(generateId())
    const endpoint = WebhookEndpoint.create({
      id,
      tenantId: ctx.tenantId,
      url: cmd.url,
      secret,
      events: cmd.events,
      createdById: ctx.executingUserId,
    })

    // ── 4. Persist ────────────────────────────────────────────────────────────
    await this.endpointRepo.save(endpoint)

    // ── 5. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'CREATE_WEBHOOK_ENDPOINT',
      entityType: 'WebhookEndpoint',
      entityId: id.value,
      after: { url: cmd.url, events: cmd.events, isActive: false },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return { id: id.value, secret }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private static async pingUrl(url: string): Promise<void> {
    try {
      await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10_000),
        headers: { 'User-Agent': 'MaintainHub-WebhookPing/1.0' },
      })
      // Any response (including 4xx) means the host is reachable
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new DomainException(
          `Webhook URL timed out after 10 seconds: ${url}`,
          'WEBHOOK_URL_UNREACHABLE',
          422,
        )
      }
      throw new DomainException(
        `Webhook URL is not reachable: ${err instanceof Error ? err.message : String(err)}`,
        'WEBHOOK_URL_UNREACHABLE',
        422,
      )
    }
  }
}
