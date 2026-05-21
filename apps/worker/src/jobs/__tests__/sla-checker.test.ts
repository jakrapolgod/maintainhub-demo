/**
 * Unit tests for SlaCheckerProcessor, BullMqSlaNotificationPublisher,
 * createSlaCheckerWorker, and scheduleSlaChecker.
 *
 * BullMQ is mocked at module level so no real Redis/Queue is needed.
 */
import { SLABreachedEvent } from '@maintainhub/domain'
import {
  SlaCheckerProcessor,
  BullMqSlaNotificationPublisher,
  createSlaCheckerWorker,
  scheduleSlaChecker,
  SLA_JOB_NAME,
} from '../sla-checker'
import type {
  SlaNotificationPublisher,
  SlaWorkOrderRepository,
  SlaCheckerLogger,
} from '../sla-checker'

// ── Module-level BullMQ mock ──────────────────────────────────────────────────

const mockQueueAdd = jest.fn().mockResolvedValue({ id: 'job-1' })
const mockQueueClose = jest.fn().mockResolvedValue(undefined)
const mockGetRepeatables = jest.fn().mockResolvedValue([{ key: 'rep-1' }])

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: mockQueueClose,
    getRepeatableJobs: mockGetRepeatables,
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn().mockReturnThis(),
  })),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_A = 'tenant-a'
const TENANT_B = 'tenant-b'
const WO_ID = 'clh7z2d1h0000z1x1z1x1z1x1'
const WO_ID_2 = 'cm9pq3r2i0000ymbj1nhq1zr2'

const PAST_DEADLINE = new Date(Date.now() - 60 * 60_000) // 1 hour ago

const makeOverdueWo = (id = WO_ID, tenantId = TENANT_A) => ({
  id,
  tenantId,
  woNumber: `WO-2024-000001`,
  assetId: 'asset-1',
  priority: 'HIGH',
  slaDeadline: PAST_DEADLINE,
})

// ── Mock factories ────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    tenant: { findMany: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  }
}

function makeRedis() {
  return {
    get: jest.fn().mockResolvedValue(null), // default: key not present
    set: jest.fn().mockResolvedValue('OK'),
  }
}

function makeWoRepo(): jest.Mocked<SlaWorkOrderRepository> {
  return { findOverdueSLA: jest.fn().mockResolvedValue([]) }
}

function makePublisher(): jest.Mocked<SlaNotificationPublisher> {
  return { publishSlaBreached: jest.fn().mockResolvedValue(undefined) }
}

const LOGGER: SlaCheckerLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

function makeProcessor(
  overrides: {
    prisma?: ReturnType<typeof makePrisma>
    redis?: ReturnType<typeof makeRedis>
    woRepo?: jest.Mocked<SlaWorkOrderRepository>
    publisher?: jest.Mocked<SlaNotificationPublisher>
  } = {},
) {
  const prisma = overrides.prisma ?? makePrisma()
  const redis = overrides.redis ?? makeRedis()
  const woRepo = overrides.woRepo ?? makeWoRepo()
  const publisher = overrides.publisher ?? makePublisher()

  const processor = new SlaCheckerProcessor({
    prisma: prisma as never,
    redis: redis as never,
    woRepo,
    publisher,
    logger: LOGGER,
  })

  return { processor, prisma, redis, woRepo, publisher }
}

// ── run() ─────────────────────────────────────────────────────────────────────

