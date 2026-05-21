/**
 * GetWebhookDeliveryHistoryHandler
 *
 * Returns paginated webhook delivery records for a tenant, with optional
 * filters for endpoint, status, and event type.
 *
 * Also supports a `replay` flag: when true, the delivery's raw payload is
 * included in the DTO so callers can re-send it without a separate lookup.
 */
import type { PrismaClient } from '@prisma/client'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import type { QueryContext, WebhookDeliveryDto, WebhookDeliveryListResult } from './query.types.js'

// ── Query ─────────────────────────────────────────────────────────────────────

export interface GetWebhookDeliveryHistoryQuery {
  endpointId?: string
  status?: 'PENDING' | 'DELIVERED' | 'FAILED'
  event?: string
  /** Include full payload in the DTO. @default false */
  includePayload?: boolean
  cursor?: string
  limit?: number
}

// ── Extended DTO (when includePayload = true) ─────────────────────────────────

export interface WebhookDeliveryDetailDto extends WebhookDeliveryDto {
  payload?: Record<string, unknown>
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class GetWebhookDeliveryHistoryHandler {
  constructor(
    private readonly db: TenantClient,
    private readonly prisma: PrismaClient,
  ) {}

  async handle(
    query: GetWebhookDeliveryHistoryQuery,
    ctx: QueryContext,
  ): Promise<WebhookDeliveryListResult & { items: WebhookDeliveryDetailDto[] }> {
    const limit = Math.min(query.limit ?? 50, 200)

    // ── Build endpoint ID filter ──────────────────────────────────────────────
    // Must join through WebhookEndpoint to enforce tenant scoping
    const endpointIds = await this.resolveEndpointIds(query.endpointId, ctx.tenantId)

    if (endpointIds.length === 0 && query.endpointId !== undefined) {
      return { items: [], total: 0, nextCursor: null }
    }

    const where = {
      ...(endpointIds.length > 0 && { webhookEndpointId: { in: endpointIds } }),
      ...(query.status !== undefined && { status: query.status }),
      ...(query.event !== undefined && { event: query.event }),
    }

    const [rows, total] = await Promise.all([
      this.prisma.webhookDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(query.cursor !== undefined && { cursor: { id: query.cursor }, skip: 1 }),
        include: { endpoint: { select: { url: true } } },
      }),
      this.prisma.webhookDelivery.count({ where }),
    ])

    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore ? (pageRows.at(-1)?.id ?? null) : null

    const items: WebhookDeliveryDetailDto[] = pageRows.map((r) => ({
      id: r.id,
      webhookEndpointId: r.webhookEndpointId,
      endpointUrl: (r as unknown as { endpoint: { url: string } }).endpoint.url,
      event: r.event,
      status: r.status,
      attemptCount: r.attemptCount,
      lastAttemptAt: r.lastAttemptAt?.toISOString() ?? null,
      responseCode: r.responseCode ?? null,
      responseBody: r.responseBody ?? null,
      nextRetryAt: r.nextRetryAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      ...(query.includePayload === true && { payload: r.payload as Record<string, unknown> }),
    }))

    return { items, total, nextCursor }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async resolveEndpointIds(
    endpointId: string | undefined,
    tenantId: string,
  ): Promise<string[]> {
    if (endpointId !== undefined) {
      // Single endpoint — verify it belongs to this tenant
      const ep = await this.prisma.webhookEndpoint.findFirst({
        where: { id: endpointId, tenantId },
        select: { id: true },
      })
      return ep !== null ? [ep.id] : []
    }

    // All endpoints for tenant
    const eps = await this.prisma.webhookEndpoint.findMany({
      where: { tenantId },
      select: { id: true },
    })
    return eps.map((e) => e.id)
  }
}
