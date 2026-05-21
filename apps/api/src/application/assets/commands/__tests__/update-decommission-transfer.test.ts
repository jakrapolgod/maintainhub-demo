/**
 * Unit tests for:
 *   UpdateAssetHandler
 *   DecommissionAssetHandler
 *   TransferAssetHandler
 */
import {
  Asset,
  AssetId,
  AssetNumber,
  AssetStatus,
  CriticalityLevel,
  MAX_ASSET_DEPTH,
} from '@maintainhub/domain'
import { UpdateAssetHandler } from '../update-asset'
import { DecommissionAssetHandler } from '../decommission-asset'
import { TransferAssetHandler } from '../transfer-asset'
import type { CommandContext } from '../command.types'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-1'
const USER_ID = 'user-1'
const ASSET_ID = 'clh7z2d1h0000z1x1z1x1z1x1'
const PARENT_ID = 'cm9pq3r2i0000ymbj1nhq1zr2'
const LOC_ID = 'loc-1'
const NEW_LOC_ID = 'loc-2'

const ctx: CommandContext = {
  executingUserId: USER_ID,
  tenantId: TENANT_ID,
  userRole: 'MANAGER',
  ipAddress: '127.0.0.1',
  userAgent: 'test-agent',
}

// ── Asset factory ─────────────────────────────────────────────────────────────

function makeAsset(
  opts: {
    id?: string
    status?: AssetStatus
    locationId?: string
    parentId?: AssetId
  } = {},
): Asset {
  return Asset.reconstitute({
    id: new AssetId(opts.id ?? ASSET_ID),
    tenantId: TENANT_ID,
    assetNumber: new AssetNumber('AST-000001'),
    categoryId: 'cat-1',
    installDate: new Date('2023-01-01'),
    createdById: USER_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    name: 'Test Pump',
    status: opts.status ?? AssetStatus.OPERATIONAL,
    criticality: CriticalityLevel.C,
    ...(opts.locationId !== undefined && { locationId: opts.locationId }),
    ...(opts.parentId !== undefined && { parentId: opts.parentId }),
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// UpdateAssetHandler
// ══════════════════════════════════════════════════════════════════════════════

describe('UpdateAssetHandler', () => {
  function makeDeps(asset: Asset | null = makeAsset()) {
    const db = {
      asset: { update: jest.fn().mockResolvedValue({}) },
    }
    const prisma = { auditLog: { create: jest.fn().mockResolvedValue({}) } }
    const assetRepo = { findById: jest.fn().mockResolvedValue(asset) }
    return { db, prisma, assetRepo }
  }

  it('calls db.asset.update with patched fields', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new UpdateAssetHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle({ assetId: ASSET_ID, name: 'New Name', model: 'XL-300' }, ctx)

    expect(db.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ASSET_ID },
        data: expect.objectContaining({ name: 'New Name', model: 'XL-300' }),
      }),
    )
  })

  it('merges customFields (patch — does not wipe existing keys)', async () => {
    const existing = makeAsset()
    // Give the asset an existing custom field via Map
    const assetWithCustom = Asset.reconstitute({
      id: existing.id,
      tenantId: existing.tenantId,
      assetNumber: existing.assetNumber,
      categoryId: existing.categoryId,
      installDate: existing.installDate,
      createdById: existing.createdById,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
      name: existing.name,
      status: existing.status,
      criticality: existing.criticality,
      customFields: new Map([
        ['voltage', '440V'],
        ['phase', '3'],
      ]),
    })

    const { db, prisma, assetRepo } = makeDeps(assetWithCustom)
    const handler = new UpdateAssetHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle({ assetId: ASSET_ID, customFields: { amperage: '10A' } }, ctx)

    const callData = (db.asset.update as jest.Mock).mock.calls[0][0].data
    expect(callData.customFields).toMatchObject({ voltage: '440V', phase: '3', amperage: '10A' })
  })

  it('does not call db.asset.update when no fields are patched', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new UpdateAssetHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle({ assetId: ASSET_ID }, ctx)

    expect(db.asset.update).not.toHaveBeenCalled()
  })

  it('throws NOT_FOUND when asset does not exist', async () => {
    const { db, prisma, assetRepo } = makeDeps(null)
    const handler = new UpdateAssetHandler(db as never, prisma as never, assetRepo as never)

    await expect(handler.handle({ assetId: ASSET_ID, name: 'X' }, ctx)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('throws DECOMMISSIONED_ASSET when asset is decommissioned', async () => {
    const decommissioned = makeAsset({ status: AssetStatus.DECOMMISSIONED })
    const { db, prisma, assetRepo } = makeDeps(decommissioned)
    const handler = new UpdateAssetHandler(db as never, prisma as never, assetRepo as never)

    await expect(handler.handle({ assetId: ASSET_ID, name: 'X' }, ctx)).rejects.toMatchObject({
      code: 'DECOMMISSIONED_ASSET',
    })
  })

  it('writes an audit log', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new UpdateAssetHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle({ assetId: ASSET_ID, manufacturer: 'Grundfos' }, ctx)

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'UPDATE_ASSET' }),
      }),
    )
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// DecommissionAssetHandler
// ══════════════════════════════════════════════════════════════════════════════

