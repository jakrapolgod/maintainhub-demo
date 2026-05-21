/**
 * WebhookRetryJob — BullMQ repeatable job, runs every 5 minutes.
 *
 * ## What it does each run
 *
 *  1. Queries WebhookDelivery rows where:
 *       status = 'FAILED'
 *       nextRetryAt <= now
 *       (shouldRetry is enforced by the domain entity after loading)
 *
 *  2. For each eligible delivery:
 *     a. Loads the parent WebhookEndpoint to get url + secret.
 *     b. Re-attempts the HTTP delivery via WebhookDeliveryService.
 *     c. On terminal failure (no more retries):
 *        - Increments endpoint.failureCount via a direct DB update.
 *        - Publishes a circuit-breaker alert if failureCount > threshold.
 *
 *  3. Logs: delivered, failed, skipped counts.
 *
 * ## Circuit breaker
 * When an endpoint accumulates more than WEBHOOK_FAILURE_ALERT_THRESHOLD
 * permanent failures, the job deactivates the endpoint and publishes an alert
 * to the monitoring queue so the tenant admin is notified.
 */
import { createHmac } from 'node:crypto'
import { Queue, Worker } from 'bullmq'
import type { Job } from 'bullmq'
import type IORedis from 'ioredis'
import type { PrismaClient } from '@prisma/client'
import { WebhookDelivery, WebhookDeliveryId } from '@maintainhub/domain'
import type { WebhookEventType, DeliveryStatus } from '@maintainhub/domain'
import {
  WEBHOOK_RETRY_QUEUE,
  WEBHOOK_RETRY_JOB_NAME,
  WEBHOOK_RETRY_INTERVAL_MS,
  WEBHOOK_FAILURE_ALERT_THRESHOLD,
  WEBHOOK_RETRY_BATCH_SIZE,
} from './webhook-retry-constants.js'
import { MONITORING_QUEUE, BULLMQ_CRITICAL_PRIORITY } from './pm-scheduler-constants.js'
import type { SlaCheckerLogger } from './sla-checker-types.js'

// ── Inline delivery HTTP logic (mirrors WebhookDeliveryService without import) ─

const DELIVERY_TIMEOUT_MS = 10_000