describe('SlaCheckerProcessor.run()', () => {
  it('fetches only active tenants', async () => {
    const { processor, prisma } = makeProcessor()
    prisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A, isActive: true, settings: {} }])

    await processor.run()

    const call = prisma.tenant.findMany.mock.calls[0]?.[0]
    expect(call?.where?.isActive).toBe(true)
  })

  it('returns tenantsChecked = number of tenants', async () => {
    const { processor, prisma } = makeProcessor()
    prisma.tenant.findMany.mockResolvedValue([
      { id: TENANT_A, isActive: true, settings: {} },
      { id: TENANT_B, isActive: true, settings: {} },
    ])

    const result = await processor.run()
    expect(result.tenantsChecked).toBe(2)
  })

  it('calls findOverdueSLA once per tenant', async () => {
    const { processor, prisma, woRepo } = makeProcessor()
    prisma.tenant.findMany.mockResolvedValue([
      { id: TENANT_A, isActive: true, settings: {} },
      { id: TENANT_B, isActive: true, settings: {} },
    ])

    await processor.run()

    expect(woRepo.findOverdueSLA).toHaveBeenCalledTimes(2)
    expect(woRepo.findOverdueSLA).toHaveBeenCalledWith(TENANT_A)
    expect(woRepo.findOverdueSLA).toHaveBeenCalledWith(TENANT_B)
  })

  it('continues processing other tenants when one tenant check throws', async () => {
    const { processor, prisma, woRepo } = makeProcessor()
    prisma.tenant.findMany.mockResolvedValue([
      { id: TENANT_A, isActive: true, settings: {} },
      { id: TENANT_B, isActive: true, settings: {} },
    ])
    // Tenant A throws, Tenant B should still be checked
    woRepo.findOverdueSLA
      .mockRejectedValueOnce(new Error('DB error for A'))
      .mockResolvedValueOnce([])

    await expect(processor.run()).resolves.not.toThrow()
    expect(woRepo.findOverdueSLA).toHaveBeenCalledWith(TENANT_B)
  })

  it('returns alertsSent = 0 and alreadyAlerted = 0 with no overdue WOs', async () => {
    const { processor, prisma } = makeProcessor()
    prisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A, isActive: true, settings: {} }])

    const result = await processor.run()

    expect(result.alertsSent).toBe(0)
    expect(result.alreadyAlerted).toBe(0)
  })
})

// ── Deduplication (Redis key check) ──────────────────────────────────────────

describe('Deduplication via Redis key', () => {
  it('does NOT publish when sla-alerted:{woId} key exists in Redis', async () => {
    const { processor, prisma, redis, woRepo, publisher } = makeProcessor()
    prisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A, isActive: true, settings: {} }])
    woRepo.findOverdueSLA.mockResolvedValue([makeOverdueWo()])
    redis.get.mockResolvedValue('2024-01-01T00:00:00.000Z') // already alerted

    const result = await processor.run()

    expect(publisher.publishSlaBreached).not.toHaveBeenCalled()
    expect(result.alreadyAlerted).toBe(1)
    expect(result.alertsSent).toBe(0)
  })

  it('DOES publish when sla-alerted:{woId} key is absent in Redis', async () => {
    const { processor, prisma, redis, woRepo, publisher } = makeProcessor()
    prisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A, isActive: true, settings: {} }])
    woRepo.findOverdueSLA.mockResolvedValue([makeOverdueWo()])
    redis.get.mockResolvedValue(null) // not alerted yet

    const result = await processor.run()

    expect(publisher.publishSlaBreached).toHaveBeenCalledTimes(1)
    expect(result.alertsSent).toBe(1)
    expect(result.alreadyAlerted).toBe(0)
  })

  it('checks Redis with the key `sla-alerted:{woId}`', async () => {
    const { processor, prisma, redis, woRepo } = makeProcessor()
    prisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A, isActive: true, settings: {} }])
    woRepo.findOverdueSLA.mockResolvedValue([makeOverdueWo(WO_ID)])

    await processor.run()

    expect(redis.get).toHaveBeenCalledWith(`sla-alerted:${WO_ID}`)
  })

  it('sets the Redis key with EX 3600 after alerting', async () => {
    const { processor, prisma, redis, woRepo } = makeProcessor()
    prisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A, isActive: true, settings: {} }])
    woRepo.findOverdueSLA.mockResolvedValue([makeOverdueWo(WO_ID)])
    redis.get.mockResolvedValue(null)

    await processor.run()

    expect(redis.set).toHaveBeenCalledWith(`sla-alerted:${WO_ID}`, expect.any(String), 'EX', 3600)
  })

  it('does not set the Redis key when alert was suppressed', async () => {
    const { processor, prisma, redis, woRepo } = makeProcessor()
    prisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A, isActive: true, settings: {} }])
    woRepo.findOverdueSLA.mockResolvedValue([makeOverdueWo()])
    redis.get.mockResolvedValue('existing') // suppressed

    await processor.run()

    expect(redis.set).not.toHaveBeenCalled()
  })
})

// ── SLABreachedEvent payload ──────────────────────────────────────────────────