describe('DecommissionAssetHandler', () => {
  function makeDeps(
    opts: {
      asset?: Asset | null
      hasOpenWOs?: boolean
    } = {},
  ) {
    const { asset = makeAsset(), hasOpenWOs = false } = opts

    const db = {
      pMSchedule: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    }
    const prisma = { auditLog: { create: jest.fn().mockResolvedValue({}) } }
    const assetRepo = {
      findById: jest.fn().mockResolvedValue(asset),
      hasOpenWorkOrders: jest.fn().mockResolvedValue(hasOpenWOs),
      save: jest.fn().mockResolvedValue(undefined),
    }

    return { db, prisma, assetRepo }
  }

  const CMD = { assetId: ASSET_ID, reason: 'End of service life', authorizedBy: USER_ID }

  it('calls asset.decommission and saves the aggregate', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new DecommissionAssetHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle(CMD, ctx)

    expect(assetRepo.save).toHaveBeenCalledWith(expect.any(Asset))
    const savedAsset: Asset = (assetRepo.save as jest.Mock).mock.calls[0][0]
    expect(savedAsset.status.isDecommissioned()).toBe(true)
  })

  it('deactivates all active PM schedules for the asset', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new DecommissionAssetHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle(CMD, ctx)

    expect(db.pMSchedule.updateMany).toHaveBeenCalledWith({
      where: { assetId: ASSET_ID, isActive: true },
      data: { isActive: false },
    })
  })

  it('throws OPEN_WORK_ORDERS_EXIST when open WOs exist', async () => {
    const { db, prisma, assetRepo } = makeDeps({ hasOpenWOs: true })
    const handler = new DecommissionAssetHandler(db as never, prisma as never, assetRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({
      code: 'OPEN_WORK_ORDERS_EXIST',
    })
    expect(assetRepo.save).not.toHaveBeenCalled()
  })

  it('throws NOT_FOUND when asset does not exist', async () => {
    const { db, prisma, assetRepo } = makeDeps({ asset: null })
    const handler = new DecommissionAssetHandler(db as never, prisma as never, assetRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws ALREADY_DECOMMISSIONED when asset is already decommissioned', async () => {
    const already = makeAsset({ status: AssetStatus.DECOMMISSIONED })
    const { db, prisma, assetRepo } = makeDeps({ asset: already })
    const handler = new DecommissionAssetHandler(db as never, prisma as never, assetRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({
      code: 'ALREADY_DECOMMISSIONED',
    })
  })

  it('writes an audit log including pmSchedulesDisabled count', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new DecommissionAssetHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle(CMD, ctx)

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'DECOMMISSION_ASSET',
          after: expect.objectContaining({ pmSchedulesDisabled: 2 }),
        }),
      }),
    )
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// TransferAssetHandler
// ══════════════════════════════════════════════════════════════════════════════

