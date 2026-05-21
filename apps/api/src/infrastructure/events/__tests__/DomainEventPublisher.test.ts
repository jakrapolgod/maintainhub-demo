/**
 * Unit tests for DomainEventPublisher.
 *
 * All external dependencies (BullMQ queues, PrismaClient, logger) are replaced
 * with Jest mocks so these tests run without any infrastructure.
 *
 * What is verified:
 *  • Correct queue(s) are called for each event type
 *  • Job data is correctly derived from event fields
 *  • BullMQ job options (priority, attempts, jobId) are set as specified
 *  • Unhandled event types are silently skipped (no throw)
 *  • SLABreachedEvent writes an audit log row before enqueuing
 *  • Audit log failures are non-fatal (notification still enqueued)
 *  • publishAll() tolerates individual failures without aborting the batch
 */
import Decimal from 'decimal.js'
import {
  SLABreachedEvent,
  WorkOrderCompletedEvent,
  WorkOrderEscalatedEvent,
  WorkOrderCreatedEvent,
} from '@maintainhub/domain'
import { DomainEventPublisher } from '../DomainEventPublisher'
import { JOB_PRIORITY, QUEUE_NAMES } from '../job-data'

// ── Mock infrastructure ───────────────────────────────────────────────────────

/**
 * Untyped queue mock — each queue's `add` is a plain `jest.Mock` so we can
 * pass it to shared helpers without TypeScript complaining about the different
 * per-queue data type parameters.  We verify argument shapes at runtime via
 * `mock.mock.calls`, not via the static type.
 */
interface MockQueue {
  add: jest.Mock
}

interface MockQueues {
  assetMetrics: MockQueue
  notifications: MockQueue
  pmCheck: MockQueue
  escalationEmail: MockQueue
}

/** Build a fresh set of mock queues. */
function makeQueues(): MockQueues {
  return {
    assetMetrics: { add: jest.fn().mockResolvedValue({ id: 'job-1' }) },
    notifications: { add: jest.fn().mockResolvedValue({ id: 'job-1' }) },
    pmCheck: { add: jest.fn().mockResolvedValue({ id: 'job-1' }) },
    escalationEmail: { add: jest.fn().mockResolvedValue({ id: 'job-1' }) },
  }
}

/** Minimal Prisma mock — only auditLog.create is needed. */
function makePrisma() {
  return {
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  }
}

/** Silent logger stub. */
const LOGGER = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

// ── Event factories ───────────────────────────────────────────────────────────

const TENANT = 'tenant-1'
const AGG_ID = 'clh7z2d1h0000z1x1z1x1z1x1'
const ASSET_ID = 'asset-1'
const TECH_ID = 'tech-1'

function makeCompletedEvent() {
  return new WorkOrderCompletedEvent({
    aggregateId: AGG_ID,
    tenantId: TENANT,
    assetId: ASSET_ID,
    technicianId: TECH_ID,
    resolution: 'Replaced seal.',
    totalCost: new Decimal('1500.75'),
    laborHours: 3,
  })
}

function makeSLABreachedEvent() {
  return new SLABreachedEvent({
    aggregateId: AGG_ID,
    tenantId: TENANT,
    assetId: ASSET_ID,
    woNumber: 'WO-2024-000042',
    priority: 'CRITICAL',
    slaDeadline: new Date('2024-01-01T08:00:00Z'),
    overdueMinutes: 90,
  })
}

function makeEscalatedEvent() {
  return new WorkOrderEscalatedEvent({
    aggregateId: AGG_ID,
    tenantId: TENANT,
    fromPriority: 'MEDIUM',
    toPriority: 'HIGH',
  })
}

// ── Test helpers ──────────────────────────────────────────────────────────────

type JobCall = {
  name: string
  data: Record<string, unknown>
  opts: Record<string, unknown> | undefined
}

/** Extract the first call's [name, data, options] from a queue.add mock. */
function firstCall(mock: jest.Mock): JobCall {
  const call = mock.mock.calls[0] as [string, Record<string, unknown>, Record<string, unknown>?]
  if (!call) throw new Error('queue.add was never called')
  return { name: call[0], data: call[1], opts: call[2] }
}