describe('SLABreachedEvent emitted on new breach', () => {
  async function publishedEvent() {
    const { processor, prisma, redis, woRepo, publisher } = makeProcessor()
    prisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A, isActive: true, settings: {} }])
    woRepo.findOverdueSLA.mockResolvedValue([makeOverdueWo(WO_ID, TENANT_A)])
    redis.get.mockResolvedValue(null)

    await processor.run()

    const [event] = publisher.publishSlaBreached.mock.calls[0] as [SLABreachedEvent]
    return event
  }

  it('event is an instance of SLABreachedEvent', async () => {
    expect(await publishedEvent()).toBeInstanceOf(SLABreachedEvent)
  })

  it('event.aggregateId equals the work order id', async () => {
    expect((await publishedEvent()).aggregateId).toBe(WO_ID)
  })

  it('event.tenantId equals the tenant id', async () => {
    expect((await publishedEvent()).tenantId).toBe(TENANT_A)
  })

  it('event.priority equals the WO priority', async () => {
    expect((await publishedEvent()).priority).toBe('HIGH')
  })

  it('event.slaDeadline equals the WO slaDeadline', async () => {
    expect((await publishedEvent()).slaDeadline).toEqual(PAST_DEADLINE)
  })

  it('event.overdueMinutes is positive for a past deadline', async () => {
    expect((await publishedEvent()).overdueMinutes).toBeGreaterThan(0)
  })

  it('event has a non-empty eventId (UUID)', async () => {
    expect((await publishedEvent()).eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })
})

// ── Audit log ─────────────────────────────────────────────────────────────────

describe('Audit log on new breach', () => {
  it('writes an auditLog row with action SLA_BREACHED', async () => {
    const { processor, prisma, redis, woRepo } = makeProcessor()
    prisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A, isActive: true, settings: {} }])
    woRepo.findOverdueSLA.mockResolvedValue([makeOverdueWo()])
    redis.get.mockResolvedValue(null)

    await processor.run()

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
    const data = prisma.auditLog.create.mock.calls[0]?.[0]?.data
    expect(data?.action).toBe('SLA_BREACHED')
    expect(data?.entityType).toBe('WorkOrder')
    expect(data?.entityId).toBe(WO_ID)
    expect(data?.tenantId).toBe(TENANT_A)
  })

  it('audit `after` includes slaBreachedAt ISO string', async () => {
    const { processor, prisma, redis, woRepo } = makeProcessor()
    prisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A, isActive: true, settings: {} }])
    woRepo.findOverdueSLA.mockResolvedValue([makeOverdueWo()])
    redis.get.mockResolvedValue(null)

    await processor.run()

    const after = prisma.auditLog.create.mock.calls[0]?.[0]?.data?.after as Record<string, unknown>
    expect(typeof after.slaBreachedAt).toBe('string')
    expect(() => new Date(after.slaBreachedAt as string)).not.toThrow()
  })

  it('audit log failure does not prevent Redis key being set', async () => {
    const { processor, prisma, redis, woRepo } = makeProcessor()
    prisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A, isActive: true, settings: {} }])
    woRepo.findOverdueSLA.mockResolvedValue([makeOverdueWo(WO_ID)])
    redis.get.mockResolvedValue(null)
    prisma.auditLog.create.mockRejectedValueOnce(new Error('DB write failed'))

    await expect(processor.run()).resolves.not.toThrow()

    // Redis key must still be set so duplicate alerts are suppressed
    expect(redis.set).toHaveBeenCalledWith(`sla-alerted:${WO_ID}`, expect.any(String), 'EX', 3600)
  })

  it('does NOT write audit log for suppressed (already-alerted) WOs', async () => {
    const { processor, prisma, redis, woRepo } = makeProcessor()
    prisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A, isActive: true, settings: {} }])
    woRepo.findOverdueSLA.mockResolvedValue([makeOverdueWo()])
    redis.get.mockResolvedValue('already') // suppressed

    await processor.run()

    expect(prisma.auditLog.create).not.toHaveBeenCalled()
  })
})

// ── Multiple WOs per tenant ───────────────────────────────────────────────────

