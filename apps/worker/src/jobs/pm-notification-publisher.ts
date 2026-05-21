/**
 * BullMQ-backed PM notification publisher.
 * Publishes advance-notice and job-failure alerts to the `notifications` queue.
 */
import { Queue } from 'bullmq'
import type IORedis from 'ioredis'
import { NOTIFICATIONS_QUEUE } from './sla-checker-constants.js'
import { MONITORING_QUEUE, BULLMQ_CRITICAL_PRIORITY } from './pm-scheduler-constants.js'
import type { NotificationPublisher } from './pm-scheduler-types.js'
import type { NotificationJobData } from './job-data.js'

/** Extended notification type for PM events. */
type PMNotificationType = 'PM_DUE_SOON' | 'PM_JOB_FAILED'

interface PMNotificationJobData extends Omit<NotificationJobData, 'type'> {
  type: PMNotificationType
}

export class BullMqPMNotificationPublisher implements NotificationPublisher {
  private readonly notificationsQueue: Queue<PMNotificationJobData>

  private readonly monitoringQueue: Queue<Record<string, unknown>>

  constructor(redis: IORedis) {
    const defaultJobOptions = {
      attempts: 5,
      backoff: { type: 'exponential', delay: 500 },
      removeOnComplete: { count: 1_000 } as const,
      removeOnFail: { count: 5_000 } as const,
    }

    this.notificationsQueue = new Queue<PMNotificationJobData>(NOTIFICATIONS_QUEUE, {
      connection: redis,
      defaultJobOptions,
    })

    this.monitoringQueue = new Queue<Record<string, unknown>>(MONITORING_QUEUE, {
      connection: redis,
      defaultJobOptions,
    })
  }

  async publishAdvanceNotice(opts: {
    scheduleId: string
    tenantId: string
    assetId: string
    title: string
    nextDueAt: Date
    assigneeIds: string[]
  }): Promise<void> {
    const jobData: PMNotificationJobData = {
      eventId: `pm-notice-${opts.scheduleId}-${opts.nextDueAt.toISOString().slice(0, 10)}`,
      type: 'PM_DUE_SOON',
      tenantId: opts.tenantId,
      aggregateId: opts.scheduleId,
      woNumber: '', // not a WO — using aggregateId for tracing
      recipientUserIds: opts.assigneeIds,
      notifyRoles: ['MANAGER'],
      priority: 'NORMAL',
      payload: {
        assetId: opts.assetId,
        title: opts.title,
        nextDueAt: opts.nextDueAt.toISOString(),
        scheduleId: opts.scheduleId,
      },
    }

    await this.notificationsQueue.add('PM_DUE_SOON', jobData, {
      jobId: jobData.eventId,
    })
  }

  async publishJobFailed(opts: {
    jobName: string
    errorMsg: string
    timestamp: Date
  }): Promise<void> {
    await this.monitoringQueue.add(
      'job-failed',
      {
        jobName: opts.jobName,
        errorMsg: opts.errorMsg,
        timestamp: opts.timestamp.toISOString(),
      },
      { priority: BULLMQ_CRITICAL_PRIORITY },
    )
  }
}
