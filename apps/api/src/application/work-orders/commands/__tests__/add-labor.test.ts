import { WorkOrder, WorkOrderId, Priority, WorkOrderStatus } from '@maintainhub/domain'
import { AddLaborHandler } from '../add-labor'
import type { AddLaborCommand } from '../add-labor'
import type { CommandContext } from '../command.types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const WO_ID = 'clh7z2d1h0000z1x1z1x1z1x1'
const TENANT = 'tenant-1'
const USER = 'tech-1'

const ctx: CommandContext = {
  executingUserId: USER,
  tenantId: TENANT,
  userRole: 'TECHNICIAN',
  ipAddress: null,
  userAgent: null,
}

const TODAY = new Date()
TODAY.setHours(0, 0, 0, 0)

const CMD: AddLaborCommand = {
  workOrderId: WO_ID,
  hours: 2.5,
  ratePerHour: 500,
  date: TODAY,
}

function makeWo(status = WorkOrderStatus.IN_PROGRESS) {
  return WorkOrder.reconstitute({
    id: new WorkOrderId(WO_ID),
    tenantId: TENANT,
    woNumber: 'WO-1',
    title: 'T',
    type: 'CORRECTIVE',
    priority: Priority.MEDIUM,
    status,
    assetId: 'a1',
    createdById: USER,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

function makeDeps(wo: WorkOrder | null = makeWo()) {
  return {
    db: {},
    prisma: {
      laborEntry: {
        create: jest.fn().mockResolvedValue({ id: 'le-1' }),
        findMany: jest.fn().mockResolvedValue([{ totalCost: { toString: () => '1250' } }]),
      },
      workOrder: { update: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    },
    woRepo: {
      findById: jest.fn().mockResolvedValue(wo),
      save: jest.fn().mockResolvedValue(undefined),
    },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AddLaborHandler', () => {
  it('returns the new entry ID on success', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new AddLaborHandler(db as never, prisma as never, woRepo as never)

    const id = await handler.handle(CMD, ctx)

    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('persists the LaborEntry row', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new AddLaborHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, ctx)

    expect(prisma.laborEntry.create).toHaveBeenCalledTimes(1)
    const callArgs = (prisma.laborEntry.create as jest.Mock).mock.calls[0] as [
      { data: Record<string, unknown> },
    ]
    const { data } = callArgs[0]
    expect(Number(data.hours)).toBeCloseTo(2.5)
  })

  it('saves the aggregate after persisting entry', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new AddLaborHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, ctx)

    expect(woRepo.save).toHaveBeenCalledTimes(1)
  })

  it('writes audit log', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new AddLaborHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, ctx)

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'ADD_LABOR_ENTRY' }) }),
    )
  })

  it('throws NOT_FOUND when WO does not exist', async () => {
    const { db, prisma, woRepo } = makeDeps(null)
    const handler = new AddLaborHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws INVALID_LABOR_ADD when WO is not IN_PROGRESS', async () => {
    const { db, prisma, woRepo } = makeDeps(makeWo(WorkOrderStatus.OPEN))
    const handler = new AddLaborHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'INVALID_LABOR_ADD' })
  })

  it('throws INVALID_HOURS for zero hours', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new AddLaborHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle({ ...CMD, hours: 0 }, ctx)).rejects.toMatchObject({
      code: 'INVALID_HOURS',
    })
  })

  it('throws INVALID_HOURS for negative hours', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new AddLaborHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle({ ...CMD, hours: -1 }, ctx)).rejects.toMatchObject({
      code: 'INVALID_HOURS',
    })
  })

  it('throws INVALID_RATE for zero rate', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new AddLaborHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle({ ...CMD, ratePerHour: 0 }, ctx)).rejects.toMatchObject({
      code: 'INVALID_RATE',
    })
  })

  it('throws INVALID_DATE when date is in the future', async () => {
    const future = new Date()
    future.setDate(future.getDate() + 1) // tomorrow
    const { db, prisma, woRepo } = makeDeps()
    const handler = new AddLaborHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle({ ...CMD, date: future }, ctx)).rejects.toMatchObject({
      code: 'INVALID_DATE',
    })
  })

  it('accepts a date from today', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new AddLaborHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle({ ...CMD, date: new Date() }, ctx)).resolves.not.toThrow()
  })

  it('accepts a date from the past', async () => {
    const past = new Date()
    past.setDate(past.getDate() - 7) // 1 week ago
    const { db, prisma, woRepo } = makeDeps()
    const handler = new AddLaborHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle({ ...CMD, date: past }, ctx)).resolves.not.toThrow()
  })
})
