import { GetAssetHandler } from '../get-asset'
import type { GetAssetQuery } from '../get-asset'
import type { QueryContext } from '../query.types'

// ── Constants ─────────────────────────────────────────────────────────────────

const ASSET_ID = 'clh7z2d1h0000z1x1z1x1z1x1'
const TENANT = 'tenant-1'
const USER_ID = 'user-1'
const NOW = new Date('2024-06-01T10:00:00Z')

const ctx: QueryContext = { executingUserId: USER_ID, tenantId: TENANT, userRole: 'MANAGER' }
const query: GetAssetQuery = { assetId: ASSET_ID }

// ── Mock factories ────────────────────────────────────────────────────────────

function makeAssetRow(overrides = {}) {
  return {
    id: ASSET_ID,
    tenantId: TENANT,
    assetNumber: 'AST-000001',
    name: 'Centrifugal Pump P-101',
    description: 'Main process pump',
    categoryId: 'cat-1',
    parentId: null,
    locationId: 'loc-1',
    status: 'OPERATIONAL',
    criticality: 'B',
    manufacturer: 'Grundfos',
    model: 'CR 10-4',
    serialNumber: 'SN-123',
    installDate: new Date('2022-01-01'),
    warrantyExpiry: new Date('2025-01-01'),
    customFields: {},
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    category: { id: 'cat-1', code: 'PUMP', name: 'Pumps' },
    location: { id: 'loc-1', code: 'BLDG-A', name: 'Building A' },
    parent: null,
    children: [],
    ...overrides,
  }
}