describe('TransferAssetHandler', () => {
  function makeDeps(
    opts: {
      asset?: Asset | null
      locationExists?: boolean
      parentExists?: boolean
      ancestors?: Asset[]
    } = {},
  ) {
    const {
      asset = makeAsset({ locationId: LOC_ID }),
      locationExists = true,
      parentExists = true,
      ancestors = [],
    } = opts

    const db = {
      location: {
        findFirst: jest.fn().mockResolvedValue(locationExists ? { id: NEW_LOC_ID } : null),
      },
      asset: { findFirst: jest.fn().mockResolvedValue(parentExists ? { id: PARENT_ID } : null) },
    }
    const prisma = { auditLog: { create: jest.fn().mockResolvedValue({}) } }
    const assetRepo = {
      findById: jest.fn().mockResolvedValue(asset),
      findAncestors: jest.fn().mockResolvedValue(ancestors),
      save: jest.fn().mockResolvedValue(undefined),
    }

    return { db, prisma, assetRepo }
  }

  const CMD = { assetId: ASSET_ID, newLocationId: NEW_LOC_ID }

  it('saves the asset with updated locationId', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new TransferAssetHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle(CMD, ctx)

    expect(assetRepo.save).toHaveBeenCalledWith(expect.any(Asset))
    const saved: Asset = (assetRepo.save as jest.Mock).mock.calls[0][0]
    expect(saved.locationId).toBe(NEW_LOC_ID)
  })

  it('throws NOT_FOUND when asset does not exist', async () => {
    const { db, prisma, assetRepo } = makeDeps({ asset: null })
    const handler = new TransferAssetHandler(db as never, prisma as never, assetRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws LOCATION_NOT_FOUND when new location does not exist', async () => {
    const { db, prisma, assetRepo } = makeDeps({ locationExists: false })
    const handler = new TransferAssetHandler(db as never, prisma as never, assetRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'LOCATION_NOT_FOUND' })
  })

  it('throws DECOMMISSIONED_ASSET when asset is decommissioned', async () => {
    const decommissioned = makeAsset({ status: AssetStatus.DECOMMISSIONED })
    const { db, prisma, assetRepo } = makeDeps({ asset: decommissioned })
    const handler = new TransferAssetHandler(db as never, prisma as never, assetRepo as never)

    await expect(handler.handle(CMD, ctx)).rejects.toMatchObject({ code: 'DECOMMISSIONED_ASSET' })
  })

  it('throws PARENT_NOT_FOUND when new parentId does not exist', async () => {
    const { db, prisma, assetRepo } = makeDeps({ parentExists: false })
    const handler = new TransferAssetHandler(db as never, prisma as never, assetRepo as never)

    await expect(handler.handle({ ...CMD, newParentId: PARENT_ID }, ctx)).rejects.toMatchObject({
      code: 'PARENT_NOT_FOUND',
    })
  })

  it('throws MAX_ASSET_DEPTH_EXCEEDED when re-parenting would exceed depth limit', async () => {
    const deepAncestors = Array.from({ length: MAX_ASSET_DEPTH - 1 }, (_, i) =>
      makeAsset({ id: `clh7z2d1h000${i}z1x1z1x1z1x1` }),
    )
    const { db, prisma, assetRepo } = makeDeps({ ancestors: deepAncestors })
    const handler = new TransferAssetHandler(db as never, prisma as never, assetRepo as never)

    await expect(handler.handle({ ...CMD, newParentId: PARENT_ID }, ctx)).rejects.toMatchObject({
      code: 'MAX_ASSET_DEPTH_EXCEEDED',
    })
  })

  it('clears parent when newParentId = null', async () => {
    const assetWithParent = makeAsset({ parentId: new AssetId(PARENT_ID) })
    const { db, prisma, assetRepo } = makeDeps({ asset: assetWithParent })
    const handler = new TransferAssetHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle({ ...CMD, newParentId: null }, ctx)

    const saved: Asset = (assetRepo.save as jest.Mock).mock.calls[0][0]
    expect(saved.parentId).toBeUndefined()
  })

  it('does not call findAncestors when newParentId is omitted', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new TransferAssetHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle(CMD, ctx) // no newParentId

    expect(assetRepo.findAncestors).not.toHaveBeenCalled()
  })

  it('logs old and new locationId in the audit record', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new TransferAssetHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle(CMD, ctx)

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'TRANSFER_ASSET',
          before: expect.objectContaining({ locationId: LOC_ID }),
          after: expect.objectContaining({ locationId: NEW_LOC_ID }),
        }),
      }),
    )
  })
})
