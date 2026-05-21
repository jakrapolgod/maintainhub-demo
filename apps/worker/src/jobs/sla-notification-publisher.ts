import { Queue } from 'bullmq'
import type IORedis from 'ioredis'
import type { SLABreachedEvent } from '@maintainhub/domain'
import { NOTIFICATIONS_QUEUE, BULLMQ_CRITICAL_PRIORITY } from './sla-checker-constants.js'
import type { SlaNotificationPublisher } from './sla-checker-types.js'
import type { NotificationJobData } from './job-data.js'

/**
 * Publishes SLA breach notifications to the BullMQ `notifications` queue
 * with CRITICAL priority so they jump the queue ahead of normal notifications.
 */
export class BullMqSlaNotificationPublisher implements SlaNotificationPublisher {
  private readonly queue: Queue<NotificationJobData>

  constructor(redis: IORedis) {
    this.queue = new Queue<NotificationJobData>(NOTIFICATIONS_QUEUE, {
      connection: redis,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 500 },
        removeOnComplete: { count: 1_000 } as const,
        removeOnFail: { count: 5_000 } as const,
      },
    })
  }

  async publishSlaBreached(event: SLABreachedEvent): Promise<void> {
    const jobData: NotificationJobData = {
      eventId: event.eventId,
      type: 'SLA_BREACHED',
      tenantId: event.tenantId,
      aggregateId: event.aggregateId,
      woNumber: event.woNumber,
      recipientUserIds: [],
      notifyRoles: ['ADMIN', 'MANAGER'],
      priority: 'CRITICAL',
      payload: {
        assetId: event.assetId,
        priority: event.priority,
        slaDeadline: event.slaDeadline.toISOString(),
        overdueMinutes: event.overdueMinutes,
      },
    }

    await this.queue.add(NOTIFICATIONS_QUEUE, jobData, {
      jobId: event.eventId,
      priority: BULLMQ_CRITICAL_PRIORITY,
    })
  }
}
