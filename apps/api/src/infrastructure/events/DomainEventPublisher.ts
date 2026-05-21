/**
 * DomainEventPublisher — dispatches domain events to the appropriate BullMQ
 * queues so downstream workers can react asynchronously.
 *
 * ## Routing table
 *
 * | Event                    | Queues                                         |
 * |--------------------------|------------------------------------------------|
 * | WorkOrderCompletedEvent  | asset-metrics, notifications, pm-check         |
 * | SLABreachedEvent         | notifications (CRITICAL priority) + audit log  |
 * | WorkOrderEscalatedEvent  | notifications, escalation-email                |
 * | All other events         | silently ignored (no throw)                    |
 *
 * ## Idempotency
 * Every BullMQ job is added with `jobId = event.eventId` (UUID).  If the same
 * event is accidentally published twice (e.g. on retry), BullMQ rejects the
 * duplicate silently because the jobId already exists.
 *
 * ## Audit trail
 * `SLABreachedEvent` writes a row to the `AuditLog` table before enqueuing the
 * notification.  This preserves a durable, queryable record of every breach
 * independent of whether the notification worker eventually succeeds.
 */
import type { PrismaClient } from '@prisma/client'
import type { Queue } from 'bullmq'
import type {
  SLABreachedEvent,
  WorkOrderCompletedEvent,
  WorkOrderEscalatedEvent,
  BaseDomainEvent,
} from '@maintainhub/domain'
import {
  JOB_PRIORITY,
  QUEUE_NAMES,
  type AssetMetricsJobData,
  type EscalationEmailJobData,
  type NotificationJobData,
  type PmCheckJobData,
} from './job-data.js'

// ── Default BullMQ job options ────────────────────────────────────────────────

const NORMAL_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1_000 },
  removeOnComplete: { count: 1_000 } as const,
  removeOnFail: { count: 5_000 } as const,
}

const CRITICAL_JOB_OPTS = {
  ...NORMAL_JOB_OPTS,
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 500 },
  priority: JOB_PRIORITY.CRITICAL,
}

// ── Logger interface ──────────────────────────────────────────────────────────

/** Minimal logger interface — compatible with pino, console, and test stubs. */
export interface PublisherLogger {
  info(data: object | string, msg?: string): void
  warn(data: object | string, msg?: string): void
  error(data: object | string, msg?: string): void
}

// ── Queue injection interface ─────────────────────────────────────────────────

/**
 * The four queues the publisher writes to.
 * Expressed as an interface so tests can inject lightweight mocks.
 */
export interface EventQueues {
  assetMetrics: Queue<AssetMetricsJobData>
  notifications: Queue<NotificationJobData>
  pmCheck: Queue<PmCheckJobData>
  escalationEmail: Queue<EscalationEmailJobData>
}

// ── Publisher ─────────────────────────────────────────────────────────────────

export class DomainEventPublisher {
  private readonly queues: EventQueues

  private readonly prisma: PrismaClient

  private readonly logger: PublisherLogger

  constructor(queues: EventQueues, prisma: PrismaClient, logger: PublisherLogger) {
    this.queues = queues
    this.prisma = prisma
    this.logger = logger
  }

  // ── Public entry-point ────────────────────────────────────────────────────

  /**
   * Route a single domain event to its queue(s).
   *
   * Unrecognised event types are logged at `info` level and skipped — adding a
   * new event type to the domain does not break the publisher.
   */
  async publish(event: BaseDomainEvent): Promise<void> {
    switch (event.eventType) {
      case 'WorkOrderCompleted':
        await this.onWorkOrderCompleted(event as WorkOrderCompletedEvent)
        break

      case 'SLABreached':
        await this.onSLABreached(event as SLABreachedEvent)
        break

      case 'WorkOrderEscalated':
        await this.onWorkOrderEscalated(event as WorkOrderEscalatedEvent)
        break

      default:
        this.logger.info(
          { eventType: event.eventType, eventId: event.eventId },
          'DomainEventPublisher: unhandled event type — skipping',
        )
    }
  }

