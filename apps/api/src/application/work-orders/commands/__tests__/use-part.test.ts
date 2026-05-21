import { WorkOrder, WorkOrderId, Priority, WorkOrderStatus } from '@maintainhub/domain'
import { UsePartHandler } from '../use-part'
import type { UsePartCommand } from '../use-part'
import type { CommandContext } from '../command.types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const WO_ID = 'clh7z2d1h0000z1x1z1x1z1x1'
const PART_ID = 'cm9pq3r2i0000ymbj1nhq1zr2'
const TENANT = 'tenant-1'
const USER = 'tech-1'

const ctx: CommandContext = {
  executingUserId: USER,
  tenantId: TENANT,
  userRole: 'TECHNICIAN',
  ipAddress: null,
  userAgent: null,
}

const CMD: UsePartCommand = {
  workOrderId: WO_ID,
  partId: PART_ID,
  quantity: 2,
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

function makeDeps(
  opts: {
    wo?: WorkOrder | null
    partQuantity?: number
    partExists?: boolean
  } = {},
) {
  const { wo = makeWo(), partQuantity = 10, partExists = true } = opts

  return {
    db: {
      part: {
        // unitCost as plain number — Money(number, currency) works correctly
        findFirst: jest.fn().mockResolvedValue(
          partExists
            ? {
                id: PART_ID,
                partNumber: 'P-001',
                name: 'Seal',
                unitCost: 200,
                quantity: partQuantity,
              }
            : null,
        ),
        update: jest.fn().mockResolvedValue({}),
      },
    },
    prisma: {
      partUsage: {
        create: jest.fn().mockResolvedValue({ id: 'pu-1' }),
        // totalCost as an object with toString() — compatible with Prisma.Decimal(x.toString())
        findMany: jest.fn().mockResolvedValue([{ totalCost: { toString: () => '400' } }]),
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

describe('UsePartHandler', () => {
  it('returns the new usage ID on success', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new UsePartHandler(db as never, prisma as never, woRepo as never)

    const id = await handler.handle(CMD, ctx)

    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('persists a PartUsage row', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new UsePartHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, ctx)

    expect(prisma.partUsage.create).toHaveBeenCalledTimes(1)
  })

  it('deducts quantity from part stock', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new UsePartHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, ctx)

    expect(db.part.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: { decrement: 2 } }) }),
    )
  })

  it('saves the aggregate after persistence', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new UsePartHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, ctx)

    expect(woRepo.save).toHaveBeenCalledTimes(1)
  })

  it('writes audit log', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new UsePartHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, ctx)

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'USE_PART' }) }),
    )
  })

  it('throws NOT_FOUND when part does not exist', async () => {
    const { db, prisma, woRepo } = makeDeps({ partExists: false })
    const handler = new UsePartHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws NOT_FOUND when WO does not exist', async () => {
    const { db, prisma, woRepo } = makeDeps({ wo: null })
    const handler = new UsePartHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws INSUFFICIENT_STOCK when stock < quantity', async () => {
    const { db, prisma, woRepo } = makeDeps({ partQuantity: 1 }) // only 1, requesting 2
    const handler = new UsePartHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })
  })

  it('allows using exactly the available stock (stock == quantity)', async () => {
    const { db, prisma, woRepo } = makeDeps({ partQuantity: 2 }) // exactly 2
    const handler = new UsePartHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).resolves.not.toThrow()
  })

  it('throws INVALID_PART_USAGE when WO is COMPLETED', async () => {
    const { db, prisma, woRepo } = makeDeps({ wo: makeWo(WorkOrderStatus.COMPLETED) })
    const handler = new UsePartHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'INVALID_PART_USAGE' })
  })

  it('throws INVALID_QUANTITY for a zero quantity', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new UsePartHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle({ ...CMD, quantity: 0 }, ctx)).rejects.toMatchObject({
      code: 'INVALID_QUANTITY',
    })
  })

  it('throws INVALID_QUANTITY for a negative quantity', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new UsePartHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle({ ...CMD, quantity: -3 }, ctx)).rejects.toMatchObject({
      code: 'INVALID_QUANTITY',
    })
  })

  it('throws INVALID_QUANTITY for a fractional quantity', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new UsePartHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle({ ...CMD, quantity: 1.5 }, ctx)).rejects.toMatchObject({
      code: 'INVALID_QUANTITY',
    })
  })

  it('uses unitCostOverride instead of part.unitCost when provided', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new UsePartHandler(db as never, prisma as never, woRepo as never)

    await handler.handle({ ...CMD, unitCostOverride: 999 }, ctx)

    const createData = (prisma.partUsage.create as jest.Mock).mock.calls[0]?.[0]?.data
    // unitCost in create data should reflect the override (999), not the default (200)
    expect(Number(createData.unitCost.toString())).toBeCloseTo(999)
  })
})
