import {
  Asset,
  AssetId,
  AssetNumber,
  AssetStatus,
  CriticalityLevel,
  MAX_ASSET_DEPTH,
} from '@maintainhub/domain'
import { CreateAssetHandler } from '../create-asset'
import type { CreateAssetCommand } from '../create-asset'
import type { CommandContext } from '../command.types'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-1'
const USER_ID = 'user-1'
const CAT_ID = 'cat-1'
const LOC_ID = 'loc-1'
const PARENT_ID = 'clh7z2d1h0000z1x1z1x1z1x1'

const ctx: CommandContext = {
  executingUserId: USER_ID,
  tenantId: TENANT_ID,
  userRole: 'MANAGER',
  ipAddress: '127.0.0.1',
  userAgent: 'test-agent',
}

const CMD: CreateAssetCommand = {
  name: 'Centrifugal Pump P-101',
  categoryId: CAT_ID,
  criticality: 'B',
  installDate: new Date('2023-01-15'),
}

// ── Mock factories ────────────────────────────────────────────────────────────

function makeAsset(id = PARENT_ID): Asset {
  return Asset.reconstitute({
    id: new AssetId(id),
    tenantId: TENANT_ID,
    assetNumber: new AssetNumber('AST-000001'),
    categoryId: CAT_ID,
    installDate: new Date('2022-01-01'),
    createdById: USER_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    name: 'Parent Pump',
    status: AssetStatus.OPERATIONAL,
    criticality: CriticalityLevel.C,
  })
}

function makeDeps(
  overrides: Partial<{
    categoryExists: boolean
    locationExists: boolean
    parentExists: boolean
    ancestors: Asset[]
  }> = {},
) {
  const {
    categoryExists = true,
    locationExists = true,
    parentExists = true,
    ancestors = [],
  } = overrides

  const db = {
    assetCategory: {
      findFirst: jest.fn().mockResolvedValue(categoryExists ? { id: CAT_ID } : null),
    },
    location: { findFirst: jest.fn().mockResolvedValue(locationExists ? { id: LOC_ID } : null) },
    asset: { findFirst: jest.fn().mockResolvedValue(parentExists ? { id: PARENT_ID } : null) },
  }

  const prisma = {
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  }

  const assetRepo = {
    nextAssetNumber: jest.fn().mockResolvedValue(new AssetNumber('AST-000001')),
    save: jest.fn().mockResolvedValue(undefined),
    findAncestors: jest.fn().mockResolvedValue(ancestors),
  }

  return { db, prisma, assetRepo }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CreateAssetHandler', () => {
  // ── Happy path ───────────────────────────────────────────────────────────────

  it('returns the new asset ID string on success', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new CreateAssetHandler(db as never, prisma as never, assetRepo as never)

    const id = await handler.handle(CMD, ctx)

    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('calls assetRepo.nextAssetNumber with tenantId', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new CreateAssetHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle(CMD, ctx)

    expect(assetRepo.nextAssetNumber).toHaveBeenCalledWith(TENANT_ID)
  })

  it('calls assetRepo.save with an Asset aggregate', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new CreateAssetHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle(CMD, ctx)

    expect(assetRepo.save).toHaveBeenCalledWith(expect.any(Asset))
  })

  it('writes an audit log with CREATE_ASSET action', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new CreateAssetHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle(CMD, ctx)

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CREATE_ASSET', tenantId: TENANT_ID }),
      }),
    )
  })

  it('passes customFields as a Map to the aggregate', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new CreateAssetHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle({ ...CMD, customFields: { voltage: '440V' } }, ctx)

    const savedAsset: Asset = (assetRepo.save as jest.Mock).mock.calls[0][0]
    expect(savedAsset.customFields.get('voltage')).toBe('440V')
  })

  // ── Validation failures ───────────────────────────────────────────────────────

  it('throws CATEGORY_NOT_FOUND when category does not exist', async () => {
    const { db, prisma, assetRepo } = makeDeps({ categoryExists: false })
    const handler = new CreateAssetHandler(db as never, prisma as never, assetRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'CATEGORY_NOT_FOUND' })
  })

  it('throws LOCATION_NOT_FOUND when provided locationId does not exist', async () => {
    const { db, prisma, assetRepo } = makeDeps({ locationExists: false })
    const handler = new CreateAssetHandler(db as never, prisma as never, assetRepo as never)

    await expect(handler.handle({ ...CMD, locationId: LOC_ID }, ctx)).rejects.toMatchObject({
      code: 'LOCATION_NOT_FOUND',
    })
  })

  it('does NOT validate locationId when it is omitted', async () => {
    const { db, prisma, assetRepo } = makeDeps({ locationExists: false })
    const handler = new CreateAssetHandler(db as never, prisma as never, assetRepo as never)

    // No locationId in command — should succeed regardless of location mock
    await expect(handler.handle(CMD, ctx)).resolves.toBeDefined()
  })

  it('throws PARENT_NOT_FOUND when provided parentId does not exist', async () => {
    const { db, prisma, assetRepo } = makeDeps({ parentExists: false })
    const handler = new CreateAssetHandler(db as never, prisma as never, assetRepo as never)

    await expect(handler.handle({ ...CMD, parentId: PARENT_ID }, ctx)).rejects.toMatchObject({
      code: 'PARENT_NOT_FOUND',
    })
  })

  it('throws MAX_ASSET_DEPTH_EXCEEDED when parent is already at max depth', async () => {
    // Simulate a parent with MAX_ASSET_DEPTH - 1 ancestors (parent is at level MAX_ASSET_DEPTH)
    const deepAncestors = Array.from({ length: MAX_ASSET_DEPTH - 1 }, (_, i) =>
      makeAsset(`clh7z2d1h000${i}z1x1z1x1z1x1`),
    )
    const { db, prisma, assetRepo } = makeDeps({ ancestors: deepAncestors })
    const handler = new CreateAssetHandler(db as never, prisma as never, assetRepo as never)

    await expect(handler.handle({ ...CMD, parentId: PARENT_ID }, ctx)).rejects.toMatchObject({
      code: 'MAX_ASSET_DEPTH_EXCEEDED',
    })
  })

  it('succeeds when parent is at depth (MAX_ASSET_DEPTH - 1)', async () => {
    // Parent at level MAX_ASSET_DEPTH - 1: ancestors.length = MAX_ASSET_DEPTH - 2
    const shallowAncestors = Array.from({ length: MAX_ASSET_DEPTH - 2 }, (_, i) =>
      makeAsset(`clh7z2d1h000${i}z1x1z1x1z1x1`),
    )
    const { db, prisma, assetRepo } = makeDeps({ ancestors: shallowAncestors })
    const handler = new CreateAssetHandler(db as never, prisma as never, assetRepo as never)

    await expect(handler.handle({ ...CMD, parentId: PARENT_ID }, ctx)).resolves.toBeDefined()
  })

  it('does not call findAncestors when no parentId is supplied', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new CreateAssetHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle(CMD, ctx)

    expect(assetRepo.findAncestors).not.toHaveBeenCalled()
  })
})