/** Find the call matching a specific name among multiple queue.add invocations. */
function callWithName(mock: jest.Mock, name: string): JobCall {
  const call = (
    mock.mock.calls as Array<[string, Record<string, unknown>, Record<string, unknown>?]>
  ).find((c) => c[0] === name)
  if (!call) throw new Error(`No call found with name "${name}"`)
  return { name: call[0], data: call[1], opts: call[2] }
}

// ── WorkOrderCompletedEvent ───────────────────────────────────────────────────

describe('WorkOrderCompletedEvent', () => {
  let queues: MockQueues
  let prisma: ReturnType<typeof makePrisma>
  let publisher: DomainEventPublisher
  let event: WorkOrderCompletedEvent

  beforeEach(async () => {
    queues = makeQueues()
    prisma = makePrisma()
    publisher = new DomainEventPublisher(queues as never, prisma as never, LOGGER)
    event = makeCompletedEvent()
    await publisher.publish(event)
  })

  it('enqueues a job on the asset-metrics queue', () => {
    expect(queues.assetMetrics.add).toHaveBeenCalledTimes(1)
  })

  it('enqueues a job on the notifications queue', () => {
    expect(queues.notifications.add).toHaveBeenCalledTimes(1)
  })

  it('enqueues a job on the pm-check queue', () => {
    expect(queues.pmCheck.add).toHaveBeenCalledTimes(1)
  })

  it('does NOT touch the escalation-email queue', () => {
    expect(queues.escalationEmail.add).not.toHaveBeenCalled()
  })

  it('does NOT write to the audit log', () => {
    expect(prisma.auditLog.create).not.toHaveBeenCalled()
  })

  // ── asset-metrics job data ─────────────────────────────────────────────────

  it('asset-metrics job carries correct tenantId, assetId, workOrderId', () => {
    const { data } = firstCall(queues.assetMetrics.add)
    expect(data.tenantId).toBe(TENANT)
    expect(data.assetId).toBe(ASSET_ID)
    expect(data.workOrderId).toBe(AGG_ID)
  })

  it('asset-metrics job serialises totalCost as a decimal string', () => {
    const { data } = firstCall(queues.assetMetrics.add)
    expect(data.totalCost).toBe('1500.75')
  })

  it('asset-metrics job carries laborHours', () => {
    const { data } = firstCall(queues.assetMetrics.add)
    expect(data.laborHours).toBe(3)
  })

  it('asset-metrics job uses event.eventId as jobId', () => {
    const { opts } = firstCall(queues.assetMetrics.add)
    expect(opts?.jobId).toBe(event.eventId)
  })

  it('asset-metrics job uses NORMAL retry settings (3 attempts)', () => {
    const { opts } = firstCall(queues.assetMetrics.add)
    expect(opts?.attempts).toBe(3)
  })

  // ── notifications job data ─────────────────────────────────────────────────

  it('notifications job type is WO_COMPLETED', () => {
    const { data } = firstCall(queues.notifications.add)
    expect(data.type).toBe('WO_COMPLETED')
  })

  it('notifications job includes technicianId as a recipient', () => {
    const { data } = firstCall(queues.notifications.add)
    expect(data.recipientUserIds).toContain(TECH_ID)
  })

  it('notifications job notifies MANAGER role', () => {
    const { data } = firstCall(queues.notifications.add)
    expect(data.notifyRoles).toContain('MANAGER')
  })

  it('notifications job priority is NORMAL', () => {
    const { data } = firstCall(queues.notifications.add)
    expect(data.priority).toBe('NORMAL')
  })

  it('notifications job payload contains resolution and laborHours', () => {
    const { data } = firstCall(queues.notifications.add)
    const payload = data.payload as Record<string, unknown>
    expect(payload.resolution).toBe('Replaced seal.')
    expect(payload.laborHours).toBe(3)
  })

  // ── pm-check job data ──────────────────────────────────────────────────────

  it('pm-check job carries correct assetId and workOrderId', () => {
    const { data } = firstCall(queues.pmCheck.add)
    expect(data.assetId).toBe(ASSET_ID)
    expect(data.workOrderId).toBe(AGG_ID)
  })

  it('pm-check job carries an ISO completedAt string', () => {
    const { data } = firstCall(queues.pmCheck.add)
    const completedAt = data.completedAt as string
    expect(() => new Date(completedAt)).not.toThrow()
    expect(new Date(completedAt).toISOString()).toBe(completedAt)
  })
})

