import type { PrismaClient } from '@prisma/client'
import { Asset, AssetId, CriticalityLevel, MAX_ASSET_DEPTH } from '@maintainhub/domain'
import type { AssetRepository } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { generateAssetId, writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

// ── Command ───────────────────────────────────────────────────────────────────

export interface CreateAssetCommand {
  name: string
  categoryId: string
  criticality: string
  installDate: Date
  description?: string
  locationId?: string
  parentId?: string
  manufacturer?: string
  model?: string
  serialNumber?: string
  warrantyExpiry?: Date
  customFields?: Record<string, unknown>
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class CreateAssetHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  private readonly assetRepo: AssetRepository

  constructor(db: TenantClient, prisma: PrismaClient, assetRepo: AssetRepository) {
    this.db = db
    this.prisma = prisma
    this.assetRepo = assetRepo
  }

  /**
   * Create a new asset aggregate.
   *
   * Validations (in order):
   *   1. categoryId exists within the tenant
   *   2. locationId exists within the tenant (when provided)
   *   3. parentId exists within the tenant (when provided)
   *   4. Resulting depth ≤ MAX_ASSET_DEPTH (5)
   *
   * Side effects:
   *   - Generates a sequential `AST-NNNNNN` asset number
   *   - Emits `AssetCreatedEvent` via repository
   *   - Writes an AuditLog row
   *
   * @returns The new asset's ID (raw string value)
   */
  async handle(cmd: CreateAssetCommand, ctx: CommandContext): Promise<string> {
    // ── 1. Validate category ───────────────────────────────────────────────────
    const category = await this.db.assetCategory.findFirst({
      where: { id: cmd.categoryId },
      select: { id: true },
    })
    if (!category) {
      throw new DomainException('Asset category not found', 'CATEGORY_NOT_FOUND', 404)
    }

    // ── 2. Validate location ───────────────────────────────────────────────────
    if (cmd.locationId !== undefined) {
      const location = await this.db.location.findFirst({
        where: { id: cmd.locationId },
        select: { id: true },
      })
      if (!location) {
        throw new DomainException('Location not found', 'LOCATION_NOT_FOUND', 404)
      }
    }

    // ── 3. Validate parent + depth ─────────────────────────────────────────────
    let parentAssetId: AssetId | undefined
    let ancestorIds: string[] = []
    let parentDepth = 0

    if (cmd.parentId !== undefined) {
      const parentRow = await this.db.asset.findFirst({
        where: { id: cmd.parentId, deletedAt: null },
        select: { id: true },
      })
      if (!parentRow) {
        throw new DomainException('Parent asset not found', 'PARENT_NOT_FOUND', 404)
      }

      parentAssetId = new AssetId(cmd.parentId)

      // Walk ancestors to get depth and detect max-depth violation
      const ancestors = await this.assetRepo.findAncestors(parentAssetId, ctx.tenantId)
      ancestorIds = ancestors.map((a) => a.id.value)
      parentDepth = ancestors.length + 1 // ancestors.length = levels above parent; +1 = parent itself

      if (parentDepth + 1 > MAX_ASSET_DEPTH) {
        throw new DomainException(
          `Cannot add asset — hierarchy depth would exceed the maximum of ${MAX_ASSET_DEPTH} levels`,
          'MAX_ASSET_DEPTH_EXCEEDED',
          422,
        )
      }
    }

    // ── 4. Generate sequential asset number ───────────────────────────────────
    const assetNumber = await this.assetRepo.nextAssetNumber(ctx.tenantId)

    // ── 5. Build domain aggregate ─────────────────────────────────────────────
    const assetId = new AssetId(generateAssetId())

    const customFields =
      cmd.customFields !== undefined ? new Map(Object.entries(cmd.customFields)) : undefined

    const asset = Asset.create({
      id: assetId,
      tenantId: ctx.tenantId,
      assetNumber,
      name: cmd.name,
      categoryId: cmd.categoryId,
      criticality: CriticalityLevel.from(cmd.criticality),
      installDate: cmd.installDate,
      createdById: ctx.executingUserId,
      ...(cmd.description !== undefined && { description: cmd.description }),
      ...(cmd.locationId !== undefined && { locationId: cmd.locationId }),
      ...(parentAssetId !== undefined && { parentId: parentAssetId }),
      ...(cmd.manufacturer !== undefined && { manufacturer: cmd.manufacturer }),
      ...(cmd.model !== undefined && { model: cmd.model }),
      ...(cmd.serialNumber !== undefined && { serialNumber: cmd.serialNumber }),
      ...(cmd.warrantyExpiry !== undefined && { warrantyExpiry: cmd.warrantyExpiry }),
      ...(customFields !== undefined && { customFields }),
    })

    // If parent is set, enforce depth + cycle check via domain method
    if (parentAssetId !== undefined) {
      asset.setParent(parentAssetId, ancestorIds, parentDepth)
    }

    // ── 6. Persist + dispatch AssetCreatedEvent ───────────────────────────────
    await this.assetRepo.save(asset)

    // ── 7. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'CREATE_ASSET',
      entityType: 'Asset',
      entityId: assetId.value,
      after: {
        assetNumber: assetNumber.value,
        name: cmd.name,
        categoryId: cmd.categoryId,
        criticality: cmd.criticality,
        locationId: cmd.locationId,
        parentId: cmd.parentId,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return assetId.value
  }
}
