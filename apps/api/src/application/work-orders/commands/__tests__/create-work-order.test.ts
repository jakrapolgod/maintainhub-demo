import { WorkOrder, WorkOrderId, Priority, WorkOrderStatus } from '@maintainhub/domain'
import { CreateWorkOrderHandler } from '../create-work-order'
import type { CreateWorkOrderCommand } from '../create-work-order'
import type { CommandContext } from '../command.types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_WO_ID = 'clh7z2d1h0000z1x1z1x1z1x1'
const TENANT_ID = 'tenant-1'
const ASSET_ID = 'asset-1'
const USER_ID = 'user-1'

const ctx: CommandContext = {
  executingUserId: USER_ID,
  tenantId: TENANT_ID,
  userRole: 'MANAGER',
  ipAddress: '127.0.0.1',
  userAgent: 'test-agent',
}

const CMD: CreateWorkOrderCommand = {
  title: 'Fix pump P-101',
  type: 'CORRECTIVE',
  priority: 'HIGH',
  assetId: ASSET_ID,
}

function makeWo(): WorkOrder {
  return WorkOrder.reconstitute({
    id: new WorkOrderId(VALID_WO_ID),
    tenantId: TENANT_ID,
    woNumber: 'WO-2024-000001',
    title: 'Fix pump',
    type: 'CORRECTIVE',
    priority: Priority.HIGH,
    status: WorkOrderStatus.DRAFT,
    assetId: ASSET_ID,
    createdById: USER_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  const db: Record<string, unknown> = {
    asset: { findFirst: jest.fn().mockResolvedValue({ id: ASSET_ID }) },
    workOrder: { findFirst: jest.fn().mockResolvedValue(null) },
    ...overrides,
  }
  const prisma = {
    workOrder: { update: jest.fn().mockResolvedValue({}) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  }
  const woRepo = {
    nextWONumber: jest.fn().mockResolvedValue('WO-2024-000001'),
    save: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue(makeWo()),
  }
  return { db, prisma, woRepo }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CreateWorkOrderHandler', () => {
  it('returns a WorkOrderId on success', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new CreateWorkOrderHandler(db as never, prisma as never, woRepo as never)

    const result = await handler.handle(CMD, ctx)

    expect(result).toBeInstanceOf(WorkOrderId)
  })

  it('calls woRepo.nextWONumber with the tenantId', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new CreateWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, ctx)

    expect(woRepo.nextWONumber).toHaveBeenCalledWith(TENANT_ID)
  })

  it('calls woRepo.save with a WorkOrder aggregate', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new CreateWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, ctx)

    expect(woRepo.save).toHaveBeenCalledWith(expect.any(WorkOrder))
  })

  it('writes an audit log after success', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new CreateWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, ctx)

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CREATE_WORK_ORDER', tenantId: TENANT_ID }),
      }),
    )
  })

  it('throws ASSET_NOT_FOUND when asset does not exist', async () => {
    const { db, prisma, woRepo } = makeDeps()
    ;(db.asset as Record<string, unknown>).findFirst = jest.fn().mockResolvedValue(null)
    const handler = new CreateWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' })
  })

  it('throws PARENT_WO_NOT_FOUND when parentWorkOrderId refers to missing WO', async () => {
    const { db, prisma, woRepo } = makeDeps()
    // asset exists, parent WO does not
    ;(db.workOrder as Record<string, unknown>).findFirst = jest.fn().mockResolvedValue(null)
    const handler = new CreateWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await expect(
      handler.handle({ ...CMD, parentWorkOrderId: VALID_WO_ID }, ctx),
    ).rejects.toMatchObject({ code: 'PARENT_WO_NOT_FOUND' })
  })

  it('updates assigneeIds via prisma when provided', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new CreateWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await handler.handle({ ...CMD, assigneeIds: ['tech-1', 'tech-2'] }, ctx)

    expect(prisma.workOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assigneeIds: ['tech-1', 'tech-2'] }),
      }),
    )
  })

  it('does NOT call workOrder.update when no assigneeIds are given', async () => {
    const { db, prisma, woRepo } = makeDeps()
    const handler = new CreateWorkOrderHandler(db as never, prisma as never, woRepo as never)

    await handler.handle(CMD, ctx) // no assigneeIds

    expect(prisma.workOrder.update).not.toHaveBeenCalled()
  })
})
