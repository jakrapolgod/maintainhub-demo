import { AssetNumber } from '@maintainhub/domain'
import { BulkImportAssetsHandler } from '../bulk-import-assets'
import type { BulkImportRow } from '../bulk-import-assets'
import type { CommandContext } from '../command.types'

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-1'
const USER_ID = 'user-1'

const ctx: CommandContext = {
  executingUserId: USER_ID,
  tenantId: TENANT_ID,
  userRole: 'ADMIN',
  ipAddress: null,
  userAgent: null,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<BulkImportRow> = {}, index = 1): BulkImportRow {
  return {
    rowIndex: index,
    name: `Pump ${index}`,
    categoryCode: 'PUMP',
    criticality: 'C',
    status: 'OPERATIONAL',
    ...overrides,
  }
}

let seqCounter = 1

function makeDeps(
  opts: {
    categoryExists?: boolean
    locationExists?: boolean
    existingNumbers?: string[]
  } = {},
) {
  const { categoryExists = true, locationExists = true, existingNumbers = [] } = opts

  seqCounter = 1

  const db = {
    assetCategory: {
      findMany: jest.fn().mockResolvedValue(categoryExists ? [{ id: 'cat-1', code: 'PUMP' }] : []),
    },
    location: {
      findMany: jest
        .fn()
        .mockResolvedValue(locationExists ? [{ id: 'loc-1', code: 'PLANT-A' }] : []),
    },
    asset: {
      findMany: jest.fn().mockResolvedValue(existingNumbers.map((n) => ({ assetNumber: n }))),
    },
    pMSchedule: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  }

  const prisma = {
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<void>) =>
      fn({
        asset: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      }),
    ),
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  }

  const assetRepo = {
    nextAssetNumber: jest.fn().mockImplementation(() => {
      const n = seqCounter
      seqCounter += 1
      return Promise.resolve(AssetNumber.fromSequence(n))
    }),
  }

  return { db, prisma, assetRepo }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BulkImportAssetsHandler', () => {
  // ── Empty input ───────────────────────────────────────────────────────────────

  it('returns {success:0, failed:[]} for empty row array', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new BulkImportAssetsHandler(db as never, prisma as never, assetRepo as never)

    const result = await handler.handle({ rows: [] }, ctx)

    expect(result).toEqual({ success: 0, failed: [] })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  // ── Happy path ────────────────────────────────────────────────────────────────

  it('returns success count equal to number of valid rows', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new BulkImportAssetsHandler(db as never, prisma as never, assetRepo as never)
    const rows = [makeRow({}, 1), makeRow({}, 2), makeRow({}, 3)]

    const result = await handler.handle({ rows }, ctx)

    expect(result.success).toBe(3)
    expect(result.failed).toHaveLength(0)
  })

  it('calls nextAssetNumber once per valid row', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new BulkImportAssetsHandler(db as never, prisma as never, assetRepo as never)
    const rows = [makeRow({}, 1), makeRow({}, 2)]

    await handler.handle({ rows }, ctx)

    expect(assetRepo.nextAssetNumber).toHaveBeenCalledTimes(2)
  })

  it('processes rows inside a Prisma transaction per batch', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new BulkImportAssetsHandler(db as never, prisma as never, assetRepo as never)
    const rows = Array.from({ length: 5 }, (_, i) => makeRow({}, i + 1))

    await handler.handle({ rows }, ctx)

    expect(prisma.$transaction).toHaveBeenCalledTimes(1) // 5 rows ≤ BATCH_SIZE(50) → 1 batch
  })

  it('uses two transactions for > 50 rows (two batches)', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new BulkImportAssetsHandler(db as never, prisma as never, assetRepo as never)
    const rows = Array.from({ length: 60 }, (_, i) => makeRow({}, i + 1))

    await handler.handle({ rows }, ctx)

    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
  })

  it('writes a summary audit log', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new BulkImportAssetsHandler(db as never, prisma as never, assetRepo as never)
    const rows = [makeRow({}, 1)]

    await handler.handle({ rows }, ctx)

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'BULK_IMPORT_ASSETS' }),
      }),
    )
  })

  // ── Validation failures ───────────────────────────────────────────────────────

  it('fails a row when name is empty', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new BulkImportAssetsHandler(db as never, prisma as never, assetRepo as never)

    const result = await handler.handle({ rows: [makeRow({ name: '' }, 1)] }, ctx)

    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]!.rowIndex).toBe(1)
    expect(result.failed[0]!.reason).toMatch(/name is required/i)
  })

  it('fails a row when categoryCode is empty', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new BulkImportAssetsHandler(db as never, prisma as never, assetRepo as never)

    const result = await handler.handle({ rows: [makeRow({ categoryCode: '' }, 1)] }, ctx)

    expect(result.failed[0]!.reason).toMatch(/categoryCode is required/i)
  })

  it('fails a row when categoryCode is unknown', async () => {
    const { db, prisma, assetRepo } = makeDeps({ categoryExists: false })
    const handler = new BulkImportAssetsHandler(db as never, prisma as never, assetRepo as never)

    const result = await handler.handle({ rows: [makeRow({}, 1)] }, ctx)

    expect(result.failed[0]!.reason).toMatch(/unknown category code/i)
  })

  it('fails a row when locationCode is unknown', async () => {
    const { db, prisma, assetRepo } = makeDeps({ locationExists: false })
    const handler = new BulkImportAssetsHandler(db as never, prisma as never, assetRepo as never)

    const result = await handler.handle(
      {
        rows: [makeRow({ locationCode: 'NONEXISTENT' }, 1)],
      },
      ctx,
    )

    expect(result.failed[0]!.reason).toMatch(/unknown location code/i)
  })

  it('fails a row with invalid criticality', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new BulkImportAssetsHandler(db as never, prisma as never, assetRepo as never)

    const result = await handler.handle(
      {
        rows: [makeRow({ criticality: 'Z' }, 1)],
      },
      ctx,
    )

    expect(result.failed[0]!.reason).toMatch(/invalid criticality/i)
  })

  it('fails a row attempting to import with status DECOMMISSIONED', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new BulkImportAssetsHandler(db as never, prisma as never, assetRepo as never)

    const result = await handler.handle(
      {
        rows: [makeRow({ status: 'DECOMMISSIONED' }, 1)],
      },
      ctx,
    )

    expect(result.failed[0]!.reason).toMatch(/decommissioned/i)
  })

  it('fails a row with invalid installDate', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new BulkImportAssetsHandler(db as never, prisma as never, assetRepo as never)

    const result = await handler.handle(
      {
        rows: [makeRow({ installDate: 'not-a-date' }, 1)],
      },
      ctx,
    )

    expect(result.failed[0]!.reason).toMatch(/invalid installDate/i)
  })

  it('fails a row with invalid customFields JSON', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new BulkImportAssetsHandler(db as never, prisma as never, assetRepo as never)

    const result = await handler.handle(
      {
        rows: [makeRow({ customFields: '{bad json' }, 1)],
      },
      ctx,
    )

    expect(result.failed[0]!.reason).toMatch(/valid JSON/i)
  })

  it('fails rows with duplicate serialNumber in the same batch', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new BulkImportAssetsHandler(db as never, prisma as never, assetRepo as never)

    const result = await handler.handle(
      {
        rows: [makeRow({ serialNumber: 'SN-DUPE' }, 1), makeRow({ serialNumber: 'SN-DUPE' }, 2)],
      },
      ctx,
    )

    // First row succeeds; second fails due to duplicate serial
    expect(result.success).toBe(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]!.reason).toMatch(/duplicate serialNumber/i)
  })

  // ── Mixed valid/invalid ───────────────────────────────────────────────────────

  it('processes valid rows even when earlier rows fail validation', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new BulkImportAssetsHandler(db as never, prisma as never, assetRepo as never)

    const result = await handler.handle(
      {
        rows: [
          makeRow({ name: '' }, 1), // fails
          makeRow({}, 2), // succeeds
          makeRow({ criticality: 'X' }, 3), // fails
          makeRow({}, 4), // succeeds
        ],
      },
      ctx,
    )

    expect(result.success).toBe(2)
    expect(result.failed).toHaveLength(2)
    expect(result.failed.map((f) => f.rowIndex)).toEqual([1, 3])
  })

  it('defaults criticality to C when omitted', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new BulkImportAssetsHandler(db as never, prisma as never, assetRepo as never)

    // Build row without criticality field — exactOptionalPropertyTypes forbids assigning undefined
    const rowWithoutCriticality: BulkImportRow = { rowIndex: 1, name: 'Pump', categoryCode: 'PUMP' }
    const result = await handler.handle({ rows: [rowWithoutCriticality] }, ctx)

    expect(result.success).toBe(1)
    expect(result.failed).toHaveLength(0)
  })

  it('defaults status to OPERATIONAL when omitted', async () => {
    const { db, prisma, assetRepo } = makeDeps()
    const handler = new BulkImportAssetsHandler(db as never, prisma as never, assetRepo as never)

    // Build row without status field
    const rowWithoutStatus: BulkImportRow = { rowIndex: 1, name: 'Pump', categoryCode: 'PUMP' }
    const result = await handler.handle({ rows: [rowWithoutStatus] }, ctx)

    expect(result.success).toBe(1)
    expect(result.failed).toHaveLength(0)
  })
})