describe('Multiple overdue WOs in a single tenant', () => {
  it('processes each WO independently', async () => {
    const { processor, prisma, redis, woRepo, publisher } = makeProcessor()
    prisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A, isActive: true, settings: {} }])
    woRepo.findOverdueSLA.mockResolvedValue([makeOverdueWo(WO_ID), makeOverdueWo(WO_ID_2)])
    redis.get.mockResolvedValue(null) // neither alerted

    const result = await processor.run()

    expect(publisher.publishSlaBreached).toHaveBeenCalledTimes(2)
    expect(result.alertsSent).toBe(2)
  })

  it('correctly mixes alerted and new WOs in the same run', async () => {
    const { processor, prisma, redis, woRepo, publisher } = makeProcessor()
    prisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A, isActive: true, settings: {} }])
    woRepo.findOverdueSLA.mockResolvedValue([
      makeOverdueWo(WO_ID), // not yet alerted
      makeOverdueWo(WO_ID_2), // already alerted
    ])
    redis.get
      .mockResolvedValueOnce(null) // WO_ID  → alert
      .mockResolvedValueOnce('existing') // WO_ID_2 → suppress

    const result = await processor.run()

    expect(publisher.publishSlaBreached).toHaveBeenCalledTimes(1)
    expect(result.alertsSent).toBe(1)
    expect(result.alreadyAlerted).toBe(1)
  })
})

// ── Empty tenant list ─────────────────────────────────────────────────────────

describe('Edge: no active tenants', () => {
  it('completes without error when tenant list is empty', async () => {
    const { processor, prisma } = makeProcessor()
    prisma.tenant.findMany.mockResolvedValue([])

    const result = await processor.run()

    expect(result.tenantsChecked).toBe(0)
    expect(result.alertsSent).toBe(0)
  })
})

// ── BullMqSlaNotificationPublisher ───────────────────────────────────────────

describe('BullMqSlaNotificationPublisher', () => {
  const REDIS_STUB = {} as never

  beforeEach(() => mockQueueAdd.mockClear())

  it('adds a job to the notifications queue', async () => {
    const pub = new BullMqSlaNotificationPublisher(REDIS_STUB)
    const event = new SLABreachedEvent({
      aggregateId: WO_ID,
      tenantId: TENANT_A,
      assetId: 'asset-1',
      woNumber: 'WO-2024-000001',
      priority: 'CRITICAL',
      slaDeadline: PAST_DEADLINE,
      overdueMinutes: 90,
    })

    await pub.publishSlaBreached(event)

    expect(mockQueueAdd).toHaveBeenCalledTimes(1)
  })

  it('uses event.eventId as the BullMQ jobId', async () => {
    const pub = new BullMqSlaNotificationPublisher(REDIS_STUB)
    const event = new SLABreachedEvent({
      aggregateId: WO_ID,
      tenantId: TENANT_A,
      assetId: 'a',
      woNumber: 'WO-1',
      priority: 'HIGH',
      slaDeadline: PAST_DEADLINE,
      overdueMinutes: 5,
    })

    await pub.publishSlaBreached(event)

    const opts = mockQueueAdd.mock.calls[0]?.[2]
    expect(opts?.jobId).toBe(event.eventId)
  })

  it('job data type is SLA_BREACHED', async () => {
    const pub = new BullMqSlaNotificationPublisher(REDIS_STUB)
    const event = new SLABreachedEvent({
      aggregateId: WO_ID,
      tenantId: TENANT_A,
      assetId: 'a',
      woNumber: 'WO-1',
      priority: 'HIGH',
      slaDeadline: PAST_DEADLINE,
      overdueMinutes: 5,
    })

    await pub.publishSlaBreached(event)

    const data = mockQueueAdd.mock.calls[0]?.[1]
    expect(data?.type).toBe('SLA_BREACHED')
    expect(data?.priority).toBe('CRITICAL')
    expect(data?.notifyRoles).toContain('ADMIN')
    expect(data?.notifyRoles).toContain('MANAGER')
  })
})

// ── createSlaCheckerWorker ────────────────────────────────────────────────────

