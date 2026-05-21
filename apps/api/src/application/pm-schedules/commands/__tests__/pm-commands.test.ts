/**
 * Unit tests for PM schedule command handlers.
 * All infrastructure (Prisma, TenantClient, PMScheduleRepository) is mocked.
 */
import { PMSchedule, PMScheduleId, CalendarRule, Task } from '@maintainhub/domain'
import { CreatePMScheduleHandler } from '../create-pm-schedule.js'
import { UpdatePMScheduleHandler } from '../update-pm-schedule.js'
import { ActivatePMScheduleHandler } from '../activate-pm-schedule.js'
import { DeactivatePMScheduleHandler } from '../deactivate-pm-schedule.js'
import { ManualTriggerPMHandler } from '../manual-trigger-pm.js'
import { AddTaskToScheduleHandler } from '../add-task.js'
import { RemoveTaskHandler } from '../remove-task.js'
import { ReorderTasksHandler } from '../reorder-tasks.js'
import { CloneScheduleHandler } from '../clone-schedule.js'
import type { CommandContext } from '../command.types.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SCHEDULE_ID = 'clh7z2d1h0000z1x1z1x1z1x1'
const ASSET_ID = 'clh7z2d1h0001z1x1z1x1z1x2'
const TENANT_ID = 'tenant-1'
const USER_ID = 'user-1'

const ctx: CommandContext = {
  executingUserId: USER_ID,
  tenantId: TENANT_ID,
  userRole: 'MANAGER',
  ipAddress: null,
  userAgent: null,
}

function makeSchedule(isActive = true) {
  return PMSchedule.reconstitute({
    id: new PMScheduleId(SCHEDULE_ID),
    tenantId: TENANT_ID,
    assetId: ASSET_ID,
    type: 'CALENDAR',
    title: 'Monthly Lubrication',
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
    taskList: [
      new Task({
        sequence: 1,
        title: 'Lubricate bearings',
        instructions: '',
        requiresPhoto: false,
        requiresMeterReading: false,
        meterReadingUnit: undefined,
        estimatedMinutes: 30,
        isCritical: false,
      }),
    ],
    estimatedHours: 2,
    requiredParts: [],
    requiredSkillIds: [],
    defaultAssigneeIds: [],
    isActive,
    lastTriggeredAt: undefined,
    nextDueAt: new Date(Date.now() + 86_400_000),
    advanceNoticeDays: 7,
    createdById: USER_ID,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date(),
  })
}

function makePrisma() {
  return {
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    workOrder: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'wo-1', woNumber: 'WO-000001' }),
    },
  }
}

function makeDb(assetFound = true) {
  return {
    asset: {
      findFirst: jest.fn().mockResolvedValue(assetFound ? { id: ASSET_ID } : null),
    },
  }
}

/**
 * null = simulate "not found" (findById returns undefined)
 * undefined = use default schedule (makeSchedule())
 */
function makeRepo(schedule: PMSchedule | null | undefined = undefined) {
  const resolved = schedule === null ? undefined : (schedule ?? makeSchedule())
  return {
    save: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue(resolved),
    findDueForTrigger: jest.fn().mockResolvedValue([]),
    findByAsset: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue(undefined),
  }
}

// ── CreatePMScheduleHandler ────────────────────────────────────────────────────