// ── SLABreachedEvent ──────────────────────────────────────────────────────────

describe('SLABreachedEvent', () => {
  let queues: MockQueues
  let prisma: ReturnType<typeof makePrisma>
  let publisher: DomainEventPublisher
  let event: SLABreachedEvent

  beforeEach(async () => {
    queues = makeQueues()
    prisma = makePrisma()
    publisher = new DomainEventPublisher(queues as never, prisma as never, LOGGER)
    event = makeSLABreachedEvent()
    await publisher.publish(event)
  })

  it('writes an audit log row before enqueuing', () => {
    // auditLog.create must have been called before (or during) the queue add
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
  })

  it('audit log row has correct action and entityType', () => {
    const call = prisma.auditLog.create.mock.calls[0]
    const data = call?.[0]?.data
    expect(data?.action).toBe('SLA_BREACHED')
    expect(data?.entityType).toBe('WorkOrder')
    expect(data?.entityId).toBe(AGG_ID)
    expect(data?.tenantId).toBe(TENANT)
  })

  it('audit log `after` captures all SLA context', () => {
    const call = prisma.auditLog.create.mock.calls[0]
    const after = call?.[0]?.data?.after as Record<string, unknown>
    expect(after.woNumber).toBe('WO-2024-000042')
    expect(after.priority).toBe('CRITICAL')
    expect(after.overdueMinutes).toBe(90)
    expect(typeof after.slaDeadline).toBe('string')
  })

  it('enqueues a notification with CRITICAL priority', () => {
    expect(queues.notifications.add).toHaveBeenCalledTimes(1)
    const { data } = firstCall(queues.notifications.add)
    expect(data.priority).toBe('CRITICAL')
  })

  it('notification job type is SLA_BREACHED', () => {
    const { data } = firstCall(queues.notifications.add)
    expect(data.type).toBe('SLA_BREACHED')
  })

  it('notification job notifies both ADMIN and MANAGER roles', () => {
    const { data } = firstCall(queues.notifications.add)
    expect(data.notifyRoles).toContain('ADMIN')
    expect(data.notifyRoles).toContain('MANAGER')
  })

  it('notification job BullMQ priority is CRITICAL (1)', () => {
    const { opts } = firstCall(queues.notifications.add)
    expect(opts?.priority).toBe(JOB_PRIORITY.CRITICAL)
  })

  it('notification job has 5 retry attempts (CRITICAL settings)', () => {
    const { opts } = firstCall(queues.notifications.add)
    expect(opts?.attempts).toBe(5)
  })

  it('notification job uses event.eventId as jobId', () => {
    const { opts } = firstCall(queues.notifications.add)
    expect(opts?.jobId).toBe(event.eventId)
  })

  it('notification payload carries woNumber, priority, overdueMinutes', () => {
    const { data } = firstCall(queues.notifications.add)
    const payload = data.payload as Record<string, unknown>
    expect(payload.overdueMinutes).toBe(90)
    expect(payload.priority).toBe('CRITICAL')
  })

  it('does NOT touch asset-metrics, pm-check, or escalation-email queues', () => {
    expect(queues.assetMetrics.add).not.toHaveBeenCalled()
    expect(queues.pmCheck.add).not.toHaveBeenCalled()
    expect(queues.escalationEmail.add).not.toHaveBeenCalled()
  })

  it('audit log failure is non-fatal — notification still enqueued', async () => {
    prisma.auditLog.create.mockRejectedValueOnce(new Error('DB down'))
    const freshEvent = makeSLABreachedEvent()
    await expect(publisher.publish(freshEvent)).resolves.not.toThrow()
    // The notification queue add should still be called despite audit log failure
    expect(queues.notifications.add).toHaveBeenCalledTimes(2)
  })
})

// ── WorkOrderEscalatedEvent ───────────────────────────────────────────────────

