/**
 * Unit tests for DispatchWebhookEventUseCase and GetWebhookDeliveryHistoryHandler.
 */

import { WebhookEndpoint, WebhookEndpointId } from '@maintainhub/domain'
import type { WebhookEventType } from '@maintainhub/domain'
import { DispatchWebhookEventUseCase } from '../../DispatchWebhookEventUseCase.js'
import { GetWebhookDeliveryHistoryHandler } from '../get-webhook-delivery-history.js'
import type { QueryContext } from '../query.types.js'

jest.mock('bullmq', () => ({
  Queue: class MockQueue {
    add = jest.fn().mockResolvedValue({ id: 'job-1' })

    close = jest.fn().mockResolvedValue(undefined)
  },
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENDPOINT_ID = 'clh7z2d1h0000z1x1z1x1z1x1'
const DELIVERY_ID = 'clh7z2d1h0001z1x1z1x1z1x2'
const TENANT_ID = 'tenant-1'
const USER_ID = 'user-1'
const VALID_URL = 'https://hooks.example.com/test'
const VALID_SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1234'

const qryCtx: QueryContext = {
  executingUserId: USER_ID,
  tenantId: TENANT_ID,
  userRole: 'ADMIN',
}

function makeEndpoint(subscribed: string[] = ['WORK_ORDER_CREATED']) {
  return WebhookEndpoint.reconstitute({
    id: new WebhookEndpointId(ENDPOINT_ID),
    tenantId: TENANT_ID,
    url: VALID_URL,
    secret: VALID_SECRET,
    events: subscribed as WebhookEventType[],
    isActive: true,
    failureCount: 0,
    lastDeliveredAt: undefined,
    createdById: USER_ID,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date(),
  })
}

function makeEndpointRepo(endpoints: ReturnType<typeof makeEndpoint>[] = [makeEndpoint()]) {
  return {
    findActiveByEventType: jest.fn().mockResolvedValue(endpoints),
    findByTenant: jest.fn().mockResolvedValue(endpoints),
    save: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue(endpoints[0]),
    delete: jest.fn().mockResolvedValue(undefined),
  }
}

function makeDeliveryRepo() {
  return {
    save: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue(undefined),
    findPendingRetries: jest.fn().mockResolvedValue([]),
    findByEndpoint: jest.fn().mockResolvedValue([]),
  }
}

function makeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}

function makeEvent(eventType: string) {
  return {
    eventType,
    eventId: `evt-${Date.now()}`,
    aggregateId: 'agg-1',
    tenantId: TENANT_ID,
    occurredAt: new Date(),
  }
}

// ── DispatchWebhookEventUseCase ───────────────────────────────────────────────

describe('DispatchWebhookEventUseCase', () => {
  it('enqueues delivery for a subscribed event type', async () => {
    const endpointRepo = makeEndpointRepo()
    const deliveryRepo = makeDeliveryRepo()
    const logger = makeLogger()
    const useCase = new DispatchWebhookEventUseCase(
      endpointRepo as never,
      deliveryRepo as never,
      logger,
      {} as never,
    )

    const count = await useCase.dispatch(makeEvent('WorkOrderCreated') as never, TENANT_ID, {
      id: 'wo-1',
      status: 'OPEN',
    })

    expect(count).toBe(1)
    expect(deliveryRepo.save).toHaveBeenCalledTimes(1)
  })

  it('returns 0 for an unmapped event type', async () => {
    const endpointRepo = makeEndpointRepo()
    const deliveryRepo = makeDeliveryRepo()
    const useCase = new DispatchWebhookEventUseCase(
      endpointRepo as never,
      deliveryRepo as never,
      makeLogger(),
      {} as never,
    )

    const count = await useCase.dispatch(makeEvent('UnknownEventType') as never, TENANT_ID, {})

    expect(count).toBe(0)
    expect(deliveryRepo.save).not.toHaveBeenCalled()
    expect(endpointRepo.findActiveByEventType).not.toHaveBeenCalled()
  })

  it('returns 0 when no endpoints are subscribed', async () => {
    const endpointRepo = makeEndpointRepo([])
    const deliveryRepo = makeDeliveryRepo()
    const useCase = new DispatchWebhookEventUseCase(
      endpointRepo as never,
      deliveryRepo as never,
      makeLogger(),
      {} as never,
    )

    const count = await useCase.dispatch(makeEvent('WorkOrderCreated') as never, TENANT_ID, {})

    expect(count).toBe(0)
    expect(deliveryRepo.save).not.toHaveBeenCalled()
  })

  it('dispatches to multiple endpoints', async () => {
    const endpoints = [makeEndpoint(), makeEndpoint()]
    const endpointRepo = makeEndpointRepo(endpoints)
    const deliveryRepo = makeDeliveryRepo()
    const useCase = new DispatchWebhookEventUseCase(
      endpointRepo as never,
      deliveryRepo as never,
      makeLogger(),
      {} as never,
    )

    const count = await useCase.dispatch(makeEvent('WorkOrderCreated') as never, TENANT_ID, {})

    expect(count).toBe(2)
    expect(deliveryRepo.save).toHaveBeenCalledTimes(2)
  })

  it('continues dispatching to other endpoints when one fails', async () => {
    const endpoints = [makeEndpoint(), makeEndpoint()]
    const endpointRepo = makeEndpointRepo(endpoints)
    const deliveryRepo = makeDeliveryRepo()
    deliveryRepo.save = jest
      .fn()
      .mockRejectedValueOnce(new Error('DB error on first'))
      .mockResolvedValue(undefined)

    const logger = makeLogger()
    const useCase = new DispatchWebhookEventUseCase(
      endpointRepo as never,
      deliveryRepo as never,
      logger,
      {} as never,
    )

    const count = await useCase.dispatch(makeEvent('WorkOrderCreated') as never, TENANT_ID, {})

    // Only 1 succeeded (the first failed)
    expect(count).toBe(1)
    expect(logger.error).toHaveBeenCalledTimes(1)
  })

  it('maps all 8 event types correctly', async () => {
    const mappings: Array<[string, string]> = [
      ['WorkOrderCreated', 'WORK_ORDER_CREATED'],
      ['WorkOrderAssigned', 'WORK_ORDER_ASSIGNED'],
      ['WorkOrderCompleted', 'WORK_ORDER_COMPLETED'],
      ['SLABreached', 'WORK_ORDER_SLA_BREACHED'],
      ['AssetStatusChanged', 'ASSET_STATUS_CHANGED'],
      ['AssetDecommissioned', 'ASSET_DECOMMISSIONED'],
      ['PMTriggered', 'PM_TRIGGERED'],
    ]

    await Promise.all(
      mappings.map(async ([domainType, webhookType]) => {
        const endpointRepo = makeEndpointRepo([makeEndpoint([webhookType as WebhookEventType])])
        const deliveryRepo = makeDeliveryRepo()
        const useCase = new DispatchWebhookEventUseCase(
          endpointRepo as never,
          deliveryRepo as never,
          makeLogger(),
          {} as never,
        )

        const count = await useCase.dispatch(makeEvent(domainType) as never, TENANT_ID, {})
        expect(count).toBe(1)

        const called = endpointRepo.findActiveByEventType.mock.calls[0] as [string]
        expect(called[0]).toBe(webhookType)
      }),
    )
  })
})

// ── GetWebhookDeliveryHistoryHandler ──────────────────────────────────────────

describe('GetWebhookDeliveryHistoryHandler', () => {
  function makeDeliveryRow(status = 'DELIVERED') {
    return {
      id: DELIVERY_ID,
      webhookEndpointId: ENDPOINT_ID,
      event: 'WORK_ORDER_CREATED',
      payload: { id: 'wo-1' },
      status,
      attemptCount: 1,
      lastAttemptAt: new Date('2024-03-15'),
      responseCode: status === 'DELIVERED' ? 200 : null,
      responseBody: status === 'DELIVERED' ? 'ok' : 'error',
      nextRetryAt: status === 'FAILED' ? new Date(Date.now() + 60_000) : null,
      createdAt: new Date('2024-03-15'),
      endpoint: { url: VALID_URL },
    }
  }

  function makePrismaWithDeliveries(rows: ReturnType<typeof makeDeliveryRow>[]) {
    return {
      webhookEndpoint: {
        findFirst: jest.fn().mockResolvedValue({ id: ENDPOINT_ID }),
        findMany: jest.fn().mockResolvedValue([{ id: ENDPOINT_ID }]),
      },
      webhookDelivery: {
        findMany: jest.fn().mockResolvedValue(rows),
        count: jest.fn().mockResolvedValue(rows.length),
      },
    }
  }

  it('returns paginated delivery history', async () => {
    const rows = [makeDeliveryRow('DELIVERED'), makeDeliveryRow('FAILED')]
    const prisma = makePrismaWithDeliveries(rows)
    const db = { pMSchedule: { findMany: jest.fn() } }
    const handler = new GetWebhookDeliveryHistoryHandler(db as never, prisma as never)

    const result = await handler.handle({}, qryCtx)

    expect(result.items).toHaveLength(2)
    expect(result.total).toBe(2)
    expect(result.nextCursor).toBeNull()
    expect(result.items[0]!.endpointUrl).toBe(VALID_URL)
  })

  it('filters by status', async () => {
    const prisma = makePrismaWithDeliveries([makeDeliveryRow('FAILED')])
    const handler = new GetWebhookDeliveryHistoryHandler({} as never, prisma as never)

    await handler.handle({ status: 'FAILED' }, qryCtx)

    const whereArg = prisma.webhookDelivery.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>
    }
    expect(whereArg.where.status).toBe('FAILED')
  })

  it('includes payload when includePayload=true', async () => {
    const prisma = makePrismaWithDeliveries([makeDeliveryRow()])
    const handler = new GetWebhookDeliveryHistoryHandler({} as never, prisma as never)

    const result = await handler.handle({ includePayload: true }, qryCtx)

    expect(result.items[0]!.payload).toEqual({ id: 'wo-1' })
  })

  it('excludes payload when includePayload=false (default)', async () => {
    const prisma = makePrismaWithDeliveries([makeDeliveryRow()])
    const handler = new GetWebhookDeliveryHistoryHandler({} as never, prisma as never)

    const result = await handler.handle({}, qryCtx)

    expect(result.items[0]!.payload).toBeUndefined()
  })

  it('returns empty when endpoint not found for tenant', async () => {
    const prisma = {
      webhookEndpoint: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      webhookDelivery: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    }
    const handler = new GetWebhookDeliveryHistoryHandler({} as never, prisma as never)

    const result = await handler.handle({ endpointId: 'unknown-id' }, qryCtx)

    expect(result.items).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it('returns next cursor when more rows than limit', async () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({ ...makeDeliveryRow(), id: `id${i}` }))
    const prisma = makePrismaWithDeliveries(rows)
    prisma.webhookDelivery.count = jest.fn().mockResolvedValue(10)
    const handler = new GetWebhookDeliveryHistoryHandler({} as never, prisma as never)

    const result = await handler.handle({ limit: 3 }, qryCtx)

    expect(result.items).toHaveLength(3)
    expect(result.nextCursor).toBe('id2')
  })
})
