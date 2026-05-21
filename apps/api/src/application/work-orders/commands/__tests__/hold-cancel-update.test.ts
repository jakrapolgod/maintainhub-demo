/**
 * Tests for HoldWorkOrderHandler, CancelWorkOrderHandler, UpdateWorkOrderHandler.
 * Grouped in one file since the handlers are small and their test patterns are similar.
 */
import { WorkOrder, WorkOrderId, Priority, WorkOrderStatus } from '@maintainhub/domain'
import { HoldWorkOrderHandler } from '../hold-work-order'
import { CancelWorkOrderHandler } from '../cancel-work-order'
import { UpdateWorkOrderHandler } from '../update-work-order'
import type { HoldWorkOrderCommand } from '../hold-work-order'
import type { CancelWorkOrderCommand } from '../cancel-work-order'
import type { UpdateWorkOrderCommand } from '../update-work-order'
import type { CommandContext } from '../command.types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const WO_ID = 'clh7z2d1h0000z1x1z1x1z1x1'
const TENANT = 'tenant-1'
const USER = 'user-1'

const ctx: CommandContext = {
  executingUserId: USER,
  tenantId: TENANT,
  userRole: 'MANAGER',
  ipAddress: null,
  userAgent: null,
}

function makeWo(status: WorkOrderStatus) {
  return WorkOrder.reconstitute({
    id: new WorkOrderId(WO_ID),
    tenantId: TENANT,
    woNumber: 'WO-1',
    title: 'Test',
    type: 'CORRECTIVE',
    priority: Priority.MEDIUM,
    status,
    assetId: 'a1',
    createdById: USER,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

function makeDeps(wo: WorkOrder | null) {
  return {
    db: {},
    prisma: {
      workOrder: { update: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    },
    woRepo: {
      findById: jest.fn().mockResolvedValue(wo),
      save: jest.fn().mockResolvedValue(undefined),
    },
  }
}

// ── HoldWorkOrderHandler ──────────────────────────────────────────────────────

describe('HoldWorkOrderHandler', () => {
  const CMD: HoldWorkOrderCommand = { workOrderId: WO_ID, reason: 'Waiting for parts' }

  it('transitions IN_PROGRESS → ON_HOLD', async () => {
    const { db, prisma, woRepo } = makeDeps(makeWo(WorkOrderStatus.IN_PROGRESS))
    const handler = new HoldWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, ctx)

    const saved = (woRepo.save as jest.Mock).mock.calls[0]?.[0] as WorkOrder
    expect(saved.status.value).toBe('ON_HOLD')
  })

  it('throws NOT_FOUND when WO does not exist', async () => {
    const { db, prisma, woRepo } = makeDeps(null)
    const handler = new HoldWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws INVALID_HOLD when WO is OPEN (not IN_PROGRESS)', async () => {
    const { db, prisma, woRepo } = makeDeps(makeWo(WorkOrderStatus.OPEN))
    const handler = new HoldWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'INVALID_HOLD' })
  })

  it('throws HOLD_REASON_REQUIRED for empty reason', async () => {
    const { db, prisma, woRepo } = makeDeps(makeWo(WorkOrderStatus.IN_PROGRESS))
    const handler = new HoldWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle({ workOrderId: WO_ID, reason: '' }, ctx)).rejects.toMatchObject({
      code: 'HOLD_REASON_REQUIRED',
    })
  })

  it('writes audit log', async () => {
    const { db, prisma, woRepo } = makeDeps(makeWo(WorkOrderStatus.IN_PROGRESS))
    const handler = new HoldWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, ctx)

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'HOLD_WORK_ORDER' }) }),
    )
  })
})

// ── CancelWorkOrderHandler ────────────────────────────────────────────────────

