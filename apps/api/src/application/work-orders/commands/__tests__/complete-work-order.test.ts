import { WorkOrder, WorkOrderId, Priority, WorkOrderStatus } from '@maintainhub/domain'
import { CompleteWorkOrderHandler } from '../complete-work-order'
import type { CompleteWorkOrderCommand } from '../complete-work-order'
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

const CMD: CompleteWorkOrderCommand = {
  workOrderId: WO_ID,
  resolution: 'Replaced impeller seal. Tested at full load — OK.',
}

function makeWo(status = WorkOrderStatus.IN_PROGRESS) {
  return WorkOrder.reconstitute({
    id: new WorkOrderId(WO_ID),
    tenantId: TENANT,
    woNumber: 'WO-2024-000001',
    title: 'Test',
    type: 'CORRECTIVE',
    priority: Priority.MEDIUM,
    status,
    assetId: 'asset-1',
    createdById: USER,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

function makeDeps(wo: WorkOrder | null = makeWo(), failCodeExists = true) {
  const prisma = {
    failureCode: {
      findUnique: jest.fn().mockResolvedValue(failCodeExists ? { id: 'fc-1' } : null),
    },
    workOrder: { update: jest.fn().mockResolvedValue({}) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  }
  const woRepo = {
    findById: jest.fn().mockResolvedValue(wo),
    save: jest.fn().mockResolvedValue(undefined),
  }
  return { db: {}, prisma, woRepo }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CompleteWorkOrderHandler', () => {
  it('completes the WO and saves the aggregate', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new CompleteWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, ctx)

    const saved = (woRepo.save as jest.Mock).mock.calls[0]?.[0] as WorkOrder
    expect(saved.status.value).toBe('COMPLETED')
    expect(saved.resolution).toBe(CMD.resolution)
  })

  it('writes audit log after success', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new CompleteWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, ctx)

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'COMPLETE_WORK_ORDER' }) }),
    )
  })

  it('throws NOT_FOUND when WO does not exist', async () => {
    const { db, prisma, woRepo } = makeDeps(null)
    const handler = new CompleteWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws INVALID_COMPLETION when WO is OPEN (not IN_PROGRESS)', async () => {
    const { db, prisma, woRepo } = makeDeps(makeWo(WorkOrderStatus.OPEN))
    const handler = new CompleteWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'INVALID_COMPLETION' })
  })

  it('throws INVALID_COMPLETION when WO is already COMPLETED', async () => {
    const { db, prisma, woRepo } = makeDeps(makeWo(WorkOrderStatus.COMPLETED))
    const handler = new CompleteWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'INVALID_COMPLETION' })
  })

  it('throws RESOLUTION_REQUIRED when resolution is empty', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new CompleteWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle({ ...CMD, resolution: '   ' }, ctx)).rejects.toMatchObject({
      code: 'RESOLUTION_REQUIRED',
    })
  })

  it('throws FAILURE_CODE_NOT_FOUND when failureCodeId is unknown', async () => {
    const { db, prisma, woRepo } = makeDeps(makeWo(), false)
    const handler = new CompleteWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle({ ...CMD, failureCodeId: 'unknown' }, ctx)).rejects.toMatchObject({
      code: 'FAILURE_CODE_NOT_FOUND',
    })
  })

  it('updates failureCodeId on WO when provided', async () => {
    const { db, prisma, woRepo } = makeDeps(makeWo(), true)
    const handler = new CompleteWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await handler.handle({ ...CMD, failureCodeId: 'fc-1' }, ctx)

    expect(prisma.workOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failureCodeId: 'fc-1' }) }),
    )
  })
})
