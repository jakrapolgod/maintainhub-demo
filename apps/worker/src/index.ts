/**
 * Worker entry point.
 *
 * Bootstraps:
 *  1. Prisma client
 *  2. Redis connection
 *  3. SLA checker — repeatable job (every 5 min) + BullMQ Worker
 *  4. PM Scheduler — repeatable job (every 1 hour) + BullMQ Worker
 *  5. PM Advance Notice — daily cron (07:00 UTC) + BullMQ Worker
 *  6. Webhook Retry — repeatable job (every 5 min) + BullMQ Worker
 */
import { PrismaClient } from '@prisma/client'
import Redis from 'ioredis'
import {
  BullMqSlaNotificationPublisher,
  PrismaOverdueWoRepository,
  SlaCheckerProcessor,
  createSlaCheckerWorker,
  scheduleSlaChecker,
} from './jobs/sla-checker.js'
import {
  PMSchedulerProcessor,
  createPMSchedulerWorker,
  schedulePMChecker,
  BullMqPMNotificationPublisher,
  PrismaWorkOrderCreator,
} from './jobs/pm-scheduler.js'
import {
  PMAdvanceNoticeProcessor,
  createPMAdvanceNoticeWorker,
  schedulePMAdvanceNotice,
} from './jobs/pm-advance-notice.js'
import { WorkerPMScheduleRepository } from './jobs/pm-repo.js'
import {
  WebhookRetryProcessor,
  createWebhookRetryWorker,
  scheduleWebhookRetry,
} from './jobs/webhook-retry.js'

const {
  DATABASE_URL,
  REDIS_HOST: envRedisHost,
  REDIS_PORT: envRedisPort,
  REDIS_PASSWORD: REDIS_PASS,
} = process.env

const REDIS_HOST = envRedisHost ?? 'localhost'
const REDIS_PORT = Number(envRedisPort ?? 6379)

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required')
  process.exit(1)
}

const prisma = new PrismaClient()

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  ...(REDIS_PASS ? { password: REDIS_PASS } : {}),
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => (times <= 3 ? Math.min(times * 500, 2_000) : null),
})

const logger = {
  info: (data: object | string, msg?: string) => {
    void msg
    console.log(
      JSON.stringify({ level: 'info', ...(typeof data === 'string' ? { msg: data } : data) }),
    )
  },
  warn: (data: object | string, msg?: string) => {
    void msg
    console.warn(
      JSON.stringify({ level: 'warn', ...(typeof data === 'string' ? { msg: data } : data) }),
    )
  },
  error: (data: object | string, msg?: string) => {
    void msg
    console.error(
      JSON.stringify({ level: 'error', ...(typeof data === 'string' ? { msg: data } : data) }),
    )
  },
}

async function main(): Promise<void> {
  // ── SLA Checker ──────────────────────────────────────────────────────────────
  const woRepo = new PrismaOverdueWoRepository(prisma)
  const slaPublisher = new BullMqSlaNotificationPublisher(redis)
  const slaProcessor = new SlaCheckerProcessor({
    prisma,
    redis,
    woRepo,
    publisher: slaPublisher,
    logger,
  })
  const slaWorker = createSlaCheckerWorker(slaProcessor, redis, logger)
  await scheduleSlaChecker(redis, logger)

  // ── PM Scheduler ─────────────────────────────────────────────────────────────
  const pmRepo = new WorkerPMScheduleRepository(prisma)
  const pmPublisher = new BullMqPMNotificationPublisher(redis)
  const woCreator = new PrismaWorkOrderCreator(prisma)

  const pmProcessor = new PMSchedulerProcessor({
    pmRepo,
    woCreator,
    publisher: pmPublisher,
    redis,
    logger,
  })
  const pmWorker = createPMSchedulerWorker(pmProcessor, redis, logger, pmPublisher)
  await schedulePMChecker(redis, logger)

  // ── PM Advance Notice ────────────────────────────────────────────────────────
  const noticeProcessor = new PMAdvanceNoticeProcessor(prisma, redis, pmPublisher, logger)
  const noticeWorker = createPMAdvanceNoticeWorker(noticeProcessor, redis, logger, pmPublisher)
  await schedulePMAdvanceNotice(redis, logger)

  // ── Webhook Retry ─────────────────────────────────────────────────────────────
  const webhookRetryProcessor = new WebhookRetryProcessor(prisma, logger, redis)
  const webhookRetryWorker = createWebhookRetryWorker(webhookRetryProcessor, redis, logger)
  await scheduleWebhookRetry(redis, logger)

  logger.info('Worker started — SLA + PM Scheduler + PM Advance Notice + Webhook Retry active')

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down')
    await Promise.allSettled([
      slaWorker.close(),
      pmWorker.close(),
      noticeWorker.close(),
      webhookRetryWorker.close(),
    ])
    await prisma.$disconnect()
    await redis.quit()
    process.exit(0)
  }

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM')
  })
  process.on('SIGINT', () => {
    void shutdown('SIGINT')
  })
}

void main()