describe('CreatePMScheduleHandler', () => {
  it('creates and saves a PM schedule, returns an ID', async () => {
    const db = makeDb()
    const prisma = makePrisma()
    const repo = makeRepo()
    const handler = new CreatePMScheduleHandler(db as never, prisma as never, repo)

    const id = await handler.handle(
      {
        assetId: ASSET_ID,
        title: 'Monthly Lubrication',
        type: 'CALENDAR',
        calendarRule: { frequency: 'monthly', interval: 1 },
        taskList: [
          {
            sequence: 1,
            title: 'Lubricate',
            instructions: '',
            requiresPhoto: false,
            requiresMeterReading: false,
            meterReadingUnit: undefined,
            estimatedMinutes: 30,
            isCritical: false,
          },
        ],
      },
      ctx,
    )

    expect(typeof id).toBe('string')
    expect(id).toHaveLength(24)
    expect(repo.save).toHaveBeenCalledTimes(1)
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
  })

  it('throws ASSET_NOT_FOUND when asset does not exist', async () => {
    const handler = new CreatePMScheduleHandler(
      makeDb(false) as never,
      makePrisma() as never,
      makeRepo(),
    )
    await expect(
      handler.handle(
        {
          assetId: ASSET_ID,
          title: 'Test',
          type: 'CALENDAR',
          calendarRule: { frequency: 'monthly', interval: 1 },
          taskList: [
            {
              sequence: 1,
              title: 'T1',
              instructions: '',
              requiresPhoto: false,
              requiresMeterReading: false,
              meterReadingUnit: undefined,
              estimatedMinutes: 5,
              isCritical: false,
            },
          ],
        },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' })
  })

  it('throws EMPTY_TASK_LIST when taskList is empty', async () => {
    const handler = new CreatePMScheduleHandler(
      makeDb() as never,
      makePrisma() as never,
      makeRepo(),
    )
    await expect(
      handler.handle(
        {
          assetId: ASSET_ID,
          title: 'Test',
          type: 'CALENDAR',
          calendarRule: { frequency: 'monthly', interval: 1 },
          taskList: [],
        },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'EMPTY_TASK_LIST' })
  })

  it('throws domain exception when CALENDAR type but no calendarRule', async () => {
    const handler = new CreatePMScheduleHandler(
      makeDb() as never,
      makePrisma() as never,
      makeRepo(),
    )
    await expect(
      handler.handle(
        {
          assetId: ASSET_ID,
          title: 'Test',
          type: 'CALENDAR',
          taskList: [
            {
              sequence: 1,
              title: 'T',
              instructions: '',
              requiresPhoto: false,
              requiresMeterReading: false,
              meterReadingUnit: undefined,
              estimatedMinutes: 5,
              isCritical: false,
            },
          ],
        },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'MISSING_CALENDAR_RULE' })
  })
})

// ── UpdatePMScheduleHandler ────────────────────────────────────────────────────

describe('UpdatePMScheduleHandler', () => {
  it('updates title and calls repo.update', async () => {
    const repo = makeRepo()
    const prisma = makePrisma()
    const handler = new UpdatePMScheduleHandler(prisma as never, repo)

    await handler.handle({ id: SCHEDULE_ID, title: 'Updated Title' }, ctx)

    expect(repo.update).toHaveBeenCalledTimes(1)
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
  })

  it('throws PM_SCHEDULE_NOT_FOUND when schedule does not exist', async () => {
    const handler = new UpdatePMScheduleHandler(makePrisma() as never, makeRepo(null))
    await expect(handler.handle({ id: SCHEDULE_ID, title: 'X' }, ctx)).rejects.toMatchObject({
      code: 'PM_SCHEDULE_NOT_FOUND',
    })
  })
})

// ── ActivatePMScheduleHandler ─────────────────────────────────────────────────

describe('ActivatePMScheduleHandler', () => {
  it('activates an inactive schedule', async () => {
    const schedule = makeSchedule(false) // inactive
    const repo = makeRepo(schedule)
    const prisma = makePrisma()
    const handler = new ActivatePMScheduleHandler(prisma as never, repo)

    await handler.handle({ id: SCHEDULE_ID }, ctx)

    expect(schedule.isActive).toBe(true)
    expect(repo.update).toHaveBeenCalledWith(schedule)
  })

  it('throws PM_SCHEDULE_ALREADY_ACTIVE when already active', async () => {
    const handler = new ActivatePMScheduleHandler(
      makePrisma() as never,
      makeRepo(makeSchedule(true)),
    )
    await expect(handler.handle({ id: SCHEDULE_ID }, ctx)).rejects.toMatchObject({
      code: 'PM_SCHEDULE_ALREADY_ACTIVE',
    })
  })
})

// ── DeactivatePMScheduleHandler ───────────────────────────────────────────────

describe('DeactivatePMScheduleHandler', () => {
  it('deactivates an active schedule', async () => {
    const schedule = makeSchedule(true)
    const repo = makeRepo(schedule)
    const handler = new DeactivatePMScheduleHandler(makePrisma() as never, repo)

    await handler.handle({ id: SCHEDULE_ID }, ctx)

    expect(schedule.isActive).toBe(false)
    expect(repo.update).toHaveBeenCalledWith(schedule)
  })

  it('throws PM_SCHEDULE_ALREADY_INACTIVE when already inactive', async () => {
    const handler = new DeactivatePMScheduleHandler(
      makePrisma() as never,
      makeRepo(makeSchedule(false)),
    )
    await expect(handler.handle({ id: SCHEDULE_ID }, ctx)).rejects.toMatchObject({
      code: 'PM_SCHEDULE_ALREADY_INACTIVE',
    })
  })
})

// ── ManualTriggerPMHandler ─────────────────────────────────────────────────────

describe('ManualTriggerPMHandler', () => {
  it('creates WO and updates schedule', async () => {
    const schedule = makeSchedule(true)
    const repo = makeRepo(schedule)
    const prisma = makePrisma()
    const handler = new ManualTriggerPMHandler(prisma as never, repo)

    const result = await handler.handle({ id: SCHEDULE_ID }, ctx)

    expect(result.workOrderId).toBeTruthy()
    expect(result.woNumber).toMatch(/^WO-/)
    expect(prisma.workOrder.create).toHaveBeenCalledTimes(1)
    expect(repo.update).toHaveBeenCalledWith(schedule)
  })

  it('uses override assigneeIds when provided', async () => {
    const repo = makeRepo(makeSchedule(true))
    const prisma = makePrisma()
    const handler = new ManualTriggerPMHandler(prisma as never, repo)

    await handler.handle({ id: SCHEDULE_ID, assigneeIds: ['user-5', 'user-6'] }, ctx)

    const createCall = prisma.workOrder.create.mock.calls[0][0] as {
      data: { assigneeIds: string[] }
    }
    expect(createCall.data.assigneeIds).toEqual(['user-5', 'user-6'])
  })

  it('throws PM_SCHEDULE_NOT_FOUND when schedule does not exist', async () => {
    const handler = new ManualTriggerPMHandler(makePrisma() as never, makeRepo(null))
    await expect(handler.handle({ id: SCHEDULE_ID }, ctx)).rejects.toMatchObject({
      code: 'PM_SCHEDULE_NOT_FOUND',
    })
  })

  it('throws PM_SCHEDULE_INACTIVE when schedule is inactive', async () => {
    const handler = new ManualTriggerPMHandler(makePrisma() as never, makeRepo(makeSchedule(false)))
    await expect(handler.handle({ id: SCHEDULE_ID }, ctx)).rejects.toMatchObject({
      code: 'PM_SCHEDULE_INACTIVE',
    })
  })
})

// ── Task management commands ──────────────────────────────────────────────────

describe('AddTaskToScheduleHandler', () => {
  it('adds task and calls repo.update', async () => {
    const repo = makeRepo()
    const handler = new AddTaskToScheduleHandler(makePrisma() as never, repo)

    await handler.handle(
      {
        scheduleId: SCHEDULE_ID,
        task: {
          sequence: 2,
          title: 'New Task',
          instructions: '',
          requiresPhoto: false,
          requiresMeterReading: false,
          meterReadingUnit: undefined,
          estimatedMinutes: 20,
          isCritical: false,
        },
      },
      ctx,
    )

    const saved = (repo.update.mock.calls[0] as [PMSchedule])[0]
    expect(saved.taskList).toHaveLength(2)
    expect(saved.taskList.find((t) => t.title === 'New Task')).toBeDefined()
  })
})

describe('RemoveTaskHandler', () => {
  it('removes task by sequence', async () => {
    const repo = makeRepo()
    const handler = new RemoveTaskHandler(makePrisma() as never, repo)

    await handler.handle({ scheduleId: SCHEDULE_ID, sequence: 1 }, ctx)

    const saved = (repo.update.mock.calls[0] as [PMSchedule])[0]
    expect(saved.taskList).toHaveLength(0)
  })

  it('throws TASK_NOT_FOUND for unknown sequence', async () => {
    const handler = new RemoveTaskHandler(makePrisma() as never, makeRepo())
    await expect(
      handler.handle({ scheduleId: SCHEDULE_ID, sequence: 99 }, ctx),
    ).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' })
  })
})

describe('ReorderTasksHandler', () => {
  it('reorders tasks and calls repo.update', async () => {
    // Schedule starts with task "Lubricate bearings"
    const repo = makeRepo()
    const handler = new ReorderTasksHandler(makePrisma() as never, repo)

    // Single task — re-ordering it to itself should succeed
    await handler.handle({ scheduleId: SCHEDULE_ID, orderedTitles: ['Lubricate bearings'] }, ctx)
    expect(repo.update).toHaveBeenCalledTimes(1)
  })

  it('throws TASK_REORDER_MISMATCH when count differs', async () => {
    const handler = new ReorderTasksHandler(makePrisma() as never, makeRepo())
    await expect(
      handler.handle({ scheduleId: SCHEDULE_ID, orderedTitles: ['A', 'B'] }, ctx),
    ).rejects.toMatchObject({ code: 'TASK_REORDER_MISMATCH' })
  })
})

// ── CloneScheduleHandler ──────────────────────────────────────────────────────

describe('CloneScheduleHandler', () => {
  const TARGET_ASSET = 'clh7z2d1h0003z1x1z1x1z1x4'

  it('clones schedule to target asset and returns new ID', async () => {
    const db = makeDb()
    const prisma = makePrisma()
    const repo = makeRepo()
    const handler = new CloneScheduleHandler(db as never, prisma as never, repo)

    const newId = await handler.handle({ sourceId: SCHEDULE_ID, targetAssetId: TARGET_ASSET }, ctx)

    expect(typeof newId).toBe('string')
    expect(newId).not.toBe(SCHEDULE_ID) // different ID
    expect(repo.save).toHaveBeenCalledTimes(1)

    const saved = (repo.save.mock.calls[0] as [PMSchedule])[0]
    expect(saved.assetId).toBe(TARGET_ASSET)
    expect(saved.isActive).toBe(false) // starts inactive
    expect(saved.lastTriggeredAt).toBeUndefined()
    expect(saved.taskList).toHaveLength(1) // same tasks
  })

  it('appends "(Copy)" to title when no override provided', async () => {
    const repo = makeRepo()
    const handler = new CloneScheduleHandler(makeDb() as never, makePrisma() as never, repo)

    await handler.handle({ sourceId: SCHEDULE_ID, targetAssetId: TARGET_ASSET }, ctx)

    const saved = (repo.save.mock.calls[0] as [PMSchedule])[0]
    expect(saved.title).toBe('Monthly Lubrication (Copy)')
  })

  it('uses custom title when provided', async () => {
    const repo = makeRepo()
    const handler = new CloneScheduleHandler(makeDb() as never, makePrisma() as never, repo)

    await handler.handle(
      { sourceId: SCHEDULE_ID, targetAssetId: TARGET_ASSET, title: 'Custom Title' },
      ctx,
    )

    const saved = (repo.save.mock.calls[0] as [PMSchedule])[0]
    expect(saved.title).toBe('Custom Title')
  })

  it('throws ASSET_NOT_FOUND when target asset does not exist', async () => {
    const handler = new CloneScheduleHandler(
      makeDb(false) as never,
      makePrisma() as never,
      makeRepo(),
    )
    await expect(
      handler.handle({ sourceId: SCHEDULE_ID, targetAssetId: TARGET_ASSET }, ctx),
    ).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' })
  })

  it('throws PM_SCHEDULE_NOT_FOUND when source does not exist', async () => {
    const handler = new CloneScheduleHandler(
      makeDb() as never,
      makePrisma() as never,
      makeRepo(null),
    )
    await expect(
      handler.handle({ sourceId: SCHEDULE_ID, targetAssetId: TARGET_ASSET }, ctx),
    ).rejects.toMatchObject({ code: 'PM_SCHEDULE_NOT_FOUND' })
  })
})
