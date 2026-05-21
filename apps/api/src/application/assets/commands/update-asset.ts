import type { PrismaClient } from '@prisma/client'
import { AssetId } from '@maintainhub/domain'
import type { AssetRepository } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

// ── Command ───────────────────────────────────────────────────────────────────

/**
 * All fields optional — only provided fields are patched.
 *
 * Immutable fields (assetNumber, tenantId, categoryId, installDate, createdById)
 * are intentionally absent from this command.
 */
export interface UpdateAssetCommand {
  assetId: string
  name?: string
  description?: string
  manufacturer?: string
  model?: string
  serialNumber?: string
  warrantyExpiry?: Date | null
  /** Partial patch — only keys present are written; others are preserved. */
  customFields?: Record<string, unknown>
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class UpdateAssetHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  private readonly assetRepo: AssetRepository

  constructor(db: TenantClient, prisma: PrismaClient, assetRepo: AssetRepository) {
    this.db = db
    this.prisma = prisma
    this.assetRepo = assetRepo
  }

  /**
   * Patch mutable metadata fields on an existing asset.
   *
   * Design note: this handler bypasses the domain aggregate and writes directly
   * to Prisma for the metadata fields (same pattern as `UpdateWorkOrderHandler`).
   * These fields carry no business invariants — they are pure data edits.
   * Status changes go through `ChangeAssetStatusHandler` instead.
   *
   * @throws DomainException NOT_FOUND
   * @throws DomainException DECOMMISSIONED_ASSET — cannot edit a decommissioned asset
   */
  async handle(cmd: UpdateAssetCommand, ctx: CommandContext): Promise<void> {
    // ── 1. Load to verify existence + guard decommissioned ─────────────────────
    const asset = await this.assetRepo.findById(new AssetId(cmd.assetId), ctx.tenantId)
    if (!asset) {
      throw new DomainException('Asset not found', 'NOT_FOUND', 404)
    }

    if (asset.status.isDecommissioned()) {
      throw new DomainException(
        `Cannot update decommissioned asset ${asset.assetNumber.value}`,
        'DECOMMISSIONED_ASSET',
        422,
      )
    }

    // ── 2. Capture before snapshot for audit ──────────────────────────────────
    const before = {
      name: asset.name,
      description: asset.description,
      manufacturer: asset.manufacturer,
      model: asset.model,
      serialNumber: asset.serialNumber,
      warrantyExpiry: asset.warrantyExpiry?.toISOString(),
    }

    // ── 3. Resolve merged customFields (patch, not replace) ───────────────────
    let mergedCustomFields: Record<string, unknown> | undefined
    if (cmd.customFields !== undefined) {
      const existing = Object.fromEntries(asset.customFields)
      mergedCustomFields = { ...existing, ...cmd.customFields }
    }

    // ── 4. Apply scalar patch via Prisma ─────────────────────────────────────
    const hasPatch =
      cmd.name !== undefined ||
      cmd.description !== undefined ||
      cmd.manufacturer !== undefined ||
      cmd.model !== undefined ||
      cmd.serialNumber !== undefined ||
      cmd.warrantyExpiry !== undefined ||
      cmd.customFields !== undefined

    if (hasPatch) {
      await this.db.asset.update({
        where: { id: cmd.assetId },
        data: {
          ...(cmd.name !== undefined && { name: cmd.name }),
          ...(cmd.description !== undefined && { description: cmd.description }),
          ...(cmd.manufacturer !== undefined && { manufacturer: cmd.manufacturer }),
          ...(cmd.model !== undefined && { model: cmd.model }),
          ...(cmd.serialNumber !== undefined && { serialNumber: cmd.serialNumber }),
          ...(cmd.warrantyExpiry !== undefined && { warrantyExpiry: cmd.warrantyExpiry }),
          ...(mergedCustomFields !== undefined && { customFields: mergedCustomFields }),
          updatedAt: new Date(),
        },
      })
    }

    // ── 5. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'UPDATE_ASSET',
      entityType: 'Asset',
      entityId: cmd.assetId,
      before,
      // Cast to satisfy Prisma.InputJsonValue — all values are JSON-serialisable
      after: {
        name: cmd.name ?? null,
        description: cmd.description ?? null,
        manufacturer: cmd.manufacturer ?? null,
        model: cmd.model ?? null,
        serialNumber: cmd.serialNumber ?? null,
        warrantyExpiry: cmd.warrantyExpiry?.toISOString() ?? null,
        customFields: (cmd.customFields ?? null) as never,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }
}
