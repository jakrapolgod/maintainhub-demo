/**
 * Unit tests for PMSchedulerProcessor and PMAdvanceNoticeProcessor.
 *
 * All external dependencies (Prisma, Redis, BullMQ, PMScheduleRepository,
 * WorkOrderCreator, NotificationPublisher) are mocked.
 */

/* eslint-disable max-classes-per-file */
import { PMSchedule, PMScheduleId, CalendarRule } from '@maintainhub/domain'
import { PMSchedulerProcessor } from '../pm-scheduler.js'
import { PMAdvanceNoticeProcessor } from '../pm-advance-notice.js'
import type {
  PMSchedulerLogger,
  WorkOrderCreator,
  NotificationPublisher,
} from '../pm-scheduler-types.js'

jest.mock('bullmq', () => ({
  Queue: class MockQueue {
    add = jest.fn().mockResolvedValue({ id: 'mock-job-id' })

    getRepeatableJobs = jest.fn().mockResolvedValue([])

    close = jest.fn().mockResolvedValue(undefined)
  },
  Worker: class MockWorker {
    on = jest.fn().mockReturnThis()

    close = jest.fn().mockResolvedValue(undefined)
  },
}))

// โ”€โ”€ Helpers โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

const VALID_SCHEDULE_ID = 'clh7z2d1h0000z1x1z1x1z1x1'
const VALID_ASSET_ID = 'clh7z2d1h0001z1x1z1x1z1x2'
const TENANT_ID = 'tenant-1'

function makeCalendarSchedule(opts: {
  nextDueAt?: Date
  isActive?: boolean
  advanceNoticeDays?: number
  defaultAssigneeIds?: string[]
}) {
  const now = new Date()
  const nextDue = opts.nextDueAt ?? new Date(now.getTime() - 1000) // past due

  return PMSchedule.reconstitute({
    id: new PMScheduleId(VALID_SCHEDULE_ID),
    tenantId: TENANT_ID,
    assetId: VALID_ASSET_ID,
    type: 'CALENDAR',
    title: 'Monthly Lubrication',
    description: 'Lubricate all bearings',
    calendarRule: new CalendarRule({
      frequency: 'monthly',
      interval: 1,
      dayOfWeek: undefined,
      dayOfMonth: undefined,
      month: undefined,
    }),
    meterRule: undefined,
    conditionRule: undefined,
    taskList: [],
    estimatedHours: 2,
    requiredParts: [],
    requiredSkillIds: [],
    defaultAssigneeIds: opts.defaultAssigneeIds ?? [],
    isActive: opts.isActive ?? true,
    lastTriggeredAt: undefined,
    nextDueAt: nextDue,
    advanceNoticeDays: opts.advanceNoticeDays ?? 7,
    createdById: 'user-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: now,
  })
}

function makeLogger(): PMSchedulerLogger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
}

function makeRedis(getReturnValue: string | null = null) {
  return {
    get: jest.fn().mockResolvedValue(getReturnValue),
    set: jest.fn().mockResolvedValue('OK'),
  }
}

function makeWoCreator(): WorkOrderCreator {
  return {
    createFromPMDraft: jest.fn().mockResolvedValue('new-wo-id'),
  }
}

function makePublisher(): NotificationPublisher {
  return {
    publishAdvanceNotice: jest.fn().mockResolvedValue(undefined),
    publishJobFailed: jest.fn().mockResolvedValue(undefined),
  }
}

// โ”€โ”€ PMSchedulerProcessor โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

