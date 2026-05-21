/**
 * DispatchWebhookEventUseCase
 *
 * Bridge between domain events and external webhook endpoints.
 * Called by `DomainEventPublisher` after all internal event handlers have run.
 *
 * ## Flow
 *
 *   1. Map the domain event's `eventType` to a `WebhookEventType`.
 *   2. Find all active webhook endpoints for this tenant that subscribe to
 *      the given event type (via `WebhookEndpointRepository.findActiveByEventType`).
 *   3. For each endpoint:
 *      a. Create a new `WebhookDelivery` domain entity (status = PENDING).
 *      b. Persist the delivery record.
 *      c. Enqueue a BullMQ job on the `webhook-delivery` queue with LIFO
 *         ordering so the most recent event is processed first.
 *   4. Log counts.
 *
 * ## Non-blocking
 * All delivery enqueueing is done in parallel.  Individual failures are caught
 * and logged — a single bad endpoint must not block delivery to other endpoints.
 *
 * ## LIFO ordering
 * BullMQ supports LIFO via `{ lifo: true }` in job options.  This ensures
 * real-time events (e.g. SLA breach) are not queued behind a backlog of
 * older lower-priority events.
 */
import { Queue } from 'bullmq'
import type IORedis from 'ioredis'
import { WebhookDelivery, WebhookDeliveryId } from '@maintainhub/domain'
import type {
  WebhookEndpointRepository,
  WebhookDeliveryRepository,
  WebhookEventType,
  BaseDomainEvent,
} from '@maintainhub/domain'

// ── Queue name & job data ─────────────────────────────────────────────────────

export const WEBHOOK_DELIVERY_QUEUE = 'webhook-delivery'

export interface WebhookDeliveryJobData {
  deliveryId: string
  endpointId: string
  tenantId: string
  eventType: WebhookEventType
  payload: Record<string, unknown>
}

// ── Domain event type → WebhookEventType mapping ──────────────────────────────

const EVENT_TYPE_MAP: Partial<Record<string, WebhookEventType>> = {
  WorkOrderCreated: 'WORK_ORDER_CREATED',
  WorkOrderAssigned: 'WORK_ORDER_ASSIGNED',
  WorkOrderCompleted: 'WORK_ORDER_COMPLETED',
  SLABreached: 'WORK_ORDER_SLA_BREACHED',
  AssetStatusChanged: 'ASSET_STATUS_CHANGED',
  AssetDecommissioned: 'ASSET_DECOMMISSIONED',
  PMTriggered: 'PM_TRIGGERED',
}

// ── Logger interface ──────────────────────────────────────────────────────────

export interface DispatchLogger {
  info(data: object | string, msg?: string): void
  warn(data: object | string, msg?: string): void
  error(data: object | string, msg?: string): void
}

// ── Use case ──────────────────────────────────────────────────────────────────

export class DispatchWebhookEventUseCase {
  private readonly deliveryQueue: Queue<WebhookDeliveryJobData>

  constructor(
    private readonly endpointRepo: WebhookEndpointRepository,
    private readonly deliveryRepo: WebhookDeliveryRepository,
    private readonly logger: DispatchLogger,
    redis: IORedis,
  ) {
    this.deliveryQueue = new Queue<WebhookDeliveryJobData>(WEBHOOK_DELIVERY_QUEUE, {
      connection: redis,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { count: 10_000 } as const,
        removeOnFail: { count: 50_000 } as const,
      },
    })
  }

  /**
   * Dispatch a domain event to all subscribed webhook endpoints for the tenant.
   *
   * @param event     The domain event emitted by an aggregate.
   * @param tenantId  The tenant that owns the aggregate.
   * @param payload   The serialised event payload (plain object, JSON-safe).
   * @returns         Number of deliveries enqueued.
   */
  async dispatch(
    event: BaseDomainEvent,
    tenantId: string,
    payload: Record<string, unknown>,
  ): Promise<number> {
    const webhookEventType = EVENT_TYPE_MAP[event.eventType]

    if (webhookEventType === undefined) {
      // Event type has no webhook mapping — silently skip
      return 0
    }

    // ── 1. Find subscribed endpoints ────────────────────────────────────────
    const endpoints = await this.endpointRepo.findActiveByEventType(webhookEventType, tenantId)

    if (endpoints.length === 0) return 0

    // ── 2. Create delivery records + enqueue jobs ───────────────────────────
    let enqueued = 0

    await Promise.allSettled(
      endpoints.map(async (endpoint) => {
        try {
          // Build a deterministic, CUID-safe delivery ID: c + 24 [0-9a-z] chars
          const rawPart = `${event.eventId.toLowerCase().replace(/[^0-9a-z]/g, '')}${endpoint.id.value.toLowerCase().replace(/[^0-9a-z]/g, '')}`
          const safeId = `c${rawPart.slice(0, 24).padEnd(24, '0')}`

          const delivery = WebhookDelivery.create({
            id: new WebhookDeliveryId(safeId),
            webhookEndpointId: endpoint.id.value,
            event: webhookEventType,
            payload,
          })

          await this.deliveryRepo.save(delivery)

          // Enqueue with LIFO so newest events are processed first
          await this.deliveryQueue.add(
            WEBHOOK_DELIVERY_QUEUE,
            {
              deliveryId: delivery.id.value,
              endpointId: endpoint.id.value,
              tenantId,
              eventType: webhookEventType,
              payload,
            },
            {
              lifo: true,
              jobId: `whdl:${delivery.id.value}`,
            },
          )

          enqueued += 1
        } catch (err) {
          this.logger.error(
            { err, endpointId: endpoint.id.value, eventType: webhookEventType },
            'DispatchWebhookEventUseCase: failed to enqueue delivery',
          )
        }
      }),
    )

    this.logger.info(
      { webhookEventType, tenantId, endpoints: endpoints.length, enqueued },
      'DispatchWebhookEventUseCase: dispatched',
    )

    return enqueued
  }
}
