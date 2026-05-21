/**
 * PM Scheduler — BullMQ repeatable job, runs every 1 hour.
 *
 * ## What it does each run
 *
 *  1. Fetches all active PM schedules whose `nextDue` is within the advance
 *     window (SQL pre-filter: nextDue <= now + 30 days).
 *  2. For each candidate calls `schedule.shouldTrigger(undefined, now)` for the
 *     precise domain-level check.
 *  3. On a positive trigger:
 *     a. Calls `schedule.trigger('SCHEDULER')` → advances lastTriggeredAt / nextDueAt.
 *     b. Calls `schedule.generateWorkOrderDraft()` → plain DTO.
 *     c. Dispatches `WorkOrderCreator.createFromPMDraft()` (Prisma in-worker).
 *     d. Saves the updated schedule back to Postgres.
 *     e. Sends advance notice if nextDueAt is within advanceNoticeDays (Redis dedup).
 *  4. Reports metrics: triggered, failures, noticesSent.
 *  5. On job-level failure, pushes an alert to the monitoring queue.
 */
import { Queue, Worker } from 'bullmq'
import type { Job } from 'bullmq'
import type IORedis from 'ioredis'
import type { PMSchedule, PMScheduleRepository } from '@maintainhub/domain'
import {
  PM_SCHEDULER_QUEUE,
  PM_JOB_NAME,
  PM_CHECK_INTERVAL_MS,
  ADVANCE_NOTICE_KEY,
  ADVANCE_NOTICE_TTL_SECONDS,
} from './pm-scheduler-constants.js'
import type {
  PMSchedulerLogger,
  PMSchedulerResult,
  WorkOrderCreator,
  NotificationPublisher,
} from './pm-scheduler-types.js'

// ── Core processor ────────────────────────────────────────────────────────────

export class PMSchedulerProcessor {
  private readonly pmRepo: Pick<PMScheduleRepository, 'findDueForTrigger' | 'update'>

  private readonly woCreator: WorkOrderCreator

  private readonly publisher: NotificationPublisher

  private readonly redis: IORedis

  private readonly logger: PMSchedulerLogger

  constructor(opts: {
    pmRepo: Pick<PMScheduleRepository, 'findDueForTrigger' | 'update'>
    woCreator: WorkOrderCreator
    publisher: NotificationPublisher
    redis: IORedis
    logger: PMSchedulerLogger
  }) {
    this.pmRepo = opts.pmRepo
    this.woCreator = opts.woCreator
    this.publisher = opts.publisher
    this.redis = opts.redis
    this.logger = opts.logger
  }

  /** Entry point — called by the BullMQ Worker on each job execution. */
  async run(): Promise<PMSchedulerResult> {
    const now = new Date()
    let triggered = 0
    let failures = 0
    let noticesSent = 0

    // Fetch all cross-tenant candidates (pre-filtered by SQL)
    const candidates = await this.pmRepo.findDueForTrigger(now)

    this.logger.info(
      { candidates: candidates.length, now: now.toISOString() },
      'PMScheduler: starting run',
    )

    for (const schedule of candidates) {
      // Domain-level check (accounts for advance-notice window)
      if (!schedule.shouldTrigger(undefined, now)) {
        // eslint-disable-next-line no-continue
        continue
      }

      try {
        // ── a. Trigger domain event ───────────────────────────────────────
        schedule.trigger('SCHEDULER')

        // ── b. Generate WO draft ─────────────────────────────────────────
        const draft = schedule.generateWorkOrderDraft()

        // ── c. Create work order ──────────────────────────────────────────
        // eslint-disable-next-line no-await-in-loop
        const woId = await this.woCreator.createFromPMDraft(draft, schedule.tenantId)

        // ── d. Save updated schedule ──────────────────────────────────────
        // eslint-disable-next-line no-await-in-loop
        await this.pmRepo.update(schedule)

        triggered += 1

        this.logger.info(
          {
            scheduleId: schedule.id.value,
            tenantId: schedule.tenantId,
            assetId: schedule.assetId,
            woId,
            nextDueAt: schedule.nextDueAt?.toISOString(),
          },
          'PMScheduler: schedule triggered, WO created',
        )

        // ── e. Advance notice for the *next* due date ─────────────────────
        if (schedule.nextDueAt !== undefined) {
          // eslint-disable-next-line no-await-in-loop
          const sent = await this.sendAdvanceNoticeIfNeeded(schedule, now)
          if (sent) {
            noticesSent += 1
          }
        }
      } catch (err) {
        failures += 1
        this.logger.error(
          { err, scheduleId: schedule.id.value, tenantId: schedule.tenantId },
          'PMScheduler: failed to process schedule',
        )
      }
    }

    const result: PMSchedulerResult = {
      tenantsChecked: new Set(candidates.map((s) => s.tenantId)).size,
      scheduled: candidates.length,
      triggered,
      failures,
      noticesSent,
    }

    this.logger.info(result, 'PMScheduler: run complete')
    return result
  }

