import type { PrismaClient } from '@prisma/client'
import { AssetId, MAX_ASSET_DEPTH } from '@maintainhub/domain'
import type { AssetRepository } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

// ── Command ───────────────────────────────────────────────────────────────────

export interface TransferAssetCommand {
  assetId: string
  /** New physical location — must exist within the tenant. */
  newLocationId: string
  /**
   * New parent in the asset hierarchy (optional).
   * Provide `null` to explicitly detach from a parent (make root).
   * Omit (undefined) to leave the parent unchanged.
   */
  newParentId?: string | null
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class TransferAssetHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  private readonly assetRepo: AssetRepository

  constructor(db: TenantClient, prisma: PrismaClient, assetRepo: AssetRepository) {
    this.db = db
    this.prisma = prisma
    this.assetRepo = assetRepo
  }

  /**
   * Transfer an asset to a different physical location, and optionally
   * re-parent it in the asset hierarchy.
   *
   * Validations:
   *   1. Asset exists and is not decommissioned (enforced by `transferLocation()`).
   *   2. `newLocationId` exists within the tenant.
   *   3. When `newParentId` is provided:
   *      a. Parent exists within the tenant.
   *      b. Re-parenting does not create a circular reference.
   *      c. Resulting depth does not exceed MAX_ASSET_DEPTH (5).
   *
   * Domain actions (in order):
   *   - `asset.transferLocation()` → emits `AssetTransferredEvent`
   *   - `asset.setParent()`        → depth + cycle validation
   *
   * AuditLog records old and new location IDs.
   *
   * @throws DomainException NOT_FOUND
   * @throws DomainException LOCATION_NOT_FOUND
   * @throws DomainException PARENT_NOT_FOUND
   * @throws DomainException DECOMMISSIONED_ASSET
   * @throws DomainException CIRCULAR_REFERENCE
   * @throws DomainException MAX_ASSET_DEPTH_EXCEEDED
   */
  async handle(cmd: TransferAssetCommand, ctx: CommandContext): Promise<void> {
    // ── 1. Load aggregate ──────────────────────────────────────────────────────
    const asset = await this.assetRepo.findById(new AssetId(cmd.assetId), ctx.tenantId)
    if (!asset) {
      throw new DomainException('Asset not found', 'NOT_FOUND', 404)
    }

    const previousLocationId = asset.locationId
    const previousParentId = asset.parentId?.value

    // ── 2. Validate new location ───────────────────────────────────────────────
    const location = await this.db.location.findFirst({
      where: { id: cmd.newLocationId },
      select: { id: true },
    })
    if (!location) {
      throw new DomainException('Location not found', 'LOCATION_NOT_FOUND', 404)
    }

    // ── 3. Validate new parent (if re-parenting) ──────────────────────────────
    let newParentAssetId: AssetId | undefined
    let ancestorIds: string[] = []
    let parentDepth = 0

    if (cmd.newParentId !== undefined && cmd.newParentId !== null) {
      const parentRow = await this.db.asset.findFirst({
        where: { id: cmd.newParentId, deletedAt: null },
        select: { id: true },
      })
      if (!parentRow) {
        throw new DomainException('Parent asset not found', 'PARENT_NOT_FOUND', 404)
      }

      newParentAssetId = new AssetId(cmd.newParentId)
      const ancestors = await this.assetRepo.findAncestors(newParentAssetId, ctx.tenantId)
      ancestorIds = ancestors.map((a) => a.id.value)
      parentDepth = ancestors.length + 1

      if (parentDepth + 1 > MAX_ASSET_DEPTH) {
        throw new DomainException(
          `Cannot re-parent asset — hierarchy depth would exceed the maximum of ${MAX_ASSET_DEPTH} levels`,
          'MAX_ASSET_DEPTH_EXCEEDED',
          422,
        )
      }
    }

    // ── 4. Apply domain: transfer location ────────────────────────────────────
    // Throws DECOMMISSIONED_ASSET or INVALID_LOCATION_ID.
    asset.transferLocation(cmd.newLocationId, ctx.executingUserId)

    // ── 5. Apply domain: re-parent (optional) ─────────────────────────────────
    if (cmd.newParentId !== undefined) {
      // null → clear parent (make root); string → new parent (validated above)
      const targetParent = cmd.newParentId === null ? undefined : newParentAssetId
      asset.setParent(targetParent, ancestorIds, parentDepth)
    }

    // ── 6. Persist + dispatch events ──────────────────────────────────────────
    await this.assetRepo.save(asset)

    // ── 7. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'TRANSFER_ASSET',
      entityType: 'Asset',
      entityId: cmd.assetId,
      before: {
        locationId: previousLocationId,
        parentId: previousParentId,
      },
      after: {
        locationId: cmd.newLocationId,
        parentId: cmd.newParentId,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }
}
