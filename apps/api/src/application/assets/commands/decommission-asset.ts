import type { PrismaClient } from '@prisma/client'
import { AssetId } from '@maintainhub/domain'
import type { AssetRepository } from '@maintainhub/domain'
import { DomainException } from '../../../errors/domain.exception.js'
import type { TenantClient } from '../../../lib/tenant-prisma.js'
import { writeAuditLog } from './command.types.js'
import type { CommandContext } from './command.types.js'

// ── Command ───────────────────────────────────────────────────────────────────

export interface DecommissionAssetCommand {
  assetId: string
  /** Mandatory reason documented in the audit trail and domain event. */
  reason: string
  /** ID of the manager / safety officer authorising the decommission. */
  authorizedBy: string
}

// ── Handler ───────────────────────────────────────────────────────────────────

export class DecommissionAssetHandler {
  private readonly db: TenantClient

  private readonly prisma: PrismaClient

  private readonly assetRepo: AssetRepository

  constructor(db: TenantClient, prisma: PrismaClient, assetRepo: AssetRepository) {
    this.db = db
    this.prisma = prisma
    this.assetRepo = assetRepo
  }

  /**
   * Permanently decommission an asset.
   *
   * Pre-conditions:
   *   1. Asset must exist and belong to the caller's tenant.
   *   2. Asset must have zero open (non-terminal) work orders.
   *
   * Domain action: `asset.decommission(reason, authorizedBy, hasOpenWOs)`
   *   - Transitions status → DECOMMISSIONED (terminal — irreversible at domain level)
   *   - Emits `AssetDecommissionedEvent`
   *
   * Cascade after persistence:
   *   - All **active** PM schedules for this asset are set to `isActive = false`
   *     so the scheduler does not generate new WOs for a decommissioned asset.
   *
   * @throws DomainException NOT_FOUND
   * @throws DomainException OPEN_WORK_ORDERS_EXIST — resolve or cancel them first
   * @throws DomainException ALREADY_DECOMMISSIONED
   * @throws DomainException DECOMMISSION_REASON_REQUIRED
   */
  async handle(cmd: DecommissionAssetCommand, ctx: CommandContext): Promise<void> {
    // ── 1. Load aggregate ──────────────────────────────────────────────────────
    const asset = await this.assetRepo.findById(new AssetId(cmd.assetId), ctx.tenantId)
    if (!asset) {
      throw new DomainException('Asset not found', 'NOT_FOUND', 404)
    }

    // ── 2. Check for open work orders ─────────────────────────────────────────
    const hasOpenWOs = await this.assetRepo.hasOpenWorkOrders(
      new AssetId(cmd.assetId),
      ctx.tenantId,
    )

    // ── 3. Apply domain decommission (throws OPEN_WORK_ORDERS_EXIST / ALREADY_DECOMMISSIONED)
    asset.decommission(cmd.reason, cmd.authorizedBy, hasOpenWOs)

    // ── 4. Persist + dispatch AssetDecommissionedEvent ────────────────────────
    await this.assetRepo.save(asset)

    // ── 5. Cascade: deactivate all PM schedules for this asset ────────────────
    const deactivated = await this.db.pMSchedule.updateMany({
      where: { assetId: cmd.assetId, isActive: true },
      data: { isActive: false },
    })

    // ── 6. Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog(this.prisma, {
      tenantId: ctx.tenantId,
      userId: ctx.executingUserId,
      action: 'DECOMMISSION_ASSET',
      entityType: 'Asset',
      entityId: cmd.assetId,
      before: { status: 'OPERATIONAL' }, // status before decommission
      after: {
        status: 'DECOMMISSIONED',
        reason: cmd.reason,
        authorizedBy: cmd.authorizedBy,
        pmSchedulesDisabled: deactivated.count,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }
}
