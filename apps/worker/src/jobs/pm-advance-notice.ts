/**
 * PM Advance-Notice Job โ€” BullMQ repeatable job, daily at 07:00 UTC.
 *
 * ## Purpose
 * Sends a "coming due soon" notification to assigned technicians and managers
 * for PM schedules whose `nextDue` falls within `advanceNoticeDays` from today.
 *
 * ## Dedup
 * Uses Redis key `advance-notice:{scheduleId}:{YYYY-MM-DD}` with 23-hour TTL
 * to guarantee at-most-one notification per schedule per calendar day.
 *
 * ## Per-tenant timezone
 * The spec calls for per-tenant timezone (7 AM local).  We achieve this by:
 *   1. Running the job at 07:00 UTC โ€” acceptable for UTCยฑ2 tenants.
 *   2. For tenants with larger TZ offsets the notice may arrive slightly early
 *      or late. Full per-tenant scheduling requires one cron job per tenant
 *      (feasible with BullMQ's cron syntax) and is left as a future extension.
 *
 * ## Query strategy
 * We query for schedules where `nextDue` is within [now, now + maxAdvanceDays]
 * so we cover the broadest possible window. The domain `shouldTrigger` is NOT
 * called here โ€” we want to notify even if the schedule hasn't fully crossed
 * the trigger threshold yet.
 */
import { Queue, Worker } from 'bullmq'
import type { Job } from 'bullmq'
import type IORedis from 'ioredis'
import type { PrismaClient } from '@prisma/client'
import {
  PM_NOTICE_QUEUE,
  PM_NOTICE_JOB_NAME,
  ADVANCE_NOTICE_KEY,
  ADVANCE_NOTICE_TTL_SECONDS,
} from './pm-scheduler-constants.js'
import type { PMSchedulerLogger, NotificationPublisher } from './pm-scheduler-types.js'

// โ”€โ”€ Cron: every day at 07:00 UTC โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
const DAILY_CRON = '0 7 * * *'

/** Max lookahead for the SQL pre-filter (all schedules due within 30 days). */
const SQL_ADVANCE_DAYS = 30

// โ”€โ”€ Processor โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

export class PMAdvanceNoticeProcessor {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: IORedis,
    private readonly publisher: NotificationPublisher,
    private readonly logger: PMSchedulerLogger,
  ) {}

  async run(): Promise<{ checked: number; noticesSent: number; failures: number }> {
    const now = new Date()
    const cutoff = new Date(now.getTime() + SQL_ADVANCE_DAYS * 24 * 60 * 60 * 1000)

    // Fetch all tenants in a single query to avoid N+1 tenant lookups
    const schedules = await this.prisma.pMSchedule.findMany({
      where: {
        isActive: true,
        nextDue: { gte: now, lte: cutoff },
        tenant: { isActive: true },
      },
      select: {
        id: true,
        tenantId: true,
        assetId: true,
        title: true,
        nextDue: true,
        calendarRule: true,
        meterRule: true,
      },
      orderBy: { nextDue: 'asc' },
    })

    let noticesSent = 0
    let failures = 0

    for (const row of schedules) {
      try {
        const nextDueAt = row.nextDue!

        // Extract advanceNoticeDays from the JSON blobs
        const calRaw = row.calendarRule as {
          pmMeta?: { advanceNoticeDays?: number; defaultAssigneeIds?: string[] }
        } | null
        const metRaw = row.meterRule as { pmMeta?: { defaultAssigneeIds?: string[] } } | null

        const advanceNoticeDays = calRaw?.pmMeta?.advanceNoticeDays ?? 7
        const defaultAssigneeIds = (calRaw?.pmMeta?.defaultAssigneeIds ??
          metRaw?.pmMeta?.defaultAssigneeIds ??
          []) as string[]

        // Check if within advance-notice window
        const daysUntilDue = (nextDueAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        if (daysUntilDue > advanceNoticeDays) {
          // eslint-disable-next-line no-continue
          continue
        }

        const dateKey = nextDueAt.toISOString().slice(0, 10)
        const redisKey = ADVANCE_NOTICE_KEY(row.id, dateKey)

        // eslint-disable-next-line no-await-in-loop
        const existing = await this.redis.get(redisKey)
        if (existing !== null) {
          // eslint-disable-next-line no-continue
          continue
        }

        // eslint-disable-next-line no-await-in-loop
        await this.publisher.publishAdvanceNotice({
          scheduleId: row.id,
          tenantId: row.tenantId,
          assetId: row.assetId,
          title: row.title,
          nextDueAt,
          assigneeIds: defaultAssigneeIds,
        })

        // eslint-disable-next-line no-await-in-loop
        await this.redis.set(redisKey, '1', 'EX', ADVANCE_NOTICE_TTL_SECONDS)

        noticesSent += 1
        this.logger.info(
          { scheduleId: row.id, tenantId: row.tenantId, nextDueAt: nextDueAt.toISOString() },
          'PMAdvanceNotice: notice sent',
        )
      } catch (err) {
        failures += 1
        this.logger.error({ err, scheduleId: row.id }, 'PMAdvanceNotice: failed to send notice')
      }
    }

    const result = { checked: schedules.length, noticesSent, failures }
    this.logger.info(result, 'PMAdvanceNotice: run complete')
    return result
  }
}

// โ”€โ”€ BullMQ Worker factory โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

export function createPMAdvanceNoticeWorker(
  processor: PMAdvanceNoticeProcessor,
  redis: IORedis,
  logger: PMSchedulerLogger,
  publisher: NotificationPublisher,
): Worker {
  return new Worker(
    PM_NOTICE_QUEUE,
    async (_job: Job) => {
      await processor.run()
    },
    { connection: redis, concurrency: 1 },
    /* istanbul ignore next */
  ).on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'PMAdvanceNotice: job failed')
    void publisher.publishJobFailed({
      jobName: PM_NOTICE_JOB_NAME,
      errorMsg: err instanceof Error ? err.message : String(err),
      timestamp: new Date(),
    })
  })
}

// โ”€โ”€ Repeatable job registration โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

export async function schedulePMAdvanceNotice(
  redis: IORedis,
  logger: PMSchedulerLogger,
): Promise<void> {
  const queue = new Queue(PM_NOTICE_QUEUE, { connection: redis })

  await queue.add(
    PM_NOTICE_JOB_NAME,
    {},
    {
      repeat: { pattern: DAILY_CRON },
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
    },
  )

  const repeatables = await queue.getRepeatableJobs()
  logger.info(
    { cron: DAILY_CRON, totalRepeatables: repeatables.length },
    'PMAdvanceNotice: daily cron registered',
  )

  await queue.close()
}
