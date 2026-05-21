/**
 * Unit tests for:
 *   SearchAssetsHandler
 *   AssetSearchSyncService
 *   GetAssetsNeedingAttentionHandler
 *   GetAssetsByLocationHandler
 */
import { SearchAssetsHandler } from '../search-assets'
import { AssetSearchSyncService } from '../asset-search-sync'
import type { AssetSearchDocument } from '../search-assets'
import { GetAssetsNeedingAttentionHandler } from '../get-assets-needing-attention'
import { GetAssetsByLocationHandler } from '../get-assets-by-location'
import type { QueryContext } from '../query.types'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT = 'tenant-1'
const USER_ID = 'user-1'
const ASSET_ID = 'clh7z2d1h0000z1x1z1x1z1x1'
const NOW = new Date('2024-06-01T12:00:00Z')

const ctx: QueryContext = { executingUserId: USER_ID, tenantId: TENANT, userRole: 'MANAGER' }

// ── Asset row factory ─────────────────────────────────────────────────────────

function makeAssetRow(
  opts: {
    id?: string
    status?: string
    locationId?: string | null
    warrantyExpiry?: Date | null
  } = {},
) {
  return {
    id: opts.id ?? ASSET_ID,
    assetNumber: 'AST-000001',
    name: 'Test Pump',
    status: opts.status ?? 'OPERATIONAL',
    criticality: 'C',
    categoryId: 'cat-1',
    locationId: opts.locationId ?? null,
    parentId: null,
    manufacturer: null,
    model: null,
    serialNumber: null,
    installDate: null,
    warrantyExpiry: opts.warrantyExpiry ?? null,
    createdAt: NOW,
    updatedAt: NOW,
    category: { id: 'cat-1', name: 'Pumps' },
    location:
      opts.locationId !== null && opts.locationId !== undefined
        ? { id: opts.locationId, code: 'BLDG-A', name: 'Building A', parentId: null }
        : null,
    parent: null,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SearchAssetsHandler
// ══════════════════════════════════════════════════════════════════════════════

describe('SearchAssetsHandler', () => {
  function makeSearch(hits: unknown[] = [], total = 0) {
    return {
      index: jest.fn().mockReturnValue({
        search: jest.fn().mockResolvedValue({
          hits,
          estimatedTotalHits: total,
          processingTimeMs: 5,
        }),
      }),
    }
  }

  function makeDb() {
    return {
      workOrder: { groupBy: jest.fn().mockResolvedValue([]) },
    }
  }

  it('returns empty result when Meilisearch finds no hits', async () => {
    const handler = new SearchAssetsHandler(makeSearch() as never, makeDb() as never)
    const result = await handler.handle({ q: 'pump' }, ctx)

    expect(result.hits).toHaveLength(0)
    expect(result.estimatedTotal).toBe(0)
    expect(result.query).toBe('pump')
  })

  it('maps Meilisearch hits to AssetSearchHit DTOs', async () => {
    const rawHit = {
      id: ASSET_ID,
      tenantId: TENANT,
      assetNumber: 'AST-000001',
      name: 'Test Pump',
      serialNumber: null,
      manufacturer: null,
      model: null,
      status: 'OPERATIONAL',
      criticality: 'C',
      categoryId: 'cat-1',
      categoryName: 'Pumps',
      locationId: null,
      locationName: null,
      parentId: null,
      parentName: null,
      isDecommissioned: false,
      updatedAt: Math.floor(NOW.getTime() / 1000),
      _formatted: { assetNumber: 'AST-<em>000001</em>', name: 'Test <em>Pump</em>' },
    }

    const handler = new SearchAssetsHandler(makeSearch([rawHit], 1) as never, makeDb() as never)
    const result = await handler.handle({ q: 'pump' }, ctx)

    expect(result.hits).toHaveLength(1)
    expect(result.hits[0]!.id).toBe(ASSET_ID)
    expect(result.hits[0]!.highlights.assetNumber).toBe('AST-<em>000001</em>')
    expect(result.hits[0]!.highlights.name).toBe('Test <em>Pump</em>')
  })

  it('enriches hits with openWOCount from DB', async () => {
    const rawHit = {
      id: ASSET_ID,
      tenantId: TENANT,
      assetNumber: 'AST-000001',
      name: 'Pump',
      serialNumber: null,
      manufacturer: null,
      model: null,
      status: 'OPERATIONAL',
      criticality: 'C',
      categoryId: 'cat-1',
      categoryName: 'Pumps',
      locationId: null,
      locationName: null,
      parentId: null,
      parentName: null,
      isDecommissioned: false,
      updatedAt: Math.floor(NOW.getTime() / 1000),
    }

    const db = {
      workOrder: {
        groupBy: jest.fn().mockResolvedValue([{ assetId: ASSET_ID, _count: { _all: 4 } }]),
      },
    }

    const handler = new SearchAssetsHandler(makeSearch([rawHit], 1) as never, db as never)
    const result = await handler.handle({ q: 'pump' }, ctx)

    expect(result.hits[0]!.openWOCount).toBe(4)
  })

  it('sets processingTimeMs from Meilisearch response', async () => {
    const handler = new SearchAssetsHandler(makeSearch([], 0) as never, makeDb() as never)
    const result = await handler.handle({ q: 'test' }, ctx)

    expect(result.processingTimeMs).toBe(5)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AssetSearchSyncService
// ══════════════════════════════════════════════════════════════════════════════

describe('AssetSearchSyncService', () => {
  function makeSearch() {
    const indexMock = {
      addDocuments: jest.fn().mockResolvedValue({}),
      deleteDocument: jest.fn().mockResolvedValue({}),
      updateFilterableAttributes: jest.fn().mockResolvedValue({}),
      updateSortableAttributes: jest.fn().mockResolvedValue({}),
      updateSearchableAttributes: jest.fn().mockResolvedValue({}),
    }
    return {
      index: jest.fn().mockReturnValue(indexMock),
      createIndex: jest.fn().mockResolvedValue({}),
      indexMock,
    }
  }

  it('upsertDocument calls addDocuments on the tenant index', async () => {
    const { index, indexMock } = makeSearch()
    const svc = new AssetSearchSyncService({ index, createIndex: jest.fn() } as never)

    const doc: AssetSearchDocument = {
      id: ASSET_ID,
      tenantId: TENANT,
      assetNumber: 'AST-1',
      name: 'Pump',
      serialNumber: null,
      manufacturer: null,
      model: null,
      status: 'OPERATIONAL',
      criticality: 'C',
      categoryId: 'cat-1',
      categoryName: 'Pumps',
      locationId: null,
      locationName: null,
      parentId: null,
      parentName: null,
      isDecommissioned: false,
      updatedAt: 1717200000,
    }

    await svc.upsertDocument(doc)

    expect(index).toHaveBeenCalledWith(`assets_${TENANT}`)
    expect(indexMock.addDocuments).toHaveBeenCalledWith([doc], { primaryKey: 'id' })
  })

  it('deleteDocument calls deleteDocument on the tenant index', async () => {
    const { index, indexMock } = makeSearch()
    const svc = new AssetSearchSyncService({ index, createIndex: jest.fn() } as never)

    await svc.deleteDocument(ASSET_ID, TENANT)

    expect(indexMock.deleteDocument).toHaveBeenCalledWith(ASSET_ID)
  })

  it('swallows errors from upsertDocument (non-fatal)', async () => {
    const svc = new AssetSearchSyncService({
      index: jest.fn().mockReturnValue({
        addDocuments: jest.fn().mockRejectedValue(new Error('Meilisearch down')),
      }),
    } as never)

    await expect(svc.upsertDocument({} as never)).resolves.toBeUndefined()
  })

  it('buildDocument returns correct document shape', () => {
    const row = {
      id: ASSET_ID,
      tenantId: TENANT,
      assetNumber: 'AST-000001',
      name: 'Pump',
      serialNumber: 'SN-1',
      manufacturer: 'Grundfos',
      model: 'CR 10',
      status: 'OPERATIONAL',
      criticality: 'B',
      categoryId: 'cat-1',
      category: { name: 'Pumps' },
      locationId: 'loc-1',
      location: { name: 'Building A' },
      parentId: null,
      parent: null,
      updatedAt: NOW,
    }

    const doc = AssetSearchSyncService.buildDocument(row)

    expect(doc.id).toBe(ASSET_ID)
    expect(doc.categoryName).toBe('Pumps')
    expect(doc.locationName).toBe('Building A')
    expect(doc.isDecommissioned).toBe(false)
    expect(doc.updatedAt).toBe(Math.floor(NOW.getTime() / 1000))
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// GetAssetsNeedingAttentionHandler
// ══════════════════════════════════════════════════════════════════════════════

describe('GetAssetsNeedingAttentionHandler', () => {
  function makeDeps(
    opts: {
      pmRows?: { assetId: string; nextDue: Date }[]
      warrantyRows?: { id: string; warrantyExpiry: Date }[]
      emergencyRows?: { assetId: string }[]
      mttrWOs?: unknown[]
      assetRows?: ReturnType<typeof makeAssetRow>[]
    } = {},
  ) {
    const db = {
      pMSchedule: { findMany: jest.fn().mockResolvedValue(opts.pmRows ?? []) },
      asset: { findMany: jest.fn().mockResolvedValue(opts.assetRows ?? []), findFirst: jest.fn() },
      workOrder: {
        findMany: jest.fn().mockResolvedValue(opts.emergencyRows ?? []),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    }
    const prisma = {
      workOrder: { findMany: jest.fn().mockResolvedValue(opts.mttrWOs ?? []) },
    }
    return { db, prisma }
  }

  it('returns empty result when no attention signals exist', async () => {
    const { db, prisma } = makeDeps()
    const handler = new GetAssetsNeedingAttentionHandler(db as never, prisma as never)

    const result = await handler.handle({}, ctx)

    expect(result.items).toHaveLength(0)
    expect(result.totalCount).toBe(0)
  })

  it('flags asset with OVERDUE_PM reason', async () => {
    const assetRow = makeAssetRow()
    const { db, prisma } = makeDeps({
      pmRows: [{ assetId: ASSET_ID, nextDue: new Date('2024-01-01') }],
      assetRows: [assetRow],
    })
    const handler = new GetAssetsNeedingAttentionHandler(db as never, prisma as never)

    const result = await handler.handle({}, ctx)

    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.reasons).toContain('OVERDUE_PM')
  })

  it('flags asset with WARRANTY_EXPIRING reason', async () => {
    const expiryDate = new Date(NOW.getTime() + 15 * 86_400_000) // 15 days from now
    const assetRow = makeAssetRow({ warrantyExpiry: expiryDate })
    const { db, prisma } = makeDeps({
      warrantyRows: [{ id: ASSET_ID, warrantyExpiry: expiryDate }],
      assetRows: [assetRow],
    })
    const handler = new GetAssetsNeedingAttentionHandler(db as never, prisma as never)

    const result = await handler.handle({}, ctx)

    expect(result.items[0]!.reasons).toContain('WARRANTY_EXPIRING')
  })

  it('flags asset with OPEN_EMERGENCY_WO reason', async () => {
    const assetRow = makeAssetRow()
    const { db, prisma } = makeDeps({
      emergencyRows: [{ assetId: ASSET_ID }],
      assetRows: [assetRow],
    })
    const handler = new GetAssetsNeedingAttentionHandler(db as never, prisma as never)

    const result = await handler.handle({}, ctx)

    expect(result.items[0]!.reasons).toContain('OPEN_EMERGENCY_WO')
  })

  it('flags asset with HIGH_MTTR when average repair > threshold', async () => {
    const H = 3_600_000
    const WO_ID = 'clh7z2d1h0001z1x1z1x1z1x1'
    const mttrWOs = [
      {
        id: WO_ID,
        tenantId: TENANT,
        woNumber: 'WO-1',
        type: 'CORRECTIVE',
        status: 'COMPLETED',
        assetId: ASSET_ID,
        createdById: USER_ID,
        startedAt: new Date(NOW.getTime() - 50 * H),
        completedAt: new Date(NOW.getTime() - 20 * H), // 30h repair > 24h threshold
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]
    const assetRow = makeAssetRow()
    const { db, prisma } = makeDeps({ mttrWOs, assetRows: [assetRow] })
    const handler = new GetAssetsNeedingAttentionHandler(db as never, prisma as never)

    const result = await handler.handle({ highMttrThresholdHours: 24 }, ctx)

    expect(result.items[0]!.reasons).toContain('HIGH_MTTR')
    expect(result.items[0]!.mttrHours).toBe(30)
  })

  it('asset can have multiple reasons simultaneously', async () => {
    const expiryDate = new Date(NOW.getTime() + 10 * 86_400_000)
    const assetRow = makeAssetRow({ warrantyExpiry: expiryDate })
    const { db, prisma } = makeDeps({
      pmRows: [{ assetId: ASSET_ID, nextDue: new Date('2024-01-01') }],
      warrantyRows: [{ id: ASSET_ID, warrantyExpiry: expiryDate }],
      assetRows: [assetRow],
    })
    const handler = new GetAssetsNeedingAttentionHandler(db as never, prisma as never)

    const result = await handler.handle({}, ctx)

    expect(result.items[0]!.reasons).toContain('OVERDUE_PM')
    expect(result.items[0]!.reasons).toContain('WARRANTY_EXPIRING')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// GetAssetsByLocationHandler
// ══════════════════════════════════════════════════════════════════════════════

describe('GetAssetsByLocationHandler', () => {
  function makeDeps(assetRows: ReturnType<typeof makeAssetRow>[] = []) {
    const db = {
      asset: { findMany: jest.fn().mockResolvedValue(assetRows) },
      location: { findMany: jest.fn().mockResolvedValue([]) },
      workOrder: { groupBy: jest.fn().mockResolvedValue([]) },
    }
    const prisma = {
      workOrder: { groupBy: jest.fn().mockResolvedValue([]) },
    }
    return { db, prisma }
  }

  it('returns empty result when no assets exist', async () => {
    const { db, prisma } = makeDeps()
    const handler = new GetAssetsByLocationHandler(db as never, prisma as never)

    const result = await handler.handle({}, ctx)

    expect(result.groups).toHaveLength(0)
    expect(result.ungrouped).toHaveLength(0)
    expect(result.totalAssets).toBe(0)
  })

  it('puts assets without locationId in ungrouped', async () => {
    const { db, prisma } = makeDeps([makeAssetRow({ locationId: null })])
    const handler = new GetAssetsByLocationHandler(db as never, prisma as never)

    const result = await handler.handle({}, ctx)

    expect(result.groups).toHaveLength(0)
    expect(result.ungrouped).toHaveLength(1)
  })

  it('groups assets by location', async () => {
    const rows = [
      makeAssetRow({ id: 'a-1', locationId: 'loc-1' }),
      makeAssetRow({ id: 'a-2', locationId: 'loc-1' }),
    ]
    const { db, prisma } = makeDeps(rows)
    const handler = new GetAssetsByLocationHandler(db as never, prisma as never)

    const result = await handler.handle({}, ctx)

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]!.locationId).toBe('loc-1')
    expect(result.groups[0]!.assets).toHaveLength(2)
  })

  it('computes openWOCount per group as sum of asset openWOCounts', async () => {
    const rows = [
      makeAssetRow({ id: 'a-1', locationId: 'loc-1' }),
      makeAssetRow({ id: 'a-2', locationId: 'loc-1' }),
    ]
    const { db, prisma } = makeDeps(rows)
    ;(prisma.workOrder.groupBy as jest.Mock).mockResolvedValue([
      { assetId: 'a-1', _count: { _all: 2 } },
      { assetId: 'a-2', _count: { _all: 3 } },
    ])
    const handler = new GetAssetsByLocationHandler(db as never, prisma as never)

    const result = await handler.handle({}, ctx)

    expect(result.groups[0]!.openWOCount).toBe(5)
  })

  it('totalAssets counts all assets (grouped + ungrouped)', async () => {
    const rows = [
      makeAssetRow({ id: 'a-1', locationId: 'loc-1' }),
      makeAssetRow({ id: 'a-2', locationId: null }),
    ]
    const { db, prisma } = makeDeps(rows)
    const handler = new GetAssetsByLocationHandler(db as never, prisma as never)

    const result = await handler.handle({}, ctx)

    expect(result.totalAssets).toBe(2)
    expect(result.groups).toHaveLength(1)
    expect(result.ungrouped).toHaveLength(1)
  })
})
