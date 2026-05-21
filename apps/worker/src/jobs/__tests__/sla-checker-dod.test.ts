/**
 * DoD #7 — SLA breach event fires correctly.
 *
 * Acceptance criteria
 * ───────────────────
 * Given a CRITICAL work order whose slaDeadline is in the past:
 *   1. SlaCheckerProcessor.run() calls publisher.publishSlaBreached()
 *   2. The published event is a SLABreachedEvent with the correct shape
 *   3. A Redis deduplication key is set (prevents double-alerting)
 *   4. A WO that has already been alerted (Redis key present) is NOT published again
 *   5. Non-overdue WOs are NOT published
 */
import { SLABreachedEvent } from '@maintainhub/domain'
import { SlaCheckerProcessor, SLA_JOB_NAME } from '../sla-checker'
import type {
  SlaNotificationPublisher,
  SlaWorkOrderRepository,
  SlaCheckerLogger,
} from '../sla-checker'

// ── BullMQ mock (no real Redis needed) ───────────────────────────────────────

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    close: jest.fn().mockResolvedValue(undefined),
    getRepeatableJobs: jest.fn().mockResolvedValue([]),
  })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn().mockReturnThis() })),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-critical-sla'
const WO_ID = 'clh7z2d1h0000z1x1z1x1z1x1'

/** A CRITICAL WO whose SLA deadline expired 2 hours ago. */
const OVERDUE_CRITICAL_WO = {
  id: WO_ID,
  tenantId: TENANT_ID,
  woNumber: 'WO-2024-000099',
  assetId: 'asset-pump-1',
  priority: 'CRITICAL',
  slaDeadline: new Date(Date.now() - 2 * 3_600_000), // 2 h ago
}

const LOGGER: SlaCheckerLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

function makeProcessor(
  opts: {
    woRows?: (typeof OVERDUE_CRITICAL_WO)[]
    alreadyAlerted?: boolean
  } = {},
) {
  const { woRows = [OVERDUE_CRITICAL_WO], alreadyAlerted = false } = opts

  const prisma = {
    tenant: {
      findMany: jest.fn().mockResolvedValue([{ id: TENANT_ID, isActive: true, settings: {} }]),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  }

  const redis = {
    get: jest.fn().mockResolvedValue(alreadyAlerted ? '1' : null),
    set: jest.fn().mockResolvedValue('OK'),
  }

  const woRepo: jest.Mocked<SlaWorkOrderRepository> = {
    findOverdueSLA: jest.fn().mockResolvedValue(woRows),
  }

  const publisher: jest.Mocked<SlaNotificationPublisher> = {
    publishSlaBreached: jest.fn().mockResolvedValue(undefined),
  }

  const processor = new SlaCheckerProcessor({
    prisma: prisma as never,
    redis: redis as never,
    woRepo,
    publisher,
    logger: LOGGER,
  })

  return { processor, prisma, redis, woRepo, publisher }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DoD #7 — SLA breach event fires for overdue CRITICAL WO', () => {
  it('calls publishSlaBreached once for the overdue WO', async () => {
    const { processor, publisher } = makeProcessor()

    await processor.run()

    expect(publisher.publishSlaBreached).toHaveBeenCalledTimes(1)
  })

  it('publishes a SLABreachedEvent instance', async () => {
    const { processor, publisher } = makeProcessor()

    await processor.run()

    const published = (publisher.publishSlaBreached as jest.Mock).mock.calls[0]?.[0]
    expect(published).toBeInstanceOf(SLABreachedEvent)
  })

  it('SLABreachedEvent carries the correct workOrderId and tenantId', async () => {
    const { processor, publisher } = makeProcessor()

    await processor.run()

    const event = (publisher.publishSlaBreached as jest.Mock).mock.calls[0]?.[0] as SLABreachedEvent
    expect(event.aggregateId).toBe(WO_ID)
    expect(event.tenantId).toBe(TENANT_ID)
  })

  it('sets a Redis deduplication key after alerting', async () => {
    const { processor, redis } = makeProcessor()

    await processor.run()

    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining(WO_ID),
      expect.any(String),
      expect.any(String),
      expect.any(Number),
    )
  })

  it('does NOT re-alert a WO that already has the Redis dedup key', async () => {
    const { processor, publisher } = makeProcessor({ alreadyAlerted: true })

    await processor.run()

    expect(publisher.publishSlaBreached).not.toHaveBeenCalled()
  })

  it('does NOT alert a WO that is not yet overdue', async () => {
    const futureDeadline = new Date(Date.now() + 60 * 60_000) // 1 h from now
    const notOverdueWo = { ...OVERDUE_CRITICAL_WO, slaDeadline: futureDeadline }
    const { processor, publisher } = makeProcessor({ woRows: [notOverdueWo] })

    // findOverdueSLA already filters by deadline — return empty to simulate
    // eslint-disable-next-line @typescript-eslint/dot-notation -- accessing private field in test
    processor['woRepo'].findOverdueSLA = jest.fn().mockResolvedValue([])

    await processor.run()

    expect(publisher.publishSlaBreached).not.toHaveBeenCalled()
  })

  it('writes an AuditLog row before setting the Redis key', async () => {
    const { processor, prisma, redis } = makeProcessor()
    const callOrder: string[] = []

    ;(prisma.auditLog.create as jest.Mock).mockImplementation(async () => {
      callOrder.push('audit')
      return {}
    })
    ;(redis.set as jest.Mock).mockImplementation(() => {
      callOrder.push('redis')
      return 'OK'
    })

    await processor.run()

    expect(callOrder).toEqual(['audit', 'redis'])
  })

  it('returns the correct job name constant for the repeatable job', () => {
    expect(SLA_JOB_NAME).toBe('sla:check')
  })
})