describe('CancelWorkOrderHandler', () => {
  const CMD: CancelWorkOrderCommand = { workOrderId: WO_ID, reason: 'Budget cut' }

  it.each(['DRAFT', 'OPEN', 'IN_PROGRESS', 'ON_HOLD'] as const)(
    'cancels a %s WO',
    async (statusValue) => {
      const { db, prisma, woRepo } = makeDeps(makeWo(WorkOrderStatus.from(statusValue)))
      const handler = new CancelWorkOrderHandler(db as never, prisma as never, woRepo as never)

      await handler.handle(CMD, ctx)

      const saved = (woRepo.save as jest.Mock).mock.calls[0]?.[0] as WorkOrder
      expect(saved.status.value).toBe('CANCELLED')
    },
  )

  it('throws CANNOT_CANCEL_COMPLETED for a completed WO', async () => {
    const { db, prisma, woRepo } = makeDeps(makeWo(WorkOrderStatus.COMPLETED))
    const handler = new CancelWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({
      code: 'CANNOT_CANCEL_COMPLETED',
    })
  })

  it('throws ALREADY_CANCELLED when WO is already cancelled', async () => {
    const { db, prisma, woRepo } = makeDeps(makeWo(WorkOrderStatus.CANCELLED))
    const handler = new CancelWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'ALREADY_CANCELLED' })
  })

  it('throws CANCEL_REASON_REQUIRED for empty reason', async () => {
    const { db, prisma, woRepo } = makeDeps(makeWo(WorkOrderStatus.OPEN))
    const handler = new CancelWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle({ workOrderId: WO_ID, reason: '' }, ctx)).rejects.toMatchObject({
      code: 'CANCEL_REASON_REQUIRED',
    })
  })

  it('throws NOT_FOUND when WO does not exist', async () => {
    const { db, prisma, woRepo } = makeDeps(null)
    const handler = new CancelWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('writes audit log', async () => {
    const { db, prisma, woRepo } = makeDeps(makeWo(WorkOrderStatus.OPEN))
    const handler = new CancelWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, ctx)

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'CANCEL_WORK_ORDER' }) }),
    )
  })
})

// ── UpdateWorkOrderHandler ────────────────────────────────────────────────────

describe('UpdateWorkOrderHandler', () => {
  const CMD: UpdateWorkOrderCommand = {
    workOrderId: WO_ID,
    title: 'Updated title',
    priority: 'HIGH',
  }

  it('patches the WO via Prisma when changes are provided', async () => {
    const { db, prisma, woRepo } = makeDeps(makeWo(WorkOrderStatus.OPEN))
    const handler = new UpdateWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, ctx)

    expect(prisma.workOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: WO_ID },
        data: expect.objectContaining({ title: 'Updated title' }),
      }),
    )
  })

  it('throws NOT_FOUND when WO does not exist', async () => {
    const { db, prisma, woRepo } = makeDeps(null)
    const handler = new UpdateWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws INVALID_OPERATION when WO is COMPLETED', async () => {
    const { db, prisma, woRepo } = makeDeps(makeWo(WorkOrderStatus.COMPLETED))
    const handler = new UpdateWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'INVALID_OPERATION' })
  })

  it('throws INVALID_OPERATION when WO is CANCELLED', async () => {
    const { db, prisma, woRepo } = makeDeps(makeWo(WorkOrderStatus.CANCELLED))
    const handler = new UpdateWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'INVALID_OPERATION' })
  })

  it('does not call Prisma update when no fields are provided', async () => {
    const { db, prisma, woRepo } = makeDeps(makeWo(WorkOrderStatus.OPEN))
    const handler = new UpdateWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await handler.handle({ workOrderId: WO_ID }, ctx) // empty patch

    expect(prisma.workOrder.update).not.toHaveBeenCalled()
  })

  it('writes audit log', async () => {
    const { db, prisma, woRepo } = makeDeps(makeWo(WorkOrderStatus.OPEN))
    const handler = new UpdateWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, ctx)

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'UPDATE_WORK_ORDER' }) }),
    )
  })
})
