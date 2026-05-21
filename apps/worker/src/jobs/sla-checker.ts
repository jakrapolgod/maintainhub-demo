/**
 * SLA Checker — BullMQ repeatable job that runs every 5 minutes.
 *
 * ## What it does each run
 *
 *  1. Loads all active tenants from Postgres.
 *  2. For each tenant, queries work orders that are OPEN or IN_PROGRESS and
 *     whose `slaDeadline` is in the past.
 *  3. For each overdue WO checks Redis key `sla-alerted:{woId}`.
 *  4. If not yet alerted:
 *     a. Creates a `SLABreachedEvent` and publishes it to the `notifications`
 *        queue with CRITICAL priority.
 *     b. Writes a row to `AuditLog` (serves as the `sla_breached_at` record
 *        until a dedicated schema column is added).
 *     c. Sets `sla-alerted:{woId}` in Redis with a 1-hour TTL.
 */
import type { PrismaClient } from '@prisma/client'
import { Queue, Worker } from 'bullmq'
import type { Job } from 'bullmq'
import type IORedis from 'ioredis'
import { SLABreachedEvent } from '@maintainhub/domain'
import { overdueMinutes } from '../lib/sla-calculator.js'
import {
  ALERTED_KEY,
  ALERTED_TTL_SECONDS,
  CHECK_INTERVAL_MS,
  SLA_CHECK_QUEUE,
} from './sla-checker-constants.js'
import type {
  OverdueWoRow,
  SlaCheckerLogger,
  SlaNotificationPublisher,
  SlaWorkOrderRepository,
} from './sla-checker-types.js'

export type { SlaCheckerLogger, SlaNotificationPublisher, SlaWorkOrderRepository, OverdueWoRow }
export { BullMqSlaNotificationPublisher } from './sla-notification-publisher.js'
export { PrismaOverdueWoRepository } from './sla-wo-repository.js'

// ── Repeatable job name ───────────────────────────────────────────────────────

/** BullMQ job name — identifies this specific recurring job in the queue. */
export const SLA_JOB_NAME = 'sla:check'

// ── Core processor ────────────────────────────────────────────────────────────

export class SlaCheckerProcessor {
  private readonly prisma: PrismaClient

  private readonly redis: IORedis

  private readonly woRepo: SlaWorkOrderRepository

  private readonly publisher: SlaNotificationPublisher

  private readonly logger: SlaCheckerLogger

  constructor(opts: {
    prisma: PrismaClient
    redis: IORedis
    woRepo: SlaWorkOrderRepository
    publisher: SlaNotificationPublisher
    logger: SlaCheckerLogger
  }) {
    this.prisma = opts.prisma
    this.redis = opts.redis
    this.woRepo = opts.woRepo
    this.publisher = opts.publisher
    this.logger = opts.logger
  }

  /** Entry point — called by the BullMQ Worker on each job execution. */
  async run(): Promise<{ tenantsChecked: number; alertsSent: number; alreadyAlerted: number }> {
    const tenants = (await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true, isActive: true, settings: true },
    })) as Array<{ id: string; isActive: boolean; settings: unknown }>

    let alertsSent = 0
    let alreadyAlerted = 0

    await Promise.allSettled(
      tenants.map(async (tenant) => {
        try {
          const { sent, skipped } = await this.checkTenant(tenant.id)
          alertsSent += sent
          alreadyAlerted += skipped
        } catch (err) {
          this.logger.error({ err, tenantId: tenant.id }, 'SlaChecker: tenant check failed')
        }
      }),
    )

    this.logger.info(
      { tenantsChecked: tenants.length, alertsSent, alreadyAlerted },
      'SlaChecker: run complete',
    )

    return { tenantsChecked: tenants.length, alertsSent, alreadyAlerted }
  }

  private async checkTenant(tenantId: string): Promise<{ sent: number; skipped: number }> {
    const overdueWOs = await this.woRepo.findOverdueSLA(tenantId)

    let sent = 0
    let skipped = 0

    for (const wo of overdueWOs) {
      // Sequential to avoid Redis/Prisma connection flooding on large tenants
      // eslint-disable-next-line no-await-in-loop
      const alerted = await this.alertIfNeeded(wo)
      if (alerted) {
        sent += 1
      } else {
        skipped += 1
      }
    }

    return { sent, skipped }
  }

  private async alertIfNeeded(wo: OverdueWoRow): Promise<boolean> {
    const key = ALERTED_KEY(wo.id)

    const existing = await this.redis.get(key)
    if (existing !== null) {
      return false // already alerted within the TTL window
    }

    const breachMinutes = overdueMinutes(wo.slaDeadline)

    const event = new SLABreachedEvent({
      aggregateId: wo.id,
      tenantId: wo.tenantId,
      assetId: wo.assetId,
      woNumber: wo.woNumber,
      priority: wo.priority,
      slaDeadline: wo.slaDeadline,
      overdueMinutes: breachMinutes,
    })

    await this.publisher.publishSlaBreached(event)

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: wo.tenantId,
          action: 'SLA_BREACHED',
          entityType: 'WorkOrder',
          entityId: wo.id,
          after: {
            woNumber: wo.woNumber,
            priority: wo.priority,
            slaDeadline: wo.slaDeadline.toISOString(),
            overdueMinutes: breachMinutes,
            slaBreachedAt: new Date().toISOString(),
          },
        },
      })
    } catch (err) {
      this.logger.warn(
        { err, woId: wo.id },
        'SlaChecker: audit log write failed after notification was published',
      )
    }

    await this.redis.set(key, new Date().toISOString(), 'EX', ALERTED_TTL_SECONDS)

    this.logger.info(
      { woId: wo.id, woNumber: wo.woNumber, priority: wo.priority, overdueMinutes: breachMinutes },
      'SlaChecker: SLA breach alert sent',
    )

    return true
  }
}

// ── BullMQ Worker factory ─────────────────────────────────────────────────────

export function createSlaCheckerWorker(
  processor: SlaCheckerProcessor,
  redis: IORedis,
  logger: SlaCheckerLogger,
): Worker {
  return new Worker(
    SLA_CHECK_QUEUE,
    async (_job: Job) => {
      await processor.run()
    },
    { connection: redis, concurrency: 1 },
    /* istanbul ignore next -- BullMQ Worker event callback; covered by integration */
  ).on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'SlaChecker: job failed')
  })
}

// ── Repeatable job scheduler ──────────────────────────────────────────────────

export async function scheduleSlaChecker(redis: IORedis, logger: SlaCheckerLogger): Promise<void> {
  const queue = new Queue(SLA_CHECK_QUEUE, { connection: redis })

  await queue.add(
    SLA_JOB_NAME,
    {},
    {
      repeat: { every: CHECK_INTERVAL_MS },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    },
  )

  const repeatables = await queue.getRepeatableJobs()
  logger.info(
    { schedule: `every ${CHECK_INTERVAL_MS / 1000}s`, totalRepeatables: repeatables.length },
    'SlaChecker: repeatable job registered',
  )

  await queue.close()
}
