/* eslint-disable max-classes-per-file */
/**
 * PrismaWebhookRepository
 *
 * Implements both `WebhookEndpointRepository` and `WebhookDeliveryRepository`
 * using the Prisma ORM against the `WebhookEndpoint` and `WebhookDelivery`
 * tables added in the integrations schema migration.
 */
import type { PrismaClient, Prisma } from '@prisma/client'
import {
  WebhookEndpoint,
  WebhookEndpointId,
  WebhookDelivery,
  WebhookDeliveryId,
} from '@maintainhub/domain'
import type {
  WebhookEndpointRepository,
  WebhookDeliveryRepository,
  WebhookEndpointProps,
  WebhookDeliveryProps,
  WebhookEventType,
} from '@maintainhub/domain'

// ── Row → Domain mappers ──────────────────────────────────────────────────────

type PrismaEndpointRow = Prisma.WebhookEndpointGetPayload<Record<string, never>>
type PrismaDeliveryRow = Prisma.WebhookDeliveryGetPayload<Record<string, never>>

function endpointToDomain(row: PrismaEndpointRow): WebhookEndpoint {
  const props: WebhookEndpointProps = {
    id: new WebhookEndpointId(row.id),
    tenantId: row.tenantId,
    url: row.url,
    secret: row.secret,
    events: row.events as WebhookEventType[],
    isActive: row.isActive,
    failureCount: row.failureCount,
    lastDeliveredAt: row.lastDeliveredAt ?? undefined,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
  return WebhookEndpoint.reconstitute(props)
}

function deliveryToDomain(row: PrismaDeliveryRow): WebhookDelivery {
  const props: WebhookDeliveryProps = {
    id: new WebhookDeliveryId(row.id),
    webhookEndpointId: row.webhookEndpointId,
    event: row.event as WebhookEventType,
    payload: row.payload as Record<string, unknown>,
    status: row.status as 'PENDING' | 'DELIVERED' | 'FAILED',
    attemptCount: row.attemptCount,
    lastAttemptAt: row.lastAttemptAt ?? undefined,
    responseCode: row.responseCode ?? undefined,
    responseBody: row.responseBody ?? undefined,
    nextRetryAt: row.nextRetryAt ?? undefined,
    createdAt: row.createdAt,
  }
  return WebhookDelivery.reconstitute(props)
}

// ── WebhookEndpoint repository ────────────────────────────────────────────────

export class PrismaWebhookEndpointRepository implements WebhookEndpointRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(endpoint: WebhookEndpoint): Promise<void> {
    await this.prisma.webhookEndpoint.create({
      data: {
        id: endpoint.id.value,
        tenantId: endpoint.tenantId,
        url: endpoint.url,
        secret: endpoint.secret,
        events: [...endpoint.events],
        isActive: endpoint.isActive,
        failureCount: endpoint.failureCount,
        createdById: endpoint.createdById,
        createdAt: endpoint.createdAt,
        updatedAt: endpoint.updatedAt,
        ...(endpoint.lastDeliveredAt !== undefined && {
          lastDeliveredAt: endpoint.lastDeliveredAt,
        }),
      },
    })
  }

  async update(endpoint: WebhookEndpoint): Promise<void> {
    await this.prisma.webhookEndpoint.update({
      where: { id: endpoint.id.value },
      data: {
        url: endpoint.url,
        secret: endpoint.secret,
        events: [...endpoint.events],
        isActive: endpoint.isActive,
        failureCount: endpoint.failureCount,
        updatedAt: endpoint.updatedAt,
        lastDeliveredAt: endpoint.lastDeliveredAt ?? null,
      },
    })
  }

  async findById(id: WebhookEndpointId, tenantId: string): Promise<WebhookEndpoint | undefined> {
    const row = await this.prisma.webhookEndpoint.findFirst({
      where: { id: id.value, tenantId },
    })
    return row !== null ? endpointToDomain(row) : undefined
  }

  async delete(id: WebhookEndpointId, tenantId: string): Promise<void> {
    await this.prisma.webhookEndpoint.updateMany({
      where: { id: id.value, tenantId },
      data: { isActive: false },
    })
  }

  async findByTenant(tenantId: string): Promise<WebhookEndpoint[]> {
    const rows = await this.prisma.webhookEndpoint.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(endpointToDomain)
  }

  async findActiveByEventType(
    eventType: WebhookEventType,
    tenantId: string,
  ): Promise<WebhookEndpoint[]> {
    // PostgreSQL array contains operator: events @> ARRAY[eventType]
    const rows = await this.prisma.webhookEndpoint.findMany({
      where: {
        tenantId,
        isActive: true,
        events: { has: eventType },
      },
    })
    return rows.map(endpointToDomain)
  }
}

// ── WebhookDelivery repository ────────────────────────────────────────────────

export class PrismaWebhookDeliveryRepository implements WebhookDeliveryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(delivery: WebhookDelivery): Promise<void> {
    await this.prisma.webhookDelivery.create({
      data: {
        id: delivery.id.value,
        webhookEndpointId: delivery.webhookEndpointId,
        event: delivery.event,
        payload: delivery.payload as Prisma.InputJsonValue,
        status: delivery.status,
        attemptCount: delivery.attemptCount,
        createdAt: delivery.createdAt,
        updatedAt: new Date(),
        ...(delivery.lastAttemptAt !== undefined && { lastAttemptAt: delivery.lastAttemptAt }),
        ...(delivery.responseCode !== undefined && { responseCode: delivery.responseCode }),
        ...(delivery.responseBody !== undefined && { responseBody: delivery.responseBody }),
        ...(delivery.nextRetryAt !== undefined && { nextRetryAt: delivery.nextRetryAt }),
      },
    })
  }

  async update(delivery: WebhookDelivery): Promise<void> {
    await this.prisma.webhookDelivery.update({
      where: { id: delivery.id.value },
      data: {
        status: delivery.status,
        attemptCount: delivery.attemptCount,
        updatedAt: new Date(),
        lastAttemptAt: delivery.lastAttemptAt ?? null,
        responseCode: delivery.responseCode ?? null,
        responseBody: delivery.responseBody ?? null,
        nextRetryAt: delivery.nextRetryAt ?? null,
      },
    })
  }

  async findById(id: WebhookDeliveryId): Promise<WebhookDelivery | undefined> {
    const row = await this.prisma.webhookDelivery.findUnique({
      where: { id: id.value },
    })
    return row !== null ? deliveryToDomain(row) : undefined
  }

  async findPendingRetries(now: Date, limit = 100): Promise<WebhookDelivery[]> {
    const rows = await this.prisma.webhookDelivery.findMany({
      where: {
        status: 'FAILED',
        nextRetryAt: { lte: now },
      },
      orderBy: { nextRetryAt: 'asc' },
      take: limit,
    })
    return rows.map(deliveryToDomain)
  }

  async findByEndpoint(endpointId: string, limit = 50): Promise<WebhookDelivery[]> {
    const rows = await this.prisma.webhookDelivery.findMany({
      where: { webhookEndpointId: endpointId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return rows.map(deliveryToDomain)
  }
}
