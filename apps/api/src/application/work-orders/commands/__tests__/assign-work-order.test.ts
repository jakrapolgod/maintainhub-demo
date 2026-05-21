import { WorkOrder, WorkOrderId, Priority, WorkOrderStatus } from '@maintainhub/domain'
import { AssignWorkOrderHandler } from '../assign-work-order'
import type { AssignWorkOrderCommand } from '../assign-work-order'
import type { CommandContext } from '../command.types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const WO_ID = 'clh7z2d1h0000z1x1z1x1z1x1'
const TECH_ID = 'cm9pq3r2i0000ymbj1nhq1zr2'
const TENANT = 'tenant-1'
const MGR_ID = 'user-manager'

const ctx: CommandContext = {
  executingUserId: MGR_ID,
  tenantId: TENANT,
  userRole: 'MANAGER',
  ipAddress: null,
  userAgent: null,
}

const CMD: AssignWorkOrderCommand = {
  workOrderId: WO_ID,
  technicianId: TECH_ID,
}

function makeWo(status = WorkOrderStatus.OPEN): WorkOrder {
  return WorkOrder.reconstitute({
    id: new WorkOrderId(WO_ID),
    tenantId: TENANT,
    woNumber: 'WO-2024-000001',
    title: 'Test',
    type: 'CORRECTIVE',
    priority: Priority.MEDIUM,
    status,
    assetId: 'asset-1',
    createdById: MGR_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

function makeDeps(woStatus = WorkOrderStatus.OPEN, techExists = true) {
  const db = {
    user: {
      findFirst: jest.fn().mockResolvedValue(techExists ? { id: TECH_ID, name: 'Alice' } : null),
    },
  }
  const prisma = {
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  }
  const woRepo = {
    findById: jest.fn().mockResolvedValue(makeWo(woStatus)),
    save: jest.fn().mockResolvedValue(undefined),
  }
  return { db, prisma, woRepo }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AssignWorkOrderHandler', () => {
  it('saves the aggregate after assigning', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new AssignWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, ctx)

    expect(woRepo.save).toHaveBeenCalledTimes(1)
    const savedWo = (woRepo.save as jest.Mock).mock.calls[0]?.[0] as WorkOrder
    expect(savedWo.assigneeIds).toContain(TECH_ID)
  })

  it('writes an audit log after success', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new AssignWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, ctx)

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'ASSIGN_WORK_ORDER' }),
      }),
    )
  })

  it('throws NOT_FOUND when WO does not exist', async () => {
    const { db, prisma, woRepo } = makeDeps()
    ;(woRepo.findById as jest.Mock).mockResolvedValue(null)
    const handler = new AssignWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws TECHNICIAN_NOT_FOUND when user is not in tenant', async () => {
    const { db, prisma, woRepo } = makeDeps(WorkOrderStatus.OPEN, false)
    const handler = new AssignWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'TECHNICIAN_NOT_FOUND' })
  })

  it('throws INVALID_ASSIGNMENT when WO is COMPLETED', async () => {
    const { db, prisma, woRepo } = makeDeps(WorkOrderStatus.COMPLETED)
    const handler = new AssignWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'INVALID_ASSIGNMENT' })
  })

  it('throws INVALID_ASSIGNMENT when WO is DRAFT', async () => {
    const { db, prisma, woRepo } = makeDeps(WorkOrderStatus.DRAFT)
    const handler = new AssignWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'INVALID_ASSIGNMENT' })
  })

  it('succeeds when WO is IN_PROGRESS', async () => {
    const { db, prisma, woRepo } = makeDeps(WorkOrderStatus.IN_PROGRESS)
    const handler = new AssignWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).resolves.not.toThrow()
  })
})
