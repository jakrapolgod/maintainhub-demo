import { WorkOrder, WorkOrderId, Priority, WorkOrderStatus } from '@maintainhub/domain'
import { StartWorkOrderHandler } from '../start-work-order'
import type { StartWorkOrderCommand } from '../start-work-order'
import type { CommandContext } from '../command.types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const WO_ID = 'clh7z2d1h0000z1x1z1x1z1x1'
const TECH_ID = 'cm9pq3r2i0000ymbj1nhq1zr2'
const TENANT = 'tenant-1'

const CMD: StartWorkOrderCommand = { workOrderId: WO_ID }

function makeWo(status = WorkOrderStatus.OPEN, assigneeIds: string[] = [TECH_ID]) {
  return WorkOrder.reconstitute({
    id: new WorkOrderId(WO_ID),
    tenantId: TENANT,
    woNumber: 'WO-2024-000001',
    title: 'Test',
    type: 'CORRECTIVE',
    priority: Priority.MEDIUM,
    status,
    assetId: 'asset-1',
    createdById: 'admin-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    assigneeIds,
  })
}

function makeCtx(userId = TECH_ID, role = 'TECHNICIAN'): CommandContext {
  return {
    executingUserId: userId,
    tenantId: TENANT,
    userRole: role,
    ipAddress: null,
    userAgent: null,
  }
}

function makeDeps(wo: WorkOrder | null = makeWo()) {
  return {
    db: {},
    prisma: { auditLog: { create: jest.fn().mockResolvedValue({}) } },
    woRepo: {
      findById: jest.fn().mockResolvedValue(wo),
      save: jest.fn().mockResolvedValue(undefined),
    },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StartWorkOrderHandler', () => {
  it('starts WO when caller is an assignee', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new StartWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, makeCtx(TECH_ID, 'TECHNICIAN'))

    const saved = (woRepo.save as jest.Mock).mock.calls[0]?.[0] as WorkOrder
    expect(saved.status.value).toBe('IN_PROGRESS')
  })

  it('starts WO when caller is MANAGER (not assignee)', async () => {
    const wo = makeWo(WorkOrderStatus.OPEN, ['other-tech'])
    const { db, prisma, woRepo } = makeDeps(wo)
    const handler = new StartWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, makeCtx('manager-1', 'MANAGER'))).resolves.not.toThrow()
  })

  it('starts WO when caller is ADMIN (not assignee)', async () => {
    const wo = makeWo(WorkOrderStatus.OPEN, [])
    const { db, prisma, woRepo } = makeDeps(wo)
    const handler = new StartWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, makeCtx('admin-1', 'ADMIN'))).resolves.not.toThrow()
  })

  it('throws FORBIDDEN when caller is TECHNICIAN and not assignee', async () => {
    const wo = makeWo(WorkOrderStatus.OPEN, ['other-tech'])
    const { db, prisma, woRepo } = makeDeps(wo)
    const handler = new StartWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, makeCtx('non-assignee', 'TECHNICIAN'))).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    })
  })

  it('throws NOT_FOUND when WO does not exist', async () => {
    const { db, prisma, woRepo } = makeDeps(null)
    const handler = new StartWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, makeCtx())).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws INVALID_START when WO is already IN_PROGRESS', async () => {
    const { db, prisma, woRepo } = makeDeps(makeWo(WorkOrderStatus.IN_PROGRESS))
    const handler = new StartWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, makeCtx())).rejects.toMatchObject({ code: 'INVALID_START' })
  })

  it('throws INVALID_START when WO is DRAFT', async () => {
    const { db, prisma, woRepo } = makeDeps(makeWo(WorkOrderStatus.DRAFT))
    const handler = new StartWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, makeCtx())).rejects.toMatchObject({ code: 'INVALID_START' })
  })

  it('writes audit log after success', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new StartWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, makeCtx())

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'START_WORK_ORDER' }) }),
    )
  })
})
