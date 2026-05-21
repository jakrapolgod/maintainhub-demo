import type {
  PrismaClient,
  Prisma,
  Criticality as PrismaCriticality,
  AssetStatus as PrismaAssetStatus,
} from '@prisma/client'
import { AssetStatus, CriticalityLevel } from '@maintainhub/domain'
import type { AssetRepository } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { generateAssetId, writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

// ── Internal type ─────────────────────────────────────────────────────────────

/** Validated and enriched row — all string fields coerced, IDs resolved. */
type ValidatedRowShape = {
  rowIndex: number
  name: string
  categoryId: string
  criticality: CriticalityLevel
  status: AssetStatus
  locationId: string | undefined
  parentAssetNumber: string | undefined
  description: string | undefined
  manufacturer: string | undefined
  model: string | undefined
  serialNumber: string | undefined
  installDate: Date | undefined
  warrantyExpiry: Date | undefined
  customFields: Map<string, unknown>
}

// ── Command ───────────────────────────────────────────────────────────────────

/**
 * A single parsed row from the CSV/Excel import.
 * All fields are strings (as they come from the parser); the handler coerces
 * and validates each one.
 */
export interface BulkImportRow {
  /** Human-readable row index (1-based, header = 0) — for error reporting. */
  rowIndex: number
  name: string
  categoryCode: string // looked up → categoryId
  criticality?: string // A|B|C|D — defaults to 'C'
  status?: string // OPERATIONAL|STANDBY|… — defaults to 'OPERATIONAL'
  locationCode?: string // looked up → locationId
  parentAssetNumber?: string // AST-NNNNNN — looked up → parentId
  description?: string
  manufacturer?: string
  model?: string
  serialNumber?: string
  installDate?: string // ISO date string YYYY-MM-DD
  warrantyExpiry?: string // ISO date string YYYY-MM-DD
  /** JSON string or ignored. */
  customFields?: string
}

export interface BulkImportAssetsCommand {
  rows: BulkImportRow[]
}

export interface BulkImportResult {
  success: number
  failed: { rowIndex: number; assetNumber?: string; reason: string }[]
}

// ── Batch size ────────────────────────────────────────────────────────────────

const BATCH_SIZE = 50

// ── Handler ───────────────────────────────────────────────────────────────────

export class BulkImportAssetsHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  private readonly assetRepo: AssetRepository

  constructor(db: TenantClient, prisma: PrismaClient, assetRepo: AssetRepository) {
    this.db = db
    this.prisma = prisma
    this.assetRepo = assetRepo
  }

  /**
   * Import assets from parsed CSV/Excel rows.
   *
   * Algorithm:
   *   1. Pre-flight: load all tenant categories and locations into lookup maps
   *      (one DB round-trip instead of N).
   *   2. Validate each row: required fields, valid category/location, valid
   *      criticality/status enum, no duplicate assetNumber in either the import
   *      batch or the existing tenant data.
   *   3. Generate sequential asset numbers for valid rows (in order).
   *   4. Process valid rows in batches of 50, each inside a Prisma transaction.
   *      A failed batch writes all errors to the result without aborting later
   *      batches.
   *   5. Write a single summary AuditLog entry.
   *
   * @returns `{ success, failed }` — failed rows include the row index and reason.
   */
  async handle(cmd: BulkImportAssetsCommand, ctx: CommandContext): Promise<BulkImportResult> {
    const result: BulkImportResult = { success: 0, failed: [] }

    if (cmd.rows.length === 0) {
      return result
    }

    // ── 1. Pre-flight lookups ─────────────────────────────────────────────────

    const [categories, locations, existingNumbers] = await Promise.all([
      this.db.assetCategory.findMany({ select: { id: true, code: true } }),
      this.db.location.findMany({ select: { id: true, code: true } }),
      this.db.asset
        .findMany({
          where: { deletedAt: null },
          select: { assetNumber: true },
        })
        .then((rows) => new Set(rows.map((r) => r.assetNumber))),
    ])

    const categoryByCode = new Map(categories.map((c) => [c.code.toUpperCase(), c.id]))
    const locationByCode = new Map(locations.map((l) => [l.code.toUpperCase(), l.id]))

    // ── 2. Validate rows ──────────────────────────────────────────────────────

    const batchNumbers = new Set<string>()

    // ── 2a. Validate rows (no continue — each row returns ok/fail) ────────────
    const validRows: ValidatedRowShape[] = []
    cmd.rows.forEach((row) => {
      const outcome = BulkImportAssetsHandler.validateRow(row, categoryByCode, locationByCode)
      if ('fail' in outcome) {
        result.failed.push({ rowIndex: row.rowIndex, reason: outcome.fail })
      } else {
        validRows.push(outcome.ok)
      }
    })

    // ── 3. Dedup by serialNumber (no continue — use reduce) ──────────────────
    const seenSerials = new Set<string>()
    const dedupedValid = validRows.reduce<ValidatedRowShape[]>((acc, row) => {
      if (row.serialNumber !== undefined && seenSerials.has(row.serialNumber)) {
        result.failed.push({
          rowIndex: row.rowIndex,
          reason: `Duplicate serialNumber "${row.serialNumber}" in import batch`,
        })
        return acc
      }
      if (row.serialNumber !== undefined) seenSerials.add(row.serialNumber)
      acc.push(row)
      return acc
    }, [])

    // ── 4. Process in batches of BATCH_SIZE (sequential — eslint-disable per line)
    const batches: ValidatedRowShape[][] = []
    for (let i = 0; i < dedupedValid.length; i += BATCH_SIZE) {
      batches.push(dedupedValid.slice(i, i + BATCH_SIZE))
    }

    // Sequential batch execution — each batch is an independent transaction.
    // Intentional await-in-loop: batches must not run concurrently so a
    // failure in batch N doesn't contaminate batch N+1's sequence numbers.
    for (const batch of batches) {
      // eslint-disable-line no-restricted-syntax
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.processBatch(batch, existingNumbers, batchNumbers, ctx)
        result.success += batch.length
      } catch (err) {
        let reason = 'Unknown error'
        if (err instanceof DomainException || err instanceof Error) {
          reason = err.message
        }
        batch.forEach((row) => result.failed.push({ rowIndex: row.rowIndex, reason }))
      }
    }

    // ── 5. Summary audit log ──────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'BULK_IMPORT_ASSETS',
      entityType: 'Asset',
      entityId: ctx.tenantId,
      after: {
        totalRows: cmd.rows.length,
        success: result.success,
        failureCount: result.failed.length,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return result
  }

  // ── ValidatedRow type (local to this class) ────────────────────────────────

  // Defined outside the loop for re-use in processBatch signature.
  // exactOptionalPropertyTypes: all optional fields expressed as `T | undefined`.
  // ── Private: process one batch inside a transaction ────────────────────────

  private async processBatch(
    batch: ValidatedRowShape[],
    existingNumbers: Set<string>,
    batchNumbers: Set<string>,
    ctx: CommandContext,
  ): Promise<void> {
    // Resolve parentId for each row (if parentAssetNumber provided)
    const parentLookups = batch
      .filter((r) => r.parentAssetNumber !== undefined)
      .map((r) => r.parentAssetNumber!)

    const parentRows =
      parentLookups.length > 0
        ? await this.db.asset.findMany({
            where: { assetNumber: { in: parentLookups }, deletedAt: null },
            select: { id: true, assetNumber: true },
          })
        : []

    const parentByNumber = new Map(parentRows.map((p) => [p.assetNumber, p.id]))

    // Generate sequential asset numbers for the batch — parallel is safe because
    // the PostgreSQL sequence guarantees uniqueness regardless of call order.
    const generatedNums = await Promise.all(
      batch.map(() => this.assetRepo.nextAssetNumber(ctx.tenantId)),
    )
    const assetNumbers = generatedNums.map((num) => {
      if (existingNumbers.has(num.value) || batchNumbers.has(num.value)) {
        throw new DomainException(
          `Generated assetNumber ${num.value} already exists`,
          'DUPLICATE_ASSET_NUMBER',
          409,
        )
      }
      batchNumbers.add(num.value)
      return num.value
    })

    // Build Prisma create payloads
    const createData: Prisma.AssetCreateManyInput[] = batch.map((row, idx) => {
      const parentId = row.parentAssetNumber ? parentByNumber.get(row.parentAssetNumber) : undefined

      if (row.parentAssetNumber && !parentId) {
        throw new DomainException(
          `Parent asset "${row.parentAssetNumber}" not found (row ${row.rowIndex})`,
          'PARENT_NOT_FOUND',
          404,
        )
      }

      // Build payload manually — exactOptionalPropertyTypes forbids spread of
      // `{ field: T | undefined }` into required Prisma input fields.
      const payload: Prisma.AssetCreateManyInput = {
        id: generateAssetId(),
        tenantId: ctx.tenantId,
        assetNumber: assetNumbers[idx]!,
        name: row.name,
        categoryId: row.categoryId,
        criticality: row.criticality.value as PrismaCriticality,
        status: row.status.value as PrismaAssetStatus,
        installDate: row.installDate ?? new Date(),
        customFields: Object.fromEntries(row.customFields) as Prisma.InputJsonValue,
      }

      if (row.locationId !== undefined) payload.locationId = row.locationId
      if (parentId !== undefined) payload.parentId = parentId
      if (row.description !== undefined) payload.description = row.description
      if (row.manufacturer !== undefined) payload.manufacturer = row.manufacturer
      if (row.model !== undefined) payload.model = row.model
      if (row.serialNumber !== undefined) payload.serialNumber = row.serialNumber
      if (row.warrantyExpiry !== undefined) payload.warrantyExpiry = row.warrantyExpiry

      return payload
    })

    // Execute inside a transaction so a partial failure rolls back the whole batch
    await this.prisma.$transaction(async (tx) => {
      await tx.asset.createMany({ data: createData, skipDuplicates: false })
    })
  }

  // ── Private: row validation ────────────────────────────────────────────────

  /**
   * Validate a single CSV row and resolve lookup IDs.
   * Returns `{ ok: ValidatedRow }` on success or `{ fail: reason }` on error.
   * No `continue` — callers use the discriminated union.
   */
  private static validateRow(
    row: BulkImportRow,
    categoryByCode: Map<string, string>,
    locationByCode: Map<string, string>,
  ): { ok: ValidatedRowShape } | { fail: string } {
    if (!row.name?.trim()) return { fail: 'name is required' }
    if (!row.categoryCode?.trim()) return { fail: 'categoryCode is required' }

    const categoryId = categoryByCode.get(row.categoryCode.toUpperCase())
    if (!categoryId) return { fail: `Unknown category code "${row.categoryCode}"` }

    let criticality: CriticalityLevel
    try {
      criticality = CriticalityLevel.from(row.criticality?.toUpperCase() ?? 'C')
    } catch {
      return { fail: `Invalid criticality "${row.criticality}" — must be A, B, C, or D` }
    }

    let status: AssetStatus
    try {
      status = AssetStatus.from(row.status?.toUpperCase() ?? 'OPERATIONAL')
    } catch {
      return { fail: `Invalid status "${row.status}"` }
    }
    if (status.isDecommissioned()) {
      return { fail: 'Cannot import asset with status DECOMMISSIONED' }
    }

    let locationId: string | undefined
    if (row.locationCode?.trim()) {
      locationId = locationByCode.get(row.locationCode.toUpperCase())
      if (!locationId) return { fail: `Unknown location code "${row.locationCode}"` }
    }

    let installDate: Date | undefined
    if (row.installDate?.trim()) {
      installDate = new Date(row.installDate)
      if (Number.isNaN(installDate.getTime())) {
        return { fail: `Invalid installDate "${row.installDate}" — use YYYY-MM-DD` }
      }
    }

    let warrantyExpiry: Date | undefined
    if (row.warrantyExpiry?.trim()) {
      warrantyExpiry = new Date(row.warrantyExpiry)
      if (Number.isNaN(warrantyExpiry.getTime())) {
        return { fail: `Invalid warrantyExpiry "${row.warrantyExpiry}" — use YYYY-MM-DD` }
      }
    }

    let customFields = new Map<string, unknown>()
    if (row.customFields?.trim()) {
      try {
        const parsed = JSON.parse(row.customFields) as unknown
        if (typeof parsed === 'object' && parsed !== null) {
          customFields = new Map(Object.entries(parsed as Record<string, unknown>))
        }
      } catch {
        return { fail: 'customFields is not valid JSON' }
      }
    }

    return {
      ok: {
        rowIndex: row.rowIndex,
        name: row.name.trim(),
        categoryId,
        criticality,
        status,
        locationId,
        parentAssetNumber: row.parentAssetNumber?.trim() || undefined,
        description: row.description?.trim() || undefined,
        manufacturer: row.manufacturer?.trim() || undefined,
        model: row.model?.trim() || undefined,
        serialNumber: row.serialNumber?.trim() || undefined,
        installDate,
        warrantyExpiry,
        customFields,
      },
    }
  }
}