function makeDeps(opts: { assetRow?: ReturnType<typeof makeAssetRow> | null } = {}) {
  const { assetRow = makeAssetRow() } = opts

  const db = {
    asset: { findFirst: jest.fn().mockResolvedValue(assetRow) },
    workOrder: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    pMSchedule: { findMany: jest.fn().mockResolvedValue([]) },
    attachment: { findMany: jest.fn().mockResolvedValue([]) },
  }

  const prisma = {
    workOrder: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { totalLaborCost: null, totalPartsCost: null } }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  }

  const minio = {
    presignedGetObject: jest.fn().mockResolvedValue('https://minio.example.com/signed-url'),
  }

  return { db, prisma, minio, bucket: 'maintainhub' }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GetAssetHandler', () => {
  it('returns asset detail with correct scalar fields', async () => {
    const { db, prisma, minio, bucket } = makeDeps()
    const handler = new GetAssetHandler(db as never, prisma as never, minio as never, bucket)

    const detail = await handler.handle(query, ctx)

    expect(detail.id).toBe(ASSET_ID)
    expect(detail.assetNumber).toBe('AST-000001')
    expect(detail.name).toBe('Centrifugal Pump P-101')
    expect(detail.categoryName).toBe('Pumps')
    expect(detail.locationName).toBe('Building A')
    expect(detail.manufacturer).toBe('Grundfos')
    expect(detail.model).toBe('CR 10-4')
  })

  it('throws NOT_FOUND when asset does not exist', async () => {
    const { db, prisma, minio, bucket } = makeDeps({ assetRow: null })
    const handler = new GetAssetHandler(db as never, prisma as never, minio as never, bucket)

    await expect(handler.handle(query, ctx)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('computes metrics correctly for two CORRECTIVE WOs', async () => {
    const h = 3_600_000
    // Sort by completedAt ascending so MTBF interval is positive
    const corrWOs = [
      {
        id: 'clh7z2d1h0002z1x1z1x1z1x1',
        tenantId: TENANT,
        woNumber: 'WO-2',
        type: 'CORRECTIVE',
        status: 'COMPLETED',
        assetId: ASSET_ID,
        createdById: USER_ID,
        startedAt: new Date(NOW.getTime() - 80 * h),
        completedAt: new Date(NOW.getTime() - 74 * h), // 6h repair
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'clh7z2d1h0001z1x1z1x1z1x1',
        tenantId: TENANT,
        woNumber: 'WO-1',
        type: 'CORRECTIVE',
        status: 'COMPLETED',
        assetId: ASSET_ID,
        createdById: USER_ID,
        startedAt: new Date(NOW.getTime() - 5 * h),
        completedAt: new Date(NOW.getTime() - 1 * h), // 4h repair
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]

    const { db, prisma, minio, bucket } = makeDeps()
    ;(prisma.workOrder.findMany as jest.Mock).mockResolvedValue(corrWOs)
    const handler = new GetAssetHandler(db as never, prisma as never, minio as never, bucket)

    const detail = await handler.handle(query, ctx)

    expect(detail.metrics.failureCount).toBe(2)
    expect(detail.metrics.mttrHours).toBe(5) // (4+6)/2
    expect(detail.metrics.availability).toBeGreaterThan(0)
  })

  it('includes PM schedule count and next due date', async () => {
    const pm = {
      id: 'pm-1',
      title: 'Monthly PM',
      triggerType: 'CALENDAR',
      nextDue: new Date('2024-07-01'),
      isActive: true,
    }
    const { db, prisma, minio, bucket } = makeDeps()
    ;(db.pMSchedule.findMany as jest.Mock).mockResolvedValue([pm])
    const handler = new GetAssetHandler(db as never, prisma as never, minio as never, bucket)

    const detail = await handler.handle(query, ctx)

    expect(detail.activePMCount).toBe(1)
    expect(detail.nextPMDue).toBe(pm.nextDue.toISOString())
  })

  it('generates signed URLs for documents', async () => {
    const { db, prisma, minio, bucket } = makeDeps()
    ;(db.attachment.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'att-1',
        fileName: 'manual.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        storageKey: 'assets/t/a/manual.pdf',
        createdAt: NOW,
      },
    ])
    const handler = new GetAssetHandler(db as never, prisma as never, minio as never, bucket)

    const detail = await handler.handle(query, ctx)

    expect(detail.documents).toHaveLength(1)
    expect(detail.documents[0]!.signedUrl).toBe('https://minio.example.com/signed-url')
    expect(minio.presignedGetObject).toHaveBeenCalledWith(bucket, 'assets/t/a/manual.pdf', 3600)
  })

  it('returns empty string signed URL when MinIO errors (non-fatal)', async () => {
    const { db, prisma, minio, bucket } = makeDeps()
    ;(db.attachment.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'att-1',
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
        fileSize: 500,
        storageKey: 'k',
        createdAt: NOW,
      },
    ])
    ;(minio.presignedGetObject as jest.Mock).mockRejectedValue(new Error('MinIO down'))
    const handler = new GetAssetHandler(db as never, prisma as never, minio as never, bucket)

    const detail = await handler.handle(query, ctx)

    expect(detail.documents[0]!.signedUrl).toBe('')
  })

  it('includes recent work orders summary', async () => {
    const recentWO = {
      id: 'wo-1',
      woNumber: 'WO-2024-000001',
      title: 'Seal replacement',
      type: 'CORRECTIVE',
      status: 'COMPLETED',
      priority: 'HIGH',
      startedAt: NOW,
      completedAt: NOW,
      totalLaborCost: '1500.00',
      totalPartsCost: '500.00',
    }
    const { db, prisma, minio, bucket } = makeDeps()
    ;(db.workOrder.findMany as jest.Mock).mockResolvedValue([recentWO])
    const handler = new GetAssetHandler(db as never, prisma as never, minio as never, bucket)

    const detail = await handler.handle(query, ctx)

    expect(detail.recentWorkOrders).toHaveLength(1)
    expect(detail.recentWorkOrders[0]!.woNumber).toBe('WO-2024-000001')
    expect(detail.recentWorkOrders[0]!.totalCost).toBe(2000)
  })

  it('returns null totalCost when WO has no cost data', async () => {
    const recentWO = {
      id: 'wo-1',
      woNumber: 'WO-001',
      title: 'Inspection',
      type: 'INSPECTION',
      status: 'COMPLETED',
      priority: 'LOW',
      startedAt: null,
      completedAt: null,
      totalLaborCost: null,
      totalPartsCost: null,
    }
    const { db, prisma, minio, bucket } = makeDeps()
    ;(db.workOrder.findMany as jest.Mock).mockResolvedValue([recentWO])
    const handler = new GetAssetHandler(db as never, prisma as never, minio as never, bucket)

    const detail = await handler.handle(query, ctx)

    expect(detail.recentWorkOrders[0]!.totalCost).toBeNull()
  })

  it('includes children stubs', async () => {
    const assetWithChildren = makeAssetRow({
      children: [
        {
          id: 'child-1',
          assetNumber: 'AST-000002',
          name: 'Seal Kit',
          status: 'OPERATIONAL',
          criticality: 'D',
        },
      ],
    })
    const { db, prisma, minio, bucket } = makeDeps({ assetRow: assetWithChildren })
    const handler = new GetAssetHandler(db as never, prisma as never, minio as never, bucket)

    const detail = await handler.handle(query, ctx)

    expect(detail.children).toHaveLength(1)
    expect(detail.children[0]!.assetNumber).toBe('AST-000002')
  })
})