  // ── Advance notice ────────────────────────────────────────────────────────

  private async sendAdvanceNoticeIfNeeded(schedule: PMSchedule, now: Date): Promise<boolean> {
    const { nextDueAt } = schedule
    if (nextDueAt === undefined) return false

    const msUntilDue = nextDueAt.getTime() - now.getTime()
    const daysUntilDue = msUntilDue / (24 * 60 * 60 * 1000)
    const withinNotice = daysUntilDue <= schedule.advanceNoticeDays

    if (!withinNotice) return false

    // Redis dedup: one notice per schedule per calendar day (UTC)
    const dateKey = nextDueAt.toISOString().slice(0, 10) // YYYY-MM-DD
    const redisKey = ADVANCE_NOTICE_KEY(schedule.id.value, dateKey)
    const existing = await this.redis.get(redisKey)

    if (existing !== null) return false

    await this.publisher.publishAdvanceNotice({
      scheduleId: schedule.id.value,
      tenantId: schedule.tenantId,
      assetId: schedule.assetId,
      title: schedule.title,
      nextDueAt,
      assigneeIds: [...schedule.defaultAssigneeIds],
    })

    await this.redis.set(redisKey, '1', 'EX', ADVANCE_NOTICE_TTL_SECONDS)
    return true
  }
}

// ── BullMQ Worker factory ─────────────────────────────────────────────────────

export function createPMSchedulerWorker(
  processor: PMSchedulerProcessor,
  redis: IORedis,
  logger: PMSchedulerLogger,
  publisher: NotificationPublisher,
): Worker {
  return new Worker(
    PM_SCHEDULER_QUEUE,
    async (_job: Job) => {
      await processor.run()
    },
    { connection: redis, concurrency: 1 },
    /* istanbul ignore next -- BullMQ Worker event callback; covered by integration */
  ).on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'PMScheduler: job failed')
    void publisher.publishJobFailed({
      jobName: PM_JOB_NAME,
      errorMsg: err instanceof Error ? err.message : String(err),
      timestamp: new Date(),
    })
  })
}

// ── Repeatable job scheduler ──────────────────────────────────────────────────

export async function schedulePMChecker(redis: IORedis, logger: PMSchedulerLogger): Promise<void> {
  const queue = new Queue(PM_SCHEDULER_QUEUE, { connection: redis })

  await queue.add(
    PM_JOB_NAME,
    {},
    {
      repeat: { every: PM_CHECK_INTERVAL_MS },
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
    },
  )

  const repeatables = await queue.getRepeatableJobs()
  logger.info(
    {
      schedule: `every ${PM_CHECK_INTERVAL_MS / 60_000}min`,
      totalRepeatables: repeatables.length,
    },
    'PMScheduler: repeatable job registered',
  )

  await queue.close()
}

// ── Infrastructure adapters ───────────────────────────────────────────────────

export { BullMqPMNotificationPublisher } from './pm-notification-publisher.js'
export { PrismaWorkOrderCreator } from './prisma-wo-creator.js'