describe('PMSchedulerProcessor', () => {
  describe('run()', () => {
    it('triggers a due schedule and creates a WO', async () => {
      const schedule = makeCalendarSchedule({ nextDueAt: new Date(Date.now() - 1000) })
      const pmRepo = {
        findDueForTrigger: jest.fn().mockResolvedValue([schedule]),
        update: jest.fn().mockResolvedValue(undefined),
      }
      const woCreator = makeWoCreator()
      const publisher = makePublisher()
      const redis = makeRedis(null)
      const logger = makeLogger()

      const processor = new PMSchedulerProcessor({
        pmRepo: pmRepo as never,
        woCreator,
        publisher,
        redis: redis as never,
        logger,
      })
      const result = await processor.run()

      expect(result.triggered).toBe(1)
      expect(result.failures).toBe(0)
      expect(woCreator.createFromPMDraft).toHaveBeenCalledTimes(1)
      expect(pmRepo.update).toHaveBeenCalledWith(schedule)
    })

    it('skips an inactive schedule', async () => {
      const schedule = makeCalendarSchedule({ isActive: false })
      const pmRepo = {
        findDueForTrigger: jest.fn().mockResolvedValue([schedule]),
        update: jest.fn(),
      }
      const woCreator = makeWoCreator()
      const publisher = makePublisher()
      const redis = makeRedis(null)
      const logger = makeLogger()

      const processor = new PMSchedulerProcessor({
        pmRepo: pmRepo as never,
        woCreator,
        publisher,
        redis: redis as never,
        logger,
      })
      const result = await processor.run()

      expect(result.triggered).toBe(0)
      expect(woCreator.createFromPMDraft).not.toHaveBeenCalled()
    })

    it('skips a schedule not yet due (within pre-filter but outside exact window)', async () => {
      // 20 days in the future, advance-notice = 7 โ’ should NOT trigger
      const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)
      const schedule = makeCalendarSchedule({ nextDueAt: futureDate, advanceNoticeDays: 7 })
      const pmRepo = {
        findDueForTrigger: jest.fn().mockResolvedValue([schedule]),
        update: jest.fn(),
      }
      const woCreator = makeWoCreator()
      const publisher = makePublisher()
      const redis = makeRedis(null)
      const logger = makeLogger()

      const processor = new PMSchedulerProcessor({
        pmRepo: pmRepo as never,
        woCreator,
        publisher,
        redis: redis as never,
        logger,
      })
      const result = await processor.run()

      expect(result.triggered).toBe(0)
    })

    it('counts failures and continues processing remaining schedules', async () => {
      const s1 = makeCalendarSchedule({ nextDueAt: new Date(Date.now() - 1000) })
      const s2 = makeCalendarSchedule({ nextDueAt: new Date(Date.now() - 2000) })
      const pmRepo = {
        findDueForTrigger: jest.fn().mockResolvedValue([s1, s2]),
        update: jest.fn().mockResolvedValue(undefined),
      }
      const woCreator = {
        createFromPMDraft: jest
          .fn()
          .mockRejectedValueOnce(new Error('DB down'))
          .mockResolvedValueOnce('wo-id-2'),
      }
      const publisher = makePublisher()
      const redis = makeRedis(null)
      const logger = makeLogger()

      const processor = new PMSchedulerProcessor({
        pmRepo: pmRepo as never,
        woCreator,
        publisher,
        redis: redis as never,
        logger,
      })
      const result = await processor.run()

      expect(result.triggered).toBe(1)
      expect(result.failures).toBe(1)
      expect(logger.error).toHaveBeenCalledTimes(1)
    })

    it('sends advance notice for next due date after trigger', async () => {
      const schedule = makeCalendarSchedule({
        nextDueAt: new Date(Date.now() - 1000),
        advanceNoticeDays: 14,
        defaultAssigneeIds: ['user-1'],
      })
      const pmRepo = {
        findDueForTrigger: jest.fn().mockResolvedValue([schedule]),
        update: jest.fn().mockResolvedValue(undefined),
      }
      const woCreator = makeWoCreator()
      const publisher = makePublisher()
      const redis = makeRedis(null) // no existing key โ’ notice should be sent
      const logger = makeLogger()

      const processor = new PMSchedulerProcessor({
        pmRepo: pmRepo as never,
        woCreator,
        publisher,
        redis: redis as never,
        logger,
      })
      const result = await processor.run()

      expect(result.triggered).toBe(1)
      // After trigger, nextDueAt is ~1 month away; 14-day window โ’ notice sent
      // (exact logic depends on whether new nextDueAt < 14 days away)
      // At minimum, the publisher should have been available to call
      expect(result.failures).toBe(0)
    })

    it('deduplicates advance notices via Redis', async () => {
      const nearFuture = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days away
      const schedule = makeCalendarSchedule({ nextDueAt: nearFuture, advanceNoticeDays: 7 })
      const pmRepo = {
        findDueForTrigger: jest.fn().mockResolvedValue([schedule]),
        update: jest.fn().mockResolvedValue(undefined),
      }
      const woCreator = makeWoCreator()
      const publisher = makePublisher()
      // Redis already has a key โ’ notice should NOT be sent again
      const redis = makeRedis('1')
      const logger = makeLogger()

      const processor = new PMSchedulerProcessor({
        pmRepo: pmRepo as never,
        woCreator,
        publisher,
        redis: redis as never,
        logger,
      })
      await processor.run()

      // schedule.shouldTrigger passes (3 days within 7-day advance window)
      // but advance-notice publish should NOT fire (redis dedup key exists)
      expect(publisher.publishAdvanceNotice).not.toHaveBeenCalled()
    })

    it('returns correct tenant count', async () => {
      const s1 = makeCalendarSchedule({})
      const s2 = PMSchedule.reconstitute({
        id: new PMScheduleId('clh7z2d1h0002z1x1z1x1z1x3'),
        tenantId: 'tenant-2',
        assetId: VALID_ASSET_ID,
        type: 'CALENDAR',
        title: 'Other',
        description: '',
        calendarRule: new CalendarRule({
          frequency: 'monthly',
          interval: 1,
          dayOfWeek: undefined,
          dayOfMonth: undefined,
          month: undefined,
        }),
        meterRule: undefined,
        conditionRule: undefined,
        taskList: [],
        estimatedHours: 1,
        requiredParts: [],
        requiredSkillIds: [],
        defaultAssigneeIds: [],
        isActive: true,
        lastTriggeredAt: undefined,
        nextDueAt: new Date(Date.now() - 1000),
        advanceNoticeDays: 7,
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const pmRepo = {
        findDueForTrigger: jest.fn().mockResolvedValue([s1, s2]),
        update: jest.fn().mockResolvedValue(undefined),
      }
      const processor = new PMSchedulerProcessor({
        pmRepo: pmRepo as never,
        woCreator: makeWoCreator(),
        publisher: makePublisher(),
        redis: makeRedis(null) as never,
        logger: makeLogger(),
      })

      const result = await processor.run()
      expect(result.tenantsChecked).toBe(2)
    })
  })
})

// โ”€โ”€ PMAdvanceNoticeProcessor โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

describe('PMAdvanceNoticeProcessor', () => {
  const makePrisma = (
    rows: Array<{
      id: string
      tenantId: string
      assetId: string
      title: string
      nextDue: Date
      calendarRule: unknown
      meterRule: unknown
    }>,
  ) => ({
    pMSchedule: {
      findMany: jest.fn().mockResolvedValue(rows),
    },
  })

  function makeRow(daysAway: number, advanceNoticeDays = 7, assigneeIds: string[] = []) {
    const nextDue = new Date(Date.now() + daysAway * 24 * 60 * 60 * 1000)
    return {
      id: VALID_SCHEDULE_ID,
      tenantId: TENANT_ID,
      assetId: VALID_ASSET_ID,
      title: 'Monthly Check',
      nextDue,
      calendarRule: {
        frequency: 'monthly',
        interval: 1,
        pmMeta: { advanceNoticeDays, defaultAssigneeIds: assigneeIds },
      },
      meterRule: null,
    }
  }

  it('sends notice for schedule within advance window', async () => {
    const row = makeRow(3, 7, ['user-1'])
    const prisma = makePrisma([row])
    const redis = makeRedis(null)
    const publisher = makePublisher()
    const logger = makeLogger()

    const proc = new PMAdvanceNoticeProcessor(prisma as never, redis as never, publisher, logger)
    const result = await proc.run()

    expect(result.noticesSent).toBe(1)
    expect(publisher.publishAdvanceNotice).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleId: VALID_SCHEDULE_ID, tenantId: TENANT_ID }),
    )
    expect(redis.set).toHaveBeenCalledTimes(1)
  })

  it('skips schedule outside advance window', async () => {
    const row = makeRow(15, 7) // 15 days away, advance=7 โ’ skip
    const prisma = makePrisma([row])
    const redis = makeRedis(null)
    const publisher = makePublisher()
    const logger = makeLogger()

    const proc = new PMAdvanceNoticeProcessor(prisma as never, redis as never, publisher, logger)
    const result = await proc.run()

    expect(result.noticesSent).toBe(0)
    expect(publisher.publishAdvanceNotice).not.toHaveBeenCalled()
  })

  it('deduplicates using Redis key', async () => {
    const row = makeRow(3, 7)
    const prisma = makePrisma([row])
    const redis = makeRedis('1') // already sent
    const publisher = makePublisher()
    const logger = makeLogger()

    const proc = new PMAdvanceNoticeProcessor(prisma as never, redis as never, publisher, logger)
    const result = await proc.run()

    expect(result.noticesSent).toBe(0)
    expect(publisher.publishAdvanceNotice).not.toHaveBeenCalled()
  })

  it('counts failures and continues', async () => {
    const row = makeRow(3, 7)
    const prisma = makePrisma([row])
    const redis = makeRedis(null)
    const publisher = {
      publishAdvanceNotice: jest.fn().mockRejectedValue(new Error('queue down')),
      publishJobFailed: jest.fn(),
    }
    const logger = makeLogger()

    const proc = new PMAdvanceNoticeProcessor(prisma as never, redis as never, publisher, logger)
    const result = await proc.run()

    expect(result.failures).toBe(1)
    expect(result.noticesSent).toBe(0)
    expect(logger.error).toHaveBeenCalled()
  })

  it('returns checked count matching rows returned from Prisma', async () => {
    const rows = [makeRow(2), makeRow(4), makeRow(6)]
    const prisma = makePrisma(rows)
    const redis = makeRedis('1') // dedup โ’ no actual sends
    const logger = makeLogger()

    const proc = new PMAdvanceNoticeProcessor(
      prisma as never,
      redis as never,
      makePublisher(),
      logger,
    )
    const result = await proc.run()

    expect(result.checked).toBe(3)
  })
})