describe('createSlaCheckerWorker()', () => {
  it('returns an object with an `on` method (BullMQ Worker)', () => {
    const { processor } = makeProcessor()
    const worker = createSlaCheckerWorker(processor, {} as never, LOGGER)
    expect(typeof worker.on).toBe('function')
  })

  it('worker job callback invokes processor.run()', async () => {
    const { processor } = makeProcessor()
    // The processor's run is already a spy via makePrisma mock chaining;
    // replace it with a direct jest.fn() for clarity.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runSpy = jest.spyOn(processor as any, 'run').mockResolvedValue({
      tenantsChecked: 0,
      alertsSent: 0,
      alreadyAlerted: 0,
    })

    // Reset Worker mock call history so we only see THIS createSlaCheckerWorker call
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BullWorker = (jest.requireMock('bullmq') as any).Worker as jest.Mock
    BullWorker.mockClear()

    createSlaCheckerWorker(processor, {} as never, LOGGER)

    // Extract the processor callback (2nd arg to Worker constructor)
    const workerArgs = BullWorker.mock.calls[0] as [string, (j: unknown) => Promise<void>]
    const callback = workerArgs[1]

    await callback({}) // simulate BullMQ firing the job

    expect(runSpy).toHaveBeenCalledTimes(1)
  })
})

// ── scheduleSlaChecker ────────────────────────────────────────────────────────

describe('scheduleSlaChecker()', () => {
  beforeEach(() => {
    mockQueueAdd.mockClear()
    mockQueueClose.mockClear()
  })

  it('adds a repeatable job with the SLA_JOB_NAME', async () => {
    await scheduleSlaChecker({} as never, LOGGER)

    expect(mockQueueAdd).toHaveBeenCalledWith(
      SLA_JOB_NAME,
      expect.anything(),
      expect.objectContaining({ repeat: expect.objectContaining({ every: 5 * 60 * 1000 }) }),
    )
  })

  it('closes the scheduler queue after registering', async () => {
    await scheduleSlaChecker({} as never, LOGGER)
    expect(mockQueueClose).toHaveBeenCalledTimes(1)
  })
})

// ── Integration: processor sees correct event fields ─────────────────────────

describe('Processor uses SLABreachedEvent fields correctly', () => {
  it('overdueMinutes in event matches the actual elapsed time', async () => {
    // Create a deadline that was exactly 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000)
    const wo = { ...makeOverdueWo(), slaDeadline: twoHoursAgo }

    const { processor, prisma, redis, woRepo, publisher } = makeProcessor()
    prisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A, isActive: true, settings: {} }])
    woRepo.findOverdueSLA.mockResolvedValue([wo])
    redis.get.mockResolvedValue(null)

    await processor.run()

    const [event] = publisher.publishSlaBreached.mock.calls[0] as [SLABreachedEvent]
    // Should be ~120 minutes (allow a few seconds of timing jitter)
    expect(event.overdueMinutes).toBeGreaterThanOrEqual(119)
    expect(event.overdueMinutes).toBeLessThanOrEqual(121)
  })
})

// ── PrismaWorkOrderRepository findOverdueSLA ──────────────────────────────────

describe('PrismaOverdueWoRepository', () => {
  it('is constructed without throwing', () => {
    const { PrismaOverdueWoRepository } = jest.requireActual('../sla-checker') as {
      PrismaOverdueWoRepository: new (p: unknown) => unknown
    }
    const fakePrisma = {
      workOrder: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const repo = new PrismaOverdueWoRepository(fakePrisma)
    expect(repo).toBeDefined()
  })

  it('calls workOrder.findMany with the correct where clause', async () => {
    const { PrismaOverdueWoRepository } = jest.requireActual('../sla-checker') as {
      PrismaOverdueWoRepository: new (p: unknown) => {
        findOverdueSLA(t: string): Promise<unknown[]>
      }
    }
    const findMany = jest.fn().mockResolvedValue([])
    const repo = new PrismaOverdueWoRepository({ workOrder: { findMany } })

    await repo.findOverdueSLA('tenant-x')

    const args = findMany.mock.calls[0]?.[0]
    expect(args?.where?.tenantId).toBe('tenant-x')
    expect(args?.where?.deletedAt).toBe(null)
    expect(args?.where?.status?.in).toContain('OPEN')
    expect(args?.where?.status?.in).toContain('IN_PROGRESS')
    expect(args?.where?.slaDeadline?.lt).toBeInstanceOf(Date)
  })
})