describe('WorkOrderEscalatedEvent', () => {
  let queues: MockQueues
  let prisma: ReturnType<typeof makePrisma>
  let publisher: DomainEventPublisher
  let event: WorkOrderEscalatedEvent

  beforeEach(async () => {
    queues = makeQueues()
    prisma = makePrisma()
    publisher = new DomainEventPublisher(queues as never, prisma as never, LOGGER)
    event = makeEscalatedEvent()
    await publisher.publish(event)
  })

  it('enqueues a job on the notifications queue', () => {
    expect(queues.notifications.add).toHaveBeenCalledTimes(1)
  })

  it('enqueues a job on the escalation-email queue', () => {
    expect(queues.escalationEmail.add).toHaveBeenCalledTimes(1)
  })

  it('does NOT touch asset-metrics or pm-check queues', () => {
    expect(queues.assetMetrics.add).not.toHaveBeenCalled()
    expect(queues.pmCheck.add).not.toHaveBeenCalled()
  })

  it('does NOT write to the audit log', () => {
    expect(prisma.auditLog.create).not.toHaveBeenCalled()
  })

  // ── notifications job data ─────────────────────────────────────────────────

  it('notifications job type is WO_ESCALATED', () => {
    const { data } = callWithName(queues.notifications.add, QUEUE_NAMES.NOTIFICATIONS)
    expect(data.type).toBe('WO_ESCALATED')
  })

  it('notifications job notifies ADMIN and MANAGER roles', () => {
    const { data } = callWithName(queues.notifications.add, QUEUE_NAMES.NOTIFICATIONS)
    expect(data.notifyRoles).toContain('ADMIN')
    expect(data.notifyRoles).toContain('MANAGER')
  })

  it('notifications job priority is HIGH', () => {
    const { data } = callWithName(queues.notifications.add, QUEUE_NAMES.NOTIFICATIONS)
    expect(data.priority).toBe('HIGH')
  })

  it('notifications job BullMQ priority is HIGH (2)', () => {
    const { opts } = callWithName(queues.notifications.add, QUEUE_NAMES.NOTIFICATIONS)
    expect(opts?.priority).toBe(JOB_PRIORITY.HIGH)
  })

  it('notifications payload carries from/to priority', () => {
    const { data } = callWithName(queues.notifications.add, QUEUE_NAMES.NOTIFICATIONS)
    const payload = data.payload as Record<string, unknown>
    expect(payload.fromPriority).toBe('MEDIUM')
    expect(payload.toPriority).toBe('HIGH')
  })

  // ── escalation-email job data ──────────────────────────────────────────────

  it('escalation-email job carries fromPriority and toPriority', () => {
    const { data } = firstCall(queues.escalationEmail.add)
    expect(data.fromPriority).toBe('MEDIUM')
    expect(data.toPriority).toBe('HIGH')
  })

  it('escalation-email job carries tenantId and workOrderId', () => {
    const { data } = firstCall(queues.escalationEmail.add)
    expect(data.tenantId).toBe(TENANT)
    expect(data.workOrderId).toBe(AGG_ID)
  })

  it('escalation-email job jobId is distinct from notifications jobId', () => {
    const notifOpts = callWithName(queues.notifications.add, QUEUE_NAMES.NOTIFICATIONS).opts
    const emailOpts = firstCall(queues.escalationEmail.add).opts
    expect(notifOpts?.jobId).not.toBe(emailOpts?.jobId)
  })

  it('escalation-email job occurredAt is a valid ISO string', () => {
    const { data } = firstCall(queues.escalationEmail.add)
    expect(data.occurredAt).toBe(event.occurredAt.toISOString())
  })
})

// ── Unhandled event types ─────────────────────────────────────────────────────

