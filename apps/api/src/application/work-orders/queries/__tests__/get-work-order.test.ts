import { GetWorkOrderHandler } from '../get-work-order'
import type { GetWorkOrderQuery } from '../get-work-order'
import type { QueryContext } from '../query.types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const WO_ID = 'clh7z2d1h0000z1x1z1x1z1x1'
const TENANT = 'tenant-1'
const USER_ID = 'user-1'

const ctx: QueryContext = { executingUserId: USER_ID, tenantId: TENANT, userRole: 'MANAGER' }
const query: GetWorkOrderQuery = { workOrderId: WO_ID }

const NOW = new Date('2024-06-01T10:00:00Z')

function makeWoRow(overrides = {}) {
  return {
    id: WO_ID,
    woNumber: 'WO-2024-000001',
    title: 'Fix pump',
    description: 'Pump seal broken',
    type: 'CORRECTIVE',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    assetId: 'asset-1',
    parentId: null,
    assigneeIds: ['tech-1'],
    dueDate: null,
    slaDeadline: null,
    startedAt: null,
    completedAt: null,
    failureCodeId: null,
    failureCode: null,
    resolution: null,
    totalLaborCost: null,
    totalPartsCost: null,
    createdById: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    asset: { id: 'asset-1', name: 'Pump P-101', location: { name: 'Building A' } },
    laborEntries: [],
    partUsages: [],
    attachments: [],
    comments: [],
    ...overrides,
  }
}

function makeDeps(opts: { wo?: ReturnType<typeof makeWoRow> | null } = {}) {
  const { wo = makeWoRow() } = opts

  const db = {
    workOrder: {
      findFirst: jest.fn().mockResolvedValue(wo),
    },
    user: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'tech-1', name: 'Alice Tech', avatarUrl: null }]),
      findFirst: jest.fn().mockResolvedValue({ id: USER_ID, name: 'Bob Manager' }),
    },
  }

  const prisma = {
    auditLog: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'audit-1',
          action: 'CREATE_WORK_ORDER',
          userId: USER_ID,
          user: { id: USER_ID, name: 'Bob Manager' },
          before: null,
          after: null,
          ipAddress: null,
          createdAt: NOW,
        },
      ]),
    },
  }

  return { db, prisma }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GetWorkOrderHandler', () => {
  it('returns a WorkOrderDetail with correct scalar fields', async () => {
    const { db, prisma } = makeDeps()
    const handler = new GetWorkOrderHandler(db as never, prisma as never)

    const detail = await handler.handle(query, ctx)

    expect(detail.id).toBe(WO_ID)
    expect(detail.woNumber).toBe('WO-2024-000001')
    expect(detail.title).toBe('Fix pump')
    expect(detail.priority).toBe('HIGH')
    expect(detail.status).toBe('IN_PROGRESS')
  })

  it('includes asset name and location', async () => {
    const { db, prisma } = makeDeps()
    const handler = new GetWorkOrderHandler(db as never, prisma as never)

    const detail = await handler.handle(query, ctx)

    expect(detail.assetName).toBe('Pump P-101')
    expect(detail.assetLocation).toBe('Building A')
  })

  it('includes assignee stubs', async () => {
    const { db, prisma } = makeDeps()
    const handler = new GetWorkOrderHandler(db as never, prisma as never)

    const detail = await handler.handle(query, ctx)

    expect(detail.assignees).toHaveLength(1)
    expect(detail.assignees[0]).toMatchObject({ id: 'tech-1', name: 'Alice Tech', avatarUrl: null })
  })

  it('includes createdByName from user lookup', async () => {
    const { db, prisma } = makeDeps()
    const handler = new GetWorkOrderHandler(db as never, prisma as never)

    const detail = await handler.handle(query, ctx)

    expect(detail.createdByName).toBe('Bob Manager')
  })

  it('includes audit trail', async () => {
    const { db, prisma } = makeDeps()
    const handler = new GetWorkOrderHandler(db as never, prisma as never)

    const detail = await handler.handle(query, ctx)

    expect(detail.auditTrail).toHaveLength(1)
    expect(detail.auditTrail[0]).toMatchObject({
      action: 'CREATE_WORK_ORDER',
      userName: 'Bob Manager',
    })
  })

  it('maps laborEntries to DTOs', async () => {
    const wo = makeWoRow({
      laborEntries: [
        {
          id: 'le-1',
          technicianId: 'tech-1',
          technician: { name: 'Alice Tech' },
          date: new Date('2024-05-01T00:00:00Z'),
          hours: '4.00',
          ratePerHour: '500.00',
          totalCost: '2000.00',
          description: null,
        },
      ],
    })
    const { db, prisma } = makeDeps({ wo })
    const handler = new GetWorkOrderHandler(db as never, prisma as never)

    const detail = await handler.handle(query, ctx)

    expect(detail.laborEntries).toHaveLength(1)
    expect(detail.laborEntries[0]).toMatchObject({
      id: 'le-1',
      technicianName: 'Alice Tech',
      hours: 4,
      ratePerHour: 500,
      totalCost: 2000,
    })
  })

  it('maps partUsages to DTOs', async () => {
    const wo = makeWoRow({
      partUsages: [
        {
          id: 'pu-1',
          partId: 'part-1',
          part: { partNumber: 'P-001', name: 'Seal' },
          quantity: 2,
          unitCost: '200.00',
          totalCost: '400.00',
          usedAt: NOW,
        },
      ],
    })
    const { db, prisma } = makeDeps({ wo })
    const handler = new GetWorkOrderHandler(db as never, prisma as never)

    const detail = await handler.handle(query, ctx)

    expect(detail.partUsages).toHaveLength(1)
    expect(detail.partUsages[0]).toMatchObject({
      partNumber: 'P-001',
      partName: 'Seal',
      quantity: 2,
      totalCost: 400,
    })
  })

  it('maps comments to DTOs', async () => {
    const wo = makeWoRow({
      comments: [
        {
          id: 'c-1',
          body: 'Parts ordered',
          authorId: USER_ID,
          author: { name: 'Bob Manager', avatarUrl: null },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    })
    const { db, prisma } = makeDeps({ wo })
    const handler = new GetWorkOrderHandler(db as never, prisma as never)

    const detail = await handler.handle(query, ctx)

    expect(detail.comments).toHaveLength(1)
    expect(detail.comments[0]).toMatchObject({ body: 'Parts ordered', authorName: 'Bob Manager' })
  })

  it('throws NOT_FOUND when WO does not exist', async () => {
    const { db, prisma } = makeDeps({ wo: null })
    const handler = new GetWorkOrderHandler(db as never, prisma as never)

    await expect(handler.handle(query, ctx)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('returns null assetLocation when asset has no location', async () => {
    const wo = makeWoRow({ asset: { id: 'asset-1', name: 'Pump', location: null } })
    const { db, prisma } = makeDeps({ wo })
    const handler = new GetWorkOrderHandler(db as never, prisma as never)

    const detail = await handler.handle(query, ctx)

    expect(detail.assetLocation).toBeNull()
  })

  it('handles WO with empty assigneeIds without calling user.findMany', async () => {
    const wo = makeWoRow({ assigneeIds: [] })
    const { db, prisma } = makeDeps({ wo })
    const handler = new GetWorkOrderHandler(db as never, prisma as never)

    const detail = await handler.handle(query, ctx)

    expect(db.user.findMany).not.toHaveBeenCalled()
    expect(detail.assignees).toHaveLength(0)
  })
})
