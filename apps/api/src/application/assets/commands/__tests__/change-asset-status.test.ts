import { Asset, AssetId, AssetNumber, AssetStatus, CriticalityLevel } from '@maintainhub/domain'
import { ChangeAssetStatusHandler } from '../change-asset-status'
import type { ChangeAssetStatusCommand } from '../change-asset-status'
import type { CommandContext } from '../command.types'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-1'
const USER_ID = 'user-1'
const ASSET_ID = 'clh7z2d1h0000z1x1z1x1z1x1'

const ctx: CommandContext = {
  executingUserId: USER_ID,
  tenantId: TENANT_ID,
  userRole: 'MANAGER',
  ipAddress: '127.0.0.1',
  userAgent: 'test-agent',
}

function makeAsset(status = AssetStatus.OPERATIONAL): Asset {
  return Asset.reconstitute({
    id: new AssetId(ASSET_ID),
    tenantId: TENANT_ID,
    assetNumber: new AssetNumber('AST-000001'),
    categoryId: 'cat-1',
    installDate: new Date('2023-01-01'),
    createdById: USER_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    name: 'Test Pump',
    status,
    criticality: CriticalityLevel.C,
  })
}

function makeDeps(asset: Asset | null = makeAsset()) {
  const db = {}
  const prisma = {
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ nextval: BigInt(1) }]),
    workOrder: { create: jest.fn().mockResolvedValue({}) },
  }
  const assetRepo = {
    findById: jest.fn().mockResolvedValue(asset),
    save: jest.fn().mockResolvedValue(undefined),
  }
  return { db, prisma, assetRepo }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChangeAssetStatusHandler', () => {
  it('transitions OPERATIONAL → STANDBY and saves the aggregate', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new ChangeAssetStatusHandler(db as never, prisma as never, assetRepo as never)
    const cmd: ChangeAssetStatusCommand = { assetId: ASSET_ID, newStatus: 'STANDBY' }

    await handler.handle(cmd, ctx)

    expect(assetRepo.save).toHaveBeenCalledWith(expect.any(Asset))
    const saved: Asset = (assetRepo.save as jest.Mock).mock.calls[0][0]
    expect(saved.status.value).toBe('STANDBY')
  })

  it('transitions OPERATIONAL → UNDER_MAINTENANCE', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new ChangeAssetStatusHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle({ assetId: ASSET_ID, newStatus: 'UNDER_MAINTENANCE' }, ctx)

    const saved: Asset = (assetRepo.save as jest.Mock).mock.calls[0][0]
    expect(saved.status.value).toBe('UNDER_MAINTENANCE')
  })

  it('creates a linked work order when transitioning to UNDER_MAINTENANCE with linkedWorkOrder', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new ChangeAssetStatusHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle(
      {
        assetId: ASSET_ID,
        newStatus: 'UNDER_MAINTENANCE',
        linkedWorkOrder: { title: 'Emergency repair', priority: 'CRITICAL' },
      },
      ctx,
    )

    expect(prisma.workOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Emergency repair',
          assetId: ASSET_ID,
          status: 'DRAFT',
        }),
      }),
    )
  })

  it('does NOT create a linked work order when transitioning to STANDBY', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new ChangeAssetStatusHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle(
      {
        assetId: ASSET_ID,
        newStatus: 'STANDBY',
        linkedWorkOrder: { title: 'Should not be created' },
      },
      ctx,
    )

    expect(prisma.workOrder.create).not.toHaveBeenCalled()
  })

  it('does NOT create a linked work order when linkedWorkOrder is omitted', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new ChangeAssetStatusHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle({ assetId: ASSET_ID, newStatus: 'UNDER_MAINTENANCE' }, ctx)

    expect(prisma.workOrder.create).not.toHaveBeenCalled()
  })

  it('throws USE_DECOMMISSION_HANDLER when attempting DECOMMISSIONED via this handler', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new ChangeAssetStatusHandler(db as never, prisma as never, assetRepo as never)

    await expect(
      handler.handle({ assetId: ASSET_ID, newStatus: 'DECOMMISSIONED' }, ctx),
    ).rejects.toMatchObject({ code: 'USE_DECOMMISSION_HANDLER' })
  })

  it('throws NOT_FOUND when asset does not exist', async () => {
    const { db, prisma, assetRepo } = makeDeps(null)
    const handler = new ChangeAssetStatusHandler(db as never, prisma as never, assetRepo as never)

    await expect(
      handler.handle({ assetId: ASSET_ID, newStatus: 'STANDBY' }, ctx),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws INVALID_ASSET_STATUS_TRANSITION for invalid transition (STANDBY → OPERATIONAL is valid, DECOMMISSIONED → OPERATIONAL is not)', async () => {
    // Try an asset already DECOMMISSIONED attempting OPERATIONAL — domain throws
    const decommissioned = makeAsset(AssetStatus.DECOMMISSIONED)
    const { db, prisma, assetRepo } = makeDeps(decommissioned)
    const handler = new ChangeAssetStatusHandler(db as never, prisma as never, assetRepo as never)

    await expect(
      handler.handle({ assetId: ASSET_ID, newStatus: 'OPERATIONAL' }, ctx),
    ).rejects.toMatchObject({ code: 'INVALID_ASSET_STATUS_TRANSITION' })
  })

  it('writes an audit log with before/after status', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new ChangeAssetStatusHandler(db as never, prisma as never, assetRepo as never)

    await handler.handle(
      { assetId: ASSET_ID, newStatus: 'STANDBY', reason: 'Planned downtime' },
      ctx,
    )

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CHANGE_ASSET_STATUS',
          before: expect.objectContaining({ status: 'OPERATIONAL' }),
          after: expect.objectContaining({ status: 'STANDBY', reason: 'Planned downtime' }),
        }),
      }),
    )
  })
})