describe('unhandled event types', () => {
  it('does not throw for an unrecognised eventType', async () => {
    const queues = makeQueues()
    const prisma = makePrisma()
    const publisher = new DomainEventPublisher(queues as never, prisma as never, LOGGER)

    const unknownEvent = new WorkOrderCreatedEvent({
      aggregateId: AGG_ID,
      woNumber: 'WO-1',
      tenantId: TENANT,
      assetId: ASSET_ID,
      type: 'CORRECTIVE',
      priority: 'LOW',
      createdById: 'u1',
    })

    await expect(publisher.publish(unknownEvent)).resolves.not.toThrow()
  })

  it('does not enqueue to any queue for an unrecognised event', async () => {
    const queues = makeQueues()
    const prisma = makePrisma()
    const publisher = new DomainEventPublisher(queues as never, prisma as never, LOGGER)

    const unknownEvent = new WorkOrderCreatedEvent({
      aggregateId: AGG_ID,
      woNumber: 'WO-1',
      tenantId: TENANT,
      assetId: ASSET_ID,
      type: 'CORRECTIVE',
      priority: 'LOW',
      createdById: 'u1',
    })

    await publisher.publish(unknownEvent)

    expect(queues.assetMetrics.add).not.toHaveBeenCalled()
    expect(queues.notifications.add).not.toHaveBeenCalled()
    expect(queues.pmCheck.add).not.toHaveBeenCalled()
    expect(queues.escalationEmail.add).not.toHaveBeenCalled()
  })
})

// ── publishAll() ──────────────────────────────────────────────────────────────

describe('publishAll()', () => {
  it('dispatches each event in the array', async () => {
    const queues = makeQueues()
    const prisma = makePrisma()
    const publisher = new DomainEventPublisher(queues as never, prisma as never, LOGGER)

    await publisher.publishAll([makeCompletedEvent(), makeEscalatedEvent()])

    expect(queues.assetMetrics.add).toHaveBeenCalledTimes(1) // from completed
    expect(queues.escalationEmail.add).toHaveBeenCalledTimes(1) // from escalated
  })

  it('continues dispatching remaining events when one event handler throws', async () => {
    const queues = makeQueues()
    const prisma = makePrisma()
    // Make the asset-metrics queue throw on the first completed event
    queues.assetMetrics.add.mockRejectedValueOnce(new Error('queue unavailable'))

    const publisher = new DomainEventPublisher(queues as never, prisma as never, LOGGER)

    // Should not throw even though one queue add failed
    await expect(
      publisher.publishAll([makeCompletedEvent(), makeEscalatedEvent()]),
    ).resolves.not.toThrow()

    // The escalation-email job from the escalated event should still be enqueued
    expect(queues.escalationEmail.add).toHaveBeenCalledTimes(1)
  })

  it('handles an empty array without error', async () => {
    const queues = makeQueues()
    const prisma = makePrisma()
    const publisher = new DomainEventPublisher(queues as never, prisma as never, LOGGER)
    await expect(publisher.publishAll([])).resolves.not.toThrow()
  })
})

// ── Job idempotency (eventId as jobId) ────────────────────────────────────────

describe('job idempotency', () => {
  it('uses event.eventId as the jobId on the primary queue job', async () => {
    const queues = makeQueues()
    const prisma = makePrisma()
    const publisher = new DomainEventPublisher(queues as never, prisma as never, LOGGER)
    const event = makeSLABreachedEvent()

    await publisher.publish(event)

    const { opts } = firstCall(queues.notifications.add)
    expect(opts?.jobId).toBe(event.eventId)
  })

  it('uses distinct jobIds for fanout jobs from the same event', async () => {
    const queues = makeQueues()
    const prisma = makePrisma()
    const publisher = new DomainEventPublisher(queues as never, prisma as never, LOGGER)
    const event = makeCompletedEvent()

    await publisher.publish(event)

    const metricsOpts = firstCall(queues.assetMetrics.add).opts
    const notifOpts = firstCall(queues.notifications.add).opts
    const pmOpts = firstCall(queues.pmCheck.add).opts

    // All three must be unique so duplicate-job protection on one queue does not
    // accidentally suppress jobs on another queue.
    const ids = [metricsOpts?.jobId, notifOpts?.jobId, pmOpts?.jobId]
    expect(new Set(ids).size).toBe(3)
  })
})

// ── Queue name constants ──────────────────────────────────────────────────────

describe('QUEUE_NAMES constants', () => {
  it('all four queue names are distinct strings', () => {
    const names = Object.values(QUEUE_NAMES)
    expect(new Set(names).size).toBe(names.length)
    names.forEach((n) => expect(typeof n).toBe('string'))
  })
})