async function httpPost(
  url: string,
  body: string,
  secret: string,
  deliveryId: string,
  eventType: string,
): Promise<{ success: boolean; responseCode?: number; responseBody: string }> {
  const hmac = createHmac('sha256', secret)
  hmac.update(body, 'utf8')
  const signature = `sha256=${hmac.digest('hex')}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MaintainHub-Webhook/1.0',
        'X-MaintainHub-Signature': signature,
        'X-MaintainHub-Delivery': deliveryId,
        'X-MaintainHub-Event': eventType,
      },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    })
    const text = await res.text().catch(() => '')
    return { success: res.ok, responseCode: res.status, responseBody: text.slice(0, 4_096) }
  } catch (err) {
    return {
      success: false,
      responseBody: (err instanceof Error ? err.message : String(err)).slice(0, 4_096),
    }
  }
}

// ── Row shape returned by Prisma ──────────────────────────────────────────────

interface DeliveryRow {
  id: string
  webhookEndpointId: string
  event: string
  payload: unknown
  status: string
  attemptCount: number
  lastAttemptAt: Date | null
  responseCode: number | null
  responseBody: string | null
  nextRetryAt: Date | null
  createdAt: Date
}

interface EndpointRow {
  id: string
  tenantId: string
  url: string
  secret: string
  isActive: boolean
  failureCount: number
}

// ── Processor ─────────────────────────────────────────────────────────────────

export class WebhookRetryProcessor {
  private readonly monitoringQueue: Queue<Record<string, unknown>>

  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: SlaCheckerLogger,
    redis: IORedis,
  ) {
    this.monitoringQueue = new Queue(MONITORING_QUEUE, { connection: redis })
  }

  async run(): Promise<{ retried: number; delivered: number; failed: number }> {
    const now = new Date()
    let retried = 0
    let delivered = 0
    let failed = 0

    // ── 1. Fetch pending retries ───────────────────────────────────────────────
    const rows = (await this.prisma.webhookDelivery.findMany({
      where: {
        status: 'FAILED',
        nextRetryAt: { lte: now },
      },
      orderBy: { nextRetryAt: 'asc' },
      take: WEBHOOK_RETRY_BATCH_SIZE,
    })) as DeliveryRow[]

    this.logger.info({ count: rows.length, now: now.toISOString() }, 'WebhookRetry: starting run')

    for (const row of rows) {
      retried += 1

      // Reconstitute domain entity
      const delivery = WebhookDelivery.reconstitute({
        id: new WebhookDeliveryId(row.id),
        webhookEndpointId: row.webhookEndpointId,
        event: row.event as WebhookEventType,
        payload: row.payload as Record<string, unknown>,
        status: row.status as DeliveryStatus,
        attemptCount: row.attemptCount,
        lastAttemptAt: row.lastAttemptAt ?? undefined,
        responseCode: row.responseCode ?? undefined,
        responseBody: row.responseBody ?? undefined,
        nextRetryAt: row.nextRetryAt ?? undefined,
        createdAt: row.createdAt,
      })

      if (!delivery.shouldRetry()) {
        // Already exhausted — skip
        continue // eslint-disable-line no-continue
      }

      // ── 2. Load endpoint ───────────────────────────────────────────────────
      // eslint-disable-next-line no-await-in-loop
      const endpoint = (await this.prisma.webhookEndpoint.findUnique({
        where: { id: row.webhookEndpointId },
      })) as EndpointRow | null

      if (!endpoint || !endpoint.isActive) {
        continue // eslint-disable-line no-continue
      }

      // ── 3. Retry delivery ──────────────────────────────────────────────────
      delivery.resetForRetry()
      const body = JSON.stringify(delivery.payload)
      // eslint-disable-next-line no-await-in-loop
      const result = await httpPost(
        endpoint.url,
        body,
        endpoint.secret,
        delivery.id.value,
        delivery.event,
      )

      if (result.success && result.responseCode !== undefined) {
        delivery.markDelivered(result.responseCode, result.responseBody)
        delivered += 1
        this.logger.info(
          { deliveryId: delivery.id.value, url: endpoint.url, status: result.responseCode },
          'WebhookRetry: delivery succeeded',
        )
      } else {
        delivery.markFailed(
          result.responseCode !== undefined
            ? `HTTP ${result.responseCode}: ${result.responseBody}`
            : result.responseBody,
        )
        failed += 1
        this.logger.warn(
          { deliveryId: delivery.id.value, url: endpoint.url, error: result.responseBody },
          'WebhookRetry: delivery failed again',
        )
      }

      // ── 4. Persist delivery outcome ────────────────────────────────────────
      // eslint-disable-next-line no-await-in-loop
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

      // ── 5. Circuit-breaker: terminal failure on this delivery ──────────────
      if (!delivery.shouldRetry() && delivery.status === 'FAILED') {
        // eslint-disable-next-line no-await-in-loop
        await this.handleTerminalFailure(endpoint)
      }
    }

    const summary = { retried, delivered, failed }
    this.logger.info(summary, 'WebhookRetry: run complete')
    return summary
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async handleTerminalFailure(endpoint: EndpointRow): Promise<void> {
    const newCount = endpoint.failureCount + 1

    await this.prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { failureCount: newCount, updatedAt: new Date() },
    })

    // Alert tenant admin when threshold exceeded
    if (newCount > WEBHOOK_FAILURE_ALERT_THRESHOLD) {
      this.logger.warn(
        { endpointId: endpoint.id, failureCount: newCount, url: endpoint.url },
        'WebhookRetry: circuit-breaker threshold exceeded — deactivating endpoint',
      )

      // Auto-deactivate to prevent further futile attempts
      await this.prisma.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: { isActive: false, updatedAt: new Date() },
      })

      // Notify ops / tenant admin via monitoring queue
      try {
        await this.monitoringQueue.add(
          'webhook-circuit-breaker',
          {
            type: 'WEBHOOK_CIRCUIT_BREAKER',
            endpointId: endpoint.id,
            tenantId: endpoint.tenantId,
            url: endpoint.url,
            failureCount: newCount,
            triggeredAt: new Date().toISOString(),
          },
          { priority: BULLMQ_CRITICAL_PRIORITY },
        )
      } catch (err) {
        this.logger.error(
          { err, endpointId: endpoint.id },
          'WebhookRetry: failed to publish circuit-breaker alert',
        )
      }
    }
  }
}

// ── BullMQ Worker factory ─────────────────────────────────────────────────────

export function createWebhookRetryWorker(
  processor: WebhookRetryProcessor,
  redis: IORedis,
  logger: SlaCheckerLogger,
): Worker {
  return new Worker(
    WEBHOOK_RETRY_QUEUE,
    async (_job: Job) => {
      await processor.run()
    },
    { connection: redis, concurrency: 1 },
    /* istanbul ignore next */
  ).on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'WebhookRetry: job failed')
  })
}

// ── Repeatable job registration ───────────────────────────────────────────────

export async function scheduleWebhookRetry(
  redis: IORedis,
  logger: SlaCheckerLogger,
): Promise<void> {
  const queue = new Queue(WEBHOOK_RETRY_QUEUE, { connection: redis })

  await queue.add(
    WEBHOOK_RETRY_JOB_NAME,
    {},
    {
      repeat: { every: WEBHOOK_RETRY_INTERVAL_MS },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    },
  )

  const repeatables = await queue.getRepeatableJobs()
  logger.info(
    {
      schedule: `every ${WEBHOOK_RETRY_INTERVAL_MS / 60_000}min`,
      totalRepeatables: repeatables.length,
    },
    'WebhookRetry: repeatable job registered',
  )

  await queue.close()
}