  /**
   * Publish an array of events in parallel.
   * Individual errors are caught and logged so one failing dispatch does not
   * block the others.
   */
  async publishAll(events: BaseDomainEvent[]): Promise<void> {
    await Promise.allSettled(
      events.map(async (event) => {
        try {
          await this.publish(event)
        } catch (err) {
          this.logger.error(
            { err, eventType: event.eventType, eventId: event.eventId },
            'DomainEventPublisher: failed to publish event',
          )
        }
      }),
    )
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  /**
   * WorkOrderCompletedEvent → three queues in parallel:
   *  1. asset-metrics  — recalculate MTBF/MTTR for the asset
   *  2. notifications  — inform assignees and managers
   *  3. pm-check       — evaluate meter-based PM schedule triggers
   */
  private async onWorkOrderCompleted(event: WorkOrderCompletedEvent): Promise<void> {
    const completedAt = event.occurredAt.toISOString()
    const jobId = event.eventId

    await Promise.all([
      // ── 1. Asset metrics recalculation ──────────────────────────────────
      this.queues.assetMetrics.add(
        QUEUE_NAMES.ASSET_METRICS,
        {
          eventId: jobId,
          tenantId: event.tenantId,
          assetId: event.assetId,
          workOrderId: event.aggregateId,
          completedAt,
          laborHours: event.laborHours,
          totalCost: event.totalCost.toString(),
        } satisfies AssetMetricsJobData,
        { ...NORMAL_JOB_OPTS, jobId },
      ),

      // ── 2. Notification: inform assignees and managers ──────────────────
      this.queues.notifications.add(
        QUEUE_NAMES.NOTIFICATIONS,
        {
          eventId: jobId,
          type: 'WO_COMPLETED',
          tenantId: event.tenantId,
          aggregateId: event.aggregateId,
          woNumber: '', // worker looks up from DB using aggregateId
          recipientUserIds: [event.technicianId],
          notifyRoles: ['MANAGER'],
          priority: 'NORMAL',
          payload: {
            assetId: event.assetId,
            resolution: event.resolution,
            laborHours: event.laborHours,
            totalCost: event.totalCost.toString(),
            completedAt,
          },
        } satisfies NotificationJobData,
        { ...NORMAL_JOB_OPTS, jobId: `${jobId}:notify` },
      ),

      // ── 3. PM schedule check ────────────────────────────────────────────
      this.queues.pmCheck.add(
        QUEUE_NAMES.PM_CHECK,
        {
          eventId: jobId,
          tenantId: event.tenantId,
          assetId: event.assetId,
          workOrderId: event.aggregateId,
          completedAt,
        } satisfies PmCheckJobData,
        { ...NORMAL_JOB_OPTS, jobId: `${jobId}:pm` },
      ),
    ])

    this.logger.info(
      { eventId: jobId, assetId: event.assetId, laborHours: event.laborHours },
      'DomainEventPublisher: WorkOrderCompleted → asset-metrics + notifications + pm-check',
    )
  }

  /**
   * SLABreachedEvent → two side effects:
   *  1. Audit log row written to PostgreSQL (durable record, independent of queue)
   *  2. CRITICAL-priority job in the notifications queue
   */
  private async onSLABreached(event: SLABreachedEvent): Promise<void> {
    const jobId = event.eventId

    // ── 1. Audit trail (write-first so breach is recorded even if queue fails) ──
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: event.tenantId,
          action: 'SLA_BREACHED',
          entityType: 'WorkOrder',
          entityId: event.aggregateId,
          after: {
            woNumber: event.woNumber,
            priority: event.priority,
            slaDeadline: event.slaDeadline.toISOString(),
            overdueMinutes: event.overdueMinutes,
          },
        },
      })
    } catch (err) {
      // Non-fatal — log but don't abort the notification dispatch
      this.logger.warn(
        { err, eventId: jobId },
        'DomainEventPublisher: SLABreached audit log write failed',
      )
    }

    // ── 2. CRITICAL notification ────────────────────────────────────────────
    await this.queues.notifications.add(
      QUEUE_NAMES.NOTIFICATIONS,
      {
        eventId: jobId,
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
      } satisfies NotificationJobData,
      { ...CRITICAL_JOB_OPTS, jobId },
    )

    this.logger.info(
      {
        eventId: jobId,
        woNumber: event.woNumber,
        overdueMinutes: event.overdueMinutes,
        priority: event.priority,
      },
      'DomainEventPublisher: SLABreached → audit log + notifications (CRITICAL)',
    )
  }

  /**
   * WorkOrderEscalatedEvent → two queues in parallel:
   *  1. notifications    — inform managers about the priority change
   *  2. escalation-email — send dedicated escalation email
   */
  private async onWorkOrderEscalated(event: WorkOrderEscalatedEvent): Promise<void> {
    const occurredAt = event.occurredAt.toISOString()
    const jobId = event.eventId

    await Promise.all([
      // ── 1. In-app notification ──────────────────────────────────────────
      this.queues.notifications.add(
        QUEUE_NAMES.NOTIFICATIONS,
        {
          eventId: jobId,
          type: 'WO_ESCALATED',
          tenantId: event.tenantId,
          aggregateId: event.aggregateId,
          woNumber: '', // worker looks up from DB
          recipientUserIds: [],
          notifyRoles: ['ADMIN', 'MANAGER'],
          priority: 'HIGH',
          payload: {
            fromPriority: event.fromPriority,
            toPriority: event.toPriority,
            occurredAt,
          },
        } satisfies NotificationJobData,
        { ...NORMAL_JOB_OPTS, jobId, priority: JOB_PRIORITY.HIGH },
      ),

      // ── 2. Dedicated escalation email ───────────────────────────────────
      this.queues.escalationEmail.add(
        QUEUE_NAMES.ESCALATION_EMAIL,
        {
          eventId: jobId,
          tenantId: event.tenantId,
          workOrderId: event.aggregateId,
          woNumber: undefined, // worker looks up from DB
          fromPriority: event.fromPriority,
          toPriority: event.toPriority,
          occurredAt,
        } satisfies EscalationEmailJobData,
        { ...NORMAL_JOB_OPTS, jobId: `${jobId}:email`, priority: JOB_PRIORITY.HIGH },
      ),
    ])

    this.logger.info(
      {
        eventId: jobId,
        fromPriority: event.fromPriority,
        toPriority: event.toPriority,
      },
      'DomainEventPublisher: WorkOrderEscalated → notifications + escalation-email',
    )
  }
}
